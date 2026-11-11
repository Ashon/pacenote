import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadBrokerEnv } from '../src/sandbox/env.js'
import type { KubectlResult } from '../src/sandbox/k8s-account.js'
import {
  kubeconfigPath,
  kubeconfigStale,
  readKubeconfigBuild,
  writeKubeconfig,
} from '../src/sandbox/kubeconfig.js'
import type { Kubectl } from '../src/sandbox/kubectl.js'

let home: string
let processEnv: NodeJS.ProcessEnv
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'pacenote-kubeconfig-'))
  processEnv = { PACENOTE_HOME: home, PACENOTE_DATA_DIR: home }
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

/** Your kubeconfig, as kubectl config view --raw --flatten prints it */
const view = {
  contexts: [
    { name: 'prod', context: { cluster: 'prod-cluster', user: 'admin' } },
    { name: 'dev', context: { cluster: 'dev-cluster', user: 'admin' } },
    { name: 'far', context: { cluster: 'far-cluster', user: 'oidc' } },
  ],
  clusters: [
    {
      name: 'prod-cluster',
      cluster: {
        server: 'https://10.0.0.1:6443',
        'certificate-authority-data': 'Q0E=',
      },
    },
    {
      name: 'dev-cluster',
      cluster: {
        server: 'https://dev.example.com',
        'insecure-skip-tls-verify': true,
      },
    },
    { name: 'far-cluster', cluster: { server: 'https://far:6443' } },
  ],
  // Your own credentials: never in what is built
  users: [{ name: 'admin', user: { token: 'ADMIN-SECRET' } }],
}

/**
 * kubectl for the tests: the view above, and each context's answer to reading
 * the account's token Secret
 */
function fakeKubectl(
  tokens: Record<string, KubectlResult>,
  calls: string[][] = []
): Kubectl {
  return async (args) => {
    calls.push(args)
    if (args[0] === 'config')
      return { code: 0, stdout: JSON.stringify(view), stderr: '' }
    const context = args[args.indexOf('--context') + 1]!
    return (
      tokens[context] ?? {
        code: 1,
        stdout: '',
        stderr: 'error: context was not found for specified context',
      }
    )
  }
}

const token = (value: string): KubectlResult => ({
  code: 0,
  stdout: Buffer.from(value).toString('base64'),
  stderr: '',
})
const env = (contexts: string) => loadBrokerEnv({ OPS_K8S_CONTEXTS: contexts })

describe("the broker's kubeconfig", () => {
  it('has each ready cluster with its account token, and says why not the others', async () => {
    const calls: string[][] = []
    const lines: string[] = []
    const build = await writeKubeconfig(
      env('prod, dev, far, gone'),
      processEnv,
      (line) => lines.push(line),
      fakeKubectl(
        {
          prod: token('PROD-TOKEN'),
          dev: token('DEV-TOKEN'),
          far: {
            code: 1,
            stdout: '',
            stderr:
              'Unable to connect to the server: dial tcp: lookup far: no such host',
          },
        },
        calls
      )
    )
    expect(build.built).toEqual(['prod', 'dev'])
    expect(build.failed).toEqual([
      {
        context: 'far',
        state: 'unreachable',
        detail:
          'Unable to connect to the server: dial tcp: lookup far: no such host',
      },
      { context: 'gone', state: 'noContext' },
    ])
    // CA files read in, so the broker's VM needs none
    expect(calls[0]).toEqual([
      'config',
      'view',
      '--raw',
      '--flatten',
      '-o',
      'json',
    ])
    // The token Secret of pacenote/pacenote-ro, read as you
    expect(calls[1]).toEqual(
      expect.arrayContaining([
        '--namespace',
        'pacenote',
        'secret',
        'pacenote-ro-token',
      ])
    )
    const file = readFileSync(kubeconfigPath(processEnv), 'utf8')
    expect(file).not.toContain('ADMIN-SECRET')
    const config = JSON.parse(file)
    expect(config.users).toEqual([
      { name: 'prod-pacenote-ro', user: { token: 'PROD-TOKEN' } },
      { name: 'dev-pacenote-ro', user: { token: 'DEV-TOKEN' } },
    ])
    expect(config.clusters[0].cluster).toEqual({
      server: 'https://10.0.0.1:6443',
      'certificate-authority-data': 'Q0E=',
    })
    expect(config.clusters[1].cluster['insecure-skip-tls-verify']).toBe(true)
    expect(config['current-context']).toBe('prod')
    expect(lines.some((line) => line.includes('not far (unreachable'))).toBe(
      true
    )
    expect(readKubeconfigBuild(processEnv)).toEqual(build)
  })

  it('is empty with no cluster ready, or no kubectl', async () => {
    const build = await writeKubeconfig(
      env('prod'),
      processEnv,
      () => {},
      async () => ({ code: null, stdout: '', stderr: '', missing: true })
    )
    expect(build.failed).toEqual([{ context: 'prod', state: 'noKubectl' }])
    expect(readFileSync(kubeconfigPath(processEnv), 'utf8')).toBe('')
  })

  it('is built again at the start when it is not the one the settings ask for', async () => {
    // Before Pacenote kept how it was built
    expect(kubeconfigStale(env('prod'), processEnv)).toBe(true)
    const kubectl = fakeKubectl({ prod: token('P'), dev: token('D') })
    await writeKubeconfig(env('prod, dev'), processEnv, () => {}, kubectl)
    expect(kubeconfigStale(env('dev,prod'), processEnv)).toBe(false)
    // Another context, or another account
    expect(kubeconfigStale(env('prod'), processEnv)).toBe(true)
    expect(
      kubeconfigStale(
        loadBrokerEnv({ OPS_K8S_CONTEXTS: 'prod, dev', OPS_K8S_SA: 'other' }),
        processEnv
      )
    ).toBe(true)
    // Its file gone
    rmSync(kubeconfigPath(processEnv))
    expect(kubeconfigStale(env('prod, dev'), processEnv)).toBe(true)
  })

  it('tries a cluster it left out again at the next start', async () => {
    await writeKubeconfig(
      env('prod, dev'),
      processEnv,
      () => {},
      fakeKubectl({ prod: token('P') })
    )
    expect(kubeconfigStale(env('prod, dev'), processEnv)).toBe(true)
  })

  it('is emptied once its contexts are out of the settings', async () => {
    mkdirSync(path.dirname(kubeconfigPath(processEnv)), { recursive: true })
    writeFileSync(kubeconfigPath(processEnv), '{"contexts":[]}')
    expect(kubeconfigStale(env(''), processEnv)).toBe(true)
    await writeKubeconfig(env(''), processEnv, () => {}, fakeKubectl({}))
    expect(readFileSync(kubeconfigPath(processEnv), 'utf8')).toBe('')
    expect(kubeconfigStale(env(''), processEnv)).toBe(false)
  })
})
