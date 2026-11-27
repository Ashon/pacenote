import { redactSecrets } from '../../../src/broker/redact.js'
import type { TokenUsage } from '../../../src/history/usage.js'
import { localized } from '../../../src/i18n/locale.js'
import {
  CLI_NAMES,
  type OwnCli,
  type Unable,
} from '../../../src/tasks/own-ai.js'
import { writtenOf } from '../../../src/you/written.js'
import { outputOf, runPlainWork, type PlainWork } from './headless.js'
import { text } from './recap-writer.text.js'

/**
 * Write it up: the CLI that does Pacenote's own work (own-ai.ts) sums a recap
 * up area by area, a few bullets each, from the recap's own lines only
 * (src/you/recap.ts recapPrompt). It runs as the looks done judge does:
 * headless with no tools, no MCP servers and none of your settings, on your
 * own login, only when you ask.
 */

/** A write-up at most this long */
const WRITTEN_CHARS = 3_000

/**
 * What the CLI wrote, as Pacenote keeps it (writtenOf: each area's heading
 * and bullets); undefined when there is nothing
 */
function writtenFrom(answer: string): string | undefined {
  const text = redactSecrets(writtenOf(answer)).slice(0, WRITTEN_CHARS).trim()
  return text || undefined
}

/** The tokens in a CLI's output, for the Overview */
export function usageFrom(
  stdout: string,
  cli: OwnCli = 'claude'
): TokenUsage | undefined {
  return outputOf(cli, stdout)?.usage
}

/**
 * What the CLI wrote, or why it did not (unable: whether the other CLI may
 * write it instead), and the tokens it spent
 */
type WriteResult = ({ text: string } | { error: string; unable?: Unable }) & {
  usage?: TokenUsage
}

export async function writeRecap(options: PlainWork): Promise<WriteResult> {
  const name = CLI_NAMES[options.cli]
  const { output, failed } = await runPlainWork({
    ...options,
    title: 'Pacenote: write it up',
  })
  const usage = output?.usage ? { usage: output.usage } : {}
  const written = output && 'text' in output && writtenFrom(output.text)
  if (written) return { text: written, ...usage }
  const t = localized(text)
  return {
    ...failed({ slow: t.slow(name), nothing: t.nothing(name) }),
    ...usage,
  }
}
