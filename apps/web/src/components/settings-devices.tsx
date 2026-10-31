import {
  CircleCheck,
  CircleX,
  Laptop,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Smartphone,
  Tablet,
  TriangleAlert,
  X,
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
import { codeWords, macsControl, useMacs } from '@/lib/macs'
import { formatRelative } from '@/lib/format'
import { useFromMac } from '@/lib/setup'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { localized } from '@src/i18n/locale'
import type { AddingView, DeviceView, MacView } from '@src/macs/types'
import { FromMacBody } from './setup/from-mac'
import { text } from './settings-page.text'
import { CardHeader, Row, SectionSkeleton, Switch } from './settings-parts'

/**
 * Settings > Devices: Pace answers on the Mac you're using. Pacenote on your
 * other Macs with the same Slack app joins in on this network by itself
 * (src/macs), and you can add one on another network by its address.
 */
export function MacsSection() {
  const t = useText(text)
  const view = useMacs()
  const control = macsControl()
  const [adding, setAdding] = useState(false)
  // Pairing here is under way: it stays until you close what it says
  const [joining, setJoining] = useState(false)
  const [address, setAddress] = useState('')
  const [addIssue, setAddIssue] = useState<string>()
  if (!view) return <SectionSkeleton />
  // With your own Slack app Pace follows the Mac you're using; otherwise
  // (Pace off, or the team hub) your Macs keep the same Todo
  const pace = view.paceFollows
  const header = (
    <CardHeader
      title={t.yourMacs}
      help={pace ? t.yourMacsHelp : t.yourMacsTodoHelp}
    />
  )
  const others = view.macs.filter((mac) => !mac.here)
  const add = () =>
    void control?.addAddress(address).then((ok) => {
      if (!ok) return setAddIssue(t.addressIssue)
      setAddress('')
      setAddIssue(undefined)
      setAdding(false)
    })
  return (
    <section className="surface-group" data-macs={view.follow ? 'on' : 'off'}>
      {header}
      <div className="divide-y divide-border">
        {(pace || view.paired) && (
          <Row
            label={pace ? t.follow : t.findMacs}
            help={
              pace
                ? view.follow
                  ? t.followOn
                  : t.followOff
                : view.follow
                  ? t.findOn
                  : t.findOff
            }
          >
            <Switch
              checked={view.follow}
              onChange={(on) => void control?.follow(on)}
            />
          </Row>
        )}
        {view.adding ? (
          <AddingPanel adding={view.adding} pace={pace} />
        ) : (
          <Row label={t.addMac} help={pace ? t.addMacHelp : t.addMacTodoHelp}>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void control?.addStart()}
            >
              <Plus />
              {t.addMac}
            </Button>
          </Row>
        )}
        {/* Paired already, joining another Mac's would leave these */}
        {!pace && (joining || (!view.paired && !view.adding)) && (
          <JoinMac open={joining} onOpen={setJoining} />
        )}
        {view.follow && view.paired && (
          <>
            {view.macs.map((mac) => (
              <MacRow key={mac.id} mac={mac} pace={pace} />
            ))}
            {view.blocked ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <TriangleAlert className="size-4 shrink-0 text-status-interrupted" />
                <p className="min-w-0 flex-1 text-meta text-muted-foreground">
                  {t.networkBlocked}
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void control?.openPrivacy()}
                >
                  {t.openSystemSettings}
                </Button>
              </div>
            ) : (
              others.length === 0 && (
                <p
                  className="flex items-center gap-2 px-4 py-3 text-meta text-muted-foreground"
                  data-macs-looking
                >
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                  {t.lookingForMac}
                </p>
              )
            )}
            <div className="space-y-2 px-4 py-3">
              {view.addresses.map((entry) => (
                <div
                  key={entry}
                  className="flex items-center gap-2 text-meta text-muted-foreground"
                >
                  <span className="min-w-0 flex-1 truncate font-mono select-text">
                    {entry}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t.removeAddress(entry)}
                    onClick={() => void control?.removeAddress(entry)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              {adding ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    add()
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={t.addressLabel}
                    placeholder={t.addressPlaceholder}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="h-8 flex-1"
                  />
                  <Button size="sm" type="submit" disabled={!address.trim()}>
                    {t.add}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setAdding(false)
                      setAddIssue(undefined)
                    }}
                  >
                    {t.cancel}
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="text-meta text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setAdding(true)}
                >
                  {t.addByAddress}
                </button>
              )}
              {addIssue && (
                <p className="text-meta text-status-failed">{addIssue}</p>
              )}
              {adding && (
                <p className="text-meta text-muted-foreground">
                  {t.addressHelp}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/**
 * Add a device, while it waits for the new Mac, when the new Mac asks (compare
 * the number, then Allow), and how it ended
 */
function AddingPanel({
  adding,
  pace,
}: {
  adding: AddingView
  /** Pace follows between your Macs: your own Slack app goes too */
  pace: boolean
}) {
  const t = useText(text)
  const control = macsControl()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (adding.result || adding.request) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [adding.result, adding.request])
  if (adding.result) {
    const { kind, name, device } = adding.result
    return (
      <div className="flex items-center gap-3 px-4 py-3" data-adding={kind}>
        {kind === 'sent' ? (
          <CircleCheck className="size-4 shrink-0 text-status-succeeded" />
        ) : (
          <CircleX className="size-4 shrink-0 text-muted-foreground" />
        )}
        <p className="min-w-0 flex-1 text-body">
          {kind === 'sent'
            ? device
              ? t.devicePaired(name)
              : pace
                ? t.macSetUp(name)
                : t.macPaired(name)
            : kind === 'declined'
              ? t.addDeclined
              : t.addExpired}
        </p>
        {kind === 'expired' && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => void control?.addStart()}
          >
            {t.tryAgain}
          </Button>
        )}
        <Button size="xs" onClick={() => void control?.addClose()}>
          {kind === 'sent' ? t.done : t.close}
        </Button>
      </div>
    )
  }
  if (adding.request) {
    const { name, code, device } = adding.request
    return (
      <div className="flex flex-col gap-3 px-4 py-4" data-adding="request">
        <b className="text-section">
          {pace && !device ? t.wantsSetUp(name) : t.wantsPair(name)}
        </b>
        <p
          className="text-number tracking-[0.2em] tabular-nums select-text"
          data-code
        >
          {codeWords(code)}
        </p>
        <p className="text-body text-muted-foreground">
          {device ? t.sameNumberDevice(name) : t.sameNumber}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void control?.addAllow()}>
            {t.allow}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void control?.addDecline()}
          >
            {t.notThisOne}
          </Button>
        </div>
        <p className="text-meta text-muted-foreground">
          {device ? t.whatIsSentDevice : pace ? t.whatIsSent : t.whatIsSentTodo}
        </p>
      </div>
    )
  }
  const left = Math.max(0, Date.parse(adding.until) - now)
  const clock = `${Math.floor(left / 60_000)}:${String(
    Math.floor(left / 1_000) % 60
  ).padStart(2, '0')}`
  return (
    <div className="flex flex-col gap-2 px-4 py-4" data-adding="waiting">
      <div className="flex items-center gap-3">
        <b className="min-w-0 flex-1 text-section">{t.addMac}</b>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void control?.addStop()}
        >
          {t.stop}
        </Button>
      </div>
      <p className="text-body text-pretty">
        {(pace ? t.openOnNewMac : t.openOnOtherMac)((words) => (
          <span className="font-semibold whitespace-nowrap">{words}</span>
        ))}
      </p>
      <p className="flex items-center gap-2 text-meta text-muted-foreground">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
        {t.waitingOnNetwork(clock)}
      </p>
      <p className="text-meta text-muted-foreground">{t.shownWhileWaiting}</p>
    </div>
  )
}

const MAC_DOT: Record<MacView['status'], string> = {
  answering: 'bg-status-succeeded',
  moving: 'bg-status-running',
  'standing-by': 'bg-muted-foreground/50',
  'out-of-reach': 'bg-border',
}

/**
 * What a Mac is doing, in a few words: Pace's state there, or with Macs that
 * only keep Todo the same (pace false), whether it is in reach
 */
function macWords(mac: MacView, pace: boolean): string {
  const t = localized(text)
  if (!pace) {
    if (mac.here) return t.keepsTodo
    if (mac.status === 'out-of-reach')
      return mac.lastSeen
        ? t.outOfReachSeen(formatRelative(mac.lastSeen))
        : t.outOfReach
    if (mac.asleep) return t.asleep
    return mac.collecting ? t.collectingThere : t.inSync
  }
  if (mac.notReady) return t.paceNotRunning
  switch (mac.status) {
    case 'answering':
      return mac.here ? t.answeringHere : t.answering
    case 'moving':
      return t.moving
    case 'standing-by':
      return mac.asleep ? t.asleep : t.standingBy
    case 'out-of-reach':
      return mac.lastSeen
        ? t.outOfReachSeen(formatRelative(mac.lastSeen))
        : t.outOfReach
  }
}

/**
 * Your iPhone, iPad and Android devices (their app is in development): each
 * with a key of its own, paired here or with another of your Macs, and Remove
 * for one you lost
 */
export function DevicesSection() {
  const t = useText(text)
  const view = useMacs()
  // Once a device has paired: the app for them is not out yet
  if (!view?.devices.length) return null
  return (
    <section className="surface-group" data-devices={view.devices.length}>
      <CardHeader title={t.yourDevices} help={t.yourDevicesHelp} />
      <div className="divide-y divide-border">
        {view.devices.map((device) => (
          <DeviceRow key={device.id} device={device} />
        ))}
      </div>
    </section>
  )
}

function DeviceRow({ device }: { device: DeviceView }) {
  const t = useText(text)
  const [removing, setRemoving] = useState(false)
  const Icon = device.device === 'tablet' ? Tablet : Smartphone
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      data-device={device.name}
      data-connected={device.connected}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-row">{device.name}</div>
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              device.connected ? 'bg-status-succeeded' : 'bg-border'
            )}
          />
          <span className="truncate">
            {device.connected
              ? t.deviceNow
              : device.lastSeen
                ? t.deviceSeen(formatRelative(device.lastSeen))
                : t.devicePairedBy(device.by, formatRelative(device.pairedAt))}
          </span>
        </p>
      </div>
      {removing ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-meta text-muted-foreground">
            {t.removeDeviceSure(device.name)}
          </span>
          <Button
            size="xs"
            variant="outline"
            className="text-status-failed"
            onClick={() => void macsControl()?.removeDevice(device.id)}
          >
            {t.removeDevice}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setRemoving(false)}>
            {t.cancel}
          </Button>
        </div>
      ) : (
        <Button size="xs" variant="outline" onClick={() => setRemoving(true)}>
          {t.removeDevice}
        </Button>
      )}
    </div>
  )
}

/** A Mac's dot with Macs that only keep Todo the same: in reach or not */
const todoDot = (mac: MacView): string =>
  mac.status === 'out-of-reach'
    ? 'bg-border'
    : !mac.here && mac.asleep
      ? 'bg-muted-foreground/50'
      : 'bg-status-succeeded'

function MacRow({ mac, pace }: { mac: MacView; pace: boolean }) {
  const t = useText(text)
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      data-mac={mac.here ? 'here' : mac.name}
      data-status={mac.status}
    >
      <Laptop className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-row">
          <span className="truncate">{mac.name}</span>
          {mac.here && (
            <span className="shrink-0 text-caption text-muted-foreground">
              {t.thisMac}
            </span>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              pace ? MAC_DOT[mac.status] : todoDot(mac)
            )}
          />
          <span className="truncate">
            {macWords(mac, pace)}
            {pace && mac.reasoner ? ` · ${mac.reasoner}` : ''}
          </span>
        </p>
      </div>
      {pace && mac.here && mac.status === 'standing-by' && !mac.notReady && (
        <Button
          size="xs"
          variant="outline"
          onClick={() => void macsControl()?.answerHere()}
        >
          {t.answerHere}
        </Button>
      )}
      {!mac.here && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t.moreFor(mac.name)}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => void macsControl()?.ignore(mac.id)}
            >
              {pace ? t.stopFollowing : t.stopSyncing}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/**
 * Pair with your other Mac, on a Mac set up already: Add a device there, then
 * the number to compare; this Mac takes the key alone and keeps its settings
 */
function JoinMac({
  open,
  onOpen,
}: {
  open: boolean
  onOpen: (open: boolean) => void
}) {
  const t = useText(text)
  const mac = useFromMac('join')
  const close = () => {
    mac.cancel()
    onOpen(false)
  }
  // Leaving Settings lets your other Mac go
  useEffect(
    () => () => {
      if (open) window.pacenoteDesktop?.setup?.macCancel()
    },
    [open]
  )
  if (!open)
    return (
      <Row label={t.joinMac} help={t.joinMacHelp}>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            onOpen(true)
            mac.look()
          }}
        >
          <Laptop />
          {t.pair}
        </Button>
      </Row>
    )
  const joined = mac.state.step === 'copied'
  return (
    <div className="flex flex-col gap-3 px-4 py-4" data-join={mac.state.step}>
      <div className="flex items-center gap-3">
        <b className="min-w-0 flex-1 text-section">{t.joinMac}</b>
        <Button
          size="xs"
          variant={joined ? 'default' : 'ghost'}
          onClick={close}
        >
          {joined ? t.done : t.cancel}
        </Button>
      </div>
      <FromMacBody mac={mac} took={<p className="text-body">{t.joined}</p>} />
    </div>
  )
}
