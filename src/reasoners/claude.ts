import { readFile } from 'node:fs/promises'
import { clip, contentText, splitToolName } from '../history/events.js'
import type { RunEvent } from '../history/types.js'
import { claudeResultUsage } from '../history/usage.js'
import { SANDBOX_PATHS } from '../sandbox/runtime.js'
import { holdLogin } from '../sandbox/vm-login.js'
import { DENIED_GLOBS, readScope, type ReadScope } from './reads.js'
import type { CliAdapter, McpServerRef, ReasonImage } from './types.js'

/**
 * Claude Code (claude -p). Reads the reference directory, and only it, with
 * read-only tools, takes images as stream-json input, and gets its login in an
 * isolated sandbox from CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY.
 */
export const claudeAdapter: CliAdapter = {
  id: 'claude',

  canReadFiles: () => true,

  async invocation(request, { sandbox, options, readOnlyDir }) {
    const images = request.images ?? []
    const reads = readScope(sandbox, options, readOnlyDir)
    // Signed in inside the sandbox: its login folder is claude's config folder
    const login =
      options.auth?.login && sandbox.isolated
        ? holdLogin(options.auth.login, 'claude')
        : undefined
    return {
      command: 'claude',
      args: claudeArgs({
        system: request.system,
        model: options.model,
        reads: reads.dir ? reads : undefined,
        mcpServers: options.mcpServers,
        streamInput: images.length > 0,
      }),
      // Images are passed as base64 blocks on stdin, without a mount.
      input:
        images.length > 0
          ? await claudeStreamInput(request.prompt, images)
          : request.prompt,
      env: login?.env ?? options.auth?.env,
      mounts: login ? [login.mount] : undefined,
      cwd: readOnlyDir
        ? { host: readOnlyDir, at: SANDBOX_PATHS.workspace }
        : undefined,
      after: login && (async () => login.release()),
    }
  },

  events: (line) => claudeLineToEvents(line),

  answer: (stdout) => parseClaudeOutput(stdout),

  // Failures such as auth errors exit with code 1 and put the result JSON on
  // stdout, with the cause.
  failure(stdout) {
    if (!stdout.includes('"type":"result"')) return undefined
    try {
      parseClaudeOutput(stdout)
      return undefined
    } catch (err) {
      return (err as Error).message
    }
  },
}

const READ_ONLY_TOOLS = 'Read,Grep,Glob'

/**
 * A path rule for an absolute path: Read(//abs/path). A rule without the
 * double slash is relative to the working directory.
 */
const readRule = (absolute: string, suffix = '') =>
  `Read(/${absolute}${suffix})`

/**
 * claude -p arguments. An isolated run that does not read user settings, hooks,
 * or MCP config. With reads, only read tools are available, allowed in the
 * reference directory alone, and other permission requests are denied
 * automatically (dontAsk): a bare Read rule would allow any path on disk.
 * Shell, web, and file write tools are never granted.
 */
export function claudeArgs(options: {
  system: string
  model?: string
  /** The reference directory to read, and what never to read */
  reads?: ReadScope
  mcpServers?: McpServerRef[]
  /** With images, passes stdin as stream-json (including image blocks). */
  streamInput?: boolean
}): string[] {
  const mcpServers = options.mcpServers ?? []
  // Output is always stream-json so progress steps can be recorded. The last
  // line is the final result.
  const args = [
    '-p',
    ...(options.streamInput ? ['--input-format', 'stream-json'] : []),
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--effort',
    'medium',
    '--system-prompt',
    options.system,
  ]
  const { reads } = options
  if (options.model) args.push('--model', options.model)
  args.push('--tools', reads ? READ_ONLY_TOOLS : '')

  // Only allowlisted tools are used, and other permission requests are denied
  // automatically (dontAsk). Read rules cover Grep and Glob as well; deny rules
  // win over allow rules.
  const allowed = [
    ...(reads?.dir ? [readRule(reads.dir, '/**')] : []),
    ...mcpServers.map((server) => `mcp__${server.name}`),
  ]
  if (allowed.length > 0) {
    args.push('--allowedTools', ...allowed)
    if (reads)
      args.push(
        '--disallowedTools',
        ...DENIED_GLOBS.map((glob) => `Read(${glob})`),
        ...reads.denied.flatMap((denied) => [
          readRule(denied),
          readRule(denied, '/**'),
        ])
      )
    args.push('--permission-mode', 'dontAsk')
  }
  if (mcpServers.length > 0) {
    const config = Object.fromEntries(
      mcpServers.map((server) => [
        server.name,
        { type: 'http', url: server.url },
      ])
    )
    args.push('--mcp-config', JSON.stringify({ mcpServers: config }))
  }
  return args
}

interface ClaudeJsonResult {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
}

export function parseClaudeOutput(stdout: string): string {
  let parsed: ClaudeJsonResult
  try {
    // Reads the last result line for stream-json, or the whole output for json.
    const lines = stdout.trim().split('\n')
    const resultLine =
      lines.length > 1
        ? lines.reverse().find((line) => line.includes('"type":"result"'))
        : lines[0]
    parsed = JSON.parse(resultLine ?? '') as ClaudeJsonResult
  } catch {
    throw new Error(`claude output is not JSON: ${stdout.slice(0, 200)}`)
  }
  if (
    parsed.is_error ||
    parsed.subtype !== 'success' ||
    typeof parsed.result !== 'string'
  ) {
    const kind =
      parsed.subtype && parsed.subtype !== 'success'
        ? ` (${parsed.subtype})`
        : ''
    throw new Error(`claude run failed${kind}: ${parsed.result ?? ''}`)
  }
  return parsed.result.trim()
}

/**
 * claude stream-json input: one user message line with the image blocks
 * followed by the text prompt
 */
export async function claudeStreamInput(
  prompt: string,
  images: ReasonImage[]
): Promise<string> {
  const blocks = await Promise.all(
    images.map(async (image) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimetype,
        data: (await readFile(image.path)).toString('base64'),
      },
    }))
  )
  const message = {
    role: 'user',
    content: [...blocks, { type: 'text', text: prompt }],
  }
  return `${JSON.stringify({ type: 'user', message })}\n`
}

interface ClaudeBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

/**
 * Converts one claude -p --output-format stream-json line into run history
 * steps.
 */
export function claudeLineToEvents(
  line: string,
  at = new Date().toISOString()
): RunEvent[] {
  let event: {
    type?: string
    message?: { content?: ClaudeBlock[] }
    usage?: Record<string, number>
    total_cost_usd?: number
  }
  try {
    event = JSON.parse(line)
  } catch {
    return []
  }
  if (event.type === 'result') {
    const usage = claudeResultUsage(event)
    return [
      {
        kind: 'usage',
        at,
        inputTokens: usage.input,
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
        outputTokens: usage.output,
        costUsd: usage.costUsd,
      },
    ]
  }
  const blocks = event.message?.content ?? []
  const events: RunEvent[] = []
  for (const block of blocks) {
    if (
      event.type === 'assistant' &&
      block.type === 'text' &&
      block.text?.trim()
    ) {
      events.push({ kind: 'message', at, text: block.text.trim() })
    } else if (
      event.type === 'assistant' &&
      block.type === 'thinking' &&
      block.thinking?.trim()
    ) {
      events.push({ kind: 'reasoning', at, text: block.thinking.trim() })
    } else if (
      event.type === 'assistant' &&
      block.type === 'tool_use' &&
      block.id &&
      block.name
    ) {
      events.push({
        kind: 'tool',
        id: block.id,
        at,
        ...splitToolName(block.name),
        arguments: block.input,
        status: 'running',
      })
    } else if (
      event.type === 'user' &&
      block.type === 'tool_result' &&
      block.tool_use_id
    ) {
      const text = clip(contentText(block.content))
      events.push({
        kind: 'tool',
        id: block.tool_use_id,
        at,
        server: '',
        tool: '',
        status: block.is_error ? 'failed' : 'completed',
        result: block.is_error ? undefined : text,
        error: block.is_error ? text : undefined,
        finishedAt: at,
      })
    }
  }
  return events
}
