import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { judge } from '../apps/desktop/src/done-watch.js'
import { draftFrom, draftReply } from '../apps/desktop/src/drafter.js'
import {
  opencodeConfig,
  outputOf,
  plainCommand,
  plainInvocation,
  writeOpencodeConfig,
} from '../apps/desktop/src/headless.js'
import { writeRecap } from '../apps/desktop/src/recap-writer.js'
import { checkOpencode } from '../src/reasoners/host-check.js'
import type { TaskContext, TaskView } from '../src/tasks/types.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-headless-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const lines = (...events: object[]) =>
  events.map((event) => JSON.stringify(event)).join('\n')

/** A stand-in CLI that prints these lines and exits so */
function fakeCli(name: string, out: string, exit = 0): string {
  const bin = path.join(root, name)
  writeFileSync(
    bin,
    `#!/bin/sh\ncat > /dev/null\ncat <<'EOF'\n${out}\nEOF\nexit ${exit}\n`
  )
  chmodSync(bin, 0o755)
  return bin
}

const codexSaid = (text: string) =>
  lines(
    { type: 'thread.started', thread_id: 't' },
    { type: 'item.completed', item: { type: 'agent_message', text } },
    {
      type: 'turn.completed',
      usage: { input_tokens: 120, cached_input_tokens: 80, output_tokens: 20 },
    }
  )

describe("Pacenote's own work, headless", () => {
  it('runs codex with no apps, no MCP servers and a shell that reads nothing of yours', () => {
    const [bin, args] = plainCommand('codex', '/opt/codex', {
      model: 'gpt-5.5',
    })
    expect(bin).toBe('/opt/codex')
    expect(args.slice(0, 1)).toEqual(['exec'])
    expect(args).toEqual(
      expect.arrayContaining([
        '--ephemeral',
        '--ignore-user-config',
        '--disable',
        'apps',
        'permissions.pacenote.filesystem={":minimal"="read"}',
        'approval_policy="never"',
      ])
    )
    expect(args.join(' ')).not.toMatch(/mcp_servers/)
    expect(args.at(-1)).toBe('-')
  })

  it("reads the answer and the tokens out of either CLI's output", () => {
    expect(
      outputOf(
        'claude',
        JSON.stringify({
          type: 'result',
          result: ' Done. ',
          usage: { input_tokens: 5, output_tokens: 2 },
        })
      )
    ).toEqual({
      text: 'Done.',
      usage: { input: 5, cacheRead: 0, cacheWrite: 0, output: 2 },
    })
    expect(
      outputOf(
        'claude',
        lines(
          { type: 'system' },
          { type: 'result', is_error: true, result: 'Usage limit reached' }
        )
      )
    ).toEqual({ error: 'Usage limit reached' })
    expect(outputOf('codex', codexSaid('Done.'))).toEqual({
      text: 'Done.',
      usage: { input: 40, cacheRead: 80, cacheWrite: 0, output: 20 },
    })
    expect(
      outputOf(
        'codex',
        lines({
          type: 'turn.failed',
          error: { message: 'usage_limit_reached' },
        })
      )
    ).toEqual({ error: 'usage_limit_reached' })
    expect(outputOf('codex', '')).toBeUndefined()
  })

  it('judges, writes a recap up and drafts a reply with Codex', async () => {
    const codex = fakeCli(
      'codex-judge',
      codexSaid('{"done": true, "summary": "Merged."}')
    )
    expect(
      await judge({
        cli: 'codex',
        bin: codex,
        toolPath: process.env.PATH ?? '',
        cwd: root,
        prompt: 'Decide.',
      })
    ).toEqual({ done: true, summary: 'Merged.', left: undefined })

    const writer = fakeCli(
      'codex-recap',
      codexSaid('## Week\nYou **fixed** it.')
    )
    expect(
      await writeRecap({
        cli: 'codex',
        bin: writer,
        toolPath: process.env.PATH ?? '',
        cwd: root,
        prompt: 'Sum it up.',
      })
    ).toMatchObject({ text: 'You fixed it.', usage: { output: 20 } })

    expect(draftFrom('codex', codexSaid('Hi mina, done.'))).toEqual({
      text: 'Hi mina, done.',
    })
  })

  it('says when a CLI could not work, so the other one may', async () => {
    const limited = fakeCli(
      'claude-limited',
      JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'Usage limit reached · resets 3pm',
      }),
      1
    )
    expect(
      await judge({
        cli: 'claude',
        bin: limited,
        toolPath: process.env.PATH ?? '',
        cwd: root,
        prompt: 'Decide.',
      })
    ).toEqual({ error: 'Usage limit reached · resets 3pm', unable: 'limit' })
    expect(
      await writeRecap({
        cli: 'codex',
        bin: path.join(root, 'no-codex'),
        toolPath: '',
        cwd: root,
        prompt: 'Sum it up.',
      })
    ).toEqual({
      error: 'Codex is not on this Mac (codex executable not found).',
      unable: 'missing',
    })
    expect(
      draftFrom(
        'codex',
        lines({ type: 'turn.failed', error: { message: '401 Unauthorized' } })
      )
    ).toEqual({
      error:
        'Codex is not signed in. Run codex login in a terminal, then draft again.',
      unable: 'auth',
    })
  })
})

/** opencode run --format json (opencode 2.0.32): steps, text, tokens */
const opencodeSaid = (text: string, session = 'ses_1') =>
  lines(
    { type: 'step_start', sessionID: session, part: { type: 'step-start' } },
    {
      type: 'step_finish',
      sessionID: session,
      part: {
        type: 'step-finish',
        tokens: {
          input: 5601,
          output: 38,
          reasoning: 207,
          cache: { read: 100, write: 0 },
        },
      },
    },
    { type: 'step_start', sessionID: session, part: { type: 'step-start' } },
    { type: 'text', sessionID: session, part: { type: 'text', text } }
  )

describe("Pacenote's own work on opencode", () => {
  it('runs opencode on a private server, with an agent that has no tools and may do nothing', () => {
    const config = opencodeConfig() as {
      agent: Record<
        string,
        { tools: Record<string, boolean>; permission: Record<string, string> }
      >
    }
    const agent = config.agent['pacenote-plain']!
    expect(agent.tools).toEqual({ '*': false })
    expect(Object.values(agent.permission).every((p) => p === 'deny')).toBe(
      true
    )
    expect(Object.keys(agent.permission)).toEqual(
      expect.arrayContaining(['bash', 'edit', 'read', 'webfetch'])
    )
    const file = writeOpencodeConfig(root)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(config)

    const run = plainInvocation('opencode', '/opt/opencode', 'Decide.', {
      opencode: {
        config: file,
        model: 'dgx-lb/qwen3.8-flash-next',
        cwd: root,
        title: 'Pacenote: looks done',
      },
    })
    expect(run.command).toEqual([
      '/opt/opencode',
      [
        'run',
        '--standalone',
        '--format',
        'json',
        '--agent',
        'pacenote-plain',
        '--title',
        'Pacenote: looks done',
        '-m',
        'dgx-lb/qwen3.8-flash-next',
        'Decide.',
      ],
    ])
    // Its stdin closes at once; it works where PWD says.
    expect(run.input).toBe('')
    expect(run.env).toEqual({ OPENCODE_CONFIG: file, PWD: root })
  })

  it("reads opencode's last text, its tokens, and its error", () => {
    expect(outputOf('opencode', opencodeSaid(' {"done": true} '))).toEqual({
      text: '{"done": true}',
      usage: { input: 5601, cacheRead: 100, cacheWrite: 0, output: 245 },
    })
    expect(
      outputOf(
        'opencode',
        lines({
          type: 'error',
          error: {
            type: 'provider.transport',
            message:
              'ConnectionRefused: Unable to connect. Is the computer able to access the url?',
          },
        })
      )
    ).toEqual({
      error:
        'ConnectionRefused: Unable to connect. Is the computer able to access the url?',
    })
  })

  it('judges and writes a recap up with opencode, then takes its session out of its history', async () => {
    const calls = path.join(root, 'opencode-calls.log')
    const bin = path.join(root, 'opencode')
    writeFileSync(
      bin,
      `#!/bin/sh\necho "$PWD $OPENCODE_CONFIG $*" >> "${calls}"\nif [ "$1" = session ]; then exit 0; fi\ncat <<'EOF'\n${opencodeSaid('{"done": false, "summary": "Still open."}', 'ses_judge')}\nEOF\n`
    )
    chmodSync(bin, 0o755)
    const config = writeOpencodeConfig(root)
    expect(
      await judge({
        cli: 'opencode',
        bin,
        opencode: { config },
        toolPath: process.env.PATH ?? '',
        cwd: root,
        prompt: 'Decide.',
      })
    ).toEqual({ done: false, summary: 'Still open.', left: undefined })
    expect(
      await writeRecap({
        cli: 'opencode',
        bin,
        opencode: { config, model: 'dgx-lb/qwen3.8-flash-next' },
        toolPath: process.env.PATH ?? '',
        cwd: root,
        prompt: 'Sum it up.',
      })
    ).toMatchObject({ text: '{"done": false, "summary": "Still open."}' })
    // The deletes run on their own: wait for them.
    for (let i = 0; i < 50; i++) {
      if (readFileSync(calls, 'utf8').split('\n').filter(Boolean).length >= 4)
        break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const log = readFileSync(calls, 'utf8').trim().split('\n')
    expect(log[0]).toBe(
      `${root} ${config} run --standalone --format json --agent pacenote-plain --title Pacenote: looks done Decide.`
    )
    expect(log).toContain(
      `${root} ${config} session delete --standalone ses_judge`
    )
    expect(
      log.some((line) => line.includes('-m dgx-lb/qwen3.8-flash-next'))
    ).toBe(true)
  })

  it('steps aside from a draft, which needs Slack, and says it is on this Mac or not', async () => {
    expect(
      await draftReply({
        cli: 'opencode',
        bin: 'opencode',
        launch: { command: 'node', args: [], env: {} },
        toolPath: '',
        cwd: root,
        task: {} as TaskView,
        context: {} as TaskContext,
      })
    ).toEqual({
      error: 'opencode reads no Slack in Pacenote yet.',
      unable: 'connector',
    })
    expect(
      await checkOpencode(async () => ({
        stdout: 'opencode v2.0.32\n',
        stderr: '',
      }))
    ).toEqual({ installed: true, signedIn: true })
    expect(
      await checkOpencode(async () => ({
        stdout: 'opencode v1.9.0',
        stderr: '',
      }))
    ).toEqual({ installed: true, signedIn: true, tooOld: true })
    expect(
      await checkOpencode(async () => {
        throw new Error('opencode executable not found')
      })
    ).toEqual({ installed: false, signedIn: false })
  })
})
