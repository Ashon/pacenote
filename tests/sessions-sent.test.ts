import { describe, expect, it } from 'vitest'
import { notLogged, QUEUED_CHARS } from '../src/sessions/sent.js'
import type { SessionItem } from '../src/tasks/types.js'

const you = (text: string, at?: string): SessionItem => ({
  role: 'user',
  text,
  ...(at ? { at } : {}),
})

describe('notLogged: what you sent that its log does not have yet', () => {
  it('lets go of what its log has before Claude Code tells it back', () => {
    // A first turn: logged at .394, told back two seconds after it was sent
    const sent = [{ text: 'Reply with hi', at: '2026-11-27T01:29:35.670Z' }]
    expect(notLogged(sent, [])).toEqual(sent)
    expect(
      notLogged(sent, [you('Reply with hi', '2026-11-27T01:29:36.394Z')])
    ).toEqual([])
  })

  it('keeps what its log has only from before it was sent', () => {
    const sent = [{ text: 'go on', at: '2026-11-27T10:00:00.000Z' }]
    const items = [
      you('go on', '2026-11-27T09:50:00.000Z'),
      { role: 'assistant' as const, text: 'Done.' },
    ]
    expect(notLogged(sent, items)).toEqual(sent)
  })

  it('waits for each of the same words sent twice', () => {
    const first = { text: 'go on', at: '2026-11-27T10:00:00.000Z' }
    const second = { text: 'go on', at: '2026-11-27T10:00:05.000Z' }
    // Both sent during a turn: the first logged after the second was sent
    expect(
      notLogged([first, second], [you('go on', '2026-11-27T10:00:09.000Z')])
    ).toEqual([second])
    expect(
      notLogged(
        [first, second],
        [
          you('go on', '2026-11-27T10:00:09.000Z'),
          you('go on', '2026-11-27T10:00:20.000Z'),
        ]
      )
    ).toEqual([])
  })

  it('takes a long one, kept cut, as the start of its turn', () => {
    const whole = `${'a'.repeat(QUEUED_CHARS)}\n\nLook at the tests first.`
    const sent = [
      { text: whole.slice(0, QUEUED_CHARS), at: '2026-11-27T10:00:00.000Z' },
    ]
    expect(notLogged(sent, [you(whole, '2026-11-27T10:00:01.000Z')])).toEqual(
      []
    )
    // A short one is not the start of a longer turn
    expect(
      notLogged(
        [{ text: 'fix', at: '2026-11-27T10:00:00.000Z' }],
        [you('fix the retry', '2026-11-27T10:00:01.000Z')]
      )
    ).toHaveLength(1)
  })

  it('matches a turn without its time only as the last of yours', () => {
    const sent = [{ text: 'go on', at: '2026-11-27T10:00:00.000Z' }]
    expect(notLogged(sent, [you('go on'), you('and test it')])).toEqual(sent)
    expect(notLogged(sent, [you('and test it'), you('  go on ')])).toEqual([])
  })
})
