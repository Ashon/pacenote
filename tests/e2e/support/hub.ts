import path from 'node:path'
import { eventually, type ManagedProcess, startHub } from './processes.js'
import type { World } from './world.js'

/**
 * Starts a team hub for the world: it holds the Slack app (Socket Mode against
 * the fake Slack) and listens on a port of its own on this computer.
 */
export async function withHub(
  world: World
): Promise<{ hub: ManagedProcess; url: string }> {
  const hub = world.track(
    startHub({
      HOME: world.root,
      SLACK_BOT_TOKEN: world.slack.botToken,
      SLACK_APP_TOKEN: world.slack.appToken,
      SLACK_API_URL: world.slack.apiUrl,
      HUB_PORT: '0',
      HUB_HOST: '127.0.0.1',
      HUB_DATA_DIR: path.join(world.root, 'hub'),
      LOG_LEVEL: 'debug',
    })
  )
  const [, port] = await hub.waitFor(/listening on 127\.0\.0\.1:(\d+)/)
  await eventually(
    "the hub's Socket Mode connection",
    () => world.slack.connections === 1
  )
  return { hub, url: `http://127.0.0.1:${port}` }
}
