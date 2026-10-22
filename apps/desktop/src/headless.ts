import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { lastMessage } from '../../../src/history/events.js'
import { getLocale, localized, type Locale } from '../../../src/i18n/locale.js'
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
import {
  CLI_NAMES,
  unableFrom,
  type ConnectorCli,
  type OwnCli,
  type Unable,
} from '../../../src/tasks/own-ai.js'
import {
  readTools,
  SOURCES,
  writeTools,
  type SourceId,
} from '../../../src/tasks/sources.js'
import type { TaskView } from '../../../src/tasks/types.js'
import { text } from './headless.text.js'

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
 * - opencode run starts a private server (--standalone) that loads, besides
 *   your own config (its providers and models), Pacenote's: an agent with no
 *   tools at all and nothing it may do on this Mac. It has no Slack connector
 *   here yet, so it does only the work that needs no tools.
 */

/** The CLIs' commands on this Mac (CLAUDE_BIN, CODEX_BIN, OPENCODE_BIN) */
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

/** Pacenote's config for opencode runs, kept in the data folder */
export const OPENCODE_CONFIG_FILE = 'opencode-pacenote.json'
/** The agent with no tools, for work that needs none */
export const OPENCODE_PLAIN_AGENT = 'pacenote-plain'

/**
 * Pacenote's opencode config: an agent with no tools at all, denied
 * everything it could do on this Mac. A few steps, so it never reaches its
 * last one, where opencode tells the model its tools are gone.
 */
export function opencodeConfig(): object {
  const deny = Object.fromEntries(
    [
      'edit',
      'read',
      'bash',
      'webfetch',
      'websearch',
      'external_directory',
      'question',
      'task',
    ].map((action) => [action, 'deny'])
  )
  return {
    $schema: 'https://opencode.ai/config.json',
    agent: {
      [OPENCODE_PLAIN_AGENT]: {
        description: "Pacenote's own work that needs no tools",
        mode: 'primary',
        steps: 3,
        tools: { '*': false },
        permission: deny,
      },
    },
  }
}

/** Writes Pacenote's opencode config in the data folder; returns its path */
export function writeOpencodeConfig(dataDir: string): string {
  const file = path.join(dataDir, OPENCODE_CONFIG_FILE)
  writeFileSync(file, `${JSON.stringify(opencodeConfig(), null, 2)}\n`)
  return file
}

/** What an opencode run needs: Pacenote's config, the model, where it runs */
export interface OpencodeRun {
  config: string
  /** provider/model; opencode's own default without one */
  model?: string
  cwd: string
  title?: string
}

/** A headless run: its command, what it reads on stdin, and its environment */
export interface Invocation {
  command: [string, string[]]
  input: string
  env?: Record<string, string>
}

/**
 * A run with no tools, no MCP servers and none of your settings, the prompt
 * on stdin (opencode takes it as its message: its stdin stays empty)
 */
export function plainInvocation(
  cli: OwnCli,
  bin: string,
  prompt: string,
  options: { codex?: CodexDefaults; opencode?: OpencodeRun } = {}
): Invocation {
  if (cli !== 'opencode')
    return { command: plainCommand(cli, bin, options.codex), input: prompt }
  const run = options.opencode
  if (!run) throw new Error('An opencode run needs its config.')
  return {
    command: [
      bin,
      [
        'run',
        '--standalone',
        '--format',
        'json',
        '--agent',
        OPENCODE_PLAIN_AGENT,
        ...(run.title ? ['--title', run.title] : []),
        ...(run.model ? ['-m', run.model] : []),
        prompt,
      ],
    ],
    input: '',
    // opencode works where PWD says, not in the process's folder
    env: { OPENCODE_CONFIG: run.config, PWD: run.cwd },
  }
}

/** A run with no tools, no MCP servers and none of your settings */
export function plainCommand(
  cli: ConnectorCli,
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
  cli: ConnectorCli,
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
 * last line of stream-json), codex's last message, opencode's last text
 */
export function outputOf(cli: OwnCli, stdout: string): Output | undefined {
  if (cli === 'opencode') return opencodeOutput(stdout)
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

interface OpencodeEvent {
  type?: string
  sessionID?: string
  error?: { message?: string; data?: { message?: string } }
  part?: {
    text?: string
    tokens?: {
      input?: number
      output?: number
      reasoning?: number
      cache?: { read?: number; write?: number }
    }
  }
}

/** The session an opencode run made, to take out of its history after */
export function opencodeSession(stdout: string): string | undefined {
  for (const line of stdout.split('\n')) {
    try {
      const id = (JSON.parse(line) as OpencodeEvent).sessionID
      if (id) return id
    } catch {
      // not an event
    }
  }
  return undefined
}

/**
 * opencode run --format json: the last text, or its error, and the tokens
 * of its steps (a last step with no tools reports none, so they are a floor)
 */
function opencodeOutput(stdout: string): Output | undefined {
  let text: string | undefined
  let error: string | undefined
  let usage: TokenUsage | undefined
  for (const line of stdout.split('\n')) {
    let event: OpencodeEvent
    try {
      event = JSON.parse(line) as OpencodeEvent
    } catch {
      continue
    }
    if (event.type === 'text' && event.part?.text?.trim())
      text = event.part.text.trim()
    else if (event.type === 'error')
      error =
        event.error?.data?.message ?? event.error?.message ?? 'opencode failed'
    else if (event.type === 'step_finish' && event.part?.tokens) {
      const tokens = event.part.tokens
      usage = {
        input: (usage?.input ?? 0) + (tokens.input ?? 0),
        cacheRead: (usage?.cacheRead ?? 0) + (tokens.cache?.read ?? 0),
        cacheWrite: (usage?.cacheWrite ?? 0) + (tokens.cache?.write ?? 0),
        output:
          (usage?.output ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0),
      }
    }
  }
  const said = text ? { text } : error ? { error } : undefined
  return said && { ...said, ...(usage ? { usage } : {}) }
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
  env?: Record<string, string>
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
      env: { ...process.env, ...options.env, PATH: options.toolPath },
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
 * too long, what it said, or the first line of its stderr. Pacenote's own
 * words are in locale, the app's language by default.
 */
export function exitError(
  cli: OwnCli,
  exit: Exit,
  output: Output | undefined,
  what: { slow: string; nothing: string },
  locale: Locale = getLocale()
): string {
  if (exit.spawnError)
    return exit.spawnError.code === 'ENOENT'
      ? localized(text, locale).notOnMac(CLI_NAMES[cli], cli)
      : exit.spawnError.message
  if (exit.timedOut) return what.slow
  if (output && 'error' in output && output.error)
    return output.error.split('\n')[0]!
  return exit.stderr.trim().split('\n')[0] || what.nothing
}

/**
 * Whether a headless run's error means its CLI could not do the work at all,
 * so the other one may: not on this Mac, or what the CLI's own words say. A
 * run that took too long is not.
 */
export function exitUnable(exit: Exit, error: string): Unable | undefined {
  if (exit.timedOut) return undefined
  if (exit.spawnError?.code === 'ENOENT') return 'missing'
  return unableFrom(error)
}

/**
 * The task as Pacenote's own work is told it, up to the lines each piece of
 * work adds before </task>
 */
export function taskLines(task: TaskView): string[] {
  return [
    `<task id="${task.id}">`,
    task.title,
    [
      task.askedBy && task.kind === 'asked' ? `${task.askedBy} asked` : '',
      task.source.label,
      task.due ? `due ${task.due}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    task.summary ? `Summary: ${task.summary}` : `Why: ${task.reason}`,
  ]
}

/**
 * Runs a piece of work with no tools on a CLI, and for opencode takes its
 * session out of opencode's history after, as claude and codex keep none
 */
export async function runPlain(options: {
  cli: OwnCli
  bin: string
  prompt: string
  codex?: CodexDefaults
  opencode?: OpencodeRun
  cwd: string
  toolPath: string
  timeoutMs: number
}): Promise<Exit> {
  const { command, input, env } = plainInvocation(
    options.cli,
    options.bin,
    options.prompt,
    options
  )
  const exit = await runHeadless({
    command,
    input,
    env,
    cwd: options.cwd,
    toolPath: options.toolPath,
    timeoutMs: options.timeoutMs,
  })
  const session =
    options.cli === 'opencode' ? opencodeSession(exit.stdout) : undefined
  if (session)
    void runHeadless({
      // A private server too: Pacenote never starts opencode's background one
      command: [options.bin, ['session', 'delete', '--standalone', session]],
      input: '',
      env,
      cwd: options.cwd,
      toolPath: options.toolPath,
      timeoutMs: 30_000,
    })
  return exit
}

/** A piece of Pacenote's own work with no tools: Looks done, Write it up */
export interface PlainWork {
  cli: OwnCli
  bin: string
  codex?: CodexDefaults
  /** For opencode: Pacenote's config and the model */
  opencode?: Omit<OpencodeRun, 'cwd'>
  toolPath: string
  cwd: string
  prompt: string
  timeoutMs?: number
}

const PLAIN_WORK_MS = 2 * 60_000

/**
 * Runs a piece of work with no tools, titled so in opencode, for 2 minutes at
 * most unless told otherwise: the CLI's output, and failed, which says in
 * what's words why it gave no answer (unable: whether the other CLI may do it
 * instead)
 */
export async function runPlainWork(
  work: PlainWork & { title: string }
): Promise<{
  output: Output | undefined
  failed: (
    what: { slow: string; nothing: string },
    locale?: Locale
  ) => { error: string; unable?: Unable }
}> {
  const exit = await runPlain({
    cli: work.cli,
    bin: work.bin,
    prompt: work.prompt,
    codex: work.codex,
    opencode: work.opencode && {
      title: work.title,
      cwd: work.cwd,
      ...work.opencode,
    },
    cwd: work.cwd,
    toolPath: work.toolPath,
    timeoutMs: work.timeoutMs ?? PLAIN_WORK_MS,
  })
  const output = outputOf(work.cli, exit.stdout)
  return {
    output,
    failed: (what, locale) => {
      const error = exitError(work.cli, exit, output, what, locale)
      const unable = exitUnable(exit, error)
      return unable ? { error, unable } : { error }
    },
  }
}
