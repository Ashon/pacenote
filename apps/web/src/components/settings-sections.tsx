import {
  settingLabel,
  type SettingField,
  type SettingGroup,
  type SettingGroupInfo,
  type SettingsView,
} from '@src/settings/fields'
import { MESSENGER_IDS, MESSENGER_NAMES } from '@src/messengers/ids'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import type { SupervisorState, UpdateState } from '@runtime/types'
import { LoaderCircle, PlugZap } from 'lucide-react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { botControl, useLoginItem, useSandbox } from '@/lib/desktop'
import { go as goTo } from '@/lib/utils'
import type { Locale } from '@src/i18n/locale'
import { isOwnCli } from '@src/tasks/own-ai'
import { LoginChecks, PendingList } from './sandbox-panel'
import { McpConnections } from './mcp-connections'
import { OwnAiStatus } from './own-ai-status'
import { RepoFolders } from './repo-folders'
import { SandboxSignIn } from './sandbox-sign-in'
import { SlackAppSetup } from './slack-app-setup'
import { SlackYou } from './slack-you'
import { text } from './settings-page.text'
import {
  CardHeader,
  CheckResult,
  Chip,
  GroupBody,
  type GroupCard,
  HelpCard,
  HubPairing,
  LanguagePicker,
  OnTheMacNote,
  PathControl,
  Row,
  sectionInfo,
  SubHeading,
  Switch,
  ThemePicker,
  UpdatesCard,
  type Section,
} from './settings-parts'
import { ToolsSection } from './tools-section'

/**
 * What each Settings section shows: the page (settings-page.tsx) holds the
 * draft, the validation and the save bar, and builds every section from the
 * same context, so a value reads the same everywhere and one Save covers
 * them all. The parts they draw with are in settings-parts.tsx, and the
 * Devices section, which talks to your Macs rather than the settings file,
 * in settings-devices.tsx.
 */

/** The section's words in the app's language, as the page holds them */
export type SettingsWords = (typeof text)[Locale]

/** What a card adds to its group's fields (the page's card takes these) */
export type CardExtra = Omit<
  React.ComponentProps<typeof GroupCard>,
  'info' | 'fields' | 'row'
>

/**
 * The page's draft and its handlers, which every section builds itself from:
 * values as the draft will leave them, one Save's worth of changes, and the
 * cards assembled from the fields the current values call for
 */
export interface SettingsCtx {
  t: SettingsWords
  view: SettingsView
  /** On a device of yours: the Mac whose settings these are */
  remote?: string
  settings: NonNullable<Window['pacenoteDesktop']>['settings']
  sandbox: ReturnType<typeof useSandbox>
  supervisor: SupervisorState | undefined
  loginItem: ReturnType<typeof useLoginItem>
  update: UpdateState | undefined
  hubMode: boolean
  /** The built-in sandbox chosen as the run environment */
  builtIn: boolean
  slackReady: boolean
  valueOf(key: string): string
  isSet(key: string): boolean
  set(key: string, value: string): void
  /** Drops what was typed for these settings */
  drop(...keys: string[]): void
  changed(key: string): boolean
  issueOf(key: string): string | undefined
  /** A group's card with only the fields the current values call for */
  card(id: SettingGroup, extra?: CardExtra): React.ReactNode
  /** One field's row, on the page's draft */
  row(field: SettingField): React.ReactNode
  /** The fields a group shows now */
  fieldsOf(id: SettingGroup): SettingField[]
  groups: Record<SettingGroup, SettingGroupInfo>
  check: SlackCheckItem[] | 'running' | undefined
  runCheck(): void
  /** Clears or holds the last connection check's result */
  setCheck(check?: SlackCheckItem[] | 'running'): void
  /** Reads the settings again */
  load(): void
  setNotice(notice?: {
    tone: 'ok' | 'warn'
    text: string
    restart?: boolean
  }): void
  go(section: Section): void
}

/** Messengers: the Slack app Pace answers in, and who can ask there */
export function MessengersSection({ ctx }: { ctx: SettingsCtx }) {
  const { t, view, remote, hubMode, valueOf, isSet, set, drop, load } = ctx
  const slackReady = ctx.slackReady
  return (
    <>
      {MESSENGER_IDS.map((id) => (
        <div key={id} className="space-y-3">
          <SubHeading
            title={MESSENGER_NAMES[id]}
            chip={
              slackReady ? (
                <Chip tone="ok">{hubMode ? t.teamHub : t.ownApp}</Chip>
              ) : (
                <Chip tone="warn">
                  {hubMode ? t.notPaired : t.notConnected}
                </Chip>
              )
            }
          />
          {ctx.card('slack', {
            action: !remote && (
              <Button
                size="sm"
                variant="outline"
                onClick={ctx.runCheck}
                disabled={ctx.check === 'running'}
              >
                {ctx.check === 'running' ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <PlugZap />
                )}
                {t.checkConnection}
              </Button>
            ),
            children:
              ctx.check && ctx.check !== 'running' ? (
                <CheckResult items={ctx.check} />
              ) : null,
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
                  ctx.setCheck(undefined)
                  load()
                  ctx.setNotice({ tone: 'ok', text })
                }}
                onDisconnected={() => {
                  ctx.setCheck(undefined)
                  load()
                  ctx.setNotice({ tone: 'ok', text: t.hubDisconnected })
                }}
              />
            ) : !isSet('SLACK_APP_TOKEN') || !isSet('SLACK_BOT_TOKEN') ? (
              <SlackAppSetup />
            ) : undefined,
          })}
          {ctx.card('access')}
        </div>
      ))}
    </>
  )
}

/** Answers: the CLI that writes answers and how requests are handled */
export function AnswersSection({ ctx }: { ctx: SettingsCtx }) {
  return (
    <>
      {(['reasoner', 'requests', 'diagrams'] as const).map((id) =>
        ctx.card(id)
      )}
    </>
  )
}

/** Sandbox: where the reasoner CLI runs, and what it signs in with */
export function SandboxSection({ ctx }: { ctx: SettingsCtx }) {
  const { t, remote, valueOf, sandbox, builtIn } = ctx
  const pending = sandbox.status?.pending ?? []
  return (
    <>
      {ctx.card('environment', {
        // Settings Pace picks up on its restart, such as the limits here
        children: !remote && pending.length > 0 && (
          <PendingList pending={pending} sandbox={sandbox} />
        ),
      })}
      {builtIn &&
        ctx.card('credentials', {
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
                  ctx.load()
                  ctx.setNotice({
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
  )
}

/** Tools: what Pace can reach when it answers, through the broker */
export function OpsSection({ ctx }: { ctx: SettingsCtx }) {
  const { valueOf, isSet, changed, issueOf, fieldsOf, card, groups, sandbox } =
    ctx
  return (
    <ToolsSection
      valueOf={valueOf}
      isSet={isSet}
      changed={changed}
      hasIssue={(key) => Boolean(issueOf(key))}
      keysOf={(id) => fieldsOf(id).map((field) => field.key)}
      fields={(id) => <GroupBody fields={fieldsOf(id)} row={ctx.row} />}
      card={(id, chip) => card(id, { chip })}
      groups={groups}
      labelOf={settingLabel}
      sectionLabel={(id) => sectionInfo(id).label}
      go={ctx.go}
      sandbox={sandbox}
    />
  )
}

/** Todo: your own tasks, gathered from Slack by your AI tools */
export function TasksSection({ ctx }: { ctx: SettingsCtx }) {
  const { t, view, remote, valueOf, hubMode } = ctx
  return (
    <>
      {ctx.card('ownWork', {
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
      {ctx.card('tasks', {
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
      {ctx.card('work', {
        after: valueOf('TASKS') === 'on' && !remote && <RepoFolders />,
      })}
    </>
  )
}

/** Logs: the run history your AI tools read, and the app's own log */
export function LogsSection({ ctx }: { ctx: SettingsCtx }) {
  const { t, valueOf, remote } = ctx
  return (
    <>
      {ctx.card('history', {
        after: valueOf('HISTORY_SHARE') === 'on' && !remote && (
          <McpConnections about={t.mcpHistory} />
        ),
      })}
      {ctx.card('logs')}
    </>
  )
}

/** General: this app's own preferences, and where its files are */
export function GeneralSection({ ctx }: { ctx: SettingsCtx }) {
  const { t, view, update, loginItem, supervisor, settings } = ctx
  return (
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
  )
}
