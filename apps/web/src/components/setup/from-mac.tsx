import { CircleCheck, Laptop, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useText } from '@/lib/i18n'
import { codeWords } from '@/lib/macs'
import type { useFromMac } from '@/lib/setup'
import { text } from './from-mac.text'

/**
 * Your other Mac, waiting in Add a Mac there: found on this network or by its
 * address, the number to compare, and once you Allow there, what came from it
 * (took). Pace's setup (3c), Todo's first run and Settings > Macs share it.
 */
export function FromMacBody({
  mac,
  took,
}: {
  mac: ReturnType<typeof useFromMac>
  /** What came from your other Mac, said once it is here */
  took: ReactNode
}) {
  const t = useText(text)
  const [typing, setTyping] = useState(false)
  const [address, setAddress] = useState('')
  const { state } = mac
  return (
    <div
      className="flex flex-col gap-3 rounded-xl bg-well px-5 py-4"
      data-from-mac={state.step}
      aria-live="polite"
    >
      {state.step === 'copied' ? (
        <>
          <b className="flex items-center gap-2 text-section">
            <CircleCheck className="size-4 text-status-succeeded" />
            {t.connectedTo(state.name)}
          </b>
          {took}
        </>
      ) : state.step === 'confirming' ? (
        <>
          <p
            className="text-number tracking-[0.2em] tabular-nums select-text"
            data-code
          >
            {codeWords(state.code)}
          </p>
          <p className="text-body">{t.sameNumber(state.name)}</p>
        </>
      ) : (
        <>
          <p className="text-body">
            {t.openAddMac((name) => (
              <span className="font-semibold whitespace-nowrap">{name}</span>
            ))}
          </p>
          {state.step === 'error' ? (
            <p className="flex items-start gap-2 text-body text-status-failed">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="select-text">{state.message}</span>
            </p>
          ) : state.step === 'connecting' ? (
            <p className="flex items-center gap-2 text-meta text-muted-foreground">
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              {state.retrying
                ? t.macRetrying(state.name)
                : t.macConnecting(state.name)}
            </p>
          ) : (
            <>
              {state.step === 'looking' &&
                state.found.map((found) => (
                  <div
                    key={found.instance}
                    className="flex items-center gap-3 rounded-lg bg-card px-3 py-2"
                  >
                    <Laptop className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-row">
                      {found.name}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => mac.connect({ instance: found.instance })}
                    >
                      {t.connect}
                    </Button>
                  </div>
                ))}
              <p className="flex items-center gap-2 text-meta text-muted-foreground">
                <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                {t.looking}
              </p>
            </>
          )}
          {state.step === 'error' && (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => mac.look()}
            >
              {t.tryAgain}
            </Button>
          )}
          {typing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (address.trim()) mac.connect({ address })
              }}
            >
              <Input
                autoFocus
                aria-label={t.macAddressLabel}
                placeholder={t.macAddressPlaceholder}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="h-8 flex-1"
              />
              <Button size="sm" type="submit" disabled={!address.trim()}>
                {t.connect}
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="self-start text-meta text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => setTyping(true)}
            >
              {t.enterAddress}
            </button>
          )}
        </>
      )}
    </div>
  )
}
