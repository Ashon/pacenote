import { describe, expect, it } from 'vitest'
import {
  DENIED,
  answerLine,
  askOf,
  type CanUseTool,
  hostArgs,
  interruptLine,
  modeLine,
  refuseLine,
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
    const args = hostArgs('s1', false)
    expect(args.slice(0, 3)).toEqual(['-p', '--resume', 's1'])
    expect(args).toContain('--permission-prompt-tool')
    expect(args[args.indexOf('--permission-prompt-tool') + 1]).toBe('stdio')
    expect(args).not.toContain('--fork-session')
    expect(hostArgs('s1', true)).toContain('--fork-session')
  })
})
