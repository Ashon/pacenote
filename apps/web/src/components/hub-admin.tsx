import type {
  HubAccessRule,
  HubAdminAct,
  HubAdminView,
  HubMemberView,
  HubPerson,
} from '@src/hub/protocol'
import {
  Laptop,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { text } from './hub-admin.text'
import { CardHeader, Chip, Row, Segmented } from './settings-parts'

/** How often the members' Macs and requests are asked again */
const REFRESH_MS = 15_000

/**
 * Settings > Messengers, under the team hub, for its admins: who can use the
 * hub, who waits to join, and each member's Mac (src/hub/server.ts, /admin).
 * Other members, and hubs before 0.6.18, show nothing here.
 */
export function HubAdminCard() {
  const t = useText(text)
  const hub = window.pacenoteDesktop?.hub
  const [view, setView] = useState<HubAdminView | null>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!hub) return
    let live = true
    const load = () =>
      void hub.admin().then((res) => {
        if (!live) return
        // not_admin, not_found (an older hub), unreachable: nothing to manage
        if ('error' in res) setView((now) => (now ? now : null))
        else setView(res)
      })
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [hub])

  if (!hub || !view) return null
  const act = (change: HubAdminAct) => {
    setBusy(true)
    setError(undefined)
    void hub
      .adminAct(change)
      .then((res) => {
        if ('error' in res) setError(t.errors[res.error] ?? t.failed(res.error))
        else setView(res)
      })
      .finally(() => setBusy(false))
  }
  const listed = view.rule === 'members'
  return (
    <section className="surface-group" data-hub-admin={view.rule}>
      <CardHeader
        title={t.title}
        help={t.help(view.team.name)}
        chip={<Chip tone="off">{t.admin}</Chip>}
      />
      <div className="divide-y divide-border">
        <Row
          label={t.whoCanUse}
          help={listed ? t.listedHelp : t.everyoneHelp(view.team.name)}
        >
          <Segmented
            label={t.whoCanUse}
            value={view.rule}
            options={(['everyone', 'members'] as HubAccessRule[]).map(
              (rule) => ({
                value: rule,
                label: rule === 'members' ? t.listed : t.everyone,
              })
            )}
            onChange={(rule) =>
              rule !== view.rule &&
              act({ do: 'rule', rule: rule as HubAccessRule })
            }
          />
        </Row>
        {view.requests.length > 0 && (
          <div data-hub-requests={view.requests.length}>
            <p className="px-4 pt-3 text-meta font-medium text-muted-foreground">
              {t.requests}
            </p>
            {view.requests.map((request) => (
              <div
                key={request.user.id}
                className="flex items-center gap-3 px-4 py-2.5"
                data-hub-request={request.user.name}
              >
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-row">{request.user.name}</div>
                  <p className="text-meta text-muted-foreground">
                    {t.asked(formatRelative(request.at))}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act({ do: 'decline', user: request.user.id })}
                >
                  {t.decline}
                </Button>
                <Button
                  size="xs"
                  disabled={busy}
                  onClick={() => act({ do: 'add', user: request.user.id })}
                >
                  {t.add}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div data-hub-members={view.members.length}>
          <p className="px-4 pt-3 text-meta font-medium text-muted-foreground">
            {t.members(view.members.length)}
          </p>
          {view.members.length === 0 ? (
            <p className="px-4 py-3 text-meta text-muted-foreground">
              {t.nobodyYet}
            </p>
          ) : (
            view.members.map((member) => (
              <MemberRow
                key={member.user.id}
                member={member}
                you={member.user.id === view.you.id}
                listed={listed}
                busy={busy}
                act={act}
              />
            ))
          )}
        </div>
        {listed && <AddMember onAdd={(id) => act({ do: 'add', user: id })} />}
      </div>
      {error && (
        <p className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-meta text-status-failed">
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </section>
  )
}

function MemberRow({
  member,
  you,
  listed,
  busy,
  act,
}: {
  member: HubMemberView
  you: boolean
  /** The hub is for listed members: a member can be taken off */
  listed: boolean
  busy: boolean
  act: (change: HubAdminAct) => void
}) {
  const t = useText(text)
  const [removing, setRemoving] = useState(false)
  const { user, desktop } = member
  const Icon = desktop ? Laptop : UserRound
  const line = desktop
    ? desktop.connected
      ? t.macNow(desktop.label)
      : desktop.lastSeenAt
        ? t.macSeen(desktop.label, formatRelative(desktop.lastSeenAt))
        : t.macPaired(desktop.label, formatRelative(desktop.pairedAt))
    : t.noMac
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      data-hub-member={user.name}
      data-connected={Boolean(desktop?.connected)}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-row">
          <span className="truncate">{user.name}</span>
          {you && (
            <span className="shrink-0 text-caption text-muted-foreground">
              {t.you}
            </span>
          )}
          {member.admin && (
            <Chip
              tone="off"
              title={member.fixedAdmin ? t.fixedAdmin : undefined}
            >
              {t.admin}
            </Chip>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              desktop?.connected ? 'bg-status-succeeded' : 'bg-border'
            )}
          />
          <span className="truncate">
            {line}
            {member.addedBy && ` · ${t.addedBy(member.addedBy.name)}`}
          </span>
        </p>
      </div>
      {removing ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-meta text-muted-foreground">
            {t.removeSure(user.name)}
          </span>
          <Button
            size="xs"
            variant="outline"
            className="text-status-failed"
            disabled={busy}
            onClick={() => act({ do: 'remove', user: user.id })}
          >
            {t.removeConfirm}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setRemoving(false)}>
            {t.cancel}
          </Button>
        </div>
      ) : (
        // Your own Mac and access are yours, in Settings
        !you && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t.moreFor(user.name)}
                disabled={busy}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={member.fixedAdmin}
                onSelect={() =>
                  act({ do: 'admin', user: user.id, admin: !member.admin })
                }
              >
                {member.fixedAdmin
                  ? t.fixedAdmin
                  : member.admin
                    ? t.unmakeAdmin
                    : t.makeAdmin}
              </DropdownMenuItem>
              {desktop && (
                <DropdownMenuItem
                  onSelect={() => act({ do: 'disconnect', user: user.id })}
                >
                  {t.disconnectMac}
                </DropdownMenuItem>
              )}
              {listed && !member.fixedAdmin && (
                <DropdownMenuItem
                  className="text-status-failed"
                  onSelect={() => setRemoving(true)}
                >
                  {t.remove}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}
    </div>
  )
}

/** Finds someone in the workspace by name, to put on the list */
function AddMember({ onAdd }: { onAdd: (id: string) => void }) {
  const t = useText(text)
  const hub = window.pacenoteDesktop?.hub
  const [words, setWords] = useState('')
  const [found, setFound] = useState<HubPerson[] | 'looking'>()
  useEffect(() => {
    const q = words.trim()
    if (!hub || !q) return setFound(undefined)
    let live = true
    setFound('looking')
    // As you type: the last words asked are the ones shown
    const timer = setTimeout(
      () =>
        void hub.people(q).then((res) => {
          if (live) setFound('error' in res ? [] : res)
        }),
      250
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [hub, words])
  return (
    <div data-hub-add>
      <Row label={t.addMember} help={t.addMemberHelp}>
        <Input
          value={words}
          onChange={(event) => setWords(event.target.value)}
          placeholder={t.search}
          aria-label={t.addMember}
          className="h-7 w-56 max-w-full"
        />
      </Row>
      {found === 'looking' ? (
        <p className="flex items-center gap-2 px-4 pb-3 text-meta text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
        </p>
      ) : found?.length === 0 ? (
        <p className="px-4 pb-3 text-meta text-muted-foreground">
          {t.nobodyFound}
        </p>
      ) : (
        found?.map((person) => (
          <div
            key={person.user.id}
            className="flex items-center gap-3 px-4 py-2"
            data-hub-person={person.user.name}
          >
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-row">
              {person.user.name}
            </span>
            {person.member ? (
              <span className="text-meta text-muted-foreground">
                {t.member}
              </span>
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  onAdd(person.user.id)
                  setWords('')
                }}
              >
                <Plus />
                {t.add}
              </Button>
            )}
          </div>
        ))
      )}
    </div>
  )
}
