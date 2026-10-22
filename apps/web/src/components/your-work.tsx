import type { AreaView, YouView } from '@src/you/types'
import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Swap, usePresence } from '@/components/ui/motion'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import { useText } from '@/lib/i18n'
import { readStored, writeStored } from '@/lib/storage'
import { accountsSentence, partKey, roleSentence, useFixYou } from '@/lib/you'
import { text } from './your-work.text'

/** At most this many areas on the card; the rest are on the You screen */
const SHOWN = 4

/**
 * This is your work: once a collection has run and your areas were found,
 * the Todo screen shows them above your tasks, once, as Pacenote sees them.
 * Looks right puts the card away; Fix something lets you rename an area, take
 * a part out of it or say it is not yours, there and then. Either way the
 * You screen keeps them after.
 */
export function YourWork({ you }: { you: YouView | null | undefined }) {
  const t = useText(text)
  const fix = useFixYou()
  const [fixing, setFixing] = useState(false)
  // Areas you said are not yours, kept on the card to take back
  const [gone, setGone] = useState<AreaView[]>([])
  const show = Boolean(you?.firstLook)
  const card = usePresence<HTMLElement>(show)
  // Leaving, it still shows what it showed
  const last = useRef(you)
  if (show) last.current = you
  const view = last.current
  if (!card.mounted || !view) return null

  const areas = [
    ...view.areas.filter((area) => area.state === 'active'),
    ...gone,
  ]
    .filter((area, i, all) => all.findIndex((a) => a.id === area.id) === i)
    .slice(0, SHOWN)
  const accounts = accountsSentence(view.accounts)

  return (
    <section
      ref={card.ref}
      data-state={card.state}
      aria-labelledby="your-work"
      className="motion-fade mt-4 flex flex-col gap-2.5 rounded-xl bg-card-accent px-4 pt-3.5 pb-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="your-work" className="text-section">
          {t.title}
        </h2>
        <span className="text-meta text-muted-foreground">
          {fixing ? t.fixingHint : t.fromHint}
        </span>
      </div>
      <ul>
        {areas.map((area) => {
          const left = gone.some((each) => each.id === area.id)
          return (
            <li
              key={area.id}
              data-your-area={area.id}
              className="grid min-h-11 grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-primary/10 py-1.5 text-body first:border-t-0"
            >
              {fixing && !left ? (
                <input
                  aria-label={t.nameOf(area.name)}
                  defaultValue={area.name}
                  maxLength={60}
                  onBlur={(event) => {
                    const name = event.target.value.trim()
                    if (name && name !== area.name)
                      void fix.rename(area.id, name)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-section outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
              ) : (
                <span
                  className={
                    left
                      ? 'font-medium text-muted-foreground line-through decoration-1'
                      : 'font-semibold'
                  }
                >
                  {area.name}
                </span>
              )}
              <span className="flex min-w-0 flex-col">
                {left ? (
                  <span className="text-meta text-muted-foreground">
                    {t.notYours}
                  </span>
                ) : (
                  <>
                    <span>{roleSentence(area)}</span>
                    {fixing && area.parts.length > 1 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {area.parts.map((part) => (
                          <span
                            key={partKey(part)}
                            className="inline-flex h-6 items-center gap-0.5 rounded-full bg-card pr-0.5 pl-2 font-mono text-meta"
                          >
                            {part.label}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="size-5 rounded-full"
                              aria-label={t.takeOut(part.label, area.name)}
                              onClick={() =>
                                void fix.takeOut(area.id, partKey(part))
                              }
                            >
                              <X />
                            </Button>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="truncate font-mono text-meta text-muted-foreground">
                        {area.parts.map((part) => part.label).join(' · ')}
                      </span>
                    )}
                  </>
                )}
              </span>
              {fixing ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    void fix.leave(area.id, !left)
                    setGone(
                      left
                        ? gone.filter((each) => each.id !== area.id)
                        : [...gone, area]
                    )
                  }}
                >
                  {left ? t.undo : t.notMine}
                </Button>
              ) : (
                <span className="text-right text-meta text-muted-foreground">
                  {area.working
                    ? t.workingNow
                    : area.now.length
                      ? t.open(area.now.length)
                      : t.quiet}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {accounts && (
        <p className="text-meta text-muted-foreground">{t.foundAs(accounts)}</p>
      )}
      <Swap id={fixing ? 'fixing' : 'asking'}>
        {fixing ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button size="sm" onClick={() => void fix.confirm()}>
              {t.done}
            </Button>
            <span className="text-meta text-muted-foreground">
              {t.fixLater((label) => (
                <a href="#/you" className="text-primary hover:underline">
                  {label}
                </a>
              ))}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => void fix.confirm()}>
              {t.looksRight}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFixing(true)}>
              {t.fixSomething}
            </Button>
          </div>
        )}
      </Swap>
    </section>
  )
}

/** How the card looked last time it showed: its rows, and the accounts line */
const LAST_KEY = 'pacenote.tasks.your-work'

interface YourWorkShape {
  rows: number
  accounts: boolean
}

/** The card as it was last time, so its place is held while Todo loads */
export function lastYourWork(): YourWorkShape | undefined {
  try {
    const shape = JSON.parse(
      readStored(LAST_KEY) ?? 'null'
    ) as YourWorkShape | null
    return shape && shape.rows > 0 ? shape : undefined
  } catch {
    return undefined
  }
}

/** Remembers how the card shows now (or that it does not) */
export function rememberYourWork(you: YouView | null | undefined) {
  const rows = you?.firstLook
    ? Math.min(
        SHOWN,
        you.areas.filter((area) => area.state === 'active').length
      )
    : 0
  writeStored(
    LAST_KEY,
    JSON.stringify({
      rows,
      accounts: Boolean(you && accountsSentence(you.accounts)),
    })
  )
}

/** The card's place while Todo loads: its heading, rows and buttons */
export function YourWorkSkeleton({ rows, accounts }: YourWorkShape) {
  return (
    <section className="mt-4 flex flex-col gap-2.5 rounded-xl bg-card-accent px-4 pt-3.5 pb-3">
      <SkeletonText className="text-section" width="42%" />
      <ul>
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className="grid min-h-11 grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-primary/10 py-1.5 text-body first:border-t-0"
          >
            <SkeletonText width="70%" />
            <span className="flex min-w-0 flex-col">
              <SkeletonText width={i % 2 ? '48%' : '62%'} />
              <SkeletonText className="font-mono text-meta" width="40%" />
            </span>
            <SkeletonText className="w-14 text-meta" width="100%" />
          </li>
        ))}
      </ul>
      {accounts && <SkeletonText className="text-meta" width="36%" />}
      <div className="flex items-center gap-1.5">
        <SkeletonBlock className="h-7 w-21 rounded-md" />
        <SkeletonBlock className="h-7 w-24 rounded-md" />
      </div>
    </section>
  )
}
