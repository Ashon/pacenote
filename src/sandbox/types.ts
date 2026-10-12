/**
 * Sandbox status and jobs. The desktop app produces them and the settings
 * screen shows them. (Only types also read in the browser live here) Each
 * component applies settings differently.
 * - bot: reasoner sandbox (a new container per request) settings. Applied by
 *   restarting the bot.
 * - proxy: egress allowlist. Applied by restarting egress-proxy.
 * - broker: ops-broker settings (SSH, k8s, files, GitHub, Jira). Applied by
 *   recreating the broker.
 */
export type SandboxComponent = 'bot' | 'proxy' | 'broker'

export interface ContainerState {
  service: 'egress-proxy' | 'ops-broker'
  /**
   * docker state such as running or exited. missing if there is no container
   */
  state: string
  startedAt?: string
}

export interface BrokerHealth {
  sshHosts: number
  k8s: string[]
  fs?: string
  git: boolean
  github: string[]
  jira: string[]
}

export interface SandboxCheck {
  label: string
  ok: boolean
  detail?: string
  /** The reasoner's login, which both sandboxes take (the rest: the broker) */
  login?: boolean
}

export interface PendingApply {
  component: SandboxComponent
  reason: string
}

export interface SandboxStatus {
  checkedAt: string
  docker: { ok: boolean; version?: string; error?: string }
  images: {
    name: string
    purpose: string
    present: boolean
    createdAt?: string
  }[]
  containers: ContainerState[]
  broker?: BrokerHealth
  /** Credentials and generated file status (values are not sent) */
  checks: SandboxCheck[]
  /** Components whose changed settings are not applied yet */
  pending: PendingApply[]
  allowlist: { file: string; domains: string[]; required: string[] }
  /**
   * Number of requests the bot is handling. If not 0, proxy/broker restarts are
   * blocked.
   */
  activeRequests: number
  /** The built-in VM sandbox, when it is the run environment */
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
}

export interface AllowlistIssue {
  domain?: string
  message: string
}

export type SandboxJobKind = 'proxy' | 'broker' | 'images' | 'kubeconfig' | 'vm'

export const SANDBOX_JOBS: Record<
  SandboxJobKind,
  { label: string; script: string; help: string }
> = {
  proxy: {
    label: 'Restart proxy',
    script: 'sandbox:up',
    help: 'Reloads the allowed domains list.',
  },
  broker: {
    label: 'Recreate broker',
    script: 'sandbox:ops-up',
    help: 'Fetches the host list and GitHub token again, then rebuilds the image and starts it.',
  },
  images: {
    label: 'Build sandbox images',
    script: 'sandbox:build',
    help: 'Rebuilds the reasoner and diagram (renderer) images. Used from the next request.',
  },
  kubeconfig: {
    label: 'Rebuild kubeconfig',
    script: 'k8s:kubeconfig',
    help: 'Builds the broker kubeconfig from the read-only SA token. Recreate the broker afterward.',
  },
  vm: {
    label: 'Set up built-in sandbox',
    script: 'sandbox:vm',
    help: 'Fetches the Linux kernel the first time, then builds the reasoner image in a VM. Run it again to update the CLIs.',
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
