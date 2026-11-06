import { describe, expect, it } from 'vitest'
import {
  attachmentsLog,
  CONTEXT_MESSAGES,
  contextLines,
  fileCandidates,
  recent,
} from '../src/mention/conversation.js'
import type { ContextMessage, MessageFile } from '../src/messengers/types.js'

const AT = Date.parse('2026-10-11T03:04:00Z')
const file = (name: string): MessageFile => ({ name })
const message = (
  i: number,
  extra: Partial<ContextMessage> = {}
): ContextMessage => ({
  id: `m${i}`,
  at: AT + i * 60_000,
  author: '@bob',
  text: `message ${i}`,
  files: [],
  ...extra,
})

describe('the conversation a mention is answered in', () => {
  it('passes a short conversation whole, and of a long one the first message and the latest', () => {
    const short = [message(0), message(1)]
    expect(recent(short)).toEqual({ context: short, left: 0 })
    expect(recent(short).context).not.toBe(short)

    const long = Array.from({ length: CONTEXT_MESSAGES + 5 }, (_, i) =>
      message(i)
    )
    const { context, left } = recent(long)
    expect(left).toBe(5)
    expect(context).toHaveLength(CONTEXT_MESSAGES)
    expect(context[0]!.id).toBe('m0')
    expect(context[1]!.id).toBe('m6')
    expect(context.at(-1)!.id).toBe(`m${CONTEXT_MESSAGES + 4}`)
  })

  it('gives each message a line with its time, author, text and attachments, and says how many are left out', () => {
    const lines = contextLines(
      [
        message(0, { files: [file('a.png'), file('b.log')] }),
        message(1, { author: '@pace (bot)', text: 'x'.repeat(2_000) }),
      ],
      1,
      'UTC'
    )
    expect(lines).toEqual([
      '10/11, 03:04 @bob: message 0 [attachments: a.png, b.log]',
      '(1 message left out here)',
      `10/11, 03:05 @pace (bot): ${'x'.repeat(1_497)}...`,
    ])
    expect(contextLines([message(0), message(1)], 2, 'UTC')[1]).toBe(
      '(2 messages left out here)'
    )
    expect(contextLines([message(0)], 0, 'Asia/Seoul')).toEqual([
      '10/11, 12:04 @bob: message 0',
    ])
  })

  it("puts the request message's attachments first, then the thread's from the latest", () => {
    const candidates = fileCandidates(
      [file('asked.pdf')],
      [
        message(0, { files: [file('first.png')] }),
        message(1),
        message(2, { author: '@mina', files: [file('a.txt'), file('b.txt')] }),
      ],
      'UTC'
    )
    expect(
      candidates.map(({ file, source }) => `${file.name} (${source})`)
    ).toEqual([
      'asked.pdf (request message)',
      'a.txt (thread 10/11, 03:06 @mina)',
      'b.txt (thread 10/11, 03:06 @mina)',
      'first.png (thread 10/11, 03:04 @bob)',
    ])
  })

  it('logs how many attachments of each kind there were, and why some could not be read', () => {
    expect(attachmentsLog(1, 1, 0, [])).toBe(
      '1 attachment: images 1, files 0, unreadable 0'
    )
    expect(
      attachmentsLog(3, 0, 1, [
        { name: 'big.zip', reason: 'Unsupported type' },
        { name: 'scan.pdf', reason: 'No text found' },
      ])
    ).toBe(
      '3 attachments: images 0, files 1, unreadable 2 (big.zip: Unsupported type; scan.pdf: No text found)'
    )
  })
})
