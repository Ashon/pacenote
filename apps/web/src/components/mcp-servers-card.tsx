import {
  ChevronRight,
  Info,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { useFlash } from '@/components/ui/motion'
import { remoteMac } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { ServerCheck } from '@src/pace/mcp-relay'
import type {
  McpServerCandidate,
  McpServerDraft,
  McpServerIssue,
  McpServerView,
} from '@src/settings/mcp-servers'
import { CardHeader, Row, Switch } from './settings-parts'
import { text } from './mcp-servers-card.text'
import { Access } from './tools-parts'

type Bridge = NonNullable<NonNullable<Window['pacenoteDesktop']>['servers']>

/** The editor that adds a server, open in place of a row */
const NEW = '+'

/**
 * Settings > Tools > MCP servers: the HTTP MCP servers Pace may use, each a
 * row with where it answers and its Read and Write, that opens in place to
 * edit it, check its tools or remove it; then the servers Claude Code and
 * Codex have on this Mac, to add with one click. Each saves on its own, apart
 * from the save bar: the bot reads the file on each request.
 */
export function McpServersCard({
  builtIn,
  sandboxLabel,
  goSandbox,
}: {
  /** Whether Pace runs in the built-in sandbox, where the servers work */
  builtIn: boolean
  sandboxLabel: string
  goSandbox: () => void
}) {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.servers
  const [list, setList] = useState<{
    servers: McpServerView[]
    found: McpServerCandidate[]
  }>()
  const [open, setOpen] = useState<string>()

  const refresh = useCallback(() => {
    void bridge?.list().then((value) => {
      if (!('error' in value)) setList(value)
    })
  }, [bridge])
  useEffect(refresh, [refresh])

  // On a device of yours, these stay on the Mac with their keys
  if (!bridge || remoteMac()) return null
  const servers = list?.servers ?? []
  const found = list?.found ?? []
  const done = (name?: string) => {
    setOpen(name)
    refresh()
  }

  return (
    <section className="surface-group" data-mcp-servers>
      <CardHeader
        title={t.title}
        help={t.help}
        action={
          <Button
            size="xs"
            variant="outline"
            disabled={open === NEW}
            onClick={() => setOpen(NEW)}
          >
            <Plus />
            {t.add}
          </Button>
        }
      />
      {!builtIn && (
        <p className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-meta text-status-interrupted">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t.waits}</span>
          <Button size="xs" variant="outline" onClick={goSandbox}>
            {t.openSandbox(sandboxLabel)}
            <ChevronRight />
          </Button>
        </p>
      )}
      <div className="divide-y divide-border">
        {servers.map((server) => (
          <ServerRow
            key={server.name}
            server={server}
            dimmed={!builtIn}
            open={open === server.name}
            onOpenChange={(next) => setOpen(next ? server.name : undefined)}
          >
            <ServerEditor
              bridge={bridge}
              server={server}
              onDone={done}
              onCancel={() => setOpen(undefined)}
            />
          </ServerRow>
        ))}
        {open === NEW && (
          <div className="bg-well/40" data-server-new>
            <ServerEditor
              bridge={bridge}
              onDone={done}
              onCancel={() => setOpen(undefined)}
            />
          </div>
        )}
        {list && servers.length === 0 && open !== NEW && (
          <p className="px-4 py-3 text-meta text-muted-foreground">{t.none}</p>
        )}
      </div>
      {found.length > 0 && (
        <FoundServers bridge={bridge} found={found} onAdded={done} />
      )}
    </section>
  )
}

/**
 * One server: its name, where it answers, and its Read and Write, that opens
 * in place on its editor. It lights up when its switches change.
 */
function ServerRow({
  server,
  dimmed,
  open,
  onOpenChange,
  children,
}: {
  server: McpServerView
  dimmed: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  const t = useText(text)
  const flash = useFlash({ row: `${server.read}|${server.write}` })
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      data-server={server.name}
    >
      <CollapsibleTrigger
        {...flash('row')}
        className="motion-flash group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors outline-none hover:bg-selected/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-well/60 @max-[36rem]/content:flex-wrap"
      >
        <Plug
          className={cn(
            'size-4 shrink-0',
            dimmed ? 'text-muted-foreground' : 'text-primary'
          )}
        />
        <span
          className={cn(
            'w-32 shrink-0 truncate font-mono text-row',
            dimmed && 'text-muted-foreground'
          )}
        >
          {server.name}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground @max-[36rem]/content:hidden"
          title={server.url}
        >
          {hostOf(server.url)}
        </span>
        <span className="flex w-28 shrink-0 justify-end gap-1">
          {server.read && <Access>{t.read}</Access>}
          {server.write && <Access write>{t.write}</Access>}
        </span>
        <span
          className="w-28 shrink-0 truncate text-meta text-muted-foreground @max-[36rem]/content:w-auto"
          title={server.from && t.from(server.from.cli, server.from.project)}
        >
          {t.place[server.where]}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border bg-well/40">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A header as it is being edited: null keeps the value saved for it */
interface HeaderDraft {
  name: string
  value: string | null
}

/**
 * A server's settings, or a new one's: its name, URL, headers (each saved
 * one shown by name, to keep or replace), Read and Write; a check of its
 * tools against the switches; and Save, Cancel and Remove
 */
function ServerEditor({
  bridge,
  server,
  onDone,
  onCancel,
}: {
  bridge: Bridge
  server?: McpServerView
  /** Saved or removed: the server to keep open, if any */
  onDone: (open?: string) => void
  onCancel: () => void
}) {
  const t = useText(text)
  const [name, setName] = useState(server?.name ?? '')
  const [url, setUrl] = useState(server?.url ?? '')
  const [headers, setHeaders] = useState<HeaderDraft[]>(
    server?.headers.map((header) => ({ name: header, value: null })) ?? [
      { name: 'Authorization', value: '' },
    ]
  )
  const [read, setRead] = useState(server?.read ?? true)
  const [write, setWrite] = useState(server?.write ?? false)
  const [issues, setIssues] = useState<McpServerIssue[]>([])
  const [check, setCheck] = useState<ServerCheck | 'checking'>()

  const draft = (): McpServerDraft => ({
    name: name.trim(),
    url: url.trim(),
    headers: Object.fromEntries(
      headers
        .filter((header) => header.name.trim() && header.value !== '')
        .map((header) => [header.name.trim(), header.value])
    ),
    ...(server?.transport ? { transport: server.transport } : {}),
    read,
    write,
    ...(server?.from ? { from: server.from } : {}),
  })
  const dirty =
    !server ||
    name !== server.name ||
    url !== server.url ||
    read !== server.read ||
    write !== server.write ||
    headers.some((header) => header.value !== null) ||
    headers.length !== server.headers.length
  const issueOf = (...kinds: McpServerIssue[]) =>
    issues
      .filter((issue) => kinds.includes(issue))
      .map((issue) => t.issue[issue])
      .join(' ') || undefined

  const save = () => {
    void bridge.save(draft(), server?.name).then((result) => {
      if ('error' in result) return
      setIssues(result.issues)
      if (result.issues.length === 0) onDone(server ? name.trim() : undefined)
    })
  }
  const runCheck = () => {
    setCheck('checking')
    void bridge
      .check(draft(), server?.name)
      .then((result) =>
        setCheck('error' in result ? { problem: result.error } : result)
      )
  }
  const setHeader = (index: number, change: Partial<HeaderDraft>) =>
    setHeaders(
      headers.map((header, at) =>
        at === index ? { ...header, ...change } : header
      )
    )

  return (
    <div data-server-editor>
      <Row
        label={t.name}
        help={t.nameHelp}
        issue={issueOf('name', 'nameTaken', 'nameReserved', 'notFound')}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="linear"
          aria-label={t.name}
          className="h-7 w-56 font-mono text-meta"
        />
      </Row>
      <Row label={t.url} help={t.urlHelp} issue={issueOf('url')}>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://mcp.example.com/mcp"
          aria-label={t.url}
          className="h-7 w-80 font-mono text-meta @max-[36rem]/content:w-full"
        />
      </Row>
      <div className="px-4 py-3">
        <div className="text-row">{t.headers}</div>
        <p className="mt-0.5 text-meta text-muted-foreground">
          {t.headersHelp}
        </p>
        {issueOf('header') && (
          <p className="mt-1 text-meta text-status-failed">
            {issueOf('header')}
          </p>
        )}
        {headers.length > 0 && (
          <ul className="mt-2 divide-y divide-card overflow-hidden rounded-lg bg-well">
            {headers.map((header, index) => (
              <li
                key={index}
                className="flex items-center gap-2 px-3 py-1.5 text-meta"
              >
                {header.value === null ? (
                  <>
                    <span className="w-40 shrink-0 truncate font-mono">
                      {header.name}
                    </span>
                    <span className="rounded-sm bg-muted px-1.5 text-caption text-muted-foreground">
                      {t.kept}
                    </span>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setHeader(index, { value: '' })}
                    >
                      {t.replace}
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      value={header.name}
                      onChange={(e) =>
                        setHeader(index, { name: e.target.value })
                      }
                      placeholder={t.headerName}
                      aria-label={t.headerName}
                      className="h-7 w-40 shrink-0 font-mono text-meta"
                    />
                    <Input
                      type="password"
                      value={header.value}
                      onChange={(e) =>
                        setHeader(index, { value: e.target.value })
                      }
                      placeholder={t.headerValue}
                      aria-label={t.headerValue}
                      className="h-7 min-w-0 flex-1 font-mono text-meta"
                    />
                  </>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ml-auto size-6"
                  aria-label={t.removeHeader(header.name)}
                  onClick={() =>
                    setHeaders(headers.filter((_, at) => at !== index))
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="xs"
          variant="ghost"
          className="mt-1.5"
          onClick={() => setHeaders([...headers, { name: '', value: '' }])}
        >
          <Plus />
          {t.addHeader}
        </Button>
      </div>
      <Row label={t.read} help={t.readHelp}>
        <Switch checked={read} onChange={setRead} />
      </Row>
      <Row label={t.write} help={t.writeHelp}>
        <Switch checked={write} onChange={setWrite} />
      </Row>
      {server && server.where !== 'internet' && (
        <p className="flex items-start gap-1.5 px-4 pb-3 text-meta text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {t.outside}
        </p>
      )}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={check === 'checking' || !url.trim()}
            onClick={runCheck}
          >
            <RefreshCw className={cn(check === 'checking' && 'animate-spin')} />
            {check === 'checking' ? t.checking : t.check}
          </Button>
          {check && check !== 'checking' && check.tools && (
            <span className="text-meta text-muted-foreground">
              {t.tools(check.tools.length)}
            </span>
          )}
        </div>
        {check && check !== 'checking' && (
          <CheckResult check={check} read={read} write={write} />
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5">
        {server && (
          <Button
            size="sm"
            variant="ghost"
            className="text-status-failed"
            onClick={() =>
              void bridge.remove(server.name).then(() => onDone(undefined))
            }
          >
            <Trash2 />
            {t.remove}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty || !name.trim() || !url.trim()}
          >
            <Save />
            {t.save}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** A server's tools, each as Read or Write, dimmed when its switch is off */
function CheckResult({
  check,
  read,
  write,
}: {
  check: ServerCheck
  read: boolean
  write: boolean
}) {
  const t = useText(text)
  if (check.problem)
    return (
      <p className="mt-2 text-meta text-status-failed select-text">
        {check.problem}
      </p>
    )
  return (
    <ul className="mt-2 divide-y divide-card overflow-hidden rounded-lg bg-well">
      {(check.tools ?? []).map((tool) => {
        const used = tool.readOnly ? read : write
        return (
          <li
            key={tool.name}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-meta',
              !used && 'text-muted-foreground'
            )}
            data-tool={tool.name}
          >
            <span className="min-w-0 flex-1 truncate font-mono select-text">
              {tool.name}
            </span>
            {!used && <span className="text-caption">{t.notUsed}</span>}
            <Access write={!tool.readOnly}>
              {tool.readOnly ? t.read : t.write}
            </Access>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The HTTP servers Claude Code and Codex have on this Mac, not added yet:
 * each adds with one click, once the headers kept elsewhere are filled in
 */
function FoundServers({
  bridge,
  found,
  onAdded,
}: {
  bridge: Bridge
  found: McpServerCandidate[]
  onAdded: (open?: string) => void
}) {
  const t = useText(text)
  const [filling, setFilling] = useState<string>()
  const [values, setValues] = useState<Record<string, string>>({})
  const [issues, setIssues] = useState<Record<string, McpServerIssue[]>>({})

  const add = (server: McpServerCandidate) => {
    if (server.missing.length > 0 && filling !== server.url) {
      setFilling(server.url)
      setValues({})
      return
    }
    void bridge
      .addFound(server.url, server.name, filling === server.url ? values : {})
      .then((result) => {
        if ('error' in result) return
        if (result.issues.length > 0)
          setIssues({ ...issues, [server.url]: result.issues })
        else {
          setFilling(undefined)
          onAdded(undefined)
        }
      })
  }

  return (
    <div className="border-t border-border" data-servers-found>
      <div className="px-4 pt-3 pb-1">
        <h4 className="text-row">{t.found}</h4>
        <p className="mt-0.5 text-meta text-muted-foreground">{t.foundHelp}</p>
      </div>
      <ul className="divide-y divide-border">
        {found.map((server) => (
          <li key={server.url} className="px-4 py-2.5" data-found={server.name}>
            <div className="flex items-center gap-3 @max-[36rem]/content:flex-wrap">
              <Plug className="size-4 shrink-0 text-muted-foreground" />
              <span className="w-32 shrink-0 truncate font-mono text-row">
                {server.name}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground"
                title={server.url}
              >
                {hostOf(server.url)}
              </span>
              <span className="w-56 shrink-0 truncate text-meta text-muted-foreground @max-[36rem]/content:w-auto">
                {t.place[server.where]} ·{' '}
                {t.from(server.from.cli, server.from.project)}
              </span>
              <Button size="xs" variant="outline" onClick={() => add(server)}>
                <Plus />
                {t.addFound}
              </Button>
            </div>
            {filling === server.url && (
              <div className="mt-2 space-y-1.5 pl-7">
                <p className="text-meta text-muted-foreground">
                  {t.needs(server.missing)}
                </p>
                {server.missing.map((header) => (
                  <div key={header} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate font-mono text-meta">
                      {header}
                    </span>
                    <Input
                      type="password"
                      value={values[header] ?? ''}
                      onChange={(e) =>
                        setValues({ ...values, [header]: e.target.value })
                      }
                      placeholder={t.headerValue}
                      aria-label={header}
                      className="h-7 min-w-0 flex-1 font-mono text-meta"
                    />
                  </div>
                ))}
              </div>
            )}
            {issues[server.url]?.map((issue) => (
              <p key={issue} className="mt-1 pl-7 text-meta text-status-failed">
                {t.issue[issue]}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A URL's host and port, for a row */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
