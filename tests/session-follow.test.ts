import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  readSessionTalk,
  SessionTalkFollower,
} from '../apps/desktop/src/handoff.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-follow-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const user = (text: string) =>
  `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`
const says = (text: string) =>
  `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`

describe("a session's log, followed as it grows", () => {
  it('reads only what was written since, and shows what a whole read does', () => {
    const file = path.join(root, 'a.jsonl')
    writeFileSync(file, user('Raise the limit') + says('Done: it is 5 now'))
    const follower = new SessionTalkFollower(file, 'claude')
    expect(follower.read().items.map((item) => item.text)).toEqual([
      'Raise the limit',
      'Done: it is 5 now',
    ])
    // Not changed: the same answer, not read again
    expect(follower.read()).toBe(follower.read())
    // A line still being written waits for its end
    const next = user('한글도 잘리지 않아요 ✓')
    appendFileSync(file, next.slice(0, 40))
    expect(follower.read().items).toHaveLength(2)
    appendFileSync(file, next.slice(40) + says('네'))
    const read = follower.read()
    expect(read.items.map((item) => item.text)).toEqual([
      'Raise the limit',
      'Done: it is 5 now',
      '한글도 잘리지 않아요 ✓',
      '네',
    ])
    expect(read).toEqual(readSessionTalk(file, 'claude'))
  })

  it('reads a log that was replaced by a shorter one from its start', () => {
    const file = path.join(root, 'b.jsonl')
    writeFileSync(file, user('One') + says('Two') + user('Three'))
    const follower = new SessionTalkFollower(file, 'claude')
    expect(follower.read().items).toHaveLength(3)
    writeFileSync(file, user('Again'))
    expect(follower.read().items.map((item) => item.text)).toEqual(['Again'])
  })

  it('reads a last line with no newline when the log is read whole', () => {
    const file = path.join(root, 'c.jsonl')
    writeFileSync(file, user('One') + says('Two').trimEnd())
    expect(readSessionTalk(file, 'claude').items).toHaveLength(2)
  })
})
