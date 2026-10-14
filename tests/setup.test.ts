import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { SetupStore } from '../apps/desktop/src/setup.js'
import { loadConfig } from '../src/config.js'
import { checkCli } from '../src/reasoners/host-check.js'
import { IMAGE_RECIPES } from '../src/sandbox/vm-images.js'
import {
  mergeProgress,
  PART_TITLES,
  vmSetupProgress,
} from '../src/sandbox/vm-progress.js'
import { pairStartFailure } from '../apps/desktop/src/hub-pairing.js'
import {
  prepareEarly,
  reopened,
  setupView,
  stepToFix,
} from '../src/settings/setup.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-setup-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('first-run setup', () => {
  it('opens on a first run, and not for a Pacenote set up before it', () => {
    expect(
      setupView(undefined, { configured: false, answered: false }).view
    ).toEqual({ open: true, record: { step: 'ai' } })
    const before = setupView(
      undefined,
      { configured: true, answered: false },
      new Date('2026-10-14T00:00:00Z')
    )
    expect(before.view.open).toBe(false)
    expect(before.migrated).toEqual({
      step: 'answer',
      finishedAt: '2026-10-14T00:00:00.000Z',
    })
    expect(
      setupView(undefined, { configured: false, answered: true }).view.open
    ).toBe(false)
    // Left unfinished, it opens again where it got to.
    expect(
      setupView({ step: 'slack' }, { configured: true, answered: true }).view
    ).toEqual({ open: true, record: { step: 'slack' } })
  })

  it('keeps the furthest step, who you are, and when it finished', () => {
    const dir = mkdtempSync(path.join(root, 'store-'))
    let before = { configured: false, answered: false }
    const store = new SetupStore(dir, () => before)
    expect(store.view().record.step).toBe('ai')
    store.save({ step: 'slack', slack: 'app' })
    // Going back to an earlier step does not lose how far it got.
    expect(store.save({ step: 'runtime' }).record).toEqual({
      step: 'slack',
      slack: 'app',
    })
    store.save({ me: { id: 'U0ALICE', name: 'alice' }, nonsense: true })
    // Saved with Pace configured: still unfinished, so it stays open.
    before = { configured: true, answered: false }
    expect(store.view()).toMatchObject({
      open: true,
      record: { me: { id: 'U0ALICE', name: 'alice' } },
    })
    const done = store.save({ step: 'answer', finished: true })
    expect(done.open).toBe(false)
    expect(done.record.finishedAt).toEqual(expect.any(String))
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual(done.record)
  })

  it('opens again where it was, from the review at the latest', () => {
    const dir = mkdtempSync(path.join(root, 'reopen-'))
    const store = new SetupStore(dir, () => ({
      configured: false,
      answered: false,
    }))
    store.save({
      step: 'answer',
      slack: 'app',
      answerSince: '2026-10-14T00:00:00Z',
    })
    store.save({ me: { id: 'U0ALICE', name: 'alice' }, finished: true })
    // Left for Settings, then back to the steps: the first answer it waited
    // for is no longer waited for.
    expect(store.save({ finished: false })).toEqual({
      open: true,
      record: {
        step: 'review',
        slack: 'app',
        me: { id: 'U0ALICE', name: 'alice' },
      },
    })
    expect(reopened({ step: 'slack', finishedAt: 'x' })).toEqual({
      step: 'slack',
    })
  })

  it('a Pacenote set up before setup existed is marked done once', () => {
    const dir = mkdtempSync(path.join(root, 'migrate-'))
    const store = new SetupStore(dir, () => ({
      configured: true,
      answered: true,
    }))
    expect(store.view().open).toBe(false)
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toMatchObject({
      finishedAt: expect.any(String),
    })
  })
})

describe('what keeps Pace from starting', () => {
  it('leads to the step that fixes it', () => {
    expect(stepToFix([{ key: 'MENTION_ALLOWED_USERS' }])).toBe('slack')
    expect(stepToFix([{ key: 'HUB_TOKEN' }])).toBe('slack')
    expect(stepToFix([{ key: 'REASONER_TIMEOUT_SEC' }])).toBe('ai')
    expect(stepToFix([{ key: 'SANDBOX_CLAUDE_OAUTH_TOKEN' }])).toBe('runtime')
    // Without settings named, by what the message says
    expect(stepToFix([], 'Slack rejected the bot token (invalid_auth).')).toBe(
      'slack'
    )
    expect(stepToFix(undefined, 'claude is not signed in.')).toBe('ai')
    expect(stepToFix(undefined, 'Pace stopped right after starting.')).toBe(
      undefined
    )
  })

  it("says why a hub handed out no code: the address, the network, or the hub's side", () => {
    const url = 'https://hub.example.com'
    expect(pairStartFailure(url, 'fetch failed')).toBe(
      "Couldn't reach a hub at https://hub.example.com. Check the address and your network."
    )
    expect(pairStartFailure(url, 'HTTP 404')).toMatch(
      /^No Pacenote hub answers/
    )
    expect(pairStartFailure(url, 'HTTP 502')).toMatch(
      /had a problem \(HTTP 502\)/
    )
    expect(pairStartFailure(url, 'pairing_closed')).toMatch(/pairing_closed$/)
  })
})

describe('preparing the built-in sandbox early', () => {
  it('starts at once where it can run, unless this Mac was chosen or it is ready', () => {
    const fresh = { setting: '', ready: false, started: false }
    expect(prepareEarly(fresh)).toBe(true)
    expect(prepareEarly({ ...fresh, setting: 'vm' })).toBe(true)
    expect(prepareEarly({ ...fresh, setting: 'none' })).toBe(false)
    expect(prepareEarly({ ...fresh, ready: true })).toBe(false)
    expect(prepareEarly({ ...fresh, started: true })).toBe(false)
    expect(
      prepareEarly({ ...fresh, unsupported: 'Needs macOS 15 or later.' })
    ).toBe(false)
  })
})

describe('what setup finds on this Mac', () => {
  const cli =
    (answers: Record<string, string | Error>) => async (args: string[]) => {
      const answer = answers[args.join(' ')]
      if (answer === undefined) throw new Error(`unexpected ${args.join(' ')}`)
      if (answer instanceof Error) throw answer
      return { stdout: answer, stderr: '' }
    }

  it('tells installed, signed in, its version and what to do', async () => {
    expect(
      await checkCli(
        'claude',
        'claude',
        cli({
          '--version': '2.1.296 (Claude Code)',
          'auth status --json': '{"loggedIn": true}',
        })
      )
    ).toEqual({
      backend: 'claude',
      installed: true,
      version: '2.1.296',
      signedIn: true,
      problems: [],
    })
    expect(
      await checkCli(
        'codex',
        'codex',
        cli({
          '--version': 'codex-cli 0.120.0',
          'login status': 'Not logged in',
        })
      )
    ).toMatchObject({
      installed: true,
      signedIn: false,
      tooOld: true,
      problems: [
        expect.stringMatching(/^codex 0\.120\.0 is too old/),
        expect.stringMatching(/not signed in.*codex login/),
      ],
    })
    expect(
      await checkCli(
        'codex',
        'codex',
        cli({ '--version': new Error('spawn codex ENOENT: not found') })
      )
    ).toMatchObject({ installed: false, signedIn: false })
  })
})

describe('preparing the built-in sandbox', () => {
  it('names the parts its setup logs', () => {
    expect(Object.values(PART_TITLES)).toEqual(
      Object.values(IMAGE_RECIPES).map((recipe) => recipe.title)
    )
  })

  it('reads how far the setup has come from its output', () => {
    const output = [
      '$ sandbox-job vm',
      'Linux kernel: downloading from registry',
      'Linux kernel: ready (hash checked)',
      'Init filesystem (vminitd)',
      'Reasoner image: building on alpine with claude 2 and codex 1',
    ]
    const progress = vmSetupProgress(
      { state: 'running', output },
      { renderer: true }
    )
    expect(progress.parts.map((part) => [part.id, part.state])).toEqual([
      ['kernel', 'done'],
      ['init', 'done'],
      ['reasoner', 'working'],
      ['renderer', 'waiting'],
    ])
    expect(progress.fraction).toBe(0.5)
    // With diagrams off, their image is not part of it.
    expect(
      vmSetupProgress({
        state: 'running',
        output: [
          ...output,
          'Diagram renderer image: not built (diagrams are off)',
        ],
      }).parts.map((part) => part.id)
    ).toEqual(['kernel', 'init', 'reasoner'])
    // A failed job marks the part it was on.
    expect(
      vmSetupProgress({ state: 'failed', output }).parts.at(-1)
    ).toMatchObject({ id: 'reasoner', state: 'failed' })
    expect(vmSetupProgress({ state: 'succeeded', output }).fraction).toBe(1)
  })

  it('keeps parts done once their lines scroll out of the output', () => {
    const early = vmSetupProgress({
      state: 'running',
      output: ['Linux kernel: present', 'Init filesystem (vminitd)'],
    })
    const later = vmSetupProgress({
      state: 'running',
      output: ['step 412/530 of the image build'],
    })
    expect(mergeProgress(early, later).parts.map((part) => part.state)).toEqual(
      ['done', 'working', 'waiting']
    )
  })
})

describe('diagrams', () => {
  const env = {
    SLACK_BOT_TOKEN: 'xoxb-1',
    SLACK_APP_TOKEN: 'xapp-1',
    MENTION_ALLOWED_USERS: 'U1',
  }

  it('are on unless turned off, and asked for only by name', () => {
    expect(loadConfig(env).render).toMatchObject({
      enabled: true,
      asked: false,
    })
    expect(loadConfig({ ...env, RENDER_DIAGRAMS: 'on' }).render).toMatchObject({
      enabled: true,
      asked: true,
    })
    expect(loadConfig({ ...env, RENDER_DIAGRAMS: 'off' }).render).toMatchObject(
      { enabled: false, asked: false }
    )
  })
})
