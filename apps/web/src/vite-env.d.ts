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
  CollectionRecord,
  CollectOutcome,
  FolderCheck,
  SessionItem,
  TaskDecision,
  TaskDetail,
  TasksCollect,
  TasksView,
  WorkEntry,
  WorkTool,
} from '@src/tasks/types'
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
        revealEnv(): Promise<void>
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
            })
          | null
        >
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
        pairConfirm(): Promise<
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
