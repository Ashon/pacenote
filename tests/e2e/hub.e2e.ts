import { afterEach, describe, expect, it } from 'vitest'
import { HubClient, newHubToken } from '../../src/hub/client.js'
import { withHub } from './support/hub.js'
import { eventually, startBot } from './support/processes.js'
import { World } from './support/world.js'

/**
 * The team hub: the hub process holds the Slack app (Socket Mode against the
 * fake Slack), and a member's desktop pairs with a code sent in Slack, then
 * answers that member's mentions through the hub without a Slack token.
 */

let world: World | undefined
afterEach(async () => {
  await world?.stop()
  world = undefined
})

/**
 * Pairs a desktop for the member the way Settings does: a code, sent to the bot
 * in Slack, then confirmed
 */
async function pair(world: World, url: string, user: string): Promise<string> {
  const client = new HubClient(url)
  const { token, tokenHash } = newHubToken()
  const started = await client.pairStart(tokenHash, 'e2e-mac')
  await world.slack.mention({
    channel: world.ops.id,
    user,
    text: `<@${world.slack.botUserId}> connect ${started.code}`,
  })
  const status = await eventually('the code to be bound', async () => {
    const s = await client.pairStatus(started.pairingId)
    return s.status === 'bound' ? s : undefined
  })
  expect(status.user.id).toBe(user)
  await client.pairConfirm(started.pairingId, token)
  return token
}

/**
 * A desktop paired with the hub: no Slack tokens or Slack URL, only the hub's
 * address and its own token
 */
function desktopEnv(
  world: World,
  url: string,
  token: string
): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(world.botEnv()).filter(([key]) => !key.startsWith('SLACK_'))
  )
  return { ...env, SLACK_CONNECTION: 'hub', HUB_URL: url, HUB_TOKEN: token }
}

describe('team hub', () => {
  it('pairs a desktop with a code the member sends in Slack', async () => {
    world = await World.create()
    const { url } = await withHub(world)
    const token = await pair(world, url, world.alice.id)

    expect(world.slack.ephemerals.at(-1)).toMatchObject({
      user: world.alice.id,
      text: expect.stringContaining('Code accepted for "e2e-mac"'),
    })
    const me = await new HubClient(url).me(token)
    expect(me).toMatchObject({
      user: { id: world.alice.id, name: 'alice' },
      connected: false,
    })
  })

  it("answers a paired member's mention on their desktop, which never holds a Slack token", async () => {
    world = await World.create([
      { match: 'log', answer: 'The **db** timed out.' },
    ])
    const { slack, ops, alice } = world
    slack.addFile({
      id: 'F0LOG',
      name: 'app.log',
      mimetype: 'text/plain',
      content: Buffer.from('ERROR db timeout\n'),
    })
    const { url } = await withHub(world)
    const token = await pair(world, url, alice.id)
    const desktop = world.track(startBot(desktopEnv(world, url, token)))
    await desktop.waitFor(/Started: /)
    await eventually("the desktop's hub connection", async () =>
      (await new HubClient(url).me(token)).connected ? true : undefined
    )

    const ts = await slack.mention({
      channel: ops.id,
      user: alice.id,
      text: `<@${slack.botUserId}> what does this log say?`,
      files: ['F0LOG'],
    })
    const [reply] = await world.answered(ops.id, ts)
    expect(reply!.text).toBe(
      'The *db* timed out.\n\n_AI answer by Pace, with Claude Code_'
    )
    expect(world.claudeCalls()[0]!.prompt).toContain('ERROR db timeout')
    // Every call reached Slack with the hub's bot token; the desktop only ever
    // had its hub token.
    expect(new Set(slack.calls.map((call) => call.token))).toEqual(
      new Set([slack.botToken, slack.appToken])
    )
    // The hub relays the 👀 on the mention, and the answer is a new reply.
    expect(slack.callsTo('reactions.add')).toHaveLength(1)
    expect(slack.callsTo('chat.update')).toHaveLength(0)
    // The answer is posted before the run record is closed, so wait for the
    // record.
    const run = await eventually('the finished run', () =>
      world!.runs().find((r) => r.status !== 'running')
    )
    expect(run).toMatchObject({
      status: 'succeeded',
      origin: { userName: 'alice' },
    })
  })

  it('reads a long thread through the hub, and tells only the member what to fix when their Mac fails', async () => {
    world = await World.create([
      { match: 'sum up', answer: 'Summed up.' },
      { match: 'boom', fail: 'something odd happened' },
    ])
    const { slack, ops, alice, bob } = world
    const root = slack.post(ops.id, { user: bob.id, text: 'Release 4.2 plan' })
    for (let i = 1; i <= 250; i++)
      slack.post(ops.id, { user: bob.id, text: `step ${i}`, thread_ts: root })
    const { url } = await withHub(world)
    const token = await pair(world, url, alice.id)
    const desktop = world.track(startBot(desktopEnv(world, url, token)))
    await desktop.waitFor(/Started: /)
    await eventually("the desktop's hub connection", async () =>
      (await new HubClient(url).me(token)).connected ? true : undefined
    )

    await slack.mention({
      channel: ops.id,
      user: alice.id,
      text: `<@${slack.botUserId}> sum up`,
      thread_ts: root,
    })
    await world.answered(ops.id, root)
    // The hub lets the next pages through: the latest step is there.
    const [call] = world.claudeCalls()
    expect(call!.prompt).toContain('Release 4.2 plan')
    expect(call!.prompt).toContain('step 250\n')

    await slack.mention({
      channel: ops.id,
      user: alice.id,
      text: `<@${slack.botUserId}> boom`,
      thread_ts: root,
    })
    // Only the member hears why, told to look on their own Mac.
    const notice = await eventually('the failure notice', () =>
      slack.ephemerals.find((e) => e.text.startsWith("I couldn't produce"))
    )
    expect(notice).toMatchObject({
      user: alice.id,
      text: "I couldn't produce an answer: something went wrong on my side. Pacenote on your Mac shows what.",
    })
    expect(slack.replies(ops.id, root)).toHaveLength(1)
  })

  it('tells a member whose desktop is not paired', async () => {
    world = await World.create()
    const { url } = await withHub(world)
    await pair(world, url, world.alice.id)

    await world.slack.mention({
      channel: world.ops.id,
      user: world.bob.id,
      text: `<@${world.slack.botUserId}> hi`,
    })
    await eventually('the notice', () =>
      world!.slack.ephemerals.find((e) => e.user === world!.bob.id)
    )
    expect(
      world.slack.ephemerals.find((e) => e.user === world!.bob.id)?.text
    ).toContain('yours is not connected yet')
    expect(world.claudeCalls()).toEqual([])
  })

  it('stops a desktop that was disconnected, with the reason the app shows', async () => {
    world = await World.create()
    const { url } = await withHub(world)
    const token = await pair(world, url, world.alice.id)
    const desktop = world.track(startBot(desktopEnv(world, url, token)))
    await desktop.waitFor(/Started: /)
    await eventually("the desktop's hub connection", async () =>
      (await new HubClient(url).me(token)).connected ? true : undefined
    )

    await new HubClient(url).disconnect(token)
    const { code } = await desktop.exited
    expect(code).toBe(1)
    // The desktop app reads this to ask for pairing again (bot-readiness.ts).
    expect(desktop.output).toContain('hub_revoked')
  })
})
