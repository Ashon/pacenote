import {
  settingFields,
  settingGroups,
  settingLabel,
  type SettingField,
  type SettingGroup,
  type SettingGroupInfo,
  type SettingsChanges,
  type SettingsIssue,
} from '@src/settings/fields'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import {
  CircleCheck,
  LoaderCircle,
  RotateCcw,
  Save,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
import {
  draftValue,
  fieldShown,
  inSection,
  issuesPlaced,
  restartsPace,
  typedValue,
  useSettingsDraft,
} from '@/lib/settings-draft'
import { useSettingsView } from '@/lib/setup'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { FoundNames } from './found-names'
import { EnvironmentDetails, VmFooter } from './sandbox-panel'
import { text } from './settings-page.text'
import { DevicesSection, MacsSection } from './settings-devices'
import {
  AnswersSection,
  GeneralSection,
  LogsSection,
  MessengersSection,
  OpsSection,
  SandboxSection,
  type SettingsCtx,
  TasksSection,
} from './settings-sections'
import { FOUND_KEYS } from '@src/settings/found'
import { connectionStates } from '@src/settings/tools'
import { vmReadiness, type VmReadiness } from '@src/sandbox/vm-ready'
import {
  AppsHere,
  type ChoiceExtras,
  FieldRow,
  GroupCard,
  type Hint,
  SECTION_ICON,
  sectionInfo,
  SettingsNav,
  SectionSkeleton,
  SectionTitle,
  type Section,
} from './settings-parts'

/** The groups' words in the app's language, by id */
const groupsById = () =>
  Object.fromEntries(settingGroups().map((info) => [info.id, info])) as Record<
    SettingGroup,
    SettingGroupInfo
  >
/** What your own Slack app needs before the bot can start */
const SLACK_APP_TOKENS = ['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN']

/** What a save, or a link, says over the section */
interface Notice {
  tone: 'ok' | 'warn'
  text: string
  /** Pace takes the change once it restarts (or starts): it offers that */
  restart?: boolean
}

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
  const draft = useSettingsDraft(view, settings)
  const { changes, changeCount, issues, setIssues } = draft
  const [check, setCheck] = useState<SlackCheckItem[] | 'running'>()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>()

  // A pacenote:// link from the hub's installer, or from the join page a
  // teammate's link opens: Messengers, with that hub filled in to connect to.
  // It saves nothing by itself.
  const fileHub =
    view?.values.SLACK_CONNECTION === 'hub' ? view.values.HUB_URL : undefined
  const { fill } = draft
  useEffect(() => {
    const hub = window.pacenoteDesktop?.hub
    if (!hub) return
    const take = () =>
      void hub.takeLink().then((url) => {
        if (!url || url === fileHub) return
        fill({ SLACK_CONNECTION: 'hub', HUB_URL: url })
        window.location.hash = '#/settings/messengers'
        setNotice({ tone: 'ok', text: t.openedFromLink(url) })
      })
    take()
    return hub.onLinked(take)
    // fill adds to the draft as it is then, from whichever render it came
  }, [fileHub, t])

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
  const valueOf = (key: string): string => draftValue(draft, view, key)
  const isSet = (key: string) => valueOf(key) !== ''
  const shown = (field: SettingField) => fieldShown(field, view, valueOf)

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
  const botChanged = restartsPace(changes)
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
      draft.reset()
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
    const value = draft.values[field.key]?.trim()
    if (!value) return
    store({ [field.key]: value }, false, () => {
      draft.edit(field.key, false)
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
  const { offscreen: offscreenIssues, section: issueSection } = issuesPlaced(
    issues,
    shown
  )
  // Whether this app can start or restart Pace now (not one running elsewhere)
  const canControl =
    supervisor &&
    supervisor.phase !== 'external' &&
    supervisor.phase !== 'building'
  // The save bar restarts Pace only for changes it picks up on a restart.
  const canRestart = botChanged && canControl

  // What each section shows in the navigation: an issue dot, its unsaved
  // changes, or a short state.
  const sectionChanges = (id: Section) => inSection(Object.keys(changes), id)
  const sectionIssues = (id: Section) =>
    inSection(
      issues.map((issue) => issue.key),
      id
    )
  const groups = groupsById()
  const builtIn = valueOf('REASONER_SANDBOX') === 'vm'
  const vmStatus = sandbox.status?.vm
  const opsOn = valueOf('OPS_TOOLS') === 'on'
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
  /** The built-in sandbox's hint: a step to take, an update, or none */
  const vmHint = (readiness: VmReadiness | undefined): Hint | undefined =>
    readiness === 'outdated'
      ? { tone: 'warn', text: t.hintUpdate }
      : readiness && readiness !== 'ready'
        ? { tone: 'warn', text: t.hintSetUp }
        : undefined
  const hints: Partial<Record<Section, Hint>> = {
    // Short enough to sit beside "Messengers"; the Slack heading says what is
    // missing.
    messengers: slackReady ? undefined : { tone: 'warn', text: t.hintSetUp },
    sandbox: builtIn
      ? vmHint(vmStatus && vmReadiness(vmStatus))
      : { tone: 'muted', text: t.hintOff },
    ops: !opsOn
      ? { tone: 'muted', text: t.hintOff }
      : !opsReady
        ? { tone: 'warn', text: t.hintNeedsSetup }
        : { tone: 'muted', text: t.hintOn(connectionsInUse) },
  }

  /**
   * What a field shows besides its control: the run environment's readiness
   * and setup under each sandbox, what the chosen one has ready, and the names
   * this Mac has for a Tools setting, to pick instead of typing
   */
  const choiceExtras: Partial<Record<string, ChoiceExtras>> = {
    ...(!remote &&
      Object.fromEntries(
        FOUND_KEYS.map((key) => [
          key,
          {
            below: (
              <FoundNames
                setting={key}
                value={
                  key in draft.values
                    ? draft.values[key]!
                    : (view.values[key] ?? '')
                }
                workFolder={valueOf('OPS_FS_ROOT')}
                onChange={(value) => draft.set(key, value)}
              />
            ),
          },
        ])
      )),
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
      value={typedValue(draft, view, field)}
      changed={field.key in changes}
      editing={draft.editing.has(field.key)}
      issue={issueOf(field.key)}
      onChange={(value) => draft.set(field.key, value)}
      onEdit={(on) => draft.edit(field.key, on)}
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

  /** The page's draft and its handlers, which every section builds from */
  const ctx: SettingsCtx = {
    t,
    view,
    remote,
    settings,
    sandbox,
    supervisor,
    loginItem,
    update,
    hubMode,
    builtIn,
    slackReady,
    valueOf,
    isSet,
    set: draft.set,
    drop: draft.drop,
    changed: (key) => key in changes,
    issueOf,
    card,
    row,
    fieldsOf,
    groups,
    check,
    runCheck,
    setCheck,
    load,
    setNotice,
    go,
  }
  const content: Record<Section, () => React.ReactNode> = {
    messengers: () => <MessengersSection ctx={ctx} />,
    answers: () => <AnswersSection ctx={ctx} />,
    sandbox: () => <SandboxSection ctx={ctx} />,
    ops: () => <OpsSection ctx={ctx} />,
    tasks: () => <TasksSection ctx={ctx} />,
    logs: () => <LogsSection ctx={ctx} />,
    macs: () => (
      <>
        <MacsSection />
        <DevicesSection />
      </>
    ),
    general: () => <GeneralSection ctx={ctx} />,
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
              <SaveNotice
                notice={notice}
                canControl={Boolean(canControl)}
                botLive={botLive}
                setNotice={setNotice}
              />
            )}

            <Placeholder key="body" ready skeleton={<SectionSkeleton />}>
              <div className="space-y-8">{content[section]()}</div>
            </Placeholder>
            <div className="h-10" />
          </div>
        </ScrollArea>

        {changeCount > 0 && (
          <SaveBar
            changeCount={changeCount}
            issues={issues}
            // Spelled out when its field is not on screen
            firstIssue={offscreenIssues[0]?.message}
            issueSection={issueSection}
            section={section}
            go={go}
            saving={saving}
            onRevert={draft.reset}
            onSave={save}
            canRestart={Boolean(canRestart)}
            botLive={botLive}
          />
        )}
      </div>
    </div>
  )
}

/**
 * What a save, or a link, says over the section: done, or what is left to do.
 * Changes Pace takes on a restart offer it here, while this app can.
 */
function SaveNotice({
  notice,
  canControl,
  botLive,
  setNotice,
}: {
  notice: Notice
  /** This app can start or restart Pace now */
  canControl: boolean
  /** Pace is running or starting: it restarts rather than starts */
  botLive: boolean
  setNotice: (notice: Notice) => void
}) {
  const t = useText(text)
  return (
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
  )
}

/**
 * The bar at the bottom while changes are unsaved: how many, the issues to
 * fix (a click goes to their section), Revert, Save, and Save and restart (or
 * start) Pace for changes it picks up on a restart
 */
function SaveBar({
  changeCount,
  issues,
  firstIssue,
  issueSection,
  section,
  go,
  saving,
  onRevert,
  onSave,
  canRestart,
  botLive,
}: {
  changeCount: number
  issues: SettingsIssue[]
  /** The first issue with no field on screen, in words */
  firstIssue?: string
  /** The section of the first issue that has one */
  issueSection?: Section
  section: Section
  go: (section: Section) => void
  saving: boolean
  onRevert: () => void
  onSave: (restart: boolean) => void
  canRestart: boolean
  botLive: boolean
}) {
  const t = useText(text)
  return (
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
              {firstIssue ?? t.issuesToFix(issues.length)}
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
            onClick={onRevert}
            disabled={saving}
          >
            <RotateCcw />
            {t.revert}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSave(false)}
            disabled={saving || issues.length > 0}
          >
            <Save />
            {t.save}
          </Button>
          {canRestart && (
            <Button
              size="sm"
              onClick={() => onSave(true)}
              disabled={saving || issues.length > 0}
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
              {botLive ? t.saveRestart : t.saveStart}
            </Button>
          )}
        </div>
      </div>
    </footer>
  )
}
