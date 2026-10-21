import { localized } from '../i18n/locale.js'
import { text } from './record-text.text.js'

type Words = (typeof text)['en']

/** Finds a recorded English note, and words it again in the app's language */
const RECORDED: [RegExp, (match: RegExpExecArray, t: Words) => string][] = [
  [
    /^Interrupted because the (bot|app) restarted$/,
    (m, t) => t.interruptedBecause(m[1] as 'bot' | 'app'),
  ],
  [
    /^Interrupted by (bot|app) restart$/,
    (m, t) => t.interruptedBy(m[1] as 'bot' | 'app'),
  ],
  [
    /^Resumed after a bot restart \(attempt (\d+)\)$/,
    (m, t) => t.resumed(Number(m[1])),
  ],
  [/^Too many steps, later steps not recorded$/, (_, t) => t.tooManySteps],
  [
    /^Redacted (\d+) secrets? from the answer before posting it\.$/,
    (m, t) => t.redacted(Number(m[1])),
  ],
  [
    /^Image upload failed \(check files:write\)$/,
    (_, t) => t.imageUploadFailed,
  ],
  [
    /^Stopped to shut down; resumes on the next start\.$/,
    (_, t) => t.stoppedToShutDown,
  ],
  [
    /^Not resumed: Pace answers only the person it works for$/,
    (_, t) => t.notResumedOwner,
  ],
  [/^Could not resume because the queue was full$/, (_, t) => t.queueFull],
  [/^Generated image (\d+)$/, (m, t) => t.generatedImage(Number(m[1]))],
  [/^Figure (\d+)$/, (m, t) => t.figure(Number(m[1]))],
]

/**
 * A note, error or output title from a run record, as the app shows it: the
 * words Pacenote wrote itself in the app's language, anything else (an error
 * from a CLI, a tool's output) as it is. Records keep English, since AI tools
 * read them through Pacenote's MCP server.
 */
export function recordText(recorded: string): string {
  const t = localized(text)
  for (const [pattern, words] of RECORDED) {
    const match = pattern.exec(recorded)
    if (match) return words(match, t)
  }
  return recorded
}
