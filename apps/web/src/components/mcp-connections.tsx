import type { McpClientStatus } from '@src/history/mcp-clients'
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useText } from '@/lib/i18n'
import { useMcpChange, useMcpClients } from '@/lib/mcp-clients'
import { cn } from '@/lib/utils'
import { localized } from '@src/i18n/locale'
import { CodeBlock } from './code-block'
import { text } from './mcp-connections.text'

/**
 * Pacenote's MCP server in Claude Code and Codex: whether each has it and
 * reaches it, with one click to add it, put this app in place of another, or
 * take it out. The commands to do it by hand stay below. about: what the tool
 * can then do.
 */
export function McpConnections({ about }: { about: string }) {
  const t = useText(text)
  const clients = useMcpClients()
  return (
    <div className="space-y-2 border-t border-border px-4 py-3">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-meta text-muted-foreground">{about}</p>
        <Button
          size="xs"
          variant="ghost"
          disabled={clients.isFetching}
          onClick={() => void clients.refetch()}
        >
          <RotateCw className={cn(clients.isFetching && 'animate-spin')} />
          {t.checkAgain}
        </Button>
      </div>
      <McpClientRows />
      <ByHand />
    </div>
  )
}

/** One row per tool: its state and the change it needs */
function McpClientRows() {
  const t = useText(text)
  const clients = useMcpClients()
  const { busy, change } = useMcpChange()
  if (!clients.data)
    return (
      <p className="flex items-center gap-2 py-1 text-meta text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        {t.checking}
      </p>
    )
  return (
    <ul className="divide-y divide-border rounded-lg bg-well/60">
      {clients.data.map((client) => {
        // Not installed: nothing to change here
        const action = client.state === 'missing' ? undefined : client.state
        return (
          <li
            key={client.id}
            className="flex items-start gap-2 px-3 py-2 text-meta"
          >
            <StateIcon state={client.state} busy={busy === client.id} />
            <span className="w-24 shrink-0 font-medium">{client.name}</span>
            <span className="min-w-0 flex-1 text-muted-foreground select-text">
              {describe(client)}
              {client.state === 'elsewhere' && client.command && (
                <span className="block truncate font-mono text-caption">
                  {client.command}
                </span>
              )}
              {client.error && (
                <span className="block text-status-interrupted">
                  {client.error}
                </span>
              )}
            </span>
            {action && (
              <Button
                size="xs"
                variant={ACTION[action] === 'disconnect' ? 'ghost' : 'outline'}
                disabled={busy !== undefined}
                onClick={() => void change(client.id, ACTION[action])}
              >
                {t.action[action]}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The change a tool's state calls for; its words are text.action */
const ACTION: Record<
  Exclude<McpClientStatus['state'], 'missing'>,
  'connect' | 'disconnect'
> = {
  absent: 'connect',
  elsewhere: 'connect',
  failed: 'connect',
  connected: 'disconnect',
}

/** A tool's state in words; connected, with how many tools it reaches */
function describe(client: McpClientStatus): string {
  const t = localized(text)
  if (client.state !== 'connected') return t[client.state]
  return client.tools ? t.connectedTools(client.tools.length) : t.connected
}

function StateIcon({
  state,
  busy,
}: {
  state: McpClientStatus['state']
  busy: boolean
}) {
  const className = 'mt-px size-3.5 shrink-0'
  if (busy)
    return (
      <LoaderCircle
        className={cn(className, 'animate-spin text-muted-foreground')}
      />
    )
  if (state === 'connected')
    return <CircleCheck className={cn(className, 'text-status-succeeded')} />
  if (state === 'failed')
    return <CircleX className={cn(className, 'text-status-interrupted')} />
  if (state === 'elsewhere')
    return (
      <TriangleAlert className={cn(className, 'text-status-interrupted')} />
    )
  return <CircleDashed className={cn(className, 'text-muted-foreground')} />
}

/** The commands to add the server by hand, with this app's paths */
function ByHand() {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  const [launch, setLaunch] =
    useState<
      Awaited<
        ReturnType<
          NonNullable<Window['pacenoteDesktop']>['settings']['historyMcp']
        >
      >
    >()
  useEffect(() => {
    void window.pacenoteDesktop?.settings.historyMcp().then(setLaunch)
  }, [])
  if (!launch) return null
  const env = Object.entries(launch.env)
  const shell = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
  const claude = [
    'claude mcp add pacenote --scope user',
    ...env.map(([key, value]) => `--env ${key}=${value}`),
    '--',
    shell(launch.command),
    ...launch.args.map(shell),
  ].join(' ')
  const codex = [
    '[mcp_servers.pacenote]',
    `command = ${JSON.stringify(launch.command)}`,
    `args = ${JSON.stringify(launch.args)}`,
    `env = { ${env.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(', ')} }`,
  ].join('\n')
  return (
    <>
      {!launch.ready && (
        <p className="text-meta text-status-interrupted">{t.notBuilt}</p>
      )}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground">
          <ChevronRight
            className={cn('size-3.5 transition-transform', open && 'rotate-90')}
          />
          {t.byHand}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <CodeBlock label={t.claudeByHand} code={claude} />
          <CodeBlock label={t.codexByHand} code={codex} />
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
