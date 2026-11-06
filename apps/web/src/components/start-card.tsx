import { todoFirstRun } from '@src/settings/setup'
import { Laptop, Plus, Smartphone, Sparkles, X } from 'lucide-react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { lastReached, openAiSheet, REACHED_KEY } from '@/lib/ai-sheet'
import { botControl } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import { isMac } from '@/lib/platform'
import { useSetup } from '@/lib/setup'
import { writeStored } from '@/lib/storage'
import { go } from '@/lib/utils'
import { text } from './start-card.text'

/**
 * Todo's start card (the task-first canvas's "처음 시작", O1): a new install
 * opens on Todo with it on top, not on a first run that takes the window.
 * Add a task, let your AI help, take your Todo from your other Mac, or add
 * your iPhone or iPad; Pace, which answers in Slack, is set up from here or
 * Settings. With a task in, it folds to a line about your AI. Close ends it,
 * and so does your AI's first look.
 */
export function StartCard({
  tasks,
  onNewTask,
}: {
  /** How many tasks Todo has */
  tasks: number
  onNewTask: () => void
}) {
  const t = useText(text)
  const setup = useSetup()
  if (!setup.view || !todoFirstRun(setup.view)) return null
  // Left part way: it goes on where it was
  const ai = lastReached() > 0 ? t.continueAi : t.setUpAi
  const close = () => {
    writeStored(REACHED_KEY, '0')
    void setup.save({ finished: true })
  }

  if (tasks > 0)
    return (
      <section
        aria-label={t.title}
        className="mt-5 flex items-center gap-3 rounded-xl bg-card-accent py-2.5 pr-2 pl-4"
      >
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-copy">{t.folded}</p>
        <Button size="sm" variant="outline" onClick={() => openAiSheet()}>
          {ai}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t.close}
          onClick={close}
        >
          <X />
        </Button>
      </section>
    )

  return (
    <section
      aria-label={t.title}
      className="mt-5 rounded-xl bg-card-accent px-5 pt-4 pb-3"
    >
      <h2 className="text-section">{t.title}</h2>
      <p className="text-meta text-muted-foreground">{t.lead}</p>
      <ul className="mt-3 flex flex-col divide-y divide-border border-t border-border">
        <StartRow
          icon={<Plus />}
          title={t.addTitle}
          body={t.addBody(isMac ? '⌘N' : 'Ctrl+N')}
        >
          <Button size="sm" onClick={onNewTask}>
            {t.newTask}
          </Button>
        </StartRow>
        <StartRow icon={<Sparkles />} title={t.aiTitle} body={t.aiBody}>
          <Button size="sm" variant="outline" onClick={() => openAiSheet()}>
            {ai}
          </Button>
        </StartRow>
        <StartRow icon={<Laptop />} title={t.macTitle} body={t.macBody}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openAiSheet('mac')}
          >
            {t.connect}
          </Button>
        </StartRow>
        <StartRow
          icon={<Smartphone />}
          title={t.deviceTitle}
          body={t.deviceBody}
        >
          <Button
            size="sm"
            variant="outline"
            onClick={() => go('#/settings/macs')}
          >
            {t.addDevice}
          </Button>
        </StartRow>
      </ul>
      <footer className="mt-1 flex items-center gap-2 border-t border-border pt-3">
        <p className="min-w-0 flex-1 text-meta text-muted-foreground">
          {t.pace}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void botControl()
              ?.setUp()
              .then(() => go('#/setup'))
          }
        >
          {t.setUpPace}
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          {t.close}
        </Button>
      </footer>
    </section>
  )
}

function StartRow({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-primary [&_svg]:size-4"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-row">{title}</p>
        <p className="text-meta text-muted-foreground">{body}</p>
      </div>
      {children}
    </li>
  )
}
