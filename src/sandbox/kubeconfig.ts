import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { brokerRuntimeDir } from '../settings/paths.js'
import { splitList } from '../settings/list.js'
import type { BrokerEnv } from './env.js'
import {
  accountState,
  tokenSecret,
  type K8sAccount,
  type K8sAccountState,
  type KubeconfigBuild,
} from './k8s-account.js'
import { kubectlRunner, type Kubectl } from './kubectl.js'

/** A cluster as kubectl config view --flatten has it */
interface ClusterEntry {
  server: string
  'certificate-authority-data'?: string
  'insecure-skip-tls-verify'?: boolean
  'tls-server-name'?: string
}

interface KubeConfigView {
  contexts?: { name: string; context: { cluster: string } }[]
  clusters?: { name: string; cluster: ClusterEntry }[]
}

/** One context, added with its cluster and token, or left out and why */
type ContextResult = {
  context: string
  state: K8sAccountState
  detail?: string
  cluster?: ClusterEntry
  token?: string
}

export const kubeconfigPath = (processEnv: NodeJS.ProcessEnv): string =>
  path.join(brokerRuntimeDir(processEnv), 'kubeconfig')

const buildPath = (processEnv: NodeJS.ProcessEnv) =>
  path.join(brokerRuntimeDir(processEnv), 'kubeconfig.json')

export const accountOf = (env: BrokerEnv): K8sAccount => ({
  serviceAccount: env.OPS_K8S_SA,
  namespace: env.OPS_K8S_SA_NAMESPACE,
})

/** How the kubeconfig was last built; none before Pacenote kept it */
export function readKubeconfigBuild(
  processEnv: NodeJS.ProcessEnv
): KubeconfigBuild | undefined {
  try {
    const value = JSON.parse(
      readFileSync(buildPath(processEnv), 'utf8')
    ) as Partial<KubeconfigBuild>
    return Array.isArray(value.contexts) &&
      Array.isArray(value.built) &&
      Array.isArray(value.failed) &&
      typeof value.serviceAccount === 'string' &&
      typeof value.namespace === 'string'
      ? (value as KubeconfigBuild)
      : undefined
  } catch {
    return undefined
  }
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n')

/**
 * Whether the broker's kubeconfig is other than the settings ask for: built
 * for other contexts or another account, before Pacenote kept how, or with a
 * cluster it could not add yet (an account made since, a VPN back on)
 */
export function kubeconfigStale(
  env: BrokerEnv,
  processEnv: NodeJS.ProcessEnv
): boolean {
  const contexts = unique(splitList(env.OPS_K8S_CONTEXTS))
  const file = kubeconfigPath(processEnv)
  const has = existsSync(file) && statSync(file).size > 0
  // One left from contexts since taken out of the settings
  if (contexts.length === 0) return has
  const build = readKubeconfigBuild(processEnv)
  if (!build) return true
  return (
    !sameList(build.contexts, contexts) ||
    build.serviceAccount !== env.OPS_K8S_SA ||
    build.namespace !== env.OPS_K8S_SA_NAMESPACE ||
    build.failed.length > 0 ||
    (build.built.length > 0 && !has)
  )
}

const unique = (items: string[]) => [...new Set(items)]

/**
 * Builds the read-only kubeconfig for ops-broker, with each context whose
 * account is ready: the cluster's address and CA from your kubeconfig (CA
 * files read in, so the broker's VM needs none), and the token from the
 * account's Secret, read as you. Your own credentials never end up in it. A
 * cluster that cannot be added (no account yet, no answer) is left out and
 * kept in the build with why, so the next start tries it again.
 */
export async function writeKubeconfig(
  env: BrokerEnv,
  processEnv: NodeJS.ProcessEnv,
  log: (line: string) => void,
  kubectl: Kubectl = kubectlRunner(processEnv)
): Promise<KubeconfigBuild> {
  const contexts = unique(splitList(env.OPS_K8S_CONTEXTS))
  const account = accountOf(env)
  const { namespace } = account
  const output = kubeconfigPath(processEnv)

  let view: KubeConfigView = {}
  let unread: Omit<ContextResult, 'context'> | undefined
  if (contexts.length > 0) {
    const viewed = await kubectl([
      'config',
      'view',
      '--raw',
      '--flatten',
      '-o',
      'json',
    ])
    if (viewed.missing) unread = { state: 'noKubectl' }
    else if (viewed.code !== 0)
      unread = { ...accountState(viewed), state: 'failed' }
    else view = JSON.parse(viewed.stdout) as KubeConfigView
  }

  const results = await Promise.all(
    contexts.map(async (name): Promise<ContextResult> => {
      if (unread) return { ...unread, context: name }
      const context = view.contexts?.find((c) => c.name === name)
      const cluster = view.clusters?.find(
        (c) => c.name === context?.context.cluster
      )?.cluster
      if (!context || !cluster) return { context: name, state: 'noContext' }
      const read = await kubectl([
        '--context',
        name,
        '--namespace',
        namespace,
        '--request-timeout=15s',
        'get',
        'secret',
        tokenSecret(account),
        '-o',
        'jsonpath={.data.token}',
      ])
      const state = accountState(read)
      if (state.state !== 'ready') return { context: name, ...state }
      return {
        context: name,
        state: 'ready',
        cluster,
        token: Buffer.from(read.stdout.trim(), 'base64').toString('utf8'),
      }
    })
  )

  const config = {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [] as unknown[],
    users: [] as unknown[],
    contexts: [] as unknown[],
    'current-context': '',
  }
  for (const { context: name, cluster, token } of results) {
    if (!cluster || !token) continue
    const user = `${name}-${account.serviceAccount}`
    config.clusters.push({
      name,
      cluster: {
        server: cluster.server,
        'certificate-authority-data': cluster['certificate-authority-data'],
        'insecure-skip-tls-verify': cluster['insecure-skip-tls-verify'],
        'tls-server-name': cluster['tls-server-name'],
      },
    })
    config.users.push({ name: user, user: { token } })
    config.contexts.push({ name, context: { cluster: name, user } })
  }
  const built = results.filter((r) => r.token).map((r) => r.context)
  config['current-context'] = built[0] ?? ''
  const build: KubeconfigBuild = {
    contexts,
    serviceAccount: account.serviceAccount,
    namespace,
    built,
    failed: results
      .filter((r) => !r.token)
      .map(({ context, state, detail }) => ({
        context,
        state,
        ...(detail && { detail }),
      })),
    at: new Date().toISOString(),
  }

  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(
    output,
    built.length > 0 ? `${JSON.stringify(config, null, 2)}\n` : '',
    { mode: 0o600 }
  )
  writeFileSync(buildPath(processEnv), `${JSON.stringify(build, null, 2)}\n`, {
    mode: 0o600,
  })
  const as = `${namespace}/${account.serviceAccount}`
  if (contexts.length === 0) log(`${output}: no contexts, left empty`)
  else if (built.length > 0) log(`${output}: ${built.join(', ')} (${as})`)
  for (const each of build.failed)
    log(
      `${output}: not ${each.context} (${each.state}${each.detail ? `: ${each.detail}` : ''})`
    )
  return build
}
