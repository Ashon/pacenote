import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import path from 'node:path'
import { _electron, type ElectronApplication, type Page } from 'playwright-core'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryReader } from '../../src/history/reader.js'
import { readDecisions } from '../../src/tasks/store.js'
import { addWork } from '../../src/tasks/work.js'
import { addTasks } from '../../src/tasks/write.js'
import { readEnvValues } from '../../src/settings/env-file.js'
import { settingsText } from '../../src/settings/settings-file.js'
import { eventually, REPO } from './support/processes.js'
import { World } from './support/world.js'

/**
 * Two of your Macs, as two copies of the desktop app on one fake Slack
 * workspace with the same Slack app: Pace answers on the Mac you're using and
 * moves when you leave it for the other (src/macs). Each copy has a home of
 * its own, and says how it is used through a file the test writes
 * (PACENOTE_MACS_USE_FILE). Needs a build (pnpm desktop:build), so it runs
 * only with E2E_APP=1.
 */

const ELECTRON = createRequire(path.join(REPO, 'apps/desktop/package.json'))(
  'electron'
) as unknown as string

let world: World | undefined
const apps: ElectronApplication[] = []
afterEach(async (context) => {
  if (context.task.result?.state === 'fail')
    for (const [index, app] of apps.entries()) {
      const file = path.join(
        REPO,
        'test-results',
        `${context.task.name.replace(/\W+/g, '-')}-${index}.png`
      )
      mkdirSync(path.dirname(file), { recursive: true })
      await (
        await app.firstWindow()
      )
        .screenshot({ path: file })
        .catch(() => undefined)
      console.error(`Screenshot: ${file}`)
    }
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await world?.stop()
  world = undefined
})

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise((resolve) => server.close(resolve))
  return port
}

interface Mac {
  name: string
  home: string
  port: number
  page: Page
  app: ElectronApplication
  /** How the Mac is used now */
  use(use: { idle: number; locked?: boolean; asleep?: boolean }): void
  /** The mentions Pace answered on this Mac */
  answered(): string[]
}

/** Opens one Mac: its home, settings with your own Slack app, and its use */
async function openMac(
  world: World,
  name: string,
  idle: number,
  options: {
    /** Settings beside your own Slack app's */
    settings?: string[]
    /** Addresses of your other Macs, as added before */
    addresses?: string[]
    /** Settings > Macs > Follow the Mac you're using, as turned on before */
    follow?: boolean
  } = {}
): Promise<Mac> {
  const home = homeOf(world, name)
  mkdirSync(home, { recursive: true })
  if (options.follow !== false)
    writeFileSync(
      path.join(home, 'macs.json'),
      JSON.stringify({ follow: true, addresses: options.addresses ?? [] })
    )
  writeFileSync(
    path.join(home, 'setup.json'),
    JSON.stringify({ step: 'answer', finishedAt: new Date().toISOString() })
  )
  writeFileSync(
    path.join(home, 'settings.json'),
    settingsText(
      readEnvValues(
        [
          'REASONER=claude',
          'REASONER_SANDBOX=none',
          'RENDER_DIAGRAMS=off',
          'TIMEZONE=UTC',
          `SLACK_API_URL=${world.slack.apiUrl}`,
          `SLACK_APP_TOKEN=${world.slack.appToken}`,
          `SLACK_BOT_TOKEN=${world.slack.botToken}`,
          `MENTION_ALLOWED_USERS=${world.alice.id}`,
          `CLAUDE_BIN=${world.claudeBin}`,
          `FAKE_CLAUDE_DIR=${world.claudeDir}`,
          `CODEX_BIN=${path.join(world.root, 'no-codex')}`,
          ...(options.settings ?? []),
          '',
        ].join('\n')
      )
    )
  )
  const useFile = path.join(home, 'use.json')
  const use: Mac['use'] = (value) =>
    writeFileSync(
      useFile,
      JSON.stringify({ locked: false, asleep: false, ...value })
    )
  use({ idle })
  const port = await freePort()
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !/^(PACENOTE|SLACK|HUB)_/.test(entry[0])
    )
  )
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [path.join(REPO, 'apps/desktop')],
    env: {
      ...env,
      HOME: world.root,
      PACENOTE_HOME: home,
      PACENOTE_DATA_DIR: home,
      PACENOTE_DESKTOP_USER_DATA: path.join(home, 'user-data'),
      PACENOTE_DESKTOP_THEME: 'light',
      PACENOTE_MACS_NAME: name,
      PACENOTE_MACS_PORT: String(port),
      PACENOTE_MACS_BONJOUR: 'off',
      PACENOTE_MACS_USE_FILE: useFile,
    },
  })
  apps.push(app)
  const page = await app.firstWindow()
  page.setDefaultTimeout(30_000)
  await page.waitForLoadState('domcontentloaded')
  return {
    name,
    home,
    port,
    page,
    app,
    use,
    answered: () => {
      const reader = new HistoryReader(home)
      return reader.list({ kind: 'mention' }).map((run) => run.request ?? '')
    },
  }
}

/** Where a Mac keeps its data in the test's world */
const homeOf = (world: World, name: string) =>
  path.join(world.root, name.replace(/\W+/g, '-'))

/** The Mac rows on Settings > Macs, as name and status */
async function macRows(page: Page): Promise<string[][]> {
  return page
    .locator('[data-mac]')
    .evaluateAll((rows) =>
      rows.map((row) => [
        row.querySelector('.text-row span')?.textContent ?? '',
        row.getAttribute('data-status') ?? '',
      ])
    )
}

describe.runIf(process.env.E2E_APP)('your Macs', () => {
  it('answers on the Mac you use, and moves with you to the other and back', async () => {
    world = await World.create([{ match: 'disk', answer: 'Disk is fine.' }])
    const { slack, ops, alice } = world

    // The Pro, in use, answers on its own at first.
    const pro = await openMac(world, 'MacBook Pro', 2)
    await pro.page.getByText(/Pace: Connected/).waitFor()
    await eventually(
      'the Pro connected to Slack',
      () => slack.connections === 1
    )

    // The Air comes along, left a while ago: you turn following on there and
    // tell it the Pro's address.
    const air = await openMac(world, 'MacBook Air', 400, { follow: false })
    await air.page.evaluate("window.location.hash = '#/settings/macs'")
    await air.page.getByRole('heading', { name: 'Your Macs' }).waitFor()
    await air.page.getByText('Turn it on here and on your other Mac').waitFor()
    await air.page.getByRole('switch').click()
    await air.page.getByRole('button', { name: 'Add by address' }).click()
    await air.page
      .getByLabel('Address of your other Mac')
      .fill(`127.0.0.1:${pro.port}`)
    await air.page.getByRole('button', { name: 'Add', exact: true }).click()
    await eventually('the Air standing by for the Pro', async () => {
      const rows = await macRows(air.page)
      return (
        JSON.stringify(rows) ===
        JSON.stringify([
          ['MacBook Air', 'standing-by'],
          ['MacBook Pro', 'answering'],
        ])
      )
    })
    await air.page.getByText('Pace: Standing by').waitFor()
    await air.page.getByText('MacBook Pro answers').waitFor()
    await pro.page.getByText('Answering here').waitFor()
    // One connection to Slack, the Pro's: a mention can only go there.
    await eventually('one Slack connection', () => slack.connections === 1)
    const first = await slack.mention({
      channel: ops.id,
      user: alice.id,
      text: `<@${slack.botUserId}> how is the disk on web-01?`,
    })
    await world.answered(ops.id, first)
    await eventually('the Pro answered', () =>
      pro.answered().some((request) => /web-01/.test(request))
    )
    expect(air.answered()).toEqual([])

    // You lock the Pro and use the Air: Pace moves there, connecting before
    // the Pro lets go.
    pro.use({ idle: 30, locked: true })
    air.use({ idle: 1 })
    await air.page.getByText('Pace moved here from MacBook Pro').waitFor()
    await pro.page.getByText('Pace: Standing by').waitFor()
    await pro.page.getByText('MacBook Air answers').waitFor()
    await eventually('one Slack connection', () => slack.connections === 1)
    const second = await slack.mention({
      channel: ops.id,
      user: alice.id,
      text: `<@${slack.botUserId}> and the disk on web-02?`,
    })
    await world.answered(ops.id, second)
    await eventually('the Air answered', () =>
      air.answered().some((request) => /web-02/.test(request))
    )
    expect(pro.answered().some((request) => /web-02/.test(request))).toBe(false)

    // Back at the Pro, both in use: it stays on the Air until you ask.
    pro.use({ idle: 1 })
    await pro.page.evaluate("window.location.hash = '#/settings/macs'")
    await pro.page
      .locator('[data-mac="here"][data-status="standing-by"]')
      .waitFor()
    await pro.page.getByRole('button', { name: 'Answer here' }).click()
    await pro.page.getByText('Pace moved here from MacBook Air').waitFor()
    await air.page.getByText('Pace: Standing by').waitFor()

    // The Pro quits: the Air answers, though no one uses it.
    air.use({ idle: 400 })
    await apps.splice(apps.indexOf(pro.app), 1)[0]!.close()
    await air.page.getByText(/Pace: Connected/).waitFor()
    await air.page
      .locator('[data-mac="MacBook Pro"][data-status="out-of-reach"]')
      .waitFor()
    await eventually('one Slack connection', () => slack.connections === 1)
  })

  it('keeps your Todo the same on both Macs', async () => {
    world = await World.create()
    const now = Date.now()
    const on = { on: true, dms: false, exclude: [] }
    const link = (at: number) =>
      `https://acme.slack.com/archives/C0OPS/p${String(Math.floor(at / 1000))}000100`
    // Each Mac found a task of its own before they met, and the Pro has a
    // session for its task.
    const proHome = homeOf(world, 'MacBook Pro')
    const airHome = homeOf(world, 'MacBook Air')
    mkdirSync(proHome, { recursive: true })
    mkdirSync(airHome, { recursive: true })
    const [review] = addTasks(
      proHome,
      [
        {
          title: 'Review the payment retry PR',
          asked_by: 'mina',
          where: '#ops',
          link: link(now - 3_600_000),
          confidence: 'sure',
          action: 'code',
          repo: 'Ashon/payments',
          summary: 'mina wants a review of PR #482.',
        },
      ],
      { settings: on, now: new Date(now - 3_600_000) }
    ).added
    addWork(proHome, {
      kind: 'session',
      id: 'review-work',
      task: review!.id,
      tool: 'claude',
      session: '7c1e40b2-0000-4000-8000-000000000001',
      cwd: path.join(world.root, 'git', 'payments'),
      startedAt: new Date(now - 1_800_000).toISOString(),
    })
    const [answer] = addTasks(
      airHome,
      [
        {
          title: 'Answer hyun about the webhook retry limit',
          asked_by: 'hyun',
          where: '#ops',
          link: link(now - 7_200_000),
          confidence: 'sure',
          summary: 'hyun asks how many times webhooks retry.',
        },
      ],
      { settings: on, now: new Date(now - 7_200_000) }
    ).added

    const pro = await openMac(world, 'MacBook Pro', 2, {
      settings: ['TASKS=on'],
    })
    const air = await openMac(world, 'MacBook Air', 400, {
      settings: ['TASKS=on'],
      addresses: [`127.0.0.1:${pro.port}`],
    })
    // Each Mac's Todo has the other's task too, waiting to be shown as new
    // like any task that comes in while you look.
    for (const [mac, own, other] of [
      [pro, review!, answer!],
      [air, answer!, review!],
    ] as const) {
      await mac.page.evaluate("window.location.hash = '#/tasks'")
      await mac.page.locator(`[data-task-row="${own.id}"]`).waitFor()
      const row = mac.page.locator(`[data-task-row="${other.id}"]`)
      const shown = mac.page.getByRole('button', { name: '1 new task' })
      await row.or(shown).first().waitFor()
      if (await shown.isVisible()) await shown.click()
      await row.waitFor()
    }

    // Done on the Air: done on the Pro too.
    const answerOnAir = air.page.locator(`[data-task-row="${answer!.id}"]`)
    await answerOnAir.getByRole('button', { name: 'Done' }).click()
    await eventually(
      'the decision on the Pro',
      () => readDecisions(pro.home)[answer!.id]?.status === 'done'
    )
    await pro.page
      .locator(`[data-task-row="${answer!.id}"]`)
      .waitFor({ state: 'detached' })

    // The Pro's session continues there; the Air starts one of its own.
    const reviewOnAir = air.page.locator(`[data-task-row="${review!.id}"]`)
    await reviewOnAir.getByText('Review the payment retry PR').click()
    await reviewOnAir.getByText(/On MacBook Pro/).waitFor()
    await reviewOnAir.getByRole('button', { name: 'Start here' }).waitFor()
  })
})
