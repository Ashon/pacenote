import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { K8sSetup } from '../apps/desktop/src/k8s-setup.js'
import {
  DEFAULT_K8S_ACCOUNT,
  type KubectlResult,
} from '../src/sandbox/k8s-account.js'
import { kubeconfigPath } from '../src/sandbox/kubeconfig.js'
import type { Kubectl } from '../src/sandbox/kubectl.js'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'pacenote-k8s-setup-'))
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

const yes = { code: 0, stdout: 'yes\n', stderr: '' }
const no = { code: 1, stdout: 'no\n', stderr: '' }
const notFound = {
  code: 1,
  stdout: '',
  stderr: 'Error from server (NotFound): namespaces "pacenote" not found',
}

/** kubectl answering by what it is asked: 'context verb...' → answer */
function fake(
  answer: (context: string, args: string[]) => KubectlResult | undefined
) {
  const calls: { args: string[]; input?: string }[] = []
  const kubectl: Kubectl = async (args, options) => {
    calls.push({ args, input: options?.input })
    const context = args[args.indexOf('--context') + 1] ?? ''
    return (
      answer(context, args) ?? { code: 1, stdout: '', stderr: 'unexpected' }
    )
  }
  return { kubectl, calls }
}

const setup = (kubectl: Kubectl) =>
  new K8sSetup({
    toolPath: () => '/usr/bin',
    env: { PACENOTE_HOME: home },
    kubectl,
    wait: async () => {},
  })

const asks = (args: string[], ...what: string[]) =>
  what.every((word) => args.includes(word))

describe("Kubernetes' steps on this Mac", () => {
  it("says of each cluster whether Pace's account is there, and whether you may make it", async () => {
    const { kubectl, calls } = fake((context, args) => {
      if (asks(args, 'secret'))
        return context === 'prod'
          ? { code: 0, stdout: 'dG9rZW4=', stderr: '' }
          : context === 'dev'
            ? notFound
            : {
                code: 1,
                stdout: '',
                stderr:
                  'Error from server (Forbidden): secrets "pacenote-ro-token" is forbidden',
              }
      if (asks(args, 'can-i')) return context === 'dev' ? yes : no
      if (asks(args, 'whoami'))
        return { code: 0, stdout: 'oidc:alice', stderr: '' }
    })
    const checks = await setup(kubectl).check(
      ['prod', 'dev', 'shared'],
      DEFAULT_K8S_ACCOUNT
    )
    expect(checks).toEqual([
      { context: 'prod', state: 'ready' },
      { context: 'dev', state: 'missing', canCreate: true, user: 'oidc:alice' },
      {
        context: 'shared',
        state: 'forbidden',
        canCreate: false,
        user: 'oidc:alice',
      },
    ])
    // The token is read, never returned; a ready cluster is asked nothing more
    expect(JSON.stringify(checks)).not.toContain('dG9rZW4=')
    expect(calls.filter((call) => call.args.includes('prod'))).toHaveLength(1)
  })

  it('asks nothing of names that are not contexts or accounts', async () => {
    const { kubectl, calls } = fake(() => undefined)
    const steps = setup(kubectl)
    expect(await steps.check(['--all'], DEFAULT_K8S_ACCOUNT)).toEqual([])
    expect(
      await steps.check(['prod'], { serviceAccount: 'A B', namespace: 'x' })
    ).toEqual([])
    expect(await steps.check('prod', DEFAULT_K8S_ACCOUNT)).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('makes the account with kubectl apply, then waits for its token', async () => {
    let looks = 0
    const { kubectl, calls } = fake((_context, args) => {
      if (asks(args, 'apply'))
        return { code: 0, stdout: 'namespace/pacenote created', stderr: '' }
      if (asks(args, 'secret'))
        return ++looks < 3
          ? { code: 0, stdout: '', stderr: '' }
          : { code: 0, stdout: 'dG9rZW4=', stderr: '' }
    })
    expect(await setup(kubectl).create('dev', DEFAULT_K8S_ACCOUNT)).toEqual({
      context: 'dev',
      state: 'ready',
    })
    const apply = calls[0]!
    expect(apply.args).toEqual([
      '--context',
      'dev',
      '--request-timeout=20s',
      'apply',
      '-f',
      '-',
    ])
    expect(apply.input).toContain('kind: ServiceAccount')
    expect(apply.input).not.toContain('kind: Role\n')
    expect(looks).toBe(3)
  })

  it('says why it could not make the account', async () => {
    const { kubectl } = fake(() => ({
      code: 1,
      stdout: '',
      stderr:
        'Error from server (Forbidden): clusterrolebindings.rbac.authorization.k8s.io is forbidden: User "bob" cannot create resource',
    }))
    expect(
      await setup(kubectl).create('dev', DEFAULT_K8S_ACCOUNT)
    ).toMatchObject({ context: 'dev', state: 'forbidden' })
  })

  it("asks the broker's kubeconfig, with its own tokens, what it may do", async () => {
    const file = kubeconfigPath({ PACENOTE_HOME: home })
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(
      file,
      JSON.stringify({
        contexts: [
          { name: 'prod', context: {} },
          { name: 'wide', context: {} },
        ],
      })
    )
    const { kubectl, calls } = fake((context, args) => {
      if (asks(args, 'list', 'pods')) return yes
      if (context === 'wide' && asks(args, 'delete')) return yes
      return no
    })
    const connected = await setup(kubectl).connected()
    expect(connected.contexts).toEqual([
      { context: 'prod', reads: true, secrets: false, changes: false },
      { context: 'wide', reads: true, secrets: false, changes: true },
    ])
    expect(calls.every((call) => call.args[1] === file)).toBe(true)
  })

  it('has nothing to ask with no kubeconfig built', async () => {
    const { kubectl, calls } = fake(() => undefined)
    expect(await setup(kubectl).connected()).toEqual({
      build: undefined,
      contexts: [],
    })
    expect(calls).toHaveLength(0)
  })
})
