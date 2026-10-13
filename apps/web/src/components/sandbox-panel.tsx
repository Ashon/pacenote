import {
  SANDBOX_JOBS,
  type AllowlistIssue,
  type PendingApply,
  type SandboxCheck,
  type SandboxComponent,
  type SandboxJob,
  type SandboxJobKind,
  type SandboxStatus,
} from '@src/sandbox/types'
import {
  CircleCheck,
  CircleX,
  Lock,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { botControl, useSupervisor, type useSandbox } from '@/lib/desktop'
import { formatDuration, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

type Sandbox = ReturnType<typeof useSandbox>

export const APPLY_LABEL: Record<SandboxComponent, string> = {
  bot: 'Restart Pace',
  proxy: 'Restart proxy',
  broker: 'Recreate broker',
}

function Card({
  title,
  help,
  action,
  children,
}: {
  title: string
  help?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="surface-group">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {help && (
            <div className="mt-0.5 text-xs text-muted-foreground">{help}</div>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

const Dot = ({ ok, warn }: { ok: boolean; warn?: boolean }) => (
  <span
    className={cn(
      'inline-block size-2 shrink-0 rounded-full',
      ok
        ? 'bg-status-succeeded'
        : warn
          ? 'bg-status-interrupted'
          : 'bg-status-failed'
    )}
  />
)

const REASONER_IMAGE = 'pacenote-reasoner:latest'
const BROKER_IMAGE = 'pacenote-ops-broker:latest'

/** Restarting the proxy or the broker cuts off the tool calls in progress. */
const disruptive = (kind: SandboxJobKind) =>
  kind === 'proxy' || kind === 'broker'

/**
 * A sandbox job's button, named after the job. One job runs at a time, and the
 * proxy and broker wait for the requests in progress.
 */
export function JobButton({
  sandbox,
  kind,
  primary,
}: {
  sandbox: Sandbox
  kind: SandboxJobKind
  /** The next step to take, rather than one to run again */
  primary?: boolean
}) {
  const { job, run, status } = sandbox
  const running = job?.state === 'running'
  const active = status?.activeRequests ?? 0
  const waiting = disruptive(kind) && active > 0
  return (
    <Button
      size="xs"
      variant={primary ? 'default' : 'outline'}
      disabled={running || waiting}
      title={
        waiting
          ? `Available after ${active} active ${active === 1 ? 'request finishes' : 'requests finish'}`
          : `${SANDBOX_JOBS[kind].help} From the repository: pnpm ${SANDBOX_JOBS[kind].script}`
      }
      onClick={() => run(kind)}
    >
      {running && job?.kind === kind && (
        <LoaderCircle className="animate-spin" />
      )}
      {SANDBOX_JOBS[kind].label}
    </Button>
  )
}

/** Whether something is ready, being set up, or still needs a step */
function Readiness({
  busy,
  ready,
  busyText,
  needs,
}: {
  busy: boolean
  ready: boolean
  busyText: string
  needs: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {busy ? (
        <LoaderCircle className="size-3 shrink-0 animate-spin text-status-running" />
      ) : (
        <Dot ok={ready} warn />
      )}
      {busy ? busyText : ready ? 'Ready' : needs}
    </span>
  )
}

/**
 * Under the built-in sandbox's choice: whether it is ready, and the job that
 * sets it up, so it can be set up before it is chosen
 */
export function VmFooter({ sandbox }: { sandbox: Sandbox }) {
  const { status, job } = sandbox
  const vm = status?.vm
  if (!status) return <span className="text-muted-foreground">Checking</span>
  if (!vm) return null
  if (vm.unsupported)
    return (
      <span className="text-muted-foreground">Not available on this Mac</span>
    )
  if (!vm.helper.ok)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Dot ok={false} />
        <span className="truncate" title={vm.helper.error}>
          pacenote-vm did not answer
        </span>
      </span>
    )
  const ready = vm.kernel && vm.initfs && Boolean(vm.image)
  return (
    <>
      <Readiness
        busy={job?.state === 'running' && job.kind === 'vm'}
        ready={ready}
        busyText="Setting up"
        needs="Needs setup"
      />
      <span className="ml-auto">
        <JobButton sandbox={sandbox} kind="vm" primary={!ready} />
      </span>
    </>
  )
}

/**
 * Under the Docker sandbox's choice: whether Docker runs it, and the next job
 * it needs (its images, then the proxy)
 */
export function DockerFooter({ sandbox }: { sandbox: Sandbox }) {
  const { status, job } = sandbox
  if (!status) return <span className="text-muted-foreground">Checking</span>
  if (!status.docker.ok)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Dot ok={false} />
        <span className="truncate" title={status.docker.error}>
          Docker is not running
        </span>
      </span>
    )
  const imageMissing = !status.images.find(
    (image) => image.name === REASONER_IMAGE
  )?.present
  const proxyDown =
    status.containers.find((c) => c.service === 'egress-proxy')?.state !==
    'running'
  const next: SandboxJobKind = !imageMissing && proxyDown ? 'proxy' : 'images'
  return (
    <>
      <Readiness
        busy={
          job?.state === 'running' &&
          (job.kind === 'images' || job.kind === 'proxy')
        }
        ready={!imageMissing && !proxyDown}
        busyText={SANDBOX_JOBS[job?.kind ?? 'images'].label}
        needs={imageMissing ? 'Images not built' : 'Proxy not running'}
      />
      <span className="ml-auto">
        <JobButton
          sandbox={sandbox}
          kind={next}
          primary={imageMissing || proxyDown}
        />
      </span>
    </>
  )
}

/**
 * Under the run environment choice: the output of the job that sets a sandbox
 * up, then what the chosen sandbox has ready
 */
export function EnvironmentDetails({
  sandbox,
  chosen,
}: {
  sandbox: Sandbox
  chosen?: 'vm' | 'docker'
}) {
  const { status, loading, refresh } = sandbox
  const vm = status?.vm
  return (
    <>
      <JobLog sandbox={sandbox} kinds={['vm', 'images']} className="mt-3" />
      {chosen && status && (chosen === 'docker' || vm) && (
        <div className="mt-3 overflow-hidden rounded-lg bg-well">
          <div className="flex items-center gap-2 py-1 pr-1.5 pl-4 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">
              {chosen === 'vm' ? 'Built-in sandbox' : 'Docker sandbox'} on this
              Mac, checked {formatRelative(status.checkedAt)}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6"
              onClick={refresh}
              disabled={loading}
              aria-label="Check again"
              title="Check again"
            >
              <RefreshCw className={cn(loading && 'animate-spin')} />
            </Button>
          </div>
          <div className="divide-y divide-card border-t border-card">
            {chosen === 'vm' && vm ? (
              vm.unsupported ? (
                <Line label="This Mac">
                  <Dot ok={false} />
                  {vm.unsupported}
                </Line>
              ) : (
                <>
                  <Line label="Linux kernel">
                    <Dot ok={vm.kernel} warn />
                    {vm.kernel
                      ? 'Ready'
                      : 'Not downloaded yet (about 290 MB, once)'}
                  </Line>
                  <Line label="Init filesystem">
                    <Dot ok={vm.initfs} warn />
                    {vm.initfs ? 'Ready' : 'Not prepared yet'}
                  </Line>
                  <Line label="Reasoner image">
                    <Dot ok={Boolean(vm.image)} warn />
                    {vm.image
                      ? `Built ${formatRelative(vm.image.createdAt)} on ${vm.image.base}`
                      : 'Not built yet'}
                  </Line>
                  <Line label="pacenote-vm">
                    <Dot ok={vm.helper.ok} />
                    <span className="break-all select-text">
                      {vm.helper.ok ? vm.helper.path : vm.helper.error}
                    </span>
                  </Line>
                </>
              )
            ) : (
              <>
                <Line label="Docker">
                  <Dot ok={status.docker.ok} />
                  {status.docker.ok
                    ? `Engine ${status.docker.version}`
                    : (status.docker.error ?? 'Unavailable')}
                </Line>
                <Line label="Images">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {status.images
                      .filter(
                        (image) =>
                          image.name === REASONER_IMAGE ||
                          image.name === 'pacenote-renderer:latest'
                      )
                      .map((image) => (
                        <span
                          key={image.name}
                          className="flex items-center gap-1.5"
                          title={image.purpose}
                        >
                          <Dot ok={image.present} />
                          {image.name.replace(/^pacenote-|:latest$/g, '')}
                          {image.createdAt && (
                            <span className="text-muted-foreground">
                              (built {formatRelative(image.createdAt)})
                            </span>
                          )}
                        </span>
                      ))}
                  </div>
                </Line>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** A check's result as a line: a credential, a file, a login */
function CheckLine({ check }: { check: SandboxCheck }) {
  return (
    <Line label={check.label}>
      {check.ok ? (
        <CircleCheck className="size-3.5 shrink-0 text-status-succeeded" />
      ) : (
        <CircleX className="size-3.5 shrink-0 text-status-failed" />
      )}
      <span className={cn('break-all', !check.ok && 'text-status-failed')}>
        <span className="select-text">{check.detail}</span>
      </span>
    </Line>
  )
}

/** Whether the sandbox has the reasoner's login, under where it is set */
export function LoginChecks({ sandbox }: { sandbox: Sandbox }) {
  const checks = sandbox.status?.checks.filter((check) => check.login) ?? []
  if (checks.length === 0) return null
  return (
    <div className="divide-y divide-border border-t border-border">
      {checks.map((check) => (
        <CheckLine key={check.label} check={check} />
      ))}
    </div>
  )
}

/**
 * The ops broker: what it has and still needs, and the jobs that prepare it
 */
export function BrokerCard({
  sandbox,
  builtIn,
}: {
  sandbox: Sandbox
  builtIn: boolean
}) {
  const { status, loading, refresh } = sandbox
  const pending =
    status?.pending.filter((item) => item.component === 'broker') ?? []
  const container = status?.containers.find((c) => c.service === 'ops-broker')
  const image = status?.images.find((item) => item.name === BROKER_IMAGE)
  const checks = status?.checks.filter((check) => !check.login) ?? []
  const kinds: SandboxJobKind[] = ['kubeconfig', 'broker']
  return (
    <Card
      title="Broker"
      help={
        builtIn
          ? 'Runs the tools with your credentials, in a VM of its own that starts with Pace.'
          : 'Runs the tools with your credentials, in a container beside the egress proxy.'
      }
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
      }
    >
      <div className="divide-y divide-border">
        {!builtIn && pending.length > 0 && (
          <PendingList pending={pending} sandbox={sandbox} />
        )}
        {!builtIn && container && (
          <Line label="Container">
            <Dot
              ok={container.state === 'running'}
              warn={container.state === 'missing'}
            />
            {container.state === 'running'
              ? `Running${container.startedAt ? `, up ${formatDuration(Date.now() - Date.parse(container.startedAt))}` : ''}`
              : container.state === 'missing'
                ? 'Not created yet'
                : container.state}
            {image?.createdAt && (
              <span className="text-muted-foreground">
                (image built {formatRelative(image.createdAt)})
              </span>
            )}
          </Line>
        )}
        {!builtIn && status?.broker && (
          <Line label="Tools">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <Dot ok={status.broker.sshHosts > 0} warn />
                {status.broker.sshHosts > 0
                  ? `${status.broker.sshHosts} SSH ${status.broker.sshHosts === 1 ? 'host' : 'hosts'}`
                  : 'SSH off'}
              </span>
              <span className="flex items-center gap-1.5">
                <Dot ok={status.broker.k8s.length > 0} warn />
                k8s{' '}
                {status.broker.k8s.length
                  ? status.broker.k8s.join(', ')
                  : 'off'}
              </span>
              <span className="flex items-center gap-1.5">
                <Dot ok={Boolean(status.broker.fs)} warn />
                Files {status.broker.fs ? 'on' : 'off'}
              </span>
              <span className="flex items-center gap-1.5">
                <Dot ok={status.broker.github.length > 0} warn />
                GitHub{' '}
                {status.broker.github.length
                  ? status.broker.github.join(', ')
                  : 'off'}
              </span>
              <span className="flex items-center gap-1.5">
                <Dot ok={status.broker.git} warn />
                PR {status.broker.git ? 'on' : 'off'}
              </span>
              <span className="flex items-center gap-1.5">
                <Dot ok={status.broker.jira.length > 0} warn />
                Jira{' '}
                {status.broker.jira.length
                  ? status.broker.jira.join(', ')
                  : 'off'}
              </span>
            </div>
          </Line>
        )}
        {checks.map((check) => (
          <CheckLine key={check.label} check={check} />
        ))}
        {kinds
          // The pending list above has the broker's own button.
          .filter(
            (kind) => kind !== 'broker' || builtIn || pending.length === 0
          )
          .map((kind) => (
            <div key={kind} className="flex items-center gap-3 px-4 py-2.5">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {SANDBOX_JOBS[kind].help}
              </p>
              <JobButton sandbox={sandbox} kind={kind} />
            </div>
          ))}
      </div>
      <JobLog
        sandbox={sandbox}
        kinds={kinds}
        className="border-t border-border px-4 py-3"
      />
    </Card>
  )
}

function Line({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-xs">
      <span className="w-28 shrink-0 font-medium">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  )
}

/**
 * Settings changed since a component started, with the button that applies them
 */
export function PendingList({
  pending,
  sandbox,
}: {
  pending: PendingApply[]
  sandbox: Sandbox
}) {
  const supervisor = useSupervisor()
  const components = [...new Set(pending.map((item) => item.component))]
  const busy = sandbox.job?.state === 'running'
  const active = sandbox.status?.activeRequests ?? 0
  const apply = (component: SandboxComponent) => {
    if (component === 'bot') {
      const live =
        supervisor?.phase === 'running' || supervisor?.phase === 'starting'
      void (live ? botControl()?.restart() : botControl()?.start())
      setTimeout(sandbox.refresh, 4_000)
    } else {
      sandbox.run(component)
    }
  }
  return (
    <div className="space-y-2 bg-status-interrupted/8 px-4 py-3">
      {components.map((component) => (
        <div key={component} className="flex items-start gap-3 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-interrupted" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-status-interrupted">
              {APPLY_LABEL[component]} needed
            </p>
            <ul className="mt-0.5 text-muted-foreground">
              {pending
                .filter((item) => item.component === component)
                .map((item) => (
                  <li key={item.reason}>{item.reason}</li>
                ))}
            </ul>
          </div>
          {component === 'bot' && supervisor?.phase === 'external' ? (
            <span className="text-muted-foreground">
              Restart Pace in the terminal yourself
            </span>
          ) : (
            <Button
              size="xs"
              variant="outline"
              disabled={
                busy ||
                (component !== 'bot' && active > 0) ||
                (component === 'bot' && !supervisor)
              }
              onClick={() => apply(component)}
              title={
                component !== 'bot' && active > 0
                  ? `Available after ${active} active ${active === 1 ? 'request finishes' : 'requests finish'}`
                  : undefined
              }
            >
              {APPLY_LABEL[component]}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Edits the domains allowed for outbound access */
export function AllowlistCard({
  sandbox,
  builtIn,
}: {
  sandbox: Sandbox
  /**
   * The built-in sandbox reads the list on every request; Docker's proxy only
   * when it restarts.
   */
  builtIn?: boolean
}) {
  const status = sandbox.status
  const saved = status?.allowlist.domains ?? []
  const required = status?.allowlist.required ?? []
  const [draft, setDraft] = useState<string[]>()
  const [input, setInput] = useState('')
  const [issues, setIssues] = useState<AllowlistIssue[]>([])
  const [notice, setNotice] = useState<string>()
  const domains = draft ?? saved
  const dirty =
    draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved)
  // Docker's proxy applies the list when it restarts: its state and the
  // restart sit with the list.
  const proxy = builtIn
    ? undefined
    : status?.containers.find((c) => c.service === 'egress-proxy')
  const proxyPending = builtIn
    ? []
    : (status?.pending.filter((item) => item.component === 'proxy') ?? [])

  const add = () => {
    const domain = input.trim().toLowerCase().replace(/\.$/, '')
    if (!domain || domains.includes(domain)) return
    setDraft([...domains, domain])
    setInput('')
  }
  const save = () => {
    void window.pacenoteDesktop?.sandbox
      .saveAllowlist(domains)
      .then((found) => {
        setIssues(found)
        if (found.length === 0) {
          setDraft(undefined)
          setNotice(
            builtIn
              ? 'Saved. The next request uses it.'
              : 'Saved. Restart the proxy to apply.'
          )
          sandbox.refresh()
        }
      })
  }

  return (
    <Card
      title="Allowed outbound domains"
      help={
        <>
          Domains the reasoner sandbox can reach directly through the proxy.
          Only HTTPS (443) and only exact name matches are allowed.{' '}
          {builtIn
            ? 'The next request uses the saved list.'
            : 'The proxy applies the list when it restarts.'}
        </>
      }
      action={
        builtIn ? undefined : (
          <JobButton
            sandbox={sandbox}
            kind="proxy"
            primary={proxyPending.length > 0}
          />
        )
      }
    >
      {proxy && (
        <div className="space-y-1 border-b border-border px-4 py-2.5 text-xs">
          <p className="flex items-center gap-1.5">
            <Dot ok={proxy.state === 'running'} warn />
            <span className="font-medium">Proxy</span>
            <span className="text-muted-foreground">
              {proxy.state === 'running'
                ? `running${proxy.startedAt ? `, up ${formatDuration(Date.now() - Date.parse(proxy.startedAt))}` : ''}`
                : proxy.state === 'missing'
                  ? 'not running'
                  : proxy.state}
            </span>
          </p>
          {proxyPending.map((item) => (
            <p
              key={item.reason}
              className="flex items-start gap-1.5 text-status-interrupted"
            >
              <TriangleAlert className="mt-px size-3 shrink-0" />
              {item.reason}
            </p>
          ))}
          <JobLog sandbox={sandbox} kinds={['proxy']} className="pt-1.5" />
        </div>
      )}
      <div className="space-y-3 px-4 py-3">
        <p className="flex items-start gap-1.5 rounded-lg bg-status-interrupted/10 px-3 py-2 text-xs text-status-interrupted">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          Opening a domain lets the reasoner sandbox send data there directly.
          For internal systems that need tokens (GitHub etc.), connect them as
          ops-broker tools instead of opening the domain. (The tokens stay out
          of the sandbox)
        </p>
        <ul className="divide-y divide-card overflow-hidden rounded-lg bg-well">
          {domains.map((domain) => {
            const isRequired = required.includes(domain)
            const issue = issues.find((item) => item.domain === domain)
            return (
              <li
                key={domain}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <span className="font-mono select-text">{domain}</span>
                {isRequired && (
                  <span className="flex items-center gap-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                    <Lock className="size-2.5" />
                    Needed by reasoner CLI
                  </span>
                )}
                {!saved.includes(domain) && (
                  <span className="text-[10px] text-primary">Added</span>
                )}
                {issue && (
                  <span className="text-status-failed">{issue.message}</span>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ml-auto size-6"
                  disabled={isRequired}
                  aria-label={`Remove ${domain}`}
                  onClick={() =>
                    setDraft(domains.filter((item) => item !== domain))
                  }
                >
                  <X />
                </Button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="api.example.com"
            className="h-7 w-72 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={add}
            disabled={!input.trim()}
          >
            <Plus />
            Add
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => (setDraft(undefined), setIssues([]))}
              >
                <RotateCcw />
                Revert
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty}>
              <Save />
              Save
            </Button>
          </div>
        </div>
        {issues.some((item) => !domains.includes(item.domain ?? '')) && (
          <ul className="text-xs text-status-failed">
            {issues
              .filter((item) => !domains.includes(item.domain ?? ''))
              .map((item) => (
                <li key={`${item.domain}-${item.message}`}>
                  {item.domain}: {item.message}
                </li>
              ))}
          </ul>
        )}
        {notice && !dirty && (
          <p className="text-xs text-status-interrupted">{notice}</p>
        )}
      </div>
    </Card>
  )
}

/** The output of the last of these jobs, or why one of them could not start */
export function JobLog({
  sandbox,
  kinds,
  className,
}: {
  sandbox: Sandbox
  kinds: SandboxJobKind[]
  className?: string
}) {
  const { job, error } = sandbox
  const output = useRef<HTMLPreElement>(null)
  const shown = job && kinds.includes(job.kind) ? job : undefined
  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [shown?.output.length])
  const failed = error && kinds.includes(error.kind) ? error.message : undefined
  if (!shown && !failed) return null
  return (
    <div className={cn('space-y-2', className)}>
      {failed && <p className="text-xs text-status-failed">{failed}</p>}
      {shown && <JobOutput job={shown} outputRef={output} />}
    </div>
  )
}

function JobOutput({
  job,
  outputRef,
}: {
  job: SandboxJob
  outputRef: React.RefObject<HTMLPreElement | null>
}) {
  const elapsed =
    (job.finishedAt ? Date.parse(job.finishedAt) : Date.now()) -
    Date.parse(job.startedAt)
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs">
        {job.state === 'running' ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-status-running" />
        ) : job.state === 'succeeded' ? (
          <CircleCheck className="size-3.5 shrink-0 text-status-succeeded" />
        ) : (
          <CircleX className="size-3.5 shrink-0 text-status-failed" />
        )}
        <span className="font-medium">{SANDBOX_JOBS[job.kind].label}</span>
        <span className="text-muted-foreground">
          {job.state === 'running'
            ? 'running'
            : job.state === 'succeeded'
              ? 'succeeded'
              : `failed (code ${job.exitCode ?? '?'})`}
          , {formatDuration(elapsed)}
        </span>
      </div>
      <pre
        ref={outputRef}
        className="select-text max-h-64 overflow-auto rounded-lg bg-well px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words"
      >
        {job.output.join('\n')}
      </pre>
    </div>
  )
}

export type { SandboxStatus }
