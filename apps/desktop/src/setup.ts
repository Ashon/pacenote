import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  furthest,
  SETUP_STEPS,
  setupView,
  type SetupRecord,
  type SetupStep,
  type SetupView,
} from '../../../src/settings/setup.js'

/** A change to the setup record from the wizard */
export interface SetupPatch {
  step?: SetupStep
  slack?: 'hub' | 'app'
  me?: { id: string; name: string } | null
  answerSince?: string
  finished?: boolean
}

/**
 * Where the first-run wizard got to (setup.json in the data folder). Its own
 * file, since desktop.json is rewritten whole by the start-automatically
 * switch.
 */
export class SetupStore {
  readonly file: string

  constructor(
    dataDir: string,
    /** Whether Pace could start, or has answered: a Pacenote set up before */
    private readonly before: () => { configured: boolean; answered: boolean }
  ) {
    this.file = path.join(dataDir, 'setup.json')
  }

  view(): SetupView {
    const { view, migrated } = setupView(this.read(), this.before())
    if (migrated) this.write(migrated)
    return view
  }

  save(raw: unknown): SetupView {
    const patch = parsePatch(raw)
    const record = this.view().record
    const next: SetupRecord = {
      ...record,
      ...(patch.step ? { step: furthest(record.step, patch.step) } : {}),
      ...(patch.slack ? { slack: patch.slack } : {}),
      ...(patch.answerSince ? { answerSince: patch.answerSince } : {}),
      ...(patch.finished ? { finishedAt: new Date().toISOString() } : {}),
    }
    if (patch.me === null) delete next.me
    else if (patch.me) next.me = patch.me
    this.write(next)
    return { open: !next.finishedAt, record: next }
  }

  private read(): SetupRecord | undefined {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as SetupRecord
      return SETUP_STEPS.includes(parsed.step) ? parsed : undefined
    } catch {
      return undefined
    }
  }

  private write(record: SetupRecord): void {
    writeFileSync(this.file, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    })
  }
}

/** Takes from the screen's change only what it may set */
function parsePatch(raw: unknown): SetupPatch {
  const value = (raw ?? {}) as Record<string, unknown>
  const patch: SetupPatch = {}
  if (SETUP_STEPS.includes(value.step as SetupStep))
    patch.step = value.step as SetupStep
  if (value.slack === 'hub' || value.slack === 'app') patch.slack = value.slack
  const me = value.me as { id?: unknown; name?: unknown } | null | undefined
  if (me === null) patch.me = null
  else if (typeof me?.id === 'string' && typeof me.name === 'string')
    patch.me = { id: me.id, name: me.name }
  if (
    typeof value.answerSince === 'string' &&
    !Number.isNaN(Date.parse(value.answerSince))
  )
    patch.answerSince = value.answerSince
  if (value.finished === true) patch.finished = true
  return patch
}
