import { readFileSync } from 'node:fs'
import {
  accountManifest,
  accountState,
  canI,
  K8S_CONTEXT,
  K8S_NAME,
  kubectlTrouble,
  lastLine,
  tokenSecret,
  type K8sAccount,
  type K8sConnected,
  type K8sContextCheck,
} from '../../../src/sandbox/k8s-account.js'
import {
  kubeconfigPath,
  readKubeconfigBuild,
} from '../../../src/sandbox/kubeconfig.js'
import { kubectlRunner, type Kubectl } from '../../../src/sandbox/kubectl.js'

/** How many contexts one look asks about */
const MAX_CONTEXTS = 20
/** How long a new account's token gets to appear */
const TOKEN_WAIT_MS = 500
const TOKEN_LOOKS = 12

/**
 * Settings > Tools > Kubernetes' steps, on this Mac with your kubectl: whether
 * each cluster has Pace's read-only account (sandbox/k8s/pacenote-ro.yaml) and
 * whether you may make it, making it when you ask, and what the broker's
 * kubeconfig can do, asked with the account's own tokens. It never prints or
 * returns a token or your credentials.
 */
export class K8sSetup {
  constructor(
    private readonly options: {
      /** PATH from the login shell, so kubectl is found */
      toolPath: () => string
      /** Where the broker's kubeconfig is (PACENOTE_HOME) */
      env?: NodeJS.ProcessEnv
      /** For tests */
      kubectl?: Kubectl
      wait?: (ms: number) => Promise<void>
    }
  ) {}

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env
  }

  private kubectl(): Kubectl {
    return (
      this.options.kubectl ??
      kubectlRunner({ ...this.env, PATH: this.options.toolPath() })
    )
  }

  /** Each context's account, as the screen has the settings, saved or not */
  async check(contexts: unknown, account: unknown): Promise<K8sContextCheck[]> {
    const names = contextsOf(contexts)
    const of = accountOf(account)
    if (!names || !of) return []
    const kubectl = this.kubectl()
    return Promise.all(names.map((name) => this.checkOne(kubectl, name, of)))
  }

  /**
   * Makes the account in a cluster with your kubeconfig (kubectl apply), then
   * waits for its token
   */
  async create(context: unknown, account: unknown): Promise<K8sContextCheck> {
    const name = contextsOf([context])?.[0]
    const of = accountOf(account)
    if (!name || !of) return { context: String(context), state: 'failed' }
    const kubectl = this.kubectl()
    const applied = await kubectl(
      ['--context', name, '--request-timeout=20s', 'apply', '-f', '-'],
      { input: accountManifest(of) }
    )
    if (applied.missing) return { context: name, state: 'noKubectl' }
    if (applied.code !== 0) {
      const trouble = kubectlTrouble(applied.stderr)
      return {
        context: name,
        state: trouble === 'missing' ? 'failed' : trouble,
        detail: lastLine(applied.stderr) || undefined,
      }
    }
    const wait =
      this.options.wait ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
    let check = await this.checkOne(kubectl, name, of)
    for (
      let look = 1;
      look < TOKEN_LOOKS && check.state === 'pending';
      look++
    ) {
      await wait(TOKEN_WAIT_MS)
      check = await this.checkOne(kubectl, name, of)
    }
    return check
  }

  /**
   * The broker's kubeconfig: how it was built, and each context in it asked
   * with its token whether it reads, reads secrets and changes things
   */
  async connected(): Promise<K8sConnected> {
    const file = kubeconfigPath(this.env)
    const build = readKubeconfigBuild(this.env)
    const names = contextsIn(file)
    if (names.length === 0) return { build, contexts: [] }
    const kubectl = this.kubectl()
    const ask = (name: string, ...what: string[]) =>
      kubectl([
        '--kubeconfig',
        file,
        '--context',
        name,
        '--request-timeout=10s',
        'auth',
        'can-i',
        ...what,
      ])
    const contexts = await Promise.all(
      names.map(async (name) => {
        const [reads, secrets, ...changes] = await Promise.all([
          ask(name, 'list', 'pods', '--all-namespaces'),
          ask(name, 'get', 'secrets', '--all-namespaces'),
          ask(name, 'create', 'pods', '--all-namespaces'),
          ask(name, 'delete', 'deployments.apps', '--all-namespaces'),
          ask(name, 'patch', 'nodes'),
        ])
        const changed = changes.map(canI)
        return {
          context: name,
          reads: canI(reads),
          secrets: canI(secrets),
          changes: changed.some((each) => each === true)
            ? true
            : changed.every((each) => each === false)
              ? false
              : undefined,
          ...(canI(reads) === undefined && {
            detail: lastLine(reads.stderr) || undefined,
          }),
        }
      })
    )
    return { build, contexts }
  }

  private async checkOne(
    kubectl: Kubectl,
    context: string,
    account: K8sAccount
  ): Promise<K8sContextCheck> {
    const at = ['--context', context, '--request-timeout=10s']
    const read = await kubectl([
      ...at,
      '--namespace',
      account.namespace,
      'get',
      'secret',
      tokenSecret(account),
      '-o',
      'jsonpath={.data.token}',
    ])
    const { state, detail } = accountState(read)
    if (state === 'ready' || state === 'pending') return { context, state }
    if (state !== 'missing' && state !== 'forbidden')
      return { context, state, ...(detail && { detail }) }
    // Not there, or not yours to see: whether you may make it, and who to
    // name in the admin's manifest
    const [create, whoami] = await Promise.all([
      kubectl([
        ...at,
        'auth',
        'can-i',
        'create',
        'clusterrolebindings.rbac.authorization.k8s.io',
      ]),
      kubectl([
        ...at,
        'auth',
        'whoami',
        '-o',
        'jsonpath={.status.userInfo.username}',
      ]),
    ])
    const user = whoami.code === 0 ? whoami.stdout.trim() : ''
    return {
      context,
      state,
      canCreate: canI(create) === true,
      ...(user && { user }),
    }
  }
}

/** The contexts asked about, when every one is a context name */
function contextsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_CONTEXTS) return undefined
  return value.every(
    (each): each is string => typeof each === 'string' && K8S_CONTEXT.test(each)
  )
    ? [...new Set(value)]
    : undefined
}

function accountOf(value: unknown): K8sAccount | undefined {
  const { serviceAccount, namespace } = (value ?? {}) as Partial<K8sAccount>
  return typeof serviceAccount === 'string' &&
    typeof namespace === 'string' &&
    K8S_NAME.test(serviceAccount) &&
    K8S_NAME.test(namespace)
    ? { serviceAccount, namespace }
    : undefined
}

/** The contexts of the broker's kubeconfig (JSON, as Pacenote writes it) */
function contextsIn(file: string): string[] {
  try {
    const config = JSON.parse(readFileSync(file, 'utf8')) as {
      contexts?: { name?: unknown }[]
    }
    return (config.contexts ?? [])
      .map((each) => each.name)
      .filter((name): name is string => typeof name === 'string')
  } catch {
    return []
  }
}
