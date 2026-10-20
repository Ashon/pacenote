import {
  SETTING_FIELDS,
  SETTING_GROUPS,
  SETTING_SECTIONS,
  settingSectionOf,
  shownFor,
  type SettingField,
  type SettingGroup,
  type SettingGroupInfo,
  type SettingSection,
  type SettingsChanges,
  type SettingsIssue,
  type SettingsView,
} from '@src/settings/fields'
import type { HubUser } from '@src/hub/protocol'
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
  ListChecks,
  LoaderCircle,
  MessagesSquare,
  Monitor,
  Moon,
  Plug,
  PlugZap,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sun,
  TriangleAlert,
  Wrench,
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
import { useTheme, type ThemeMode } from '@/lib/theme'
import { cn } from '@/lib/utils'
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

const bridge = () => window.pacenoteDesktop?.settings

/**
 * Settings sections: the bot's own (the settings file), then the desktop app's
 * preferences.
 */
type Section = SettingSection | 'general'

const SECTION_ICON: Record<SettingSection, LucideIcon> = {
  messengers: MessagesSquare,
  answers: Sparkles,
  sandbox: Box,
  ops: Wrench,
  tasks: ListChecks,
  logs: History,
}

const SECTION_INFO: Record<
  Section,
  { label: string; help: string; icon: LucideIcon }
> = {
  ...(Object.fromEntries(
    SETTING_SECTIONS.map((info) => [
      info.id,
      { label: info.label, help: info.help, icon: SECTION_ICON[info.id] },
    ])
  ) as Record<
    SettingSection,
    { label: string; help: string; icon: LucideIcon }
  >),
  general: {
    label: 'General',
    help: 'Preferences for this app, and where Pacenote keeps its settings and run history.',
    icon: SlidersHorizontal,
  },
}

/**
 * The app's own preferences first, then the bot's settings (as macOS lists
 * General first)
 */
const NAV: { label: string; items: Section[] }[] = [
  { label: 'App', items: ['general'] },
  { label: 'Pace', items: SETTING_SECTIONS.map((info) => info.id) },
]

const GROUP = Object.fromEntries(
  SETTING_GROUPS.map((info) => [info.id, info])
) as Record<SettingGroup, SettingGroupInfo>
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
  return id && id in SECTION_INFO ? (id as Section) : 'general'
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
  const settings = bridge()
  const supervisor = useSupervisor()
  const loginItem = useLoginItem()
  const update = useUpdate()
  const sandbox = useSandbox()
  const [section, go] = useSection()
  const [view, setView] = useState<SettingsView>()
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

  const load = useCallback(() => {
    void settings?.get().then((value) => value && setView(value))
  }, [settings])
  useEffect(load, [load])

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
        Settings can be changed in the desktop app.
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
  /** Opens a secret's input, or closes it and drops what was typed. */
  const edit = (key: string, on: boolean) => {
    setEditing((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
    if (!on) {
      setDraft((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
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
  const save = (restart: boolean) => {
    setSaving(true)
    void settings
      .save(changes, restart)
      .then(({ issues: found, restarted }) => {
        if (found.length > 0) {
          setIssues(found)
          return
        }
        reset()
        load()
        sandbox.refresh()
        setNotice(
          restarted || !botChanged
            ? {
                tone: 'ok',
                text: restarted
                  ? botLive
                    ? 'Saved and restarted Pace.'
                    : 'Saved and started Pace.'
                  : 'Saved.',
              }
            : {
                tone: 'warn',
                text: 'Saved. Restart Pace to apply.',
                restart: Boolean(supervisor),
              }
        )
      })
      .finally(() => setSaving(false))
  }
  // A secret's own Save: stores just that value and closes its input, leaving
  // the other unsaved changes as they are.
  const saveField = (field: SettingField) => {
    const value = draft[field.key]?.trim()
    if (!value) return
    setSaving(true)
    void settings
      .save({ [field.key]: value }, false)
      .then(({ issues: found }) => {
        if (found.length > 0) {
          setIssues(found)
          return
        }
        edit(field.key, false)
        load()
        sandbox.refresh()
        const label = field.label.charAt(0).toLowerCase() + field.label.slice(1)
        // Your own Slack app needs both tokens before the bot can start.
        const other = SLACK_APP_TOKENS.includes(field.key)
          ? SLACK_APP_TOKENS.find(
              (key) => key !== field.key && !view.secrets[key]?.set
            )
          : undefined
        // With both tokens in, your own app still answers no one until it
        // knows who you are.
        const askers =
          SLACK_APP_TOKENS.includes(field.key) &&
          !isSet('MENTION_ALLOWED_USERS')
        setNotice(
          other
            ? {
                tone: 'ok',
                text: `Saved the ${label}. Enter the ${FIELD.get(other)?.label.toLowerCase()} next.`,
              }
            : askers
              ? {
                  tone: 'ok',
                  text: `Saved the ${label}. Next, add your Slack member ID under Who can ask.`,
                }
              : {
                  tone: 'warn',
                  text: `Saved the ${label}. ${botLive ? 'Restart' : 'Start'} Pace to use it.`,
                  restart: true,
                }
        )
      })
      .finally(() => setSaving(false))
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
  const builtIn = valueOf('REASONER_SANDBOX') === 'vm'
  const vmStatus = sandbox.status?.vm
  const opsOn = valueOf('OPS_TOOLS') === 'on'
  const pending = sandbox.status?.pending ?? []
  const hubMode = valueOf('SLACK_CONNECTION') === 'hub'
  // Pace answers only you; with your own app, once it knows who you are
  const opsReady = builtIn && (hubMode || isSet('MENTION_ALLOWED_USERS'))
  const slackReady = hubMode
    ? isSet('HUB_URL') && isSet('HUB_TOKEN')
    : isSet('SLACK_APP_TOKEN') && isSet('SLACK_BOT_TOKEN')
  /** How each messenger is connected, beside its heading */
  const messengerChips: Record<MessengerId, React.ReactNode> = {
    slack: slackReady ? (
      <Chip tone="ok">{hubMode ? 'Team hub' : 'Your own app'}</Chip>
    ) : (
      <Chip tone="warn">{hubMode ? 'Not paired' : 'Not connected'}</Chip>
    ),
  }
  const hints: Partial<Record<Section, Hint>> = {
    // Short enough to sit beside "Messengers"; the Slack heading says what is
    // missing.
    messengers: slackReady ? undefined : { tone: 'warn', text: 'Set up' },
    sandbox: builtIn
      ? vmStatus &&
        (vmStatus.unsupported ||
          !vmStatus.helper.ok ||
          !vmStatus.kernel ||
          !vmStatus.initfs ||
          !vmStatus.image)
        ? { tone: 'warn', text: 'Set up' }
        : (vmStatus?.outdated ?? []).length > 0
          ? { tone: 'warn', text: 'Update' }
          : undefined
      : { tone: 'muted', text: 'Off' },
    ops: !opsOn
      ? { tone: 'muted', text: 'Off' }
      : !opsReady
        ? { tone: 'warn', text: 'Needs setup' }
        : undefined,
  }

  /**
   * What a choice field shows beside its options: the run environment's
   * readiness and setup under each sandbox, and what the chosen one has ready
   */
  const choiceExtras: Partial<Record<string, ChoiceExtras>> = sandbox.available
    ? {
        REASONER_SANDBOX: {
          footers: { vm: <VmFooter sandbox={sandbox} /> },
          below: <EnvironmentDetails sandbox={sandbox} chosen={builtIn} />,
        },
      }
    : {}
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
    const fields = SETTING_FIELDS.filter(
      (field) => field.group === id && shown(field)
    )
    if (fields.length === 0 && !extra.children && !extra.after) return null
    return (
      <GroupCard
        key={id}
        info={GROUP[id]}
        fields={fields}
        row={row}
        {...extra}
      />
    )
  }
  /** An ops integration's card, with whether its fields turn it on */
  const integration = (id: SettingGroup) => {
    const requires = GROUP[id].requires ?? []
    const missing = requires.filter((key) => !isSet(key))
    const state =
      missing.length === 0
        ? 'on'
        : missing.length === requires.length
          ? 'off'
          : 'partial'
    return card(id, {
      chip: (
        <StateChip
          state={state}
          title={
            state === 'partial'
              ? `Still needed: ${missing.map((key) => FIELD.get(key)?.label ?? key).join(', ')}`
              : undefined
          }
        />
      ),
    })
  }

  /**
   * Each messenger's cards, shown under its heading in the Messengers section
   */
  const messengerCards: Record<MessengerId, React.ReactNode> = {
    slack: (
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
              Check connection
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
                setDraft((prev) => {
                  const next = { ...prev }
                  delete next.SLACK_CONNECTION
                  delete next.HUB_URL
                  return next
                })
                setCheck(undefined)
                load()
                setNotice({ tone: 'ok', text })
              }}
              onDisconnected={() => {
                setCheck(undefined)
                load()
                setNotice({
                  tone: 'ok',
                  text: 'Disconnected this desktop from the hub.',
                })
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

  const content: Record<Section, React.ReactNode> = {
    messengers: MESSENGER_IDS.map((id) => (
      <div key={id} className="space-y-3">
        <SubHeading title={MESSENGER_NAMES[id]} chip={messengerChips[id]} />
        {messengerCards[id]}
      </div>
    )),
    answers: (
      <>
        {card('reasoner')}
        {card('requests')}
        {card('diagrams')}
      </>
    ),
    sandbox: (
      <>
        {card('environment', {
          // Settings Pace picks up on its restart, such as the limits here
          children: pending.length > 0 && (
            <PendingList pending={pending} sandbox={sandbox} />
          ),
        })}
        {builtIn &&
          card('credentials', {
            help: credentialsHelp(valueOf('REASONER')),
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
                      text: 'Signed in inside the sandbox. Restart Pace to use it.',
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
    ops: (
      <>
        {card('ops', {
          after: (
            <Requirements
              items={[
                {
                  ok: builtIn,
                  label: 'The built-in sandbox',
                  detail: builtIn
                    ? 'Requests run in the built-in sandbox, and the broker in a VM of its own.'
                    : 'Choose the built-in sandbox as the run environment.',
                  action: builtIn
                    ? undefined
                    : { label: 'Open Sandbox', section: 'sandbox' },
                },
                {
                  ok: hubMode || isSet('MENTION_ALLOWED_USERS'),
                  label: 'Only you can ask',
                  detail:
                    hubMode || isSet('MENTION_ALLOWED_USERS')
                      ? 'Pace answers only you, so the tools act only for you.'
                      : 'Add your Slack member ID, since the tools use your credentials.',
                  action:
                    hubMode || isSet('MENTION_ALLOWED_USERS')
                      ? undefined
                      : { label: 'Open Messengers', section: 'messengers' },
                },
              ]}
              onOpen={go}
            />
          ),
        })}
        {builtIn && sandbox.available && opsOn && (
          <BrokerCard sandbox={sandbox} />
        )}
        <SubHeading
          title="Integrations"
          help={`Each one turns on once its fields are filled in. Changes apply when Pace restarts, as its broker's VM starts with it.${opsOn ? '' : ' Ops tools are off, so none are offered to the reasoner yet.'}`}
        />
        {integration('files')}
        {integration('github')}
        {integration('jira')}
        {integration('k8s')}
        {integration('ssh')}
      </>
    ),
    tasks: (
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
              <McpConnections about="To ask Claude Code or Codex about your tasks, or collect from inside them, add Pacenote to them. Collect now on the Todo screen works without this." />
            </>
          ),
        })}
        {card('work', {
          after: valueOf('TASKS') === 'on' && <RepoFolders />,
        })}
      </>
    ),
    logs: (
      <>
        {card('history', {
          after: valueOf('HISTORY_SHARE') === 'on' && (
            <McpConnections about="Claude Code and Codex read the history through Pacenote's MCP server: recent runs, a search, and one run with its steps and answer." />
          ),
        })}
        {card('logs')}
      </>
    ),
    general: (
      <>
        <section className="surface-group">
          <CardHeader
            title="App"
            help="Stored with the run history, not in the settings file."
          />
          <div className="divide-y divide-border">
            <Row label="Theme" help="System follows the macOS appearance.">
              <ThemePicker />
            </Row>
            {loginItem.state && (
              <Row
                label="Open Pacenote when you log in"
                help={
                  loginItem.state.available
                    ? 'It opens in the menu bar, without a window. macOS keeps this in Login Items.'
                    : 'Only the installed Pacenote can open at login.'
                }
                warning={
                  loginItem.state.needsApproval
                    ? 'macOS is waiting for you to allow Pacenote in System Settings > General > Login Items.'
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
                      Open Login Items
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
              <Row
                label="Start Pace when the app opens"
                help="When off, start Pace from its screen or the menu bar."
              >
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
          <CardHeader
            title="Files"
            help="Pace reads its settings from a file outside the repository. Runs from the app and the terminal share it."
          />
          <div className="divide-y divide-border">
            <Row
              label="Settings file"
              help={
                view.exists
                  ? 'Everything under Pace is saved here.'
                  : "Does not exist yet. Saving any of Pace's settings creates it."
              }
              issue={view.problem}
            >
              <PathControl
                path={view.file}
                label="Show in Finder"
                onOpen={() => void settings.revealFile()}
              />
            </Row>
            <Row
              label="Run history folder"
              help="To move it, change it in the settings file and relaunch the app."
            >
              <PathControl
                path={view.dataDir}
                label="Open"
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
                        text: botLive ? 'Restarting Pace.' : 'Starting Pace.',
                      })
                    }}
                  >
                    {botLive ? 'Restart now' : 'Start Pace'}
                  </Button>
                )}
              </div>
            )}

            <Placeholder key="body" ready skeleton={<SectionSkeleton />}>
              <div className="space-y-8">{content[section]}</div>
            </Placeholder>
            <div className="h-10" />
          </div>
        </ScrollArea>

        {changeCount > 0 && (
          <footer className="shrink-0 border-t bg-canvas/95 px-8 py-3 backdrop-blur @max-[36rem]/content:px-4">
            <div className="flex max-w-3xl flex-wrap items-center gap-2">
              <span className="text-row">
                {changeCount} unsaved {changeCount === 1 ? 'change' : 'changes'}
              </span>
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
                      `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} to fix`}
                    {issueSection && issueSection !== section
                      ? ` (${SECTION_INFO[issueSection].label})`
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
                  Revert
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => save(false)}
                  disabled={saving || issues.length > 0}
                >
                  <Save />
                  Save
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
                    {botLive ? 'Save and restart Pace' : 'Save and start Pace'}
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
  return (
    <nav
      aria-label="Settings sections"
      className="flex w-56 shrink-0 flex-col gap-4 border-r border-sidebar-border px-2.5 py-5 @max-[44rem]/settings:w-14 @max-[44rem]/settings:px-2"
    >
      <h1 className="px-2.5 text-heading @max-[44rem]/settings:sr-only">
        Settings
      </h1>
      {NAV.map((group) => (
        <div key={group.label} className="space-y-0.5">
          <p className="px-2.5 pb-1 text-caption text-muted-foreground/80 @max-[44rem]/settings:sr-only">
            {group.label}
          </p>
          {group.items.map((id) => (
            <NavItem
              key={id}
              icon={SECTION_INFO[id].icon}
              label={SECTION_INFO[id].label}
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
  return (
    <header>
      <h2 className="text-title">{SECTION_INFO[section].label}</h2>
      <p className="mt-1 text-copy text-muted-foreground">
        {SECTION_INFO[section].help}
      </p>
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
            title={`${issues} ${issues === 1 ? 'issue' : 'issues'} to fix`}
          />
        ) : changes > 0 ? (
          <span
            className="shrink-0 rounded-full bg-primary/12 px-1.5 text-caption font-semibold text-primary tabular-nums"
            title={`${changes} unsaved ${changes === 1 ? 'change' : 'changes'}`}
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

function SubHeading({
  title,
  help,
  chip,
}: {
  title: string
  help?: string
  chip?: React.ReactNode
}) {
  return (
    <div className="pt-3">
      <h3 className="flex items-center gap-2 text-section">
        {title}
        {chip}
      </h3>
      {help && <p className="mt-0.5 text-meta text-muted-foreground">{help}</p>}
    </div>
  )
}

function CardHeader({
  title,
  help,
  chip,
  action,
}: {
  title: string
  help?: React.ReactNode
  chip?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="flex items-start gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-2 text-section">
          {title}
          {chip}
        </h3>
        {help && (
          <p className="mt-0.5 text-meta text-muted-foreground">{help}</p>
        )}
      </div>
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

const STATE_CHIP = {
  on: {
    label: 'On',
    className: 'bg-status-succeeded/12 text-status-succeeded',
  },
  partial: {
    label: 'Incomplete',
    className: 'bg-status-interrupted/12 text-status-interrupted',
  },
  off: { label: 'Off', className: 'bg-muted text-muted-foreground' },
}

const CHIP_TONE = {
  ok: 'bg-status-succeeded/12 text-status-succeeded',
  warn: 'bg-status-interrupted/12 text-status-interrupted',
}

function Chip({
  tone,
  children,
}: {
  tone: keyof typeof CHIP_TONE
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded-sm px-1.5 text-caption leading-4',
        CHIP_TONE[tone]
      )}
    >
      {children}
    </span>
  )
}

function StateChip({
  state,
  title,
}: {
  state: keyof typeof STATE_CHIP
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'rounded-sm px-1.5 text-caption leading-4',
        STATE_CHIP[state].className
      )}
    >
      {STATE_CHIP[state].label}
    </span>
  )
}

function credentialsHelp(reasoner: string): string {
  return `${reasoner} signs in inside the sandbox and keeps its login there, separate from your ${reasoner} login on this Mac.`
}

type PairState =
  | { step: 'idle'; note?: string }
  | { step: 'starting' }
  | { step: 'waiting'; code: string }
  | { step: 'bound'; user: HubUser }
  | { step: 'confirming'; user: HubUser }
  | { step: 'error'; message: string }

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
  const hub = window.pacenoteDesktop?.hub
  const [state, setState] = useState<PairState>({ step: 'idle' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (state.step !== 'waiting' || !hub) return
    const timer = setInterval(() => {
      void hub.pairStatus().then((res) => {
        if ('error' in res) setState({ step: 'error', message: res.error })
        else if (res.status === 'bound')
          setState({ step: 'bound', user: res.user })
        else if (res.status === 'expired')
          setState({
            step: 'error',
            message: 'The code expired. Connect again for a new one.',
          })
      })
    }, 2_000)
    return () => clearInterval(timer)
  }, [state.step, hub])
  // Leaving the screen cancels a pairing that was not confirmed.
  useEffect(() => () => void hub?.pairCancel(), [hub])

  if (!hub) return null
  const start = () => {
    setState({ step: 'starting' })
    void hub
      .pairStart(hubUrl)
      .then((res) =>
        setState(
          'error' in res
            ? { step: 'error', message: res.error }
            : { step: 'waiting', code: res.code }
        )
      )
  }
  const cancel = (note?: string) => {
    void hub.pairCancel()
    setState({ step: 'idle', note })
  }
  const confirm = (user: HubUser) => {
    setState({ step: 'confirming', user })
    void hub.pairConfirm().then((res) => {
      if ('error' in res) return setState({ step: 'error', message: res.error })
      if (res.issues.length > 0)
        return setState({
          step: 'error',
          message: res.issues.map((i) => i.message).join(' '),
        })
      setState({ step: 'idle' })
      onPaired(
        `Paired with the hub as ${res.user.name} @ ${res.team.name}.${res.started ? ' Started Pace.' : ''}`
      )
    })
  }
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
            <p className="min-w-0 flex-1 text-copy">
              This desktop is paired with the hub. Use Check connection to see
              as whom.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={disconnect}
              disabled={busy}
            >
              {busy && <LoaderCircle className="animate-spin" />}
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-row">Pair this desktop</p>
              <p className="mt-0.5 text-meta text-muted-foreground">
                {state.note ??
                  'You get a code to send to Pace in Slack. Mentions you make then come to this desktop.'}
              </p>
            </div>
            <Button size="sm" onClick={start} disabled={!hubUrl}>
              <Plug />
              Connect
            </Button>
          </div>
        )
      case 'starting':
        return (
          <p className="flex items-center gap-2 text-copy text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Getting a code from the hub
          </p>
        )
      case 'waiting':
        return (
          <div className="space-y-2.5">
            <p className="text-copy">
              In Slack, mention Pace with this code in any channel it is in:
            </p>
            <div className="flex items-center gap-3">
              <code className="rounded-lg bg-card px-3 py-2 font-mono text-heading tracking-wide shadow-xs select-all">
                @Pace connect {state.code}
              </code>
              <Button size="sm" variant="ghost" onClick={() => cancel()}>
                Cancel
              </Button>
            </div>
            {/* Pace itself is watching Slack for the mention. */}
            <p className="flex items-center gap-2 text-meta text-muted-foreground">
              <PaceSpinner className="size-6" />
              <span>
                <span className="text-shimmer">Waiting for the code.</span> It
                expires in 10 minutes.
              </span>
            </p>
          </div>
        )
      case 'bound':
      case 'confirming':
        return (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-copy">
              <b>{state.user.name}</b>{' '}
              <span className="font-mono text-meta text-muted-foreground">
                ({state.user.id})
              </span>{' '}
              sent the code. Is this your Slack account?
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={state.step === 'confirming'}
              onClick={() =>
                cancel(
                  'Cancelled. If someone else sent your code, connect again to get a new one.'
                )
              }
            >
              No
            </Button>
            <Button
              size="sm"
              disabled={state.step === 'confirming'}
              onClick={() => confirm(state.user)}
            >
              {state.step === 'confirming' && (
                <LoaderCircle className="animate-spin" />
              )}
              Yes, pair
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
              Try again
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
  items: {
    ok: boolean
    label: string
    detail: string
    action?: { label: string; section: Section }
  }[]
  onOpen: (section: Section) => void
}) {
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
          {item.action && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => onOpen(item.action!.section)}
            >
              {item.action.label}
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

function FieldRow({
  field,
  extras,
  view,
  value,
  changed,
  editing,
  issue,
  onChange,
  onEdit,
  onSave,
  saving,
}: {
  field: SettingField
  extras?: ChoiceExtras
  view: SettingsView
  value: string
  changed: boolean
  editing: boolean
  issue?: string
  onChange: (value: string) => void
  onEdit: (on: boolean) => void
  onSave: () => void
  saving: boolean
}) {
  const overridden = view.overridden.includes(field.key)
  const label = (
    <span className="flex items-center gap-1.5">
      {field.label}
      {changed && (
        <span
          className="size-1.5 rounded-full bg-primary"
          aria-label="Changed"
        />
      )}
    </span>
  )
  const warning = overridden
    ? 'Pacenote was started with its own value for this, which wins over the one saved here.'
    : undefined
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
    >
      <Control
        field={field}
        view={view}
        value={value}
        editing={editing}
        onChange={onChange}
        onEdit={onEdit}
        onSave={onSave}
        saving={saving}
      />
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
}: {
  field: SettingField
  view: SettingsView
  value: string
  editing: boolean
  onChange: (value: string) => void
  onEdit: (on: boolean) => void
  /** Saves just this secret (Enter); Escape cancels */
  onSave: () => void
  saving: boolean
}) {
  switch (field.type) {
    case 'secret': {
      const secret = view.secrets[field.key]
      if (!editing) {
        return (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-mono text-meta',
                secret?.set ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {secret?.set ? secret.hint : 'Not set'}
            </span>
            <Button size="xs" variant="outline" onClick={() => onEdit(true)}>
              {secret?.set ? 'Change' : 'Enter'}
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
            Save
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onEdit(false)}>
            Cancel
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
            (field.default ? `Default ${field.default}` : 'Not set')
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
  children,
}: {
  label: React.ReactNode
  /** The setting the row edits, for finding it (never shown) */
  setting?: string
  help?: string
  issue?: string
  warning?: string
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
      </div>
      <div className="flex min-h-7 max-w-full shrink-0 items-center">
        {children}
      </div>
    </div>
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

const THEMES: { mode: ThemeMode; label: string; icon: typeof Monitor }[] = [
  { mode: 'system', label: 'System', icon: Monitor },
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
]

/**
 * System / Light / Dark, as a segmented control like the run list's status
 * filter.
 */
function ThemePicker() {
  const { mode, setMode } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-lg bg-muted p-0.5"
    >
      {THEMES.map(({ mode: value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => setMode(value)}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-md px-2.5 text-meta font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            mode === value
              ? 'bg-card text-foreground shadow-xs dark:bg-selected'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * A few short options side by side, like the theme picker: the settings that
 * pick one of two or three (where work runs, which terminal)
 */
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-lg bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-6 items-center rounded-md px-2.5 text-meta font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            value === option.value
              ? 'bg-card text-foreground shadow-xs dark:bg-selected'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Help: diagnostics to paste into a bug report. The secrets are taken out in
 * the app; the logs can still name channels and people, so it says to read it
 * first.
 */
function HelpCard() {
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
      <CardHeader title="Help" />
      <div className="divide-y divide-border">
        <Row
          label="Diagnostics"
          help="Versions, Pace's status, the settings without their secrets, and the latest logs, to paste into a bug report. The logs can name channels and people, so read it before you share it."
          warning={
            copied === 'failed' ? 'Could not copy the diagnostics.' : undefined
          }
        >
          <Button size="xs" variant="outline" onClick={copy}>
            {copied === 'yes' ? <Check /> : <Copy />}
            {copied === 'yes' ? 'Copied' : 'Copy diagnostics'}
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
  const { version } = __PACENOTE_BUILD__
  const latest = update?.latest
  return (
    <section className="surface-group">
      <CardHeader
        title="Updates"
        help="Pacenote looks for a new release twice a day. Homebrew installs it."
      />
      <div className="divide-y divide-border">
        <Row
          label={
            update?.available && latest
              ? `Pacenote ${latest.version} is out`
              : `Pacenote ${version}`
          }
          help={
            !update
              ? 'Only the installed Pacenote looks for updates.'
              : update.available
                ? `You have ${update.current}. Run this in Terminal; it quits Pacenote, updates it and opens it again. Pace finishes or resumes what it was answering.`
                : update.checkedAt
                  ? `Up to date. Checked ${formatRelative(update.checkedAt)}.`
                  : 'Not checked yet.'
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
                  Release notes
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
        Advanced ({count})
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
