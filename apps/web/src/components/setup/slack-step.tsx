import type { HubUser } from '@src/hub/protocol'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import type { SettingsView } from '@src/settings/fields'
import type { ClaimedUser } from '@src/settings/setup'
import { ExternalLink, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Swap } from '@/components/ui/motion'
import { cn } from '@/lib/utils'
import { PaceSpinner } from '../pace-spinner'
import { SLACK_APP_URL } from '../slack-app-setup'
import { ChoiceCard, Chip, CommandLine, Note, StepFrame } from './parts'

export type SlackPart = 'choose' | 'app' | 'me'
type Connection = 'hub' | 'app'
type Me = { id: string; name: string }

/**
 * 3. How Pace reaches Slack: your team's hub, paired here, or your own Slack
 * app, made from the manifest (3a), and then told who you are with one
 * mention (3b)
 */
export function SlackStep({
  part,
  onPart,
  settings,
  connection: saved,
  onBack,
  onDone,
}: {
  part: SlackPart
  onPart: (part: SlackPart) => void
  settings: { view?: SettingsView; refresh: () => void }
  /** The connection chosen before, if any */
  connection?: Connection
  onBack: () => void
  onDone: (connection: Connection, me: Me) => void
}) {
  if (part === 'app')
    return (
      <AppTokens
        settings={settings}
        onBack={() => onPart('choose')}
        onDone={() => onPart('me')}
      />
    )
  if (part === 'me')
    return (
      <ItsMe onBack={() => onPart('app')} onDone={(me) => onDone('app', me)} />
    )
  return (
    <ChooseConnection
      settings={settings.view}
      saved={saved}
      onBack={onBack}
      onApp={() => onPart('app')}
      onPaired={(me) => onDone('hub', me)}
    />
  )
}

type PairState =
  | { step: 'idle'; note?: string }
  | { step: 'starting' }
  | { step: 'waiting'; code: string }
  | { step: 'bound'; user: HubUser }
  | { step: 'confirming'; user: HubUser }
  | { step: 'error'; message: string }

function ChooseConnection({
  settings,
  saved,
  onBack,
  onApp,
  onPaired,
}: {
  settings?: SettingsView
  saved?: Connection
  onBack: () => void
  onApp: () => void
  onPaired: (me: Me) => void
}) {
  const hub = window.pacenoteDesktop?.hub
  const [chosen, setChosen] = useState<Connection>()
  const connection: Connection =
    chosen ??
    saved ??
    (settings?.values.SLACK_CONNECTION === 'hub' || settings?.values.HUB_URL
      ? 'hub'
      : 'app')
  const [url, setUrl] = useState<string>()
  const hubUrl = url ?? settings?.values.HUB_URL ?? ''
  const [pair, setPair] = useState<PairState>({ step: 'idle' })

  useEffect(() => {
    if (pair.step !== 'waiting' || !hub) return
    const timer = setInterval(() => {
      void hub.pairStatus().then((res) => {
        if ('error' in res) setPair({ step: 'error', message: res.error })
        else if (res.status === 'bound')
          setPair({ step: 'bound', user: res.user })
        else if (res.status === 'expired')
          setPair({
            step: 'error',
            message: 'The code expired. Get a new one.',
          })
      })
    }, 1_500)
    return () => clearInterval(timer)
  }, [pair.step, hub])
  // Leaving cancels a pairing that was not confirmed.
  useEffect(() => () => void hub?.pairCancel(), [hub])

  const start = () => {
    setPair({ step: 'starting' })
    void hub
      ?.pairStart(hubUrl)
      .then((res) =>
        setPair(
          'error' in res
            ? { step: 'error', message: res.error }
            : { step: 'waiting', code: res.code }
        )
      )
  }
  const confirm = (user: HubUser) => {
    setPair({ step: 'confirming', user })
    void hub?.pairConfirm({ start: false }).then((res) => {
      if ('error' in res) return setPair({ step: 'error', message: res.error })
      if (res.issues.length > 0)
        return setPair({
          step: 'error',
          message: res.issues.map((issue) => issue.message).join(' '),
        })
      onPaired({ id: res.user.id, name: res.user.name })
    })
  }

  const primary =
    connection === 'app' ? (
      <Button onClick={onApp}>Set up your own app</Button>
    ) : pair.step === 'bound' || pair.step === 'confirming' ? (
      <>
        <Button
          variant="ghost"
          disabled={pair.step === 'confirming'}
          onClick={() => {
            void hub?.pairCancel()
            setPair({
              step: 'idle',
              note: 'Cancelled. If someone else sent your code, get a new one.',
            })
          }}
        >
          Not me
        </Button>
        <Button
          disabled={pair.step === 'confirming'}
          onClick={() => confirm(pair.user)}
        >
          {pair.step === 'confirming' && (
            <LoaderCircle className="animate-spin" />
          )}
          Yes, that's me
        </Button>
      </>
    ) : (
      <Button
        onClick={start}
        disabled={
          !hubUrl.trim() || pair.step === 'starting' || pair.step === 'waiting'
        }
      >
        {(pair.step === 'starting' || pair.step === 'waiting') && (
          <LoaderCircle className="animate-spin" />
        )}
        {pair.step === 'waiting' ? 'Waiting for Slack' : 'Get a pairing code'}
      </Button>
    )

  return (
    <StepFrame
      step="slack"
      title="Connect Pace to Slack"
      lead="Pace answers when someone mentions it in a public channel of your workspace."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <span className="flex-1" />
          {primary}
        </>
      }
    >
      <div
        role="radiogroup"
        aria-label="How Pace reaches Slack"
        className="grid grid-cols-1 gap-3 @min-[34rem]:grid-cols-2"
      >
        <ChoiceCard
          name="connection"
          value="hub"
          checked={connection === 'hub'}
          onChoose={() => setChosen('hub')}
        >
          <span className="flex items-center gap-2">
            <b className="text-sm">Join your team's hub</b>
            <Chip tone="neutral">For teams</Chip>
          </span>
          <span className="text-body text-muted-foreground">
            Someone on your team runs a Pacenote hub. You pair this Mac once,
            and the Slack tokens stay on the hub.
          </span>
        </ChoiceCard>
        <ChoiceCard
          name="connection"
          value="app"
          checked={connection === 'app'}
          onChoose={() => setChosen('app')}
        >
          <b className="text-sm">Use your own Slack app</b>
          <span className="text-body text-muted-foreground">
            Create an app from the Pacenote manifest and bring back two tokens.
            Best when you're the only one using Pace.
          </span>
        </ChoiceCard>
      </div>
      <Collapsible open={connection === 'hub'}>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 rounded-2xl bg-well px-5 py-4">
            <label className="flex flex-col gap-1.5 text-body font-medium">
              Hub address
              <Input
                type="url"
                value={hubUrl}
                placeholder="https://pacenote-hub.example.com"
                disabled={pair.step !== 'idle' && pair.step !== 'error'}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <Swap id={pair.step === 'confirming' ? 'bound' : pair.step}>
              <PairBody state={pair} />
            </Swap>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </StepFrame>
  )
}

function PairBody({ state }: { state: PairState }) {
  switch (state.step) {
    case 'idle':
      return (
        <p className="text-body text-muted-foreground">
          {state.note ??
            'You get a code to send to Pace in Slack. Your mentions then come to this Mac.'}
        </p>
      )
    case 'starting':
      return (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Getting a code from the hub
        </p>
      )
    case 'waiting':
      return (
        <div className="flex flex-col gap-2.5">
          <p className="text-body">
            In a channel Pace is in, send this. It expires in 10 minutes.
          </p>
          <CommandLine text={`@Pace connect ${state.code}`} />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <PaceSpinner className="size-6" />
            <span className="text-shimmer">Waiting for your mention</span>
          </p>
        </div>
      )
    case 'bound':
    case 'confirming':
      return <WhoSent user={state.user} where="sent the code" />
    case 'error':
      return (
        <p className="flex items-center gap-2 text-body text-status-failed">
          <TriangleAlert className="size-4 shrink-0" />
          {state.message}
        </p>
      )
  }
}

/** Who answered in Slack, to confirm it is you */
function WhoSent({
  user,
  where,
}: {
  user: { id: string; name: string; realName?: string }
  where: string
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-base font-semibold text-primary"
      >
        {(user.realName ?? user.name).slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-sm font-semibold">
          {user.realName ?? user.name}
        </b>
        <span className="truncate text-body text-muted-foreground">
          @{user.name} {where}
        </span>
      </span>
      <span className="text-sm font-semibold">Is this you?</span>
    </div>
  )
}

/** What the token check says about each token */
function tokenStates(items: SlackCheckItem[] | undefined) {
  const item = (label: string) => items?.find((each) => each.label === label)
  const bot = item('Bot token')
  const scopes = item('Bot scopes')
  const same = item('Same app')
  const socket = item('Socket Mode')
  const tokens = item('Tokens')
  const team = bot?.ok ? bot.detail?.split(' @ ')[1] : undefined
  return {
    app: socket
      ? socket.ok
        ? { ok: true, text: 'Valid' }
        : { ok: false, text: socket.detail ?? 'Not valid' }
      : undefined,
    bot: bot
      ? !bot.ok
        ? { ok: false, text: bot.detail ?? 'Not valid' }
        : scopes && !scopes.ok
          ? { ok: false, text: scopes.detail ?? 'Missing scopes' }
          : { ok: true, text: team ? `Valid · ${team}` : 'Valid' }
      : undefined,
    mismatch:
      same && !same.ok
        ? 'These tokens come from two different apps. Copy both from the same one.'
        : undefined,
    missing: tokens && !tokens.ok ? tokens.detail : undefined,
    ready: Boolean(
      bot?.ok && scopes?.ok !== false && same?.ok !== false && socket?.ok
    ),
  }
}

/** 3a. Your own Slack app: made from the manifest, and its two tokens */
function AppTokens({
  settings,
  onBack,
  onDone,
}: {
  settings: { view?: SettingsView; refresh: () => void }
  onBack: () => void
  onDone: () => void
}) {
  const bridge = window.pacenoteDesktop?.settings
  const secrets = settings.view?.secrets
  const [opened, setOpened] = useState(false)
  const [appToken, setAppToken] = useState('')
  const [botToken, setBotToken] = useState('')
  const [checking, setChecking] = useState(false)
  const [items, setItems] = useState<SlackCheckItem[]>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const haveApp = Boolean(appToken.trim() || secrets?.SLACK_APP_TOKEN?.set)
  const haveBot = Boolean(botToken.trim() || secrets?.SLACK_BOT_TOKEN?.set)
  const changes = {
    SLACK_CONNECTION: 'app',
    ...(appToken.trim() ? { SLACK_APP_TOKEN: appToken.trim() } : {}),
    ...(botToken.trim() ? { SLACK_BOT_TOKEN: botToken.trim() } : {}),
  }
  const key = JSON.stringify(changes)
  // Checked with Slack as soon as both are in, a moment after the last key
  const run = useRef(0)
  useEffect(() => {
    if (!bridge || !haveApp || !haveBot) {
      setItems(undefined)
      return
    }
    const id = ++run.current
    setChecking(true)
    const timer = setTimeout(() => {
      void bridge
        .checkSlack(JSON.parse(key) as Record<string, string>)
        .then((result) => {
          if (run.current !== id) return
          setItems(result)
          setChecking(false)
        })
    }, 500)
    return () => clearTimeout(timer)
  }, [bridge, key, haveApp, haveBot])
  const states = tokenStates(items)

  const connect = async () => {
    setSaving(true)
    setError(undefined)
    const result = await bridge?.save(changes)
    setSaving(false)
    settings.refresh()
    if (result?.issues.length)
      return setError(result.issues.map((issue) => issue.message).join(' '))
    void window.pacenoteDesktop?.setup.save({ slack: 'app' })
    onDone()
  }

  return (
    <StepFrame
      step="slack"
      part="Your own Slack app"
      title="Create your Slack app"
      lead="Pacenote fills in the app's name and permissions. You create it in your workspace and bring back two tokens."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <span className="flex-1" />
          {error && <p className="text-body text-status-failed">{error}</p>}
          <Button
            onClick={() => void connect()}
            disabled={!states.ready || checking || saving}
          >
            {(checking || saving) && haveApp && haveBot && (
              <LoaderCircle className="animate-spin" />
            )}
            Connect Slack
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-5">
        <li className="flex items-center gap-3">
          <StepNumber n={1} className="self-start" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="text-sm font-semibold">Create the app</b>
            <span className="text-body text-muted-foreground">
              Opens Slack with the Pacenote manifest filled in. Pick your
              workspace and choose Create.
            </span>
          </span>
          {opened && <Chip tone="ok">Opened in your browser</Chip>}
          <Button variant="outline" asChild>
            <a
              href={SLACK_APP_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpened(true)}
            >
              <ExternalLink />
              Create the Slack app
            </a>
          </Button>
        </li>
        <TokenField
          n={2}
          label="App-Level Token"
          setting="SLACK_APP_TOKEN"
          hint={secrets?.SLACK_APP_TOKEN}
          value={appToken}
          onChange={setAppToken}
          placeholder="xapp-..."
          where={
            <>
              In Slack: Basic Information, App-Level Tokens, Generate Token and
              Scopes, with{' '}
              <code className="rounded bg-well px-1 font-mono text-xs">
                connections:write
              </code>
            </>
          }
          state={states.app}
          checking={checking && haveApp && haveBot}
        />
        <TokenField
          n={3}
          label="Bot token"
          setting="SLACK_BOT_TOKEN"
          hint={secrets?.SLACK_BOT_TOKEN}
          value={botToken}
          onChange={setBotToken}
          placeholder="xoxb-..."
          where="In Slack: Install App, Install to your workspace, then copy the Bot User OAuth Token"
          state={states.bot}
          checking={checking && haveApp && haveBot}
        />
      </ol>
      {states.mismatch && (
        <p className="flex items-center gap-2 text-body text-status-failed">
          <TriangleAlert className="size-4 shrink-0" />
          {states.mismatch}
        </p>
      )}
      <Note>
        Does your workspace ask an admin to approve apps? Slack sends them the
        request when you install. Your progress here is saved; come back once
        it's approved.
      </Note>
    </StepFrame>
  )
}

function StepNumber({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground',
        className
      )}
    >
      {n}
    </span>
  )
}

function TokenField({
  n,
  label,
  setting,
  hint,
  value,
  onChange,
  placeholder,
  where,
  state,
  checking,
}: {
  n: number
  label: string
  setting: string
  hint?: { set: boolean; hint?: string }
  value: string
  onChange: (value: string) => void
  placeholder: string
  where: React.ReactNode
  state?: { ok: boolean; text: string }
  checking: boolean
}) {
  return (
    <li className="flex gap-3">
      <StepNumber n={n} />
      <label
        className="flex min-w-0 flex-1 flex-col gap-1.5"
        data-setting={setting}
      >
        <b className="text-sm font-semibold">{label}</b>
        <span className="flex items-center gap-2.5">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={
              hint?.set ? `Saved (${hint.hint ?? '...'})` : placeholder
            }
            onChange={(e) => onChange(e.target.value)}
            className="font-mono"
          />
          {checking ? (
            <Chip tone="neutral">
              <LoaderCircle className="animate-spin" />
              Checking
            </Chip>
          ) : state ? (
            <Chip tone={state.ok ? 'ok' : 'failed'} className="max-w-64">
              <span className="truncate" title={state.text}>
                {state.text}
              </span>
            </Chip>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">{where}</span>
      </label>
    </li>
  )
}

/**
 * 3b. "@Pace it's me": Pace, invited to a channel, is mentioned once, and the
 * person who did becomes the first who may ask once you confirm it is you
 */
function ItsMe({
  onBack,
  onDone,
}: {
  onBack: () => void
  onDone: (me: Me) => void
}) {
  const setup = window.pacenoteDesktop?.setup
  const [listening, setListening] = useState<
    | { state: 'starting' }
    | { state: 'on' }
    | { state: 'error'; message: string }
  >({ state: 'starting' })
  const [claimed, setClaimed] = useState<ClaimedUser>()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!setup) return
    let live = true
    setListening({ state: 'starting' })
    const off = setup.onClaim((user) => live && setClaimed(user))
    void setup.claimStart().then((res) => {
      if (!live) return
      setListening(
        'error' in res
          ? { state: 'error', message: res.error }
          : { state: 'on' }
      )
    })
    return () => {
      live = false
      off()
      void setup.claimStop()
    }
  }, [setup, attempt])

  const confirm = async (user: ClaimedUser) => {
    if (!setup) return
    setConfirming(true)
    setError(undefined)
    const res = await setup.claimConfirm(user)
    setConfirming(false)
    if ('error' in res) return setError(res.error)
    if (res.issues.length)
      return setError(res.issues.map((issue) => issue.message).join(' '))
    onDone({ id: user.id, name: user.name })
  }

  return (
    <StepFrame
      step="slack"
      part="Your own Slack app"
      title="Show Pace it's you"
      lead="Pace answers only the people you allow. Mention it once in Slack, and you're the first."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <span className="flex-1" />
          {error && <p className="text-body text-status-failed">{error}</p>}
          {claimed && (
            <>
              <Button
                variant="ghost"
                disabled={confirming}
                onClick={() => setClaimed(undefined)}
              >
                Not me
              </Button>
              <Button
                disabled={confirming}
                onClick={() => void confirm(claimed)}
              >
                {confirming && <LoaderCircle className="animate-spin" />}
                Yes, that's me
              </Button>
            </>
          )}
        </>
      }
    >
      <ol className="flex flex-col gap-3">
        <li className="flex items-center gap-3">
          <StepNumber n={1} />
          <span className="w-52 shrink-0 text-sm font-semibold">
            Invite Pace to a public channel
          </span>
          <CommandLine text="/invite @Pace" />
        </li>
        <li className="flex items-center gap-3">
          <StepNumber n={2} />
          <span className="w-52 shrink-0 text-sm font-semibold">
            Mention it there
          </span>
          <CommandLine text="@Pace it's me" />
        </li>
      </ol>
      <div className="rounded-2xl px-5 py-4 ring-1 ring-border">
        <Swap
          id={
            listening.state === 'error'
              ? 'error'
              : claimed
                ? `claimed:${claimed.id}`
                : listening.state
          }
        >
          {listening.state === 'error' ? (
            <div className="flex items-center gap-3">
              <TriangleAlert className="size-4 shrink-0 text-status-failed" />
              <p className="min-w-0 flex-1 text-body text-status-failed">
                {listening.message}
              </p>
              <Button
                variant="outline"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </Button>
            </div>
          ) : claimed ? (
            <WhoSent
              user={claimed}
              where={`mentioned Pace in ${claimed.channel} just now`}
            />
          ) : (
            <p className="flex items-center gap-2.5 text-body text-muted-foreground">
              <PaceSpinner className="size-6" />
              <span className="text-shimmer">
                {listening.state === 'on'
                  ? 'Waiting for your mention'
                  : 'Connecting to Slack'}
              </span>
            </p>
          )}
        </Swap>
      </div>
      <p className="text-body text-muted-foreground">
        Until setup finishes, Pace listens only for this mention and replies to
        you alone. You can let more people ask later in Settings.
      </p>
    </StepFrame>
  )
}
