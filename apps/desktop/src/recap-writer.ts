import { redactSecrets } from '../../../src/broker/redact.js'
import type { TokenUsage } from '../../../src/history/usage.js'
import type { CodexDefaults } from '../../../src/reasoners/codex.js'
import {
  CLI_NAMES,
  unableFrom,
  type OwnCli,
  type Unable,
} from '../../../src/tasks/own-ai.js'
import { exitError, outputOf, plainCommand, runHeadless } from './headless.js'

/**
 * Write it up: the CLI that does Pacenote's own work (own-ai.ts) sums a recap
 * up in a few sentences, from the recap's own lines only (src/you/recap.ts
 * recapPrompt). It runs as the looks done judge does: headless with no tools,
 * no MCP servers and none of your settings, on your own login, only when you
 * ask.
 */

const TIMEOUT_MS = 2 * 60_000

/** The sentences in what the CLI wrote; undefined when there are none */
export function writtenFrom(answer: string): string | undefined {
  const text = redactSecrets(
    answer
      .replace(/^#+\s.*$/gm, '')
      .replace(/\*\*/g, '')
      .replace(/\s+\n/g, '\n')
      .trim()
  ).slice(0, 2_000)
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
export type WriteResult = (
  { text: string } | { error: string; unable?: Unable }
) & {
  usage?: TokenUsage
}

export async function writeRecap(options: {
  cli: OwnCli
  bin: string
  codex?: CodexDefaults
  toolPath: string
  cwd: string
  prompt: string
  timeoutMs?: number
}): Promise<WriteResult> {
  const name = CLI_NAMES[options.cli]
  const exit = await runHeadless({
    command: plainCommand(options.cli, options.bin, options.codex),
    input: options.prompt,
    cwd: options.cwd,
    toolPath: options.toolPath,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
  })
  const output = outputOf(options.cli, exit.stdout)
  const usage = output?.usage ? { usage: output.usage } : {}
  const text = output && 'text' in output && writtenFrom(output.text)
  if (text) return { text, ...usage }
  const error = exitError(options.cli, exit, output, {
    slow: `${name} did not answer in 2 minutes.`,
    nothing: `${name} wrote nothing.`,
  })
  const unable = exit.timedOut ? undefined : unableFrom(error)
  return { error, ...(unable ? { unable } : {}), ...usage }
}
