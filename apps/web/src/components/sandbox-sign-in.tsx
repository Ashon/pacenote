import {
  CircleCheck,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { text } from './sandbox-sign-in.text'

type Cli = 'claude' | 'codex'
type Prompt = { url: string; code?: string; paste?: boolean }

const NAME: Record<Cli, string> = { claude: 'Claude', codex: 'Codex' }

/**
 * The sandbox's own sign-in to Claude or Codex: the CLI signs in inside a VM,
 * through the vendor's own page, and keeps its login there. This screen only
 * shows the page and code the CLI prints, and hands Claude the code its page
 * shows; the login itself never comes here (src/sandbox/vm-login.ts).
 */
export function SandboxSignIn({
  cli,
  signedIn,
  ready,
  onSignedIn,
  className,
}: {
  cli: Cli
  /** It signed in already: the action signs in again */
  signedIn: boolean
  /** The sandbox can run it: its image is ready */
  ready: boolean
  onSignedIn: () => void
  className?: string
}) {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.sandbox
  const [state, setState] = useState<
    | { step: 'idle' }
    | { step: 'starting' }
    | { step: 'prompt'; prompt: Prompt; sent?: boolean }
    | { step: 'error'; message: string }
  >({ step: 'idle' })
  const [code, setCode] = useState('')
  const name = NAME[cli]

  useEffect(() => {
    if (!bridge?.onLoginPrompt) return
    const off = bridge.onLoginPrompt((prompt) =>
      setState({ step: 'prompt', prompt })
    )
    // Leaving the screen stops a sign-in still waiting for the browser.
    return () => {
      off()
      void bridge.cancelLogin()
    }
  }, [bridge])
  if (!bridge?.login) return null

  const start = () => {
    setCode('')
    setState({ step: 'starting' })
    void bridge.login(cli).then((res) => {
      if (res.ok) {
        setState({ step: 'idle' })
        onSignedIn()
      } else
        setState(
          res.cancelled
            ? { step: 'idle' }
            : { step: 'error', message: res.error }
        )
    })
  }
  const send = () => {
    if (state.step !== 'prompt' || !code.trim()) return
    void bridge.loginCode(code.trim())
    setState({ ...state, sent: true })
  }
  const cancel = () => void bridge.cancelLogin()

  const busy = state.step === 'starting' || state.step === 'prompt'
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {state.step === 'prompt' ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-copy">
            {state.prompt.code
              ? t.enterCode(
                  name,
                  <b className="font-mono font-semibold tracking-wider select-text">
                    {state.prompt.code}
                  </b>
                )
              : t.approveAndPaste}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={state.prompt.url} target="_blank" rel="noreferrer">
                <ExternalLink />
                {t.openPage(name)}
              </a>
            </Button>
            {state.prompt.paste && (
              <>
                <Input
                  className="max-w-72 font-mono"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && send()}
                  placeholder={t.codePlaceholder}
                  aria-label={t.codeLabel}
                  disabled={state.sent}
                />
                <Button
                  size="sm"
                  onClick={send}
                  disabled={!code.trim() || state.sent}
                >
                  {t.signIn}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={cancel}>
              {t.cancel}
            </Button>
          </div>
          {(state.prompt.code || state.sent) && (
            <p className="flex items-center gap-2 text-meta text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              {state.sent ? t.signingIn : t.waitingApproval}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {state.step === 'error' ? (
            <TriangleAlert className="size-4 shrink-0 text-status-failed" />
          ) : signedIn ? (
            <CircleCheck className="size-4 shrink-0 text-status-succeeded" />
          ) : (
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-copy',
                state.step === 'error' ? 'text-status-failed' : 'font-medium'
              )}
            >
              {state.step === 'error'
                ? state.message
                : state.step === 'starting'
                  ? t.starting
                  : signedIn
                    ? t.signedIn(name)
                    : t.signInInside(name)}
            </p>
            {state.step !== 'error' && (
              <p className="mt-0.5 text-meta text-muted-foreground">
                {ready
                  ? t.ownPlan(name, cli === 'claude' ? 'Claude' : 'OpenAI')
                  : t.notReady}
              </p>
            )}
          </div>
          {busy ? (
            <Button size="sm" variant="ghost" onClick={cancel}>
              <LoaderCircle className="animate-spin" />
              {t.cancel}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={
                signedIn || state.step === 'error' ? 'outline' : 'default'
              }
              onClick={start}
              disabled={!ready}
            >
              <KeyRound />
              {state.step === 'error'
                ? t.tryAgain
                : signedIn
                  ? t.signInAgain
                  : t.signInTo(name)}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
