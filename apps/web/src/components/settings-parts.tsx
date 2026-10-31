import {
  Box,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  FolderOpen,
  History,
  Link2,
  ListChecks,
  LoaderCircle,
  MessagesSquare,
  Monitor,
  MonitorSmartphone,
  Moon,
  Plug,
  SlidersHorizontal,
  Sparkles,
  Sun,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import { remoteMac } from '@/lib/desktop'
import { formatRelative } from '@/lib/format'
import {
  useLanguage,
  useLocale,
  useText,
  type LanguagePreference,
} from '@/lib/i18n'
import { useHubPairing } from '@/lib/hub'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { hubShareLink } from '@src/hub/share'
import { isLocale, LOCALES, LOCALE_NAMES, localized } from '@src/i18n/locale'
import { MAC_ONLY_SETTINGS } from '@src/macs/asks'
import type { SlackCheckItem } from '@src/messengers/slack/check'
import {
  SETTING_SECTIONS,
  settingSections,
  type SettingField,
  type SettingGroupInfo,
  type SettingSection,
  type SettingsView,
} from '@src/settings/fields'
import type { UpdateState } from '@runtime/types'
import { CopyButton } from './code-block'
import { HubInstall } from './hub-install'
import { PaceSpinner } from './pace-spinner'
import { text } from './settings-page.text'

/**
 * The parts every Settings section draws with: the section list, a group's
 * card, a field's row and its controls, the chips and notes beside them, and
 * the General section's own cards. settings-page.tsx holds the page, its
 * draft and its save bar, and builds each section from these.
 */

/**
 * Settings sections: the bot's own (the settings file), then the desktop app's
 * preferences.
 */
export type Section = SettingSection | 'general' | 'macs'

export const SECTION_ICON: Record<Section, LucideIcon> = {
  messengers: MessagesSquare,
  answers: Sparkles,
  sandbox: Box,
  ops: Wrench,
  tasks: ListChecks,
  logs: History,
  general: SlidersHorizontal,
  macs: MonitorSmartphone,
}

/** A section's name and help, in the app's language */
export function sectionInfo(section: Section): { label: string; help: string } {
  return section === 'general' || section === 'macs'
    ? localized(text).sections[section]
    : settingSections().find((info) => info.id === section)!
}

/**
 * The app's own preferences first, then the bot's settings (as macOS lists
 * General first)
 */
export const NAV: { group: 'app' | 'pace'; items: Section[] }[] = [
  { group: 'app', items: ['general', 'macs'] },
  { group: 'pace', items: SETTING_SECTIONS.map((info) => info.id) },
]
/** A short state shown beside a section in the navigation */
export interface Hint {
  tone: 'warn' | 'muted'
  text: string
}
/** The sections, with their changes, issues and states once they are known */
export function SettingsNav({
  section,
  go,
  changes = () => 0,
  issues = () => 0,
  hints = {},
}: {
  section: Section
  go: (section: Section) => void
  changes?: (section: Section) => number
  issues?: (section: Section) => number
  hints?: Partial<Record<Section, Hint>>
}) {
  const t = useText(text)
  // A device of yours lists the sections itself, its own first
  if (remoteMac()) return null
  return (
    <nav
      aria-label={t.navLabel}
      className="flex w-56 shrink-0 flex-col gap-4 border-r border-sidebar-border px-2.5 py-5 @max-[44rem]/settings:w-14 @max-[44rem]/settings:px-2"
    >
      <h1 className="px-2.5 text-heading @max-[44rem]/settings:sr-only">
        {t.title}
      </h1>
      {NAV.map((group) => (
        <div key={group.group} className="space-y-0.5">
          <p className="px-2.5 pb-1 text-caption text-muted-foreground/80 @max-[44rem]/settings:sr-only">
            {t.nav[group.group]}
          </p>
          {group.items.map((id) => (
            <NavItem
              key={id}
              icon={SECTION_ICON[id]}
              label={sectionInfo(id).label}
              active={section === id}
              changes={changes(id)}
              issues={issues(id)}
              hint={hints[id]}
              onClick={() => go(id)}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}

export function SectionTitle({ section }: { section: Section }) {
  const { label, help } = sectionInfo(section)
  return (
    <header>
      <h2 className="text-title">{label}</h2>
      <p className="mt-1 text-copy text-muted-foreground">{help}</p>
    </header>
  )
}

/**
 * A section's cards while the settings are read: a card's heading and its
 * rows (a name, a line of help, and the control's place), as tall as theirs
 */
export function SectionSkeleton() {
  return (
    <div className="space-y-8">
      {[3, 2].map((rows, c) => (
        <section key={c} className="surface-group">
          <header className="border-b border-border px-4 py-3">
            <SkeletonText className="text-section" width={c ? '22%' : '30%'} />
            <SkeletonText className="mt-0.5 text-meta" width="58%" />
          </header>
          <div className="divide-y divide-border">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <SkeletonText className="text-row" width={`${38 - i * 6}%`} />
                  <SkeletonText className="mt-0.5 text-meta" width="62%" />
                </div>
                <div className="flex min-h-7 shrink-0 items-center">
                  <SkeletonBlock className="h-7 w-28 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function NavItem({
  icon: Icon,
  label,
  active,
  changes,
  issues,
  hint,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  changes: number
  issues: number
  hint?: Hint
  onClick: () => void
}) {
  const t = useText(text)
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-copy transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 @max-[44rem]/settings:justify-center @max-[44rem]/settings:px-0',
        active
          ? 'bg-selected font-medium text-foreground'
          : 'text-muted-foreground hover:bg-selected/50 hover:text-foreground'
      )}
    >
      <span className="relative shrink-0">
        <Icon className="size-4" strokeWidth={1.75} />
        {/* With the list as icons, a dot stands in for the issue, change
            count or state text. */}
        {(issues > 0 || changes > 0 || hint?.tone === 'warn') && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 hidden size-1.5 rounded-full @max-[44rem]/settings:block',
              issues > 0
                ? 'bg-status-failed'
                : changes > 0
                  ? 'bg-primary'
                  : 'bg-status-interrupted'
            )}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate @max-[44rem]/settings:sr-only">
        {label}
      </span>
      <span className="contents @max-[44rem]/settings:hidden">
        {issues > 0 ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-status-failed"
            title={t.issuesToFix(issues)}
          />
        ) : changes > 0 ? (
          <span
            className="shrink-0 rounded-full bg-primary/12 px-1.5 text-caption font-semibold text-primary tabular-nums"
            title={t.unsavedChanges(changes)}
          >
            {changes}
          </span>
        ) : hint ? (
          <span
            className={cn(
              'shrink-0 text-caption',
              hint.tone === 'warn'
                ? 'text-status-interrupted'
                : 'text-muted-foreground/70'
            )}
          >
            {hint.text}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/** A heading, its chip and a line of help: over cards, or in a card's header */
export function SubHeading({
  title,
  help,
  chip,
  className = 'pt-3',
}: {
  title: string
  help?: React.ReactNode
  chip?: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <h3 className="flex items-center gap-2 text-section">
        {title}
        {chip}
      </h3>
      {help && <p className="mt-0.5 text-meta text-muted-foreground">{help}</p>}
    </div>
  )
}

export function CardHeader({
  action,
  ...heading
}: Omit<React.ComponentProps<typeof SubHeading>, 'className'> & {
  action?: React.ReactNode
}) {
  return (
    <header className="flex items-start gap-3 border-b border-border px-4 py-3">
      <SubHeading {...heading} className="min-w-0 flex-1" />
      {action}
    </header>
  )
}

/**
 * One group of settings fields as a card: its basic fields, then the advanced
 * ones folded away.
 */
export function GroupCard({
  info,
  fields,
  row,
  help,
  chip,
  action,
  children,
  after,
}: {
  info: SettingGroupInfo
  fields: SettingField[]
  row: (field: SettingField) => React.ReactNode
  /** Replaces the group's own help text */
  help?: string
  chip?: React.ReactNode
  action?: React.ReactNode
  /** Shown under the header, before the fields */
  children?: React.ReactNode
  /** Shown after the basic fields, before the advanced ones */
  after?: React.ReactNode
}) {
  return (
    <section className="surface-group">
      <CardHeader
        title={info.label}
        help={help ?? info.help}
        chip={chip}
        action={action}
      />
      {children}
      <GroupBody
        fields={fields}
        row={row}
        after={after}
        bordered={Boolean(children)}
      />
    </section>
  )
}

/**
 * A group's fields without a card: its basic fields, then the advanced ones
 * folded away (a card's body, or a connection opened in place)
 */
export function GroupBody({
  fields,
  row,
  after,
  bordered = false,
}: {
  fields: SettingField[]
  row: (field: SettingField) => React.ReactNode
  /** Shown after the basic fields, before the advanced ones */
  after?: React.ReactNode
  /** Something above the fields needs a line under it */
  bordered?: boolean
}) {
  const basic = fields.filter((field) => !field.advanced)
  const advanced = fields.filter((field) => field.advanced)
  return (
    <>
      {basic.length > 0 && (
        <div className="divide-y divide-border">{basic.map(row)}</div>
      )}
      {after}
      {advanced.length > 0 && (
        <Advanced
          count={advanced.length}
          bordered={basic.length > 0 || bordered}
        >
          {advanced.map(row)}
        </Advanced>
      )}
    </>
  )
}

export const CHIP_TONE = {
  ok: 'bg-status-succeeded/12 text-status-succeeded',
  warn: 'bg-status-interrupted/12 text-status-interrupted',
  off: 'bg-muted text-muted-foreground',
}

export function Chip({
  tone,
  title,
  children,
}: {
  tone: keyof typeof CHIP_TONE
  title?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'rounded-sm px-1.5 text-caption leading-4',
        CHIP_TONE[tone]
      )}
    >
      {children}
    </span>
  )
}

/**
 * Pairs this desktop with the team hub: get a code, send "@Pace connect
 * <code>" in Slack, then confirm the Slack member who sent it. Confirming is
 * what makes it count, so a code someone else saw and sent first is turned down
 * here.
 */
export function HubPairing({
  hubUrl,
  allow,
  onAddress,
  paired,
  onPaired,
  onDisconnected,
}: {
  hubUrl: string
  /** Who Pace answers now, for a hub installed from here */
  allow: string
  /** A hub installed from here answers at this address */
  onAddress: (url: string) => void
  paired: boolean
  onPaired: (notice: string) => void
  onDisconnected: () => void
}) {
  const t = useText(text)
  const hub = window.pacenoteDesktop?.hub
  const { state, setState, start, cancel, confirm } = useHubPairing({
    pollMs: 2_000,
    expired: t.codeExpired,
    onPaired: (res) => {
      setState({ step: 'idle' })
      onPaired(t.pairedWith(res.user.name, res.team.name, res.started))
    },
  })
  const [busy, setBusy] = useState(false)

  if (!hub) return null
  const disconnect = () => {
    setBusy(true)
    void hub
      .disconnect()
      .then((res) => {
        if ('error' in res) setState({ step: 'error', message: res.error })
        else onDisconnected()
      })
      .finally(() => setBusy(false))
  }

  const body = (() => {
    switch (state.step) {
      case 'idle':
        return paired ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <CircleCheck className="size-4 shrink-0 text-status-succeeded" />
              <p className="min-w-0 flex-1 text-copy">{t.hubPaired}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={disconnect}
                disabled={busy}
              >
                {busy && <LoaderCircle className="animate-spin" />}
                {t.disconnect}
              </Button>
            </div>
            <HubShare url={hubUrl} />
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-row">{t.pairTitle}</p>
                <p className="mt-0.5 text-meta text-muted-foreground">
                  {state.note ?? t.pairHelp}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => start(hubUrl)}
                disabled={!hubUrl}
              >
                <Plug />
                {t.connect}
              </Button>
            </div>
            <HubInstall
              switchHere
              allow={allow}
              url={hubUrl}
              onUp={(url) => {
                onAddress(url)
                start(url)
              }}
              onSwitched={(done) =>
                onPaired(
                  t.pairedWith(done.user.name, done.team.name, done.started)
                )
              }
            />
          </div>
        )
      case 'starting':
        return (
          <p className="flex items-center gap-2 text-copy text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t.gettingCode}
          </p>
        )
      case 'waiting':
        return (
          <div className="space-y-2.5">
            <p className="text-copy">{t.mentionWithCode}</p>
            <div className="flex items-center gap-3">
              <code className="rounded-lg bg-card px-3 py-2 font-mono text-heading tracking-wide shadow-xs select-all">
                @Pace connect {state.code}
              </code>
              <Button size="sm" variant="ghost" onClick={() => cancel()}>
                {t.cancel}
              </Button>
            </div>
            {/* Pace itself is watching Slack for the mention. */}
            <p className="flex items-center gap-2 text-meta text-muted-foreground">
              <PaceSpinner className="size-6" />
              <span>
                {t.waitingCode((words) => (
                  <span className="text-shimmer">{words}</span>
                ))}
              </span>
            </p>
          </div>
        )
      case 'bound':
      case 'confirming':
        return (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-copy">
              {t.sentCode(
                <>
                  <b>{state.user.name}</b>{' '}
                  <span className="font-mono text-meta text-muted-foreground">
                    ({state.user.id})
                  </span>
                </>
              )}
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={state.step === 'confirming'}
              onClick={() => cancel(t.pairCancelled)}
            >
              {t.no}
            </Button>
            <Button
              size="sm"
              disabled={state.step === 'confirming'}
              onClick={() => confirm(state.user)}
            >
              {state.step === 'confirming' && (
                <LoaderCircle className="animate-spin" />
              )}
              {t.yesPair}
            </Button>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-3">
            <TriangleAlert className="size-4 shrink-0 text-status-failed" />
            <p className="min-w-0 flex-1 text-copy text-status-failed">
              {state.message}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setState({ step: 'idle' })}
            >
              {t.tryAgain}
            </Button>
          </div>
        )
    }
  })()
  return (
    <div className="border-t border-border bg-well/60 px-4 py-3">{body}</div>
  )
}

/**
 * A link for teammates to pair with the same hub, each with their own Slack
 * account: pacenote.dev's join page, which opens Pacenote on it or says how to
 * install Pacenote first (hubShareLink)
 */
export function HubShare({ url }: { url: string }) {
  const t = useText(text)
  const locale = useLocale()
  const [copied, setCopied] = useState<'yes' | 'failed'>()
  useEffect(() => {
    if (copied !== 'yes') return
    const timer = setTimeout(() => setCopied(undefined), 1_500)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () =>
    void navigator.clipboard.writeText(hubShareLink(url, locale)).then(
      () => setCopied('yes'),
      () => setCopied('failed')
    )
  return (
    <div className="flex items-center gap-3" data-hub-share>
      <div className="min-w-0 flex-1">
        <p className="text-row">{t.shareHub}</p>
        <p
          className={cn(
            'mt-0.5 text-meta',
            copied === 'failed' ? 'text-status-failed' : 'text-muted-foreground'
          )}
        >
          {copied === 'failed' ? t.shareHubFailed : t.shareHubHelp}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={copy} disabled={!url}>
        {copied === 'yes' ? <Check /> : <Link2 />}
        {copied === 'yes' ? t.copied : t.copyShareLink}
      </Button>
    </div>
  )
}

export function PathControl({
  path,
  label,
  onOpen,
}: {
  path: string
  label: string
  onOpen: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* A long path is cut short here; hover shows it whole. */}
      <span
        title={path}
        className="max-w-64 truncate font-mono text-meta text-muted-foreground select-text"
      >
        {path}
      </span>
      <Button variant="ghost" size="xs" onClick={onOpen}>
        <FolderOpen />
        {label}
      </Button>
    </div>
  )
}

/** What a choice shows besides its options (see choiceExtras) */
export interface ChoiceExtras {
  /** Under an option, by its value */
  footers?: Partial<Record<string, React.ReactNode>>
  /** Under the options */
  below?: React.ReactNode
}

/** What a field's control shows and edits */
export interface ControlProps {
  field: SettingField
  view: SettingsView
  value: string
  editing: boolean
  onChange: (value: string) => void
  onEdit: (on: boolean) => void
  /** Saves just this secret (Enter); Escape cancels */
  onSave: () => void
  saving: boolean
}

export function FieldRow({
  extras,
  changed,
  issue,
  ...control
}: ControlProps & { extras?: ChoiceExtras; changed: boolean; issue?: string }) {
  const t = useText(text)
  const { field, value, onChange } = control
  const mac = remoteMac()
  if (mac && MAC_ONLY_SETTINGS.has(field.key))
    return (
      <Row label={field.label} setting={field.key} help={field.help}>
        <OnTheMac field={field} view={control.view} mac={mac} />
      </Row>
    )
  const overridden = control.view.overridden.includes(field.key)
  const label = (
    <span className="flex items-center gap-1.5">
      {field.label}
      {changed && (
        <span
          className="size-1.5 rounded-full bg-primary"
          aria-label={t.changed}
        />
      )}
    </span>
  )
  const warning = overridden ? t.overridden : undefined
  // Options that explain themselves are laid out as cards; the card's title
  // names the choice.
  if (field.type === 'select' && field.options?.some((option) => option.help)) {
    return (
      <div data-setting={field.key} className="px-4 py-3">
        <Choice
          field={field}
          value={value}
          onChange={onChange}
          footers={extras?.footers}
        />
        <RowNotes warning={warning} issue={issue} />
        {extras?.below}
      </div>
    )
  }
  return (
    <Row
      label={label}
      setting={field.key}
      help={field.help}
      issue={issue}
      warning={warning}
      below={extras?.below}
    >
      <Control {...control} />
    </Row>
  )
}

/** On a device of yours, in place of what only happens at the Mac */
export function OnTheMacNote({ mac }: { mac: string }) {
  const t = useText(text)
  return (
    <p className="border-t border-border px-4 py-3 text-meta text-muted-foreground">
      {t.onTheMac(mac)}
    </p>
  )
}

/**
 * A setting a device of yours leaves to the Mac (MAC_ONLY_SETTINGS): what it
 * is there, and where to change it. A secret, only whether it is set.
 */
export function OnTheMac({
  field,
  view,
  mac,
}: {
  field: SettingField
  view: SettingsView
  mac: string
}) {
  const t = useText(text)
  const value = view.values[field.key] ?? ''
  const shown =
    field.type === 'secret'
      ? view.secrets[field.key]?.set
        ? t.setOn(mac)
        : t.notSet
      : (field.options?.find((option) => option.value === value)?.label ??
        value)
  return (
    <div className="flex max-w-72 flex-col items-end gap-0.5 text-right @max-[36rem]/content:items-start @max-[36rem]/content:text-left">
      <span
        className={cn(
          'text-meta break-all',
          field.type === 'text' && value && !field.options && 'font-mono',
          !value && field.type !== 'secret' && 'text-muted-foreground'
        )}
      >
        {shown || t.notSet}
      </span>
      {field.type !== 'secret' && (
        <span className="text-caption text-muted-foreground">
          {t.changeOn(mac)}
        </span>
      )}
    </div>
  )
}

export function Choice({
  field,
  value,
  onChange,
  footers,
}: {
  field: SettingField
  value: string
  onChange: (value: string) => void
  /** Under an option, outside its radio: a state and the action it needs */
  footers?: Partial<Record<string, React.ReactNode>>
}) {
  const selected = value || field.default || ''
  return (
    <div
      role="radiogroup"
      aria-label={field.label}
      className={cn(
        'grid gap-2',
        (field.options?.length ?? 0) > 2
          ? 'grid-cols-3 @max-[52rem]/content:grid-cols-1'
          : 'grid-cols-2 @max-[36rem]/content:grid-cols-1'
      )}
    >
      {field.options?.map((option) => {
        const checked = option.value === selected
        const footer = footers?.[option.value]
        return (
          <div
            key={option.value}
            data-choice={option.value}
            className={cn(
              'flex flex-col rounded-xl border transition-colors',
              checked
                ? 'border-primary/50 bg-primary/6'
                : 'border-border hover:border-primary/30'
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(option.value)}
              className="flex flex-1 flex-col justify-start rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <span className="flex items-center gap-2 text-row">
                <span
                  className={cn(
                    'grid size-3.5 shrink-0 place-items-center rounded-full border',
                    checked ? 'border-primary' : 'border-muted-foreground/40'
                  )}
                >
                  {checked && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                </span>
                {option.label}
              </span>
              {option.help && (
                <span className="mt-1 block text-meta text-muted-foreground">
                  {option.help}
                </span>
              )}
            </button>
            {footer && (
              <div
                className={cn(
                  'flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1.5 border-t px-3 py-2 text-meta',
                  checked ? 'border-primary/20' : 'border-border'
                )}
              >
                {footer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function Control({
  field,
  view,
  value,
  editing,
  onChange,
  onEdit,
  onSave,
  saving,
}: ControlProps) {
  const t = useText(text)
  switch (field.type) {
    case 'secret': {
      const secret = view.secrets[field.key]
      if (!editing) {
        return (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-meta',
                // The key's last characters are code; "Not set" is words.
                secret?.set
                  ? 'font-mono text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {secret?.set ? secret.hint : t.notSet}
            </span>
            <Button size="xs" variant="outline" onClick={() => onEdit(true)}>
              {secret?.set ? t.change : t.enter}
            </Button>
          </div>
        )
      }
      return (
        <div className="flex w-80 max-w-full items-center gap-1.5">
          <Input
            type="password"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim() && !saving) {
                e.preventDefault()
                onSave()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onEdit(false)
              }
            }}
            className="h-7 font-mono text-meta"
          />
          <Button size="xs" onClick={onSave} disabled={!value.trim() || saving}>
            {t.save}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onEdit(false)}>
            {t.cancel}
          </Button>
        </div>
      )
    }
    case 'toggle':
      return (
        <Switch
          checked={(value || field.default) === 'on'}
          onChange={(on) => onChange(on ? 'on' : 'off')}
        />
      )
    case 'select':
      if (field.segmented)
        return (
          <Segmented
            label={field.label}
            value={value || field.default || ''}
            options={field.options ?? []}
            onChange={onChange}
          />
        )
      return (
        <select
          value={value || field.default || ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-meta outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/30"
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    default:
      return (
        <Input
          value={value}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          placeholder={
            field.placeholder ??
            (field.default ? t.defaultValue(field.default) : t.notSet)
          }
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-7 text-meta',
            field.type === 'number'
              ? 'w-32 text-right tabular-nums'
              : 'w-72 max-w-full'
          )}
        />
      )
  }
}

export function Row({
  label,
  setting,
  help,
  issue,
  warning,
  below,
  children,
}: {
  label: React.ReactNode
  /** The setting the row edits, for finding it (never shown) */
  setting?: string
  help?: string
  issue?: string
  warning?: string
  /** Under its help: a state the setting depends on */
  below?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      data-setting={setting}
      className="flex items-start gap-4 px-4 py-3 @max-[36rem]/content:flex-col @max-[36rem]/content:gap-2"
    >
      <div className="min-w-0 flex-1 @max-[36rem]/content:w-full">
        <div className="text-row">{label}</div>
        {help && (
          <p className="mt-0.5 text-meta text-muted-foreground">{help}</p>
        )}
        <RowNotes warning={warning} issue={issue} />
        {below}
      </div>
      <div className="flex min-h-7 max-w-full shrink-0 items-center">
        {children}
      </div>
    </div>
  )
}

/**
 * Under Open sessions in, with Desktop app chosen: whether each app is on this
 * Mac, and what opens when it is not
 */
export function AppsHere() {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.tasks
  const [apps, setApps] = useState<Record<'claude' | 'codex', boolean> | null>()
  useEffect(() => {
    void bridge?.apps().then(setApps)
  }, [bridge])
  if (!apps) return null
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5 text-meta">
      {(['claude', 'codex'] as const).map((tool) => (
        <li key={tool} data-app={tool} className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              apps[tool] ? 'bg-status-succeeded' : 'bg-muted-foreground/40'
            )}
          />
          <span>
            {t.apps[tool]}
            <span className="text-muted-foreground">
              {apps[tool] ? t.appHere : t.appMissing}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function RowNotes({
  warning,
  issue,
}: {
  warning?: string
  issue?: string
}) {
  return (
    <>
      {warning && (
        <p className="mt-1 flex items-center gap-1 text-meta text-status-interrupted">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="select-text">{warning}</span>
        </p>
      )}
      {issue && (
        <p className="mt-1 text-meta text-status-failed select-text">{issue}</p>
      )}
    </>
  )
}

export const THEMES: { mode: ThemeMode; icon: LucideIcon }[] = [
  { mode: 'system', icon: Monitor },
  { mode: 'light', icon: Sun },
  { mode: 'dark', icon: Moon },
]

/**
 * System / Light / Dark, as a segmented control like the run list's status
 * filter.
 */
export function ThemePicker() {
  const t = useText(text)
  const { mode, setMode } = useTheme()
  return (
    <Segmented
      label={t.theme}
      value={mode}
      options={THEMES.map(({ mode: value, icon }) => ({
        value,
        label: t.themes[value],
        icon,
      }))}
      onChange={(value) => setMode(value as ThemeMode)}
    />
  )
}

/**
 * System / English / 한국어: each language by its own name, in either
 * language. System follows macOS.
 */
export function LanguagePicker() {
  const t = useText(text)
  const { preference, setPreference } = useLanguage()
  return (
    <Segmented
      label={t.language}
      value={preference}
      options={[
        { value: 'system', label: t.languageSystem },
        ...LOCALES.map((locale) => ({
          value: locale,
          label: LOCALE_NAMES[locale],
          lang: locale,
        })),
      ]}
      onChange={(value) => {
        const next: LanguagePreference = isLocale(value) ? value : 'system'
        void setPreference(next)
      }}
    />
  )
}

/**
 * A few short options side by side: the theme, the language, and the settings
 * that pick one of two or three (where work runs, which terminal)
 */
export function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  /**
   * lang: an option written in a language of its own (a language's name);
   * icon: one shown before its label
   */
  options: { value: string; label: string; lang?: string; icon?: LucideIcon }[]
  onChange: (value: string) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-lg bg-muted p-0.5"
    >
      {options.map(({ icon: Icon, ...option }) => (
        <button
          key={option.value}
          type="button"
          lang={option.lang}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-md px-2.5 text-meta font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            value === option.value
              ? 'bg-card text-foreground shadow-xs dark:bg-selected'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {option.label}
        </button>
      ))}
    </div>
  )
}
/**
 * Help: diagnostics to paste into a bug report. The secrets are taken out in
 * the app; the logs can still name channels and people, so it says to read it
 * first.
 */
export function HelpCard() {
  const t = useText(text)
  const diagnostics = window.pacenoteDesktop?.diagnostics
  const [copied, setCopied] = useState<'yes' | 'failed'>()
  if (!diagnostics) return null
  const copy = () =>
    void diagnostics()
      .then((text) => navigator.clipboard.writeText(text ?? ''))
      .then(
        () => setCopied('yes'),
        () => setCopied('failed')
      )
  return (
    <section className="surface-group">
      <CardHeader title={t.help} />
      <div className="divide-y divide-border">
        <Row
          label={t.diagnostics}
          help={t.diagnosticsHelp}
          warning={copied === 'failed' ? t.copyFailed : undefined}
        >
          <Button size="xs" variant="outline" onClick={copy}>
            {copied === 'yes' ? <Check /> : <Copy />}
            {copied === 'yes' ? t.copied : t.copyDiagnostics}
          </Button>
        </Row>
      </div>
    </section>
  )
}

/** How to update with Homebrew, which installs Pacenote */
export const BREW_UPGRADE = 'brew upgrade --cask pacenote'

/**
 * Updates: whether a newer Pacenote is out, and how to get it. The app only
 * tells; Homebrew installs it, quitting the app first and reopening it.
 */
export function UpdatesCard({ update }: { update: UpdateState | undefined }) {
  const t = useText(text)
  const { version } = __PACENOTE_BUILD__
  const latest = update?.latest
  return (
    <section className="surface-group">
      <CardHeader title={t.updates} help={t.updatesHelp} />
      <div className="divide-y divide-border">
        <Row
          label={
            update?.available && latest
              ? t.newVersion(latest.version)
              : `Pacenote ${version}`
          }
          help={
            !update
              ? t.installedOnly
              : update.available
                ? t.howToUpdate(update.current)
                : update.checkedAt
                  ? t.upToDate(formatRelative(update.checkedAt))
                  : t.notChecked
          }
        >
          {update?.available && latest ? (
            <div className="flex items-center gap-1">
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-meta select-text">
                {BREW_UPGRADE}
              </code>
              <CopyButton text={BREW_UPGRADE} />
              {latest.url && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => window.open(latest.url, '_blank')}
                >
                  {t.releaseNotes}
                </Button>
              )}
            </div>
          ) : null}
        </Row>
      </div>
    </section>
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  )
}

export function Advanced({
  count,
  bordered,
  children,
}: {
  count: number
  /** Separates the toggle from rows above it */
  bordered: boolean
  children: React.ReactNode
}) {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(bordered && 'border-t border-border')}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-1 px-4 py-2 text-left text-meta text-muted-foreground hover:text-foreground">
        <ChevronRight
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        {t.advanced(count)}
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border border-t border-border">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function CheckResult({ items }: { items: SlackCheckItem[] }) {
  return (
    <ul className="space-y-1 border-b border-border bg-well/60 px-4 py-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2 text-meta">
          {item.ok ? (
            <CircleCheck className="mt-px size-3.5 shrink-0 text-status-succeeded" />
          ) : (
            <CircleX className="mt-px size-3.5 shrink-0 text-status-failed" />
          )}
          <span className="w-20 shrink-0 font-medium">{item.label}</span>
          <span className="text-muted-foreground select-text">
            {item.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}
