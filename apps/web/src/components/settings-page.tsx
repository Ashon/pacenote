import {
  SETTING_FIELDS,
  SETTING_SECTIONS,
  settingFields,
  settingGroups,
  settingLabel,
  settingSectionOf,
  settingSections,
  shownFor,
  type SettingField,
  type SettingGroup,
  type SettingGroupInfo,
  type SettingSection,
  type SettingsChanges,
  type SettingsIssue,
  type SettingsView,
} from '@src/settings/fields'
import type { UpdateState } from '@runtime/types'
import {
  MESSENGER_IDS,
  MESSENGER_NAMES,
  type MessengerId,
} from '@src/messengers/ids'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import {
  Box,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  FolderOpen,
  History,
  Laptop,
  ListChecks,
  LoaderCircle,
  MessagesSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  Plug,
  PlugZap,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sun,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Placeholder } from '@/components/ui/motion'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import {
  botControl,
  useLoginItem,
  useSandbox,
  useSupervisor,
  useUpdate,
} from '@/lib/desktop'
import { formatRelative } from '@/lib/format'
import { useSettingsView } from '@/lib/setup'
import { useLanguage, useText, type LanguagePreference } from '@/lib/i18n'
import { useHubPairing } from '@/lib/hub'
import { codeWords, macsControl, useMacs } from '@/lib/macs'
import type { AddingView, MacView } from '@src/macs/types'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { isLocale, LOCALE_NAMES, LOCALES, localized } from '@src/i18n/locale'
import { CopyButton } from './code-block'
import { McpConnections } from './mcp-connections'
import { OwnAiStatus } from './own-ai-status'
import { isOwnCli } from '@src/tasks/own-ai'
import { RepoFolders } from './repo-folders'
import { SandboxSignIn } from './sandbox-sign-in'
import { SlackYou } from './slack-you'
import { PaceSpinner } from './pace-spinner'
import { SlackAppSetup } from './slack-app-setup'
import {
  AllowlistCard,
  BrokerCard,
  EnvironmentDetails,
  LoginChecks,
  PendingList,
  VmFooter,
} from './sandbox-panel'
import { text } from './settings-page.text'

/**
 * Settings sections: the bot's own (the settings file), then the desktop app's
 * preferences.
 */
type Section = SettingSection | 'general' | 'macs'

const SECTION_ICON: Record<Section, LucideIcon> = {
  messengers: MessagesSquare,
  answers: Sparkles,
  sandbox: Box,
  ops: Wrench,
  tasks: ListChecks,
  logs: History,
  general: SlidersHorizontal,
  macs: Laptop,
}

/** A section's name and help, in the app's language */
function sectionInfo(section: Section): { label: string; help: string } {
  return section === 'general' || section === 'macs'
    ? localized(text).sections[section]
    : settingSections().find((info) => info.id === section)!
}

/**
 * The app's own preferences first, then the bot's settings (as macOS lists
 * General first)
 */
const NAV: { group: 'app' | 'pace'; items: Section[] }[] = [
  { group: 'app', items: ['general', 'macs'] },
  { group: 'pace', items: SETTING_SECTIONS.map((info) => info.id) },
]

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

/** A short state shown beside a section in the navigation */
interface Hint {
  tone: 'warn' | 'muted'
  text: string
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
  const shown = (field: SettingField) =>
    !field.internal &&
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
        : undefined,
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
  /** An ops integration's card, with whether its fields turn it on */
  const integration = (id: SettingGroup) => {
    const requires = groups[id].requires ?? []
    const missing = requires.filter((key) => !isSet(key))
    const state =
      missing.length === 0
        ? 'on'
        : missing.length === requires.length
          ? 'off'
          : 'partial'
    return card(id, {
      chip: (
        <Chip
          tone={STATE_TONE[state]}
          title={
            state === 'partial'
              ? t.stillNeeded(missing.map(settingLabel))
              : undefined
          }
        >
          {t.state[state]}
        </Chip>
      ),
    })
  }

  /**
   * Each messenger's cards, shown under its heading in the Messengers section;
   * like the sections below, built only when shown
   */
  const messengerCards: Record<MessengerId, () => React.ReactNode> = {
    slack: () => (
      <>
        {card('slack', {
          action: (
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
          after: hubMode ? (
            <HubPairing
              hubUrl={valueOf('HUB_URL')}
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
          children: pending.length > 0 && (
            <PendingList pending={pending} sandbox={sandbox} />
          ),
        })}
        {builtIn &&
          card('credentials', {
            help: t.credentialsHelp(valueOf('REASONER')),
            after: (
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
        {builtIn && sandbox.available && <AllowlistCard sandbox={sandbox} />}
      </>
    ),
    ops: () => (
      <>
        {card('ops', {
          after: (
            <Requirements
              items={[
                {
                  ok: builtIn,
                  label: t.builtInSandbox,
                  detail: builtIn ? t.builtInOn : t.builtInOff,
                  section: 'sandbox',
                },
                {
                  ok: onlyYou,
                  label: t.onlyYou,
                  detail: onlyYou ? t.onlyYouOn : t.onlyYouOff,
                  section: 'messengers',
                },
              ]}
              onOpen={go}
            />
          ),
        })}
        {builtIn && sandbox.available && opsOn && (
          <BrokerCard sandbox={sandbox} />
        )}
        <SubHeading title={t.integrations} help={t.integrationsHelp(opsOn)} />
        {(['files', 'github', 'jira', 'k8s', 'ssh'] as const).map(integration)}
      </>
    ),
    tasks: () => (
      <>
        {card('ownWork', {
          after: (
            <OwnAiStatus
              chosen={
                isOwnCli(view.values.TASKS_AI) ? view.values.TASKS_AI : 'claude'
              }
              fallback={view.values.TASKS_AI_FALLBACK !== 'off'}
            />
          ),
        })}
        {card('tasks', {
          after: valueOf('TASKS') === 'on' && (
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
        {card('work', { after: valueOf('TASKS') === 'on' && <RepoFolders /> })}
      </>
    ),
    logs: () => (
      <>
        {card('history', {
          after: valueOf('HISTORY_SHARE') === 'on' && (
            <McpConnections about={t.mcpHistory} />
          ),
        })}
        {card('logs')}
      </>
    ),
    macs: () => <MacsSection />,
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
            {supervisor && (
              <Row label={t.autoStart} help={t.autoStartHelp}>
                <Switch
                  checked={supervisor.autoStart}
                  onChange={(value) => void botControl()?.setAutoStart(value)}
                />
              </Row>
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

/** The sections, with their changes, issues and states once they are known */
function SettingsNav({
  section,
  go,
  changes = () => 0,
  issues = () => 0,
  hints = {},
}: {
  section: Section
  go: (section: Section) => void
  changes?: (section: Section) => number
  issues?: (section: Section) => number
  hints?: Partial<Record<Section, Hint>>
}) {
  const t = useText(text)
  return (
    <nav
      aria-label={t.navLabel}
      className="flex w-56 shrink-0 flex-col gap-4 border-r border-sidebar-border px-2.5 py-5 @max-[44rem]/settings:w-14 @max-[44rem]/settings:px-2"
    >
      <h1 className="px-2.5 text-heading @max-[44rem]/settings:sr-only">
        {t.title}
      </h1>
      {NAV.map((group) => (
        <div key={group.group} className="space-y-0.5">
          <p className="px-2.5 pb-1 text-caption text-muted-foreground/80 @max-[44rem]/settings:sr-only">
            {t.nav[group.group]}
          </p>
          {group.items.map((id) => (
            <NavItem
              key={id}
              icon={SECTION_ICON[id]}
              label={sectionInfo(id).label}
              active={section === id}
              changes={changes(id)}
              issues={issues(id)}
              hint={hints[id]}
              onClick={() => go(id)}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}

function SectionTitle({ section }: { section: Section }) {
  const { label, help } = sectionInfo(section)
  return (
    <header>
      <h2 className="text-title">{label}</h2>
      <p className="mt-1 text-copy text-muted-foreground">{help}</p>
    </header>
  )
}

/**
 * A section's cards while the settings are read: a card's heading and its
 * rows (a name, a line of help, and the control's place), as tall as theirs
 */
function SectionSkeleton() {
  return (
    <div className="space-y-8">
      {[3, 2].map((rows, c) => (
        <section key={c} className="surface-group">
          <header className="border-b border-border px-4 py-3">
            <SkeletonText className="text-section" width={c ? '22%' : '30%'} />
            <SkeletonText className="mt-0.5 text-meta" width="58%" />
          </header>
          <div className="divide-y divide-border">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <SkeletonText className="text-row" width={`${38 - i * 6}%`} />
                  <SkeletonText className="mt-0.5 text-meta" width="62%" />
                </div>
                <div className="flex min-h-7 shrink-0 items-center">
                  <SkeletonBlock className="h-7 w-28 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function NavItem({
  icon: Icon,
  label,
  active,
  changes,
  issues,
  hint,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  changes: number
  issues: number
  hint?: Hint
  onClick: () => void
}) {
  const t = useText(text)
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-copy transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 @max-[44rem]/settings:justify-center @max-[44rem]/settings:px-0',
        active
          ? 'bg-selected font-medium text-foreground'
          : 'text-muted-foreground hover:bg-selected/50 hover:text-foreground'
      )}
    >
      <span className="relative shrink-0">
        <Icon className="size-4" strokeWidth={1.75} />
        {/* With the list as icons, a dot stands in for the issue, change
            count or state text. */}
        {(issues > 0 || changes > 0 || hint?.tone === 'warn') && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 hidden size-1.5 rounded-full @max-[44rem]/settings:block',
              issues > 0
                ? 'bg-status-failed'
                : changes > 0
                  ? 'bg-primary'
                  : 'bg-status-interrupted'
            )}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate @max-[44rem]/settings:sr-only">
        {label}
      </span>
      <span className="contents @max-[44rem]/settings:hidden">
        {issues > 0 ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-status-failed"
            title={t.issuesToFix(issues)}
          />
        ) : changes > 0 ? (
          <span
            className="shrink-0 rounded-full bg-primary/12 px-1.5 text-caption font-semibold text-primary tabular-nums"
            title={t.unsavedChanges(changes)}
          >
            {changes}
          </span>
        ) : hint ? (
          <span
            className={cn(
              'shrink-0 text-caption',
              hint.tone === 'warn'
                ? 'text-status-interrupted'
                : 'text-muted-foreground/70'
            )}
          >
            {hint.text}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/** A heading, its chip and a line of help: over cards, or in a card's header */
function SubHeading({
  title,
  help,
  chip,
  className = 'pt-3',
}: {
  title: string
  help?: React.ReactNode
  chip?: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <h3 className="flex items-center gap-2 text-section">
        {title}
        {chip}
      </h3>
      {help && <p className="mt-0.5 text-meta text-muted-foreground">{help}</p>}
    </div>
  )
}

function CardHeader({
  action,
  ...heading
}: Omit<React.ComponentProps<typeof SubHeading>, 'className'> & {
  action?: React.ReactNode
}) {
  return (
    <header className="flex items-start gap-3 border-b border-border px-4 py-3">
      <SubHeading {...heading} className="min-w-0 flex-1" />
      {action}
    </header>
  )
}

/**
 * One group of settings fields as a card: its basic fields, then the advanced
 * ones folded away.
 */
function GroupCard({
  info,
  fields,
  row,
  help,
  chip,
  action,
  children,
  after,
}: {
  info: SettingGroupInfo
  fields: SettingField[]
  row: (field: SettingField) => React.ReactNode
  /** Replaces the group's own help text */
  help?: string
  chip?: React.ReactNode
  action?: React.ReactNode
  /** Shown under the header, before the fields */
  children?: React.ReactNode
  /** Shown after the basic fields, before the advanced ones */
  after?: React.ReactNode
}) {
  const basic = fields.filter((field) => !field.advanced)
  const advanced = fields.filter((field) => field.advanced)
  return (
    <section className="surface-group">
      <CardHeader
        title={info.label}
        help={help ?? info.help}
        chip={chip}
        action={action}
      />
      {children}
      {basic.length > 0 && (
        <div className="divide-y divide-border">{basic.map(row)}</div>
      )}
      {after}
      {advanced.length > 0 && (
        <Advanced
          count={advanced.length}
          bordered={basic.length > 0 || Boolean(children)}
        >
          {advanced.map(row)}
        </Advanced>
      )}
    </section>
  )
}

const CHIP_TONE = {
  ok: 'bg-status-succeeded/12 text-status-succeeded',
  warn: 'bg-status-interrupted/12 text-status-interrupted',
  off: 'bg-muted text-muted-foreground',
}

function Chip({
  tone,
  title,
  children,
}: {
  tone: keyof typeof CHIP_TONE
  title?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'rounded-sm px-1.5 text-caption leading-4',
        CHIP_TONE[tone]
      )}
    >
      {children}
    </span>
  )
}

/** An integration's state, in the chip's tone */
const STATE_TONE = { on: 'ok', partial: 'warn', off: 'off' } as const

/**
 * Pairs this desktop with the team hub: get a code, send "@Pace connect
 * <code>" in Slack, then confirm the Slack member who sent it. Confirming is
 * what makes it count, so a code someone else saw and sent first is turned down
 * here.
 */
function HubPairing({
  hubUrl,
  paired,
  onPaired,
  onDisconnected,
}: {
  hubUrl: string
  paired: boolean
  onPaired: (notice: string) => void
  onDisconnected: () => void
}) {
  const t = useText(text)
  const hub = window.pacenoteDesktop?.hub
  const { state, setState, start, cancel, confirm } = useHubPairing({
    pollMs: 2_000,
    expired: t.codeExpired,
    onPaired: (res) => {
      setState({ step: 'idle' })
      onPaired(t.pairedWith(res.user.name, res.team.name, res.started))
    },
  })
  const [busy, setBusy] = useState(false)

  if (!hub) return null
  const disconnect = () => {
    setBusy(true)
    void hub
      .disconnect()
      .then((res) => {
        if ('error' in res) setState({ step: 'error', message: res.error })
        else onDisconnected()
      })
      .finally(() => setBusy(false))
  }

  const body = (() => {
    switch (state.step) {
      case 'idle':
        return paired ? (
          <div className="flex items-center gap-3">
            <CircleCheck className="size-4 shrink-0 text-status-succeeded" />
            <p className="min-w-0 flex-1 text-copy">{t.hubPaired}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={disconnect}
              disabled={busy}
            >
              {busy && <LoaderCircle className="animate-spin" />}
              {t.disconnect}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-row">{t.pairTitle}</p>
              <p className="mt-0.5 text-meta text-muted-foreground">
                {state.note ?? t.pairHelp}
              </p>
            </div>
            <Button size="sm" onClick={() => start(hubUrl)} disabled={!hubUrl}>
              <Plug />
              {t.connect}
            </Button>
          </div>
        )
      case 'starting':
        return (
          <p className="flex items-center gap-2 text-copy text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t.gettingCode}
          </p>
        )
      case 'waiting':
        return (
          <div className="space-y-2.5">
            <p className="text-copy">{t.mentionWithCode}</p>
            <div className="flex items-center gap-3">
              <code className="rounded-lg bg-card px-3 py-2 font-mono text-heading tracking-wide shadow-xs select-all">
                @Pace connect {state.code}
              </code>
              <Button size="sm" variant="ghost" onClick={() => cancel()}>
                {t.cancel}
              </Button>
            </div>
            {/* Pace itself is watching Slack for the mention. */}
            <p className="flex items-center gap-2 text-meta text-muted-foreground">
              <PaceSpinner className="size-6" />
              <span>
                {t.waitingCode((words) => (
                  <span className="text-shimmer">{words}</span>
                ))}
              </span>
            </p>
          </div>
        )
      case 'bound':
      case 'confirming':
        return (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-copy">
              {t.sentCode(
                <>
                  <b>{state.user.name}</b>{' '}
                  <span className="font-mono text-meta text-muted-foreground">
                    ({state.user.id})
                  </span>
                </>
              )}
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={state.step === 'confirming'}
              onClick={() => cancel(t.pairCancelled)}
            >
              {t.no}
            </Button>
            <Button
              size="sm"
              disabled={state.step === 'confirming'}
              onClick={() => confirm(state.user)}
            >
              {state.step === 'confirming' && (
                <LoaderCircle className="animate-spin" />
              )}
              {t.yesPair}
            </Button>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-3">
            <TriangleAlert className="size-4 shrink-0 text-status-failed" />
            <p className="min-w-0 flex-1 text-copy text-status-failed">
              {state.message}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setState({ step: 'idle' })}
            >
              {t.tryAgain}
            </Button>
          </div>
        )
    }
  })()
  return (
    <div className="border-t border-border bg-well/60 px-4 py-3">{body}</div>
  )
}

/** Conditions a feature needs, each with a way to the section that fixes it */
function Requirements({
  items,
  onOpen,
}: {
  items: { ok: boolean; label: string; detail: string; section: Section }[]
  onOpen: (section: Section) => void
}) {
  const t = useText(text)
  return (
    <ul className="space-y-1.5 border-t border-border bg-well/60 px-4 py-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-meta">
          {item.ok ? (
            <CircleCheck className="size-3.5 shrink-0 text-status-succeeded" />
          ) : (
            <CircleX className="size-3.5 shrink-0 text-status-interrupted" />
          )}
          <span className="w-28 shrink-0 font-medium">{item.label}</span>
          <span className="min-w-0 flex-1 text-muted-foreground select-text">
            {item.detail}
          </span>
          {!item.ok && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => onOpen(item.section)}
            >
              {t.openSection(sectionInfo(item.section).label)}
              <ChevronRight />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function PathControl({
  path,
  label,
  onOpen,
}: {
  path: string
  label: string
  onOpen: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* A long path is cut short here; hover shows it whole. */}
      <span
        title={path}
        className="max-w-64 truncate font-mono text-meta text-muted-foreground select-text"
      >
        {path}
      </span>
      <Button variant="ghost" size="xs" onClick={onOpen}>
        <FolderOpen />
        {label}
      </Button>
    </div>
  )
}

/** What a choice shows besides its options (see choiceExtras) */
interface ChoiceExtras {
  /** Under an option, by its value */
  footers?: Partial<Record<string, React.ReactNode>>
  /** Under the options */
  below?: React.ReactNode
}

/** What a field's control shows and edits */
interface ControlProps {
  field: SettingField
  view: SettingsView
  value: string
  editing: boolean
  onChange: (value: string) => void
  onEdit: (on: boolean) => void
  /** Saves just this secret (Enter); Escape cancels */
  onSave: () => void
  saving: boolean
}

function FieldRow({
  extras,
  changed,
  issue,
  ...control
}: ControlProps & { extras?: ChoiceExtras; changed: boolean; issue?: string }) {
  const t = useText(text)
  const { field, value, onChange } = control
  const overridden = control.view.overridden.includes(field.key)
  const label = (
    <span className="flex items-center gap-1.5">
      {field.label}
      {changed && (
        <span
          className="size-1.5 rounded-full bg-primary"
          aria-label={t.changed}
        />
      )}
    </span>
  )
  const warning = overridden ? t.overridden : undefined
  // Options that explain themselves are laid out as cards; the card's title
  // names the choice.
  if (field.type === 'select' && field.options?.some((option) => option.help)) {
    return (
      <div data-setting={field.key} className="px-4 py-3">
        <Choice
          field={field}
          value={value}
          onChange={onChange}
          footers={extras?.footers}
        />
        <RowNotes warning={warning} issue={issue} />
        {extras?.below}
      </div>
    )
  }
  return (
    <Row
      label={label}
      setting={field.key}
      help={field.help}
      issue={issue}
      warning={warning}
      below={extras?.below}
    >
      <Control {...control} />
    </Row>
  )
}

function Choice({
  field,
  value,
  onChange,
  footers,
}: {
  field: SettingField
  value: string
  onChange: (value: string) => void
  /** Under an option, outside its radio: a state and the action it needs */
  footers?: Partial<Record<string, React.ReactNode>>
}) {
  const selected = value || field.default || ''
  return (
    <div
      role="radiogroup"
      aria-label={field.label}
      className={cn(
        'grid gap-2',
        (field.options?.length ?? 0) > 2
          ? 'grid-cols-3 @max-[52rem]/content:grid-cols-1'
          : 'grid-cols-2 @max-[36rem]/content:grid-cols-1'
      )}
    >
      {field.options?.map((option) => {
        const checked = option.value === selected
        const footer = footers?.[option.value]
        return (
          <div
            key={option.value}
            data-choice={option.value}
            className={cn(
              'flex flex-col rounded-xl border transition-colors',
              checked
                ? 'border-primary/50 bg-primary/6'
                : 'border-border hover:border-primary/30'
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(option.value)}
              className="flex flex-1 flex-col justify-start rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <span className="flex items-center gap-2 text-row">
                <span
                  className={cn(
                    'grid size-3.5 shrink-0 place-items-center rounded-full border',
                    checked ? 'border-primary' : 'border-muted-foreground/40'
                  )}
                >
                  {checked && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                </span>
                {option.label}
              </span>
              {option.help && (
                <span className="mt-1 block text-meta text-muted-foreground">
                  {option.help}
                </span>
              )}
            </button>
            {footer && (
              <div
                className={cn(
                  'flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1.5 border-t px-3 py-2 text-meta',
                  checked ? 'border-primary/20' : 'border-border'
                )}
              >
                {footer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Control({
  field,
  view,
  value,
  editing,
  onChange,
  onEdit,
  onSave,
  saving,
}: ControlProps) {
  const t = useText(text)
  switch (field.type) {
    case 'secret': {
      const secret = view.secrets[field.key]
      if (!editing) {
        return (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-meta',
                // The key's last characters are code; "Not set" is words.
                secret?.set
                  ? 'font-mono text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {secret?.set ? secret.hint : t.notSet}
            </span>
            <Button size="xs" variant="outline" onClick={() => onEdit(true)}>
              {secret?.set ? t.change : t.enter}
            </Button>
          </div>
        )
      }
      return (
        <div className="flex w-80 max-w-full items-center gap-1.5">
          <Input
            type="password"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim() && !saving) {
                e.preventDefault()
                onSave()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onEdit(false)
              }
            }}
            className="h-7 font-mono text-meta"
          />
          <Button size="xs" onClick={onSave} disabled={!value.trim() || saving}>
            {t.save}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onEdit(false)}>
            {t.cancel}
          </Button>
        </div>
      )
    }
    case 'toggle':
      return (
        <Switch
          checked={(value || field.default) === 'on'}
          onChange={(on) => onChange(on ? 'on' : 'off')}
        />
      )
    case 'select':
      if (field.segmented)
        return (
          <Segmented
            label={field.label}
            value={value || field.default || ''}
            options={field.options ?? []}
            onChange={onChange}
          />
        )
      return (
        <select
          value={value || field.default || ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-meta outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/30"
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    default:
      return (
        <Input
          value={value}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          placeholder={
            field.placeholder ??
            (field.default ? t.defaultValue(field.default) : t.notSet)
          }
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-7 text-meta',
            field.type === 'number'
              ? 'w-32 text-right tabular-nums'
              : 'w-72 max-w-full'
          )}
        />
      )
  }
}

function Row({
  label,
  setting,
  help,
  issue,
  warning,
  below,
  children,
}: {
  label: React.ReactNode
  /** The setting the row edits, for finding it (never shown) */
  setting?: string
  help?: string
  issue?: string
  warning?: string
  /** Under its help: a state the setting depends on */
  below?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      data-setting={setting}
      className="flex items-start gap-4 px-4 py-3 @max-[36rem]/content:flex-col @max-[36rem]/content:gap-2"
    >
      <div className="min-w-0 flex-1 @max-[36rem]/content:w-full">
        <div className="text-row">{label}</div>
        {help && (
          <p className="mt-0.5 text-meta text-muted-foreground">{help}</p>
        )}
        <RowNotes warning={warning} issue={issue} />
        {below}
      </div>
      <div className="flex min-h-7 max-w-full shrink-0 items-center">
        {children}
      </div>
    </div>
  )
}

/**
 * Under Open sessions in, with Desktop app chosen: whether each app is on this
 * Mac, and what opens when it is not
 */
function AppsHere() {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.tasks
  const [apps, setApps] = useState<Record<'claude' | 'codex', boolean> | null>()
  useEffect(() => {
    void bridge?.apps().then(setApps)
  }, [bridge])
  if (!apps) return null
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5 text-meta">
      {(['claude', 'codex'] as const).map((tool) => (
        <li key={tool} data-app={tool} className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              apps[tool] ? 'bg-status-succeeded' : 'bg-muted-foreground/40'
            )}
          />
          <span>
            {t.apps[tool]}
            <span className="text-muted-foreground">
              {apps[tool] ? t.appHere : t.appMissing}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function RowNotes({ warning, issue }: { warning?: string; issue?: string }) {
  return (
    <>
      {warning && (
        <p className="mt-1 flex items-center gap-1 text-meta text-status-interrupted">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="select-text">{warning}</span>
        </p>
      )}
      {issue && (
        <p className="mt-1 text-meta text-status-failed select-text">{issue}</p>
      )}
    </>
  )
}

const THEMES: { mode: ThemeMode; icon: LucideIcon }[] = [
  { mode: 'system', icon: Monitor },
  { mode: 'light', icon: Sun },
  { mode: 'dark', icon: Moon },
]

/**
 * System / Light / Dark, as a segmented control like the run list's status
 * filter.
 */
function ThemePicker() {
  const t = useText(text)
  const { mode, setMode } = useTheme()
  return (
    <Segmented
      label={t.theme}
      value={mode}
      options={THEMES.map(({ mode: value, icon }) => ({
        value,
        label: t.themes[value],
        icon,
      }))}
      onChange={(value) => setMode(value as ThemeMode)}
    />
  )
}

/**
 * System / English / 한국어: each language by its own name, in either
 * language. System follows macOS.
 */
function LanguagePicker() {
  const t = useText(text)
  const { preference, setPreference } = useLanguage()
  return (
    <Segmented
      label={t.language}
      value={preference}
      options={[
        { value: 'system', label: t.languageSystem },
        ...LOCALES.map((locale) => ({
          value: locale,
          label: LOCALE_NAMES[locale],
          lang: locale,
        })),
      ]}
      onChange={(value) => {
        const next: LanguagePreference = isLocale(value) ? value : 'system'
        void setPreference(next)
      }}
    />
  )
}

/**
 * A few short options side by side: the theme, the language, and the settings
 * that pick one of two or three (where work runs, which terminal)
 */
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  /**
   * lang: an option written in a language of its own (a language's name);
   * icon: one shown before its label
   */
  options: { value: string; label: string; lang?: string; icon?: LucideIcon }[]
  onChange: (value: string) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-lg bg-muted p-0.5"
    >
      {options.map(({ icon: Icon, ...option }) => (
        <button
          key={option.value}
          type="button"
          lang={option.lang}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-md px-2.5 text-meta font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            value === option.value
              ? 'bg-card text-foreground shadow-xs dark:bg-selected'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Settings > Macs: Pace answers on the Mac you're using. Pacenote on your
 * other Macs with the same Slack app joins in on this network by itself
 * (src/macs), and you can add one on another network by its address.
 */
function MacsSection() {
  const t = useText(text)
  const view = useMacs()
  const control = macsControl()
  const [adding, setAdding] = useState(false)
  const [address, setAddress] = useState('')
  const [addIssue, setAddIssue] = useState<string>()
  if (!view) return <SectionSkeleton />
  const header = <CardHeader title={t.yourMacs} help={t.yourMacsHelp} />
  if (!view.available)
    return (
      <section className="surface-group" data-macs="unavailable">
        {header}
        <p className="px-4 py-3 text-meta text-muted-foreground">
          {t.macsUnavailable}
        </p>
      </section>
    )
  const others = view.macs.filter((mac) => !mac.here)
  const add = () =>
    void control?.addAddress(address).then((ok) => {
      if (!ok) return setAddIssue(t.addressIssue)
      setAddress('')
      setAddIssue(undefined)
      setAdding(false)
    })
  return (
    <section className="surface-group" data-macs={view.follow ? 'on' : 'off'}>
      {header}
      <div className="divide-y divide-border">
        <Row label={t.follow} help={view.follow ? t.followOn : t.followOff}>
          <Switch
            checked={view.follow}
            onChange={(on) => void control?.follow(on)}
          />
        </Row>
        {view.adding ? (
          <AddingPanel adding={view.adding} />
        ) : (
          <Row label={t.addMac} help={t.addMacHelp}>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void control?.addStart()}
            >
              <Laptop />
              {t.addMac}
            </Button>
          </Row>
        )}
        {view.follow && (
          <>
            {view.macs.map((mac) => (
              <MacRow key={mac.id} mac={mac} />
            ))}
            {view.blocked ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <TriangleAlert className="size-4 shrink-0 text-status-interrupted" />
                <p className="min-w-0 flex-1 text-meta text-muted-foreground">
                  {t.networkBlocked}
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void control?.openPrivacy()}
                >
                  {t.openSystemSettings}
                </Button>
              </div>
            ) : (
              others.length === 0 && (
                <p
                  className="flex items-center gap-2 px-4 py-3 text-meta text-muted-foreground"
                  data-macs-looking
                >
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                  {t.lookingForMac}
                </p>
              )
            )}
            <div className="space-y-2 px-4 py-3">
              {view.addresses.map((entry) => (
                <div
                  key={entry}
                  className="flex items-center gap-2 text-meta text-muted-foreground"
                >
                  <span className="min-w-0 flex-1 truncate font-mono select-text">
                    {entry}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t.removeAddress(entry)}
                    onClick={() => void control?.removeAddress(entry)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              {adding ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    add()
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={t.addressLabel}
                    placeholder={t.addressPlaceholder}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="h-8 flex-1"
                  />
                  <Button size="sm" type="submit" disabled={!address.trim()}>
                    {t.add}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setAdding(false)
                      setAddIssue(undefined)
                    }}
                  >
                    {t.cancel}
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="text-meta text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setAdding(true)}
                >
                  {t.addByAddress}
                </button>
              )}
              {addIssue && (
                <p className="text-meta text-status-failed">{addIssue}</p>
              )}
              {adding && (
                <p className="text-meta text-muted-foreground">
                  {t.addressHelp}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/**
 * Add a Mac, while it waits for the new Mac, when the new Mac asks (compare
 * the number, then Allow), and how it ended
 */
function AddingPanel({ adding }: { adding: AddingView }) {
  const t = useText(text)
  const control = macsControl()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (adding.result || adding.request) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [adding.result, adding.request])
  if (adding.result) {
    const { kind, name } = adding.result
    return (
      <div className="flex items-center gap-3 px-4 py-3" data-adding={kind}>
        {kind === 'sent' ? (
          <CircleCheck className="size-4 shrink-0 text-status-succeeded" />
        ) : (
          <CircleX className="size-4 shrink-0 text-muted-foreground" />
        )}
        <p className="min-w-0 flex-1 text-body">
          {kind === 'sent'
            ? t.macSetUp(name)
            : kind === 'declined'
              ? t.addDeclined
              : t.addExpired}
        </p>
        {kind === 'expired' && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => void control?.addStart()}
          >
            {t.tryAgain}
          </Button>
        )}
        <Button size="xs" onClick={() => void control?.addClose()}>
          {kind === 'sent' ? t.done : t.close}
        </Button>
      </div>
    )
  }
  if (adding.request) {
    const { name, code } = adding.request
    return (
      <div className="flex flex-col gap-3 px-4 py-4" data-adding="request">
        <b className="text-section">{t.wantsSetUp(name)}</b>
        <p
          className="text-number tracking-[0.2em] tabular-nums select-text"
          data-code
        >
          {codeWords(code)}
        </p>
        <p className="text-body text-muted-foreground">{t.sameNumber}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void control?.addAllow()}>
            {t.allow}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void control?.addDecline()}
          >
            {t.notThisOne}
          </Button>
        </div>
        <p className="text-meta text-muted-foreground">{t.whatIsSent}</p>
      </div>
    )
  }
  const left = Math.max(0, Date.parse(adding.until) - now)
  const clock = `${Math.floor(left / 60_000)}:${String(
    Math.floor(left / 1_000) % 60
  ).padStart(2, '0')}`
  return (
    <div className="flex flex-col gap-2 px-4 py-4" data-adding="waiting">
      <div className="flex items-center gap-3">
        <b className="min-w-0 flex-1 text-section">{t.addMac}</b>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void control?.addStop()}
        >
          {t.stop}
        </Button>
      </div>
      <p className="text-body text-pretty">
        {t.openOnNewMac((words) => (
          <span className="font-semibold whitespace-nowrap">{words}</span>
        ))}
      </p>
      <p className="flex items-center gap-2 text-meta text-muted-foreground">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
        {t.waitingOnNetwork(clock)}
      </p>
      <p className="text-meta text-muted-foreground">{t.shownWhileWaiting}</p>
    </div>
  )
}

const MAC_DOT: Record<MacView['status'], string> = {
  answering: 'bg-status-succeeded',
  moving: 'bg-status-running',
  'standing-by': 'bg-muted-foreground/50',
  'out-of-reach': 'bg-border',
}

/** What a Mac is doing, in a few words */
function macWords(mac: MacView): string {
  const t = localized(text)
  if (mac.notReady) return t.paceNotRunning
  switch (mac.status) {
    case 'answering':
      return mac.here ? t.answeringHere : t.answering
    case 'moving':
      return t.moving
    case 'standing-by':
      return mac.asleep ? t.asleep : t.standingBy
    case 'out-of-reach':
      return mac.lastSeen
        ? t.outOfReachSeen(formatRelative(mac.lastSeen))
        : t.outOfReach
  }
}

function MacRow({ mac }: { mac: MacView }) {
  const t = useText(text)
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      data-mac={mac.here ? 'here' : mac.name}
      data-status={mac.status}
    >
      <Laptop className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-row">
          <span className="truncate">{mac.name}</span>
          {mac.here && (
            <span className="shrink-0 text-caption text-muted-foreground">
              {t.thisMac}
            </span>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              MAC_DOT[mac.status]
            )}
          />
          <span className="truncate">
            {macWords(mac)}
            {mac.reasoner ? ` · ${mac.reasoner}` : ''}
          </span>
        </p>
      </div>
      {mac.here && mac.status === 'standing-by' && !mac.notReady && (
        <Button
          size="xs"
          variant="outline"
          onClick={() => void macsControl()?.answerHere()}
        >
          {t.answerHere}
        </Button>
      )}
      {!mac.here && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t.moreFor(mac.name)}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => void macsControl()?.ignore(mac.id)}
            >
              {t.stopFollowing}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/**
 * Help: diagnostics to paste into a bug report. The secrets are taken out in
 * the app; the logs can still name channels and people, so it says to read it
 * first.
 */
function HelpCard() {
  const t = useText(text)
  const diagnostics = window.pacenoteDesktop?.diagnostics
  const [copied, setCopied] = useState<'yes' | 'failed'>()
  if (!diagnostics) return null
  const copy = () =>
    void diagnostics()
      .then((text) => navigator.clipboard.writeText(text ?? ''))
      .then(
        () => setCopied('yes'),
        () => setCopied('failed')
      )
  return (
    <section className="surface-group">
      <CardHeader title={t.help} />
      <div className="divide-y divide-border">
        <Row
          label={t.diagnostics}
          help={t.diagnosticsHelp}
          warning={copied === 'failed' ? t.copyFailed : undefined}
        >
          <Button size="xs" variant="outline" onClick={copy}>
            {copied === 'yes' ? <Check /> : <Copy />}
            {copied === 'yes' ? t.copied : t.copyDiagnostics}
          </Button>
        </Row>
      </div>
    </section>
  )
}

/** How to update with Homebrew, which installs Pacenote */
const BREW_UPGRADE = 'brew upgrade --cask pacenote'

/**
 * Updates: whether a newer Pacenote is out, and how to get it. The app only
 * tells; Homebrew installs it, quitting the app first and reopening it.
 */
function UpdatesCard({ update }: { update: UpdateState | undefined }) {
  const t = useText(text)
  const { version } = __PACENOTE_BUILD__
  const latest = update?.latest
  return (
    <section className="surface-group">
      <CardHeader title={t.updates} help={t.updatesHelp} />
      <div className="divide-y divide-border">
        <Row
          label={
            update?.available && latest
              ? t.newVersion(latest.version)
              : `Pacenote ${version}`
          }
          help={
            !update
              ? t.installedOnly
              : update.available
                ? t.howToUpdate(update.current)
                : update.checkedAt
                  ? t.upToDate(formatRelative(update.checkedAt))
                  : t.notChecked
          }
        >
          {update?.available && latest ? (
            <div className="flex items-center gap-1">
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-meta select-text">
                {BREW_UPGRADE}
              </code>
              <CopyButton text={BREW_UPGRADE} />
              {latest.url && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => window.open(latest.url, '_blank')}
                >
                  {t.releaseNotes}
                </Button>
              )}
            </div>
          ) : null}
        </Row>
      </div>
    </section>
  )
}

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  )
}

function Advanced({
  count,
  bordered,
  children,
}: {
  count: number
  /** Separates the toggle from rows above it */
  bordered: boolean
  children: React.ReactNode
}) {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(bordered && 'border-t border-border')}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-1 px-4 py-2 text-left text-meta text-muted-foreground hover:text-foreground">
        <ChevronRight
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        {t.advanced(count)}
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border border-t border-border">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function CheckResult({ items }: { items: SlackCheckItem[] }) {
  return (
    <ul className="space-y-1 border-b border-border bg-well/60 px-4 py-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2 text-meta">
          {item.ok ? (
            <CircleCheck className="mt-px size-3.5 shrink-0 text-status-succeeded" />
          ) : (
            <CircleX className="mt-px size-3.5 shrink-0 text-status-failed" />
          )}
          <span className="w-20 shrink-0 font-medium">{item.label}</span>
          <span className="text-muted-foreground select-text">
            {item.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}
