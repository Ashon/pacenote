import { describe, expect, it } from 'vitest'
import {
  DENIED,
  answerLine,
  askOf,
  type CanUseTool,
  contextOf,
  hostArgs,
  interruptLine,
  modeLine,
  refuseLine,
  modelLabel,
  ruleLabel,
  userLine,
} from '../src/sessions/live.js'

const at = '2026-11-17T09:00:00Z'
const bash: CanUseTool = {
  subtype: 'can_use_tool',
  tool_name: 'Bash',
  display_name: 'Bash',
  input: { command: 'pnpm vitest run', description: 'Run the tests' },
  permission_suggestions: [
    {
      type: 'addRules',
      behavior: 'allow',
      rules: [{ toolName: 'Bash', ruleContent: 'pnpm vitest:*' }],
    },
    { type: 'addDirectories', behavior: 'allow' },
  ],
}
const parse = (line: string) => JSON.parse(line) as Record<string, unknown>

describe('askOf: what a session asks, as its page shows it', () => {
  it('reads a command, and what allowing it in the session would allow', () => {
    expect(askOf('r1', bash, at)).toEqual({
      id: 'r1',
      kind: 'command',
      tool: 'Bash',
      what: 'pnpm vitest run',
      rule: 'pnpm vitest',
      at,
    })
  })

  it('reads a file, an address and a plan, and any other tool', () => {
    expect(
      askOf(
        'r2',
        {
          subtype: 'can_use_tool',
          tool_name: 'Edit',
          input: { file_path: '/w/a.ts', old_string: 'a', new_string: 'b' },
        },
        at
      )
    ).toMatchObject({ kind: 'edit', what: '/w/a.ts', tool: 'Edit' })
    expect(
      askOf(
        'r3',
        {
          subtype: 'can_use_tool',
          tool_name: 'WebFetch',
          input: { url: 'https://example.com/a' },
        },
        at
      )
    ).toMatchObject({ kind: 'web', what: 'https://example.com/a' })
    const plan = askOf(
      'r4',
      {
        ...bash,
        tool_name: 'ExitPlanMode',
        display_name: 'ExitPlanMode',
        input: { plan: '1. Raise the limit\n2. Test it' },
      },
      at
    )
    expect(plan).toMatchObject({
      kind: 'plan',
      what: '1. Raise the limit\n2. Test it',
    })
    // A plan is gone ahead with or not: there is nothing to keep allowing
    expect(plan.rule).toBeUndefined()
    expect(
      askOf(
        'r5',
        {
          subtype: 'can_use_tool',
          tool_name: 'mcp__ops__restart',
          display_name: 'ops restart',
          input: { service: 'web' },
        },
        at
      )
    ).toMatchObject({
      kind: 'tool',
      tool: 'ops restart',
      what: '{"service":"web"}',
    })
  })

  it('hides a secret in what it would run', () => {
    const ask = askOf(
      'r6',
      {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'curl -H "x: xoxb-1234567890-abcdefghij" s' },
      },
      at
    )
    expect(ask.what).not.toContain('xoxb-1234567890')
  })

  it('names a rule by what it allows, or the tool for all of it', () => {
    expect(ruleLabel({ toolName: 'Bash', ruleContent: 'git status' })).toBe(
      'git status'
    )
    expect(ruleLabel({ toolName: 'WebFetch' })).toBe('WebFetch')
  })
})

describe('the lines Pacenote writes to a session', () => {
  it('sends what you typed as a user message', () => {
    expect(parse(userLine('Make it 5'))).toEqual({
      type: 'user',
      message: { role: 'user', content: 'Make it 5' },
    })
  })

  it('sends the images you attached before what you typed', () => {
    expect(
      parse(userLine('Why?', [{ mediaType: 'image/png', data: 'QUJD' }]))
    ).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
          },
          { type: 'text', text: 'Why?' },
        ],
      },
    })
  })

  it('allows with the input as asked, and keeps a rule for the session alone', () => {
    expect(parse(answerLine('r1', bash, 'allow'))).toEqual({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'r1',
        response: { behavior: 'allow', updatedInput: bash.input },
      },
    })
    const always = parse(answerLine('r1', bash, 'always')) as {
      response: { response: { updatedPermissions: unknown[] } }
    }
    expect(always.response.response.updatedPermissions).toEqual([
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'pnpm vitest:*' }],
        behavior: 'allow',
        destination: 'session',
      },
    ])
  })

  it('denies with what you said instead, or a note when you said nothing', () => {
    const deny = (message?: string) =>
      (
        parse(answerLine('r1', bash, 'deny', message)) as {
          response: { response: unknown }
        }
      ).response.response
    expect(deny('Run only the retry test')).toEqual({
      behavior: 'deny',
      message: 'Run only the retry test',
    })
    expect(deny('  ')).toEqual({ behavior: 'deny', message: DENIED })
  })

  it('stops a turn, changes the mode, and turns down an ask it does not answer', () => {
    expect(parse(interruptLine('i1'))).toEqual({
      type: 'control_request',
      request_id: 'i1',
      request: { subtype: 'interrupt' },
    })
    expect(parse(modeLine('m1', 'acceptEdits'))).toEqual({
      type: 'control_request',
      request_id: 'm1',
      request: { subtype: 'set_permission_mode', mode: 'acceptEdits' },
    })
    expect(parse(refuseLine('x1', 'no'))).toEqual({
      type: 'control_response',
      response: { subtype: 'error', request_id: 'x1', error: 'no' },
    })
  })

  it("resumes the session's own conversation, or a copy of it", () => {
    const args = hostArgs('s1', { kind: 'resume' })
    expect(args.slice(0, 3)).toEqual(['-p', '--resume', 's1'])
    expect(args).toContain('--permission-prompt-tool')
    expect(args[args.indexOf('--permission-prompt-tool') + 1]).toBe('stdio')
    expect(args).not.toContain('--fork-session')
    // Its answer as it writes it
    expect(args).toContain('--include-partial-messages')
    // What you sent, told back as it reads it
    expect(args).toContain('--replay-user-messages')
    expect(hostArgs('s1', { kind: 'copy' })).toContain('--fork-session')
  })

  it("tells how much of its model's context the conversation took", () => {
    const result = {
      type: 'result',
      usage: {
        input_tokens: 9,
        iterations: [
          { input_tokens: 10, output_tokens: 5 },
          {
            input_tokens: 1000,
            cache_read_input_tokens: 50000,
            cache_creation_input_tokens: 2000,
            output_tokens: 500,
          },
        ],
      },
      modelUsage: {
        'claude-haiku-5-5': { contextWindow: 100000 },
        'claude-opus-5-5': { contextWindow: 200000 },
      },
    }
    // The last request of its turn, of its own model's window
    expect(contextOf(result, 'claude-opus-5-5')).toEqual({
      used: 53500,
      window: 200000,
    })
    // A model it does not name: the first it used
    expect(contextOf(result, undefined)).toEqual({
      used: 53500,
      window: 100000,
    })
    // Without iterations, the turn's own usage
    expect(
      contextOf(
        {
          usage: { input_tokens: 400, output_tokens: 100 },
          modelUsage: { m: { contextWindow: 1000 } },
        },
        'm'
      )
    ).toEqual({ used: 500, window: 1000 })
    expect(contextOf({ usage: {} }, 'm')).toBeUndefined()
    expect(contextOf({ usage: { input_tokens: 5 } }, 'm')).toBeUndefined()
  })

  it('names a model as people call it', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelLabel('gpt-5.1-codex')).toBe('GPT-5.1-Codex')
    expect(modelLabel('gpt-6-luna')).toBe('GPT-6-Luna')
  })

  it('starts a new one with its id, its name and how it asks', () => {
    const args = hostArgs('s2', {
      kind: 'new',
      name: 'Retry the webhook',
      mode: 'plan',
    })
    expect(args.slice(0, 7)).toEqual([
      '-p',
      '--session-id',
      's2',
      '--name',
      'Retry the webhook',
      '--permission-mode',
      'plan',
    ])
    expect(args).not.toContain('--resume')
    expect(args).toContain('--permission-prompt-tool')
    // Asks before edits is Claude Code's own default: not said
    const plain = hostArgs('s2', { kind: 'new', mode: 'default' })
    expect(plain).not.toContain('--permission-mode')
    expect(plain).not.toContain('--name')
  })
})
