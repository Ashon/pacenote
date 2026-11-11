import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  accountManifest,
  accountState,
  canI,
  DEFAULT_K8S_ACCOUNT,
  K8S_CONTEXT,
  kubectlTrouble,
  lastLine,
} from '../src/sandbox/k8s-account.js'
import { loadBrokerEnv } from '../src/sandbox/env.js'

const ok = (stdout: string) => ({ code: 0, stdout, stderr: '' })
const failed = (stderr: string) => ({ code: 1, stdout: '', stderr })

describe("Pace's read-only account", () => {
  it('is the account sandbox/k8s/pacenote-ro.yaml has', () => {
    const file = path.join(
      import.meta.dirname,
      '../sandbox/k8s/pacenote-ro.yaml'
    )
    expect(accountManifest(DEFAULT_K8S_ACCOUNT)).toBe(
      readFileSync(file, 'utf8')
    )
  })

  it('reads with view and the cluster reads, and changes nothing', () => {
    const manifest = accountManifest(DEFAULT_K8S_ACCOUNT)
    const verbs = [...manifest.matchAll(/verbs: \[([^\]]*)\]/g)].map(
      (m) => m[1]
    )
    expect(verbs).toEqual(['get, list, watch', 'get, list, watch', 'get, list'])
    expect(manifest).toContain('  name: view\n')
    expect(manifest).not.toMatch(/\bsecrets\b(?!\.)/)
    // No empty document before the first, for kubectl apply
    expect(manifest.split('\n---\n')[0]).toContain('kind: Namespace')
  })

  it('is named after the settings', () => {
    const manifest = accountManifest({
      serviceAccount: 'pace-reader',
      namespace: 'ops-tools',
    })
    expect(manifest).toContain('  name: pace-reader-token\n')
    expect(manifest).toContain(
      '    name: pace-reader\n    namespace: ops-tools'
    )
    expect(manifest).toContain('  name: pace-reader-cluster\n')
    expect(manifest).toContain('kubectl delete namespace ops-tools')
    expect(manifest).not.toContain('pacenote-ro')
  })

  it("for an admin, lets the user who asked read the account's token", () => {
    const manifest = accountManifest(DEFAULT_K8S_ACCOUNT, {
      reader: 'oidc:alice@example.com',
    })
    expect(manifest).toContain('kind: Role\n')
    expect(manifest).toContain('    resourceNames: [pacenote-ro-token]')
    expect(manifest).toContain('    verbs: [get]')
    // Quoted, colons and all
    expect(manifest).toContain('    name: "oidc:alice@example.com"')
    expect(manifest).toContain('# Lets oidc:alice@example.com read the token')
    // Only that secret, in its namespace: no ClusterRole for secrets
    expect(manifest.match(/^kind: Role$/gm)).toHaveLength(1)
  })

  it('takes the contexts EKS names by ARN, as the settings do', () => {
    const arn = 'arn:aws:eks:ap-northeast-2:123456789012:cluster/prod'
    expect(K8S_CONTEXT.test(arn)).toBe(true)
    expect(K8S_CONTEXT.test('gke_my-project_asia-northeast3_prod')).toBe(true)
    expect(K8S_CONTEXT.test('kind-dev')).toBe(true)
    expect(K8S_CONTEXT.test('-rf')).toBe(false)
    expect(K8S_CONTEXT.test('a b')).toBe(false)
    expect(() =>
      loadBrokerEnv({ OPS_K8S_CONTEXTS: `${arn}, kind-dev` })
    ).not.toThrow()
  })
})

describe("kubectl's answers", () => {
  it('reads the token Secret as the account being there or not yet', () => {
    expect(accountState(ok('ZXlK...'))).toEqual({ state: 'ready' })
    expect(accountState(ok(''))).toEqual({ state: 'pending' })
    expect(
      accountState(
        failed(
          'Error from server (NotFound): secrets "pacenote-ro-token" not found'
        )
      ).state
    ).toBe('missing')
    expect(
      accountState(
        failed('Error from server (NotFound): namespaces "pacenote" not found')
      ).state
    ).toBe('missing')
    expect(
      accountState({ code: null, stdout: '', stderr: '', missing: true })
    ).toEqual({ state: 'noKubectl' })
  })

  it('tells what keeps kubectl from the cluster', () => {
    expect(
      kubectlTrouble(
        'Error from server (Forbidden): secrets "pacenote-ro-token" is forbidden: User "alice" cannot get resource "secrets"'
      )
    ).toBe('forbidden')
    expect(
      kubectlTrouble(
        'error: You must be logged in to the server (Unauthorized)'
      )
    ).toBe('signIn')
    expect(
      kubectlTrouble(
        'Unable to connect to the server: getting credentials: exec: executable aws not found'
      )
    ).toBe('signIn')
    expect(
      kubectlTrouble(
        'Unable to connect to the server: dial tcp 10.0.0.5:6443: i/o timeout'
      )
    ).toBe('unreachable')
    expect(kubectlTrouble('kubectl timed out (20s)')).toBe('unreachable')
    expect(
      kubectlTrouble('error: context was not found for specified context: x')
    ).toBe('noContext')
    expect(kubectlTrouble('error: something else')).toBe('failed')
  })

  it('reads auth can-i as yes, no, or no answer', () => {
    expect(canI(ok('yes\n'))).toBe(true)
    expect(canI({ code: 1, stdout: 'no\n', stderr: '' })).toBe(false)
    expect(
      canI({ code: 1, stdout: 'no - RBAC: role not found\n', stderr: '' })
    ).toBe(false)
    expect(canI(failed('Unable to connect to the server'))).toBeUndefined()
  })

  it("keeps a command's last line, short", () => {
    expect(lastLine('first\n\n  last one  \n')).toBe('last one')
    expect(lastLine('x'.repeat(300))).toHaveLength(200)
  })
})
