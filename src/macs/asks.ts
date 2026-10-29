import { SETTING_FIELDS, type SettingsView } from '../settings/fields.js'
import type { Macs } from './macs.js'

/**
 * What a device of yours (the iPhone, iPad and Android app) asks the Mac it is
 * linked to, and the Mac's answer. The device shows the Mac's own screens
 * (apps/web), and each asks for what it would get on the Mac, from the same
 * function: the desktop bridge's call (window.pacenoteDesktop) by its name,
 * answered by the channel the Mac's own screen calls. Only a device asks, and
 * only for these; a Mac before Pacenote 0.6.14 answers nothing, and the device
 * says to update it.
 */
export const DEVICE_READS = {
  'bot.state': 'pacenote:bot:state',
  'setup.state': 'pacenote:setup:state',
  'tasks.trend': 'pacenote:tasks:trend',
  'recap.get': 'pacenote:recap:get',
  'you.get': 'pacenote:you:get',
  'settings.get': 'pacenote:settings:get',
  'ai.now': 'pacenote:ai:now',
  'ai.state': 'pacenote:ai:state',
  'mcp.status': 'pacenote:mcp:status',
  'sandbox.status': 'pacenote:sandbox:status',
} as const

/** What a device may change on the Mac, as you would there */
export const DEVICE_CHANGES = {
  'settings.validate': 'pacenote:settings:validate',
  'settings.save': 'pacenote:settings:save',
  'bot.start': 'pacenote:bot:start',
  'bot.restart': 'pacenote:bot:restart',
  'bot.stop': 'pacenote:bot:stop',
  'recap.write': 'pacenote:recap:write',
  'you.confirm': 'pacenote:you:confirm',
  'you.rename': 'pacenote:you:rename',
  'you.takeOut': 'pacenote:you:take-out',
  'you.merge': 'pacenote:you:merge',
  'you.leave': 'pacenote:you:leave',
} as const

export const DEVICE_ASKS = { ...DEVICE_READS, ...DEVICE_CHANGES }

export type DeviceAsk = keyof typeof DEVICE_ASKS | 'api'

/** The Mac's read-only API (local-api.ts), as the screens fetch it: GET only */
export const API_ASK = 'api'

export const isDeviceAsk = (what: string): what is DeviceAsk =>
  what === API_ASK || Object.hasOwn(DEVICE_ASKS, what)

/**
 * Settings a device leaves to the Mac: secrets (it never gets them, not even
 * their last characters), folders and files on the Mac, and how the Mac
 * reaches Slack
 */
export const MAC_ONLY_SETTINGS: ReadonlySet<string> = new Set([
  ...SETTING_FIELDS.filter((field) => field.type === 'secret').map(
    (field) => field.key
  ),
  'SLACK_CONNECTION',
  'HUB_URL',
  'MENTION_WORKSPACE',
  'OPS_FS_ROOT',
  'OPS_SSH_KEY',
  'OPS_SSH_KNOWN_HOSTS',
  'OPS_SSH_INVENTORY_DIR',
  'OPS_SSH_INVENTORY',
])

/**
 * What a device's ask takes to the Mac: a change to settings without those
 * that stay on the Mac
 */
export function argsFromDevice(what: DeviceAsk, args: unknown[]): unknown[] {
  if (what !== 'settings.validate' && what !== 'settings.save') return args
  const changes = Object.fromEntries(
    Object.entries((args[0] ?? {}) as Record<string, unknown>).filter(
      ([key]) => !MAC_ONLY_SETTINGS.has(key)
    )
  )
  return [changes, ...args.slice(1)]
}

/**
 * What the Mac's answer takes to a device: settings say of a secret only
 * whether it is set, not even its last characters
 */
export function valueForDevice(what: DeviceAsk, value: unknown): unknown {
  if (what !== 'settings.get' || !value) return value
  const view = value as SettingsView
  return {
    ...view,
    secrets: Object.fromEntries(
      Object.entries(view.secrets).map(([key, secret]) => [
        key,
        { set: secret.set },
      ])
    ),
  }
}

export interface AskMessage {
  t: 'ask'
  id: number
  what: string
  args?: unknown[]
}

export interface AnswerMessage {
  t: 'answer'
  id: number
  value?: unknown
  error?: string
}

/**
 * The Mac's side: answers what a device asks (answer), and nothing a Mac
 * asks. An ask it does not allow gets an error, never a value.
 */
export class DeviceAsks {
  private readonly listener = (peer: string, message: unknown) =>
    this.heard(peer, message)

  constructor(
    private readonly options: {
      macs: Pick<Macs, 'on' | 'off' | 'send' | 'isDevice'>
      answer: (what: DeviceAsk, args: unknown[], peer: string) => unknown
      log: (message: string) => void
    }
  ) {}

  start(): void {
    this.options.macs.on('message', this.listener)
  }

  stop(): void {
    this.options.macs.off('message', this.listener)
  }

  private heard(peer: string, message: unknown): void {
    const { t, id, what, args } = (message ?? {}) as Partial<AskMessage>
    if (t !== 'ask' || typeof id !== 'number' || typeof what !== 'string')
      return
    const { macs, answer, log } = this.options
    if (!macs.isDevice(peer)) return
    const reply = (fields: Omit<AnswerMessage, 't' | 'id'>) =>
      macs.send(peer, { t: 'answer', id, ...fields } satisfies AnswerMessage)
    if (!isDeviceAsk(what)) return void reply({ error: 'not-allowed' })
    void Promise.resolve()
      .then(() => answer(what, Array.isArray(args) ? args : [], peer))
      .then(
        (value) => reply({ value: value ?? null }),
        (err: unknown) => {
          log(`Macs: a device asked ${what}: ${(err as Error).message}`)
          reply({ error: (err as Error).message })
        }
      )
  }
}
