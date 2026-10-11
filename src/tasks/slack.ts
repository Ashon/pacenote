import type { WebClient } from '@slack/web-api'
import { renderSlackText, slackPermalink } from '../messengers/slack/format.js'

/**
 * Reads Slack with your user token for messages that may hold a task for you,
 * and keeps them on this Mac: only these go to the reasoner. Reads conversation
 * history, not Slack search (docs/proposals/personal-tasks.md, Decided).
 * - A message that mentions you, not from you
 * - In a DM (when on): what the other person said after your last message
 * - Something you said you would do ("I'll take a look", "확인해 볼게요")
 * - A thread you took part in whose last word is not yours
 */

/** The Web API calls this needs, so tests can stand in for Slack */
export type SlackUserClient = Pick<
  WebClient,
  'auth' | 'users' | 'conversations'
>

export interface SlackMessage {
  ts: string
  user?: string
  bot_id?: string
  subtype?: string
  text?: string
  thread_ts?: string
  reply_count?: number
  latest_reply?: string
  reactions?: { name?: string; users?: string[] }[]
}

/** One place in Slack the reasoner looks at, around one message */
export interface Unit {
  /** "<conversation>:<message>" */
  id: string
  conversation: string
  label: string
  /** The message that may hold a task (Slack ts) */
  focal: string
  thread?: string
  permalink?: string
  postedAt: string
  /** promise: your own message; ask: someone else's */
  kind: 'ask' | 'promise'
  /** The messages around it, oldest first, readable */
  messages: { ts: string; author: string; text: string; focal: boolean }[]
}

export interface Gathered {
  me: { id: string; name: string }
  units: Unit[]
  readUpTo: Record<string, string>
  /** Threads read along the way: "<conversation>:<thread ts>" -> messages */
  threads: Map<string, SlackMessage[]>
  workspaceUrl?: string
}

export interface GatherOptions {
  /** The newest message read so far, per conversation */
  readUpTo: Record<string, string>
  /** Also DMs and group DMs */
  dms: boolean
  /** Conversations left out, by ID or name ("#random" or "random") */
  exclude: readonly string[]
  now?: number
  /** How far back to read: new threads started before this are not seen */
  windowMs?: number
  /** Threads read per collection, to stay inside Slack's rate limits */
  maxThreads?: number
}

const WINDOW_MS = 7 * 24 * 60 * 60_000
const MAX_THREADS = 60
const MAX_HISTORY_PAGES = 5
const TEXT_LIMIT = 600

/** Things people write when they take something on, in English and Korean */
const PROMISE =
  /\b(i['’]ll|i will|let me|will do|on it|i can take|i['’]m on)\b|할게|하겠|볼게|챙길게|드릴게|확인해 ?보/i

const CHECK_MARKS = new Set([
  'white_check_mark',
  'heavy_check_mark',
  'ballot_box_with_check',
])

const isHuman = (m: SlackMessage) =>
  Boolean(m.user) &&
  !m.bot_id &&
  (!m.subtype || m.subtype === 'thread_broadcast')

export const mentions = (text: string | undefined, me: string) =>
  Boolean(text && (text.includes(`<@${me}>`) || text.includes(`<@${me}|`)))

export const promises = (text: string | undefined) =>
  Boolean(text && PROMISE.test(text))

export const checked = (message: SlackMessage | undefined) =>
  Boolean(message?.reactions?.some((r) => r.name && CHECK_MARKS.has(r.name)))

const after = (ts: string, than: string) => Number(ts) > Number(than)
const iso = (ts: string) => new Date(Number(ts) * 1000).toISOString()

export async function gather(
  client: SlackUserClient,
  options: GatherOptions
): Promise<Gathered> {
  const now = options.now ?? Date.now()
  const windowStart = ((now - (options.windowMs ?? WINDOW_MS)) / 1000).toFixed(
    6
  )
  const maxThreads = options.maxThreads ?? MAX_THREADS
  const auth = await client.auth.test()
  const me = String(auth.user_id)
  const conversations = await listConversations(client, options.dms)
  const kept = conversations.filter(
    (c) =>
      !options.exclude.some((x) => {
        const name = x.replace(/^#/, '')
        return x === c.id || (c.name !== undefined && name === c.name)
      })
  )

  const names = new Map<string, string>()
  const threads = new Map<string, SlackMessage[]>()
  const readUpTo = { ...options.readUpTo }
  type Candidate = {
    conversation: (typeof kept)[number]
    focal: SlackMessage
    kind: Unit['kind']
    thread?: SlackMessage[]
    before: SlackMessage[]
  }
  const candidates = new Map<string, Candidate>()
  const add = (c: Candidate) => {
    const id = `${c.conversation.id}:${c.focal.ts}`
    if (!candidates.has(id)) candidates.set(id, c)
  }
  let threadsRead = 0

  for (const conversation of kept) {
    const since = readUpTo[conversation.id] ?? windowStart
    // The whole window, so new replies to threads in it are seen too
    const history = (await readHistory(client, conversation.id, windowStart))
      .filter((m) => m.ts)
      .sort((a, b) => Number(a.ts) - Number(b.ts))
    let newest = since
    const top = history.filter((m) => isHuman(m))

    if (conversation.isIm) {
      // What they said after your last word
      const lastMine = [...top].reverse().find((m) => m.user === me)
      const theirs = top.filter(
        (m) =>
          m.user !== me &&
          after(m.ts, since) &&
          (!lastMine || after(m.ts, lastMine.ts))
      )
      const focal = theirs.at(-1)
      if (focal)
        add({ conversation, focal, kind: 'ask', before: top.slice(-6, -1) })
    }

    for (const [i, m] of top.entries()) {
      if (after(m.ts, newest)) newest = m.ts
      if (after(m.ts, since)) {
        if (!conversation.isIm && m.user !== me && mentions(m.text, me))
          add({
            conversation,
            focal: m,
            kind: 'ask',
            before: top.slice(Math.max(0, i - 3), i),
          })
        if (m.user === me && promises(m.text))
          add({
            conversation,
            focal: m,
            kind: 'promise',
            before: top.slice(Math.max(0, i - 3), i),
          })
      }
      const active =
        (m.reply_count ?? 0) > 0 &&
        m.latest_reply &&
        after(m.latest_reply, since)
      if (!active || threadsRead >= maxThreads) continue
      threadsRead += 1
      const replies = await readThread(client, conversation.id, m.ts)
      threads.set(`${conversation.id}:${m.ts}`, replies)
      const thread = replies.filter((r) => isHuman(r))
      for (const [j, r] of thread.entries()) {
        if (after(r.ts, newest)) newest = r.ts
        if (r.ts === m.ts || !after(r.ts, since)) continue
        if (r.user !== me && mentions(r.text, me))
          add({
            conversation,
            focal: r,
            kind: 'ask',
            thread,
            before: thread.slice(Math.max(0, j - 6), j),
          })
        if (r.user === me && promises(r.text))
          add({
            conversation,
            focal: r,
            kind: 'promise',
            thread,
            before: thread.slice(Math.max(0, j - 6), j),
          })
      }
      // A thread you took part in, whose last word is not yours
      const last = thread.at(-1)
      if (
        last &&
        last.user !== me &&
        after(last.ts, since) &&
        thread.some((r) => r.user === me)
      )
        add({
          conversation,
          focal: last,
          kind: 'ask',
          thread,
          before: thread.slice(-7, -1),
        })
    }
    if (after(newest, since) || readUpTo[conversation.id] === undefined)
      readUpTo[conversation.id] = newest
  }

  // Names for everyone in the kept messages
  const people = new Set<string>([me])
  for (const c of candidates.values())
    for (const m of [...c.before, c.focal, ...(c.thread ?? [])]) {
      if (m.user) people.add(m.user)
      for (const id of (m.text ?? '').matchAll(/<@([UW][A-Z0-9]+)/g))
        people.add(id[1]!)
    }
  await Promise.all(
    [...people].map(async (id) => names.set(id, await userName(client, id)))
  )

  const label = (c: Candidate['conversation']) =>
    c.isIm
      ? `DM with ${names.get(c.user ?? '') ?? c.user ?? 'someone'}`
      : c.isMpim
        ? 'Group DM'
        : `#${c.name ?? c.id}`
  const read = (m: SlackMessage) => ({
    ts: m.ts,
    author:
      m.user === me ? 'you' : (names.get(m.user ?? '') ?? m.user ?? 'someone'),
    text: renderSlackText(m.text ?? '', names).slice(0, TEXT_LIMIT),
  })

  const workspaceUrl = typeof auth.url === 'string' ? auth.url : undefined
  const units: Unit[] = [...candidates.entries()].map(([id, c]) => {
    const threadTs =
      c.focal.thread_ts ?? (c.focal.reply_count ? c.focal.ts : undefined)
    const following = (c.thread ?? [])
      .filter((r) => after(r.ts, c.focal.ts))
      .slice(0, 3)
    return {
      id,
      conversation: c.conversation.id,
      label: label(c.conversation),
      focal: c.focal.ts,
      thread: threadTs,
      permalink: workspaceUrl
        ? slackPermalink(
            workspaceUrl,
            c.conversation.id,
            c.focal.ts,
            threadTs ?? c.focal.ts
          )
        : undefined,
      postedAt: iso(c.focal.ts),
      kind: c.kind,
      messages: [
        ...c.before.map((m) => ({ ...read(m), focal: false })),
        { ...read(c.focal), focal: true },
        ...following.map((m) => ({ ...read(m), focal: false })),
      ],
    }
  })

  return {
    me: { id: me, name: names.get(me) ?? String(auth.user ?? me) },
    units: units.sort((a, b) => Number(b.focal) - Number(a.focal)),
    readUpTo,
    threads,
    workspaceUrl,
  }
}

interface Conversation {
  id: string
  name?: string
  isIm: boolean
  isMpim: boolean
  /** For a DM, the other person */
  user?: string
}

async function listConversations(
  client: SlackUserClient,
  dms: boolean
): Promise<Conversation[]> {
  const types = [
    'public_channel',
    'private_channel',
    ...(dms ? ['im', 'mpim'] : []),
  ]
  const out: Conversation[] = []
  let cursor: string | undefined
  do {
    const res = await client.users.conversations({
      types: types.join(','),
      exclude_archived: true,
      limit: 200,
      cursor,
    })
    for (const c of res.channels ?? []) {
      if (!c.id) continue
      out.push({
        id: c.id,
        name: c.name,
        isIm: Boolean(c.is_im),
        isMpim: Boolean(c.is_mpim),
        user: c.user,
      })
    }
    cursor = res.response_metadata?.next_cursor || undefined
  } while (cursor)
  return out
}

async function readHistory(
  client: SlackUserClient,
  channel: string,
  oldest: string
): Promise<SlackMessage[]> {
  const out: SlackMessage[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const res = await client.conversations.history({
      channel,
      oldest,
      limit: 200,
      cursor,
    })
    out.push(...((res.messages ?? []) as SlackMessage[]))
    cursor = res.response_metadata?.next_cursor || undefined
    if (!res.has_more || !cursor) break
  }
  return out
}

/** A thread, the parent first */
export async function readThread(
  client: SlackUserClient,
  channel: string,
  ts: string
): Promise<SlackMessage[]> {
  const res = await client.conversations.replies({ channel, ts, limit: 200 })
  return ((res.messages ?? []) as SlackMessage[]).sort(
    (a, b) => Number(a.ts) - Number(b.ts)
  )
}

async function userName(client: SlackUserClient, id: string): Promise<string> {
  try {
    const { user } = await client.users.info({ user: id })
    return user?.profile?.display_name || user?.real_name || user?.name || id
  } catch {
    return id
  }
}
