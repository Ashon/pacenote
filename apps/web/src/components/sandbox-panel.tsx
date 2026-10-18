import {
  SANDBOX_JOBS,
  type AllowlistIssue,
  type PendingApply,
  type SandboxCheck,
  type SandboxJob,
  type SandboxJobKind,
  type SandboxStatus,
  type VmImageStatus,
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { botControl, useSupervisor, type useSandbox } from '@/lib/desktop'
import { formatDuration, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

type Sandbox = ReturnType<typeof useSandbox>

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
          <h3 className="text-section">{title}</h3>
          {help && (
            <div className="mt-0.5 text-meta text-muted-foreground">{help}</div>
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

/** A sandbox job's button, named after the job. One job runs at a time. */
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
  const { job, run } = sandbox
  const running = job?.state === 'running'
  return (
    <Button
      size="xs"
      variant={primary ? 'default' : 'outline'}
      disabled={running}
      title={`${SANDBOX_JOBS[kind].help} From the repository: pnpm ${SANDBOX_JOBS[kind].script}`}
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
  const set = vm.kernel && vm.initfs && Boolean(vm.image)
  // Images built for another version of Pacenote still run; the setup builds
  // them anew.
  const outdated = set && (vm.outdated ?? []).length > 0
  const ready = set && !outdated
  return (
    <>
      <Readiness
        busy={job?.state === 'running' && job.kind === 'vm'}
        ready={ready}
        busyText="Setting up"
        needs={outdated ? 'Update needed' : 'Needs setup'}
      />
      <span className="ml-auto">
        <JobButton sandbox={sandbox} kind="vm" primary={!ready} />
      </span>
    </>
  )
}

/**
 * Under the run environment choice: the output of the job that sets the
 * built-in sandbox up, then what it has ready once chosen
 */
export function EnvironmentDetails({
  sandbox,
  chosen,
}: {
  sandbox: Sandbox
  chosen: boolean
}) {
  const { status, loading, refresh } = sandbox
  const vm = status?.vm
  return (
    <>
      <JobLog sandbox={sandbox} kinds={['vm']} className="mt-3" />
      {chosen && status && vm && (
        <div className="mt-3 overflow-hidden rounded-lg bg-well">
          <div className="flex items-center gap-2 py-1 pr-1.5 pl-4 text-meta text-muted-foreground">
            <span className="min-w-0 flex-1">
              Built-in sandbox on this Mac, checked{' '}
              {formatRelative(status.checkedAt)}
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
            {vm.unsupported ? (
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
                    : 'Not downloaded yet (about 14 MB, once)'}
                </Line>
                <Line label="Init filesystem">
                  <Dot ok={vm.initfs} warn />
                  {vm.initfs ? 'Ready' : 'Not prepared yet'}
                </Line>
                <Line label="Reasoner image">
                  <Dot ok={Boolean(vm.image?.current)} warn />
                  {vm.image
                    ? `Built ${formatRelative(vm.image.createdAt)} on ${vm.image.base}${forAnother(vm.image)}`
                    : 'Not built yet'}
                </Line>
                <Line label="Diagram image">
                  <Dot ok={Boolean(vm.renderer?.current)} warn />
                  {vm.renderer
                    ? `Built ${formatRelative(vm.renderer.createdAt)}${forAnother(vm.renderer)}`
                    : 'Not built yet (with diagrams on, setup builds it)'}
                </Line>
                {vm.broker && (
                  <Line label="Broker image">
                    <Dot ok={vm.broker.current} warn />
                    {`Built ${formatRelative(vm.broker.createdAt)}${forAnother(vm.broker)}`}
                  </Line>
                )}
                <Line label="pacenote-vm">
                  <Dot ok={vm.helper.ok} />
                  <span className="break-all select-text">
                    {vm.helper.ok ? vm.helper.path : vm.helper.error}
                  </span>
                </Line>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** What a built image's line adds when another version of Pacenote built it */
function forAnother(image: VmImageStatus): string {
  return image.current
    ? ''
    : ', for another version of Pacenote: set up again to update it'
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

/** The ops broker: what it has and still needs, and the job that prepares it */
export function BrokerCard({ sandbox }: { sandbox: Sandbox }) {
  const { status, loading, refresh } = sandbox
  const checks = status?.checks.filter((check) => !check.login) ?? []
  const kinds: SandboxJobKind[] = ['kubeconfig']
  return (
    <Card
      title="Broker"
      help="Runs the tools with your credentials, in a VM of its own that starts with Pace. Its settings and files apply when Pace restarts."
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
        {checks.map((check) => (
          <CheckLine key={check.label} check={check} />
        ))}
        {kinds.map((kind) => (
          <div key={kind} className="flex items-center gap-3 px-4 py-2.5">
            <p className="min-w-0 flex-1 text-meta text-muted-foreground">
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
    <div className="flex items-start gap-3 px-4 py-2.5 text-meta">
      <span className="w-28 shrink-0 font-medium">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  )
}

/** Settings changed since Pace started, with the button that applies them */
export function PendingList({
  pending,
  sandbox,
}: {
  pending: PendingApply[]
  sandbox: Sandbox
}) {
  const supervisor = useSupervisor()
  const restart = () => {
    const live =
      supervisor?.phase === 'running' || supervisor?.phase === 'starting'
    void (live ? botControl()?.restart() : botControl()?.start())
    setTimeout(sandbox.refresh, 4_000)
  }
  if (pending.length === 0) return null
  return (
    <div className="flex items-start gap-3 bg-status-interrupted/8 px-4 py-3 text-meta">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-interrupted" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-status-interrupted">
          Restart Pace needed
        </p>
        <ul className="mt-0.5 text-muted-foreground">
          {pending.map((item) => (
            <li key={item.reason}>{item.reason}</li>
          ))}
        </ul>
      </div>
      {supervisor?.phase === 'external' ? (
        <span className="text-muted-foreground">
          Restart Pace in the terminal yourself
        </span>
      ) : (
        <Button
          size="xs"
          variant="outline"
          disabled={sandbox.job?.state === 'running' || !supervisor}
          onClick={restart}
        >
          Restart Pace
        </Button>
      )}
    </div>
  )
}

/** Edits the domains allowed for outbound access */
export function AllowlistCard({ sandbox }: { sandbox: Sandbox }) {
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
          setNotice('Saved. The next request uses it.')
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
          Only HTTPS (443) and only exact name matches are allowed. The next
          request uses the saved list.
        </>
      }
    >
      <div className="space-y-3 px-4 py-3">
        <p className="flex items-start gap-1.5 rounded-lg bg-status-interrupted/10 px-3 py-2 text-meta text-status-interrupted">
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
                className="flex items-center gap-2 px-3 py-1.5 text-meta"
              >
                <span className="font-mono select-text">{domain}</span>
                {isRequired && (
                  <span className="flex items-center gap-1 rounded-sm bg-muted px-1.5 text-caption text-muted-foreground">
                    <Lock className="size-2.5" />
                    Needed by reasoner CLI
                  </span>
                )}
                {!saved.includes(domain) && (
                  <span className="text-caption text-primary">Added</span>
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
            className="h-7 w-72 font-mono text-meta"
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
          <ul className="text-meta text-status-failed">
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
          <p className="text-meta text-status-interrupted">{notice}</p>
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
  const output = useRef<HTMLDivElement>(null)
  const shown = job && kinds.includes(job.kind) ? job : undefined
  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [shown?.output.length])
  const failed = error && kinds.includes(error.kind) ? error.message : undefined
  if (!shown && !failed) return null
  return (
    <div className={cn('space-y-2', className)}>
      {failed && <p className="text-meta text-status-failed">{failed}</p>}
      {shown && <JobOutput job={shown} outputRef={output} />}
    </div>
  )
}

function JobOutput({
  job,
  outputRef,
}: {
  job: SandboxJob
  outputRef: React.RefObject<HTMLDivElement | null>
}) {
  const elapsed =
    (job.finishedAt ? Date.parse(job.finishedAt) : Date.now()) -
    Date.parse(job.startedAt)
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-meta">
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
      <ScrollArea
        viewportRef={outputRef}
        className="rounded-lg bg-well"
        viewportClassName="max-h-64"
      >
        <pre className="select-text px-3 py-2 font-mono text-caption leading-relaxed whitespace-pre-wrap break-words">
          {job.output.join('\n')}
        </pre>
      </ScrollArea>
    </div>
  )
}

export type { SandboxStatus }
