import { tmpdir } from 'node:os'
import { localized } from '../i18n/locale.js'
import { hostEnv } from '../sandbox/host.js'
import { runProcess, type RunResult } from '../sandbox/process.js'
import type { CliCheck } from '../settings/setup.js'
import type { ReasonerId } from './ids.js'
import { text } from './host-check.text.js'

export type { CliCheck }

/**
 * The first codex with permission profiles, which keep its shell to the
 * reference directory (codexArgs in codex.ts)
 */
const CODEX_MIN_VERSION = '0.138.0'

/** Runs one CLI command the way an answer would, without its secrets */
export type CliRunner = (args: string[]) => Promise<RunResult>

/**
 * Whether the CLI can answer on this Mac: installed, signed in, and for codex
 * new enough to keep to the reference directory. Each problem says what to do,
 * for setup and the status, before a mention fails on it.
 */
export async function checkCli(
  backend: ReasonerId,
  command: string,
  run: CliRunner = (args) =>
    runProcess(command, args, {
      cwd: tmpdir(),
      timeoutMs: 20_000,
      env: hostEnv(process.env),
    })
): Promise<CliCheck> {
  const t = localized(text)
  let output: string
  try {
    output = (await run(['--version'])).stdout
  } catch (err) {
    return {
      backend,
      installed: false,
      signedIn: false,
      problems: [
        /not found/.test((err as Error).message)
          ? t.notInstalled(backend)
          : t.versionFailed(backend, (err as Error).message),
      ],
    }
  }
  const version = /(\d+\.\d+\.\d+)/.exec(output)?.[1]
  const problems: string[] = []
  const tooOld =
    backend === 'codex' &&
    version !== undefined &&
    olderThan(version, CODEX_MIN_VERSION)
  if (tooOld) problems.push(t.codexTooOld(version, CODEX_MIN_VERSION))
  const signed = await signedIn(backend, run)
  if (!signed) problems.push(t.notSignedIn(backend))
  return {
    backend,
    installed: true,
    ...(version ? { version } : {}),
    signedIn: signed,
    ...(tooOld ? { tooOld } : {}),
    problems,
  }
}

/**
 * The first opencode that runs with a private server (--standalone) and
 * reports its run as JSON events, as Pacenote's own work runs it
 */
const OPENCODE_MIN_VERSION = '2.0.0'

/**
 * Whether opencode can do Pacenote's own work on this Mac: installed and new
 * enough. It signs in to nothing itself: its models come from your opencode
 * config, and one that cannot be reached shows when it runs.
 */
export async function checkOpencode(
  run: CliRunner
): Promise<{ installed: boolean; signedIn: boolean; tooOld?: boolean }> {
  try {
    const output = (await run(['--version'])).stdout
    const version = /(\d+\.\d+\.\d+)/.exec(output)?.[1]
    const tooOld =
      version !== undefined && olderThan(version, OPENCODE_MIN_VERSION)
    return { installed: true, signedIn: true, ...(tooOld ? { tooOld } : {}) }
  } catch {
    return { installed: false, signedIn: false }
  }
}

/** checkCli's problems alone, for the status */
export async function hostCliProblems(
  backend: ReasonerId,
  command: string,
  run?: CliRunner
): Promise<string[]> {
  return (await checkCli(backend, command, run)).problems
}

/**
 * claude auth status --json, or codex login status; both exit 1 when signed
 * out. A CLI too old to tell counts as signed in, and the first answer says
 * otherwise.
 */
async function signedIn(backend: ReasonerId, run: CliRunner): Promise<boolean> {
  const args =
    backend === 'claude' ? ['auth', 'status', '--json'] : ['login', 'status']
  let output: string
  try {
    output = (await run(args)).stdout
  } catch (err) {
    output = `${(err as { stdout?: string }).stdout ?? ''}\n${(err as Error).message}`
  }
  return backend === 'codex'
    ? !/not logged in/i.test(output)
    : !/"loggedIn":\s*false/.test(output)
}

/** a < b for x.y.z versions */
export function olderThan(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) {
    const d = (x![i] ?? 0) - (y![i] ?? 0)
    if (d !== 0) return d < 0
  }
  return false
}
