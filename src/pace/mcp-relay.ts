import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { serveStatelessMcp } from '../mcp-http.js'
import { errorResult } from '../mcp-tools.js'
import type { McpServerRef } from '../reasoners/types.js'
import type { Requester } from '../sandbox/runtime.js'
import type { OwnTools } from '../sandbox/vm-broker.js'
import {
  readMcpServers,
  type McpServerSetting,
} from '../settings/mcp-servers.js'

/**
 * The MCP servers you added in Settings > Tools, for the reasoner in the
 * built-in sandbox: each run's door serves server <name> at
 * 127.0.0.1:8080/pace/servers/<name>/mcp in the VM, and Pace passes each
 * request on from here, on this Mac, with the headers you saved. The VM never
 * reaches the server itself or sees its headers. Pace lists a tool the server
 * marks read-only (readOnlyHint) while the server's Read switch is on, and any
 * other tool while its Write switch is on, and refuses to call one it does
 * not list. Only for the person Pace answers, as Pace's own tools.
 */
export interface YourServersOptions {
  /** mcp-servers.json, read on each request */
  file: string
  owner: () => string | undefined
  version: string
}

/** Where the door serves your servers (vm-broker.ts) */
export const SERVERS_PATH = '/pace/servers/'
const DOOR = 'http://127.0.0.1:8080'
/** How long a connection stays open after its last request */
const IDLE_MS = 2 * 60_000
const CONNECT_MS = 15_000
const LIST_MS = 30_000
/** A tool call's limit, from its last progress; the run's limit still holds */
const CALL_MS = 5 * 60_000

const NOT_OWNER =
  'These tools act only for the person this Pacenote belongs to, and someone else asked.'

/** The servers to hand the reasoner: those with Read or Write on */
export function yourServerRefs(servers: McpServerSetting[]): McpServerRef[] {
  return servers
    .filter((server) => server.read || server.write)
    .map((server) => ({
      name: server.name,
      url: `${DOOR}${SERVERS_PATH}${server.name}/mcp`,
    }))
}

/** Whether Pace may use a tool of a server, by its switches */
export function allowedTool(server: McpServerSetting, tool: Tool): boolean {
  return tool.annotations?.readOnlyHint === true ? server.read : server.write
}

interface Upstream {
  /** What the connection was opened with, to open anew when it changes */
  signature: string
  client: Client
  tools?: Tool[]
  idle?: NodeJS.Timeout
}

/**
 * Connections to your servers, one per server, shared by the runs and closed
 * when idle
 */
class Upstreams {
  private readonly open = new Map<string, Promise<Upstream>>()

  constructor(private readonly version: string) {}

  async get(server: McpServerSetting): Promise<Upstream> {
    const signature = JSON.stringify([
      server.url,
      server.headers,
      server.transport,
    ])
    const was = this.open.get(server.name)
    if (was) {
      const upstream = await was.catch(() => undefined)
      if (upstream?.signature === signature) return this.touch(server, upstream)
      this.drop(server.name, upstream)
    }
    const opening = connect(server, this.version).then((client): Upstream => ({
      signature,
      client,
    }))
    this.open.set(server.name, opening)
    try {
      return this.touch(server, await opening)
    } catch (error) {
      if (this.open.get(server.name) === opening) this.open.delete(server.name)
      throw error
    }
  }

  /** Forgets a connection that failed, so the next request opens anew */
  drop(name: string, upstream: Upstream | undefined): void {
    if (!upstream) return
    clearTimeout(upstream.idle)
    void upstream.client.close().catch(() => undefined)
    void this.open.get(name)?.then((current) => {
      if (current === upstream) this.open.delete(name)
    })
  }

  private touch(server: McpServerSetting, upstream: Upstream): Upstream {
    clearTimeout(upstream.idle)
    upstream.idle = setTimeout(
      () => this.drop(server.name, upstream),
      IDLE_MS
    ).unref()
    return upstream
  }
}

/**
 * A client of a server: streamable HTTP, or the older SSE transport when it
 * says so or answers a POST as an SSE server does
 */
async function connect(
  server: McpServerSetting,
  version: string
): Promise<Client> {
  const url = new URL(server.url)
  const requestInit = { headers: server.headers }
  const client = () => new Client({ name: 'pacenote', version })
  if (server.transport !== 'sse') {
    const http = client()
    try {
      await http.connect(
        new StreamableHTTPClientTransport(url, { requestInit }),
        {
          timeout: CONNECT_MS,
        }
      )
      return http
    } catch (error) {
      await http.close().catch(() => undefined)
      const older =
        error instanceof StreamableHTTPError &&
        [400, 404, 405].includes(error.code ?? 0)
      if (server.transport === 'http' || !older) throw error
    }
  }
  const sse = client()
  await sse.connect(new SSEClientTransport(url, { requestInit }), {
    timeout: CONNECT_MS,
  })
  return sse
}

/** All of a server's tools, every page of them */
async function listAll(client: Client): Promise<Tool[]> {
  const tools: Tool[] = []
  let cursor: string | undefined
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, {
      timeout: LIST_MS,
    })
    tools.push(...page.tools)
    cursor = page.nextCursor
  } while (cursor && tools.length < 1000)
  return tools
}

/** Why a server could not be reached, in a line */
export function serverProblem(error: unknown): string {
  const code = (error as { code?: unknown }).code
  if (code === 401 || code === 403)
    return `The server refused Pacenote (${code}): check the headers saved for it, such as Authorization.`
  const message = (error as Error).message ?? String(error)
  const cause = (error as { cause?: { code?: string } }).cause?.code
  return cause ? `${message} (${cause})` : message
}

/**
 * Pace's door handler for your servers: a stateless relay per request, as
 * Pace's own tools are served
 */
export function serveYourServers(options: YourServersOptions): OwnTools {
  const upstreams = new Upstreams(options.version)

  const tools = async (server: McpServerSetting, fresh = false) => {
    let upstream = await upstreams.get(server)
    if (!upstream.tools || fresh)
      try {
        upstream.tools = await listAll(upstream.client)
      } catch {
        // A connection the server let go of: once more, anew
        upstreams.drop(server.name, upstream)
        upstream = await upstreams.get(server)
        upstream.tools = await listAll(upstream.client)
      }
    return { upstream, tools: upstream.tools }
  }

  const call = async (
    server: McpServerSetting,
    name: string,
    args: Record<string, unknown> | undefined
  ): Promise<CallToolResult> => {
    let found = await tools(server)
    let tool = found.tools.find((each) => each.name === name)
    if (!tool) {
      found = await tools(server, true)
      tool = found.tools.find((each) => each.name === name)
    }
    if (!tool) return errorResult(`${server.name} has no tool ${name}.`)
    if (!allowedTool(server, tool))
      return errorResult(
        tool.annotations?.readOnlyHint === true
          ? `Reading with ${server.name} is off in Pacenote. The user can turn it on in Settings > Tools.`
          : `${name} changes things, and writing with ${server.name} is off in Pacenote. The user can turn it on in Settings > Tools.`
      )
    const result = await found.upstream.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: CALL_MS, resetTimeoutOnProgress: true }
    )
    return result as CallToolResult
  }

  return async (req, res, requester) => {
    const name = new RegExp(`^${SERVERS_PATH}([a-z0-9][a-z0-9_-]*)/mcp$`).exec(
      req.url ?? ''
    )?.[1]
    const server = name
      ? readMcpServers(options.file).find(
          (each) => each.name === name && (each.read || each.write)
        )
      : undefined
    if (!server) {
      res.writeHead(404, { 'Content-Length': '0' }).end()
      return
    }
    const forOwner = isOwner(options, requester)
    await serveStatelessMcp(req, res, () => relayFor(server, forOwner))
  }

  /** One request's server for one of your servers, as the owner may use it */
  function relayFor(server: McpServerSetting, forOwner: boolean): Server {
    const relay = new Server(
      { name: server.name, version: options.version },
      { capabilities: { tools: {} } }
    )
    relay.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!forOwner) return { tools: [] }
      try {
        const listed = await tools(server)
        return {
          tools: listed.tools.filter((tool) => allowedTool(server, tool)),
        }
      } catch {
        // The run goes on without them; a call says why
        return { tools: [] }
      }
    })
    relay.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!forOwner) return errorResult(NOT_OWNER)
      try {
        return await call(server, request.params.name, request.params.arguments)
      } catch (error) {
        return errorResult(
          `${server.name} did not answer: ${serverProblem(error)}`
        )
      }
    })
    return relay
  }
}

function isOwner(
  options: YourServersOptions,
  requester: Requester | undefined
): boolean {
  const owner = options.owner()
  return Boolean(requester && owner && requester.user === owner)
}

/** Pace's own tools and your servers behind one door */
export function paceTools(own: OwnTools, servers: OwnTools): OwnTools {
  return (req, res, requester) =>
    req.url?.startsWith(SERVERS_PATH)
      ? servers(req, res, requester)
      : own(req, res, requester)
}

/** A server's tools, as Settings > Tools shows them after a check */
export interface ServerCheck {
  tools?: { name: string; title?: string; readOnly: boolean }[]
  problem?: string
}

/** Connects to a server once and lists its tools, for Settings > Tools */
export async function checkServer(
  server: McpServerSetting,
  version: string
): Promise<ServerCheck> {
  let client: Client | undefined
  try {
    client = await connect(server, version)
    const tools = await listAll(client)
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        ...(tool.title || tool.annotations?.title
          ? { title: tool.title ?? tool.annotations?.title }
          : {}),
        readOnly: tool.annotations?.readOnlyHint === true,
      })),
    }
  } catch (error) {
    return { problem: serverProblem(error) }
  } finally {
    await client?.close().catch(() => undefined)
  }
}
