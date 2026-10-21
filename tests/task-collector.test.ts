import { describe, expect, it } from 'vitest'
import {
  collectCommand,
  CollectStream,
  SIGNED_OUT,
  STOPPED,
  TaskCollector,
} from '../apps/desktop/src/task-collector.js'
import { OwnAi } from '../apps/desktop/src/own-ai.js'
import type { RunEvent } from '../src/history/types.js'
import type { OwnCli } from '../src/tasks/own-ai.js'
import { readTools, writeTools } from '../src/tasks/sources.js'
import type { CollectOutcome } from '../src/tasks/types.js'

const LAUNCH = {
  command: '/Applications/Pacenote.app/Contents/MacOS/Pacenote',
  args: [
    '/Applications/Pacenote.app/Contents/Resources/app/tools/history-mcp.mjs',
  ],
  env: { ELECTRON_RUN_AS_NODE: '1' },
}

// The shape of Claude Code's stream-json events (claude 2.1.296)
const init = (slack = 'pending') => ({
  type: 'system',
  subtype: 'init',
  mcp_servers: [
    { name: 'pacenote', status: 'connected' },
    ...(slack ? [{ name: 'claude.ai Slack', status: slack }] : []),
  ],
})
const toolUse = (id: string, name: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input: {} }] },
})
const toolResult = (id: string, text: string, isError = false) => ({
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: id,
        is_error: isError,
        content: [{ type: 'text', text }],
      },
    ],
  },
})
const result = (text: string, ok = true, usage?: Record<string, number>) => ({
  type: 'result',
  subtype: ok ? 'success' : 'error_during_execution',
  is_error: !ok,
  result: text,
  ...(usage ? { usage, total_cost_usd: 0.42 } : {}),
})
const lines = (...events: object[]) => events.map((e) => JSON.stringify(e))

describe('collecting from the app with Claude Code', () => {
  it('runs headless with only Slack reads and the task tools, outside the user’s own settings', () => {
    const [command, args] = collectCommand(LAUNCH)
    expect(command).toBe('claude')
    expect(args.slice(0, 2)).toEqual(['-p', '/mcp__pacenote__collect_tasks'])
    const flag = (name: string) => args[args.indexOf(name) + 1]
    expect(flag('--setting-sources')).toBe('project')
    expect(flag('--tools')).toBe('ToolSearch')
    expect(flag('--permission-mode')).toBe('default')
    expect(JSON.parse(flag('--mcp-config')!)).toEqual({
      mcpServers: { pacenote: { type: 'stdio', ...LAUNCH } },
    })
    const between = (from: string, to: string) =>
      args.slice(args.indexOf(from) + 1, args.indexOf(to))
    const allowed = between('--allowedTools', '--disallowedTools')
    expect(allowed).toEqual(expect.arrayContaining(readTools(['slack'])))
    expect(allowed).toContain('mcp__claude_ai_Slack__slack_read_thread')
    expect(allowed).toContain('mcp__pacenote__add_tasks')
    expect(allowed).toContain('mcp__pacenote__update_task')
    expect(allowed).toContain('mcp__pacenote__wrap_up_task')
    expect(allowed.some((tool) => writeTools().includes(tool))).toBe(false)
    expect(between('--disallowedTools', '--no-session-persistence')).toEqual(
      writeTools()
    )
    expect(writeTools()).toContain('mcp__claude_ai_Slack__slack_send_message')
  })

  it('allows only the reads of the sources it collects from, and denies every write', () => {
    const args = collectCommand(LAUNCH, { sources: [] })[1]
    const allowed = args.slice(
      args.indexOf('--allowedTools') + 1,
      args.indexOf('--disallowedTools')
    )
    expect(allowed.every((tool) => tool.startsWith('mcp__pacenote__'))).toBe(
      true
    )
    expect(args).toContain('mcp__claude_ai_Slack__slack_send_message')
  })

  it('counts Slack reads and reads what add_tasks answered', () => {
    const stream = new CollectStream()
    for (const line of lines(
      init(),
      toolUse('1', 'mcp__pacenote__collect_context'),
      toolUse('2', 'mcp__claude_ai_Slack__slack_search_public_and_private'),
      toolUse('3', 'mcp__claude_ai_Slack__slack_read_thread'),
      toolUse('4', 'mcp__pacenote__add_tasks'),
      toolResult(
        '4',
        JSON.stringify({
          added: [
            { id: 'a', confidence: 'sure' },
            { id: 'b', confidence: 'sure' },
            { id: 'c', confidence: 'maybe' },
          ],
          skipped: [{ link: 'x', why: '#random is left out' }],
        })
      ),
      result('Added two tasks.', true, {
        input_tokens: 1200,
        cache_read_input_tokens: 30000,
        cache_creation_input_tokens: 4000,
        output_tokens: 800,
      })
    ))
      stream.push(line)
    expect(stream.reads).toBe(2)
    expect(stream.outcome('T')).toEqual({
      at: 'T',
      ok: true,
      added: 2,
      maybe: 1,
      skipped: 1,
      reads: 2,
      by: 'claude',
      usage: {
        input: 1200,
        cacheRead: 30000,
        cacheWrite: 4000,
        output: 800,
        costUsd: 0.42,
      },
    })
  })

  it('explains a collection that did not finish', () => {
    const noSlack = new CollectStream()
    for (const line of lines(init(''), result('I have no Slack tools.')))
      noSlack.push(line)
    expect(noSlack.missing).toEqual(['slack'])
    expect(noSlack.outcome('T')).toMatchObject({
      ok: false,
      error:
        "Claude Code has no Slack connector. Connect Slack in claude.ai's Settings > Connectors, then collect again.",
    })

    const off = new CollectStream()
    for (const line of lines(
      init(),
      toolUse('9', 'mcp__pacenote__add_tasks'),
      toolResult('9', 'Adding tasks is off.', true)
    ))
      off.push(line)
    expect(off.outcome('T')).toMatchObject({ error: 'Adding tasks is off.' })

    // Signed out, Claude Code has no connectors at all: the sign-in comes
    // first. (claude 2.1.296 ends with subtype success and is_error)
    const loggedOut = new CollectStream()
    for (const line of lines(
      { type: 'system', subtype: 'init', mcp_servers: [] },
      {
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Not logged in · Please run /login',
      }
    ))
      loggedOut.push(line)
    expect(loggedOut.outcome('T')).toMatchObject({
      error: SIGNED_OUT.claude,
      signedOut: true,
      unable: 'auth',
    })

    const failed = new CollectStream()
    for (const line of lines(
      init('connected'),
      result('API Error: 529 Overloaded\nmore', false)
    ))
      failed.push(line)
    expect(failed.outcome('T')).toMatchObject({
      error: 'API Error: 529 Overloaded',
      unable: 'unavailable',
    })
  })

  const fake = (events: object[], extra = '') =>
    [
      process.execPath,
      [
        '-e',
        `for (const line of ${JSON.stringify(lines(...events))}) console.log(line); ${extra}`,
      ],
    ] as [string, string[]]

  it('runs one collection at a time, with its progress and how it ended', async () => {
    const changes: unknown[] = []
    const started: Date[] = []
    const steps: RunEvent[] = []
    const ended: CollectOutcome[] = []
    const collector = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      recorder: (startedAt) => {
        started.push(startedAt)
        return {
          event: (step) => steps.push(step),
          finish: (outcome) => ended.push(outcome),
        }
      },
      command: () =>
        fake([
          init(),
          toolUse('2', 'mcp__claude_ai_Slack__slack_read_channel'),
          toolUse('4', 'mcp__pacenote__add_tasks'),
          toolResult('4', JSON.stringify({ added: [], skipped: [] })),
          result('Nothing new.'),
        ]),
      now: () => new Date('2026-10-11T05:00:00Z'),
    })
    collector.on('change', (state) => changes.push(state))
    const running = collector.run()
    expect(collector.state.running).toEqual({
      startedAt: '2026-10-11T05:00:00.000Z',
      reads: 0,
      by: 'claude',
    })
    expect(await collector.run()).toMatchObject({
      ok: false,
      error: 'A collection is already running.',
    })
    const last = await running
    expect(last).toEqual({
      at: '2026-10-11T05:00:00.000Z',
      ok: true,
      added: 0,
      maybe: 0,
      skipped: 0,
      reads: 1,
      by: 'claude',
    })
    expect(collector.state).toEqual({ last })
    // One run for the collection, none for the one turned away: its steps
    // as they came, and how it ended.
    expect(started).toEqual([new Date('2026-10-11T05:00:00.000Z')])
    expect(steps.map((step) => step.kind)).toEqual([
      'tool',
      'tool',
      'tool',
      'usage',
    ])
    expect(ended).toEqual([last])
    expect(changes).toContainEqual({
      last: undefined,
      running: {
        startedAt: '2026-10-11T05:00:00.000Z',
        reads: 1,
        by: 'claude',
      },
    })
  })

  it('tells a collection signed out, from its result or its stderr', async () => {
    // A login that ran out, as a work Mac's claude 2.1.29x said it
    const expired = new CollectStream()
    for (const line of lines(init('connected'), {
      type: 'result',
      subtype: 'success',
      is_error: true,
      result:
        'Failed to authenticate: OAuth session expired and could not be refreshed',
    }))
      expired.push(line)
    expect(expired.outcome('T')).toEqual({
      at: 'T',
      ok: false,
      error: SIGNED_OUT.claude,
      signedOut: true,
      unable: 'auth',
      reads: 0,
      by: 'claude',
    })

    // Stopped before its result: stderr says why
    const revoked = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      command: () =>
        fake(
          [],
          "console.error('OAuth token has been revoked. Please run /login'); process.exit(1)"
        ),
    })
    expect(await revoked.run()).toMatchObject({
      ok: false,
      error: SIGNED_OUT.claude,
      signedOut: true,
    })

    // A run that ended has its result to go by, whatever stderr held
    const noisy = new CollectStream()
    for (const line of lines(init(''), result('I have no Slack tools.')))
      noisy.push(line)
    expect(
      noisy.outcome('T', undefined, 'MCP server returned 401 Unauthorized')
    ).not.toHaveProperty('signedOut')

    // Stopped is stopped, signed out or not
    const stopped = new CollectStream()
    expect(
      stopped.outcome('T', STOPPED, 'Not logged in · Please run /login')
    ).toMatchObject({ error: 'Stopped.' })
  })

  it('starts with how the last logged collection ended', () => {
    const last = {
      at: '2026-10-10T05:00:00.000Z',
      ok: true as const,
      added: 1,
      maybe: 0,
      skipped: 0,
      reads: 12,
    }
    const collector = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => '',
      cwd: process.cwd(),
      last,
    })
    expect(collector.state).toEqual({ last })

    // The history keeps the error alone: signed out still offers the sign-in
    const signedOut = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => '',
      cwd: process.cwd(),
      last: {
        at: '2026-10-10T05:00:00.000Z',
        ok: false,
        error: SIGNED_OUT.claude,
      },
    })
    expect(signedOut.state.last).toMatchObject({ signedOut: true })
  })

  it('stops a collection, and tells when claude is missing or too slow', async () => {
    const slow = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      command: () => fake([init()], 'setInterval(() => {}, 1000)'),
    })
    const stopped = slow.run()
    setTimeout(() => slow.cancel(), 200)
    expect(await stopped).toMatchObject({ ok: false, error: 'Stopped.' })

    const missing = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => '/nonexistent',
      cwd: process.cwd(),
      command: () => ['claude-not-here', []],
    })
    expect(await missing.run()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/claude is not on this Mac/),
    })

    const timedOut = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      command: () => fake([init()], 'setInterval(() => {}, 1000)'),
      timeoutMs: 200,
    })
    expect(await timedOut.run()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/did not finish/),
    })
  })
})

// The shape of codex exec --json events (codex 0.163)
const codexTool = (
  id: string,
  server: string,
  tool: string,
  result = '',
  error?: string
) => [
  {
    type: 'item.started',
    item: { id, type: 'mcp_tool_call', server, tool, status: 'in_progress' },
  },
  {
    type: 'item.completed',
    item: {
      id,
      type: 'mcp_tool_call',
      server,
      tool,
      status: error ? 'failed' : 'completed',
      result: error ? null : { content: [{ type: 'text', text: result }] },
      error: error ? { message: error } : null,
    },
  },
]
const codexDone = (text: string) => [
  {
    type: 'item.completed',
    item: { id: 'answer', type: 'agent_message', text },
  },
  {
    type: 'turn.completed',
    usage: { input_tokens: 900, cached_input_tokens: 600, output_tokens: 50 },
  },
]

describe('collecting with Codex', () => {
  it("turns on only ChatGPT's Slack app, without the tools that change or delete, and only Pacenote's task tools", () => {
    const [command, args] = collectCommand(LAUNCH, {
      cli: 'codex',
      bin: '/opt/codex',
      codex: { model: 'gpt-5.5', reasoningEffort: 'high' },
    })
    expect(command).toBe('/opt/codex')
    expect(args[0]).toBe('exec')
    expect(args).not.toContain('--disable')
    const config = args.flatMap((arg, i) => (args[i - 1] === '-c' ? [arg] : []))
    const app = 'apps.asdk_app_69a1d78e929881919bba0dbda1f6436d'
    expect(config).toEqual(
      expect.arrayContaining([
        'apps._default.enabled=false',
        `${app}.enabled=true`,
        `${app}.destructive_enabled=false`,
        'approval_policy="never"',
        `mcp_servers.pacenote.command=${JSON.stringify(LAUNCH.command)}`,
        `mcp_servers.pacenote.args=${JSON.stringify(LAUNCH.args)}`,
        'mcp_servers.pacenote.env={ELECTRON_RUN_AS_NODE="1"}',
        'mcp_servers.pacenote.default_tools_approval_mode="approve"',
        'model_reasoning_effort="high"',
      ])
    )
    const tools = config.find((item) =>
      item.startsWith('mcp_servers.pacenote.enabled_tools=')
    )
    expect(JSON.parse(tools!.split('=')[1]!)).toEqual(
      expect.arrayContaining(['collect_context', 'add_tasks', 'update_task'])
    )
    // Your config.toml stays out; its shell reads only the platform's basics.
    expect(args).toContain('--ignore-user-config')
    expect(config).toContain(
      'permissions.pacenote.filesystem={":minimal"="read"}'
    )
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5.5')
    expect(args.at(-1)).toBe('-')
  })

  it('counts Slack reads, reads what add_tasks answered, and tells a run with no Slack app', () => {
    const stream = new CollectStream(['slack'], 'codex')
    for (const line of lines(
      ...codexTool('1', 'pacenote', 'collect_context', '{}'),
      ...codexTool('2', 'codex_apps', 'slack.slack_search_public'),
      ...codexTool('3', 'codex_apps', 'slack.slack_read_thread'),
      ...codexTool(
        '4',
        'pacenote',
        'add_tasks',
        JSON.stringify({ added: [{ confidence: 'sure' }], skipped: [] })
      ),
      ...codexDone('Added one task.')
    ))
      stream.push(line)
    expect(stream.outcome('T')).toEqual({
      at: 'T',
      ok: true,
      added: 1,
      maybe: 0,
      skipped: 0,
      reads: 2,
      by: 'codex',
      usage: { input: 300, cacheRead: 600, cacheWrite: 0, output: 50 },
    })

    const noApp = new CollectStream(['slack'], 'codex')
    for (const line of lines(
      ...codexTool('1', 'pacenote', 'collect_context', '{}'),
      ...codexDone('I have no Slack tools.')
    ))
      noApp.push(line)
    expect(noApp.outcome('T')).toMatchObject({
      ok: false,
      error:
        "Codex has no Slack connector. Connect Slack in ChatGPT's Settings > Apps, then collect again.",
      unable: 'connector',
    })

    const limited = new CollectStream(['slack'], 'codex')
    for (const line of lines(
      { type: 'error', message: "You've hit your usage limit." },
      {
        type: 'turn.failed',
        error: { message: "You've hit your usage limit." },
      }
    ))
      limited.push(line)
    expect(limited.outcome('T')).toMatchObject({
      ok: false,
      error: "You've hit your usage limit.",
      unable: 'limit',
    })
  })

  it('collects with Codex when Claude Code is at its usage limit, in the same run', async () => {
    const fakeRun = (events: object[], exit = 0) =>
      [
        process.execPath,
        [
          '-e',
          `for (const line of ${JSON.stringify(lines(...events))}) console.log(line); process.exit(${exit})`,
        ],
      ] as [string, string[]]
    const now = new Date('2026-10-20T10:00:00')
    const steps: RunEvent[] = []
    const ended: { outcome: CollectOutcome; attempts?: number }[] = []
    const started: OwnCli[] = []
    const collector = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      ai: new OwnAi({
        chosen: () => 'claude',
        fallback: () => true,
        now: () => now,
      }),
      recorder: (_, cli) => {
        started.push(cli)
        return {
          event: (step) => steps.push(step),
          finish: (outcome, attempts) => ended.push({ outcome, attempts }),
        }
      },
      command: (cli) =>
        cli === 'claude'
          ? fakeRun(
              [
                init('connected'),
                {
                  type: 'result',
                  subtype: 'success',
                  is_error: true,
                  result: 'Usage limit reached · resets 3pm',
                },
              ],
              1
            )
          : fakeRun([
              ...codexTool('1', 'codex_apps', 'slack.slack_read_thread'),
              ...codexTool(
                '2',
                'pacenote',
                'add_tasks',
                JSON.stringify({ added: [{ confidence: 'sure' }] })
              ),
              ...codexDone('Added one task.'),
            ]),
      now: () => now,
    })
    const last = await collector.run()
    const until = new Date('2026-10-20T15:00:00').toISOString()
    expect(last).toMatchObject({
      ok: true,
      added: 1,
      reads: 1,
      by: 'codex',
      switched: { from: 'claude', unable: 'limit', until },
    })
    // One run, started on Claude Code, with a note where Codex took over
    expect(started).toEqual(['claude'])
    expect(ended).toEqual([{ outcome: last, attempts: 2 }])
    expect(steps).toContainEqual(
      expect.objectContaining({
        kind: 'note',
        text: expect.stringMatching(
          /^Claude Code was at its usage limit until 15:00, so Codex collected\.$/
        ),
      })
    )
    // The next one goes to Codex first while Claude Code rests.
    const next = collector.run()
    expect(collector.state.running).toMatchObject({
      by: 'codex',
      switched: { from: 'claude', unable: 'limit', until },
    })
    expect(await next).toMatchObject({ ok: true, by: 'codex' })
  })
})

describe('collecting with opencode chosen', () => {
  it('steps aside, as it reads no Slack yet, and Claude Code collects in the same run', async () => {
    const ended: { outcome: CollectOutcome; attempts?: number }[] = []
    const spawned: OwnCli[] = []
    const collector = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      ai: new OwnAi({ chosen: () => 'opencode', fallback: () => true }),
      recorder: () => ({
        event: () => undefined,
        finish: (outcome, attempts) => ended.push({ outcome, attempts }),
      }),
      command: (cli) => {
        spawned.push(cli)
        return [
          process.execPath,
          [
            '-e',
            `for (const line of ${JSON.stringify(
              lines(
                init('connected'),
                toolUse('1', 'mcp__claude_ai_Slack__slack_read_thread'),
                toolUse('2', 'mcp__pacenote__add_tasks'),
                toolResult('2', JSON.stringify({ added: [], skipped: [] })),
                result('Nothing new.')
              )
            )}) console.log(line)`,
          ],
        ]
      },
    })
    const last = await collector.run()
    expect(spawned).toEqual(['claude'])
    expect(last).toMatchObject({
      ok: true,
      by: 'claude',
      switched: { from: 'opencode', unable: 'connector' },
    })
    expect(ended).toEqual([{ outcome: last, attempts: 2 }])

    // Switching off: it says why there is nothing.
    const alone = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => '',
      cwd: process.cwd(),
      ai: new OwnAi({ chosen: () => 'opencode', fallback: () => false }),
      command: () => {
        throw new Error('nothing to spawn')
      },
    })
    expect(await alone.run()).toMatchObject({
      ok: false,
      error: 'opencode reads no Slack in Pacenote yet.',
      unable: 'connector',
      by: 'opencode',
    })
  })
})
