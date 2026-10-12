import { tmpdir } from 'node:os'
import { hostEnv } from '../sandbox/host.js'
import { runProcess, type RunResult } from '../sandbox/process.js'
import type { ReasonerId } from './ids.js'

/**
 * The first codex with permission profiles, which keep its shell to the
 * reference directory (codexArgs in codex.ts)
 */
export const CODEX_MIN_VERSION = '0.138.0'

const PRODUCTS: Record<ReasonerId, string> = {
  claude: 'Claude Code',
  codex: 'the Codex CLI',
}

const SIGN_IN: Record<ReasonerId, string> = {
  claude: 'run claude in Terminal and sign in with /login',
  codex: 'run codex login in Terminal',
}

/** Runs one CLI command the way an answer would, without its secrets */
export type CliRunner = (args: string[]) => Promise<RunResult>

/**
 * Whether the CLI can answer on this Mac: installed, signed in, and for codex
 * new enough to keep to the reference directory. Each problem says what to do,
 * for the status, before a mention fails on it.
 */
export async function hostCliProblems(
  backend: ReasonerId,
  command: string,
  run: CliRunner = (args) =>
    runProcess(command, args, {
      cwd: tmpdir(),
      input: '',
      timeoutMs: 20_000,
      env: hostEnv(process.env),
    })
): Promise<string[]> {
  let version: string
  try {
    version = (await run(['--version'])).stdout
  } catch (err) {
    return [
      /not found/.test((err as Error).message)
        ? `${backend} is not installed on this Mac, or not on its PATH: install ${PRODUCTS[backend]} and sign in, or choose the other reasoner in Settings > Answers.`
        : `${backend} --version failed: ${(err as Error).message}`,
    ]
  }
  const problems: string[] = []
  if (backend === 'codex') {
    const found = /(\d+\.\d+\.\d+)/.exec(version)?.[1]
    if (found && olderThan(found, CODEX_MIN_VERSION))
      problems.push(
        `codex ${found} is too old: Pace needs ${CODEX_MIN_VERSION} or later, which keeps codex to the reference directory. Update codex (npm install -g @openai/codex, or brew upgrade codex).`
      )
  }
  if (!(await signedIn(backend, run)))
    problems.push(
      `${backend} is not signed in on this Mac: ${SIGN_IN[backend]}.`
    )
  return problems
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
