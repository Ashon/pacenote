import { describe, expect, it } from 'vitest'
import { hostCliProblems, olderThan } from '../src/reasoners/host-check.js'
import { ProcessExitError } from '../src/sandbox/process.js'

/** A CLI that answers each command from a table, failing like runProcess */
const cli =
  (answers: Record<string, string | Error>) => async (args: string[]) => {
    const answer = answers[args.join(' ')]
    if (answer === undefined) throw new Error(`unexpected ${args.join(' ')}`)
    if (answer instanceof Error) throw answer
    return { stdout: answer, stderr: '' }
  }

const exited = (stdout: string) =>
  new ProcessExitError(`exited with code 1: ${stdout}`, 1, stdout, '')

describe('the CLI on this Mac', () => {
  it('is ready when installed and signed in', async () => {
    expect(
      await hostCliProblems(
        'claude',
        'claude',
        cli({
          '--version': '2.1.296 (Claude Code)',
          'auth status --json': '{\n  "loggedIn": true\n}',
        })
      )
    ).toEqual([])
    expect(
      await hostCliProblems(
        'codex',
        'codex',
        cli({ '--version': 'codex-cli 0.139.0', 'login status': 'Logged in' })
      )
    ).toEqual([])
  })

  it('says how to install it when it is missing', async () => {
    const [problem] = await hostCliProblems(
      'claude',
      'claude',
      cli({
        '--version': new Error(
          'claude executable not found. Check PATH or the *_BIN setting.'
        ),
      })
    )
    expect(problem).toMatch(/^claude is not installed on this Mac/)
    expect(problem).toContain('Settings > Answers')
  })

  it('says how to sign in when it is signed out', async () => {
    expect(
      await hostCliProblems(
        'claude',
        'claude',
        cli({
          '--version': '2.1.296 (Claude Code)',
          'auth status --json': exited('{\n  "loggedIn": false\n}'),
        })
      )
    ).toEqual([
      'claude is not signed in on this Mac: run claude in Terminal and sign in with /login.',
    ])
    expect(
      await hostCliProblems(
        'codex',
        'codex',
        cli({
          '--version': 'codex-cli 0.139.0',
          'login status': exited('Not logged in'),
        })
      )
    ).toEqual([
      'codex is not signed in on this Mac: run codex login in Terminal.',
    ])
  })

  it('asks for a codex that keeps to the reference directory', async () => {
    const problems = await hostCliProblems(
      'codex',
      'codex',
      cli({ '--version': 'codex-cli 0.120.3', 'login status': 'Logged in' })
    )
    expect(problems).toEqual([
      expect.stringMatching(/^codex 0\.120\.3 is too old/),
    ])
  })

  it('takes a CLI too old to tell its sign-in as signed in', async () => {
    expect(
      await hostCliProblems(
        'claude',
        'claude',
        cli({
          '--version': '1.0.0 (Claude Code)',
          'auth status --json': exited('error: unknown command "auth"'),
        })
      )
    ).toEqual([])
  })

  it('compares versions part by part', () => {
    expect(olderThan('0.99.0', '0.138.0')).toBe(true)
    expect(olderThan('0.138.0', '0.138.0')).toBe(false)
    expect(olderThan('1.0.0', '0.138.0')).toBe(false)
  })
})
