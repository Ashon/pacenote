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
import { cn } from '@/lib/utils'

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
          res.error === 'Cancelled.'
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
            {state.prompt.code ? (
              <>
                Open the {name} page and enter this code:{' '}
                <b className="font-mono font-semibold tracking-wider select-text">
                  {state.prompt.code}
                </b>
              </>
            ) : (
              'Open the Claude page and approve, then paste the code it shows here.'
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={state.prompt.url} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open the {name} page
              </a>
            </Button>
            {state.prompt.paste && (
              <>
                <Input
                  className="max-w-72 font-mono"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && send()}
                  placeholder="Code from the page"
                  aria-label="Code from the Claude page"
                  disabled={state.sent}
                />
                <Button
                  size="sm"
                  onClick={send}
                  disabled={!code.trim() || state.sent}
                >
                  Sign in
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
          {(state.prompt.code || state.sent) && (
            <p className="flex items-center gap-2 text-meta text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              {state.sent
                ? 'Signing in…'
                : 'Waiting for you to approve on the page…'}
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
                  ? 'Starting the sign-in in the sandbox…'
                  : signedIn
                    ? `Signed in to ${name} inside the sandbox`
                    : `Sign in to ${name} inside the sandbox`}
            </p>
            {state.step !== 'error' && (
              <p className="mt-0.5 text-meta text-muted-foreground">
                {ready
                  ? `${name} signs in on ${cli === 'claude' ? 'Claude' : 'OpenAI'}'s own page and keeps its login in the sandbox. Pacenote never sees it. Uses your own plan.`
                  : 'Once the sandbox is ready: the sign-in runs inside it.'}
              </p>
            )}
          </div>
          {busy ? (
            <Button size="sm" variant="ghost" onClick={cancel}>
              <LoaderCircle className="animate-spin" />
              Cancel
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
                ? 'Try again'
                : signedIn
                  ? 'Sign in again'
                  : `Sign in to ${name}`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
