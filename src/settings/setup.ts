/**
 * The first-run setup (the desktop app's wizard): where it got to, and whether
 * the app opens on it. Plain data, so the UI shares these types.
 */

/** The wizard's steps, in order */
export const SETUP_STEPS = [
  'ai',
  'runtime',
  'slack',
  'review',
  'answer',
] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

/** setup.json in the data folder */
export interface SetupRecord {
  /** The furthest step reached */
  step: SetupStep
  /** How Pace reaches Slack, once chosen */
  slack?: 'hub' | 'app'
  /** You, the one Pace answers, as Slack showed you */
  me?: { id: string; name: string }
  /**
   * Set up from your other Mac (Connect to your other Mac): its name, and
   * when its Slack app and who Pace answers came from it
   */
  fromMac?: { name: string; at: string }
  /** When the wizard reached its last step; the first answer is one after it */
  answerSince?: string
  /**
   * When setup ended: the first answer came, or you went to Settings
   * instead. The app no longer opens on it.
   */
  finishedAt?: string
}

/** What the app knows about setup */
export interface SetupView {
  /** The app opens on the wizard */
  open: boolean
  record: SetupRecord
}

/** A CLI on this Mac as setup shows it (checkCli in reasoners/host-check.ts) */
export interface CliCheck {
  backend: 'claude' | 'codex'
  installed: boolean
  /** x.y.z, when it said */
  version?: string
  signedIn: boolean
  /** codex older than the version Pace needs */
  tooOld?: boolean
  /** What to do before it can answer, each in a sentence */
  problems: string[]
}

/** Someone who mentioned Pace while setup listened ("@Pace it's me") */
export interface ClaimedUser {
  id: string
  /** Display name: "alice" */
  name: string
  /** Full name, when Slack has one */
  realName?: string
  /** Where they mentioned Pace: "#ops" */
  channel: string
  /** What they wrote besides the mention: "it's me" */
  said?: string
  /** The workspace's name */
  team: string
}

/**
 * Whether the app opens on setup: a first run, or one left unfinished. A
 * Pacenote set up before the wizard existed (Pace can start, or has answered)
 * counts as finished, so it never opens there.
 */
export function setupView(
  record: SetupRecord | undefined,
  before: { configured: boolean; answered: boolean },
  now = new Date()
): { view: SetupView; migrated?: SetupRecord } {
  if (record) return { view: { open: !record.finishedAt, record } }
  if (before.configured || before.answered) {
    const migrated: SetupRecord = {
      step: 'answer',
      finishedAt: now.toISOString(),
    }
    return { view: { open: false, record: migrated }, migrated }
  }
  return { view: { open: true, record: { step: 'ai' } } }
}

/**
 * Setup opened again after it ended (Overview, when Pace cannot start): it
 * picks up where it was, but from the review at the latest, since the first
 * answer it waited for came before or never will.
 */
export function reopened(record: SetupRecord): SetupRecord {
  const next: SetupRecord = {
    ...record,
    step: record.step === 'answer' ? 'review' : record.step,
  }
  delete next.finishedAt
  delete next.answerSince
  return next
}

/** The step that sets a setting, by the setting's name */
const KEY_STEPS: [RegExp, SetupStep][] = [
  [/^(SLACK_|HUB_|MENTION_)/, 'slack'],
  [/^(REASONER|CLAUDE_|CODEX_)/, 'ai'],
  [/^(SANDBOX_|RENDER_)/, 'runtime'],
]

/** In either language the app words it in (Korean keeps the product names) */
const MESSAGE_STEPS: [RegExp, SetupStep][] = [
  [/\b(slack|hub|token|who you are|member id)\b|허브|토큰|멤버 ID/i, 'slack'],
  [/\b(sandbox|vm)\b|샌드박스/i, 'runtime'],
  [/\b(claude|codex|sign(?:ed)?[- ]in|login)\b|로그인/i, 'ai'],
]

/**
 * The step that fixes what keeps Pace from starting: the settings it names,
 * or the words of its message when it names none (the glossary in
 * docs/i18n.md keeps the Korean words these look for)
 */
export function stepToFix(
  issues: readonly { key?: string }[] | undefined,
  message = ''
): SetupStep | undefined {
  for (const { key } of issues ?? []) {
    const found = key && KEY_STEPS.find(([pattern]) => pattern.test(key))
    if (found) return found[1]
  }
  return MESSAGE_STEPS.find(([pattern]) => pattern.test(message))?.[1]
}

/** The step after a change, never going back from the furthest one reached */
export function furthest(a: SetupStep, b: SetupStep): SetupStep {
  return SETUP_STEPS.indexOf(b) > SETUP_STEPS.indexOf(a) ? b : a
}

/**
 * Whether setup starts preparing the built-in sandbox at once, before it is
 * chosen: it is the default, it takes minutes, and it needs no login. Not on a
 * Mac that cannot run it, nor when Pace is set to run on this Mac by name, nor
 * twice.
 */
export function prepareEarly(state: {
  /** Why this Mac cannot run the built-in sandbox, if it cannot */
  unsupported?: string
  /** REASONER_SANDBOX as saved ('' when unset) */
  setting: string | undefined
  /** It has what it needs to answer already */
  ready: boolean
  /** A setup job ran or runs in this session */
  started: boolean
}): boolean {
  return (
    !state.unsupported &&
    state.setting !== 'none' &&
    !state.ready &&
    !state.started
  )
}
