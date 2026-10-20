import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { judge } from '../apps/desktop/src/done-watch.js'
import { draftFrom } from '../apps/desktop/src/drafter.js'
import { outputOf, plainCommand } from '../apps/desktop/src/headless.js'
import { writeRecap } from '../apps/desktop/src/recap-writer.js'

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
