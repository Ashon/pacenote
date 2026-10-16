/// <reference types="vite/client" />

import type {
  LoginItemState,
  SupervisorState,
  UpdateState,
} from '@runtime/types'
import type {
  HubTeam,
  HubUser,
  PairStartResponse,
  PairStatus,
} from '@src/hub/protocol'
import type {
  SettingsChanges,
  SettingsIssue,
  SettingsView,
} from '@src/settings/fields'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import type {
  ClaimedUser,
  CliCheck,
  SetupStep,
  SetupView,
} from '@src/settings/setup'
import type {
  CollectionRecord,
  CollectOutcome,
  FolderCheck,
  SessionItem,
  SlackYou,
  TaskDecision,
  Proposal,
  TaskDetail,
  TaskTrend,
  TasksCollect,
  TasksView,
  WorkEntry,
  WorkTool,
} from '@src/tasks/types'
import type { TasksLive } from '@src/tasks/types'
import type { TaskArea, YouView } from '@src/you/types'
import type { RecapPeriod, RecapView } from '@src/you/types'
import type { McpClientId, McpClientStatus } from '@src/history/mcp-clients'
import type {
  AllowlistIssue,
  SandboxJob,
  SandboxJobKind,
  SandboxStatus,
} from '@src/sandbox/types'

declare global {
  /**
   * The build: Pacenote's version (package.json), and git describe when the
   * build is not exactly the release tag (v0.3.9-3-g2034e74-dirty)
   */
  const __PACENOTE_BUILD__: { version: string; describe?: string }
  interface ImportMetaEnv {
    /** 1: the build includes the Debug section (pnpm desktop) */
    readonly VITE_PACENOTE_DEBUG?: string
  }
  interface Window {
    /** Present only in the desktop app (preload). */
    pacenoteDesktop?: {
      platform: string
      /**
       * Runs from the repository (Pacenote Dev) rather than the installed app
       */
      dev?: boolean
      /** Writes a screen's render error to the app's log */
      reportError(report: { message: string; stack?: string }): Promise<void>
      /** Diagnostics text for a bug report, secrets taken out */
      diagnostics(): Promise<string | null>
      /** A newer Pacenote, when there is one */
      updates: {
        state(): Promise<UpdateState | null>
        onChange(callback: (state: UpdateState) => void): () => void
      }
      /** macOS full screen, where the window's traffic lights hide */
      fullScreen: {
        get(): Promise<boolean>
        onChange(callback: (on: boolean) => void): () => void
      }
      /** Opening the app when you log in */
      loginItem: {
        get(): Promise<LoginItemState | null>
        set(on: boolean): Promise<LoginItemState | null>
        openSystemSettings(): Promise<void>
      }
      bot: {
        state(): Promise<SupervisorState | null>
        start(): Promise<void>
        stop(): Promise<void>
        restart(rebuild?: boolean): Promise<void>
        setAutoStart(value: boolean): Promise<void>
        openLogs(): Promise<void>
        onChange(callback: (state: SupervisorState) => void): () => void
      }
      settings: {
        get(): Promise<SettingsView | null>
        validate(changes: SettingsChanges): Promise<SettingsIssue[]>
        checkSlack(changes: SettingsChanges): Promise<SlackCheckItem[]>
        save(
          changes: SettingsChanges,
          restart?: boolean
        ): Promise<{ issues: SettingsIssue[]; restarted: boolean }>
        revealFile(): Promise<void>
        openDataDir(): Promise<void>
        /**
         * How AI tools launch Pacenote's MCP server. ready: the bundled server
         * exists (dev runs need pnpm bundle)
         */
        historyMcp(): Promise<
          | {
              command: string
              args: string[]
              env: Record<string, string>
              ready: boolean
            }
          | undefined
        >
      }
      /** Your tasks (src/tasks) */
      tasks: {
        list(): Promise<
          | (TasksView & {
              settings: {
                on: boolean
                dms: boolean
                exclude: string[]
                /** Where code tasks continue */
                cli: WorkTool
              }
              collect: TasksCollect
              /** The last 7 days' collections, newest first */
              collections: CollectionRecord[]
              /** Each open task's latest session: its tool and last activity */
              working: Record<string, { tool: WorkTool; at: string }>
              /** Open tasks whose quiet session says they look done */
              proposals: Record<string, Proposal>
              /** User groups that mean you (Settings), and ones you said not */
              groups: { yours: string[]; notYours: string[] }
              /** The area each task is in, for those in one (src/you) */
              areas: Record<string, TaskArea>
            })
          | null
        >
        /** What you handled over the last 14 days; null with Todo off */
        trend(): Promise<TaskTrend | null>
        /** What AI tools are doing with your tasks now; null with Todo off */
        live(): Promise<TasksLive | null>
        /** Calls back when a task file changes on disk; returns the stop */
        onChanged(callback: () => void): () => void
        decide(
          id: string,
          decision: Omit<TaskDecision, 'at'> | null
        ): Promise<void>
        leaveOut(label: string): Promise<SettingsIssue[]>
        /** Runs a collection (Claude Code, Slack read only) and waits for it */
        collect(): Promise<CollectOutcome | undefined>
        stopCollect(): Promise<void>
        /** A task with what came before it and its work log */
        detail(id: string): Promise<TaskDetail | null>
        /** A task that looks done: close it with how it ended, or not yet */
        answerProposal(
          id: string,
          answer: 'close' | 'not-yet'
        ): Promise<{ error?: string } | undefined>
        /** Keeps a thing left after a task as a task of its own */
        keepLeft(
          id: string,
          text: string
        ): Promise<{ id?: string; error?: string } | undefined>
        /** Who you are in Slack, as Collect now last looked you up */
        you(): Promise<SlackYou | null>
        /**
         * Whether a user group means you: yes adds it to Settings and keeps
         * its Maybes as tasks; no is not asked again
         */
        answerGroup(
          group: string,
          yours: boolean
        ): Promise<{ kept?: number; error?: string } | undefined>
        /** A session that looked like a task's work: it is, or it is not */
        answerSuggestion(entryId: string, yes: boolean): Promise<void>
        /** Where a task may open on this Mac, likeliest first */
        folders(id: string): Promise<FolderCheck[]>
        /** Asks for a folder, and checks it against the repository */
        chooseFolder(repo?: string): Promise<FolderCheck | undefined>
        /** Each repository's folder (tasks-repos.json) */
        repos(): Promise<Record<string, string>>
        setRepo(repo: string, folder?: string): Promise<Record<string, string>>
        /** Opens a session for the task in a terminal, in the folder */
        continueIn(
          id: string,
          how: { tool: WorkTool; folder: string }
        ): Promise<{ entry?: WorkEntry; error?: string } | undefined>
        /** Opens a session again, to continue it */
        resume(entryId: string): Promise<{ error?: string } | undefined>
        /** Has Claude Code draft a reply from the thread, read only */
        draft(
          id: string
        ): Promise<{ entry?: WorkEntry; error?: string } | undefined>
        /** Copies the reply and opens the thread; nothing is sent */
        copyReply(
          id: string,
          text: string
        ): Promise<{ error?: string } | undefined>
        /** A session's own log, read when you open it */
        sessionLog(
          entryId: string
        ): Promise<{ items?: SessionItem[]; error?: string } | undefined>
      }
      /**
       * You (src/you): where you contribute, from your tasks and sessions.
       * Each fix returns you counted again with it.
       */
      you: {
        get(): Promise<YouView | null>
        /** The areas look right, or you finished fixing them */
        confirm(): Promise<YouView | null>
        rename(id: string, name: string): Promise<YouView | null>
        /** Takes a part (by its key, "repo:ashon/payments") out of an area */
        takeOut(id: string, part: string): Promise<YouView | null>
        /** Puts an area into another, which keeps its name */
        merge(id: string, into: string): Promise<YouView | null>
        /** Not yours anymore, or yours again */
        leave(id: string, left: boolean): Promise<YouView | null>
      }
      /** Recap (src/you/recap.ts): a day, a week or a month of your work */
      recap: {
        /** A period's recap; the current one without a key */
        get(period: RecapPeriod, key?: string): Promise<RecapView | null>
        /** Has Claude Code write it up, with no tools; the recap with it */
        write(
          period: RecapPeriod,
          key: string
        ): Promise<{ view?: RecapView; error?: string }>
      }
      /**
       * Pacenote's MCP server in Claude Code and Codex. connect adds this
       * app's server (in place of another), disconnect takes it out; both
       * return the tool's status after the change.
       */
      mcp: {
        status(): Promise<McpClientStatus[]>
        connect(id: McpClientId): Promise<McpClientStatus | undefined>
        disconnect(id: McpClientId): Promise<McpClientStatus | undefined>
      }
      /** Team hub pairing. Each call returns { error } instead of throwing. */
      hub: {
        pairStart(url: string): Promise<PairStartResponse | { error: string }>
        pairStatus(): Promise<PairStatus | { error: string }>
        /** start: false leaves Pace stopped (setup starts it after review) */
        pairConfirm(options?: { start?: boolean }): Promise<
          | {
              user: HubUser
              team: HubTeam
              issues: SettingsIssue[]
              started: boolean
            }
          | { error: string }
        >
        pairCancel(): Promise<void>
        disconnect(): Promise<{ issues: SettingsIssue[] } | { error: string }>
      }
      /** The first-run wizard. Calls that can fail return { error }. */
      setup: {
        state(): Promise<SetupView | null>
        save(patch: {
          step?: SetupStep
          slack?: 'hub' | 'app'
          me?: { id: string; name: string } | null
          answerSince?: string
          /** true ends setup; false opens it again */
          finished?: boolean
        }): Promise<SetupView | null>
        /** The CLIs on this Mac, and whether it runs the built-in sandbox */
        detect(): Promise<{
          cli: Record<'claude' | 'codex', CliCheck>
          sandbox: { unsupported?: string }
        } | null>
        /** Listens on your own Slack app for "@Pace it's me" */
        claimStart(): Promise<{ ok: true } | { error: string }>
        /** Lets the person who mentioned Pace ask it, and stops listening */
        claimConfirm(
          user: ClaimedUser
        ): Promise<{ issues: SettingsIssue[] } | { error: string }>
        claimStop(): Promise<void>
        onClaim(callback: (user: ClaimedUser) => void): () => void
        /** Listening stopped on its own: Pace started, here or elsewhere */
        onClaimEnded(callback: (message: string) => void): () => void
      }
      sandbox: {
        status(): Promise<SandboxStatus | null>
        job(): Promise<SandboxJob | null>
        run(kind: SandboxJobKind): Promise<{ job?: SandboxJob; error?: string }>
        saveAllowlist(domains: string[]): Promise<AllowlistIssue[]>
        /**
         * Runs claude setup-token and saves its token as
         * SANDBOX_CLAUDE_OAUTH_TOKEN
         */
        claudeToken(): Promise<
          | { ok: true; credential?: 'accepted' | 'rejected' | 'unknown' }
          | { ok: false; error: string }
        >
        cancelClaudeToken(): Promise<void>
        onJob(callback: (job: SandboxJob) => void): () => void
      }
    }
  }
}
