import { redactSecrets } from '../broker/redact.js'
import type { SessionAsk, SessionAskKind, SessionMode } from './types.js'

/**
 * A Claude Code session Pacenote runs on this Mac (V2): the lines Pacenote
 * writes to it (claude -p --input-format stream-json), and what it makes of
 * the asks Claude Code sends back (--permission-prompt-tool stdio). Pure, so
 * it is tested without Claude Code.
 */

/** The modes you pick under the composer, in this order */
export const SESSION_MODES: readonly SessionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
]

/** What an ask shows at most: a plan can be long */
const WHAT_CHARS = 4000

/** A rule Claude Code offers to stop asking: Bash with "pnpm vitest:*" */
export interface AskRule {
  toolName: string
  ruleContent?: string
}

/** An ask as Claude Code sends it (control_request, can_use_tool) */
export interface CanUseTool {
  subtype: 'can_use_tool'
  tool_name: string
  display_name?: string
  input?: unknown
  permission_suggestions?: {
    type?: string
    behavior?: string
    rules?: AskRule[]
  }[]
}

const KIND: Record<string, SessionAskKind> = {
  Bash: 'command',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  WebFetch: 'web',
  WebSearch: 'web',
  ExitPlanMode: 'plan',
}

const field = (input: unknown, key: string) => {
  const value = (input as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'string' ? value : undefined
}

/** What it would do, in its own words: the command, the file, the plan */
function whatOf(kind: SessionAskKind, input: unknown): string {
  const what =
    kind === 'command'
      ? field(input, 'command')
      : kind === 'edit'
        ? (field(input, 'file_path') ?? field(input, 'notebook_path'))
        : kind === 'web'
          ? (field(input, 'url') ?? field(input, 'query'))
          : kind === 'plan'
            ? field(input, 'plan')
            : undefined
  return redactSecrets(
    what ?? (input === undefined ? '' : JSON.stringify(input))
  ).slice(0, WHAT_CHARS)
}

/** The rule "allow in this session" adds, when Claude Code offers one */
export function ruleOf(request: CanUseTool): AskRule | undefined {
  for (const suggestion of request.permission_suggestions ?? [])
    if (suggestion.type === 'addRules' && suggestion.behavior === 'allow') {
      const rule = suggestion.rules?.[0]
      if (rule?.toolName) return rule
    }
  return undefined
}

/** A rule as you read it: "pnpm vitest", or the tool's name for all of it */
export function ruleLabel(rule: AskRule): string {
  const content = rule.ruleContent
    ?.replace(/:\*$/, '')
    .replace(/\s+\*$/, '')
    .trim()
  return redactSecrets(content || rule.toolName)
}

/** An ask as the session page shows it */
export function askOf(id: string, request: CanUseTool, at: string): SessionAsk {
  const kind = KIND[request.tool_name] ?? 'tool'
  const rule = ruleOf(request)
  return {
    id,
    kind,
    tool: request.display_name || request.tool_name,
    what: whatOf(kind, request.input),
    ...(rule && kind !== 'plan' ? { rule: ruleLabel(rule) } : {}),
    at,
  }
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`

/** Something you typed, for its next turn */
export const userLine = (text: string) =>
  line({ type: 'user', message: { role: 'user', content: text } })

/**
 * Your answer to an ask: go ahead, go ahead and stop asking for this in the
 * session (always), or no, with why
 */
export function answerLine(
  id: string,
  request: CanUseTool,
  answer: 'allow' | 'always' | 'deny',
  message?: string
): string {
  const rule = answer === 'always' ? ruleOf(request) : undefined
  return line({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: id,
      response:
        answer === 'deny'
          ? { behavior: 'deny', message: message?.trim() || DENIED }
          : {
              behavior: 'allow',
              updatedInput: request.input ?? {},
              // Kept for the session alone: nothing is written to your
              // settings or the project's
              ...(rule
                ? {
                    updatedPermissions: [
                      {
                        type: 'addRules',
                        rules: [rule],
                        behavior: 'allow',
                        destination: 'session',
                      },
                    ],
                  }
                : {}),
            },
    },
  })
}

/** What Claude Code reads when you say no without saying why */
export const DENIED = 'The user said no to this in Pacenote.'

/** An ask Pacenote does not answer: Claude Code goes on without it */
export const refuseLine = (id: string, error: string) =>
  line({
    type: 'control_response',
    response: { subtype: 'error', request_id: id, error },
  })

/** Stops the turn it is on */
export const interruptLine = (id: string) =>
  line({
    type: 'control_request',
    request_id: id,
    request: { subtype: 'interrupt' },
  })

/** Changes how it asks before it acts, from its next step */
export const modeLine = (id: string, mode: SessionMode) =>
  line({
    type: 'control_request',
    request_id: id,
    request: { subtype: 'set_permission_mode', mode },
  })

/**
 * How a session Pacenote runs starts: its own conversation resumed, a copy
 * of it, or a new one with the id given (V5), its name and how it asks
 */
export type HostStart =
  | { kind: 'resume'; mode?: SessionMode }
  | { kind: 'copy' }
  | { kind: 'new'; name?: string; mode?: SessionMode }

/** One of the modes you pick, to start it with again */
export const isSessionMode = (mode: unknown): mode is SessionMode =>
  SESSION_MODES.includes(mode as SessionMode)

const modeArgs = (mode: SessionMode | undefined) =>
  mode && mode !== 'default' ? ['--permission-mode', mode] : []

/** Claude Code's arguments for a session Pacenote runs */
export function hostArgs(session: string, start: HostStart): string[] {
  return [
    '-p',
    ...(start.kind === 'new'
      ? [
          '--session-id',
          session,
          // Its name in Claude Code's lists, as for a terminal's (-n)
          ...(start.name ? ['--name', start.name] : []),
          ...modeArgs(start.mode),
        ]
      : [
          '--resume',
          session,
          ...(start.kind === 'copy' ? ['--fork-session'] : []),
          ...(start.kind === 'resume' ? modeArgs(start.mode) : []),
        ]),
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    // Its answer as it writes it, and what it does this moment
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    // It asks its questions in its answer, which you answer in the composer
    '--disallowedTools',
    'AskUserQuestion',
  ]
}
