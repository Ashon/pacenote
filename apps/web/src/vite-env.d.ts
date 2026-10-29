/// <reference types="vite/client" />

import type {
  LoginItemState,
  SupervisorState,
  UpdateState,
} from '@runtime/types'
import type {
  HubInstallState,
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
import type { LanguagePreference, LanguageState } from '@/lib/i18n'
import type {
  ClaimedUser,
  CliCheck,
  SetupStep,
  SetupView,
} from '@src/settings/setup'
import type { OwnAiNow, OwnAiView, OwnCli } from '@src/tasks/own-ai'
import type { StageRecord, StageRecords } from '@src/tasks/stage'
import type { FromMacMode, FromMacState, MacsView } from '@src/macs/types'
import type {
  CollectionRecord,
  CollectOutcome,
  FolderCheck,
  RepoFolderRow,
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
  LoginResult,
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
    /**
     * Present in the desktop app (preload), and on a device of yours
     * (the iPhone, iPad and Android app), which asks its Mac for what these
     * screens get
     */
    pacenoteDesktop?: {
      /**
       * On a device of yours: the Mac whose screens these are. What stays on
       * that Mac (its secrets, folders, Finder) is left to it.
       */
      remote?: { mac: string }
      platform: string
      /**
       * Runs from the repository (Pacenote Dev) rather than the installed app
       */
      dev?: boolean
      /** The app's language: the one chosen in Settings, or macOS's */
      language: {
        initial: LanguageState
        set(preference: LanguagePreference): Promise<LanguageState>
        /** The language set, from here or elsewhere */
        onChanged(callback: (state: LanguageState) => void): () => void
      }
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
        /** With Pace off: turns it on, its setup open where it got to */
        setUp(): Promise<void>
        openLogs(): Promise<void>
        onChange(callback: (state: SupervisorState) => void): () => void
      }
      /** The screen the window opens on, and whether you were told */
      landing: {
        get(): Promise<{ landing: 'tasks' | 'overview'; told: boolean } | null>
        set(patch: {
          landing?: 'tasks' | 'overview'
          told?: true
        }): Promise<void>
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
                /** The tools a code task can continue in here */
                tools: WorkTool[]
                /** Where each tool's sessions open: its app or a terminal */
                opensIn: Record<WorkTool, 'app' | 'terminal'>
              }
              collect: TasksCollect
              /** Pacenote's own work: the CLI chosen, and what each last did */
              ai: OwnAiNow
              /** The last 7 days' collections, newest first */
              collections: CollectionRecord[]
              /** Each open task's latest session: its tool and last activity */
              working: Record<string, { tool: WorkTool; at: string }>
              /** The stages you set for open tasks: started, waiting */
              stages: StageRecords
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
        /** In progress, waiting on someone else, or back to open */
        stage(id: string, stage: StageRecord['stage']): Promise<void>
        /** Adds a task of your own, in a repository's project or none */
        add(
          title: string,
          repo?: string
        ): Promise<{ id?: string; error?: string } | undefined>
        leaveOut(label: string): Promise<SettingsIssue[]>
        /**
         * Runs a collection (the AI chosen, Slack read only) and waits for it
         */
        collect(): Promise<CollectOutcome | undefined>
        stopCollect(): Promise<void>
        /**
         * Opens claude auth login (or codex login) in your terminal, for
         * Pacenote's own work
         */
        signIn(cli?: OwnCli): Promise<{ error?: string } | undefined>
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
        /** The repositories you work in, and where each one's tasks open */
        repoRows(): Promise<RepoFolderRow[]>
        /** Whether the Claude app and the Codex app are on this Mac */
        apps(): Promise<Record<WorkTool, boolean> | null>
        setRepo(repo: string, folder?: string): Promise<Record<string, string>>
        /**
         * Opens a session for the task in the folder: in a terminal, or in the
         * tool's desktop app with a note on what to do there
         */
        continueIn(
          id: string,
          how: { tool: WorkTool; folder: string }
        ): Promise<
          { entry?: WorkEntry; error?: string; note?: string } | undefined
        >
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
      /** Pacenote's own work: the CLIs that do it (Settings > Todo) */
      /**
       * Settings > Devices (src/macs): your other Macs, and where Pace answers
       */
      macs: {
        view(): Promise<MacsView | null>
        /** Pace answers on this Mac from now */
        answerHere(): Promise<void>
        follow(on: boolean): Promise<MacsView | null>
        /** false for an address that is not one */
        addAddress(address: string): Promise<boolean>
        removeAddress(address: string): Promise<void>
        /** Stop following to that Mac */
        ignore(id: string): Promise<void>
        /** A device of yours: none of your Macs lets it in again */
        removeDevice(id: string): Promise<void>
        /** Add a device: waits 10 minutes; false without your own Slack app */
        addStart(): Promise<boolean>
        addStop(): Promise<void>
        /**
         * Sends the new Mac your Slack app, who Pace answers, Todo settings;
         * a device, a key of its own
         */
        addAllow(): Promise<void>
        /** Not this one */
        addDecline(): Promise<void>
        /** Done with what Add a device says */
        addClose(): Promise<void>
        /** System Settings > Privacy & Security > Local Network */
        openPrivacy(): Promise<void>
        onChange(callback: (view: MacsView) => void): () => void
      }
      ai: {
        /** Each CLI checked on this Mac, with what it last did */
        state(): Promise<OwnAiView | null>
        /** The CLI chosen and what each last did, without checking them */
        now(): Promise<OwnAiNow | null>
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
        /**
         * The command that installs a hub on a server (deploy/hub/install.sh),
         * then the wait for it. switchHere: Pace switches to the hub once it
         * answers; otherwise this Mac pairs with a code.
         */
        installCommand(input: {
          url: string
          allow: string
          lang: 'en' | 'ko'
          switchHere: boolean
        }): Promise<HubInstallState | { error: string }>
        installState(): Promise<HubInstallState>
        /** Waits again for the same command, after giving up */
        installWait(): Promise<HubInstallState>
        installCancel(): Promise<void>
        onInstall(callback: (state: HubInstallState) => void): () => void
        /** The hub a pacenote:// link named, once */
        takeLink(): Promise<string | null>
        onLinked(callback: () => void): () => void
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
        /** Connect to your other Mac, as far as it got */
        macState(): Promise<FromMacState | null>
        /** Looks for a Mac waiting in Add a device on this network */
        /** mode: what it takes this time (FromMacMode), Pace's by default */
        macLook(mode?: FromMacMode): Promise<void>
        macConnect(
          target: { instance: string } | { address: string }
        ): Promise<void>
        macCancel(): Promise<void>
        onMacChanged(callback: (state: FromMacState) => void): () => void
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
         * Signs the sandbox's CLI in, inside a VM: its link (and code) come
         * through onLoginPrompt, and it resolves once it signed in or stopped
         */
        login(cli: 'claude' | 'codex'): Promise<LoginResult>
        /** Claude: the code its page showed */
        loginCode(code: string): Promise<void>
        cancelLogin(): Promise<void>
        signOut(cli: 'claude' | 'codex'): Promise<void>
        onLoginPrompt(
          callback: (prompt: {
            url: string
            code?: string
            paste?: boolean
          }) => void
        ): () => void
        onJob(callback: (job: SandboxJob) => void): () => void
      }
    }
  }
}
