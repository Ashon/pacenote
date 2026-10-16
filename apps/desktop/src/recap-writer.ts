import { spawn } from 'node:child_process'
import { redactSecrets } from '../../../src/broker/redact.js'
import { judgeCommand } from './done-watch.js'

/**
 * Write it up: Claude Code sums a recap up in a few sentences, from the
 * recap's own lines only (src/you/recap.ts recapPrompt). It runs as the looks
 * done judge does: claude -p with no tools, no MCP servers and none of your
 * settings, on your Claude Code login, only when you ask.
 */

const TIMEOUT_MS = 2 * 60_000

/** The sentences in Claude Code's json output; undefined when there are none */
export function writtenFrom(stdout: string): string | undefined {
  try {
    const out = JSON.parse(stdout) as { result?: string; is_error?: boolean }
    if (out.is_error || typeof out.result !== 'string') return undefined
    const text = redactSecrets(
      out.result
        .replace(/^#+\s.*$/gm, '')
        .replace(/\*\*/g, '')
        .replace(/\s+\n/g, '\n')
        .trim()
    ).slice(0, 2_000)
    return text || undefined
  } catch {
    return undefined
  }
}

export function writeRecap(options: {
  bin: string
  toolPath: string
  cwd: string
  prompt: string
  timeoutMs?: number
}): Promise<{ text: string } | { error: string }> {
  const [command, args] = judgeCommand(options.bin)
  return new Promise((resolve) => {
    let stdout = ''
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, PATH: options.toolPath },
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ error: 'Claude Code did not answer in 2 minutes.' })
    }, options.timeoutMs ?? TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ error: error.message })
    })
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.on('close', () => {
      clearTimeout(timer)
      const text = writtenFrom(stdout)
      resolve(text ? { text } : { error: 'Claude Code wrote nothing.' })
    })
    child.stdin.end(options.prompt)
  })
}
