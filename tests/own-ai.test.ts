import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OwnAi, refusalOf } from '../apps/desktop/src/own-ai.js'
import {
  cliOrder,
  resetFrom,
  switchWords,
  unableFrom,
  type OwnCli,
} from '../src/tasks/own-ai.js'

const NOW = new Date('2026-10-20T10:00:00')

/** A piece of work each CLI answers as given: done, or why it could not */
const work =
  (answers: Partial<Record<OwnCli, string>>, calls: OwnCli[] = []) =>
  async (cli: OwnCli) => {
    calls.push(cli)
    const error = answers[cli]
    if (!error) return { text: `written by ${cli}` }
    const unable = unableFrom(error)
    return unable ? { error, unable } : { error }
  }

describe("which CLI does Pacenote's own work", () => {
  it('reads when a limit resets from what each CLI says', () => {
    expect(resetFrom('Claude AI usage limit reached|1760000000', NOW)).toEqual(
      new Date(1760000000 * 1000)
    )
    expect(resetFrom('Usage limit reached · resets 3pm', NOW)).toEqual(
      new Date('2026-10-20T15:00:00')
    )
    // Already past today: tomorrow's
    expect(
      resetFrom("You've hit your usage limit. Try again at 9:05 AM.", NOW)
    ).toEqual(new Date('2026-10-21T09:05:00'))
    expect(resetFrom('Rate limited, try again in 90 seconds', NOW)).toEqual(
      new Date(NOW.getTime() + 90_000)
    )
    expect(resetFrom('try again in 2 hours', NOW)).toEqual(
      new Date(NOW.getTime() + 2 * 3_600_000)
    )
    expect(resetFrom('Usage limit reached', NOW)).toBeUndefined()
  })

  it('tells a CLI that could not work at all from one whose work went wrong', () => {
    expect(unableFrom('Usage limit reached')).toBe('limit')
    expect(unableFrom('{"type":"usage_limit_reached"}')).toBe('limit')
    expect(unableFrom('API Error: 529 Overloaded')).toBe('unavailable')
    expect(unableFrom('Not logged in · Please run /login')).toBe('auth')
    expect(unableFrom('codex executable not found')).toBe('missing')
    // The other CLI would likely time out or go wrong the same way
    expect(unableFrom('claude timed out (120s)')).toBeUndefined()
    expect(unableFrom('Claude Code gave no judgement.')).toBeUndefined()
    expect(refusalOf({ error: 'x', unable: 'limit' })).toEqual({
      error: 'x',
      unable: 'limit',
    })
    expect(refusalOf({ error: 'x' })).toBeUndefined()
    expect(refusalOf({ text: 'x' })).toBeUndefined()
  })

  it('switches to the other one at a limit, and goes to it first until the limit resets', async () => {
    let now = NOW
    const ai = new OwnAi({
      chosen: () => 'claude',
      fallback: () => true,
      now: () => now,
    })
    const calls: OwnCli[] = []
    const limited = { claude: 'Usage limit reached · resets 3pm' }

    const first = await ai.run(work(limited, calls), refusalOf)
    expect(calls).toEqual(['claude', 'codex'])
    expect(first).toEqual({
      result: { text: 'written by codex' },
      by: 'codex',
      switched: {
        from: 'claude',
        unable: 'limit',
        until: new Date('2026-10-20T15:00:00').toISOString(),
      },
    })
    expect(ai.state().claude).toMatchObject({ unable: 'limit' })
    expect(ai.state().codex).toEqual({ at: NOW.toISOString() })
    if (!('switched' in first) || !first.switched) throw new Error('no switch')
    expect(switchWords(first.switched)).toBe(
      'Claude Code was at its usage limit'
    )

    // While Claude Code rests, work goes straight to Codex, saying why.
    calls.length = 0
    const second = await ai.run(work({}, calls), refusalOf)
    expect(calls).toEqual(['codex'])
    expect(second).toMatchObject({ by: 'codex', switched: { from: 'claude' } })

    // Once the limit resets, back to the one chosen.
    now = new Date('2026-10-20T15:01:00')
    expect(ai.state().claude).toEqual({ at: NOW.toISOString() })
    calls.length = 0
    expect(await ai.run(work({}, calls), refusalOf)).toEqual({
      result: { text: 'written by claude' },
      by: 'claude',
    })
    expect(calls).toEqual(['claude'])
  })

  it('stays with the one chosen when switching is off, or when the work itself went wrong', async () => {
    const off = new OwnAi({ chosen: () => 'codex', fallback: () => false })
    const calls: OwnCli[] = []
    expect(
      await off.run(work({ codex: 'Usage limit reached' }, calls), refusalOf)
    ).toMatchObject({ by: 'codex', result: { unable: 'limit' } })
    expect(calls).toEqual(['codex'])

    const on = new OwnAi({ chosen: () => 'claude', fallback: () => true })
    calls.length = 0
    expect(
      await on.run(
        work({ claude: 'claude timed out (120s)' }, calls),
        refusalOf
      )
    ).toEqual({ result: { error: 'claude timed out (120s)' }, by: 'claude' })
    expect(calls).toEqual(['claude'])
  })

  it('says why both could not, and leaves background work for when one is back', async () => {
    const ai = new OwnAi({
      chosen: () => 'claude',
      fallback: () => true,
      now: () => NOW,
    })
    const both = await ai.run(
      work({
        claude: 'Usage limit reached · resets 3pm',
        codex: "You've hit your usage limit. Try again at 1:30 PM.",
      }),
      refusalOf
    )
    expect(both).toMatchObject({
      by: 'codex',
      result: { unable: 'limit' },
      switched: { from: 'claude', unable: 'limit' },
    })
    // The looks done judge waits for the first reset rather than run.
    const calls: OwnCli[] = []
    expect(
      await ai.run(work({}, calls), refusalOf, { background: true })
    ).toEqual({ resting: new Date('2026-10-20T13:30:00').toISOString() })
    expect(calls).toEqual([])
    // Collect now, asked for, tries anyway.
    expect(await ai.run(work({}, calls), refusalOf)).toMatchObject({
      by: 'claude',
    })
  })

  it('keeps what each CLI last did in the data folder, for Settings and Todo', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-own-ai-'))
    try {
      let changed = 0
      const ai = new OwnAi({
        dataDir,
        chosen: () => 'claude',
        fallback: () => true,
        onChange: () => (changed += 1),
        now: () => NOW,
      })
      await ai.run(work({ claude: 'API Error: 529 Overloaded' }), refusalOf)
      expect(changed).toBe(2)
      const kept = JSON.parse(
        readFileSync(path.join(dataDir, 'own-ai.json'), 'utf8')
      )
      // Overloaded rests 10 minutes
      expect(kept.claude).toEqual({
        at: NOW.toISOString(),
        unable: 'unavailable',
        until: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
      })
      expect(ai.now()).toMatchObject({ chosen: 'claude', fallback: true })
      expect(cliOrder('claude', true, ai.state())).toEqual(['codex', 'claude'])
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
