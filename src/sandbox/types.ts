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
  image?: { createdAt: string; base: string }
  /** The diagram renderer's image, once built */
  renderer?: { createdAt: string; base: string }
}

export interface AllowlistIssue {
  domain?: string
  message: string
}

export type SandboxJobKind = 'kubeconfig' | 'vm'

export const SANDBOX_JOBS: Record<
  SandboxJobKind,
  { label: string; script: string; help: string }
> = {
  kubeconfig: {
    label: 'Rebuild kubeconfig',
    script: 'k8s:kubeconfig',
    help: "Builds the broker's kubeconfig from the read-only SA token. Used when Pace restarts.",
  },
  vm: {
    label: 'Set up built-in sandbox',
    script: 'sandbox:vm',
    help: 'Fetches the Linux kernel the first time, then builds the images in a VM: the reasoner, the diagram renderer and, with ops tools on, the broker. Run it again to update the CLIs.',
  },
}

/**
 * Where to fix a sandbox problem: the job's button in Settings > Sandbox, and
 * its pnpm script for a run from the repository
 */
export function jobHint(kind: SandboxJobKind): string {
  const job = SANDBOX_JOBS[kind]
  return `run "${job.label}" in Settings > Sandbox (pnpm ${job.script})`
}

export interface SandboxJob {
  kind: SandboxJobKind
  state: 'running' | 'succeeded' | 'failed'
  startedAt: string
  finishedAt?: string
  exitCode?: number | null
  output: string[]
}
