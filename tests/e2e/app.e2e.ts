import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { _electron, type ElectronApplication, type Page } from 'playwright-core'
import { afterEach, describe, expect, it } from 'vitest'
import { REPO } from './support/processes.js'
import * as vm from './support/vm.js'
import { World } from './support/world.js'

/**
 * The desktop app as a member uses it, driven through its window: first run,
 * Slack tokens in Settings, starting the bot, a mention answered, and the run
 * in the history. Needs a build (pnpm desktop:build), so it runs only with
 * E2E_APP=1 (pnpm test:e2e:app). The window opens on screen while it runs.
 */

const ELECTRON = createRequire(path.join(REPO, 'apps/desktop/package.json'))(
  'electron'
) as unknown as string

let world: World | undefined
let app: ElectronApplication | undefined
afterEach(async (context) => {
  // A failed step leaves a screenshot of the window behind (the path is in the
  // error output).
  if (context.task.result?.state === 'fail' && app) {
    const file = path.join(
      REPO,
      'test-results',
      `${context.task.name.replace(/\W+/g, '-')}.png`
    )
    mkdirSync(path.dirname(file), { recursive: true })
    await (
      await app.firstWindow()
    )
      .screenshot({ path: file })
      .catch(() => undefined)
    console.error(`Screenshot: ${file}`)
  }
  await app?.close()
  app = undefined
  await world?.stop()
  world = undefined
})

/**
 * Opens the app on the world. settings: lines the settings file has besides
 * what any member would have set before (all but the Slack tokens, which the
 * first test enters in Settings); env: the app's environment on top.
 */
async function launch(
  world: World,
  options: { settings?: string[]; env?: Record<string, string> } = {}
): Promise<Page> {
  mkdirSync(world.home, { recursive: true })
  writeFileSync(
    path.join(world.home, '.env'),
    [
      'REASONER=claude',
      'REASONER_SANDBOX=none',
      'RENDER_DIAGRAMS=off',
      'TIMEZONE=UTC',
      `SLACK_API_URL=${world.slack.apiUrl}`,
      `CLAUDE_BIN=${world.claudeBin}`,
      `FAKE_CLAUDE_DIR=${world.claudeDir}`,
      ...(options.settings ?? []),
      '',
    ].join('\n')
  )
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !/^(PACENOTE|SLACK|HUB)_/.test(entry[0])
    )
  )
  app = await _electron.launch({
    executablePath: ELECTRON,
    args: [path.join(REPO, 'apps/desktop')],
    env: {
      ...env,
      // Its own HOME, so the bot lock does not see a real Pacenote running from
      // its home.
      HOME: world.root,
      PACENOTE_HOME: world.home,
      PACENOTE_DATA_DIR: world.home,
      PACENOTE_DESKTOP_USER_DATA: path.join(world.root, 'user-data'),
      PACENOTE_DESKTOP_THEME: 'light',
      ...options.env,
    },
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(20_000)
  await page.waitForLoadState('domcontentloaded')
  return page
}

async function enterSecret(
  page: Page,
  key: string,
  value: string,
  submit: 'enter' | 'click'
) {
  const row = page.locator(`[data-setting="${key}"]`)
  await row.getByRole('button', { name: /^(Enter|Change)$/ }).click()
  await row.locator('input[type="password"]').fill(value)
  if (submit === 'enter')
    await row.locator('input[type="password"]').press('Enter')
  else await row.getByRole('button', { name: 'Save', exact: true }).click()
}

describe.runIf(process.env.E2E_APP)('desktop app', () => {
  it('sets up Slack from a first run, starts the bot, and shows the answered mention', async () => {
    world = await World.create([
      { match: 'web-01', answer: '**Healthy**. Up 3 days.' },
    ])
    const { slack, ops, alice } = world
    const page = await launch(world)

    // A first run has no Slack tokens: the bot waits for setup and the status
    // bar says so.
    await page.getByText('Pace: Setup needed').waitFor()
    await page.getByRole('button', { name: 'Open Settings' }).first().click()
    await page.getByRole('heading', { name: 'Messengers' }).waitFor()

    // Each token is saved on its own, from beside its input.
    await enterSecret(page, 'SLACK_APP_TOKEN', slack.appToken, 'enter')
    await page
      .getByText('Saved the app token. Enter the bot token next.')
      .waitFor()
    await enterSecret(page, 'SLACK_BOT_TOKEN', slack.botToken, 'click')
    // Your own app answers no one until it knows who may ask.
    await page
      .getByText(
        'Saved the bot token. Next, add your Slack member ID under Who can ask.'
      )
      .waitFor()
    expect(
      await page.locator('[data-setting="SLACK_BOT_TOKEN"]').textContent()
    ).toContain('xoxb-...-bot')

    // The connection check runs against the same Slack the bot will use.
    await page.getByRole('button', { name: 'Check connection' }).click()
    await page.getByText('Socket Mode', { exact: true }).waitFor()

    await page
      .locator('[data-setting="MENTION_ALLOWED_USERS"] input')
      .fill(alice.id)
    await page.getByRole('button', { name: 'Save and start Pace' }).click()
    await page.getByText(/Pace: Connected/).waitFor({ timeout: 30_000 })

    const ts = await slack.mention({
      channel: ops.id,
      user: alice.id,
      text: `<@${slack.botUserId}> how is web-01?`,
    })
    const [reply] = await world.answered(ops.id, ts)
    expect(reply!.text).toBe('*Healthy*. Up 3 days.')

    // The run shows up in the history with the answer and a link back to the
    // mention in Slack.
    await page.evaluate("window.location.hash = '#/runs'")
    await page.getByText('how is web-01?').first().click({ timeout: 15_000 })
    await page.getByText('Up 3 days.').first().waitFor()
    const link = page.getByRole('link', { name: 'View in Slack' })
    expect(await link.getAttribute('href')).toBe(
      `${slack.url}/archives/${ops.id}/p${ts.replace('.', '')}`
    )
  })

  it.skipIf(vm.skip !== undefined)(
    'runs Pace in the built-in sandbox chosen in Settings',
    async () => {
      await vm.prepare()
      world = await World.create()
      const { slack, ops, alice } = world
      mkdirSync(path.join(world.home, 'sandbox'), { recursive: true })
      writeFileSync(
        path.join(world.home, 'sandbox/allowed-domains.txt'),
        'api.anthropic.com\n'
      )
      const page = await launch(world, {
        settings: [
          `SLACK_APP_TOKEN=${slack.appToken}`,
          `SLACK_BOT_TOKEN=${slack.botToken}`,
          'MENTION_ANYONE=on',
        ],
        env: {
          PACENOTE_VM_BIN: vm.BIN,
          PACENOTE_VM_ROOT: vm.ROOT,
          // Checking the sandbox login asks nothing outside this computer.
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
        },
      })
      await page.getByText(/Pace: Connected/).waitFor({ timeout: 30_000 })

      await page.evaluate("window.location.hash = '#/settings/sandbox'")
      await page.getByRole('radio', { name: /^Built-in sandbox/ }).click()
      await enterSecret(
        page,
        'SANDBOX_CLAUDE_OAUTH_TOKEN',
        'sk-ant-oat01-e2e',
        'enter'
      )
      // The built-in sandbox's choice says it is ready, beside the job that
      // sets it up; under the choices, what it has ready.
      const builtInChoice = page.locator('[data-choice="vm"]')
      await builtInChoice.getByText('Ready', { exact: true }).waitFor()
      await builtInChoice
        .getByRole('button', { name: 'Set up built-in sandbox' })
        .waitFor()
      await page.getByText('Linux kernel').waitFor()
      await page
        .getByText(/^Built .* on docker\.io\/library\/node:24-alpine$/)
        .waitFor()
      await builtInChoice.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: path.join(REPO, 'test-results/built-in-sandbox.png'),
        fullPage: true,
      })

      await page.getByRole('button', { name: 'Save and restart Pace' }).click()
      // Pace starts again, in a VM this time.
      await expect
        .poll(() => world?.status()?.reasoner, { timeout: 60_000 })
        .toBe('claude@vm')

      const ts = await slack.mention({
        channel: ops.id,
        user: alice.id,
        text: `<@${slack.botUserId}> where do you run?`,
      })
      const [reply] = await world.answered(ops.id, ts)
      expect(reply!.text).toBe(
        'From the VM: Linux aarch64, uid 1000, network devices: lo, login set, example.com 403'
      )
    },
    240_000
  )
})
