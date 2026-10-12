import { describe, expect, it } from 'vitest'
import {
  currentTroubles,
  newTroubles,
  SOCKET_LOST_MS,
  unknownWithoutBot,
} from '../apps/desktop/src/troubles.js'
import type { BotStatus, SupervisorState } from '../src/runtime/types.js'

const NOW = Date.parse('2026-10-12T12:00:00Z')

const supervisor = (patch: Partial<SupervisorState> = {}): SupervisorState => ({
  phase: 'running',
  output: [],
  autoStart: true,
  restarts: 0,
  canBuild: false,
  ...patch,
})

const status = (patch: Partial<BotStatus> = {}): BotStatus => ({
  version: 1,
  pid: 1,
  startedAt: '2026-10-12T11:00:00Z',
  updatedAt: '2026-10-12T11:59:00Z',
  state: 'running',
  managedBy: 'desktop',
  socket: { state: 'connected', since: '2026-10-12T11:00:00Z', reconnects: 0 },
  problems: [],
  requests: { active: 0, handled: 0 },
  ...patch,
})

const keys = (s: SupervisorState, b?: BotStatus) =>
  currentTroubles(s, b, NOW).map((trouble) => trouble.key)

describe('troubles', () => {
  it('has none while Pace runs well', () => {
    expect(keys(supervisor(), status())).toEqual([])
    expect(keys(supervisor({ phase: 'idle' }))).toEqual([])
  })

  it('counts an exit, and the tries after it, as one trouble until it runs again', () => {
    const exited = currentTroubles(
      supervisor({
        phase: 'crashed',
        message: 'Pace exited (code 1).',
        restarts: 1,
        retryAt: NOW + 3_000,
      }),
      undefined,
      NOW
    )
    expect(exited).toEqual([
      expect.objectContaining({
        key: 'exit',
        body: 'Pace exited (code 1). Pacenote starts it again.',
        route: '#/bot',
      }),
    ])
    expect(keys(supervisor({ phase: 'starting', restarts: 1 }))).toEqual([
      'exit',
    ])
    expect(keys(supervisor({ phase: 'starting' }))).toEqual([])
  })

  it('sends setup to the section to fix', () => {
    const [setup] = currentTroubles(
      supervisor({
        phase: 'setup',
        message: 'Slack rejected the tokens (invalid_auth).',
        issues: [],
      }),
      undefined
    )
    expect(setup).toMatchObject({
      key: 'setup',
      route: '#/settings/messengers',
    })
  })

  it('tells a lost Slack connection only after a while', () => {
    const away = (ms: number) =>
      status({
        socket: {
          state: 'reconnecting',
          since: new Date(NOW - ms).toISOString(),
          reconnects: 1,
        },
      })
    expect(keys(supervisor(), away(30_000))).toEqual([])
    expect(keys(supervisor(), away(SOCKET_LOST_MS))).toEqual(['socket'])
  })

  it('keeps a problem the same trouble while only its time changes', () => {
    const at = (time: string) =>
      keys(
        supervisor(),
        status({
          problems: [
            `Reasoner: claude's sign-in was rejected. (last at ${time})`,
          ],
        })
      )
    expect(at('14:20')).toEqual(at('14:25'))
    expect(at('14:20')).toEqual([
      "problem:Reasoner: claude's sign-in was rejected.",
    ])
  })
})

describe('newTroubles', () => {
  const trouble = (key: string) => ({ key, title: key, body: '', route: '' })

  it('tells each trouble once, and again only after it went away', () => {
    const said = new Set<string>()
    expect(newTroubles(said, [trouble('exit')]).map((t) => t.key)).toEqual([
      'exit',
    ])
    expect(newTroubles(said, [trouble('exit')])).toEqual([])
    expect(newTroubles(said, [])).toEqual([])
    expect(newTroubles(said, [trouble('exit')])).toHaveLength(1)
  })

  it('does not forget what only a running bot can tell while none runs', () => {
    const said = new Set<string>()
    const problem = trouble('problem:Sandbox: the egress proxy is not running')
    newTroubles(said, [problem])
    // Pace restarts: for a moment there is no bot to ask.
    const known = (key: string) => !unknownWithoutBot(key)
    expect(newTroubles(said, [], known)).toEqual([])
    expect(newTroubles(said, [problem])).toEqual([])
  })
})
