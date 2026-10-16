import type { RunResult } from './process.js'

/**
 * Where a reasoner CLI runs. A sandbox knows how to run one process in
 * isolation and nothing about which CLI it is: the reasoner adapters
 * (src/reasoners) say what to run, which credentials it gets, and which host
 * paths it needs. A new kind of isolation (another VM, a container runtime, a
 * remote runner) is a new Sandbox, and no adapter changes.
 */

export type SandboxKind = 'host' | 'vm'

/**
 * Where an isolated sandbox puts the host paths it is given. The reasoner image
 * is built for this layout.
 */
export const SANDBOX_PATHS = {
  /**
   * The reference directory, read-only, and the working directory when there is
   * one
   */
  workspace: '/workspace',
  /** Attachment images, read-only */
  attachments: '/attachments',
  /**
   * The one writable host path: files the CLI creates (codex's generated
   * images)
   */
  output: '/out',
  /** Credential files, read-only */
  secrets: '/run/secrets',
  /** The working directory without a reference directory: empty */
  empty: '/work',
} as const

/**
 * A host path the process needs, and where it sees it in an isolated sandbox.
 * Read-only unless writable.
 */
export interface Mount {
  host: string
  at: string
  writable?: boolean
}

/**
 * Who a run answers. The built-in sandbox puts it on each of the run's calls to
 * the ops broker, which logs them with it (vm-broker.ts), and Pace's own tools
 * act for it (src/pace/tools.ts).
 */
export interface Requester {
  /** The asker, by the messenger's user id */
  user: string
  /** The conversation's id, and its label (#ops) */
  conversation: string
  label?: string
  thread: string
  /** The run in the history */
  run?: string
  /** The mention (a Slack ts) and its link: where tasks Pace adds come from */
  message?: string
  permalink?: string
}

/** One process to run */
export interface SandboxRun {
  /**
   * The CLI by name (claude, codex). The host sandbox may map it to a binary
   * path.
   */
  command: string
  args: string[]
  /** Given on stdin */
  input: string
  /**
   * Values for the process environment (credentials). A VM gets them by
   * name only, out of process listings.
   */
  env?: Record<string, string>
  mounts?: Mount[]
  /**
   * The working directory, as a read-only mount. Without it the process starts
   * in an empty directory.
   */
  cwd?: Mount
  timeoutMs: number
  signal?: AbortSignal
  /** Receives stdout line by line, for progress events */
  onOutputLine?: (line: string) => void
  /** Who the run answers */
  requester?: Requester
}

export interface Sandbox {
  readonly kind: SandboxKind
  /**
   * Whether the process sees only what is mounted, rather than the whole host
   */
  readonly isolated: boolean
  /** The path the process sees for a file under a mount's host path */
  pathIn(mount: Mount, hostFile: string): string
  run(run: SandboxRun): Promise<RunResult>
  /**
   * Extracts the text of a PDF someone uploaded. An isolated sandbox does it
   * without network.
   */
  extractPdfText(pdfPath: string): Promise<string>
  /**
   * What keeps it from running, if anything (an image, the network, the egress
   * proxy)
   */
  verify(): Promise<string[]>
  /** Lets go of what it holds open (the VM's egress proxy), at shutdown */
  close?(): Promise<void>
}

/** pdftotext: the first 50 pages only, in UTF-8, without warnings */
export const PDFTOTEXT_ARGS = ['-l', '50', '-enc', 'UTF-8', '-q']
