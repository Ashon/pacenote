import { SETTING_FIELDS, type SettingsView } from '../settings/fields.js'
import type { DesktopBridge } from '../desktop-bridge.js'
import type { YourTaskInput } from '../tasks/write.js'
import type { Macs } from './macs.js'

/** A bridge call by the name a device asks for it by: "tasks.add" */
export type BridgeCall = {
  [K in keyof DesktopBridge & string]-?: NonNullable<
    DesktopBridge[K]
  > extends Record<string, unknown>
    ? `${K}.${keyof NonNullable<DesktopBridge[K]> & string}`
    : never
}[keyof DesktopBridge & string]

/**
 * What a device asks on its own, not as a screen: the tasks it wrote before
 * it paired (tasks.handOver, the app's local.ts)
 */
type DeviceOwnAsk = 'tasks.handOver'

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
  // A task's page and where its session would run (a Mac before 0.6.33
  // answers these not-allowed, and the device says to update it)
  'tasks.detail': 'pacenote:tasks:detail',
  'tasks.folders': 'pacenote:tasks:folders',
  'tasks.newSession': 'pacenote:tasks:new-session',
  // The sessions on the Mac and a session's page: what you typed in them
  // and their logs go to your own device, or another of your Macs
  // (MAC_ASKS), over its sealed channel, and to nothing else
  'sessions.view': 'pacenote:sessions:view',
  'sessions.talk': 'pacenote:sessions:talk',
} as const satisfies Partial<Record<BridgeCall, `pacenote:${string}`>>

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
  // Todo's New task: on the Mac, as added on the device (argsFromDevice)
  'tasks.add': 'pacenote:tasks:add',
  // What the device wrote before it paired: new tasks only
  // (src/tasks/hand-over.ts); a Mac before this one answers not-allowed, and
  // the device keeps them
  'tasks.handOver': 'pacenote:tasks:hand-over',
  // Undo of what your AI filled in a task, and "not the same task" (a Mac
  // before 0.6.24 answers not-allowed)
  'tasks.takeBackFill': 'pacenote:tasks:take-back-fill',
  'tasks.keepBoth': 'pacenote:tasks:keep-both',
  // Groups of tasks, as on the Mac (src/tasks/bundles.ts): a Mac before
  // 0.6.41 answers not-allowed, and the device shows no groups
  'tasks.bundle': 'pacenote:tasks:bundle',
  'tasks.answerBundle': 'pacenote:tasks:bundle-answer',
  'tasks.moveOutOfBundle': 'pacenote:tasks:bundle-move-out',
  'tasks.ungroupBundle': 'pacenote:tasks:bundle-ungroup',
  'tasks.takeBackBundleFill': 'pacenote:tasks:bundle-take-back',
  'tasks.fillBundleAgain': 'pacenote:tasks:bundle-fill-again',
  'tasks.wrapUpBundle': 'pacenote:tasks:bundle-wrap',
  'tasks.doneBundle': 'pacenote:tasks:bundle-done',
  // A session the Mac runs, from your device: it starts in a folder of your
  // work on the Mac (ipc/sessions.ts checks), with your own sign-in there,
  // and you talk to it, answer what it asks and stop it as on the Mac. It
  // never opens in a terminal or an app from a device (sessions.open stays
  // the Mac's).
  'sessions.start': 'pacenote:sessions:start',
  'sessions.send': 'pacenote:sessions:send',
  'sessions.copy': 'pacenote:sessions:copy',
  'sessions.answer': 'pacenote:sessions:answer',
  'sessions.stop': 'pacenote:sessions:stop',
  'sessions.end': 'pacenote:sessions:end',
  'sessions.mode': 'pacenote:sessions:mode',
  'sessions.link': 'pacenote:sessions:link',
  'sessions.unlink': 'pacenote:sessions:unlink',
  'sessions.makeTask': 'pacenote:sessions:make-task',
} as const satisfies Partial<
  Record<BridgeCall | DeviceOwnAsk, `pacenote:${string}`>
>

export const DEVICE_ASKS = { ...DEVICE_READS, ...DEVICE_CHANGES }

/** Whether a device's ask only reads: not worth a line in the log each time */
export const isDeviceRead = (what: string): boolean =>
  what === 'api' || Object.hasOwn(DEVICE_READS, what)

export type DeviceAsk = keyof typeof DEVICE_ASKS | 'api'

/** The Mac's read-only API (local-api.ts), as the screens fetch it: GET only */
export const API_ASK = 'api'

export const isDeviceAsk = (what: string): what is DeviceAsk =>
  what === API_ASK || Object.hasOwn(DEVICE_ASKS, what)

/**
 * What another of your Macs asks this one: its sessions and a session's page,
 * to show them there. They change nothing here, and are answered only while
 * Sessions is on here (ipc/sessions.ts), as a device's are.
 */
export const MAC_ASKS = ['sessions.view', 'sessions.talk'] as const

export type MacAsk = (typeof MAC_ASKS)[number]

const isMacAsk = (what: string): what is MacAsk =>
  (MAC_ASKS as readonly string[]).includes(what)

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
 * that stay on the Mac, and tasks it adds with where they were added (from,
 * the device's name as Your devices has it, and peer, its id there), never
 * a place it says itself
 */
export function argsFromDevice(
  what: DeviceAsk,
  args: unknown[],
  from?: string,
  peer?: string
): unknown[] {
  // As the device's bridge called it: title, repo, when it is due (a newer
  // device's) and whether the repo was guessed from the words (newer still)
  if (what === 'tasks.add') {
    const [title, repo, due, guessed] = args
    return [
      {
        title,
        repo,
        from,
        due,
        peer,
        guessed: guessed === true,
      } satisfies YourTaskInput,
    ]
  }
  // the tasks, and the device that hands them over
  if (what === 'tasks.handOver') return [args[0], peer, from]
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
 * The Mac's side: answers what a device asks (answer), and what another of
 * your Macs asks of MAC_ASKS. An ask it does not allow gets an error, never
 * a value.
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
    const reply = (fields: Omit<AnswerMessage, 't' | 'id'>) =>
      macs.send(peer, { t: 'answer', id, ...fields } satisfies AnswerMessage)
    const device = macs.isDevice(peer)
    // Another of your Macs reads the sessions here, and nothing else
    const allowed: DeviceAsk | undefined = device
      ? isDeviceAsk(what)
        ? what
        : undefined
      : isMacAsk(what)
        ? what
        : undefined
    if (!allowed) return void reply({ error: 'not-allowed' })
    void Promise.resolve()
      .then(() => answer(allowed, Array.isArray(args) ? args : [], peer))
      .then(
        (value) => reply({ value: value ?? null }),
        (err: unknown) => {
          log(
            `Macs: ${device ? 'a device' : 'another Mac'} asked ${what}: ${(err as Error).message}`
          )
          reply({ error: (err as Error).message })
        }
      )
  }
}

/** How long an ask of another Mac waits for its answer */
export const MAC_ASK_MS = 10_000

/**
 * This Mac's side of asking another of yours (MAC_ASKS), as a device asks
 * one: each ask waits for its answer from that Mac, an error when it says
 * one, and gives up after MAC_ASK_MS or once it is not linked
 */
export class MacAsker {
  private next = 1
  private readonly waiting = new Map<
    number,
    {
      peer: string
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private readonly listener = (peer: string, message: unknown) =>
    this.heard(peer, message)

  constructor(
    private readonly macs: Pick<Macs, 'on' | 'off' | 'send'>,
    private readonly waitMs = MAC_ASK_MS
  ) {}

  start(): void {
    this.macs.on('message', this.listener)
  }

  stop(): void {
    this.macs.off('message', this.listener)
    for (const [id, waiting] of this.waiting) {
      clearTimeout(waiting.timer)
      this.waiting.delete(id)
      waiting.reject(new Error('stopped'))
    }
  }

  ask(peer: string, what: MacAsk, args: unknown[] = []): Promise<unknown> {
    const id = this.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        reject(new Error('no answer'))
      }, this.waitMs)
      timer.unref?.()
      this.waiting.set(id, { peer, resolve, reject, timer })
      const message: AskMessage = { t: 'ask', id, what, args }
      if (!this.macs.send(peer, message)) {
        clearTimeout(timer)
        this.waiting.delete(id)
        reject(new Error('not linked'))
      }
    })
  }

  private heard(peer: string, message: unknown): void {
    const { t, id, value, error } = (message ?? {}) as Partial<AnswerMessage>
    if (t !== 'answer' || typeof id !== 'number') return
    const waiting = this.waiting.get(id)
    // Only the Mac it asked answers it
    if (!waiting || waiting.peer !== peer) return
    clearTimeout(waiting.timer)
    this.waiting.delete(id)
    if (typeof error === 'string') waiting.reject(new Error(error))
    else waiting.resolve(value)
  }
}
