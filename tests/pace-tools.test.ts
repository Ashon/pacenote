import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { HistoryReader } from '../src/history/reader.js'
import { systemPrompt } from '../src/mention/prompt.js'
import { serveOwnTools, type OwnToolsOptions } from '../src/pace/tools.js'
import type { Requester } from '../src/sandbox/runtime.js'
import { openBrokerDoor } from '../src/sandbox/vm-broker.js'
import { readActivity } from '../src/tasks/activity.js'
import { recapSummary } from '../src/tasks/mcp.js'
import type { TasksSettings } from '../src/tasks/settings.js'
import { readTasks } from '../src/tasks/store.js'
import { addFollowUp, addTasks } from '../src/tasks/write.js'
import { countYou } from '../src/you/store.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-own-tools-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const OWNER = 'U0ASHON'
const settings = (on = true): TasksSettings => ({
  on,
  dms: true,
  exclude: [],
  names: [],
  groups: [],
})
/** The owner asking in #portfolio, in a thread, as the responder says */
const asking: Requester = {
  user: OWNER,
  conversation: 'C0PORT',
  label: '#portfolio',
  thread: '1792163700.000100',
  message: '1792163959.382249',
  permalink:
    'https://acme.slack.com/archives/C0PORT/p1792163959382249?thread_ts=1792163700.000100',
  run: '20261017-001920-aaaa01',
}

/** What comes back over JSON-RPC, read as the test expects it */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** One JSON-RPC call through a door's socket, as the reasoner in a VM makes */
async function rpc(
  socket: string,
  method: string,
  params: object,
  urlPath = '/pace/mcp',
  headers: Record<string, string> = {}
): Promise<{ status: number; body: Json }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: socket,
        path: urlPath,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
      },
      (res) => {
        let text = ''
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => {
          // Streamable HTTP answers with an event stream of one message
          const data = text
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('')
          resolve({
            status: res.statusCode ?? 0,
            body: data ? JSON.parse(data) : text,
          })
        })
      }
    )
    req.on('error', reject)
    req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }))
  })
}

/** A tool's result through the door: its JSON, or its error text */
async function call(
  socket: string,
  name: string,
  args: object = {}
): Promise<{ error?: string; value?: Json }> {
  const { body } = await rpc(socket, 'tools/call', { name, arguments: args })
  const result = body.result
  const text = result.content[0].text as string
  return result.isError ? { error: text } : { value: JSON.parse(text) }
}

async function withDoor<T>(
  options: Partial<OwnToolsOptions>,
  requester: Requester | undefined,
  use: (socket: string) => Promise<T>,
  broker?: string
): Promise<T> {
  const dataDir = options.dataDir ?? path.join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  const door = await openBrokerDoor(
    broker,
    path.join(tmpdir(), `pv-own-${process.pid}-${Math.random()}.sock`),
    requester,
    serveOwnTools({
      dataDir,
      settings: () => settings(),
      owner: () => OWNER,
      version: 'test',
      ...options,
    })
  )
  try {
    return await use(door.socket)
  } finally {
    await door.close()
  }
}

describe("Pace's own tools in the sandbox", () => {
  it('keeps the tasks the owner asks for in their Todo, from the thread, once', async () => {
    const dataDir = path.join(root, 'keep')
    await withDoor({ dataDir }, asking, async (socket) => {
      const listed = await rpc(socket, 'tools/list', {})
      expect(
        listed.body.result.tools.map((tool: { name: string }) => tool.name)
      ).toEqual(['my_tasks', 'add_tasks', 'close_task', 'my_work', 'my_recap'])

      const tasks = [
        { title: 'NVDA 매도 시그널 실행 여부 판단', why: 'T0 매도 시그널' },
        { title: '버킷 비중 리밸런싱 검토', due: '금요일' },
        { title: 'Review the retry PR', asked_by: 'mina' },
      ]
      const first = await call(socket, 'add_tasks', { tasks })
      expect(first.value.added.map((t: { title: string }) => t.title)).toEqual(
        tasks.map((t) => t.title)
      )
      // Asked again in the thread: nothing doubles
      const again = await call(socket, 'add_tasks', {
        tasks: tasks.slice(0, 1),
      })
      expect(again.value.added).toEqual([])
      expect(again.value.alreadyThere).toHaveLength(1)

      const kept = readTasks(dataDir).tasks
      expect(kept).toHaveLength(3)
      expect(new Set(kept.map((t) => t.id)).size).toBe(3)
      expect(kept[0]).toMatchObject({
        source: {
          app: 'slack',
          conversation: 'C0PORT',
          label: '#portfolio',
          message: asking.message,
          thread: asking.thread,
          permalink: asking.permalink,
        },
        kind: 'promised',
        askedBy: 'you',
        confidence: 'sure',
        addedBy: 'Pace',
        reason: 'T0 매도 시그널',
      })
      expect(kept[2]).toMatchObject({ kind: 'asked', askedBy: 'mina' })
      expect(readActivity(dataDir).at(-1)).toMatchObject({
        by: 'Pace',
        kind: 'add',
        added: 3,
      })
    })
  })

  it('lists only the open tasks from public channels and your own, and closes one when told', async () => {
    const dataDir = path.join(root, 'list')
    mkdirSync(dataDir, { recursive: true })
    addTasks(
      dataDir,
      [
        {
          title: 'Answer mina about the refund',
          where: 'DM with mina',
          link: 'https://acme.slack.com/archives/D0MINA/p1792000000000100',
          confidence: 'sure',
        },
        {
          title: 'Draft the launch plan',
          where: '#secret-launch',
          link: 'https://acme.slack.com/archives/C0SECRET/p1792000050000100',
          confidence: 'sure',
        },
        {
          title: 'Review the webhook change',
          where: '#webhooks',
          link: 'https://acme.slack.com/archives/C0HOOK/p1792000100000100',
          confidence: 'sure',
        },
      ],
      { settings: settings() }
    )
    const draft = readTasks(dataDir).tasks.find((t) =>
      t.title.startsWith('Draft')
    )!
    // Your own, but carrying on from the private one: as private as it is
    addFollowUp(dataDir, {
      title: 'Send the launch plan to legal',
      why: 'Left after the draft',
      after: draft.id,
    })
    addFollowUp(dataDir, {
      title: 'Renew the TLS certificate',
      why: 'It expires next week',
    })
    const titles = (tasks: { title: string }[]) =>
      tasks.map((t) => t.title).sort()
    // #webhooks and #portfolio, where Pace is asked, are the public ones
    const isPublic = async (id: string) => id === 'C0HOOK' || id === 'C0PORT'
    await withDoor({ dataDir, isPublic }, asking, async (socket) => {
      const { value } = await call(socket, 'my_tasks')
      expect(titles(value.tasks)).toEqual([
        'Renew the TLS certificate',
        'Review the webhook change',
      ])
      const closed = await call(socket, 'close_task', {
        task: value.tasks.find((t: { title: string }) =>
          t.title.startsWith('Review')
        ).id,
        note: 'Reviewed and approved',
      })
      expect(closed.value.closed.title).toBe('Review the webhook change')
      expect(titles((await call(socket, 'my_tasks')).value.tasks)).toEqual([
        'Renew the TLS certificate',
      ])
      expect(
        readTasks(dataDir).tasks.find((t) => t.title.startsWith('Review'))
          ?.closed
      ).toMatchObject({
        why: 'resolved',
        by: 'Pace',
        note: 'Reviewed and approved',
      })
    })
    // A channel that cannot be looked up counts as private
    await withDoor({ dataDir }, asking, async (socket) => {
      expect(titles((await call(socket, 'my_tasks')).value.tasks)).toEqual([
        'Renew the TLS certificate',
      ])
    })
  })

  it('tells a channel where the user works without their private channels', async () => {
    const dataDir = path.join(root, 'work')
    mkdirSync(dataDir, { recursive: true })
    const at = Math.floor((Date.now() - 60_000) / 1000)
    const asked = (channel: string, where: string, title: string) =>
      [1, 2, 3].map((k) => ({
        title: `${title} ${k}`,
        asked_by: 'mina',
        where,
        link: `https://acme.slack.com/archives/${channel}/p${at + k}000100`,
        confidence: 'sure' as const,
      }))
    addTasks(
      dataDir,
      [
        ...asked('C0SECRET', '#secret-launch', 'Launch step'),
        ...asked('C0HOOK', '#webhooks', 'Webhook fix'),
      ],
      { settings: settings() }
    )
    // The desktop app keeps the areas it finds, the private one too
    const found = await countYou({ dataDir, keep: true })
    expect(found.areas.map((area) => area.name).sort()).toEqual([
      'Secret launch',
      'Webhooks',
    ])
    const isPublic = async (id: string) => id !== 'C0SECRET'
    await withDoor({ dataDir, isPublic }, asking, async (socket) => {
      const work = await call(socket, 'my_work')
      expect(work.value.areas.map((a: { name: string }) => a.name)).toEqual([
        'Webhooks',
      ])
      expect(JSON.stringify(work.value)).toContain('Webhook fix')
      expect(JSON.stringify(work.value)).not.toMatch(/launch/i)
      const recap = await call(socket, 'my_recap', { period: 'month' })
      expect(recap.error).toBeUndefined()
      expect(JSON.stringify(recap.value)).not.toMatch(/launch/i)
    })
    // The user's own recap, in their AI tools, still has all of it
    const own = await recapSummary({ dataDir }, 'month', undefined)
    expect(JSON.stringify(own)).toMatch(/launch/i)
  })

  it('acts only for the owner, as the door says, and not while Todo is off', async () => {
    const dataDir = path.join(root, 'who')
    // Someone else, even with headers saying otherwise
    await withDoor(
      { dataDir },
      { ...asking, user: 'U0OTHER' },
      async (socket) => {
        const { body } = await rpc(
          socket,
          'tools/call',
          { name: 'add_tasks', arguments: { tasks: [{ title: 'x' }] } },
          '/pace/mcp',
          { 'x-pacenote-user': OWNER }
        )
        expect(body.result.isError).toBe(true)
        expect(body.result.content[0].text).toMatch(/only for the person/)
      }
    )
    await withDoor(
      { dataDir, settings: () => settings(false) },
      asking,
      async (socket) => {
        expect((await call(socket, 'my_tasks')).error).toMatch(/Todo is off/)
      }
    )
    expect(readTasks(dataDir).tasks).toEqual([])
  })

  it("gives Pace's earlier answers from the same channel only", async () => {
    const dataDir = path.join(root, 'history')
    const run = (
      id: string,
      conversation: string,
      request: string,
      answer: string
    ) => {
      const dir = path.join(dataDir, 'runs', '2026-10-16', id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        path.join(dir, 'run.json'),
        JSON.stringify({
          version: 1,
          id,
          status: 'succeeded',
          attempts: 1,
          startedAt: '2026-10-16T10:00:00.000Z',
          updatedAt: '2026-10-16T10:00:10.000Z',
          origin: {
            messenger: 'slack',
            conversation,
            conversationLabel: conversation === 'C0PORT' ? '#portfolio' : '#hr',
            thread: '1792000000.000100',
            message: '1792000000.000100',
          },
          request,
          backend: { reasoner: 'claude', sandbox: 'vm' },
          context: { messages: 0 },
          attachments: [],
          events: [],
          outputs: [],
          answer,
        })
      )
    }
    run('20261016-100000-aaaa02', 'C0PORT', '소식 정리해 줘', 'KOSPI 반등 정리')
    run('20261016-110000-aaaa03', 'C0HR', 'salary bands?', 'Private numbers')
    await withDoor(
      { dataDir, history: new HistoryReader(dataDir) },
      asking,
      async (socket) => {
        const { value } = await call(socket, 'earlier_answers')
        expect(value.answers).toEqual([
          expect.objectContaining({
            request: '소식 정리해 줘',
            answer: 'KOSPI 반등 정리',
            sameThread: false,
          }),
        ])
      }
    )
  })

  it('shares the door with the broker: its own path here, the rest to the broker', async () => {
    const brokerSocket = path.join(
      tmpdir(),
      `pv-own-broker-${process.pid}.sock`
    )
    const broker = http
      .createServer((req, res) => res.end(`broker ${req.url}`))
      .listen(brokerSocket)
    await new Promise((resolve) => broker.once('listening', resolve))
    try {
      await withDoor(
        {},
        asking,
        async (socket) => {
          expect((await rpc(socket, 'tools/list', {}, '/mcp')).body).toBe(
            'broker /mcp'
          )
          const own = await rpc(socket, 'tools/list', {})
          expect(own.body.result.tools.length).toBeGreaterThan(0)
        },
        brokerSocket
      )
      // Without the broker, only Pace's own tools answer.
      await withDoor({}, asking, async (socket) => {
        expect((await rpc(socket, 'tools/list', {}, '/mcp')).status).toBe(404)
      })
    } finally {
      broker.close()
    }
  })

  it('tells Pace its Todo is where tasks go, not Jira', () => {
    const slack = {
      name: 'Slack',
      venues: 'public channels',
      markup: 'Slack mrkdwn',
      public: true,
    }
    expect(systemPrompt(slack)).not.toContain('add_tasks')
    const prompt = systemPrompt(slack, { ownTools: true, opsTools: true })
    expect(prompt).toContain('add it to their Todo with add_tasks')
    expect(prompt).toContain(
      'Use Jira or another tracker only when they name it'
    )
  })
})
