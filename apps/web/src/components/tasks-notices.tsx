import { Settings, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearFound } from '@/lib/ai-sheet'
import { useSupervisor } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import { useLanding } from '@/lib/tasks'
import { go } from '@/lib/utils'
import { text } from './tasks-page.text'

/**
 * What Todo tells you over its list, or in its place (tasks-page.tsx): what
 * your AI's first look added, that the window opens on Todo now, a channel
 * to leave out, and how to turn tasks on.
 */

/**
 * What Let your AI help's first look added, once it closed on Todo (the
 * task-first canvas's "처음 시작", O3): the tasks you added stay as they were
 */
export function FoundNotice({
  by,
  added,
  maybe,
  onMaybes,
}: {
  by: string
  added: number
  maybe: number
  onMaybes: () => void
}) {
  const t = useText(text)
  return (
    <section
      role="status"
      aria-label={t.foundTitle}
      className="mt-5 flex items-center gap-3 rounded-xl bg-card-accent py-2.5 pr-2.5 pl-4"
    >
      <Sparkles aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-copy">{t.foundBy(by, added, maybe)}</p>
      {maybe > 0 && (
        <Button size="xs" variant="ghost" onClick={onMaybes}>
          {t.lookAtMaybes}
        </Button>
      )}
      <Button size="xs" variant="outline" onClick={clearFound}>
        {t.foundRight}
      </Button>
    </section>
  )
}

/**
 * Told once, to someone who used Pace before the window opened on Todo: Pace's
 * screens are still there, and Overview can stay the first screen
 */
export function TodoFirst() {
  const t = useText(text)
  const supervisor = useSupervisor()
  const landing = useLanding()
  // Pace in use: set up, not off (a Pacenote for Todo alone has nothing new)
  const used = supervisor && !supervisor.off && supervisor.phase !== 'setup'
  if (!used || !landing.data || landing.data.told) return null
  return (
    <section
      aria-label={t.todoFirst}
      className="mt-5 flex items-center gap-3 rounded-xl bg-card-accent px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-section">{t.todoFirst}</p>
        <p className="text-meta text-muted-foreground">{t.todoFirstBody}</p>
      </div>
      <Button
        size="xs"
        variant="ghost"
        onClick={() =>
          void landing
            .set({ landing: 'overview', told: true })
            .then(() => go('#/'))
        }
      >
        {t.openOnOverview}
      </Button>
      <Button
        size="xs"
        variant="outline"
        onClick={() => void landing.set({ told: true })}
      >
        {t.gotIt}
      </Button>
    </section>
  )
}

/**
 * A channel you kept dismissing as not for you: Leave it out, or Not now,
 * which this browser remembers for that channel
 */
export function LeaveOutOffer({
  offer,
  onNotNow,
}: {
  offer: { label: string; count: number }
  onNotNow: () => void
}) {
  const t = useText(text)
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-card-accent px-4 py-3 text-copy">
      <span className="flex-1">
        {t.leaveOutOffer(offer.count, offer.label)}
      </span>
      <Button
        size="xs"
        onClick={() => void window.pacenoteDesktop?.tasks.leaveOut(offer.label)}
      >
        {t.leaveOut}
      </Button>
      <Button size="xs" variant="ghost" onClick={onNotNow}>
        {t.notNow}
      </Button>
    </div>
  )
}

/** How tasks are collected, and what it takes, before they are turned on */
export function Setup() {
  const t = useText(text)
  return (
    <div className="mt-2">
      <p className="text-copy text-muted-foreground">{t.setup}</p>
      <div className="mt-6 grid gap-4 @min-[44rem]:grid-cols-3">
        {[
          [t.needsTitle, t.needs],
          [t.readTitle, t.read],
          [t.howTitle, t.how],
        ].map(([title, body]) => (
          <section
            key={title}
            className="rounded-xl border border-border px-4 py-3.5"
          >
            <h2 className="text-section">{title}</h2>
            <p className="mt-1.5 text-copy leading-relaxed text-muted-foreground">
              {body}
            </p>
          </section>
        ))}
      </div>
      <Button className="mt-6" onClick={() => go('#/settings/tasks')}>
        <Settings />
        {t.turnOn}
      </Button>
    </div>
  )
}
