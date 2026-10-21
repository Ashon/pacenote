import { localized } from '../i18n/locale.js'
import { text } from './types.text.js'

/**
 * Sandbox status and jobs. The desktop app produces them and the settings
 * screen shows them. (Only types also read in the browser live here) Sandbox
 * settings, the ops broker's included, apply when Pace restarts; the allowed
 * domains list, on the next request.
 */
export interface SandboxCheck {
  label: string
  ok: boolean
  detail?: string
  /** The reasoner's login (the rest are the broker's) */
  login?: boolean
}

/** Settings changed since Pace started, and why it needs a restart */
export interface PendingApply {
  reason: string
}

export interface SandboxStatus {
  checkedAt: string
  /** Credentials and generated file status (values are not sent) */
  checks: SandboxCheck[]
  /** Changed settings Pace has not picked up yet */
  pending: PendingApply[]
  allowlist: { file: string; domains: string[]; required: string[] }
  /** Number of requests the bot is handling */
  activeRequests: number
  /** The built-in VM sandbox (on a Mac), chosen or not */
  vm?: VmStatus
  /**
   * Whether the reasoner CLI signed in inside the built-in sandbox
   * (vm-login.ts), whether or not the sandbox is chosen yet
   */
  signedIn?: boolean
}

/** What the built-in VM sandbox has ready (src/sandbox/vm.ts) */
export interface VmStatus {
  /** Why this Mac cannot run it, if it cannot */
  unsupported?: string
  /** pacenote-vm, and whether it answered */
  helper: { path: string; ok: boolean; error?: string }
  kernel: boolean
  initfs: boolean
  /** The reasoner image, once built */
  image?: VmImageStatus
  /** The diagram renderer's image, once built */
  renderer?: VmImageStatus
  /** The ops broker's image, once built */
  broker?: VmImageStatus
  /**
   * The images the settings use (the renderer's with diagrams on, the
   * broker's with ops tools on) that were built for another version of
   * Pacenote: the setup builds them anew
   */
  outdated?: string[]
}

/** A built image of the built-in sandbox */
export interface VmImageStatus {
  createdAt: string
  base: string
  /**
   * Built from this Pacenote's recipe: an image from an older one still runs,
   * until the setup builds it anew
   */
  current: boolean
}

export interface AllowlistIssue {
  domain?: string
  message: string
}

export type SandboxJobKind = 'kubeconfig' | 'vm'

/** A job's button and what it does, in the language of the moment */
function jobWords(kind: SandboxJobKind, script: string) {
  return {
    script,
    get label() {
      return localized(text).jobs[kind].label
    },
    get help() {
      return localized(text).jobs[kind].help
    },
  }
}

/**
 * The sandbox jobs. Their label and help are read in the language of the
 * moment each time, so the screens that show them follow a change of language.
 */
export const SANDBOX_JOBS: Record<
  SandboxJobKind,
  { readonly label: string; script: string; readonly help: string }
> = {
  kubeconfig: jobWords('kubeconfig', 'k8s:kubeconfig'),
  vm: jobWords('vm', 'sandbox:vm'),
}

/**
 * Where to fix a sandbox problem: the job's button in Settings > Sandbox, and
 * its pnpm script for a run from the repository. A clause a sentence ends
 * with: '...: run "Set up built-in sandbox" in Settings > Sandbox (pnpm
 * sandbox:vm)'
 */
export function jobHint(kind: SandboxJobKind): string {
  const job = SANDBOX_JOBS[kind]
  return localized(text).jobHint(job.label, job.script)
}

export interface SandboxJob {
  kind: SandboxJobKind
  state: 'running' | 'succeeded' | 'failed'
  startedAt: string
  finishedAt?: string
  exitCode?: number | null
  output: string[]
}

/** How signing a sandbox CLI in ended (vm-login.ts) */
export type LoginResult =
  | { ok: true }
  | {
      ok: false
      error: string
      /** Stopped from the app, which is no error to show */
      cancelled?: true
    }
