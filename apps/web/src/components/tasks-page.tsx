import { stagesOf } from '@src/tasks/stage'
import { tabOf } from '@src/tasks/tabs'
import { useEffect, useState } from 'react'
import { Placeholder, Swap } from '@/components/ui/motion'
import { SkeletonWord } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/format'
import { clearFound, useAiSheet } from '@/lib/ai-sheet'
import { useText } from '@/lib/i18n'
import {
  taskHash,
  useDecide,
  useStage,
  useTasks,
  useTasksLive,
} from '@/lib/tasks'
import { todayLines } from '@/lib/today'
import {
  declinedFrom,
  leaveOutOffer,
  ROWS_AT_ONCE,
  rowFacts,
  skeletonRows,
  todoList,
  type Tab,
} from '@/lib/todo-list'
import { macNamed, useMacs } from '@/lib/macs'
import { shortcutKeyHeld } from '@/lib/platform'
import { readStored, writeStored } from '@/lib/storage'
import { go } from '@/lib/utils'
import { useYou } from '@/lib/you'
import { NewTask } from './new-task'
import { TaskRow } from './task-row'
import { Page } from './page'
import { StartCard } from './start-card'
import { RecentCollections } from './tasks-collections'
import { CollectButton, NewTaskButton, StatusLine } from './tasks-header'
import {
  NewTasks,
  ShowMore,
  stepThrough,
  TaskList,
  TaskRowsSkeleton,
  TaskTabs,
} from './tasks-list'
import { FoundNotice, LeaveOutOffer, Setup, TodoFirst } from './tasks-notices'
import { text } from './tasks-page.text'
import { lastToday, Today, TodaySkeleton } from './today'
import {
  lastYourWork,
  rememberYourWork,
  YourWork,
  YourWorkSkeleton,
} from './your-work'

/** The leave-out offers you turned down, per channel, in this browser */
const OFFERS_KEY = 'pacenote.tasks.leave-out-declined'

const declinedOffers = () => declinedFrom(readStored(OFFERS_KEY))

/** How many open tasks there were last time: the skeleton's rows */
const ROWS_KEY = 'pacenote.tasks.rows'

const lastRows = () => skeletonRows(readStored(ROWS_KEY))

/**
 * Your own tasks, gathered from Slack (docs/proposals/personal-tasks.md): the
 * open ones, the Maybes kept aside, what is settled (the latest first, more on
 * a click), and the collections that found them. An AI tool with a
 * Slack connector collects them through Pacenote's MCP server; Done and
 * Dismiss are one click. A task opens in its row (#/tasks/<id>), one at a
 * time: up and down step through the list, Esc closes it.
 *
 * The list moves only for what you do: a settled task leaves its tab
 * (settle), and tasks that come in while you look, from a collection or an AI
 * tool, wait behind a notice that shows them (arrive), so the rows you are
 * reading stay put. What each tab lists is worked out in lib/todo-list.ts.
 */
export function TasksPage({
  openId,
  logEntry,
}: {
  /** The task open in its row */
  openId?: string
  /** A session's log over the list */
  logEntry?: string
}) {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.tasks
  const tasks = useTasks()
  // What AI tools are doing with your tasks now, over MCP
  const live = useTasksLive().data
  // Where you contribute: shown once above the tasks after a collection
  const you = useYou().data
  // Your other Macs, by name, for what they did
  const macs = useMacs()
  const decide = useDecide()
  const setStage = useStage()
  // What Let your AI help's first look added, once it closed
  const { found } = useAiSheet()
  const [tab, setTab] = useState<Tab>('open')
  // New task, open above the tabs (Cmd-N)
  const [adding, setAdding] = useState(false)
  const [declined, setDeclined] = useState(declinedOffers)
  // The open task and the tab it was opened in: settled meanwhile (in its
  // session, say), it stays where it was until it is closed.
  const [held, setHeld] = useState<{ id: string; tab: Tab }>()
  // How many settled tasks Done lists, the latest first
  const [doneRows, setDoneRows] = useState(ROWS_AT_ONCE)
  const data = tasks.data
  // The tasks you have seen listed. Others that come into the tab wait for
  // you to show them; moving to a tab shows all of its tasks.
  const [seen, setSeen] = useState<ReadonlySet<string>>()
  // The first of them once shown, brought into view
  const [revealed, setRevealed] = useState<string>()
  const ids = data?.tasks.map((task) => task.id) ?? []
  if (data && !seen) setSeen(new Set(ids))
  const showAll = () => setSeen(new Set(ids))

  // A task opened from a link shows under its own tab.
  useEffect(() => {
    if (!openId) {
      setHeld(undefined)
      return
    }
    if (held?.id === openId) return
    const task = data?.tasks.find((each) => each.id === openId)
    if (!task) return
    const at = tabOf(task, stagesOf(data)[task.id])
    setTab(at)
    setHeld({ id: openId, tab: at })
  }, [openId, data, held])

  // Cmd-N opens New task (on Todo, with Todo on)
  const on = Boolean(data?.settings.on)
  useEffect(() => {
    if (!on) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.shiftKey || event.altKey)
        return
      if (!shortcutKeyHeld(event)) return
      event.preventDefault()
      setAdding(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])

  if (!bridge)
    return (
      <Page title={t.title}>
        <p className="mt-6 text-copy text-muted-foreground">{t.noDesktop}</p>
      </Page>
    )
  // Until the tasks come, and your areas (their card, shown once after a
  // collection, sits above the tabs): the header, the tabs and the list's
  // place, as they will be, and the card's if it showed last time
  const youKnown = !window.pacenoteDesktop?.you || you !== undefined
  if (!data || !youKnown) {
    const card = lastYourWork()
    return (
      <Page
        title={t.title}
        meta={<SkeletonWord width="9rem" />}
        action={
          <>
            <NewTaskButton />
            <CollectButton running={false} />
          </>
        }
      >
        <TodaySkeleton lines={lastToday()} />
        {card && (
          <Placeholder
            key="your-work"
            ready={false}
            skeleton={<YourWorkSkeleton {...card} />}
          />
        )}
        <TaskTabs key="tabs" tab={tab} onTab={setTab} />
        <Placeholder
          key="list"
          ready={false}
          skeleton={<TaskRowsSkeleton count={lastRows()} />}
        />
      </Page>
    )
  }
  if (!data.settings.on)
    return (
      <Page title={t.title}>
        <Setup />
      </Page>
    )

  // No AI set up for Pacenote's own work: where one would help, it says so
  const noAi = data.aiSet === false
  const list = todoList(data, {
    tab,
    openId,
    held,
    seen,
    doneRows,
    live: live?.working,
  })
  const { stages, counts, shown, rows, arrived } = list
  writeStored(ROWS_KEY, String(counts.open))
  rememberYourWork(data.collectedAt ? you : undefined)
  if (list.seenNow) setSeen(list.seenNow)
  const note =
    list.note?.says === 'dismissRate'
      ? t.dismissRate(list.note.percent)
      : list.note && t[list.note.says]
  const offer = leaveOutOffer(data.leaveOut, declined)

  const decline = (conversation: string) => {
    const next = [...declined, conversation]
    setDeclined(next)
    writeStored(OFFERS_KEY, JSON.stringify(next))
  }

  return (
    <Page
      title={t.title}
      meta={t.meta(
        counts.open,
        data.collectedAt && formatRelative(data.collectedAt),
        data.collect.last?.mac && macNamed(macs, data.collect.last.mac),
        counts.waiting
      )}
      action={
        <>
          <NewTaskButton pressed={adding} onClick={() => setAdding(!adding)} />
          <CollectButton
            running={Boolean(data.collect.running)}
            elsewhere={data.collect.elsewhere?.name}
            noAi={noAi}
          />
        </>
      }
    >
      <StatusLine
        collect={data.collect}
        macs={macs}
        live={live}
        titleOf={(id) => data.tasks.find((task) => task.id === id)?.title}
      />
      <StartCard tasks={data.tasks.length} onNewTask={() => setAdding(true)} />
      {found && (
        <FoundNotice
          {...found}
          onMaybes={() => {
            clearFound()
            setTab('maybe')
            showAll()
          }}
        />
      )}
      <TodoFirst />
      <Today
        lines={todayLines(data.tasks, stages, data.working, live?.working)}
      />
      <YourWork you={data.collectedAt ? you : undefined} />
      {offer && (
        <LeaveOutOffer
          offer={offer}
          onNotNow={() => decline(offer.conversation)}
        />
      )}

      {adding && (
        <NewTask
          areas={you?.areas}
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            // Yours, so shown at once rather than behind the notice
            setSeen(new Set([...(seen ?? []), id]))
            setRevealed(id)
            setTab('open')
          }}
        />
      )}

      <TaskTabs
        key="tabs"
        tab={tab}
        onTab={(value) => {
          setTab(value)
          setDoneRows(ROWS_AT_ONCE)
          showAll()
        }}
        counts={counts}
      />

      {/* Another tab's list takes this one's place (swap) */}
      <Placeholder
        key="list"
        ready
        skeleton={<TaskRowsSkeleton count={lastRows()} />}
      >
        <Swap id={tab}>
          {tab === 'collections' ? (
            <RecentCollections collections={data.collections ?? []} />
          ) : (
            <>
              <NewTasks
                count={arrived.length}
                onShow={() => {
                  showAll()
                  // Settled just now, they go first: the rows you were
                  // reading stay listed below them
                  if (tab === 'done') setDoneRows(rows + arrived.length)
                  setRevealed(arrived[0]?.id)
                }}
              />
              {note && (
                <p className="mt-3 text-meta text-muted-foreground">{note}</p>
              )}
              <TaskList
                tasks={shown.slice(0, rows)}
                onKeyDown={stepThrough(openId)}
                revealed={revealed}
                row={(task, motion) => {
                  const facts = rowFacts(data, task)
                  return (
                    <TaskRow
                      key={task.id}
                      task={task}
                      motion={motion}
                      cli={data.settings.cli}
                      tools={data.settings.tools}
                      opensIn={data.settings.opensIn}
                      working={data.working?.[task.id]}
                      live={live?.working[task.id]}
                      stage={stages[task.id]}
                      onStage={(stage) => void setStage(task.id, stage)}
                      proposal={data.proposals?.[task.id]}
                      area={data.areas?.[task.id]}
                      askGroup={facts.askGroup}
                      follows={facts.follows?.title}
                      followsTask={facts.follows}
                      filling={facts.filling}
                      looksLike={facts.looksLike}
                      onSame={() => {
                        const same = facts.looksLike
                        if (!same) return
                        void decide(task.id, { status: 'dismissed' })
                        go(taskHash(same.id))
                      }}
                      open={task.id === openId}
                      gone={tabOf(task, stages[task.id]) !== tab}
                      logEntry={task.id === openId ? logEntry : undefined}
                      onToggle={() =>
                        go(task.id === openId ? '#/tasks' : taskHash(task.id))
                      }
                      onDecide={(decision) => void decide(task.id, decision)}
                    />
                  )
                }}
              />
              <ShowMore
                hidden={shown.length - rows}
                onShow={() => setDoneRows(rows + ROWS_AT_ONCE)}
              />
              {list.empty && (
                <p className="border-t border-border py-8 text-copy text-muted-foreground">
                  {t[list.empty]}
                </p>
              )}
            </>
          )}
        </Swap>
      </Placeholder>
    </Page>
  )
}
