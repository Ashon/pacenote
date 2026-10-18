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
import { allowedIds } from '@/lib/setup'
import { cn } from '@/lib/utils'
import { PaceSpinner } from '../pace-spinner'
import { SLACK_APP_URL } from '../slack-app-setup'
import {
  ChoiceCard,
  Chip,
  CommandLine,
  Hint,
  Note,
  StepFrame,
  useWaited,
} from './parts'

export type SlackPart = 'choose' | 'app' | 'me'
type Connection = 'hub' | 'app'
type Me = { id: string; name: string }

/** Your Slack apps, where a made app's settings and tokens are */
const SLACK_APPS_URL = 'https://api.slack.com/apps'

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
  me,
  onBack,
  onDone,
}: {
  part: SlackPart
  onPart: (part: SlackPart) => void
  settings: { view?: SettingsView; refresh: () => void }
  /** The connection chosen before, if any */
  connection?: Connection
  /** Who setup let in before, if anyone */
  me?: Me
  onBack: () => void
  onDone: (connection: Connection, me: Me) => void
}) {
  const values = settings.view?.values
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
      <ItsMe
        before={
          saved === 'app' &&
          me &&
          allowedIds(values?.MENTION_ALLOWED_USERS).join() === me.id
            ? me
            : undefined
        }
        onBack={() => onPart('app')}
        onDone={(me) => onDone('app', me)}
      />
    )
  return (
    <ChooseConnection
      settings={settings.view}
      saved={saved}
      paired={saved === 'hub' ? me : undefined}
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
  /** afterCode: it went wrong after a code was given, so a new one is next */
  | { step: 'error'; message: string; afterCode?: boolean }

function ChooseConnection({
  settings,
  saved,
  paired,
  onBack,
  onApp,
  onPaired,
}: {
  settings?: SettingsView
  saved?: Connection
  /** Who paired this Mac with the hub before, in setup */
  paired?: Me
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
  /** The pairing asked for last: one cancelled meanwhile is let go */
  const attempt = useRef(0)
  // Paired here before, with this hub: going on needs no new code.
  const pairedHere =
    paired &&
    settings?.values.SLACK_CONNECTION === 'hub' &&
    settings.secrets.HUB_TOKEN?.set &&
    hubUrl.trim().replace(/\/+$/, '') === settings.values.HUB_URL
      ? paired
      : undefined

  useEffect(() => {
    if (pair.step !== 'waiting' || !hub) return
    const timer = setInterval(() => {
      void hub.pairStatus().then((res) => {
        if ('error' in res)
          setPair({ step: 'error', message: res.error, afterCode: true })
        else if (res.status === 'bound')
          setPair({ step: 'bound', user: res.user })
        else if (res.status === 'expired')
          setPair({
            step: 'error',
            message: 'The code expired before it came back. Get a new one.',
            afterCode: true,
          })
      })
    }, 1_500)
    return () => clearInterval(timer)
  }, [pair.step, hub])
  // Leaving cancels a pairing that was not confirmed.
  useEffect(() => () => void hub?.pairCancel(), [hub])

  const start = () => {
    const id = ++attempt.current
    setPair({ step: 'starting' })
    void hub?.pairStart(hubUrl).then((res) => {
      if (attempt.current !== id) {
        if (!('error' in res)) void hub.pairCancel()
        return
      }
      setPair(
        'error' in res
          ? { step: 'error', message: res.error }
          : { step: 'waiting', code: res.code }
      )
    })
  }
  const cancel = (note?: string) => {
    attempt.current += 1
    void hub?.pairCancel()
    setPair({ step: 'idle', note })
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
  const choose = (next: Connection) => {
    if (next === 'app' && pair.step !== 'idle') cancel()
    setChosen(next)
  }

  const asking = pair.step === 'starting' || pair.step === 'waiting'
  const primary =
    connection === 'app' ? (
      <Button onClick={onApp}>Set up your own app</Button>
    ) : pair.step === 'bound' || pair.step === 'confirming' ? null : asking ? (
      <>
        <Button variant="ghost" onClick={() => cancel()}>
          Cancel
        </Button>
        <Button disabled>
          <LoaderCircle className="animate-spin" />
          {pair.step === 'waiting' ? 'Waiting for Slack' : 'Getting a code'}
        </Button>
      </>
    ) : pairedHere ? (
      <>
        <Button variant="ghost" onClick={start}>
          Pair again
        </Button>
        <Button onClick={() => onPaired(pairedHere)}>
          Continue as @{pairedHere.name}
        </Button>
      </>
    ) : (
      <Button onClick={start} disabled={!hubUrl.trim()}>
        {pair.step === 'error' && pair.afterCode
          ? 'Get a new code'
          : 'Get a pairing code'}
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
          onChoose={() => choose('hub')}
        >
          <span className="flex items-center gap-2">
            <b className="text-section">Join your team's hub</b>
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
          onChoose={() => choose('app')}
        >
          <b className="text-section">Use your own Slack app</b>
          <span className="text-body text-muted-foreground">
            Create an app from the Pacenote manifest and bring back two tokens.
            Best when you're the only one using Pace.
          </span>
        </ChoiceCard>
      </div>
      <Collapsible open={connection === 'hub'}>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 rounded-xl bg-well px-5 py-4">
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
            <div aria-live="polite">
              <Swap id={pair.step === 'confirming' ? 'bound' : pair.step}>
                <PairBody
                  state={pair}
                  pairedHere={pairedHere}
                  onConfirm={confirm}
                  onNotMe={() =>
                    cancel(
                      'Cancelled. If someone else sent your code, get a new one.'
                    )
                  }
                />
              </Swap>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </StepFrame>
  )
}

function PairBody({
  state,
  pairedHere,
  onConfirm,
  onNotMe,
}: {
  state: PairState
  pairedHere?: Me
  onConfirm: (user: HubUser) => void
  onNotMe: () => void
}) {
  switch (state.step) {
    case 'idle':
      return (
        <p className="text-body text-muted-foreground">
          {state.note ??
            (pairedHere
              ? `This Mac is paired with this hub as @${pairedHere.name}.`
              : 'You get a code to send to Pace in Slack. Your mentions then come to this Mac.')}
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
          <CommandLine text={`@Pace connect ${state.code}`} raised />
          <p className="flex items-center gap-2 text-meta text-muted-foreground">
            <PaceSpinner className="size-6" />
            <span className="text-shimmer">Waiting for your mention</span>
          </p>
        </div>
      )
    case 'bound':
    case 'confirming':
      return (
        <WhoSent
          user={state.user}
          where="sent the code"
          actions={
            <>
              <Button
                variant="ghost"
                disabled={state.step === 'confirming'}
                onClick={onNotMe}
              >
                Not me
              </Button>
              <Button
                disabled={state.step === 'confirming'}
                onClick={() => onConfirm(state.user)}
              >
                {state.step === 'confirming' && (
                  <LoaderCircle className="animate-spin" />
                )}
                Yes, that's me
              </Button>
            </>
          }
        />
      )
    case 'error':
      return (
        <p className="flex items-start gap-2 text-body text-status-failed">
          <TriangleAlert className="mt-px size-4 shrink-0" />
          {state.message}
        </p>
      )
  }
}

/**
 * Who answered in Slack, to confirm it is you, with the buttons that do: they
 * come and go with the person, so they never answer for someone not shown
 */
function WhoSent({
  user,
  where,
  said,
  actions,
}: {
  user: { id: string; name: string; realName?: string }
  where: string
  /** What they wrote */
  said?: string
  actions: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-heading text-primary"
        >
          {(user.realName ?? user.name).slice(0, 1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-section">{user.realName ?? user.name}</b>
          <span className="truncate text-body text-muted-foreground">
            @{user.name} {where}
          </span>
          {said && (
            <span className="truncate text-body text-foreground">"{said}"</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-section">Is this you?</span>
        {actions}
      </div>
    </div>
  )
}

/**
 * A token that is not the kind its field takes, said before Slack is asked:
 * where it goes instead
 */
function tokenShape(kind: 'app' | 'bot', value: string): string | undefined {
  const token = value.trim()
  if (!token) return undefined
  if (kind === 'app') {
    if (token.startsWith('xapp-')) return undefined
    if (token.startsWith('xoxb-'))
      return 'This is the bot token. It goes in the next field.'
    return 'App-Level Tokens start with xapp-.'
  }
  if (token.startsWith('xoxb-')) return undefined
  if (token.startsWith('xapp-'))
    return 'This is the App-Level Token. It goes in the field above.'
  if (token.startsWith('xoxp-'))
    return 'This is a user token. Copy the Bot User OAuth Token, which starts with xoxb-.'
  return 'Bot tokens start with xoxb-.'
}

/** What Slack's answer about a token means, and what to do about it */
function slackProblem(kind: 'app' | 'bot', detail = ''): string {
  if (/invalid_auth|not_authed|invalid_token/.test(detail))
    return "Slack doesn't recognize this token. Copy it again from your app."
  if (/token_revoked|token_expired/.test(detail))
    return kind === 'app'
      ? 'This token was revoked. Generate a new App-Level Token.'
      : 'This token was revoked. Reinstall the app and copy the new bot token.'
  if (/account_inactive/.test(detail))
    return 'The app was removed from the workspace. Install it again and copy the new token.'
  if (/not_allowed_token_type/.test(detail))
    return kind === 'app'
      ? "This isn't an App-Level Token. Those start with xapp-."
      : "This isn't a bot token. Those start with xoxb-."
  if (
    /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|getaddrinfo/i.test(detail)
  )
    return "Couldn't reach Slack. Check your network."
  const missing = /^Missing: (.+)/.exec(detail)?.[1]
  if (missing)
    return `The app is missing permissions (${missing}). Create it from the manifest, or add them and reinstall it.`
  return detail || 'Slack turned this token down.'
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
        : { ok: false, text: slackProblem('app', socket.detail) }
      : undefined,
    bot: bot
      ? !bot.ok
        ? { ok: false, text: slackProblem('bot', bot.detail) }
        : scopes && !scopes.ok
          ? { ok: false, text: slackProblem('bot', scopes.detail) }
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

/**
 * 3a. Your own Slack app: made from the manifest, and its two tokens. A token
 * in the right shape is kept when you leave, so waiting for an admin's
 * approval loses nothing.
 */
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
  const shape = {
    app: tokenShape('app', appToken),
    bot: tokenShape('bot', botToken),
  }
  const haveApp = Boolean(appToken.trim() || secrets?.SLACK_APP_TOKEN?.set)
  const haveBot = Boolean(botToken.trim() || secrets?.SLACK_BOT_TOKEN?.set)
  const shaped = !shape.app && !shape.bot
  const changes = {
    SLACK_CONNECTION: 'app',
    ...(appToken.trim() ? { SLACK_APP_TOKEN: appToken.trim() } : {}),
    ...(botToken.trim() ? { SLACK_BOT_TOKEN: botToken.trim() } : {}),
  }
  const key = JSON.stringify(changes)
  // Checked with Slack as soon as both are in, a moment after the last key
  const run = useRef(0)
  useEffect(() => {
    if (!bridge || !haveApp || !haveBot || !shaped) {
      run.current += 1
      setItems(undefined)
      setChecking(false)
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
  }, [bridge, key, haveApp, haveBot, shaped])
  const states = tokenStates(items)

  // Kept on the way out: the tokens typed here that look right
  const typed = useRef({ appToken, botToken })
  useEffect(() => {
    typed.current = { appToken, botToken }
  })
  const { refresh } = settings
  useEffect(
    () => () => {
      const { appToken, botToken } = typed.current
      const keep = {
        ...(appToken.trim() && !tokenShape('app', appToken)
          ? { SLACK_APP_TOKEN: appToken.trim() }
          : {}),
        ...(botToken.trim() && !tokenShape('bot', botToken)
          ? { SLACK_BOT_TOKEN: botToken.trim() }
          : {}),
      }
      if (Object.keys(keep).length > 0) void bridge?.save(keep).then(refresh)
    },
    [bridge, refresh]
  )

  const connect = async () => {
    setSaving(true)
    setError(undefined)
    const result = await bridge?.save(changes)
    setSaving(false)
    settings.refresh()
    if (result?.issues.length)
      return setError(result.issues.map((issue) => issue.message).join(' '))
    typed.current = { appToken: '', botToken: '' }
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
            <b className="text-section">Create the app</b>
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
              In the app's Basic Information, under App-Level Tokens, choose
              Generate Token and Scopes, add{' '}
              <code className="rounded-sm bg-well px-1 font-mono text-meta">
                connections:write
              </code>
              , and copy the token.
            </>
          }
          state={shape.app ? { ok: false, text: shape.app } : states.app}
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
          where="Under Install App, install it to your workspace, then copy the Bot User OAuth Token."
          state={shape.bot ? { ok: false, text: shape.bot } : states.bot}
          checking={checking && haveApp && haveBot}
        />
      </ol>
      {states.mismatch && (
        <p
          role="alert"
          className="flex items-center gap-2 text-body text-status-failed"
        >
          <TriangleAlert className="size-4 shrink-0" />
          {states.mismatch}
        </p>
      )}
      <p className="text-body text-muted-foreground">
        Made the app already? Its settings are in{' '}
        <a
          href={SLACK_APPS_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          your Slack apps
        </a>
        .
      </p>
      <Note>
        Does your workspace ask an admin to approve apps? Slack sends them the
        request when you install. The tokens you enter here are kept, so you can
        come back once it's approved.
      </Note>
    </StepFrame>
  )
}

function StepNumber({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full bg-muted text-meta font-semibold text-muted-foreground',
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
  const problem = !checking && state && !state.ok ? state.text : undefined
  return (
    <li className="flex gap-3">
      <StepNumber n={n} />
      <label
        className="flex min-w-0 flex-1 flex-col gap-1.5"
        data-setting={setting}
      >
        <b className="text-section">{label}</b>
        <span className="flex items-center gap-2.5">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            aria-invalid={problem ? true : undefined}
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
          ) : state?.ok ? (
            <Chip tone="ok" className="max-w-64">
              <span className="truncate" title={state.text}>
                {state.text}
              </span>
            </Chip>
          ) : state ? (
            <Chip tone="failed">Not valid</Chip>
          ) : null}
        </span>
        {problem ? (
          <span role="alert" className="text-body text-status-failed">
            {problem}
          </span>
        ) : null}
        <span className="text-meta text-muted-foreground">{where}</span>
      </label>
    </li>
  )
}

/**
 * 3b. "@Pace it's me": Pace, invited to a channel, is mentioned once, and the
 * person who did becomes the one Pace answers once you confirm it is you.
 * The first to mention it stays shown until you say it is not you, so the
 * name cannot change under the button.
 */
function ItsMe({
  before,
  onBack,
  onDone,
}: {
  /** Who you said you were before, still let in */
  before?: Me
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
  const [notMe, setNotMe] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!setup) return
    let live = true
    setListening({ state: 'starting' })
    setClaimed(undefined)
    const off = setup.onClaim(
      (user) => live && setClaimed((shown) => shown ?? user)
    )
    const ended = setup.onClaimEnded(
      (message) => live && setListening({ state: 'error', message })
    )
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
      ended()
      void setup.claimStop()
    }
  }, [setup, attempt])
  const waited = useWaited(listening.state === 'on' && !claimed, 30_000)

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
      lead="Pace answers only you. Mention it once in Slack so it knows which account is yours."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <span className="flex-1" />
          {before && !claimed && (
            <Button onClick={() => onDone(before)}>
              Continue as @{before.name}
            </Button>
          )}
        </>
      }
    >
      <ol className="flex flex-col gap-3">
        <li className="flex items-center gap-3">
          <StepNumber n={1} />
          <span className="w-52 shrink-0 text-section">
            Invite Pace to a public channel
          </span>
          <CommandLine text="/invite @Pace" />
        </li>
        <li className="flex items-center gap-3">
          <StepNumber n={2} />
          <span className="w-52 shrink-0 text-section">Mention it there</span>
          <CommandLine text="@Pace it's me" />
        </li>
      </ol>
      <div
        aria-live="polite"
        className="rounded-xl px-5 py-4 ring-1 ring-border"
      >
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
              said={claimed.said}
              actions={
                <>
                  <Button
                    variant="ghost"
                    disabled={confirming}
                    onClick={() => {
                      setClaimed(undefined)
                      setNotMe(true)
                      setError(undefined)
                    }}
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
              }
            />
          ) : (
            <p className="flex items-center gap-2.5 text-body text-muted-foreground">
              <PaceSpinner className="size-6" />
              <span className="text-shimmer">
                {listening.state === 'on'
                  ? notMe
                    ? 'Waiting for your mention. Send it from your own account.'
                    : 'Waiting for your mention'
                  : 'Connecting to Slack'}
              </span>
            </p>
          )}
        </Swap>
      </div>
      {error && (
        <p role="alert" className="text-body text-status-failed">
          {error}
        </p>
      )}
      {waited && (
        <Hint>
          Nothing yet? Check that Pace is in that channel, and pick Pace from
          the list that opens as you type @Pace, so the message mentions it.
        </Hint>
      )}
      <p className="text-body text-muted-foreground">
        While this is open, Pace answers no one: it only notes who mentions it
        and tells that person alone to confirm here. After that, it answers only
        you.
      </p>
    </StepFrame>
  )
}
