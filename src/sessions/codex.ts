import path from 'node:path'
import { redactSecrets } from '../broker/redact.js'
import type { TokenUsage } from '../history/usage.js'
import type { SessionImage } from './images.js'
import type { CodexMode, SessionAsk } from './types.js'

/**
 * A Codex session Pacenote runs on this Mac (Z2): what Pacenote says to the
 * installed codex app-server (JSON-RPC over stdio, one per session, with your
 * own ChatGPT sign-in), and what it makes of what Codex says back. Pure, so
 * it is tested without Codex. Codex keeps the conversation in its own log
 * (~/.codex/sessions), where codex resume picks it up; Pacenote keeps none.
 */

/**
 * The name Pacenote tells Codex it is (clientInfo): Codex writes it in the
 * session's log as its originator, which tells a session Pacenote runs from
 * one the Codex app or a terminal runs
 */
export const CODEX_ORIGINATOR = 'pacenote'

/** The first codex whose app-server Pacenote runs sessions with */
export const CODEX_SESSIONS_MIN_VERSION = '0.163.0'

/** The modes you pick under a Codex session's composer, in this order */
export const CODEX_MODES: readonly CodexMode[] = [
  'read-only',
  'workspace',
  'full-access',
]

/** A Codex session's mode until you pick another (Z4) */
export const CODEX_DEFAULT_MODE: CodexMode = 'workspace'

export const isCodexMode = (mode: unknown): mode is CodexMode =>
  CODEX_MODES.includes(mode as CodexMode)

/**
 * How Codex runs in a mode: when it asks (approvalPolicy), and what its
 * commands may do (sandbox, at a thread's start; sandboxPolicy, for a turn
 * after you change it)
 */
export function codexPolicy(mode: CodexMode): {
  approvalPolicy: 'on-request' | 'never'
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  sandboxPolicy: Record<string, unknown>
} {
  switch (mode) {
    case 'read-only':
      return {
        approvalPolicy: 'on-request',
        sandbox: 'read-only',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
      }
    case 'full-access':
      return {
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
        sandboxPolicy: { type: 'dangerFullAccess' },
      }
    default:
      return {
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [],
          networkAccess: false,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        },
      }
  }
}

/** What you typed, after the images you sent with it, as Codex takes it */
export function codexInput(
  text: string,
  images: readonly SessionImage[] = []
): Record<string, unknown>[] {
  return [
    ...images.map((image) => ({
      type: 'image',
      url: `data:${image.mediaType};base64,${image.data}`,
    })),
    ...(text ? [{ type: 'text', text, text_elements: [] }] : []),
  ]
}

/** What you typed, from Codex's own user message item */
export function codexSaid(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return (content as { type?: string; text?: unknown }[])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
}

/** A command as you would type it: Codex runs it in your login shell */
export function shellCommand(command: unknown): string {
  const line = Array.isArray(command)
    ? command.map(String).join(' ')
    : typeof command === 'string'
      ? command
      : ''
  const wrapped =
    /^(?:\/bin\/|\/usr\/bin\/)?(?:ba|z)?sh -l?c (['"])([\s\S]*)\1$/.exec(
      line.trim()
    )
  if (!wrapped) {
    // ["/bin/zsh", "-lc", "cat note.txt"]
    if (
      Array.isArray(command) &&
      command.length === 3 &&
      /(?:^|\/)(?:ba|z)?sh$/.test(String(command[0])) &&
      /^-l?c$/.test(String(command[1]))
    )
      return String(command[2])
    return line
  }
  const inner = wrapped[2]!
  return wrapped[1] === "'" ? inner.replace(/'\\''/g, "'") : inner
}

/** A file as its step names it: under the folder, from there */
const shortPath = (file: string, cwd: string | undefined) =>
  cwd && path.isAbsolute(file) && file.startsWith(`${cwd.replace(/\/+$/, '')}/`)
    ? path.relative(cwd, file)
    : file

/** The files a patch (apply_patch) adds, changes, deletes or moves to */
export function patchFiles(patch: string): string[] {
  const files: string[] = []
  for (const match of patch.matchAll(
    /^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm
  )) {
    const file = (match[1] ?? match[2] ?? '').trim()
    if (file && !files.includes(file)) files.push(file)
  }
  return files
}

/** The files in a line, a few at most */
const filesLine = (files: string[], cwd?: string) =>
  files
    .slice(0, 3)
    .map((file) => shortPath(file, cwd))
    .join(', ') + (files.length > 3 ? ` +${files.length - 3}` : '')

/**
 * The step a Codex item is, as its page shows it: a command run (Shell),
 * files changed (Edit), an MCP tool, a web search; none for the rest
 */
export function codexStep(
  item: Record<string, unknown>,
  cwd?: string
): { name: string; text: string } | undefined {
  switch (item.type) {
    case 'commandExecution':
      return { name: 'Shell', text: shellCommand(item.command) }
    case 'fileChange': {
      const files = Array.isArray(item.changes)
        ? (item.changes as { path?: unknown }[])
            .map((change) => change?.path)
            .filter((file): file is string => typeof file === 'string')
        : []
      return { name: 'Edit', text: filesLine(files, cwd) }
    }
    case 'mcpToolCall':
      return {
        name: `mcp__${String(item.server ?? '')}__${String(item.tool ?? '')}`,
        text: '',
      }
    case 'webSearch':
      return {
        name: 'WebSearch',
        text: typeof item.query === 'string' ? item.query : '',
      }
    default:
      return undefined
  }
}

/** What an ask shows at most */
const WHAT_CHARS = 4000
/** What "allow in this session" names, at most */
const RULE_CHARS = 60

/**
 * An ask as the session page shows it, from Codex's request (Z3): to run a
 * command, to change files, or more access (online, or a folder outside its
 * own); none for what Pacenote does not answer. files: a file change's, by
 * its item, as Codex told them when it started.
 */
export function codexAskOf(
  id: string,
  method: string,
  params: Record<string, unknown>,
  at: string,
  options: { cwd?: string; files?: string[] } = {}
): SessionAsk | undefined {
  const why =
    typeof params.reason === 'string' && params.reason.trim()
      ? redactSecrets(params.reason.trim()).slice(0, WHAT_CHARS)
      : undefined
  const base = { id, at, ...(why ? { why } : {}) }
  if (method === 'item/commandExecution/requestApproval') {
    const command = redactSecrets(shellCommand(params.command)).slice(
      0,
      WHAT_CHARS
    )
    const first = command.split('\n')[0]!.trim()
    return {
      ...base,
      kind: 'command',
      tool: 'Shell',
      what: command,
      ...(first
        ? {
            rule:
              first.length > RULE_CHARS
                ? `${first.slice(0, RULE_CHARS - 1)}…`
                : first,
          }
        : {}),
    }
  }
  if (method === 'item/fileChange/requestApproval') {
    const files = options.files?.length
      ? options.files
      : typeof params.grantRoot === 'string'
        ? [params.grantRoot]
        : []
    return {
      ...base,
      kind: 'edit',
      tool: 'Edit',
      what: redactSecrets(
        files.map((file) => shortPath(file, options.cwd)).join('\n')
      ).slice(0, WHAT_CHARS),
      always: true,
    }
  }
  if (method === 'item/permissions/requestApproval') {
    const asked = (params.permissions ?? {}) as {
      network?: unknown
      fileSystem?: unknown
    }
    const online = !!asked.network
    return {
      ...base,
      kind: online ? 'web' : 'edit',
      tool: 'Permissions',
      what: redactSecrets(
        [
          ...(online ? ['network'] : []),
          ...(asked.fileSystem ? [accessLine(asked.fileSystem)] : []),
        ]
          .filter(Boolean)
          .join('\n')
      ).slice(0, WHAT_CHARS),
      always: true,
    }
  }
  return undefined
}

/** The folders a permissions ask names, a line each */
function accessLine(fileSystem: unknown): string {
  const lines: string[] = []
  const walk = (value: unknown, key?: string) => {
    if (typeof value === 'string') {
      if (path.isAbsolute(value)) lines.push(key ? `${key}: ${value}` : value)
    } else if (Array.isArray(value)) for (const one of value) walk(one, key)
    else if (value && typeof value === 'object')
      for (const [name, one] of Object.entries(value)) walk(one, name)
  }
  walk(fileSystem)
  return lines.join('\n')
}

/**
 * Your answer to what Codex asks, as its request's result: go ahead, go
 * ahead and do not ask again for it in the session, or no (it goes on
 * without)
 */
export function codexAnswer(
  method: string,
  params: Record<string, unknown>,
  answer: 'allow' | 'always' | 'deny'
): Record<string, unknown> {
  if (method === 'item/permissions/requestApproval')
    return answer === 'deny'
      ? { permissions: {}, scope: 'turn' }
      : {
          permissions: params.permissions ?? {},
          scope: answer === 'always' ? 'session' : 'turn',
        }
  return {
    decision:
      answer === 'deny'
        ? 'decline'
        : answer === 'always'
          ? 'acceptForSession'
          : 'accept',
  }
}

/** The tokens of one request, as Codex counts them */
interface Breakdown {
  totalTokens?: number
  inputTokens?: number
  cachedInputTokens?: number
  cacheWriteInputTokens?: number
  outputTokens?: number
}

/**
 * How much of its model's context the conversation took at its last
 * request, from thread/tokenUsage/updated
 */
export function codexContext(
  usage: { last?: Breakdown; modelContextWindow?: number | null } | undefined
): { used: number; window: number } | undefined {
  const last = usage?.last
  const window = usage?.modelContextWindow
  const used =
    last?.totalTokens ?? (last?.inputTokens ?? 0) + (last?.outputTokens ?? 0)
  if (!used || typeof window !== 'number' || window <= 0) return undefined
  return { used, window }
}

/** What one request spent, for the Overview's tokens per day */
export function codexSpend(last: Breakdown | undefined): TokenUsage {
  const n = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  const cached = n(last?.cachedInputTokens)
  return {
    input: Math.max(0, n(last?.inputTokens) - cached),
    cacheRead: cached,
    cacheWrite: n(last?.cacheWriteInputTokens),
    output: n(last?.outputTokens),
  }
}

/**
 * The steps a code-mode exec ran (Codex 0.163 writes its commands as a
 * script that calls tools.exec_command, tools.apply_patch, …): each tool it
 * calls, a command's as Shell, a patch's as Edit (Z8)
 */
export function execSteps(
  code: string,
  cwd?: string
): { name: string; text: string }[] {
  const steps: { name: string; text: string }[] = []
  for (const call of code.matchAll(/\btools\.(\w+)\s*\(/g)) {
    const name = call[1]!
    const after = code.slice(call.index! + call[0].length)
    if (name === 'exec_command' || name === 'shell') {
      const literal =
        /^\s*\{[^}]*?\b(?:cmd|command)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/.exec(
          after
        )?.[1]
      steps.push({ name: 'Shell', text: literal ? unquote(literal) : '' })
    } else if (name === 'apply_patch')
      steps.push({ name: 'Edit', text: filesLine(patchFiles(after), cwd) })
    else steps.push({ name, text: '' })
  }
  return steps
}

/** A string as a script wrote it, without its quotes */
function unquote(literal: string): string {
  const quote = literal[0]
  const inner = literal.slice(1, -1)
  if (quote === '"')
    try {
      return JSON.parse(literal) as string
    } catch {
      return inner
    }
  return inner.replace(/\\(.)/g, (_, char: string) =>
    char === 'n' ? '\n' : char === 't' ? '\t' : char
  )
}

/**
 * A step in a Codex log (Z8): a function or custom tool call, or a local
 * shell call, as Shell, Edit or its own name, with what it was about
 */
export function codexLogSteps(
  payload: Record<string, unknown>,
  cwd?: string
): { name: string; text: string; input?: unknown }[] | undefined {
  const name = String(payload.name ?? '')
  if (payload.type === 'local_shell_call') {
    const action = payload.action as { command?: unknown } | undefined
    return [{ name: 'Shell', text: shellCommand(action?.command) }]
  }
  if (payload.type === 'custom_tool_call') {
    const input = typeof payload.input === 'string' ? payload.input : ''
    if (name === 'exec') {
      const steps = execSteps(input, cwd)
      return steps.length
        ? steps
        : [{ name: 'exec', text: input.trim().split('\n')[0] ?? '' }]
    }
    if (name === 'apply_patch')
      return [{ name: 'Edit', text: filesLine(patchFiles(input), cwd) }]
    return [{ name, text: '', input }]
  }
  if (payload.type !== 'function_call') return undefined
  let input: unknown = payload.arguments
  try {
    input = JSON.parse(String(payload.arguments))
  } catch {
    // Kept as written
  }
  const args = (input ?? {}) as Record<string, unknown>
  if (name === 'exec_command' || name === 'shell' || name === 'local_shell')
    return [
      {
        name: 'Shell',
        text: shellCommand(args.cmd ?? args.command ?? ''),
      },
    ]
  if (name === 'apply_patch')
    return [
      {
        name: 'Edit',
        text: filesLine(
          patchFiles(
            typeof args.input === 'string'
              ? args.input
              : typeof input === 'string'
                ? input
                : ''
          ),
          cwd
        ),
      },
    ]
  return [{ name, text: '', input }]
}
