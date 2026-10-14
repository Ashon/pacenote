/** Text helpers shared by the mention pipeline and the messengers */

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3))}...`
}

/** A line that opens or closes a code block */
const isFence = (line: string) => line.trimStart().startsWith('```')
const CLOSE = '```'

/**
 * Splits long text into multiple messages, preferring line boundaries. A code
 * block split between two messages is closed at the end of the first and
 * opened again at the start of the next, so each message renders on its own.
 */
export function chunkText(text: string, limit: number): string[] {
  const chunks: string[] = []
  let lines: string[] = []
  /** The joined length of lines; -1 while there are none */
  let length = -1
  /** Whether lines hold more than code block fences and blank lines */
  let content = false
  /** The line that opened the code block the text is in, if it is in one */
  let open: string | undefined
  const add = (line: string) => {
    lines.push(line)
    length += line.length + 1
    if (line.trim() && !isFence(line)) content = true
  }
  /** Room left in this message, keeping enough to close an open block */
  const room = (inBlock: boolean) =>
    limit - (length + 1) - (inBlock ? CLOSE.length + 1 : 0)
  const flush = () => {
    if (content)
      chunks.push((open ? [...lines, CLOSE] : lines).join('\n').trimEnd())
    lines = []
    length = -1
    content = false
    if (open) add(open)
  }

  for (const line of text.split('\n')) {
    const fence = isFence(line)
    const after = fence ? (open ? undefined : line) : open
    if (line.length > room(after !== undefined) && content) flush()
    // A blank line does not start a message.
    if (lines.length === 0 && !line.trim()) continue
    if (line.length <= room(after !== undefined) || fence) {
      add(line)
      open = after
      continue
    }
    // Too long for a message of its own: in pieces, each in the code block
    // the line is in.
    for (let rest = line; rest;) {
      const piece = rest.slice(0, Math.max(1, room(open !== undefined)))
      add(piece)
      rest = rest.slice(piece.length)
      if (rest) flush()
    }
  }
  flush()
  return chunks.length > 0 ? chunks : ['']
}

/** This Mac's time zone ("Asia/Seoul"), which times are shown in by default */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Whether Intl knows the time zone name ("Asia/Seoul", "UTC") */
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name })
    return true
  } catch {
    return false
  }
}

export function formatTime(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}
