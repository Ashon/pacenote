import type { HubInstallState } from '@src/hub/protocol'
import {
  ChevronRight,
  CircleCheck,
  Copy,
  LoaderCircle,
  Server,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Swap } from '@/components/ui/motion'
import { useLocale, useText } from '@/lib/i18n'
import { CopyButton } from './code-block'
import { text } from './hub-install.text'

/**
 * "No hub yet?": the command that installs a team hub on a Linux server
 * (deploy/hub/install.sh), then the wait for it at its address. In Settings,
 * Pace switches to the hub as soon as it answers; in setup, or without a
 * member ID to pair as, this Mac pairs with a code once it does. Pacenote
 * keeps the wait, so leaving the screen does not end it.
 */
export function HubInstall({
  switchHere,
  allow: initialAllow,
  url: initialUrl,
  onUp,
  onSwitched,
}: {
  switchHere: boolean
  /** Who can use it, to start with: you */
  allow: string
  /** The address typed above it, to start with */
  url: string
  /** It answers and this Mac pairs with a code: at this address */
  onUp: (url: string) => void
  /** Pace answers through it now */
  onSwitched: (state: Extract<HubInstallState, { step: 'switched' }>) => void
}) {
  const t = useText(text)
  const locale = useLocale()
  const hub = window.pacenoteDesktop?.hub
  const [state, setState] = useState<HubInstallState>({ step: 'idle' })
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(initialUrl)
  const [allow, setAllow] = useState(initialAllow)
  const [lang, setLang] = useState<'en' | 'ko'>(locale === 'ko' ? 'ko' : 'en')
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)
  // Each answer is acted on once, here
  const handled = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!hub) return
    void hub.installState().then(setState)
    return hub.onInstall(setState)
  }, [hub])
  // A wait already going (another screen started it) shows open
  useEffect(() => {
    if (state.step !== 'idle') setOpen(true)
  }, [state.step])
  useEffect(() => {
    const key = `${state.step}:${'url' in state ? state.url : ''}`
    if (handled.current === key) return
    handled.current = key
    if (state.step === 'up') onUp(state.url)
    if (state.step === 'switched') onSwitched(state)
  }, [state, onUp, onSwitched])

  if (!hub) return null

  const copy = () => {
    setError(undefined)
    void hub.installCommand({ url, allow, lang, switchHere }).then((res) => {
      if ('error' in res) return setError(res.error)
      setState(res)
      if (res.step === 'waiting')
        void navigator.clipboard
          .writeText(res.command)
          .then(() => setCopied(true))
          // Not copied: the command shows with its own copy button
          .catch(() => undefined)
    })
  }
  const command =
    state.step === 'waiting' || state.step === 'gave-up'
      ? state.command
      : undefined
  const script = command && /curl -fsSL (\S+)/.exec(command)?.[1]

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-hub-install>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 py-1 text-left text-meta text-muted-foreground transition-colors hover:text-foreground">
        <Server className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{t.open}</span>
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-lg bg-card px-3.5 py-3 shadow-xs">
          <p className="text-meta text-muted-foreground">{t.lead}</p>
          <Swap id={state.step === 'idle' ? 'form' : state.step}>
            {state.step === 'idle' ? (
              <div className="space-y-2.5">
                <label className="block space-y-1">
                  <span className="text-row">{t.address}</span>
                  <Input
                    value={url}
                    placeholder="http://10.0.0.5:8790"
                    onChange={(e) => setUrl(e.target.value)}
                    className="h-7 font-mono text-meta"
                  />
                  <span className="block text-meta text-muted-foreground">
                    {t.addressHelp}
                  </span>
                </label>
                <label className="block space-y-1">
                  <span className="text-row">{t.allow}</span>
                  <Input
                    value={allow}
                    placeholder="U012AB3CD, U045EF6GH"
                    onChange={(e) => setAllow(e.target.value)}
                    className="h-7 font-mono text-meta"
                  />
                  <span className="block text-meta text-muted-foreground">
                    {t.allowHelp}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-row">{t.notes}</span>
                  <select
                    value={lang}
                    onChange={(e) =>
                      setLang(e.target.value === 'ko' ? 'ko' : 'en')
                    }
                    className="h-7 rounded-md border border-input bg-background px-2 text-meta outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/30"
                  >
                    <option value="en">English</option>
                    <option value="ko">한국어</option>
                  </select>
                  <span className="flex-1" />
                  <Button size="sm" onClick={copy} disabled={!url.trim()}>
                    <Copy />
                    {t.copy}
                  </Button>
                </div>
                {error && (
                  <p className="flex items-start gap-1.5 text-meta text-status-failed">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    {error}
                  </p>
                )}
              </div>
            ) : state.step === 'switched' ? (
              <p className="flex items-center gap-2 text-copy">
                <CircleCheck className="size-4 shrink-0 text-status-succeeded" />
                {t.switched(state.url, state.user.name)}
              </p>
            ) : state.step === 'up' ? (
              <p className="flex items-center gap-2 text-copy">
                <CircleCheck className="size-4 shrink-0 text-status-succeeded" />
                {t.up(state.url)}
              </p>
            ) : (
              <div className="space-y-2.5">
                {command && (
                  <div className="flex items-start gap-1 rounded-md bg-well px-2.5 py-2">
                    <code
                      className="min-w-0 flex-1 font-mono text-meta break-all select-all"
                      data-hub-command
                    >
                      {command}
                    </code>
                    <CopyButton text={command} className="-my-1 shrink-0" />
                  </div>
                )}
                {copied && state.step === 'waiting' && (
                  <p className="text-meta text-muted-foreground">
                    {t.copied}{' '}
                    {script && (
                      <a
                        href={script}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {t.readFirst}
                      </a>
                    )}
                  </p>
                )}
                {state.step === 'waiting' ? (
                  <div className="flex items-center gap-2">
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-copy">
                        <span className="text-shimmer">
                          {t.waiting(state.url)}
                        </span>
                      </p>
                      <p className="text-meta text-muted-foreground">
                        {state.switches ? t.switchesHere : t.pairsHere}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void hub.installCancel()}
                    >
                      {t.stopWaiting}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0 text-status-interrupted" />
                    <p className="min-w-0 flex-1 text-copy">
                      {t.gaveUp(state.url)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void hub.installWait()}
                    >
                      {t.waitAgain}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Swap>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
