import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveAppPaths } from '../apps/desktop/src/app-paths.js'
import { ensureAllowlistFile } from '../src/sandbox/allowlist.js'
import { allowlistPath } from '../src/settings/paths.js'
import { jobEnv, planJob } from '../src/tools/sandbox-job.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-packaging-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('app paths', () => {
  it('a dev run uses the repository build outputs, the packaged app its bundled copies', () => {
    expect(resolveAppPaths('/repo/apps/desktop/dist', false)).toEqual({
      packaged: false,
      webDist: '/repo/apps/web/dist',
      botEntry: '/repo/dist/index.js',
      sandboxDir: '/repo/sandbox',
      jobRunner: '/repo/build/tools/sandbox-job.mjs',
      historyMcp: '/repo/build/tools/history-mcp.mjs',
      vmBin: '/repo/apps/vm/.build/release/pacenote-vm',
      repoRoot: '/repo',
    })
    const app = '/Applications/Pacenote.app/Contents/Resources/app'
    expect(resolveAppPaths(`${app}/dist`, true)).toEqual({
      packaged: true,
      webDist: `${app}/web`,
      botEntry: `${app}/bot/index.mjs`,
      sandboxDir: `${app}/sandbox`,
      jobRunner: `${app}/tools/sandbox-job.mjs`,
      historyMcp: `${app}/tools/history-mcp.mjs`,
      vmBin: '/Applications/Pacenote.app/Contents/MacOS/pacenote-vm',
    })
  })
})

describe('sandbox jobs', () => {
  it('each job runs its fixed steps', () => {
    expect(planJob('kubeconfig')).toEqual([{ kind: 'kubeconfig' }])
    // The allowed domains list, then the built-in sandbox's own setup
    expect(planJob('vm')).toEqual([{ kind: 'allowlist' }, { kind: 'vm' }])
  })

  it('layers the environment over the config file and expands PACENOTE_HOME', () => {
    const envFile = path.join(root, '.env')
    writeFileSync(envFile, 'OPS_SSH_USER=from-file\nOPS_FS_ROOT=/from/file\n')
    const env = jobEnv({ OPS_SSH_USER: 'from-env', HOME: '/home/me' }, envFile)
    expect(env).toMatchObject({
      OPS_SSH_USER: 'from-env',
      OPS_FS_ROOT: '/from/file',
      PACENOTE_HOME: '/home/me/.pacenote',
    })
  })

  it('keeps the allowlist in PACENOTE_HOME and seeds it from the default only when missing', () => {
    const template = path.join(root, 'allowed-domains.txt')
    writeFileSync(template, 'api.anthropic.com\n')
    const file = allowlistPath({ PACENOTE_HOME: path.join(root, 'home') })
    expect(file).toBe(path.join(root, 'home/sandbox/allowed-domains.txt'))
    ensureAllowlistFile(file, template)
    expect(readFileSync(file, 'utf8')).toBe('api.anthropic.com\n')
    writeFileSync(file, 'edited.example.com\n')
    ensureAllowlistFile(file, template)
    expect(readFileSync(file, 'utf8')).toBe('edited.example.com\n')
  })
})

describe('release', () => {
  const version = (file: string) =>
    (
      JSON.parse(
        readFileSync(path.join(import.meta.dirname, '..', file), 'utf8')
      ) as {
        version: string
      }
    ).version

  it('the packages share one version (the release workflow holds it equal to the tag)', () => {
    const shared = version('package.json')
    expect(version('apps/desktop/package.json')).toBe(shared)
    expect(version('apps/web/package.json')).toBe(shared)
  })

  it('the cask template keeps the placeholders update-tap.sh fills in', () => {
    const cask = readFileSync(
      path.join(import.meta.dirname, '../deploy/homebrew/Casks/pacenote.rb'),
      'utf8'
    )
    expect(cask).toMatch(/^ {2}version "[^"]+"$/m)
    expect(cask).toContain('REPLACE_SHA256_ARM64')
    // Apple silicon only since 0.5.7
    expect(cask).not.toContain('REPLACE_SHA256_X64')
    expect(cask).toContain('depends_on arch: :arm64')
    expect(cask).toContain('Pacenote-v#{version}-macos-arm64.app.zip')
    expect(cask).toContain('Config and run history are in ~/.pacenote')
  })
})
