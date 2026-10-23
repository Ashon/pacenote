import { describe, expect, it } from 'vitest'
import type { Session } from '../apps/desktop/src/handoff.js'
import { OpencodeSessions } from '../apps/desktop/src/opencode-sessions.js'

const NOW = Date.parse('2026-10-24T09:00:00Z')

const entry: Session = {
  kind: 'session',
  id: 'e1',
  task: 't1',
  tool: 'opencode',
  cwd: '/w/payments',
  startedAt: new Date(NOW - 5 * 60_000).toISOString(),
}

/**
 * An opencode CLI with sessions: session list in a folder, and session export
 * as opencode 2 writes them (the first message is the user's)
 */
function fakeOpencode(
  sessions: Record<string, { created: number; first: string }>
) {
  const asked: string[] = []
  const run = async (args: string[], cwd: string) => {
    asked.push(`${cwd}: ${args.join(' ')}`)
    if (args[0] === 'session' && args[1] === 'list')
      return {
        code: 0,
        stdout: JSON.stringify(
          Object.entries(sessions).map(([id, s]) => ({
            id,
            created: s.created,
            updated: s.created + 60_000,
            directory: cwd,
          }))
        ),
      }
    if (args[0] === 'session' && args[1] === 'export') {
      const session = sessions[args[2]!]
      if (!session) return { code: 1, stdout: '' }
      return {
        code: 0,
        stdout: JSON.stringify({
          info: { id: args[2] },
          messages: [
            {
              type: 'user',
              text: session.first,
              time: { created: session.created },
            },
            {
              type: 'assistant',
              time: { created: session.created + 1000 },
              content: [
                { type: 'reasoning', text: 'thinking' },
                { type: 'text', text: 'Reading the retry code.' },
                {
                  type: 'tool',
                  name: 'read',
                  state: { input: { path: '/w/payments/retry.ts' } },
                },
                {
                  type: 'text',
                  text: 'Token xoxb-1234567890-abcdefghij is not needed.',
                },
              ],
            },
          ],
        }),
      }
    }
    return { code: 1, stdout: '' }
  }
  return { run, asked }
}

describe('opencode sessions', () => {
  it('finds the session Pacenote opened by the marker in its first message', async () => {
    const { run } = fakeOpencode({
      // Before the entry started: not it
      ses_old: { created: NOW - 60 * 60_000, first: '[pacenote-task:e1] old' },
      ses_other: { created: NOW - 2 * 60_000, first: 'something else' },
      ses_ours: { created: NOW - 4 * 60_000, first: 'Task [pacenote-task:e1]' },
    })
    const sessions = new OpencodeSessions({
      bin: () => 'opencode',
      env: () => ({}),
      run,
      now: () => NOW,
    })
    const found: string[] = []
    await sessions.refreshSoon([entry], (_, session) => found.push(session))
    expect(found).toEqual(['ses_ours'])
    // When it last wrote, from the same look
    expect(sessions.activeAt('ses_ours')).toBe(
      new Date(NOW - 3 * 60_000).toISOString()
    )
    // Asked again only after a while
    await sessions.refreshSoon([entry], () => {
      throw new Error('looked again at once')
    })
  })

  it('knows when a found session last wrote, and reads it as turns and steps', async () => {
    const { run, asked } = fakeOpencode({
      ses_ours: { created: NOW - 4 * 60_000, first: 'Task [pacenote-task:e1]' },
    })
    const sessions = new OpencodeSessions({
      bin: () => 'opencode',
      env: () => ({}),
      run,
      now: () => NOW,
    })
    const ours = { ...entry, session: 'ses_ours' }
    await sessions.refreshSoon([ours], () => undefined)
    expect(sessions.activeAt('ses_ours')).toBe(
      new Date(NOW - 3 * 60_000).toISOString()
    )
    expect(asked).toEqual(['/w/payments: session list --format json -n 20'])
    const log = await sessions.log(ours)
    expect(log?.map((item) => [item.role, item.text])).toEqual([
      ['user', 'Task [pacenote-task:e1]'],
      ['tool', '/w/payments/retry.ts'],
      [
        'assistant',
        'Reading the retry code.\nToken [REDACTED SLACK TOKEN] is not needed.',
      ],
    ])
    // A session opencode does not have, or an id it would not take
    expect(
      await sessions.log({ ...entry, session: 'ses_gone' })
    ).toBeUndefined()
    expect(await sessions.log({ ...entry, session: '../x' })).toBeUndefined()
  })
})
