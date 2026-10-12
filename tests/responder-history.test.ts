import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AppMentionEvent } from '@slack/types'
import type { WebClient } from '@slack/web-api'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import { HistoryReader } from '../src/history/reader.js'
import { HistoryStore } from '../src/history/recorder.js'
import type { RunRecord } from '../src/history/types.js'
import { createLogger } from '../src/logger.js'
import { InflightStore } from '../src/mention/inflight.js'
import { MentionResponder } from '../src/mention/responder.js'
import type { Directory } from '../src/messengers/slack/directory.js'
import { SlackMessenger } from '../src/messengers/slack/messenger.js'
import {
  mentionKey,
  type Mark,
  type Mention,
  type Messenger,
  type Upload,
} from '../src/messengers/types.js'
import type { Reasoner, ReasonRequest } from '../src/reasoners/types.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-responder-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function setup(complete: (request: ReasonRequest) => Promise<string>) {
  const posts: string[] = []
  const reactions: string[] = []
  const client = {
    chat: {
      postMessage: async ({ text }: { text: string }) => {
        posts.push(text)
        return { ok: true, ts: '1791453237.582449' }
      },
      update: async () => ({ ok: true }),
      postEphemeral: async () => ({ ok: true }),
    },
    reactions: {
      add: async ({ name }: { name: string }) => {
        reactions.push(`+${name}`)
        return { ok: true }
      },
      remove: async ({ name }: { name: string }) => {
        reactions.push(`-${name}`)
        return { ok: true }
      },
    },
    conversations: {
      replies: async () => ({
        messages: [
          {
            ts: '1791443475.275049',
            user: 'U0BOSS',
            text: 'web-01 is NotReady, apparently',
          },
          {
            ts: '1791443480.000100',
            user: 'U0BOB',
            text: 'Could someone check?',
          },
        ],
      }),
      history: async () => ({ messages: [] }),
    },
    files: {
      info: async () => ({ ok: true }),
      uploadV2: async () => ({ ok: true }),
    },
  } as unknown as WebClient
  const directory = {
    channel: async () => ({ id: 'C0OPS', label: '#ops', isPublic: true }),
    userNames: async () =>
      new Map([
        ['U0BOSS', 'alice'],
        ['U0BOB', 'bob'],
      ]),
  } as unknown as Directory
  const reasoner: Reasoner = {
    backend: 'codex',
    sandbox: 'docker',
    canReadFiles: false,
    mcpServerNames: ['ops'],
    complete,
  }
  const history = new HistoryStore(path.join(root, 'history'))
  const log = createLogger('error')
  const messenger = new SlackMessenger({
    client,
    directory,
    botUserId: 'U0PACE',
    workspaceUrl: 'https://example.slack.com/',
    files: { token: 'xoxb-1' },
    allowedUsers: [],
    log,
  })
  const responder = new MentionResponder({
    config: loadConfig({
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_APP_TOKEN: 'xapp-1',
      MENTION_ANYONE: 'on',
    }),
    messengers: [messenger],
    reasoner,
    log,
    extractPdfText: async () => '',
    inflight: new InflightStore(path.join(root, 'inflight.json')),
    history,
  })
  return {
    responder,
    posts,
    reactions,
    reader: new HistoryReader(history.root),
  }
}

const mention = (ts: string): Mention =>
  SlackMessenger.mention({
    type: 'app_mention',
    channel: 'C0OPS',
    ts,
    thread_ts: '1791443475.275049',
    user: 'U0BOSS',
    text: '<@U0PACE> check the status of web-01',
    event_ts: ts,
  } as AppMentionEvent)!

describe('mention run history', () => {
  it('records the request, context, prompt, tool steps, and answer, and marks the run succeeded', async () => {
    const { responder, posts, reactions, reader } = setup(async (request) => {
      request.onEvent?.({
        kind: 'tool',
        id: 'item_1',
        at: new Date().toISOString(),
        server: 'ops',
        tool: 'host_check',
        arguments: { host: 'web-01' },
        status: 'running',
      })
      request.onEvent?.({
        kind: 'tool',
        id: 'item_1',
        at: new Date().toISOString(),
        server: 'ops',
        tool: 'host_check',
        status: 'completed',
        result: 'up 3 days',
        finishedAt: new Date().toISOString(),
      })
      return 'It is *healthy*.'
    })
    await responder.handle(mention('1791443490.000200'))
    expect(await responder.drain(5_000)).toBe(true)

    const [summary] = reader.list()
    expect(summary).toMatchObject({
      status: 'succeeded',
      toolCalls: 1,
      userName: 'alice',
    })
    const run = reader.get(summary!.id) as RunRecord
    expect(run.request).toBe('check the status of web-01')
    expect(run.context.messages).toBe(2)
    expect(run.answer).toBe('It is *healthy*.')
    expect(run.prompt?.user).toContain('<request from="@alice">')
    expect(run.origin).toMatchObject({
      messenger: 'slack',
      conversationLabel: '#ops',
      userName: 'alice',
    })
    // Marked with 👀 instead of a placeholder, so the run links to the mention.
    expect(run.origin.placeholder).toBeUndefined()
    expect(run.origin.permalink).toBe(
      'https://example.slack.com/archives/C0OPS/p1791443490000200?thread_ts=1791443475.275049&cid=C0OPS'
    )
    expect(run.events[0]).toMatchObject({
      status: 'completed',
      result: 'up 3 days',
    })
    expect(posts).toEqual(['It is *healthy*.'])
    expect(reactions).toEqual(['+eyes', '-eyes'])
  })

  it('records a failed run with the error when the reasoner fails', async () => {
    const { responder, reader } = setup(async () => {
      throw new Error('codex run failed: quota exceeded')
    })
    await responder.handle(mention('1791443500.000300'))
    expect(await responder.drain(5_000)).toBe(true)
    const failed = reader.list({ status: 'failed' })
    expect(failed).toHaveLength(1)
    expect(reader.get(failed[0]!.id)).toMatchObject({
      error: expect.stringContaining('quota exceeded'),
      cause: 'limit',
    })
  })
})

/**
 * A messenger that keeps everything in memory: what any adapter has to provide,
 * and nothing Slack-specific
 */
class MemoryMessenger implements Messenger {
  readonly id = 'slack' as const
  readonly profile = {
    name: 'Chat',
    venues: 'rooms',
    markup: 'plain text',
    public: false,
  }
  readonly posts: string[] = []
  readonly updates: string[] = []
  readonly notices: string[] = []
  readonly uploads: Upload[][] = []
  answerable = true
  failUpload = false

  constructor(readonly allowedUsers: readonly string[] = []) {}

  async venue() {
    return this.answerable
      ? { label: 'room-1', answerable: true }
      : { label: 'dm', answerable: false, refusal: 'Not here.' }
  }
  async request(mention: Mention) {
    return {
      text: mention.text,
      author: `@${mention.userId}`,
      userName: mention.userId,
    }
  }
  async context() {
    return [{ id: 'm0', at: 0, author: '@bob', text: 'earlier', files: [] }]
  }
  async resolveFiles(files: Mention['files']) {
    return files
  }
  async download(): Promise<never> {
    throw new Error('no files')
  }
  async notice(_mention: Mention, text: string) {
    this.notices.push(text)
  }
  async post(_mention: Mention, text: string) {
    this.posts.push(text)
    return `p${this.posts.length}`
  }
  async update(_mention: Mention, _message: string, text: string) {
    this.updates.push(text)
  }
  async upload(_mention: Mention, files: Upload[]) {
    if (this.failUpload) throw new Error('upload refused')
    this.uploads.push(files)
  }
  render(markdown: string) {
    return markdown.match(/[\s\S]{1,20}/g) ?? ['']
  }
  permalink() {
    return undefined
  }
}

/**
 * A messenger that can react and delete its messages, like Slack (with
 * reactions:write)
 */
class MarkingMessenger extends MemoryMessenger {
  readonly marks: string[] = []
  readonly removed: string[] = []
  canMark = true
  canRemove = true

  async mark(_mention: Mention, mark: Mark) {
    if (!this.canMark) return false
    this.marks.push(`+${mark}`)
    return true
  }
  async unmark(_mention: Mention, mark: Mark) {
    this.marks.push(`-${mark}`)
  }
  async remove(_mention: Mention, message: string) {
    if (!this.canRemove) return false
    this.removed.push(message)
    return true
  }
}

describe('answering through any messenger', () => {
  const base = (
    messenger: MemoryMessenger,
    answer = 'short',
    secrets: string[] = []
  ) =>
    new MentionResponder({
      secrets,
      config: loadConfig({
        SLACK_BOT_TOKEN: 'xoxb-1',
        SLACK_APP_TOKEN: 'xapp-1',
        MENTION_ANYONE: 'on',
      }),
      messengers: [messenger],
      reasoner: {
        backend: 'claude',
        sandbox: 'host',
        canReadFiles: false,
        mcpServerNames: [],
        complete: async (request) => {
          expect(request.system).toContain('answers mentions in Chat rooms.')
          expect(request.system).not.toContain('do not put secrets')
          expect(request.prompt).toContain('@bob: earlier')
          return answer
        },
      },
      log: createLogger('error'),
      extractPdfText: async () => '',
    })
  const ask = (text: string, userId = 'u1'): Mention => ({
    messenger: 'slack',
    conversation: 'room-1',
    message: `${Math.random()}`,
    thread: 't1',
    inThread: true,
    userId,
    text,
    files: [],
  })

  it('tells only the asker it is working, and puts only the answer in the thread', async () => {
    const messenger = new MemoryMessenger()
    const responder = base(messenger, 'a'.repeat(45))
    await responder.handle(ask('hi'))
    expect(await responder.drain(5_000)).toBe(true)
    expect(messenger.notices).toEqual([
      expect.stringMatching(/^Working on it\.\.\./),
    ])
    expect(messenger.posts).toEqual(['a'.repeat(20), 'a'.repeat(20), 'aaaaa'])
    expect(messenger.updates).toEqual([])
  })

  it('redacts the secrets it holds and secret formats before posting the answer', async () => {
    const messenger = new MemoryMessenger()
    const held = 'a1b2c3d4e5f6a7b8c9d0'
    const responder = base(
      messenger,
      `The hub token is ${held}, the bot's xoxb-12345678901-abcdef.`,
      [held]
    )
    await responder.handle(ask('hi'))
    expect(await responder.drain(5_000)).toBe(true)
    const posted = messenger.posts.join('')
    expect(posted).not.toContain(held)
    expect(posted).not.toContain('xoxb-')
    expect(posted).toContain('[REDACTED SECRET]')
    expect(posted).toContain('[REDACTED SLACK TOKEN]')
  })

  it('tells the asker when they are not allowed or the venue is not answered', async () => {
    const closed = new MemoryMessenger(['u2'])
    await base(closed).handle(ask('hi'))
    expect(closed.notices[0]).toMatch(/^I only answer specif/)

    // Anyone in the workspace, but not someone from another organization
    const shared = new MemoryMessenger()
    await base(shared).handle({ ...ask('hi'), external: true })
    expect(shared.notices).toEqual([
      expect.stringMatching(/^I only answer people/),
    ])
    expect(shared.posts).toEqual([])

    const elsewhere = new MemoryMessenger()
    elsewhere.answerable = false
    await base(elsewhere).handle(ask('hi'))
    expect(elsewhere.notices).toEqual(['Not here.'])
    expect(elsewhere.posts).toEqual([])
  })

  it('tells only the asker when it is too busy, leaving the conversation alone', async () => {
    const messenger = new MemoryMessenger()
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const responder = new MentionResponder({
      config: loadConfig({
        SLACK_BOT_TOKEN: 'xoxb-1',
        SLACK_APP_TOKEN: 'xapp-1',
        MENTION_ANYONE: 'on',
        MENTION_CONCURRENCY: '1',
      }),
      messengers: [messenger],
      reasoner: {
        backend: 'claude',
        sandbox: 'host',
        canReadFiles: false,
        mcpServerNames: [],
        complete: async () => {
          await held
          return 'done'
        },
      },
      log: createLogger('error'),
      extractPdfText: async () => '',
    })
    // One runs and ten wait; the twelfth is one too many.
    for (let i = 0; i < 12; i++) await responder.handle(ask(`ask ${i}`))
    // The one running is told it is working, the ten waiting that they are
    // next, and the twelfth that Pace is busy.
    expect(messenger.notices).toEqual([
      expect.stringMatching(/^Working on it/),
      ...Array<unknown>(10).fill(expect.stringMatching(/^Got it\. I'll start/)),
      expect.stringMatching(/^I have too many/),
    ])
    expect(messenger.posts).toEqual([])
    release()
    expect(await responder.drain(5_000)).toBe(true)
  })

  it('handles a redelivered mention once', async () => {
    const messenger = new MemoryMessenger()
    const responder = base(messenger)
    const mention = ask('hi')
    await responder.handle(mention)
    await responder.handle({ ...mention })
    expect(await responder.drain(5_000)).toBe(true)
    expect(messenger.posts).toEqual(['short'])
  })
})

describe('marking a mention instead of posting a placeholder', () => {
  const responder = (
    messenger: MemoryMessenger,
    options: {
      answer?: (request: ReasonRequest) => Promise<string>
      slowAfterMs?: number
      inflight?: InflightStore
      onReasoner?: (problem: string | undefined) => void
      concurrency?: number
    } = {}
  ) =>
    new MentionResponder({
      config: loadConfig({
        SLACK_BOT_TOKEN: 'xoxb-1',
        SLACK_APP_TOKEN: 'xapp-1',
        MENTION_ANYONE: 'on',
        MENTION_CONCURRENCY: String(options.concurrency ?? 2),
      }),
      messengers: [messenger],
      reasoner: {
        backend: 'claude',
        sandbox: 'host',
        canReadFiles: false,
        mcpServerNames: [],
        complete: options.answer ?? (async () => 'a'.repeat(25)),
      },
      log: createLogger('error'),
      extractPdfText: async () => '',
      slowAfterMs: options.slowAfterMs,
      inflight: options.inflight,
      onReasoner: options.onReasoner,
    })
  const ask = (): Mention => ({
    messenger: 'slack',
    conversation: 'room-1',
    message: `${Math.random()}`,
    thread: 't1',
    inThread: true,
    userId: 'u1',
    text: 'hi',
    files: [],
  })
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  it('reacts, answers in new replies, and takes the reaction off', async () => {
    const messenger = new MarkingMessenger()
    const bot = responder(messenger)
    await bot.handle(ask())
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.posts).toEqual(['a'.repeat(20), 'aaaaa'])
    expect(messenger.updates).toEqual([])
    expect(messenger.marks).toEqual(['+working', '-working'])
  })

  it('adds the slow mark once the answer takes long', async () => {
    const messenger = new MarkingMessenger()
    const bot = responder(messenger, {
      slowAfterMs: 20,
      answer: async () => {
        await sleep(150)
        return 'done'
      },
    })
    await bot.handle(ask())
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.posts).toEqual(['done'])
    expect(messenger.marks).toEqual(['+working', '+slow', '-working', '-slow'])
  })

  it('marks a failure with ⚠️ and tells only the asker why, leaving the thread alone', async () => {
    const messenger = new MarkingMessenger()
    const bot = responder(messenger, {
      answer: async () => {
        throw new Error('quota exceeded')
      },
    })
    await bot.handle(ask())
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.posts).toEqual([])
    // The test messenger keeps the first 20 characters of a one-line message.
    expect(messenger.notices).toEqual(["I couldn't produce a"])
    expect(messenger.marks).toEqual(['+working', '+failed', '-working'])
  })

  it('tells only the asker it is working or failed when it cannot react', async () => {
    const messenger = new MarkingMessenger()
    messenger.canMark = false
    const bot = responder(messenger)
    await bot.handle(ask())
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.notices).toEqual([
      expect.stringMatching(/^Working on it\.\.\./),
    ])
    expect(messenger.posts).toEqual(['a'.repeat(20), 'aaaaa'])
    expect(messenger.marks).toEqual([])

    const failing = new MarkingMessenger()
    failing.canMark = false
    await responder(failing, {
      answer: async () => {
        throw new Error('boom')
      },
    }).handle(ask())
    await vi.waitFor(() => expect(failing.notices).toHaveLength(2))
    expect(failing.notices[1]).toMatch(/^I couldn't produce/)
    expect(failing.posts).toEqual([])
  })

  it('takes away a placeholder an older version left, when it resumes the request', async () => {
    const inflight = new InflightStore(path.join(root, 'legacy.json'))
    const mention = ask()
    inflight.upsert({
      key: mentionKey(mention),
      mention,
      label: 'room-1',
      placeholder: 'p0',
      attempts: 1,
      startedAt: Date.now(),
    })
    const messenger = new MarkingMessenger()
    const bot = responder(messenger, { inflight })
    await bot.resumePending()
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.removed).toEqual(['p0'])
    expect(messenger.posts).toEqual(['a'.repeat(20), 'aaaaa'])

    // Where it cannot delete it, the placeholder points to the answer.
    const stuck = new MarkingMessenger()
    stuck.canRemove = false
    inflight.upsert({
      key: mentionKey(mention),
      mention,
      label: 'room-1',
      placeholder: 'p0',
      attempts: 1,
      startedAt: Date.now(),
    })
    const again = responder(stuck, { inflight })
    await again.resumePending()
    expect(await again.drain(5_000)).toBe(true)
    expect(stuck.updates).toEqual(['I restarted; the ans'])
  })

  it('resumes a marked mention after a restart, answering in a new reply', async () => {
    const inflight = new InflightStore(path.join(root, 'marked.json'))
    const mention = ask()
    inflight.upsert({
      key: mentionKey(mention),
      mention,
      label: 'room-1',
      attempts: 1,
      startedAt: Date.now(),
    })
    const messenger = new MarkingMessenger()
    const bot = responder(messenger, { inflight })
    await bot.resumePending()
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.posts).toEqual(['a'.repeat(20), 'aaaaa'])
    expect(messenger.updates).toEqual([])
    // The 👀 from before the restart is still there; marking again is a no-op.
    expect(messenger.marks).toEqual(['+working', '-working'])
    expect(inflight.list()).toEqual([])
  })

  it('marks and records a mention as soon as it is taken on, also while it waits its turn', async () => {
    const inflight = new InflightStore(path.join(root, 'waiting.json'))
    const messenger = new MarkingMessenger()
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const bot = responder(messenger, {
      inflight,
      concurrency: 1,
      answer: async () => {
        await held
        return 'done'
      },
    })
    const first = ask()
    const second = ask()
    await bot.handle(first)
    await bot.handle(second)
    expect(messenger.marks).toEqual(['+working', '+working'])
    // The first has started; the second waits, and a restart would pick it up.
    await vi.waitFor(() =>
      expect(inflight.list().map((e) => [e.key, e.attempts])).toEqual([
        [mentionKey(first), 1],
        [mentionKey(second), 0],
      ])
    )
    release()
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.posts).toEqual(['done', 'done'])
    expect(inflight.list()).toEqual([])
  })

  it('cuts off its runs to shut down, and keeps them and the waiting ones for the next start', async () => {
    const inflight = new InflightStore(path.join(root, 'stopping.json'))
    const messenger = new MarkingMessenger()
    const bot = responder(messenger, {
      inflight,
      concurrency: 1,
      answer: (request) =>
        new Promise((_, reject) =>
          request.signal?.addEventListener('abort', () =>
            reject(new Error('claude run was aborted.'))
          )
        ),
    })
    const running = ask()
    const waiting = ask()
    await bot.handle(running)
    await bot.handle(waiting)
    await vi.waitFor(() =>
      expect(
        inflight.list().find((e) => e.key === mentionKey(running))
      ).toMatchObject({ attempts: 1 })
    )
    expect(await bot.stop(50, 2_000)).toBe(true)
    // Nothing failed: the 👀 stay, and the attempt cut off does not count.
    expect(messenger.posts).toEqual([])
    expect(messenger.notices).toEqual([])
    expect(messenger.marks).toEqual(['+working', '+working'])
    const attempts = () =>
      Object.fromEntries(inflight.list().map((e) => [e.key, e.attempts]))
    expect(attempts()).toEqual({
      [mentionKey(running)]: 0,
      [mentionKey(waiting)]: 0,
    })
    // A mention that comes in while stopping is kept as well.
    const late = ask()
    await bot.handle(late)
    expect(Object.keys(attempts())).toHaveLength(3)

    const next = new MarkingMessenger()
    const restarted = responder(next, { inflight })
    await restarted.resumePending()
    expect(await restarted.drain(5_000)).toBe(true)
    expect(next.posts).toHaveLength(6)
    expect(inflight.list()).toEqual([])
  })

  it('does not answer again after a restart once posting the answer began', async () => {
    const inflight = new InflightStore(path.join(root, 'posting.json'))
    // Posting is recorded before the first part goes out.
    const hanging = new MarkingMessenger()
    hanging.post = () => new Promise<string>(() => {})
    const mention = ask()
    await responder(hanging, { inflight }).handle(mention)
    await vi.waitFor(() =>
      expect(inflight.list()).toEqual([
        expect.objectContaining({ answer: 'posting' }),
      ])
    )

    const answered = ask()
    inflight.upsert({
      key: mentionKey(answered),
      mention: answered,
      label: 'room-1',
      attempts: 1,
      startedAt: Date.now(),
      answer: 'posted',
    })
    const messenger = new MarkingMessenger()
    let asked = 0
    const bot = responder(messenger, {
      inflight,
      answer: async () => {
        asked += 1
        return 'again'
      },
    })
    await bot.resumePending()
    expect(await bot.drain(5_000)).toBe(true)
    expect(asked).toBe(0)
    expect(messenger.posts).toEqual([])
    // The one cut off partway gets ⚠️ and a word to the asker alone; the one
    // posted in full only loses its marks.
    expect(messenger.notices).toEqual([
      expect.stringMatching(/^I restarted while/),
    ])
    expect(messenger.marks).toEqual([
      '-working',
      '-slow',
      '+failed',
      '-working',
      '-slow',
    ])
    expect(inflight.list()).toEqual([])
  })

  it('says what a rejected sign-in means, and tells the status until it answers again', async () => {
    const messenger = new MarkingMessenger()
    messenger.render = (markdown: string) => [markdown]
    const problems: (string | undefined)[] = []
    let signedIn = false
    const bot = responder(messenger, {
      answer: async () => {
        if (!signedIn)
          throw new Error(
            'claude run failed: Failed to authenticate. API Error: 401 OAuth access token is invalid.'
          )
        return 'back'
      },
      onReasoner: (problem) => problems.push(problem),
    })
    await bot.handle(ask())
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.posts).toEqual([])
    expect(messenger.notices).toEqual([
      "I couldn't produce an answer: my sign-in to Claude was rejected. Whoever runs Pace needs to sign in again in Pacenote.",
    ])
    // The responder runs on the host here, so the advice is to sign in there.
    expect(problems).toEqual([
      expect.stringMatching(
        /^claude's sign-in on this Mac was rejected\..*\(last at /
      ),
    ])

    signedIn = true
    await bot.handle(ask())
    expect(await bot.drain(5_000)).toBe(true)
    expect(messenger.posts.at(-1)).toBe('back')
    expect(problems.at(-1)).toBeUndefined()
  })
})
