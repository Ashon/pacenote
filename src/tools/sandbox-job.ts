import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureAllowlistFile } from '../sandbox/allowlist.js'
import { loadBrokerEnv } from '../sandbox/env.js'
import { writeKubeconfig } from '../sandbox/kubeconfig.js'
import { defaultVmBin } from '../sandbox/vm.js'
import { setupVm } from '../sandbox/vm-setup.js'
import {
  allowlistPath,
  pacenoteHome,
  settingsFilePath,
  vmRootPath,
} from '../settings/paths.js'
import { readSettingsValues } from '../settings/settings-file.js'

/**
 * Sandbox jobs. The desktop app and the terminal (pnpm sandbox:vm,
 * k8s:kubeconfig) use the same steps.
 * Usage: sandbox-job <vm|kubeconfig> [--dry-run]
 * - The sandbox directory is PACENOTE_SANDBOX_DIR (the sandbox inside the
 *   bundle for the app), otherwise sandbox in the current directory
 * - Settings are read from the settings file (PACENOTE_HOME/settings.json),
 *   and existing environment variables take precedence.
 */
export const JOB_KINDS = ['vm', 'kubeconfig'] as const
export type JobKind = (typeof JOB_KINDS)[number]

export type JobStep =
  { kind: 'allowlist' } | { kind: 'kubeconfig' } | { kind: 'vm' }

/** Turns a job into steps. (Does not run them) */
export function planJob(kind: JobKind): JobStep[] {
  switch (kind) {
    case 'kubeconfig':
      return [{ kind: 'kubeconfig' }]
    case 'vm':
      return [{ kind: 'allowlist' }, { kind: 'vm' }]
  }
}

/**
 * Overlays the current environment variables on the settings file values.
 * PACENOTE_HOME is always passed resolved, so the job uses the same location as
 * the app.
 */
export function jobEnv(
  base: NodeJS.ProcessEnv,
  settingsFile: string
): NodeJS.ProcessEnv {
  const fromFile = readSettingsValues(settingsFile)
  const merged: NodeJS.ProcessEnv = { ...fromFile }
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) merged[key] = value
  }
  merged.PACENOTE_HOME = pacenoteHome(base, base.HOME || homedir())
  return merged
}

async function main(): Promise<void> {
  const [kind, ...flags] = process.argv.slice(2)
  if (!JOB_KINDS.includes(kind as JobKind))
    throw new Error(`Usage: sandbox-job <${JOB_KINDS.join('|')}> [--dry-run]`)
  const dryRun = flags.includes('--dry-run')
  const sandboxDir = path.resolve(
    process.env.PACENOTE_SANDBOX_DIR?.trim() || 'sandbox'
  )
  const env = jobEnv(process.env, settingsFilePath())
  const log = (line: string) => console.log(line)
  const steps = planJob(kind as JobKind)

  for (const step of steps) {
    switch (step.kind) {
      case 'allowlist': {
        const file = allowlistPath(env)
        log(`Allowed domains list: ${file}`)
        if (!dryRun)
          ensureAllowlistFile(
            file,
            path.join(sandboxDir, 'allowed-domains.txt')
          )
        break
      }
      case 'kubeconfig':
        if (!dryRun) await writeKubeconfig(loadBrokerEnv(env), env, log)
        break
      case 'vm': {
        const root = vmRootPath(env)
        const bin = defaultVmBin(env)
        log(`Built-in sandbox: ${root} (pacenote-vm ${bin})`)
        if (!dryRun)
          await setupVm({
            bin,
            root,
            sandboxDir,
            log,
            broker: env.OPS_TOOLS === 'on',
            renderer: env.RENDER_DIAGRAMS !== 'off',
          })
        break
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err: unknown) => {
    console.error((err as Error).message)
    process.exitCode = 1
  })
}
