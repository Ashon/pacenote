import type { ContextMessage, MessageFile } from '../messengers/types.js'
import { formatTime, truncate } from '../messengers/text.js'
import type { FileCandidate, SkippedFile } from './attachments.js'

/** How many messages of the conversation are passed on, at most */
export const CONTEXT_MESSAGES = 30
/** Each one's text is cut to this */
const CONTEXT_MESSAGE_CHARS = 1_500

/**
 * The context passed on: all of it when it is short, otherwise the first
 * message, which starts a thread and says what it is about, and the latest.
 * left: how many in between are left out.
 */
export function recent(messages: readonly ContextMessage[]): {
  context: ContextMessage[]
  left: number
} {
  if (messages.length <= CONTEXT_MESSAGES)
    return { context: [...messages], left: 0 }
  return {
    context: [messages[0]!, ...messages.slice(-(CONTEXT_MESSAGES - 1))],
    left: messages.length - CONTEXT_MESSAGES,
  }
}

/**
 * The conversation as the prompt gives it: a line for each message, with its
 * time, author and the names of its attachments, and after the first how many
 * were left out (left).
 */
export function contextLines(
  context: readonly ContextMessage[],
  left: number,
  timezone: string
): string[] {
  const lines = context.map((line) => {
    const files = line.files.length
      ? ` [attachments: ${line.files.map((f) => f.name).join(', ')}]`
      : ''
    return `${formatTime(line.at, timezone)} ${line.author}: ${truncate(line.text, CONTEXT_MESSAGE_CHARS)}${files}`
  })
  if (left > 0)
    lines.splice(
      1,
      0,
      `(${left} ${left === 1 ? 'message' : 'messages'} left out here)`
    )
  return lines
}

/**
 * The attachments that may be passed on, each with where it is from: the
 * request message's first, then the thread's, the latest first.
 */
export function fileCandidates(
  requestFiles: readonly MessageFile[],
  context: readonly ContextMessage[],
  timezone: string
): FileCandidate[] {
  return [
    ...requestFiles.map((file) => ({ file, source: 'request message' })),
    ...[...context].reverse().flatMap((line) =>
      line.files.map((file) => ({
        file,
        source: `thread ${formatTime(line.at, timezone)} ${line.author}`,
      }))
    ),
  ]
}

/** The log line on a request's attachments: how many of each, and why not */
export function attachmentsLog(
  count: number,
  images: number,
  documents: number,
  unreadable: readonly SkippedFile[]
): string {
  return (
    `${count} ${count === 1 ? 'attachment' : 'attachments'}: images ${images}, files ${documents}, unreadable ${unreadable.length}` +
    (unreadable.length
      ? ` (${unreadable.map((f) => `${f.name}: ${f.reason}`).join('; ')})`
      : '')
  )
}
