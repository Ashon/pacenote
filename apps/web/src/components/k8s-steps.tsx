import {
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  ExternalLink,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { botControl, useSandbox, useSupervisor } from '@/lib/desktop'
import { useFound } from '@/lib/found'
import { useText } from '@/lib/i18n'
import { useK8sAccounts, useK8sConnected } from '@/lib/k8s'
import { cn } from '@/lib/utils'
import {
  accountManifest,
  tokenSecret,
  type K8sAccount,
  type K8sConnected,
  type K8sContextCheck,
} from '@src/sandbox/k8s-account'
import { CodeBlock, CopyButton } from './code-block'
import { text } from './k8s-steps.text'

type Sandbox = ReturnType<typeof useSandbox>

/**
 * Settings > Tools > Kubernetes, as three steps under its settings: the
 * clusters picked above; each one's read-only account (sandbox/k8s/
 * pacenote-ro.yaml), made here with your access when you may, or copied for
 * the cluster's admin; and what Pace's broker reads with once the settings
 * are saved, asked with the accounts' own tokens (reads, no secrets, no
 * changes). Only on the Mac itself: it runs your kubectl.
 */
export function K8sSteps({
  contexts,
  account,
  pending,
  ready,
  workFolder,
  sandbox,
}: {
  /** The contexts picked, as the draft has them */
  contexts: string[]
  account: K8sAccount
  /** Kubernetes' settings have changes not saved yet */
  pending: boolean
  /** Tools, the built-in sandbox and Kubernetes' Read are on */
  ready: boolean
  /** For the names this Mac found (whether kubectl is here) */
  workFolder: string
  sandbox: Sandbox
}) {
  const t = useText(text)
  const found = useFound(workFolder)
  const gap = found.data?.gaps.includes('noKubectl') ?? false
  const accounts = useK8sAccounts(contexts, account, !gap)
  // Found missing by the names' lookup or by the accounts' own
  const noKubectl =
    gap || accounts.checks.some((each) => each.state === 'noKubectl')
  const allReady =
    contexts.length > 0 &&
    accounts.checks.length === contexts.length &&
    accounts.checks.every((each) => each.state === 'ready')
  return (
    <section
      className="mx-4 mb-3 overflow-hidden rounded-lg border border-border bg-card"
      data-k8s-steps
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h4 className="text-row">{t.title}</h4>
          <p className="mt-0.5 text-meta text-muted-foreground">{t.lede}</p>
        </div>
        <Button size="xs" variant="ghost" asChild>
          <a href={t.guideUrl} target="_blank" rel="noreferrer">
            {t.guide}
            <ExternalLink />
          </a>
        </Button>
      </header>
      <ol className="divide-y divide-border">
        <Step n={1} title={t.step.contexts} done={contexts.length > 0}>
          {noKubectl ? (
            <Command
              says={t.contexts.noKubectl}
              command="brew install kubectl"
              warn
            />
          ) : (
            <p className="text-meta text-muted-foreground">
              {contexts.length === 0
                ? t.contexts.none
                : t.contexts.picked(contexts.length)}
            </p>
          )}
        </Step>
        <Step
          n={2}
          title={t.step.accounts}
          done={allReady}
          action={
            contexts.length > 0 &&
            !noKubectl && (
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                disabled={accounts.checking}
                onClick={accounts.checkAgain}
              >
                <RotateCw className={cn(accounts.checking && 'animate-spin')} />
                {t.checkAgain}
              </Button>
            )
          }
        >
          {contexts.length > 0 && !noKubectl && (
            <ul className="space-y-2">
              {contexts.map((context) => (
                <AccountLine
                  key={context}
                  check={accounts.checks.find(
                    (each) => each.context === context
                  )}
                  context={context}
                  account={account}
                  making={accounts.making === context}
                  onMake={() => void accounts.create(context)}
                />
              ))}
            </ul>
          )}
          <WhatItIs account={account} />
        </Step>
        <Step n={3} title={t.step.connect} done={false}>
          <Connect
            contexts={contexts}
            account={account}
            pending={pending}
            ready={ready}
            checks={accounts.checks}
            sandbox={sandbox}
          />
        </Step>
      </ol>
    </section>
  )
}

function Step({
  n,
  title,
  done,
  action,
  children,
}: {
  n: number
  title: string
  done: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-3 px-4 py-3" data-k8s-step={n}>
      <span
        className={cn(
          'mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-caption tabular-nums transition-colors',
          done
            ? 'bg-primary text-primary-foreground'
            : 'border border-border text-muted-foreground'
        )}
        aria-hidden
      >
        {done ? <Check className="size-3" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-row">{title}</p>
          {action}
        </div>
        {children}
      </div>
    </li>
  )
}

/** One cluster's account: its state, and what to do about it */
function AccountLine({
  check,
  context,
  account,
  making,
  onMake,
}: {
  check: K8sContextCheck | undefined
  context: string
  account: K8sAccount
  making: boolean
  onMake: () => void
}) {
  const t = useText(text)
  const [asking, setAsking] = useState(false)
  const [admin, setAdmin] = useState(false)
  const state = check?.state
  const ok = state === 'ready'
  const absent = state === 'missing' || state === 'forbidden'
  const canMake = state === 'missing' && check?.canCreate === true
  return (
    <li className="space-y-1.5" data-k8s-account={context}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate font-mono text-meta">{context}</span>
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 text-meta',
            !check
              ? 'text-muted-foreground'
              : ok
                ? 'text-status-succeeded'
                : 'text-status-interrupted'
          )}
        >
          {!check || making ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin text-status-running" />
          ) : ok ? (
            <CircleCheck className="size-3 shrink-0" />
          ) : (
            <TriangleAlert className="size-3 shrink-0" />
          )}
          <span className="truncate" title={check?.detail}>
            {making ? t.making : check ? t.state[check.state] : ''}
          </span>
        </span>
        {canMake && !asking && !making && (
          <Button size="xs" onClick={() => setAsking(true)}>
            {t.make}
          </Button>
        )}
        {absent && (
          <Button
            size="xs"
            variant={canMake ? 'ghost' : 'outline'}
            aria-expanded={admin}
            onClick={() => setAdmin(!admin)}
          >
            {t.forAdmin}
            <ChevronRight
              className={cn('transition-transform', admin && 'rotate-90')}
            />
          </Button>
        )}
      </div>
      {asking && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md bg-well px-3 py-2 text-meta"
          data-k8s-ask
        >
          <span className="min-w-0 flex-1">
            {t.makeAsk(
              context,
              `${account.namespace}/${account.serviceAccount}`
            )}
          </span>
          <Button
            size="xs"
            onClick={() => {
              setAsking(false)
              onMake()
            }}
          >
            {t.makeYes}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setAsking(false)}>
            {t.cancel}
          </Button>
        </div>
      )}
      {absent && !canMake && !admin && (
        <p className="text-meta text-muted-foreground">{t.cannotMake}</p>
      )}
      {state === 'signIn' && (
        <Command
          says={t.signInHint}
          command={`kubectl --context ${context} get namespaces`}
        />
      )}
      {state === 'unreachable' && (
        <p className="text-meta text-muted-foreground">{t.unreachableHint}</p>
      )}
      {(state === 'failed' || state === 'unreachable') && check?.detail && (
        <p className="font-mono text-caption break-all text-muted-foreground select-text">
          {check.detail}
        </p>
      )}
      {admin && (
        <div className="space-y-1.5">
          <p className="text-meta text-muted-foreground">
            {t.adminAsk}{' '}
            {check?.user
              ? t.adminReader(check.user)
              : t.adminNoReader(`${account.namespace}/${tokenSecret(account)}`)}
          </p>
          <CodeBlock
            code={accountManifest(account, { reader: check?.user })}
            maxHeight="max-h-56"
          />
        </div>
      )}
    </li>
  )
}

/** The account's manifest, to read before making it */
function WhatItIs({ account }: { account: K8sAccount }) {
  const t = useText(text)
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
        {t.whatItIs}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 pt-1.5">
        <p className="text-meta text-muted-foreground">{t.whatItIsHelp}</p>
        <CodeBlock code={accountManifest(account)} maxHeight="max-h-56" />
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Step 3: what Pace's broker reads with. Saving Kubernetes' settings restarts
 * Pace, which builds its kubeconfig from the accounts; a cluster left out
 * then (no account yet) joins on Connect again.
 */
function Connect({
  contexts,
  account,
  pending,
  ready,
  checks,
  sandbox,
}: {
  contexts: string[]
  account: K8sAccount
  pending: boolean
  ready: boolean
  checks: K8sContextCheck[]
  sandbox: Sandbox
}) {
  const t = useText(text)
  const supervisor = useSupervisor()
  const live =
    supervisor?.phase === 'running' || supervisor?.phase === 'starting'
  const { connected, checking, checkAgain } = useK8sConnected(
    ready && !pending && contexts.length > 0
  )
  // Asked again once Pace has started or the kubeconfig job has ended
  const job = sandbox.job?.kind === 'kubeconfig' ? sandbox.job.state : undefined
  useEffect(() => {
    if (ready && !pending && (supervisor?.phase === 'running' || job))
      checkAgain()
  }, [supervisor?.phase, job])

  if (!ready) return <Note>{t.connect.off}</Note>
  if (contexts.length === 0) return null
  if (pending) return <Note>{t.connect.save}</Note>
  const build = connected?.build
  const current = Boolean(
    build &&
    sameList(build.contexts, contexts) &&
    build.serviceAccount === account.serviceAccount &&
    build.namespace === account.namespace
  )
  const lines = (connected?.contexts ?? []).filter((each) =>
    contexts.includes(each.context)
  )
  const left = current ? (build?.failed ?? []) : []
  // A cluster left out whose account is ready now, or a build for other
  // settings: Pace builds it again when it starts.
  const again =
    !current ||
    left.some((each) =>
      checks.some((c) => c.context === each.context && c.state === 'ready')
    )
  const connect = () => {
    if (live) void botControl()?.restart()
    else sandbox.run('kubeconfig')
  }
  const busy =
    supervisor?.phase === 'starting' ||
    (sandbox.job?.kind === 'kubeconfig' && sandbox.job.state === 'running')
  return (
    <div className="space-y-2">
      {lines.length > 0 && (
        <ul className="space-y-1.5">
          {lines.map((line) => (
            <ConnectedLine key={line.context} line={line} />
          ))}
        </ul>
      )}
      {left.map((each) => (
        <div
          key={each.context}
          className="flex flex-wrap items-center gap-x-2 text-meta"
          data-k8s-left={each.context}
        >
          <span className="font-mono">{each.context}</span>
          <span className="text-status-interrupted">
            {t.connect.leftOut} · {t.state[each.state]}
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {!current && <Note>{t.connect.next}</Note>}
        <span className="flex-1" />
        {again && (
          <Button size="xs" variant="outline" disabled={busy} onClick={connect}>
            {busy && <LoaderCircle className="animate-spin" />}
            {t.connect.again}
          </Button>
        )}
        {lines.length > 0 && (
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            disabled={checking}
            onClick={checkAgain}
          >
            <RotateCw className={cn(checking && 'animate-spin')} />
            {t.checkAgain}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * A cluster Pace reads: that it reads, and that it reads no secrets and
 * changes nothing
 */
function ConnectedLine({ line }: { line: K8sConnected['contexts'][number] }) {
  const t = useText(text)
  const tooMuch = line.secrets === true || line.changes === true
  return (
    <li className="space-y-1" data-k8s-connected={line.context}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 truncate font-mono text-meta">
          {line.context}
        </span>
        <Mark
          good={line.reads}
          yes={t.connect.reads}
          no={t.connect.cannotRead}
          unknown={t.connect.unknown}
        />
        <Mark
          good={line.secrets === undefined ? undefined : !line.secrets}
          yes={t.connect.noSecrets}
          no={t.connect.secrets}
          unknown={t.connect.unknown}
        />
        <Mark
          good={line.changes === undefined ? undefined : !line.changes}
          yes={t.connect.noChanges}
          no={t.connect.changes}
          unknown={t.connect.unknown}
        />
      </div>
      {tooMuch && (
        <p className="text-meta text-status-failed">{t.connect.tooMuch}</p>
      )}
      {line.detail && (
        <p className="font-mono text-caption break-all text-muted-foreground select-text">
          {line.detail}
        </p>
      )}
    </li>
  )
}

function Mark({
  good,
  yes,
  no,
  unknown,
}: {
  good: boolean | undefined
  yes: string
  no: string
  unknown: string
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-meta',
        good === undefined
          ? 'text-muted-foreground'
          : good
            ? 'text-status-succeeded'
            : 'text-status-failed'
      )}
    >
      {good === false ? (
        <CircleX className="size-3 shrink-0" />
      ) : (
        <CircleCheck
          className={cn('size-3 shrink-0', good === undefined && 'opacity-40')}
        />
      )}
      {good === undefined ? unknown : good ? yes : no}
    </span>
  )
}

/** A line to run in Terminal, with what it is for */
function Command({
  says,
  command,
  warn,
}: {
  says: string
  command: string
  warn?: boolean
}) {
  return (
    <div className="space-y-1">
      <p
        className={cn(
          'text-meta',
          warn ? 'text-status-interrupted' : 'text-muted-foreground'
        )}
      >
        {says}
      </p>
      <div className="flex items-center gap-1 rounded-md bg-well pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-meta select-text">
          {command}
        </code>
        <CopyButton text={command} />
      </div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-meta text-muted-foreground">{children}</p>
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n')
