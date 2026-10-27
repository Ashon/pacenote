import type { HubUser } from '@src/hub/protocol'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import type { SettingsView } from '@src/settings/fields'
import type { ClaimedUser } from '@src/settings/setup'
import {
  CircleCheck,
  ExternalLink,
  Laptop,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Swap } from '@/components/ui/motion'
import { useText } from '@/lib/i18n'
import { HubInstall } from '../hub-install'
import { useHubPairing, type PairState } from '@/lib/hub'
import { codeWords } from '@/lib/macs'
import { allowedIds, useFromMac } from '@/lib/setup'
import { cn } from '@/lib/utils'
import { localized } from '@src/i18n/locale'
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
import { text } from './slack-step.text'

export type SlackPart = 'choose' | 'app' | 'me'
type Connection = 'hub' | 'app'
/** The hub, your own app, or your own app as your other Mac has it */
type Choice = Connection | 'mac'
type Me = { id: string; name: string }

/** Your Slack apps, where a made app's settings and tokens are */
const SLACK_APPS_URL = 'https://api.slack.com/apps'

/**
 * 3. How Pace reaches Slack: your team's hub, paired here; your own Slack
 * app, made from the manifest (3a), and then told who you are with one
 * mention (3b); or your own Slack app and who you are, taken from your other
 * Mac (3c, Add a Mac there)
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
      onFromMac={(me) => onDone('app', me)}
    />
  )
}

function ChooseConnection({
  settings,
  saved,
  paired,
  onBack,
  onApp,
  onPaired,
  onFromMac,
}: {
  settings?: SettingsView
  saved?: Connection
  /** Who paired this Mac with the hub before, in setup */
  paired?: Me
  onBack: () => void
  onApp: () => void
  onPaired: (me: Me) => void
  /** Set up from your other Mac: on to the review */
  onFromMac: (me: Me) => void
}) {
  const t = useText(text)
  const mac = useFromMac()
  const [chosen, setChosen] = useState<Choice>()
  const connection: Choice =
    chosen ??
    saved ??
    (settings?.values.SLACK_CONNECTION === 'hub' || settings?.values.HUB_URL
      ? 'hub'
      : 'app')
  const [url, setUrl] = useState<string>()
  const hubUrl = url ?? settings?.values.HUB_URL ?? ''
  const {
    state: pair,
    start: startPairing,
    cancel,
    confirm,
  } = useHubPairing({
    pollMs: 1_500,
    expired: t.codeExpired,
    confirmWith: { start: false },
    onPaired: ({ user }) => onPaired({ id: user.id, name: user.name }),
  })
  // Paired here before, with this hub: going on needs no new code.
  const pairedHere =
    paired &&
    settings?.values.SLACK_CONNECTION === 'hub' &&
    settings.secrets.HUB_TOKEN?.set &&
    hubUrl.trim().replace(/\/+$/, '') === settings.values.HUB_URL
      ? paired
      : undefined

  // Leaving the step lets your other Mac go
  useEffect(() => () => void window.pacenoteDesktop?.setup?.macCancel(), [])
  // A pacenote:// link from the hub's installer or a teammate's share link:
  // that hub, to pair with
  useEffect(() => {
    const hub = window.pacenoteDesktop?.hub
    if (!hub) return
    const take = () =>
      void hub.takeLink().then((linked) => {
        if (!linked) return
        setChosen('hub')
        setUrl(linked)
      })
    take()
    return hub.onLinked(take)
  }, [])

  const start = () => startPairing(hubUrl)
  const choose = (next: Choice) => {
    if (next !== 'hub' && pair.step !== 'idle') cancel()
    if (next === 'mac' && connection !== 'mac') mac.look()
    if (next !== 'mac' && connection === 'mac') mac.cancel()
    setChosen(next)
  }

  const asking = pair.step === 'starting' || pair.step === 'waiting'
  const copied = mac.state.step === 'copied' ? mac.state : undefined
  const primary =
    connection === 'mac' ? (
      copied ? (
        <Button
          onClick={() =>
            onFromMac(
              copied.me ?? {
                id: allowedIds(settings?.values.MENTION_ALLOWED_USERS)[0] ?? '',
                name: copied.name,
              }
            )
          }
        >
          {t.continue}
        </Button>
      ) : mac.state.step === 'confirming' ? (
        <>
          <Button variant="ghost" onClick={() => mac.look()}>
            {t.cancel}
          </Button>
          <Button disabled>
            <LoaderCircle className="animate-spin" />
            {t.waitingFor(mac.state.name)}
          </Button>
        </>
      ) : null
    ) : connection === 'app' ? (
      <Button onClick={onApp}>{t.setUpOwnApp}</Button>
    ) : pair.step === 'bound' || pair.step === 'confirming' ? null : asking ? (
      <>
        <Button variant="ghost" onClick={() => cancel()}>
          {t.cancel}
        </Button>
        <Button disabled>
          <LoaderCircle className="animate-spin" />
          {pair.step === 'waiting' ? t.waitingForSlack : t.gettingCode}
        </Button>
      </>
    ) : pairedHere ? (
      <>
        <Button variant="ghost" onClick={start}>
          {t.pairAgain}
        </Button>
        <Button onClick={() => onPaired(pairedHere)}>
          {t.continueAs(pairedHere.name)}
        </Button>
      </>
    ) : (
      <Button onClick={start} disabled={!hubUrl.trim()}>
        {pair.step === 'error' && pair.afterCode
          ? t.getNewCode
          : t.getPairingCode}
      </Button>
    )

  return (
    <StepFrame
      step="slack"
      title={t.title}
      lead={t.lead}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            {t.back}
          </Button>
          <span className="flex-1" />
          {primary}
        </>
      }
    >
      <div
        role="radiogroup"
        aria-label={t.connectionLabel}
        className="grid grid-cols-1 gap-3"
      >
        {/* Each way: its value, its name, what it is, and a word beside it */}
        {(
          [
            ['hub', t.hubTitle, t.hubWhat, t.forTeams],
            ['app', t.appCardTitle, t.appWhat],
            ['mac', t.macTitle, t.macWhat, t.alreadySetUp],
          ] as const
        ).map(([value, title, what, chip]) => (
          <ChoiceCard
            key={value}
            name="connection"
            value={value}
            checked={connection === value}
            onChoose={() => choose(value)}
          >
            {chip ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <b className="text-section">{title}</b>
                <Chip tone="neutral">{chip}</Chip>
              </span>
            ) : (
              <b className="text-section">{title}</b>
            )}
            <span className="text-body text-muted-foreground">{what}</span>
          </ChoiceCard>
        ))}
      </div>
      <Collapsible open={connection === 'mac'}>
        <CollapsibleContent>
          <FromMacBody mac={mac} />
        </CollapsibleContent>
      </Collapsible>
      <Collapsible open={connection === 'hub'}>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 rounded-xl bg-well px-5 py-4">
            <label className="flex flex-col gap-1.5 text-body font-medium">
              {t.hubAddress}
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
                  onNotMe={() => cancel(t.cancelledNotMe)}
                />
              </Swap>
            </div>
            {(pair.step === 'idle' || pair.step === 'error') && !pairedHere && (
              // Setup starts Pace after its review, so this Mac pairs with a
              // code once the hub answers.
              <HubInstall
                switchHere={false}
                allow=""
                url={hubUrl}
                onUp={(installed) => {
                  setUrl(installed)
                  startPairing(installed)
                }}
                onSwitched={() => undefined}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </StepFrame>
  )
}

/**
 * 3c. Your other Mac: found waiting in Add a Mac, or by its address; the
 * number to compare; and what came from it
 */
function FromMacBody({ mac }: { mac: ReturnType<typeof useFromMac> }) {
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
          <ul className="flex flex-col gap-1 text-body">
            <li>{t.yourSlackApp}</li>
            {state.me && <li>{t.paceAnswers(state.me.name)}</li>}
            <li>{t.todoSettings}</li>
            <li>{t.followMac}</li>
          </ul>
          <p className="text-meta text-muted-foreground">{t.stayWithEachMac}</p>
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
  const t = useText(text)
  switch (state.step) {
    case 'idle':
      return (
        <p className="text-body text-muted-foreground">
          {state.note ??
            (pairedHere ? t.pairedHere(pairedHere.name) : t.pairWhat)}
        </p>
      )
    case 'starting':
      return (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t.gettingCodeFromHub}
        </p>
      )
    case 'waiting':
      return (
        <div className="flex flex-col gap-2.5">
          <p className="text-body">{t.sendThis}</p>
          <CommandLine text={`@Pace connect ${state.code}`} raised />
          <p className="flex items-center gap-2 text-meta text-muted-foreground">
            <PaceSpinner className="size-6" />
            <span className="text-shimmer">{t.waitingForMention}</span>
          </p>
        </div>
      )
    case 'bound':
    case 'confirming':
      return (
        <WhoSent
          user={state.user}
          line={t.sentTheCode(state.user.name)}
          actions={
            <>
              <Button
                variant="ghost"
                disabled={state.step === 'confirming'}
                onClick={onNotMe}
              >
                {t.notMe}
              </Button>
              <Button
                disabled={state.step === 'confirming'}
                onClick={() => onConfirm(state.user)}
              >
                {state.step === 'confirming' && (
                  <LoaderCircle className="animate-spin" />
                )}
                {t.yesMe}
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
  line,
  said,
  actions,
}: {
  user: { id: string; name: string; realName?: string }
  /** What they did, under their name: "@ash sent the code" */
  line: string
  /** What they wrote */
  said?: string
  actions: React.ReactNode
}) {
  const t = useText(text)
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
            {line}
          </span>
          {said && (
            <span className="truncate text-body text-foreground">"{said}"</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-section">{t.isThisYou}</span>
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
  const t = localized(text)
  const token = value.trim()
  if (!token) return undefined
  if (kind === 'app') {
    if (token.startsWith('xapp-')) return undefined
    if (token.startsWith('xoxb-')) return t.botTokenHere
    return t.appTokenStart
  }
  if (token.startsWith('xoxb-')) return undefined
  if (token.startsWith('xapp-')) return t.appTokenHere
  if (token.startsWith('xoxp-')) return t.userToken
  return t.botTokenStart
}

/** What Slack's answer about a token means, and what to do about it */
function slackProblem(
  kind: 'app' | 'bot',
  detail = '',
  missing?: string[]
): string {
  const t = localized(text)
  if (/invalid_auth|not_authed|invalid_token/.test(detail))
    return t.notRecognized
  if (/token_revoked|token_expired/.test(detail))
    return kind === 'app' ? t.appRevoked : t.botRevoked
  if (/account_inactive/.test(detail)) return t.appRemoved
  if (/not_allowed_token_type/.test(detail))
    return kind === 'app' ? t.notAppToken : t.notBotToken
  if (
    /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|getaddrinfo/i.test(detail)
  )
    return t.unreachable
  if (missing?.length) return t.missingScopes(missing.join(', '))
  return detail || t.turnedDown
}

/** What the token check says about each token */
function tokenStates(items: SlackCheckItem[] | undefined) {
  const t = localized(text)
  const item = (id: SlackCheckItem['id']) =>
    items?.find((each) => each.id === id)
  const bot = item('botToken')
  const scopes = item('botScopes')
  const same = item('sameApp')
  const socket = item('socketMode')
  const tokens = item('tokens')
  const team = bot?.ok ? bot.team : undefined
  return {
    app: socket
      ? socket.ok
        ? { ok: true, text: t.valid }
        : { ok: false, text: slackProblem('app', socket.detail) }
      : undefined,
    bot: bot
      ? !bot.ok
        ? { ok: false, text: slackProblem('bot', bot.detail) }
        : scopes && !scopes.ok
          ? {
              ok: false,
              text: slackProblem('bot', scopes.detail, scopes.missing),
            }
          : { ok: true, text: team ? t.validIn(team) : t.valid }
      : undefined,
    mismatch: same && !same.ok ? t.mismatch : undefined,
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
  const t = useText(text)
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
      part={t.ownApp}
      title={t.createAppTitle}
      lead={t.appLead}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            {t.back}
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
            {t.connectSlack}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-5">
        <li className="flex items-center gap-3">
          <StepNumber n={1} className="self-start" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="text-section">{t.createApp}</b>
            <span className="text-body text-muted-foreground">
              {t.createAppWhat}
            </span>
          </span>
          {opened && <Chip tone="ok">{t.opened}</Chip>}
          <Button variant="outline" asChild>
            <a
              href={SLACK_APP_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpened(true)}
            >
              <ExternalLink />
              {t.createSlackApp}
            </a>
          </Button>
        </li>
        <TokenField
          n={2}
          label={t.appToken}
          setting="SLACK_APP_TOKEN"
          hint={secrets?.SLACK_APP_TOKEN}
          value={appToken}
          onChange={setAppToken}
          placeholder="xapp-..."
          where={t.appTokenWhere(
            <code className="rounded-sm bg-well px-1 font-mono text-meta">
              connections:write
            </code>
          )}
          state={shape.app ? { ok: false, text: shape.app } : states.app}
          checking={checking && haveApp && haveBot}
        />
        <TokenField
          n={3}
          label={t.botToken}
          setting="SLACK_BOT_TOKEN"
          hint={secrets?.SLACK_BOT_TOKEN}
          value={botToken}
          onChange={setBotToken}
          placeholder="xoxb-..."
          where={t.botTokenWhere}
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
        {t.madeAlready((label) => (
          <a
            href={SLACK_APPS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {label}
          </a>
        ))}
      </p>
      <Note>{t.adminApproval}</Note>
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
  const t = useText(text)
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
            placeholder={hint?.set ? t.saved(hint.hint ?? '...') : placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono"
          />
          {checking ? (
            <Chip tone="neutral">
              <LoaderCircle className="animate-spin" />
              {t.checking}
            </Chip>
          ) : state?.ok ? (
            <Chip tone="ok" className="max-w-64">
              <span className="truncate" title={state.text}>
                {state.text}
              </span>
            </Chip>
          ) : state ? (
            <Chip tone="failed">{t.notValid}</Chip>
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
  const t = useText(text)
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
      part={t.ownApp}
      title={t.itsMeTitle}
      lead={t.itsMeLead}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            {t.back}
          </Button>
          <span className="flex-1" />
          {before && !claimed && (
            <Button onClick={() => onDone(before)}>
              {t.continueAs(before.name)}
            </Button>
          )}
        </>
      }
    >
      <ol className="flex flex-col gap-3">
        <li className="flex items-center gap-3">
          <StepNumber n={1} />
          <span className="w-52 shrink-0 text-section">{t.invite}</span>
          <CommandLine text="/invite @Pace" />
        </li>
        <li className="flex items-center gap-3">
          <StepNumber n={2} />
          <span className="w-52 shrink-0 text-section">{t.mentionThere}</span>
          <CommandLine text={t.itsMe} />
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
                {t.tryAgain}
              </Button>
            </div>
          ) : claimed ? (
            <WhoSent
              user={claimed}
              line={t.mentionedIn(claimed.name, claimed.channel)}
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
                    {t.notMe}
                  </Button>
                  <Button
                    disabled={confirming}
                    onClick={() => void confirm(claimed)}
                  >
                    {confirming && <LoaderCircle className="animate-spin" />}
                    {t.yesMe}
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
                    ? t.waitingOwnAccount
                    : t.waitingForMention
                  : t.connectingToSlack}
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
      {waited && <Hint>{t.itsMeHint}</Hint>}
      <p className="text-body text-muted-foreground">{t.whileOpen}</p>
    </StepFrame>
  )
}
