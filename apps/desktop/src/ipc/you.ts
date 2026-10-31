import { homedir } from 'node:os'
import {
  getLocale,
  localized,
  type Locale,
} from '../../../../src/i18n/locale.js'
import {
  leaveArea,
  mergeAreas,
  renameArea,
  takeOut,
} from '../../../../src/you/areas.js'
import {
  countRecap,
  keepWritten,
  periodKey,
  periodRange,
  periodWords,
  RECAP_PERIODS,
  recapPrompt,
  type RecapPeriod,
  type RecapView,
} from '../../../../src/you/recap.js'
import { keepRecapSpend } from '../../../../src/you/spent.js'
import {
  changeYou,
  checkAccounts,
  countYou,
} from '../../../../src/you/store.js'
import type { YouFile, YouView } from '../../../../src/you/types.js'
import { text } from '../main.text.js'
import { refusalOf } from '../own-ai.js'
import { writeRecap } from '../recap-writer.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

/**
 * You and Recap: where you contribute and what you did in a day, a week or a
 * month, counted from your tasks, your sessions and Pace's answers on this
 * Mac (src/you), each at most every minute, with your fixes to the areas and
 * Write it up
 */
export function registerYouIpc(ipc: Ipc, desktop: Desktop): void {
  const { dataDir, reader, ownAi, ownWork, opencodeRun, log } = desktop
  // You: where you contribute, from your tasks and your sessions on this Mac
  // (src/you). Counted at most every minute, in the background once there is
  // a count to show; a fix applies at once and is counted again with it.
  const YOU_EVERY_MS = 60_000
  // Worded in the app's language, so a count in another one is counted again
  let you: { view: YouView; at: number; locale: Locale } | undefined
  let counting: Promise<YouView> | undefined
  const countYouNow = (): Promise<YouView> => {
    counting ??= (async () => {
      await checkAccounts(dataDir, desktop.toolPath()).catch(() => undefined)
      const locale = getLocale()
      const view = await countYou({ dataDir, home: homedir(), keep: true })
      you = { view, at: Date.now(), locale }
      return view
    })().finally(() => {
      counting = undefined
    })
    return counting
  }
  ipc.handle('pacenote:you:get', null, () => {
    if (!you || you.locale !== getLocale()) return countYouNow()
    if (Date.now() - you.at > YOU_EVERY_MS) void countYouNow()
    return you.view
  })
  const fixYou = async (change: (file: YouFile) => YouFile) => {
    changeYou(dataDir, change)
    // A count under way may have read the areas before the fix.
    await counting?.catch(() => undefined)
    return countYouNow()
  }
  const short = (value: unknown) =>
    typeof value === 'string' && value.length < 200 ? value : undefined
  /** A fix to an area by one more name: its new name, a part, another area */
  const fixArea =
    (fix: (file: YouFile, area: string, other: string) => YouFile) =>
    (id: unknown, value: unknown) => {
      const area = short(id)
      const other = short(value)
      return area && other ? fixYou((file) => fix(file, area, other)) : null
    }
  ipc.handle('pacenote:you:confirm', null, () =>
    fixYou((file) => ({ ...file, confirmedAt: new Date().toISOString() }))
  )
  ipc.handle('pacenote:you:rename', null, fixArea(renameArea))
  ipc.handle('pacenote:you:take-out', null, fixArea(takeOut))
  ipc.handle('pacenote:you:merge', null, fixArea(mergeAreas))
  ipc.handle('pacenote:you:leave', null, (id, left) => {
    const area = short(id)
    return area ? fixYou((file) => leaveArea(file, area, left === true)) : null
  })
  // Recap: what you did in a day, a week or a month (src/you/recap.ts),
  // counted again at most every minute; Write it up asks Claude Code with no
  // tools, only when you click it.
  const RECAP_EVERY_MS = 60_000
  const recaps = new Map<string, { view: RecapView; at: number }>()
  const periodOf = (value: unknown): RecapPeriod | undefined =>
    RECAP_PERIODS.find((period) => period === value)
  const recapRuns = (since: Date) =>
    reader
      .list({ kind: 'mention', limit: 1000 })
      .filter(
        (run) => Date.parse(run.startedAt) >= since.getTime() - 86_400_000
      )
      .map((run) => ({
        at: run.startedAt,
        label: run.conversationLabel,
        request: run.request,
      }))
  const countRecapNow = async (period: RecapPeriod, key: string) => {
    // The areas the recap puts work in are the ones You shows.
    if (!you) await countYouNow().catch(() => undefined)
    const counted = await countRecap({
      dataDir,
      home: homedir(),
      period,
      key,
      runs: recapRuns,
    })
    if (counted)
      recaps.set(`${getLocale()}:${period}:${key}`, {
        view: counted.view,
        at: Date.now(),
      })
    return counted
  }
  ipc.handle('pacenote:recap:get', null, async (period, key) => {
    const which = periodOf(period)
    if (!which) return null
    const at =
      typeof key === 'string' && periodRange(which, key)
        ? key
        : periodKey(which, new Date())
    const kept = recaps.get(`${getLocale()}:${which}:${at}`)
    if (kept && Date.now() - kept.at < RECAP_EVERY_MS) return kept.view
    return (await countRecapNow(which, at))?.view ?? null
  })
  const writeRecapNow = async (period: unknown, key: unknown) => {
    const t = localized(text)
    const which = periodOf(period)
    if (!which || typeof key !== 'string') return { error: t.notARecap }
    const counted = await countRecapNow(which, key)
    if (!counted) return { error: t.notARecap }
    const { view, commits } = counted
    if (view.areas.length === 0) return { error: t.nothingToWriteUp }
    const prompt = recapPrompt(view, periodWords(view), commits)
    const ran = await ownAi.run(async (cli) => {
      const result = await writeRecap({
        ...ownWork(cli),
        opencode: opencodeRun(),
        prompt,
      })
      // Spent whether it wrote or not, for the Overview's tokens
      if (result.usage)
        keepRecapSpend(dataDir, {
          at: new Date().toISOString(),
          usage: result.usage,
        })
      return result
    }, refusalOf)
    if ('resting' in ran) return { error: localized(text).bothResting }
    const { result } = ran
    if ('error' in result) {
      log.warn(`Could not write up the recap of ${key}: ${result.error}`)
      return { error: result.error }
    }
    keepWritten(dataDir, which, key, {
      text: result.text,
      at: new Date().toISOString(),
      by: ran.by,
      ...(ran.switched ? { switched: ran.switched } : {}),
    })
    return { view: (await countRecapNow(which, key))?.view }
  }
  // Write it up: here, or asked by a device of yours (DeviceAsks)
  ipc.handleDenying(
    'pacenote:recap:write',
    () => ({ error: localized(text).notARecap }),
    writeRecapNow
  )
}
