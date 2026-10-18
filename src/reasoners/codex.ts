import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  clip,
  contentText,
  lastMessage,
  stepStatus,
} from '../history/events.js'
import type { RunEvent } from '../history/types.js'
import { SANDBOX_PATHS, type Mount } from '../sandbox/runtime.js'
import { holdLogin } from '../sandbox/vm-login.js'
import { DENIED_GLOBS, readScope, type ReadScope } from './reads.js'
import type { CliAdapter, McpServerRef } from './types.js'

/**
 * Codex (codex exec). Takes images as files, can generate images, and in an
 * isolated sandbox has the login folder it signed in to there as CODEX_HOME.
 */
export const codexAdapter: CliAdapter = {
  id: 'codex',

  /**
   * codex reads files through its shell, but inside the sandbox's VM its own
   * sandbox (bubblewrap) cannot create namespaces, so the commands are
   * rejected. Instead of loosening the outer isolation, file reading is off
   * there.
   */
  canReadFiles: (sandbox) => !sandbox.isolated,

  async invocation(request, { sandbox, options, readOnlyDir }) {
    const images = request.images ?? []
    const attachments: Mount | undefined = images[0]
      ? { host: path.dirname(images[0].path), at: SANDBOX_PATHS.attachments }
      : undefined
    const mounts: Mount[] = []
    // Signed in inside the sandbox: its login folder is codex's home there,
    // where generated_images leads to the output folder (vm-login.ts)
    const login =
      options.auth?.login && sandbox.isolated
        ? holdLogin(options.auth.login, 'codex')
        : undefined
    if (login) mounts.push(login.mount)
    if (attachments) mounts.push(attachments)
    // The sandbox's only writable host path. The image's entrypoint links
    // ~/.codex/generated_images here.
    if (request.outputDir && sandbox.isolated)
      mounts.push({
        host: request.outputDir,
        at: SANDBOX_PATHS.output,
        writable: true,
      })
    const started = Date.now()
    const outputDir = request.outputDir
    return {
      command: 'codex',
      args: codexArgs({
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        mcpServers: options.mcpServers,
        // On this Mac, codex's own sandbox keeps its shell to the reference
        // directory; in the sandbox, its shell does not run at all.
        reads: sandbox.isolated
          ? undefined
          : readScope(sandbox, options, readOnlyDir),
        images: images.map((image) =>
          attachments ? sandbox.pathIn(attachments, image.path) : image.path
        ),
      }),
      // codex exec has no separate system prompt option, so the instructions
      // are prepended.
      input: `<instructions>\n${request.system}\n</instructions>\n\n${request.prompt}`,
      env: login?.env,
      mounts,
      cwd: readOnlyDir
        ? { host: readOnlyDir, at: SANDBOX_PATHS.workspace }
        : undefined,
      // On the host, codex leaves generated images in ~/.codex; they are copied
      // out after the run. In the sandbox, the login folder is let go.
      after:
        outputDir && !sandbox.isolated
          ? () => collectCodexImages(outputDir, started)
          : login && (async () => login.release()),
    }
  },

  events: (line) => codexLineToEvents(line),

  answer: (stdout) => parseCodexOutput(stdout),

  // The cause is in the error events on stdout.
  failure(stdout) {
    const reason = codexError(stdout)
    return reason ? `codex run failed: ${reason}` : undefined
  },
}

/** The permission profile codex runs its shell under on this Mac */
const PROFILE = 'pacenote'

/**
 * codex's permission profile for a run on this Mac (codex 0.138 or later): its
 * shell reads the platform's basics and the reference directory, without
 * dotenv files, and nothing else, with no writes and no network. codex's
 * read-only sandbox would let it read the whole disk.
 */
export function codexProfile(reads: ReadScope): string {
  const entries: [string, string][] = [[':minimal', '"read"']]
  if (reads.dir)
    entries.push([
      reads.dir,
      `{${[['.', 'read'], ...DENIED_GLOBS.map((glob) => [glob, 'deny'])]
        .map(
          ([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`
        )
        .join(',')}}`,
    ])
  for (const denied of reads.denied) entries.push([denied, '"deny"'])
  return `permissions.${PROFILE}.filesystem={${entries
    .map(([key, value]) => `${JSON.stringify(key)}=${value}`)
    .join(',')}}`
}

/**
 * codex exec arguments. The prompt goes through stdin (-) and progress events
 * (JSONL) come back on stdout. App connectors linked to the ChatGPT account
 * (codex_apps, e.g. GitHub) are disabled. Their permission scope differs and
 * data leaves through another path, so external systems are queried only with
 * ops-broker tools. The shell stays on, restricted by codex's sandbox (no
 * writes, no network) and approval_policy=never (no escalation requests).
 *
 * With reads (on this Mac), the shell runs under a permission profile that
 * reads only the reference directory, and the user's config.toml (its MCP
 * servers, profiles, sandbox settings) is not loaded, as claude does not load
 * the user's settings; config.ts passes its model along. Without (in the
 * sandbox, where nothing else is there to read), the read-only sandbox.
 */
export function codexArgs(options: {
  model?: string
  reasoningEffort?: string
  mcpServers?: McpServerRef[]
  /** Image paths as seen from the sandbox (or this Mac) */
  images?: string[]
  reads?: ReadScope
}): string[] {
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    ...(options.reads
      ? [
          '--ignore-user-config',
          '--ignore-rules',
          '-c',
          `default_permissions="${PROFILE}"`,
          '-c',
          codexProfile(options.reads),
        ]
      : ['--sandbox', 'read-only']),
    '-c',
    'approval_policy="never"',
    '--color',
    'never',
    '--json',
    '--disable',
    'apps',
  ]
  if (options.model) args.push('--model', options.model)
  if (options.reasoningEffort) {
    args.push('-c', `model_reasoning_effort="${options.reasoningEffort}"`)
  }
  for (const server of options.mcpServers ?? []) {
    args.push(
      '-c',
      `mcp_servers.${server.name}.url=${JSON.stringify(server.url)}`
    )
    // With approval_policy=never, MCP tools that are not read-only are
    // rejected. The broker's policy check decides allow/deny, so this server's
    // tools are approved automatically.
    args.push(
      '-c',
      `mcp_servers.${server.name}.default_tools_approval_mode="approve"`
    )
  }
  // --image takes multiple values, so each is passed in = form to keep it from
  // consuming the trailing -.
  for (const image of options.images ?? []) args.push(`--image=${image}`)
  args.push('-')
  return args
}

/** Reads the last agent_message in codex --json output as the final answer. */
export function parseCodexOutput(stdout: string): string {
  const events = stdout.split('\n').flatMap((line) => codexLineToEvents(line))
  const answer = lastMessage(events)
  if (answer) return answer
  const reason = codexError(stdout)
  throw new Error(
    reason ? `codex run failed: ${reason}` : 'codex returned an empty response.'
  )
}

function codexError(stdout: string): string | undefined {
  const errors = stdout
    .split('\n')
    .flatMap((line) => codexLineToEvents(line))
    .flatMap((event) => (event.kind === 'error' ? [event.message] : []))
  return errors.at(-1)
}

/**
 * Images generated by codex running on the host are left in
 * ~/.codex/generated_images. Copies only the files created after the run
 * started into outputDir.
 */
async function collectCodexImages(
  outputDir: string,
  sinceMs: number
): Promise<void> {
  const root = path.join(
    process.env.CODEX_HOME ?? path.join(homedir(), '.codex'),
    'generated_images'
  )
  const sessions = await readdir(root).catch(() => [] as string[])
  for (const session of sessions) {
    const dir = path.join(root, session)
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const file = path.join(dir, name)
      const info = await stat(file).catch(() => undefined)
      if (!info?.isFile() || info.mtimeMs < sinceMs) continue
      await mkdir(outputDir, { recursive: true })
      await copyFile(file, path.join(outputDir, `${session}-${name}`))
    }
  }
}

interface CodexItem {
  id?: string
  type?: string
  text?: string
  server?: string
  tool?: string
  arguments?: unknown
  result?: { content?: unknown } | null
  error?: { message?: string } | string | null
  status?: string
  command?: string
  aggregated_output?: string
  exit_code?: number | null
  query?: string
  message?: string
}

/**
 * Converts one codex exec --json line into run history steps. Irrelevant lines
 * give an empty array.
 */
export function codexLineToEvents(
  line: string,
  at = new Date().toISOString()
): RunEvent[] {
  let event: {
    type?: string
    item?: CodexItem
    usage?: Record<string, number>
    message?: string
    error?: { message?: string }
  }
  try {
    event = JSON.parse(line)
  } catch {
    return []
  }
  if (event.type === 'turn.completed' && event.usage) {
    // codex counts the cached input in input_tokens; the record keeps the two
    // apart.
    const input = event.usage.input_tokens
    const cached = event.usage.cached_input_tokens
    return [
      {
        kind: 'usage',
        at,
        inputTokens:
          input === undefined ? undefined : Math.max(0, input - (cached ?? 0)),
        cacheReadTokens: cached,
        outputTokens: event.usage.output_tokens,
      },
    ]
  }
  if (event.type === 'error' && event.message)
    return [{ kind: 'error', at, message: event.message }]
  if (event.type === 'turn.failed') {
    return [
      {
        kind: 'error',
        at,
        message: event.error?.message ?? 'codex turn failed',
      },
    ]
  }
  const item = event.item
  if (
    !item ||
    (event.type !== 'item.started' && event.type !== 'item.completed')
  )
    return []
  const done = event.type === 'item.completed'
  switch (item.type) {
    case 'agent_message':
      return done && item.text
        ? [{ kind: 'message', at, text: item.text.trim() }]
        : []
    case 'reasoning':
      return done && item.text
        ? [{ kind: 'reasoning', at, text: item.text.trim() }]
        : []
    case 'mcp_tool_call': {
      const error =
        typeof item.error === 'string'
          ? item.error
          : (item.error?.message ?? undefined)
      return [
        {
          kind: 'tool',
          id: item.id ?? `${item.server}.${item.tool}`,
          at,
          server: item.server ?? '?',
          tool: item.tool ?? '?',
          arguments: item.arguments,
          status: error ? 'failed' : stepStatus(item.status),
          result: item.result
            ? clip(contentText(item.result.content))
            : undefined,
          error: error || undefined,
          finishedAt: done ? at : undefined,
        },
      ]
    }
    case 'command_execution':
      return [
        {
          kind: 'command',
          id: item.id ?? item.command ?? 'command',
          at,
          command: item.command ?? '',
          status: stepStatus(item.status),
          output: item.aggregated_output
            ? clip(item.aggregated_output)
            : undefined,
          exitCode: item.exit_code,
          finishedAt: done ? at : undefined,
        },
      ]
    case 'web_search':
      return done
        ? [
            {
              kind: 'tool',
              id: item.id ?? 'web_search',
              at,
              server: 'web',
              tool: 'search',
              arguments: { query: item.query },
              status: 'completed',
              finishedAt: at,
            },
          ]
        : []
    case 'error':
      return [{ kind: 'error', at, message: item.message ?? 'codex error' }]
    default:
      return []
  }
}

export interface CodexDefaults {
  model?: string
  reasoningEffort?: string
}

/**
 * Reads only the top-level model and model_reasoning_effort from
 * ~/.codex/config.toml. The host config file is not put in the sandbox, so
 * only these values are passed as arguments.
 */
export function parseCodexDefaults(toml: string): CodexDefaults {
  const topLevel = toml.split(/^\s*\[/m)[0] ?? ''
  const read = (key: string) =>
    new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm').exec(topLevel)?.[1]
  return {
    model: read('model'),
    reasoningEffort: read('model_reasoning_effort'),
  }
}

export function readCodexDefaults(configFile: string): CodexDefaults {
  if (!existsSync(configFile)) return {}
  return parseCodexDefaults(readFileSync(configFile, 'utf8'))
}
