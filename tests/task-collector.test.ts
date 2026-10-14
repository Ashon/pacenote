import { describe, expect, it } from 'vitest'
import {
  collectCommand,
  CollectStream,
  TaskCollector,
} from '../apps/desktop/src/task-collector.js'
import type { RunEvent } from '../src/history/types.js'
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
    const args = collectCommand(LAUNCH, [])[1]
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
      error: expect.stringMatching(/^Claude Code is not signed in/),
    })

    const failed = new CollectStream()
    for (const line of lines(
      init('connected'),
      result('API Error: 529 Overloaded\nmore', false)
    ))
      failed.push(line)
    expect(failed.outcome('T')).toMatchObject({
      error: 'API Error: 529 Overloaded',
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
      command: fake([
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
      running: { startedAt: '2026-10-11T05:00:00.000Z', reads: 1 },
    })
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
  })

  it('stops a collection, and tells when claude is missing or too slow', async () => {
    const slow = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      command: fake([init()], 'setInterval(() => {}, 1000)'),
    })
    const stopped = slow.run()
    setTimeout(() => slow.cancel(), 200)
    expect(await stopped).toMatchObject({ ok: false, error: 'Stopped.' })

    const missing = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => '/nonexistent',
      cwd: process.cwd(),
      command: ['claude-not-here', []],
    })
    expect(await missing.run()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/claude is not on this Mac/),
    })

    const timedOut = new TaskCollector({
      launch: () => LAUNCH,
      toolPath: () => process.env.PATH ?? '',
      cwd: process.cwd(),
      command: fake([init()], 'setInterval(() => {}, 1000)'),
      timeoutMs: 200,
    })
    expect(await timedOut.run()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/did not finish/),
    })
  })
})
