import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import { lastMessage } from '../../../src/history/events.js'
import type { McpLaunch } from '../../../src/history/mcp-clients.js'
import type { RunEvent } from '../../../src/history/types.js'
import {
  claudeResultUsage,
  runUsage,
  type TokenUsage,
} from '../../../src/history/usage.js'
import {
  codexArgs,
  codexLineToEvents,
  readCodexDefaults,
  type CodexDefaults,
} from '../../../src/reasoners/codex.js'
import { CLI_NAMES, type OwnCli } from '../../../src/tasks/own-ai.js'
import {
  readTools,
  SOURCES,
  writeTools,
  type SourceId,
} from '../../../src/tasks/sources.js'

/**
 * How Pacenote's own work runs each CLI headless on this Mac, as you, outside
 * your own settings: with no tools at all (the looks done judge, Recap's Write
 * it up), or with its Slack connector, read only, and Pacenote's task tools
 * (Collect now, reply drafts).
 * - claude -p loads only project settings (none, in the data folder), so your
 *   permissions, plugins, CLAUDE.md and MCP servers stay out; the claude.ai
 *   connectors still load. Its connector's write tools are denied.
 * - codex exec ignores your config.toml and rules, and its shell reads only
 *   the platform's basics, with no writes and no network. Apps (ChatGPT's
 *   connectors) are off, or only the source's app is on, with its tools that
 *   change or delete off; a tool that is not read only needs an approval it
 *   never gets (approval_policy=never), so its others that write are refused.
 *   Your model and reasoning effort are taken from your config.toml.
 */

/** The CLIs' commands on this Mac (CLAUDE_BIN, CODEX_BIN) */
export type Bins = Record<OwnCli, string>

/** Your codex model and reasoning effort, from ~/.codex/config.toml */
export function codexDefaults(env: NodeJS.ProcessEnv): CodexDefaults {
  return readCodexDefaults(
    path.join(env.CODEX_HOME || path.join(homedir(), '.codex'), 'config.toml')
  )
}

const codexBase = (codex: CodexDefaults = {}) =>
  codexArgs({
    model: codex.model,
    reasoningEffort: codex.reasoningEffort,
    // Nothing to read beyond the platform's basics
    reads: { denied: [] },
  })

/** A run with no tools, no MCP servers and none of your settings */
export function plainCommand(
  cli: OwnCli,
  bin: string,
  codex?: CodexDefaults
): [string, string[]] {
  if (cli === 'codex') return [bin, codexBase(codex)]
  return [
    bin,
    [
      '-p',
      '--setting-sources',
      'project',
      '--strict-mcp-config',
      '--tools',
      '',
      '--no-session-persistence',
      '--output-format',
      'json',
    ],
  ]
}

/**
 * A run that reads its sources through the CLI's connector, read only, with
 * Pacenote's MCP server (from this app) and only the tools of it named. With
 * slash, claude runs that prompt of Pacenote's server; codex has no prompts,
 * so the caller passes the text on stdin instead.
 */
export function connectorCommand(
  cli: OwnCli,
  bin: string,
  options: {
    launch: McpLaunch
    /** Pacenote's tools the run may use, by name */
    tools: readonly string[]
    sources: readonly SourceId[]
    slash?: string
    codex?: CodexDefaults
  }
): [string, string[]] {
  if (cli === 'codex') {
    const { command, args, env } = options.launch
    const base = codexBase(options.codex)
    const set = (key: string, value: string) => ['-c', `${key}=${value}`]
    const toml = (values: Record<string, string>) =>
      `{${Object.entries(values)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(',')}}`
    return [
      bin,
      [
        // Apps go back on, but only each source's own
        ...base.slice(0, base.indexOf('--disable')),
        ...set('apps._default.enabled', 'false'),
        ...options.sources.flatMap((id) => {
          const app = SOURCES[id].connectors.codex.app!
          return [
            ...set(`apps.${app}.enabled`, 'true'),
            ...set(`apps.${app}.destructive_enabled`, 'false'),
          ]
        }),
        ...set('mcp_servers.pacenote.command', JSON.stringify(command)),
        ...set('mcp_servers.pacenote.args', JSON.stringify(args)),
        ...set('mcp_servers.pacenote.env', toml(env)),
        ...set(
          'mcp_servers.pacenote.enabled_tools',
          JSON.stringify(options.tools)
        ),
        // Its task tools write to your Todo, which is what they are for.
        ...set('mcp_servers.pacenote.default_tools_approval_mode', '"approve"'),
        ...base.slice(base.indexOf('--disable') + 2),
      ],
    ]
  }
  return [
    bin,
    [
      '-p',
      ...(options.slash ? [options.slash] : []),
      '--setting-sources',
      'project',
      '--mcp-config',
      JSON.stringify({
        mcpServers: { pacenote: { type: 'stdio', ...options.launch } },
      }),
      '--tools',
      'ToolSearch',
      '--permission-mode',
      'default',
      '--allowedTools',
      ...options.tools.map((tool) => `mcp__pacenote__${tool}`),
      ...readTools(options.sources),
      '--disallowedTools',
      ...writeTools(),
      '--no-session-persistence',
      '--output-format',
      'stream-json',
      '--verbose',
    ],
  ]
}

/** What a headless run ended with: its text or why there is none, its tokens */
export type Output = ({ text: string } | { error: string }) & {
  usage?: TokenUsage
}

/**
 * The final answer in a CLI's output: claude's result object (json, or the
 * last line of stream-json), codex's last message
 */
export function outputOf(cli: OwnCli, stdout: string): Output | undefined {
  if (cli === 'codex') {
    const events: RunEvent[] = stdout
      .split('\n')
      .flatMap((line) => codexLineToEvents(line))
    const usage = runUsage(events)
    const text = lastMessage(events)?.trim()
    const error = events.findLast((event) => event.kind === 'error')
    const said = text
      ? { text }
      : error?.kind === 'error'
        ? { error: error.message }
        : undefined
    return said && { ...said, ...(usage ? { usage } : {}) }
  }
  for (const line of stdout.trim().split('\n').reverse()) {
    let event: {
      type?: string
      result?: string
      is_error?: boolean
      usage?: Record<string, number>
      total_cost_usd?: number
    }
    try {
      event = JSON.parse(line) as typeof event
    } catch {
      continue
    }
    if (event.type !== 'result') continue
    const text = (event.result ?? '').trim()
    const usage = event.usage ? claudeResultUsage(event) : undefined
    return {
      ...(event.is_error || !text ? { error: text } : { text }),
      ...(usage ? { usage } : {}),
    }
  }
  return undefined
}

/** How a headless run ended, as the process left it */
export interface Exit {
  stdout: string
  stderr: string
  /** The command could not be started: ENOENT when it is not on this Mac */
  spawnError?: NodeJS.ErrnoException
  timedOut?: boolean
}

/** Runs a headless CLI with its prompt on stdin, as the app's PATH has it */
export function runHeadless(options: {
  command: [string, string[]]
  input: string
  cwd: string
  toolPath: string
  timeoutMs: number
}): Promise<Exit> {
  const [command, args] = options.command
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const done = (exit: Partial<Exit> = {}) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, ...exit })
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, PATH: options.toolPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      done({ timedOut: true })
    }, options.timeoutMs)
    child.on('error', (error) => done({ spawnError: error }))
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('close', () => done())
    child.stdin.on('error', () => undefined)
    child.stdin.end(options.input)
  })
}

/**
 * Why a headless run gave nothing, as one line: it is not on this Mac, it took
 * too long, what it said, or the first line of its stderr
 */
export function exitError(
  cli: OwnCli,
  exit: Exit,
  output: Output | undefined,
  what: { slow: string; nothing: string }
): string {
  if (exit.spawnError)
    return exit.spawnError.code === 'ENOENT'
      ? `${CLI_NAMES[cli]} is not on this Mac (${cli} executable not found).`
      : exit.spawnError.message
  if (exit.timedOut) return what.slow
  if (output && 'error' in output && output.error)
    return output.error.split('\n')[0]!
  return exit.stderr.trim().split('\n')[0] || what.nothing
}
