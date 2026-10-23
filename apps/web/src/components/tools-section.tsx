import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  FolderGit2,
  Github,
  Globe,
  Lock,
  Server,
  ShipWheel,
  Ticket,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Swap, useFlash } from '@/components/ui/motion'
import type { useSandbox } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { SettingGroup, SettingGroupInfo } from '@src/settings/fields'
import {
  connectionStates,
  type ConnectionId,
  type ConnectionState,
} from '@src/settings/tools'
import { AllowlistCard, BrokerCard } from './sandbox-panel'
import { text } from './tools-section.text'

type Sandbox = ReturnType<typeof useSandbox>

const ICON: Record<ConnectionId, LucideIcon> = {
  files: FolderGit2,
  github: Github,
  jira: Ticket,
  k8s: ShipWheel,
  ssh: Server,
}

/** What each connection reaches, from its settings, for its row */
const SCOPE: Record<ConnectionId, (value: (key: string) => string) => string> =
  {
    files: (value) => value('OPS_FS_ROOT'),
    github: (value) => value('OPS_GIT_ALLOWED_OWNERS'),
    jira: (value) => value('OPS_JIRA_PROJECTS'),
    k8s: (value) => value('OPS_K8S_CONTEXTS'),
    ssh: (value) =>
      [value('OPS_SSH_USER'), value('OPS_SSH_ALLOWED_CIDR')]
        .filter(Boolean)
        .join(' · '),
  }

type Tone = 'ok' | 'warn' | 'off'

const TONE: Record<Tone, { text: string; dot: string }> = {
  ok: { text: 'text-status-succeeded', dot: 'bg-status-succeeded' },
  warn: { text: 'text-status-interrupted', dot: 'bg-status-interrupted' },
  off: { text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
}

/**
 * Settings > Tools: what Pace can reach when it answers, and what it may
 * change. A line on top says it in words; under it each connection is a row
 * that opens in place with its settings and its Read and Write switches, then
 * the reference folder the CLI reads itself, and web access. The settings are
 * drafts until the save bar saves them, so the line and the rows follow each
 * switch as it is flipped.
 */
export function ToolsSection({
  valueOf,
  isSet,
  changed,
  hasIssue,
  keysOf,
  fields,
  card,
  groups,
  labelOf,
  sectionLabel,
  go,
  sandbox,
}: {
  /** A setting as it will be once saved: the draft, the file or its default */
  valueOf: (key: string) => string
  isSet: (key: string) => boolean
  /** Whether a setting has a change not saved yet */
  changed: (key: string) => boolean
  hasIssue: (key: string) => boolean
  /** The settings a group shows now */
  keysOf: (group: SettingGroup) => string[]
  /** A group's rows as the settings screen draws them, without a card */
  fields: (group: SettingGroup) => React.ReactNode
  /** A group's card as the settings screen draws it */
  card: (group: SettingGroup, chip?: React.ReactNode) => React.ReactNode
  groups: Record<SettingGroup, SettingGroupInfo>
  labelOf: (key: string) => string
  sectionLabel: (section: 'sandbox' | 'messengers') => string
  go: (section: 'sandbox' | 'messengers') => void
  sandbox: Sandbox
}) {
  const t = useText(text)
  const [open, setOpen] = useState<ConnectionId>()
  const states = connectionStates({ value: valueOf, isSet })
  const builtIn = valueOf('REASONER_SANDBOX') === 'vm'
  const opsOn = valueOf('OPS_TOOLS') === 'on'
  const onlyYou =
    valueOf('SLACK_CONNECTION') === 'hub' || isSet('MENTION_ALLOWED_USERS')
  const codex = valueOf('REASONER') === 'codex'
  // Codex in the sandbox gets no folder to read (docs/sandbox.md)
  const referenceRead = isSet('MENTION_WORKSPACE') && !(codex && builtIn)

  const state = (
    each: ConnectionState
  ): { tone: Tone; text: string; title?: string } => {
    const requires = groups[each.id].requires ?? []
    if (!opsOn) return { tone: 'off', text: t.state.off }
    if (each.missing.length === requires.length)
      return { tone: 'off', text: t.state.notSetUp }
    if (each.missing.length > 0)
      return {
        tone: 'warn',
        text: t.state.missing(each.missing.length),
        title: t.stillNeeded(each.missing.map(labelOf)),
      }
    if (!each.read) return { tone: 'off', text: t.state.readOff }
    if (each.write && each.writeMissing.length > 0)
      return { tone: 'warn', text: t.state.writeNeeds(groups.files.label) }
    if (!builtIn) return { tone: 'off', text: t.state.waits }
    return { tone: 'ok', text: t.state.on }
  }

  return (
    <>
      <Summary
        states={states}
        builtIn={builtIn}
        opsOn={opsOn}
        onlyYou={onlyYou}
        referenceRead={referenceRead}
        cli={codex ? 'Codex' : 'Claude Code'}
        sectionLabel={sectionLabel}
        go={go}
      />

      <section className="surface-group">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-section">{groups.ops.label}</h3>
          <p className="mt-0.5 text-meta text-muted-foreground">
            {groups.ops.help}
          </p>
        </header>
        {fields('ops')}
        <div className="divide-y divide-border border-t border-border">
          {states.map((each) => {
            const keys = keysOf(each.id)
            return (
              <ConnectionRow
                key={each.id}
                id={each.id}
                info={groups[each.id]}
                scope={SCOPE[each.id](valueOf)}
                state={state(each)}
                reads={opsOn && each.reads}
                writes={opsOn && each.writes}
                dimmed={!opsOn}
                changed={keys.some(changed)}
                // A connection with something to fix stays open on it
                open={open === each.id || keys.some(hasIssue)}
                onOpenChange={(next) => setOpen(next ? each.id : undefined)}
              >
                {fields(each.id)}
              </ConnectionRow>
            )
          })}
        </div>
      </section>

      {builtIn && sandbox.available && opsOn && (
        <BrokerCard sandbox={sandbox} />
      )}

      {card(
        'reference',
        <Chip
          tone={
            !isSet('MENTION_WORKSPACE') ? 'off' : referenceRead ? 'ok' : 'warn'
          }
        >
          {!isSet('MENTION_WORKSPACE')
            ? t.referenceOff
            : referenceRead
              ? t.referenceOn
              : t.codexInSandbox}
        </Chip>
      )}

      {builtIn && sandbox.available ? (
        <AllowlistCard sandbox={sandbox} />
      ) : (
        <section className="surface-group">
          <header className="flex items-start gap-3 px-4 py-3">
            <Globe className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h3 className="text-section">{t.web}</h3>
              <p className="mt-0.5 text-meta text-muted-foreground">
                {t.webHere}
              </p>
            </div>
            <Button size="xs" variant="outline" onClick={() => go('sandbox')}>
              {t.openSection(sectionLabel('sandbox'))}
              <ChevronRight />
            </Button>
          </header>
        </section>
      )}
    </>
  )
}

/**
 * What Pace can reach now, in a sentence that follows the switches as they
 * are flipped, with where it runs; and what the connections still need from
 * other sections
 */
function Summary({
  states,
  builtIn,
  opsOn,
  onlyYou,
  referenceRead,
  cli,
  sectionLabel,
  go,
}: {
  states: ConnectionState[]
  builtIn: boolean
  opsOn: boolean
  onlyYou: boolean
  referenceRead: boolean
  cli: string
  sectionLabel: (section: 'sandbox' | 'messengers') => string
  go: (section: 'sandbox' | 'messengers') => void
}) {
  const t = useText(text)
  const reads = states
    .filter((each) => each.reads)
    .map((each) => t.names[each.id])
  const writes = states
    .filter((each) => each.writes)
    .map((each) => t.names[each.id])
  const reaching = opsOn && builtIn && reads.length > 0
  const line = [
    !opsOn
      ? referenceRead
        ? t.referenceOnly
        : t.off
      : reads.length === 0
        ? t.none
        : builtIn
          ? t.can(reads, writes)
          : t.sandboxFirst,
    opsOn && referenceRead ? t.reference : '',
  ]
    .filter(Boolean)
    .join(' ')
  const needs = opsOn
    ? [
        ...(builtIn
          ? []
          : [{ says: t.needsSandbox, section: 'sandbox' as const }]),
        ...(onlyYou
          ? []
          : [{ says: t.needsOnlyYou, section: 'messengers' as const }]),
      ]
    : []
  const Icon = reaching ? CircleCheck : CircleDashed
  return (
    <div className="flex items-start gap-3 rounded-xl bg-card-accent px-4 py-3">
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          reaching ? 'text-primary' : 'text-muted-foreground'
        )}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <Swap id={line}>
          <p className="text-row select-text" data-tools-summary>
            {line}
          </p>
        </Swap>
        <p className="text-meta text-muted-foreground">
          {t.where(builtIn, cli)}
        </p>
        {needs.length > 0 && (
          <ul className="space-y-1.5 pt-2">
            {needs.map((need) => (
              <li
                key={need.section}
                className="flex items-center gap-2 text-meta"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-status-interrupted" />
                <span className="min-w-0 flex-1">{need.says}</span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => go(need.section)}
                >
                  {t.openSection(sectionLabel(need.section))}
                  <ChevronRight />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * One connection: a row with what it reaches, its Read and Write, and its
 * state, that opens in place on its settings. The row lights up when its state
 * changes, so a switch flipped below shows above.
 */
function ConnectionRow({
  id,
  info,
  scope,
  state,
  reads,
  writes,
  dimmed,
  changed,
  open,
  onOpenChange,
  children,
}: {
  id: ConnectionId
  info: SettingGroupInfo
  scope: string
  state: { tone: Tone; text: string; title?: string }
  reads: boolean
  writes: boolean
  dimmed: boolean
  changed: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  const t = useText(text)
  const Icon = ICON[id]
  const flash = useFlash({ row: `${state.text}|${reads}|${writes}` })
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} data-connection={id}>
      <CollapsibleTrigger
        {...flash('row')}
        className="motion-flash group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors outline-none hover:bg-selected/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-well/60 @max-[36rem]/content:flex-wrap"
      >
        <Icon
          className={cn(
            'size-4 shrink-0 transition-colors',
            dimmed ? 'text-muted-foreground' : 'text-primary'
          )}
        />
        <span
          className={cn(
            'flex w-32 shrink-0 items-center gap-1.5 text-row transition-colors',
            dimmed && 'text-muted-foreground'
          )}
        >
          {info.label}
          {changed && (
            <span
              className="size-1.5 rounded-full bg-primary"
              aria-label={t.changed}
            />
          )}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-meta text-muted-foreground @max-[36rem]/content:hidden',
            id === 'files' && 'font-mono'
          )}
          title={scope || undefined}
        >
          {scope}
        </span>
        <span className="flex w-28 shrink-0 justify-end gap-1">
          {reads && <Access>{t.read}</Access>}
          {writes && <Access write>{t.write}</Access>}
        </span>
        <span
          className={cn(
            'flex w-44 shrink-0 items-center gap-1.5 text-meta @max-[36rem]/content:w-auto',
            TONE[state.tone].text
          )}
          title={state.title}
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              TONE[state.tone].dot
            )}
          />
          <span className="truncate">{state.text}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border bg-well/40">
        <p className="px-4 pt-3 text-meta text-muted-foreground">{info.help}</p>
        {children}
        <p className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-meta text-muted-foreground">
          <Lock className="size-3 shrink-0" />
          {t.never[id]}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Read or Write, beside a connection's name */
function Access({
  write,
  children,
}: {
  write?: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2 text-caption leading-5',
        write
          ? 'bg-card text-primary ring-1 ring-primary/35 ring-inset'
          : 'bg-secondary text-secondary-foreground'
      )}
    >
      {children}
    </span>
  )
}

const CHIP_TONE: Record<Tone, string> = {
  ok: 'bg-status-succeeded/12 text-status-succeeded',
  warn: 'bg-status-interrupted/12 text-status-interrupted',
  off: 'bg-muted text-muted-foreground',
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-sm px-1.5 text-caption leading-4',
        CHIP_TONE[tone]
      )}
    >
      {children}
    </span>
  )
}
