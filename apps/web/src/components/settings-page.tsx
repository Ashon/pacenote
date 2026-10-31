import {
  SETTING_FIELDS,
  settingFields,
  settingGroups,
  settingLabel,
  settingSectionOf,
  shownFor,
  type SettingField,
  type SettingGroup,
  type SettingGroupInfo,
  type SettingsChanges,
  type SettingsIssue,
} from '@src/settings/fields'
import {
  MESSENGER_IDS,
  MESSENGER_NAMES,
  type MessengerId,
} from '@src/messengers/ids'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import {
  CircleCheck,
  LoaderCircle,
  PlugZap,
  RotateCcw,
  Save,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Placeholder } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  botControl,
  useLoginItem,
  useSandbox,
  remoteMac,
  useSupervisor,
  useUpdate,
} from '@/lib/desktop'
import { useSettingsView } from '@/lib/setup'
import { useText } from '@/lib/i18n'
import { cn, go as goTo } from '@/lib/utils'
import { McpConnections } from './mcp-connections'
import { OwnAiStatus } from './own-ai-status'
import { isOwnCli } from '@src/tasks/own-ai'
import { RepoFolders } from './repo-folders'
import { SandboxSignIn } from './sandbox-sign-in'
import { SlackYou } from './slack-you'
import { SlackAppSetup } from './slack-app-setup'
import {
  EnvironmentDetails,
  LoginChecks,
  PendingList,
  VmFooter,
} from './sandbox-panel'
import { text } from './settings-page.text'
import { DevicesSection, MacsSection } from './settings-devices'
import { ToolsSection } from './tools-section'
import { connectionStates } from '@src/settings/tools'
import {
  AppsHere,
  CardHeader,
  CheckResult,
  Chip,
  type ChoiceExtras,
  FieldRow,
  GroupBody,
  GroupCard,
  HelpCard,
  type Hint,
  HubPairing,
  LanguagePicker,
  OnTheMacNote,
  PathControl,
  Row,
  SECTION_ICON,
  sectionInfo,
  SettingsNav,
  SectionSkeleton,
  SectionTitle,
  SubHeading,
  Switch,
  ThemePicker,
  UpdatesCard,
  type Section,
} from './settings-parts'

/** The groups' words in the app's language, by id */
const groupsById = () =>
  Object.fromEntries(settingGroups().map((info) => [info.id, info])) as Record<
    SettingGroup,
    SettingGroupInfo
  >
/** The fields as saved and checked (their words are English) */
const FIELD = new Map(SETTING_FIELDS.map((field) => [field.key, field]))
/** What your own Slack app needs before the bot can start */
const SLACK_APP_TOKENS = ['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN']

/**
 * #/settings/<section> picks the section; plain #/settings opens the first one,
 * General. ("Setup needed" links straight to the section to fix, such as
 * #/settings/messengers.) #/settings/slack is the Messengers section's name
 * from before.
 */
function readSection(): Section {
  const id = /^#\/settings\/([a-z]+)/.exec(window.location.hash)?.[1]
  if (id === 'slack') return 'messengers'
  // Settings > Tools, by the name it is shown under
  if (id === 'tools') return 'ops'
  return id && id in SECTION_ICON ? (id as Section) : 'general'
}

function useSection(): [Section, (section: Section) => void] {
  const [section, setSection] = useState(readSection)
  useEffect(() => {
    const onChange = () => setSection(readSection())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return [section, (next) => (window.location.hash = `#/settings/${next}`)]
}

/**
 * Settings screen that edits the settings file (~/.pacenote/settings.json).
 * Available only in the desktop app. draft holds the values changed in the UI.
 * An empty string means revert to default. Changes are kept across sections
 * and saved together from the bar at the bottom.
 */
export function SettingsPage() {
  const t = useText(text)
  const settings = window.pacenoteDesktop?.settings
  // On a device of yours: the Mac whose settings these are
  const remote = remoteMac()
  const supervisor = useSupervisor()
  const loginItem = useLoginItem()
  const update = useUpdate()
  const sandbox = useSandbox()
  const [section, go] = useSection()
  const { view, refresh: load } = useSettingsView()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Set<string>>(new Set())
  const [issues, setIssues] = useState<SettingsIssue[]>([])
  const [check, setCheck] = useState<SlackCheckItem[] | 'running'>()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{
    tone: 'ok' | 'warn'
    text: string
    restart?: boolean
  }>()

  const current = useCallback(
    (field: SettingField) =>
      field.type === 'secret' ? '' : (view?.values[field.key] ?? ''),
    [view]
  )

  // Sends only values that actually changed. Secrets are sent only when newly
  // entered.
  const changes = useMemo<SettingsChanges>(() => {
    const result: SettingsChanges = {}
    for (const field of SETTING_FIELDS) {
      if (!(field.key in draft)) continue
      const value = draft[field.key]!.trim()
      if (field.type === 'secret') {
        if (editing.has(field.key) && value) result[field.key] = value
        continue
      }
      if (value !== current(field))
        result[field.key] = value === '' ? null : value
    }
    return result
  }, [draft, editing, current])
  const changeCount = Object.keys(changes).length

  // A pacenote:// link from the hub's installer, or from the join page a
  // teammate's link opens: Messengers, with that hub filled in to connect to.
  // It saves nothing by itself.
  const fileHub =
    view?.values.SLACK_CONNECTION === 'hub' ? view.values.HUB_URL : undefined
  useEffect(() => {
    const hub = window.pacenoteDesktop?.hub
    if (!hub) return
    const take = () =>
      void hub.takeLink().then((url) => {
        if (!url || url === fileHub) return
        setDraft((d) => ({ ...d, SLACK_CONNECTION: 'hub', HUB_URL: url }))
        window.location.hash = '#/settings/messengers'
        setNotice({ tone: 'ok', text: t.openedFromLink(url) })
      })
    take()
    return hub.onLinked(take)
  }, [fileHub, t])

  useEffect(() => {
    if (!settings || changeCount === 0) {
      setIssues([])
      return
    }
    const timer = setTimeout(
      () => void settings.validate(changes).then(setIssues),
      300
    )
    return () => clearTimeout(timer)
  }, [settings, changes, changeCount])

  if (!settings) {
    return (
      <p className="p-10 text-center text-copy text-muted-foreground">
        {t.desktopOnly}
      </p>
    )
  }
  // Until the settings are read: the section list and the section's title as
  // they will be, and its cards' place
  if (!view)
    return (
      <div className="@container/settings flex h-full min-h-0">
        <SettingsNav section={section} go={go} />
        <div className="@container/content flex min-w-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="max-w-3xl space-y-8 px-8 py-7 @max-[36rem]/content:px-4">
              <SectionTitle section={section} />
              <Placeholder
                key="body"
                ready={false}
                skeleton={<SectionSkeleton />}
              />
              <div className="h-10" />
            </div>
          </ScrollArea>
        </div>
      </div>
    )

  /**
   * The value in effect once the draft is saved: the draft, else the file,
   * else the default. Secrets read "set" or "".
   */
  const valueOf = (key: string): string => {
    const field = FIELD.get(key)
    if (!field) return ''
    if (field.type === 'secret') {
      const entered = editing.has(key) && Boolean(draft[key]?.trim())
      return entered || view.secrets[key]?.set ? 'set' : ''
    }
    const value = key in draft ? draft[key]!.trim() : (view.values[key] ?? '')
    return value || field.default || ''
  }
  const isSet = (key: string) => valueOf(key) !== ''
  /** In the file now, as saved */
  const saved = (field: SettingField) =>
    field.type === 'secret'
      ? Boolean(view.secrets[field.key]?.set)
      : Boolean(view.values[field.key])
  const shown = (field: SettingField) =>
    !field.internal &&
    (!field.retiring || saved(field)) &&
    (!field.shownWhen ||
      shownFor(field.shownWhen, valueOf(field.shownWhen.key)))

  const set = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))
  /** Drops what was typed for these settings */
  const drop = (...keys: string[]) =>
    setDraft((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => !keys.includes(key))
      )
    )
  /** Opens a secret's input, or closes it and drops what was typed. */
  const edit = (key: string, on: boolean) => {
    setEditing((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
    if (!on) drop(key)
  }
  const reset = () => {
    setDraft({})
    setEditing(new Set())
    setIssues([])
  }
  const runCheck = () => {
    setCheck('running')
    void settings.checkSlack(changes).then(setCheck)
  }
  // A running bot is restarted to apply settings; a stopped one (or one waiting
  // for setup) is started.
  const botLive =
    supervisor?.phase === 'running' || supervisor?.phase === 'starting'
  // Changes Pace picks up only when it restarts (not those read where they
  // are used)
  const botChanged = SETTING_FIELDS.some(
    (field) => field.applies !== 'app' && field.key in changes
  )
  /**
   * Saves values, then reads the settings again; done says how it went.
   * Issues found instead stay beside their fields.
   */
  const store = (
    values: SettingsChanges,
    restart: boolean,
    done: (restarted: boolean) => void
  ) => {
    setSaving(true)
    void settings
      .save(values, restart)
      .then(({ issues: found, restarted }) => {
        if (found.length > 0) return setIssues(found)
        done(restarted)
        load()
        sandbox.refresh()
      })
      .finally(() => setSaving(false))
  }
  const save = (restart: boolean) =>
    store(changes, restart, (restarted) => {
      reset()
      setNotice(
        restarted || !botChanged
          ? {
              tone: 'ok',
              text: restarted
                ? botLive
                  ? t.savedRestarted
                  : t.savedStarted
                : t.saved,
            }
          : {
              tone: 'warn',
              text: t.savedRestart,
              restart: Boolean(supervisor),
            }
      )
    })
  // A secret's own Save: stores just that value and closes its input, leaving
  // the other unsaved changes as they are.
  const saveField = (field: SettingField) => {
    const value = draft[field.key]?.trim()
    if (!value) return
    store({ [field.key]: value }, false, () => {
      edit(field.key, false)
      const label = settingLabel(field.key)
      // Your own Slack app needs both tokens before the bot can start.
      const other = SLACK_APP_TOKENS.includes(field.key)
        ? SLACK_APP_TOKENS.find(
            (key) => key !== field.key && !view.secrets[key]?.set
          )
        : undefined
      // With both tokens in, your own app still answers no one until it
      // knows who you are.
      const askers =
        SLACK_APP_TOKENS.includes(field.key) && !isSet('MENTION_ALLOWED_USERS')
      setNotice(
        other
          ? { tone: 'ok', text: t.savedEnterNext(label, settingLabel(other)) }
          : askers
            ? {
                tone: 'ok',
                text: t.savedAddMemberId(label, groupsById().access.label),
              }
            : {
                tone: 'warn',
                text: t.savedStartToUse(label, botLive),
                restart: true,
              }
      )
    })
  }
  const issueOf = (key: string) =>
    issues.find((issue) => issue.key === key)?.message
  // Issues with no field on screen (general ones, or a field hidden by another
  // value) are spelled out in the save bar.
  const offscreenIssues = issues.filter((issue) => {
    const field = issue.key ? FIELD.get(issue.key) : undefined
    return !field || !shown(field)
  })
  const issueSection = issues
    .map((issue) => settingSectionOf(issue.key))
    .find(Boolean)
  // Whether this app can start or restart Pace now (not one running elsewhere)
  const canControl =
    supervisor &&
    supervisor.phase !== 'external' &&
    supervisor.phase !== 'building'
  // The save bar restarts Pace only for changes it picks up on a restart.
  const canRestart = botChanged && canControl

  // What each section shows in the navigation: an issue dot, its unsaved
  // changes, or a short state.
  const sectionChanges = (id: Section) =>
    Object.keys(changes).filter((key) => settingSectionOf(key) === id).length
  const sectionIssues = (id: Section) =>
    issues.filter((issue) => settingSectionOf(issue.key) === id).length
  const groups = groupsById()
  const builtIn = valueOf('REASONER_SANDBOX') === 'vm'
  const vmStatus = sandbox.status?.vm
  const opsOn = valueOf('OPS_TOOLS') === 'on'
  const pending = sandbox.status?.pending ?? []
  const hubMode = valueOf('SLACK_CONNECTION') === 'hub'
  // Pace answers only you; with your own app, once it knows who you are
  const onlyYou = hubMode || isSet('MENTION_ALLOWED_USERS')
  const opsReady = builtIn && onlyYou
  // Connections Pace reads, for the section's state in the navigation
  const connectionsInUse = connectionStates({ value: valueOf, isSet }).filter(
    (each) => each.reads
  ).length
  const slackReady = hubMode
    ? isSet('HUB_URL') && isSet('HUB_TOKEN')
    : isSet('SLACK_APP_TOKEN') && isSet('SLACK_BOT_TOKEN')
  /** How each messenger is connected, beside its heading */
  const messengerChips: Record<MessengerId, React.ReactNode> = {
    slack: slackReady ? (
      <Chip tone="ok">{hubMode ? t.teamHub : t.ownApp}</Chip>
    ) : (
      <Chip tone="warn">{hubMode ? t.notPaired : t.notConnected}</Chip>
    ),
  }
  const hints: Partial<Record<Section, Hint>> = {
    // Short enough to sit beside "Messengers"; the Slack heading says what is
    // missing.
    messengers: slackReady ? undefined : { tone: 'warn', text: t.hintSetUp },
    sandbox: builtIn
      ? vmStatus &&
        (vmStatus.unsupported ||
          !vmStatus.helper.ok ||
          !vmStatus.kernel ||
          !vmStatus.initfs ||
          !vmStatus.image)
        ? { tone: 'warn', text: t.hintSetUp }
        : (vmStatus?.outdated ?? []).length > 0
          ? { tone: 'warn', text: t.hintUpdate }
          : undefined
      : { tone: 'muted', text: t.hintOff },
    ops: !opsOn
      ? { tone: 'muted', text: t.hintOff }
      : !opsReady
        ? { tone: 'warn', text: t.hintNeedsSetup }
        : { tone: 'muted', text: t.hintOn(connectionsInUse) },
  }

  /**
   * What a choice field shows beside its options: the run environment's
   * readiness and setup under each sandbox, and what the chosen one has ready
   */
  const choiceExtras: Partial<Record<string, ChoiceExtras>> = {
    ...(sandbox.available && {
      REASONER_SANDBOX: {
        footers: { vm: <VmFooter sandbox={sandbox} /> },
        below: <EnvironmentDetails sandbox={sandbox} chosen={builtIn} />,
      },
    }),
    // Desktop app chosen: whether each app is on this Mac
    ...(valueOf('TASKS_OPEN_IN') === 'app' && {
      TASKS_OPEN_IN: { below: <AppsHere /> },
    }),
  }
  const row = (field: SettingField) => (
    <FieldRow
      key={field.key}
      field={field}
      extras={choiceExtras[field.key]}
      view={view}
      value={draft[field.key] ?? current(field)}
      changed={field.key in changes}
      editing={editing.has(field.key)}
      issue={issueOf(field.key)}
      onChange={(value) => set(field.key, value)}
      onEdit={(on) => edit(field.key, on)}
      onSave={() => saveField(field)}
      saving={saving}
    />
  )
  // Their words in the app's language; keys and values as saved
  const localizedFields = settingFields()
  /**
   * A group's card with only the fields the current values call for. Nothing
   * when none are left.
   */
  const card = (
    id: SettingGroup,
    extra: Omit<
      React.ComponentProps<typeof GroupCard>,
      'info' | 'fields' | 'row'
    > = {}
  ) => {
    const fields = localizedFields.filter(
      (field) => field.group === id && shown(field)
    )
    if (fields.length === 0 && !extra.children && !extra.after) return null
    return (
      <GroupCard
        key={id}
        info={groups[id]}
        fields={fields}
        row={row}
        {...extra}
      />
    )
  }
  /** The fields a group shows now */
  const fieldsOf = (id: SettingGroup) =>
    localizedFields.filter((field) => field.group === id && shown(field))

  /**
   * Each messenger's cards, shown under its heading in the Messengers section;
   * like the sections below, built only when shown
   */
  const messengerCards: Record<MessengerId, () => React.ReactNode> = {
    slack: () => (
      <>
        {card('slack', {
          action: !remote && (
            <Button
              size="sm"
              variant="outline"
              onClick={runCheck}
              disabled={check === 'running'}
            >
              {check === 'running' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PlugZap />
              )}
              {t.checkConnection}
            </Button>
          ),
          children:
            check && check !== 'running' ? <CheckResult items={check} /> : null,
          after: remote ? (
            <OnTheMacNote mac={remote} />
          ) : hubMode ? (
            <HubPairing
              hubUrl={valueOf('HUB_URL')}
              allow={valueOf('MENTION_ALLOWED_USERS')}
              onAddress={(url) => set('HUB_URL', url)}
              paired={
                view.values.SLACK_CONNECTION === 'hub' &&
                Boolean(view.secrets.HUB_TOKEN?.set)
              }
              onPaired={(text) => {
                // Pairing saved the connection itself; drop those drafts and
                // show what is saved now.
                drop('SLACK_CONNECTION', 'HUB_URL')
                setCheck(undefined)
                load()
                setNotice({ tone: 'ok', text })
              }}
              onDisconnected={() => {
                setCheck(undefined)
                load()
                setNotice({ tone: 'ok', text: t.hubDisconnected })
              }}
            />
          ) : !isSet('SLACK_APP_TOKEN') || !isSet('SLACK_BOT_TOKEN') ? (
            <SlackAppSetup />
          ) : undefined,
        })}
        {card('access')}
      </>
    ),
  }

  const content: Record<Section, () => React.ReactNode> = {
    messengers: () =>
      MESSENGER_IDS.map((id) => (
        <div key={id} className="space-y-3">
          <SubHeading title={MESSENGER_NAMES[id]} chip={messengerChips[id]} />
          {messengerCards[id]()}
        </div>
      )),
    answers: () =>
      (['reasoner', 'requests', 'diagrams'] as const).map((id) => card(id)),
    sandbox: () => (
      <>
        {card('environment', {
          // Settings Pace picks up on its restart, such as the limits here
          children: !remote && pending.length > 0 && (
            <PendingList pending={pending} sandbox={sandbox} />
          ),
        })}
        {builtIn &&
          card('credentials', {
            help: t.credentialsHelp(valueOf('REASONER')),
            after: remote ? (
              <OnTheMacNote mac={remote} />
            ) : (
              <>
                <LoginChecks sandbox={sandbox} />
                <SandboxSignIn
                  className="border-t border-border bg-well/60 px-4 py-3"
                  cli={valueOf('REASONER') === 'codex' ? 'codex' : 'claude'}
                  signedIn={Boolean(sandbox.status?.signedIn)}
                  ready={Boolean(
                    sandbox.status?.vm?.kernel && sandbox.status.vm.image
                  )}
                  onSignedIn={() => {
                    sandbox.refresh()
                    // A claude token set by hand is gone from the file now.
                    load()
                    setNotice({
                      tone: 'warn',
                      text: t.sandboxSignedIn,
                      restart: true,
                    })
                  }}
                />
              </>
            ),
          })}
      </>
    ),
    ops: () => (
      <ToolsSection
        valueOf={valueOf}
        isSet={isSet}
        changed={(key) => key in changes}
        hasIssue={(key) => Boolean(issueOf(key))}
        keysOf={(id) => fieldsOf(id).map((field) => field.key)}
        fields={(id) => <GroupBody fields={fieldsOf(id)} row={row} />}
        card={(id, chip) => card(id, { chip })}
        groups={groups}
        labelOf={settingLabel}
        sectionLabel={(id) => sectionInfo(id).label}
        go={go}
        sandbox={sandbox}
      />
    ),
    tasks: () => (
      <>
        {card('ownWork', {
          after: remote ? (
            <OnTheMacNote mac={remote} />
          ) : (
            <OwnAiStatus
              chosen={
                isOwnCli(view.values.TASKS_AI) ? view.values.TASKS_AI : 'claude'
              }
              fallback={view.values.TASKS_AI_FALLBACK !== 'off'}
            />
          ),
        })}
        {card('tasks', {
          after: valueOf('TASKS') === 'on' && !remote && (
            <>
              <SlackYou
                owners={
                  hubMode
                    ? []
                    : valueOf('MENTION_ALLOWED_USERS')
                        .split(',')
                        .map((id) => id.trim())
                        .filter(Boolean)
                }
              />
              <McpConnections about={t.mcpTasks} />
            </>
          ),
        })}
        {card('work', {
          after: valueOf('TASKS') === 'on' && !remote && <RepoFolders />,
        })}
      </>
    ),
    logs: () => (
      <>
        {card('history', {
          after: valueOf('HISTORY_SHARE') === 'on' && !remote && (
            <McpConnections about={t.mcpHistory} />
          ),
        })}
        {card('logs')}
      </>
    ),
    macs: () => (
      <>
        <MacsSection />
        <DevicesSection />
      </>
    ),
    general: () => (
      <>
        <section className="surface-group">
          <CardHeader title={t.app} help={t.appHelp} />
          <div className="divide-y divide-border">
            <Row label={t.theme} help={t.themeHelp}>
              <ThemePicker />
            </Row>
            <Row label={t.language} help={t.languageHelp}>
              <LanguagePicker />
            </Row>
            {loginItem.state && (
              <Row
                label={t.openAtLogin}
                help={
                  loginItem.state.available
                    ? t.openAtLoginHelp
                    : t.openAtLoginInstalled
                }
                warning={
                  loginItem.state.needsApproval
                    ? t.openAtLoginApproval
                    : undefined
                }
              >
                <div className="flex items-center gap-2">
                  {loginItem.state.needsApproval && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={loginItem.openSystemSettings}
                    >
                      {t.openLoginItems}
                    </Button>
                  )}
                  <Switch
                    checked={loginItem.state.on}
                    disabled={!loginItem.state.available}
                    onChange={loginItem.set}
                  />
                </div>
              </Row>
            )}
            {supervisor?.off ? (
              <Row label={t.paceOff} help={t.paceOffHelp}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void botControl()
                      ?.setUp()
                      .then(() => goTo('#/setup'))
                  }
                >
                  {t.setUpPace}
                </Button>
              </Row>
            ) : (
              supervisor && (
                <Row label={t.autoStart} help={t.autoStartHelp}>
                  <Switch
                    checked={supervisor.autoStart}
                    onChange={(value) => void botControl()?.setAutoStart(value)}
                  />
                </Row>
              )
            )}
          </div>
        </section>
        <UpdatesCard update={update} />
        <HelpCard />
        <section className="surface-group">
          <CardHeader title={t.files} help={t.filesHelp} />
          <div className="divide-y divide-border">
            <Row
              label={t.settingsFile}
              help={view.exists ? t.settingsFileHere : t.settingsFileMissing}
              issue={view.problem}
            >
              <PathControl
                path={view.file}
                label={t.showInFinder}
                onOpen={() => void settings.revealFile()}
              />
            </Row>
            <Row label={t.historyFolder} help={t.historyFolderHelp}>
              <PathControl
                path={view.dataDir}
                label={t.open}
                onOpen={() => void settings.openDataDir()}
              />
            </Row>
          </div>
        </section>
      </>
    ),
  }

  return (
    // A narrow screen keeps the section list as icons (@settings), and narrow
    // content stacks each row (@content).
    <div className="@container/settings flex h-full min-h-0">
      <SettingsNav
        section={section}
        go={go}
        changes={sectionChanges}
        issues={sectionIssues}
        hints={hints}
      />

      <div className="@container/content flex min-w-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className="max-w-3xl space-y-8 px-8 py-7 @max-[36rem]/content:px-4">
            <SectionTitle section={section} />

            {notice && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-copy',
                  notice.tone === 'ok'
                    ? 'bg-status-succeeded/10 text-status-succeeded'
                    : 'bg-status-interrupted/10 text-status-interrupted'
                )}
              >
                {notice.tone === 'ok' ? (
                  <CircleCheck className="size-4 shrink-0" />
                ) : (
                  <TriangleAlert className="size-4 shrink-0" />
                )}
                <span className="select-text">{notice.text}</span>
                {notice.restart && canControl && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => {
                      const control = botControl()
                      void (botLive ? control?.restart() : control?.start())
                      setNotice({
                        tone: 'ok',
                        text: botLive ? t.restarting : t.starting,
                      })
                    }}
                  >
                    {botLive ? t.restartNow : t.startPace}
                  </Button>
                )}
              </div>
            )}

            <Placeholder key="body" ready skeleton={<SectionSkeleton />}>
              <div className="space-y-8">{content[section]()}</div>
            </Placeholder>
            <div className="h-10" />
          </div>
        </ScrollArea>

        {changeCount > 0 && (
          <footer className="shrink-0 border-t bg-canvas/95 px-8 py-3 backdrop-blur @max-[36rem]/content:px-4">
            <div className="flex max-w-3xl flex-wrap items-center gap-2">
              <span className="text-row">{t.unsavedChanges(changeCount)}</span>
              {issues.length > 0 && (
                <button
                  type="button"
                  disabled={!issueSection || issueSection === section}
                  onClick={() => issueSection && go(issueSection)}
                  className="flex min-w-0 items-center gap-1 text-left text-meta text-status-failed enabled:hover:underline"
                >
                  <TriangleAlert className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {offscreenIssues[0]?.message ??
                      t.issuesToFix(issues.length)}
                    {issueSection && issueSection !== section
                      ? ` (${sectionInfo(issueSection).label})`
                      : ''}
                  </span>
                </button>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  disabled={saving}
                >
                  <RotateCcw />
                  {t.revert}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => save(false)}
                  disabled={saving || issues.length > 0}
                >
                  <Save />
                  {t.save}
                </Button>
                {canRestart && (
                  <Button
                    size="sm"
                    onClick={() => save(true)}
                    disabled={saving || issues.length > 0}
                  >
                    {saving ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    {botLive ? t.saveRestart : t.saveStart}
                  </Button>
                )}
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}
