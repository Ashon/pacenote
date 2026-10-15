import { type ChildProcess, spawn } from 'node:child_process'
import type { CredentialState } from '../../../src/sandbox/claude-credential.js'
import type { SettingsIssue } from '../../../src/settings/fields.js'

/**
 * setup-token waits for the browser approval; past this the run is given up.
 */
const TIMEOUT_MS = 5 * 60_000
/** A long-lived Claude Code OAuth token */
const TOKEN = /sk-ant-oat\d{2}-[A-Za-z0-9_-]{20,}/
/** What setup-token shows under the token once it is all there */
const AFTER_TOKEN = /Store this token|Use this token/
/** Columns of the terminal setup-token runs in (stty cols in run()) */
const COLUMNS = 1000

/** credential: what the API said about the saved token, when it was asked */
export type ClaudeTokenResult =
  { ok: true; credential?: CredentialState } | { ok: false; error: string }

/* eslint-disable no-control-regex --
   terminal escape sequences are control characters by definition */
/**
 * One piece of terminal output: a control sequence (OSC, CSI, a two-character
 * escape), a control character, or a printable character
 */
const PIECE =
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[([0-9;?<>=]*)[ -/]*([@-~])|\x1b[ -/]*([0-~])|[\x00-\x1f\x7f]|[^\x00-\x1f\x7f]/gu
/* eslint-enable no-control-regex */

/**
 * The screen a terminal would show for this output, as lines. setup-token
 * draws with a renderer that moves the cursor and rewrites only the characters
 * that changed from the previous frame, so the output read as a stream glues
 * the next line's changes onto the token; replaying it on a screen gives the
 * lines as drawn. Handles what that renderer uses: cursor moves (CSI A B C D
 * E F G H), erasing (CSI J K), cursor save and restore (ESC 7, ESC 8), CR, LF,
 * BS; colors, modes and OSC (hyperlinks, titles) are skipped.
 */
export function screenLines(output: string, columns = COLUMNS): string[] {
  const rows: string[][] = [[]]
  let row = 0
  let col = 0
  let saved = { row: 0, col: 0 }
  const line = (at: number) => {
    while (rows.length <= at) rows.push([])
    return rows[at]!
  }
  for (const [piece, params, final, escape] of output.matchAll(PIECE)) {
    if (final) {
      const [a = '', b = ''] = (params ?? '').split(';')
      const n = Math.max(1, Number(a) || 1)
      switch (final) {
        case 'A':
          row = Math.max(0, row - n)
          break
        case 'B':
          row += n
          break
        case 'C':
          col += n
          break
        case 'D':
          col = Math.max(0, col - n)
          break
        case 'E':
          row += n
          col = 0
          break
        case 'F':
          row = Math.max(0, row - n)
          col = 0
          break
        case 'G':
          col = n - 1
          break
        case 'H':
        case 'f':
          row = n - 1
          col = Math.max(1, Number(b) || 1) - 1
          break
        case 'K': {
          const cells = line(row)
          if (a === '2') cells.length = 0
          else if (a === '1') cells.fill(' ', 0, col + 1)
          else cells.length = Math.min(cells.length, col)
          break
        }
        case 'J':
          if (a === '2' || a === '3') rows.splice(0, rows.length, [])
          else if (a === '' || a === '0') {
            rows.length = Math.min(rows.length, row + 1)
            line(row).length = Math.min(line(row).length, col)
          }
          break
      }
    } else if (escape) {
      if (escape === '7') saved = { row, col }
      else if (escape === '8') ({ row, col } = saved)
    } else if (piece === '\r') col = 0
    else if (piece === '\n') row += 1
    else if (piece === '\b') col = Math.max(0, col - 1)
    else if (piece.codePointAt(0)! >= 0x20 && piece !== '\x7f') {
      if (col >= columns) {
        row += 1
        col = 0
      }
      const cells = line(row)
      while (cells.length < col) cells.push(' ')
      cells[col] = piece
      col += 1
    }
  }
  return rows.map((cells) => cells.join('').trimEnd())
}

/**
 * The token in setup-token's output, once all of it is there: the lines under
 * it (how to store and use it) have been drawn, or the output has ended
 * (complete).
 */
export function findClaudeToken(
  output: string,
  complete = false
): string | undefined {
  const lines = screenLines(output)
  const at = lines.findIndex((text) => TOKEN.test(text))
  if (at < 0) return undefined
  if (!complete && !lines.slice(at + 1).some((text) => AFTER_TOKEN.test(text)))
    return undefined
  return TOKEN.exec(lines[at]!)?.[0]
}

/**
 * Runs `claude setup-token` for the Settings screen and saves the token it
 * prints as SANDBOX_CLAUDE_OAUTH_TOKEN, so a Pro or Max subscriber does not
 * copy it by hand. The command draws a terminal UI and prints nothing without a
 * terminal, so it runs under macOS's script(1), which gives it a
 * pseudo-terminal (wide enough that the token is not wrapped). The browser
 * approval is the user's; the token goes from the command's output straight to
 * the settings file and is never sent to the UI.
 */
export class ClaudeTokenSetup {
  private child?: ChildProcess
  private cancelled = false

  constructor(
    private readonly options: {
      /**
       * PATH from the login shell, so claude is found when the app starts from
       * Finder
       */
      toolPath: () => string
      save: (token: string) => SettingsIssue[]
      /** Asks the API whether the saved token works */
      verify?: (token: string) => Promise<CredentialState | undefined>
      platform?: NodeJS.Platform
      /**
       * For tests: the command in place of script(1) running claude setup-token
       */
      command?: [string, string[]]
    }
  ) {}

  get running(): boolean {
    return this.child !== undefined
  }

  run(): Promise<ClaudeTokenResult> {
    if ((this.options.platform ?? process.platform) !== 'darwin')
      return Promise.resolve({
        ok: false,
        error: 'Run claude setup-token in a terminal and paste the token here.',
      })
    if (this.child)
      return Promise.resolve({
        ok: false,
        error: 'Getting a token is already in progress.',
      })

    this.cancelled = false
    return new Promise((resolve) => {
      let output = ''
      let settled = false
      const finish = (result: ClaudeTokenResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.child?.kill('SIGTERM')
        this.child = undefined
        resolve(result)
      }
      const [command, args] = this.options.command ?? [
        '/usr/bin/script',
        [
          '-q',
          '/dev/null',
          '/bin/sh',
          '-c',
          'stty cols 1000 2>/dev/null; exec claude setup-token',
        ],
      ]
      const child = spawn(command, args, {
        env: { ...process.env, PATH: this.options.toolPath() },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.child = child
      const timer = setTimeout(
        () =>
          finish({
            ok: false,
            error:
              'No approval within 5 minutes. Try again, or run claude setup-token in a terminal.',
          }),
        TIMEOUT_MS
      )
      let saved = false
      const save = (token: string) => {
        if (saved) return
        saved = true
        const issues = this.options.save(token)
        if (issues.length > 0)
          return finish({
            ok: false,
            error: issues.map((issue) => issue.message).join(' '),
          })
        // Done with the command; asking the API about the token takes a moment.
        this.child?.kill('SIGTERM')
        void (this.options.verify?.(token) ?? Promise.resolve(undefined))
          .catch(() => undefined)
          .then((credential) =>
            finish(credential ? { ok: true, credential } : { ok: true })
          )
      }
      const onData = (chunk: Buffer) => {
        output += chunk.toString('utf8')
        const token = findClaudeToken(output)
        if (token) save(token)
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('error', (err) =>
        finish({
          ok: false,
          error: `Could not run claude setup-token: ${err.message}`,
        })
      )
      child.on('close', (code) => {
        if (settled || saved) return
        if (this.cancelled) return finish({ ok: false, error: 'Cancelled.' })
        // The token was the last thing it printed.
        const token = findClaudeToken(output, true)
        if (token) return save(token)
        // Ended without a token: show the last line it printed (for example
        // that a subscription is required).
        const last = screenLines(output)
          .map((line) => line.trim())
          .filter((line) => line.length > 3 && !/^[·✢✳✶✻✽*]+$/.test(line))
          .at(-1)
        finish({
          ok: false,
          error:
            code === 127
              ? 'claude was not found. Install Claude Code, or run claude setup-token in a terminal.'
              : `claude setup-token ended without a token${last ? `: ${last}` : '.'}`,
        })
      })
    })
  }

  cancel(): void {
    this.cancelled = true
    this.child?.kill('SIGTERM')
  }
}
