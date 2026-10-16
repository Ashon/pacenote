import type { AreaView, YouView } from '@src/you/types'
import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Swap, usePresence } from '@/components/ui/motion'
import { accountsSentence, partKey, roleSentence, useFixYou } from '@/lib/you'

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
        <h2 id="your-work" className="text-sm font-semibold">
          This is your work, as Pacenote sees it
        </h2>
        <span className="text-xs text-muted-foreground">
          {fixing
            ? 'Change what is off. Everything else stays as it is.'
            : 'From your last 30 days of tasks and sessions.'}
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
                  aria-label={`Name of ${area.name}`}
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
                  className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-semibold outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
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
                  <span className="text-xs text-muted-foreground">
                    Not yours anymore. Its tasks stay where they are.
                  </span>
                ) : (
                  <>
                    <span>{roleSentence(area)}</span>
                    {fixing && area.parts.length > 1 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {area.parts.map((part) => (
                          <span
                            key={partKey(part)}
                            className="inline-flex h-6 items-center gap-0.5 rounded-full bg-card pr-0.5 pl-2 font-mono text-xs"
                          >
                            {part.label}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="size-5 rounded-full"
                              aria-label={`Take ${part.label} out of ${area.name}`}
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
                      <span className="truncate font-mono text-xs text-muted-foreground">
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
                  {left ? 'Undo' : 'Not mine'}
                </Button>
              ) : (
                <span className="text-right text-xs text-muted-foreground">
                  {area.working
                    ? 'Working on it now'
                    : area.now.length
                      ? `${area.now.length} open`
                      : 'Quiet lately'}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {accounts && (
        <p className="text-xs text-muted-foreground">
          Found you as {accounts}.
        </p>
      )}
      <Swap id={fixing ? 'fixing' : 'asking'}>
        {fixing ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button size="sm" onClick={() => void fix.confirm()}>
              Done
            </Button>
            <span className="text-xs text-muted-foreground">
              Rename, merge or take apart areas any time on the{' '}
              <a href="#/you" className="text-primary hover:underline">
                You
              </a>{' '}
              screen.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => void fix.confirm()}>
              Looks right
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFixing(true)}>
              Fix something
            </Button>
          </div>
        )}
      </Swap>
    </section>
  )
}
