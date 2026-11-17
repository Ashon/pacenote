/**
 * A turn of yours in a Claude Code session, as its page shows it. Claude Code
 * writes more than what you typed into it: a slash command and what it
 * printed, a shell command run with "!" and its output, a background task's
 * notice, the file open in your editor, and its own reminders to the model.
 * Here those become parts the page shows each in its own way; the reminders
 * are left out. Pure, so it is tested without a session.
 */

export type SaidPart =
  /** What you typed */
  | { kind: 'text'; text: string }
  /** A slash command: "/review", with what you typed after it */
  | { kind: 'command'; name: string; args?: string }
  /** A command you ran in its shell with "!" */
  | { kind: 'shell'; command: string }
  /** What a command printed; error when on stderr */
  | { kind: 'output'; text: string; error?: boolean }
  /** A notice: a background task done, the file open in your editor */
  | { kind: 'note'; text: string }
  /** You stopped its turn */
  | { kind: 'stopped' }

/** The tags Claude Code wraps what it adds in */
const TAG =
  /<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|bash-input|bash-stdout|bash-stderr|task-notification|ide_opened_file|ide_selection|user-prompt-submit-hook)>([\s\S]*?)(?:<\/\1>|$)/g

/** Its reminders to the model, which are not yours */
const REMINDER = /<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/g

/** What it writes when you stop a turn */
const STOPPED = /^\[Request interrupted by user[^\]]*\]$/

/** A note at most this long: the first line of what the editor said */
const NOTE_CHARS = 200

// Terminal colors in what a command printed
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

const plain = (text: string) => text.replace(ANSI, '').trim()

/** A turn of yours as parts, in the order they came */
export function saidParts(text: string): SaidPart[] {
  const said = text.replace(REMINDER, '').trim()
  if (STOPPED.test(said)) return [{ kind: 'stopped' }]
  const parts: SaidPart[] = []
  const typed = (piece: string) => {
    const trimmed = piece.trim()
    if (!trimmed) return
    if (STOPPED.test(trimmed)) parts.push({ kind: 'stopped' })
    else parts.push({ kind: 'text', text: trimmed })
  }
  let from = 0
  for (const match of said.matchAll(TAG)) {
    typed(said.slice(from, match.index))
    from = match.index + match[0].length
    const [, tag, inner = ''] = match
    const body = inner.trim()
    switch (tag) {
      case 'command-name':
        if (body)
          parts.push({
            kind: 'command',
            name: body.startsWith('/') ? body : `/${body}`,
          })
        break
      case 'command-args': {
        const last = parts.at(-1)
        if (body && last?.kind === 'command') last.args = body
        break
      }
      case 'bash-input':
        if (body) parts.push({ kind: 'shell', command: body })
        break
      case 'local-command-stdout':
      case 'local-command-stderr':
      case 'bash-stdout':
      case 'bash-stderr': {
        const printed = plain(inner)
        if (printed)
          parts.push({
            kind: 'output',
            text: printed,
            ...(tag.endsWith('stderr') ? { error: true } : {}),
          })
        break
      }
      case 'task-notification': {
        const summary = /<summary>([\s\S]*?)<\/summary>/.exec(body)?.[1]
        const note = (summary ?? body.replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim()
        if (note) parts.push({ kind: 'note', text: note })
        break
      }
      case 'ide_opened_file':
      case 'ide_selection': {
        const note = body.split('\n')[0]?.trim().slice(0, NOTE_CHARS)
        if (note) parts.push({ kind: 'note', text: note })
        break
      }
      // command-message repeats the command's name; a hook's text is the
      // hook's, not yours
    }
  }
  typed(said.slice(from))
  return parts
}

/**
 * A tool's name as you read it: an MCP tool as its server and its own name
 * ("pacenote · my_tasks"), any other as it is
 */
export function toolLabel(name: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name)
  return mcp ? `${mcp[1]} · ${mcp[2]}` : name
}

/**
 * Where a step works, as you read it: a path in the session's folder from
 * there, any other as it is
 */
export function stepTarget(text: string, cwd: string): string {
  const folder = cwd.endsWith('/') ? cwd : `${cwd}/`
  return cwd && text.startsWith(folder) ? text.slice(folder.length) : text
}
