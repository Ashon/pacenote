import type { WebClient } from '@slack/web-api'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../src/logger.js'
import { ConcurrencyLimiter } from '../src/mention/limiter.js'
import { systemPrompt, userPrompt } from '../src/mention/prompt.js'
import { isOwner } from '../src/mention/responder.js'
import type { Directory } from '../src/messengers/slack/directory.js'
import { stripBotMention } from '../src/messengers/slack/format.js'
import { SlackMessenger } from '../src/messengers/slack/messenger.js'
import type { Mention, MessengerProfile } from '../src/messengers/types.js'

const slack: MessengerProfile = {
  name: 'Slack',
  venues: 'public channels',
  markup: 'Slack mrkdwn',
  public: true,
}

describe('stripBotMention', () => {
  it('removes only the bot mention and keeps other mentions', () => {
    expect(
      stripBotMention("<@UBOT> what is the review status of <@U1>'s PR", 'UBOT')
    ).toBe("what is the review status of <@U1>'s PR")
    expect(stripBotMention('<@UBOT|agent>  ', 'UBOT')).toBe('')
  })
})

describe('isOwner', () => {
  it('answers only the owner, and no one while the owner is not known', () => {
    expect(isOwner({ userId: 'U1' }, 'U1')).toBe(true)
    expect(isOwner({ userId: 'U2' }, 'U1')).toBe(false)
    // Not known (a hub desktop before the hub names its member): no one, not
    // everyone.
    expect(isOwner({ userId: 'U1' }, undefined)).toBe(false)
    expect(isOwner({ userId: '' }, '')).toBe(false)
  })
})

describe('SlackMessenger.mention', () => {
  const event = {
    type: 'app_mention',
    user: 'U9',
    text: '<@UBOT> hi',
    ts: '1.0',
    channel: 'C1',
    event_ts: '1.0',
  } as const

  it('marks a mention from another organization in a shared channel', () => {
    expect(
      SlackMessenger.mention({ ...event, user_team: 'T2' }, 'T1')?.external
    ).toBe(true)
    expect(
      SlackMessenger.mention({ ...event, user_team: 'T1' }, 'T1')?.external
    ).toBeUndefined()
    // Without the teams to compare, nobody is taken for an outsider.
    expect(SlackMessenger.mention(event, 'T1')?.external).toBeUndefined()
    expect(
      SlackMessenger.mention({ ...event, user_team: 'T2' })?.external
    ).toBeUndefined()
  })
})

describe('SlackMessenger.context', () => {
  /** n replies under their parent, which Slack pages from the oldest */
  function thread(n: number) {
    const messages = Array.from({ length: n + 1 }, (_, i) => ({
      ts: `${1000 + i}.000000`,
      user: 'U1',
      text: i === 0 ? 'the parent' : `reply ${i}`,
    }))
    const calls: { cursor?: string; limit?: number }[] = []
    const client = {
      conversations: {
        replies: async (args: { cursor?: string; limit?: number }) => {
          calls.push(args)
          const start = Number(args.cursor ?? 0)
          const end = start + (args.limit ?? 1000)
          return {
            messages: messages.slice(start, end),
            has_more: end < messages.length,
            response_metadata: {
              next_cursor: end < messages.length ? String(end) : '',
            },
          }
        },
      },
    } as unknown as WebClient
    const directory = {
      userNames: async () => new Map([['U1', 'alice']]),
    } as unknown as Directory
    return {
      calls,
      messenger: new SlackMessenger({
        client,
        directory,
        botUserId: 'UBOT',
        files: { token: 'xoxb-1' },
        owner: () => 'U1',
        log: createLogger('error'),
      }),
    }
  }
  const mention = (n: number): Mention => ({
    messenger: 'slack',
    conversation: 'C1',
    message: `${1000 + n + 1}.000000`,
    thread: '1000.000000',
    inThread: true,
    userId: 'U1',
    text: '<@UBOT> sum it up',
    files: [],
  })

  it('reads a long thread to its end, so the latest replies are there', async () => {
    const { messenger, calls } = thread(450)
    const context = await messenger.context(mention(450), [])
    expect(context[0]?.text).toBe('the parent')
    expect(context.at(-1)?.text).toBe('reply 450')
    expect(context).toHaveLength(451)
    expect(calls.length).toBeGreaterThan(1)
  })
})

describe('SlackMessenger.resolveFiles', () => {
  it('looks up the first ten summaries at once and keeps the order', async () => {
    const asked: string[] = []
    let open = 0
    let most = 0
    const client = {
      files: {
        info: async ({ file }: { file: string }) => {
          asked.push(file)
          open += 1
          most = Math.max(most, open)
          // The earlier files answer last.
          await new Promise((resolve) => setTimeout(resolve, 30 - asked.length))
          open -= 1
          if (file === 'F2') throw new Error('file_not_found')
          return {
            file: {
              id: file,
              mimetype: 'text/plain',
              url_private_download: `https://files.slack.com/${file}`,
            },
          }
        },
      },
    } as unknown as WebClient
    const messenger = new SlackMessenger({
      client,
      directory: {} as Directory,
      botUserId: 'UBOT',
      files: { token: 'xoxb-1' },
      owner: () => 'U1',
      log: createLogger('error'),
    })
    const files = [
      { id: 'F0', name: 'whole.txt', handle: 'https://files.slack.com/F0' },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `F${i + 1}`,
        name: `f${i + 1}.txt`,
        partial: true as const,
      })),
    ]
    const resolved = await messenger.resolveFiles(files)
    expect(asked).toEqual(Array.from({ length: 10 }, (_, i) => `F${i + 1}`))
    expect(most).toBe(10)
    expect(resolved.map((file) => file.name)).toEqual(
      files.map((file) => file.name)
    )
    expect(resolved[0]).toBe(files[0])
    expect(resolved[1]?.handle).toBe('https://files.slack.com/F1')
    // A failed lookup and those past the limit stay summaries.
    expect(resolved[2]?.handle).toBeUndefined()
    expect(resolved[2]?.unreadable).toBeDefined()
    expect(resolved[10]?.handle).toBe('https://files.slack.com/F10')
    expect(resolved[11]?.unreadable).toBeDefined()
    expect(resolved[12]?.unreadable).toBeDefined()
  })
})

describe('systemPrompt', () => {
  it('adds file lookup instructions only when there is a reference directory', () => {
    expect(systemPrompt(slack)).not.toContain('working directory')
    expect(systemPrompt(slack, { canReadWorkspace: true })).toContain(
      'working directory'
    )
    expect(systemPrompt(slack)).toContain(
      '<thread> is conversation context for reference'
    )
    expect(systemPrompt(slack)).toContain(
      'Reply in the language the request is written in.'
    )
  })

  it("answers in the request's language, else in the language of the person Pace works for", () => {
    expect(systemPrompt(slack, { language: 'ko' })).toContain(
      'reply in Korean, the language of the person you work for'
    )
    expect(systemPrompt(slack, { language: 'en' })).toContain(
      'reply in English, the language of the person you work for'
    )
  })

  it('describes the messenger the mention came from', () => {
    expect(systemPrompt(slack)).toContain(
      'You are Pace, a work assistant that answers mentions in Slack public channels.'
    )
    expect(systemPrompt(slack)).toContain('Use Slack mrkdwn')
    expect(systemPrompt(slack)).toContain('do not put secrets')
    expect(systemPrompt({ ...slack, public: false })).not.toContain(
      'do not put secrets'
    )
  })
})

describe('userPrompt', () => {
  it('puts the conversation, then the request, then the attachments', () => {
    expect(
      userPrompt({
        venue: '#ops',
        context: ['10/08, 14:20 @bob: Could someone check?'],
        author: '@alice',
        request: 'check web-01',
        attachments: ['', '<attachments>', '</attachments>'],
      })
    ).toBe(
      [
        '<thread venue="#ops">',
        '10/08, 14:20 @bob: Could someone check?',
        '</thread>',
        '',
        '<request from="@alice">',
        'check web-01',
        '</request>',
        '',
        '<attachments>',
        '</attachments>',
      ].join('\n')
    )
  })
})

describe('ConcurrencyLimiter', () => {
  it('enforces the concurrency and queue limits', async () => {
    const limiter = new ConcurrencyLimiter(1, 1)
    const releases: (() => void)[] = []
    let running = 0
    let maxRunning = 0
    const task = () =>
      new Promise<void>((resolve) => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        releases.push(() => {
          running -= 1
          resolve()
        })
      })

    expect(limiter.tryRun(task)).toBe(true) // runs
    expect(limiter.tryRun(task)).toBe(true) // queued
    expect(limiter.tryRun(task)).toBe(false) // full
    expect(releases).toHaveLength(1)

    releases.shift()!()
    await new Promise((r) => setTimeout(r, 0))
    expect(releases).toHaveLength(1) // the queued task starts
    releases.shift()!()
    await new Promise((r) => setTimeout(r, 0))
    expect(maxRunning).toBe(1)
  })

  it('tells whether a task would wait or be turned away, and drops the queue', async () => {
    const limiter = new ConcurrencyLimiter(1, 1)
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    let started = 0
    const task = async () => {
      started += 1
      await held
    }
    expect([limiter.saturated, limiter.full]).toEqual([false, false])
    limiter.tryRun(task)
    expect([limiter.saturated, limiter.full]).toEqual([true, false])
    limiter.tryRun(task)
    expect([limiter.saturated, limiter.full]).toEqual([true, true])

    limiter.clear()
    release()
    await new Promise((r) => setTimeout(r, 0))
    // The queued task never starts.
    expect(started).toBe(1)
    expect(limiter.busy).toBe(false)
  })
})
