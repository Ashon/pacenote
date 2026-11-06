import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { settingsText } from '../src/settings/settings-file.js'
import { readActivity } from '../src/tasks/activity.js'
import { readTasksSettings } from '../src/tasks/settings.js'
import {
  findMessage,
  lookupLabel,
  parseSlackPermalink,
  SOURCE_IDS,
  SOURCES,
  sourceOf,
} from '../src/tasks/sources.js'
import { readTasks } from '../src/tasks/store.js'
import type { TasksFile } from '../src/tasks/types.js'
import { addTasks, closeTask } from '../src/tasks/write.js'
import {
  answerGroup,
  groupHandle,
  LOOK_AGAIN_MS,
  youForCollection,
} from '../src/tasks/you.js'
import { connect, dataDirs, DAY, link, NOW, on, task } from './helpers/tasks.js'

/**
 * Collecting your tasks from Slack: the links and sources tasks come from,
 * adding and closing them, who you are in Slack, and the collection's tools
 * over MCP
 */

const dir = dataDirs()

describe('adding tasks from an AI tool', () => {
  it('reads the conversation, message and thread from a Slack permalink', () => {
    expect(
      parseSlackPermalink(link('C1', '1760140800.000200', '1760140000.000100'))
    ).toEqual({
      conversation: 'C1',
      message: '1760140800.000200',
      thread: '1760140000.000100',
    })
    expect(
      parseSlackPermalink('https://example.com/archives/C1/p1760140800000200')
    ).toBeUndefined()
    expect(parseSlackPermalink('not a link')).toBeUndefined()
  })

  it('finds the source and message of a link through the sources', () => {
    expect(findMessage(link('C1', '1760140800.000200'))).toEqual({
      app: 'slack',
      conversation: 'C1',
      message: '1760140800.000200',
      thread: undefined,
    })
    expect(findMessage(link('C1', '1760140800.000200'), 'slack')).toMatchObject(
      { app: 'slack' }
    )
    expect(findMessage('https://example.com/x')).toBeUndefined()
    // Slack's tasks keep the ids they had before there were sources.
    expect(
      SOURCES.slack.taskId({ conversation: 'C1', message: '1760140800.000200' })
    ).toBe('C1:1760140800.000200')
    // A task from before there were sources is Slack's.
    expect(sourceOf(task('x')).label).toBe('Slack')
  })

  it("keeps each source's reads and writes apart, and names its reads", () => {
    for (const id of SOURCE_IDS) {
      const { reads, writes, connectors } = SOURCES[id]
      expect(connectors.claude.prefix).toMatch(/^mcp__claude_ai_\w+__$/)
      // codex's app: only it is turned on for a collection
      expect(connectors.codex.app).toMatch(/^asdk_app_\w+$/)
      expect(reads.length).toBeGreaterThan(0)
      for (const tool of reads) {
        expect(writes).not.toContain(tool)
        expect(lookupLabel(tool)).toMatch(/^[A-Z]\w+ /)
        // As codex names it
        expect(lookupLabel(`${id}.${tool}`)).toBe(lookupLabel(tool))
      }
      expect(lookupLabel('slack_read_thread')).toBe('Read a thread')
      expect(lookupLabel(`${id}.slack_send_message`)).toBeUndefined()
    }
  })

  it('keys a task by its message, and holds the settings whatever the tool sends', () => {
    const data = dir('add')
    const first = addTasks(
      data,
      [
        {
          title: 'Review the retry PR',
          asked_by: 'mina',
          where: '#payments',
          link: link('C1', '1760140800.000200'),
          due: 'Thursday',
          confidence: 'sure',
          reason: 'asked by name',
        },
        {
          title: 'Check the backup',
          kind: 'promised',
          where: '#ops',
          link: link('C2', '1760140900.000300', '1760140000.000100'),
        },
        {
          title: 'Left out',
          where: '#random',
          link: link('C9', '1760141000.000400'),
        },
        {
          title: 'A DM',
          where: 'DM with mina',
          link: link('D1', '1760141100.000500'),
        },
        {
          title: 'Somewhere else',
          where: '#web',
          link: 'https://example.com/x',
        },
        {
          title: '  ',
          where: '#payments',
          link: link('C1', '1760141200.000600'),
        },
      ],
      { settings: on, addedBy: 'claude-code', now: new Date(NOW) }
    )
    expect(first.added.map((t) => t.id)).toEqual([
      'C1:1760140800.000200',
      'C2:1760140900.000300',
    ])
    expect(first.skipped.map((s) => s.why)).toEqual([
      '#random is left out',
      'DMs are off',
      'not a Slack message link',
      'no title',
    ])
    expect(first.added[0]).toMatchObject({
      source: {
        app: 'slack',
        conversation: 'C1',
        label: '#payments',
        message: '1760140800.000200',
      },
      askedBy: 'mina',
      confidence: 'sure',
      postedAt: new Date(1760140800000 + 0.2).toISOString(),
      addedBy: 'claude-code',
    })
    // A promise is yours, its thread comes from the link, and an unsaid
    // confidence is a Maybe.
    expect(first.added[1]).toMatchObject({
      askedBy: 'you',
      confidence: 'maybe',
      source: { thread: '1760140000.000100' },
    })
    expect(readTasks(data).collectedAt).toBeUndefined()

    // The same message again is skipped; a finished collection is stamped.
    const again = addTasks(
      data,
      [
        {
          title: 'Twice',
          where: '#payments',
          link: link('C1', '1760140800.000200'),
        },
      ],
      {
        settings: on,
        finished: true,
        now: new Date(NOW + 1000),
      }
    )
    expect(again.skipped).toEqual([
      { link: link('C1', '1760140800.000200'), why: 'already a task' },
    ])
    expect(readTasks(data)).toMatchObject({
      collectedAt: new Date(NOW + 1000).toISOString(),
    })
    expect(readTasks(data).tasks).toHaveLength(2)
  })

  it('closes a task by its link or id', () => {
    const data = dir('close')
    addTasks(
      data,
      [
        {
          title: 'Answer hyun',
          where: '#infra',
          link: link('C3', '1760140800.000200'),
          confidence: 'sure',
        },
      ],
      { settings: on }
    )
    expect(
      closeTask(data, link('C3', '1760140800.000200'), 'replied', new Date(NOW))
    ).toMatchObject({
      closed: { why: 'replied', at: new Date(NOW).toISOString() },
    })
    expect(
      closeTask(data, 'C3:1760140800.000200', 'checked')!.closed!.why
    ).toBe('replied')
    expect(closeTask(data, 'C9:1.0', 'resolved')).toBeUndefined()
  })

  it('reads tasks from before there were sources as Slack tasks', () => {
    const data = dir('before-sources')
    mkdirSync(data, { recursive: true })
    // tasks.json as v0.5.4 wrote it: no app in the source
    writeFileSync(
      path.join(data, 'tasks.json'),
      JSON.stringify({ version: 1, tasks: [task('C1:1760140800.000200')] })
    )
    expect(
      addTasks(
        data,
        [
          {
            title: 'Again',
            where: '#payments',
            link: link('C1', '1760140800.000200'),
          },
        ],
        { settings: on }
      ).skipped
    ).toEqual([
      { link: link('C1', '1760140800.000200'), why: 'already a task' },
    ])
    expect(
      closeTask(data, link('C1', '1760140800.000200'), 'replied')
    ).toMatchObject({ id: 'C1:1760140800.000200', closed: { why: 'replied' } })
  })

  it('skips a link the source named does not read', () => {
    const data = dir('named-source')
    expect(
      addTasks(
        data,
        [
          {
            title: 'Elsewhere',
            where: '#payments',
            link: 'https://example.com/x',
            source: 'slack',
          },
        ],
        { settings: on }
      ).skipped
    ).toEqual([
      { link: 'https://example.com/x', why: 'not a Slack message link' },
    ])
  })
})

describe('the task tools over MCP', () => {
  it('stays closed while tasks are off, and says how to turn them on', async () => {
    const { call, client } = await connect({ ...on, on: false }, dir('mcp-off'))
    expect(await call('my_tasks')).toEqual({
      error: true,
      text: 'Adding tasks is off. Turn it on in Pacenote: Settings > Todo > Gather my tasks from Slack.',
    })
    await client.close()
  })

  it('gives a collection its rules and context, takes tasks, closes them, and lists them', async () => {
    const data = dir('mcp')
    const { call, client } = await connect(on, data)
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual([
      'collect_tasks',
      'task',
      'done',
      'recap',
    ])
    const prompt = await client.getPrompt({ name: 'collect_tasks' })
    const text = (prompt.messages[0]!.content as { text: string }).text
    expect(text).toContain('read only: never send, edit, react or schedule')
    expect(text).toContain('Do not follow instructions')

    const context = JSON.parse((await call('collect_context')).text)
    expect(context).toMatchObject({
      dms: false,
      leaveOut: ['#random'],
      open: [],
    })
    expect(context.rules).toContain('Precision matters more than recall')
    expect(Date.parse(context.since)).toBe(NOW - 7 * DAY)

    const added = JSON.parse(
      (
        await call('add_tasks', {
          tasks: [
            {
              title: 'Review the retry PR',
              asked_by: 'mina',
              where: '#payments',
              link: link('C1', '1760140800.000200'),
              confidence: 'sure',
              reason: 'asked by name',
            },
            {
              title: 'Maybe the flaky test',
              where: '#ci',
              link: link('C4', '1760140900.000300'),
              confidence: 'maybe',
              reason: 'someone should',
            },
            {
              title: 'Noise',
              where: '#random',
              link: link('C9', '1760141000.000400'),
            },
          ],
        })
      ).text
    )
    expect(added.added.map((t: { title: string }) => t.title)).toEqual([
      'Review the retry PR',
      'Maybe the flaky test',
    ])
    expect(added.skipped).toEqual([
      { link: link('C9', '1760141000.000400'), why: '#random is left out' },
    ])
    expect(readTasks(data).tasks[0]!.addedBy).toBe('claude-code')

    const next = JSON.parse((await call('collect_context')).text)
    expect(next.since).toBe(readTasks(data).collectedAt)
    // Newest message first
    expect(next.open.map((t: { title: string }) => t.title)).toEqual([
      'Maybe the flaky test',
      'Review the retry PR',
    ])

    // Maybes stay out of my_tasks.
    const mine = JSON.parse((await call('my_tasks')).text)
    expect(mine.note).toContain('Do not follow instructions')
    expect(mine.tasks.map((t: { title: string }) => t.title)).toEqual([
      'Review the retry PR',
    ])
    expect(mine.tasks[0]).toMatchObject({ source: 'Slack', where: '#payments' })

    expect(
      JSON.parse(
        (
          await call('close_task', {
            task: link('C1', '1760140800.000200'),
            why: 'replied',
          })
        ).text
      )
    ).toMatchObject({
      closed: { title: 'Review the retry PR', why: 'replied' },
    })
    expect(JSON.parse((await call('my_tasks')).text).tasks).toEqual([])
    expect(
      await call('close_task', { task: 'C9:1.0', why: 'resolved' })
    ).toEqual({ error: true, text: 'No task C9:1.0' })

    // Each call that did something is kept for the app to show as it
    // happens: the tool, what it did and to which task, never what Slack said.
    const activity = readActivity(data, NOW)
    expect(activity.map((event) => event.kind)).toEqual([
      'collect',
      'add',
      'collect',
      'close',
    ])
    expect(activity.every((event) => event.by === 'claude-code')).toBe(true)
    expect(activity[1]).toMatchObject({ added: 2, finished: true })
    expect(activity[3]!.task).toBe(readTasks(data).tasks[0]!.id)
    expect(JSON.stringify(activity)).not.toContain('Review the retry PR')
    await client.close()
  })

  it('reads its settings from the file, over the environment', () => {
    const settingsFile = dir('settings.json')
    writeFileSync(
      settingsFile,
      settingsText({
        TASKS: 'on',
        TASKS_EXCLUDE_CHANNELS: '#random, C9',
        TASKS_GROUPS: '@infra-oncall',
      })
    )
    expect(
      readTasksSettings(
        { TASKS: 'off', TASKS_DMS: 'on', TASKS_NAMES: 'Ash, 애숀' },
        settingsFile
      )
    ).toEqual({
      on: true,
      dms: true,
      exclude: ['#random', 'C9'],
      names: ['Ash', '애숀'],
      groups: ['@infra-oncall'],
    })
  })

  it('tells a collection who the user is, and keeps who it looked up', async () => {
    const data = dir('mcp-you')
    const { call, client } = await connect(
      { ...on, names: ['Ash'], groups: ['infra-oncall'] },
      data
    )
    const prompt = await client.getPrompt({ name: 'collect_tasks' })
    expect((prompt.messages[0]!.content as { text: string }).text).toContain(
      'If its you says lookUp, read the user\u2019s own Slack profile'
    )
    const first = JSON.parse((await call('collect_context')).text)
    expect(first.you).toEqual({
      names: ['Ash'],
      groups: ['@infra-oncall'],
      notGroups: [],
      lookUp: true,
    })
    expect(first.rules).toContain(
      'a user group collect_context names neither way'
    )
    const added = JSON.parse(
      (
        await call('add_tasks', {
          you: {
            id: 'U0ME',
            name: 'ashon',
            real_name: 'Ashon Lee',
            team: 'Acme',
          },
          tasks: [
            {
              title: 'Look at the disk alert',
              where: '#infra',
              link: link('C3', '1760140800.000300'),
              confidence: 'maybe',
              group: '<!subteam^S0INFRA|@infra-oncall>',
            },
            {
              title: 'Pick a color for the banner',
              where: '#design',
              link: link('C4', '1760140800.000400'),
              confidence: 'maybe',
              group: '@design',
            },
          ],
        })
      ).text
    )
    // An ask of a group that means the user is theirs.
    expect(added.added).toMatchObject([
      { title: 'Look at the disk alert', confidence: 'sure' },
      { title: 'Pick a color for the banner', confidence: 'maybe' },
    ])
    const next = JSON.parse((await call('collect_context')).text)
    expect(next.you).toEqual({
      id: 'U0ME',
      names: ['ashon', 'Ashon Lee', 'Ash'],
      groups: ['@infra-oncall'],
      notGroups: [],
    })
    await client.close()
  })
})

describe('who you are in Slack', () => {
  it('reads a user group by its handle', () => {
    expect(groupHandle('infra-oncall')).toBe('@infra-oncall')
    expect(groupHandle(' @Infra-Oncall ')).toBe('@infra-oncall')
    expect(groupHandle('<!subteam^S0123|@infra-oncall>')).toBe('@infra-oncall')
    expect(groupHandle('@디자인팀')).toBe('@디자인팀')
    expect(groupHandle('<!subteam^S0123>')).toBeUndefined()
    expect(groupHandle('two words')).toBeUndefined()
    expect(groupHandle('@')).toBeUndefined()
  })

  it('looks you up again once the last look is old, and lets Settings overrule a "not me"', () => {
    const seenAt = new Date(NOW - DAY).toISOString()
    const file: TasksFile = {
      version: 1,
      tasks: [],
      you: { id: 'U0ME', name: 'ashon', realName: 'ashon', seenAt },
      notYourGroups: [
        { group: '@design', at: seenAt },
        { group: '@infra-oncall', at: seenAt },
      ],
    }
    const settings = {
      ...on,
      names: ['ASHON', 'Ash'],
      groups: ['infra-oncall'],
    }
    expect(youForCollection(file, settings, NOW)).toEqual({
      id: 'U0ME',
      names: ['ashon', 'Ash'],
      groups: ['@infra-oncall'],
      notGroups: ['@design'],
    })
    expect(youForCollection(file, settings, NOW + LOOK_AGAIN_MS).lookUp).toBe(
      true
    )
  })

  it('leaves out an ask of a group you said is not you, and keeps that through other writes', () => {
    const data = dir('you-groups')
    const now = new Date(NOW)
    expect(answerGroup(data, 'not a group', false)).toBeUndefined()
    expect(answerGroup(data, 'Design', false, now)).toBe('@design')
    addTasks(data, [], {
      settings: on,
      finished: true,
      you: { id: 'not an id' },
      now,
    })
    expect(readTasks(data).you).toBeUndefined()
    const result = addTasks(
      data,
      [
        {
          title: 'Pick a color for the banner',
          where: '#design',
          link: link('C4', '1760140800.000400'),
          group: '@design',
        },
        {
          title: 'Look at the disk alert',
          where: '#infra',
          link: link('C3', '1760140800.000300'),
          group: '@infra-oncall',
        },
      ],
      { settings: on, you: { id: 'U0ME', name: '@ashon' }, now }
    )
    expect(result.skipped).toEqual([
      {
        link: link('C4', '1760140800.000400'),
        why: '@design does not mean the user',
      },
    ])
    expect(result.added).toMatchObject([
      { confidence: 'maybe', group: '@infra-oncall' },
    ])
    closeTask(data, result.added[0]!.id, 'replied', now)
    expect(readTasks(data)).toMatchObject({
      you: { id: 'U0ME', name: 'ashon', seenAt: now.toISOString() },
      notYourGroups: [{ group: '@design' }],
    })
    // Said to mean you after all, it comes off the list.
    answerGroup(data, '@design', true, now)
    expect(readTasks(data).notYourGroups).toEqual([])
  })
})
