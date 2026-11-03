import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { systemPrompt } from '../src/mention/prompt.js'
import {
  checkServer,
  paceTools,
  serveYourServers,
  yourServerRefs,
} from '../src/pace/mcp-relay.js'
import { serveOwnTools } from '../src/pace/tools.js'
import { createReasoner } from '../src/reasoners/cli.js'
import type { Requester, Sandbox, SandboxRun } from '../src/sandbox/runtime.js'
import { openBrokerDoor } from '../src/sandbox/vm-broker.js'
import {
  claudeServers,
  codexServers,
  foundMcpServers,
  placeOf,
  readMcpServers,
  removeMcpServer,
  saveMcpServer,
  viewMcpServers,
  type McpServerDraft,
} from '../src/settings/mcp-servers.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-mcp-servers-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const OWNER = 'U0ASHON'
const asking: Requester = {
  user: OWNER,
  conversation: 'C0PORT',
  thread: '1792163700.000100',
}
const TOKEN = 'Bearer sk-test-only'

/** A server of the user's: one tool that reads, one that writes */
function issuesServer(seen: string[]): McpServer {
  const server = new McpServer({ name: 'issues', version: '1.0.0' })
  server.registerTool(
    'search',
    {
      description: 'Finds issues',
      inputSchema: { q: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ q }) => ({ content: [{ type: 'text', text: `found ${q}` }] })
  )
  server.registerTool(
    'create_issue',
    { description: 'Opens an issue', inputSchema: { title: z.string() } },
    ({ title }) => {
      seen.push(`created ${title}`)
      return { content: [{ type: 'text', text: `opened ${title}` }] }
    }
  )
  return server
}

/** The user's server over streamable HTTP and, at /sse, the older transport */
async function startUpstream(): Promise<{
  url: string
  seen: string[]
  headers: string[]
  close(): Promise<void>
}> {
  const seen: string[] = []
  const headers: string[] = []
  const sse = new Map<string, SSEServerTransport>()
  const server = http.createServer((req, res) => {
    headers.push(String(req.headers.authorization))
    void (async () => {
      if (req.url === '/mcp' && req.method === 'POST') {
        const mcp = issuesServer(seen)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        })
        res.on('close', () => void mcp.close())
        await mcp.connect(transport)
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        await transport.handleRequest(
          req,
          res,
          JSON.parse(Buffer.concat(chunks).toString('utf8'))
        )
      } else if (req.url === '/sse' && req.method === 'GET') {
        const transport = new SSEServerTransport('/messages', res)
        sse.set(transport.sessionId, transport)
        await issuesServer(seen).connect(transport)
      } else if (req.url?.startsWith('/messages')) {
        const id = new URL(req.url, 'http://x').searchParams.get('sessionId')
        await sse.get(id ?? '')?.handlePostMessage(req, res)
      } else res.writeHead(404).end()
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    headers,
    async close() {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** One JSON-RPC call through a door, as the reasoner in a VM makes */
function rpc(
  socket: string,
  urlPath: string,
  method: string,
  params: object = {}
): Promise<{ status: number; body: Json }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: socket,
        path: urlPath,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
      },
      (res) => {
        let text = ''
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => {
          const data = text
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('')
          resolve({
            status: res.statusCode ?? 0,
            body: data ? JSON.parse(data) : text,
          })
        })
      }
    )
    req.on('error', reject)
    req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }))
  })
}

const draft = (more: Partial<McpServerDraft> = {}): McpServerDraft => ({
  name: 'issues',
  url: 'https://mcp.example.com/mcp',
  headers: {},
  read: true,
  write: false,
  ...more,
})

describe('the MCP servers you add for Pace', () => {
  let upstream: Awaited<ReturnType<typeof startUpstream>>
  beforeAll(async () => {
    upstream = await startUpstream()
  })
  afterAll(() => upstream.close())

  async function withDoor<T>(
    file: string,
    requester: Requester | undefined,
    use: (socket: string) => Promise<T>
  ): Promise<T> {
    const door = await openBrokerDoor(
      undefined,
      path.join(tmpdir(), `pv-servers-${process.pid}-${Math.random()}.sock`),
      requester,
      paceTools(
        serveOwnTools({
          dataDir: path.join(root, 'data'),
          settings: () => ({
            on: true,
            dms: true,
            exclude: [],
            names: [],
            groups: [],
          }),
          owner: () => OWNER,
          version: 'test',
        }),
        serveYourServers({ file, owner: () => OWNER, version: 'test' })
      )
    )
    try {
      return await use(door.socket)
    } finally {
      await door.close()
    }
  }

  it('lists what Read allows, writes once Write is on, with the headers kept on this Mac', async () => {
    const file = path.join(root, 'relay.json')
    expect(
      saveMcpServer(
        file,
        draft({
          url: `${upstream.url}/mcp`,
          headers: { Authorization: TOKEN },
        })
      )
    ).toEqual([])
    await withDoor(file, asking, async (socket) => {
      const listed = await rpc(socket, '/pace/servers/issues/mcp', 'tools/list')
      expect(
        listed.body.result.tools.map((tool: { name: string }) => tool.name)
      ).toEqual(['search'])
      const found = await rpc(
        socket,
        '/pace/servers/issues/mcp',
        'tools/call',
        {
          name: 'search',
          arguments: { q: 'retry' },
        }
      )
      expect(found.body.result.content[0].text).toBe('found retry')
      const refused = await rpc(
        socket,
        '/pace/servers/issues/mcp',
        'tools/call',
        { name: 'create_issue', arguments: { title: 'Flaky test' } }
      )
      expect(refused.body.result.isError).toBe(true)
      expect(refused.body.result.content[0].text).toContain('Settings > Tools')
      expect(upstream.seen).toEqual([])

      saveMcpServer(
        file,
        draft({
          url: `${upstream.url}/mcp`,
          headers: { Authorization: null },
          write: true,
        }),
        'issues'
      )
      const both = await rpc(socket, '/pace/servers/issues/mcp', 'tools/list')
      expect(
        both.body.result.tools.map((tool: { name: string }) => tool.name)
      ).toEqual(['search', 'create_issue'])
      const opened = await rpc(
        socket,
        '/pace/servers/issues/mcp',
        'tools/call',
        { name: 'create_issue', arguments: { title: 'Flaky test' } }
      )
      expect(opened.body.result.content[0].text).toBe('opened Flaky test')
      expect(upstream.seen).toEqual(['created Flaky test'])
      // Pace's own tools still answer at their path
      const own = await rpc(socket, '/pace/mcp', 'tools/list')
      expect(own.body.result.tools.length).toBeGreaterThan(0)
    })
    expect(upstream.headers.every((header) => header === TOKEN)).toBe(true)
  })

  it('serves no one but the owner, and no server it does not have', async () => {
    const file = path.join(root, 'owner.json')
    saveMcpServer(file, draft({ url: `${upstream.url}/mcp`, write: true }))
    await withDoor(
      file,
      {
        user: 'U0SOMEONE',
        conversation: 'C0PORT',
        thread: '1792163700.000100',
      },
      async (socket) => {
        const listed = await rpc(
          socket,
          '/pace/servers/issues/mcp',
          'tools/list'
        )
        expect(listed.body.result.tools).toEqual([])
        const called = await rpc(
          socket,
          '/pace/servers/issues/mcp',
          'tools/call',
          {
            name: 'create_issue',
            arguments: { title: 'x' },
          }
        )
        expect(called.body.result.isError).toBe(true)
        const missing = await rpc(
          socket,
          '/pace/servers/other/mcp',
          'tools/list'
        )
        expect(missing.status).toBe(404)
      }
    )
    expect(upstream.seen).not.toContain('created x')
  })

  it('reaches a server on the older SSE transport', async () => {
    const file = path.join(root, 'sse.json')
    saveMcpServer(file, draft({ url: `${upstream.url}/sse` }))
    await withDoor(file, asking, async (socket) => {
      const found = await rpc(
        socket,
        '/pace/servers/issues/mcp',
        'tools/call',
        {
          name: 'search',
          arguments: { q: 'sse' },
        }
      )
      expect(found.body.result.content[0].text).toBe('found sse')
    })
  })

  it('checks a server for the settings screen', async () => {
    const [server] = (() => {
      const file = path.join(root, 'check.json')
      saveMcpServer(file, draft({ url: `${upstream.url}/mcp` }))
      return readMcpServers(file)
    })()
    expect(await checkServer(server!, 'test')).toEqual({
      tools: [
        { name: 'search', readOnly: true },
        { name: 'create_issue', readOnly: false },
      ],
    })
    const down = await checkServer(
      { ...server!, url: 'http://127.0.0.1:9/mcp' },
      'test'
    )
    expect(down.problem).toBeTruthy()
  })
})

describe('the servers file', () => {
  it('keeps headers to itself, in a file only you read', () => {
    const file = path.join(root, 'file.json')
    saveMcpServer(file, draft({ headers: { Authorization: TOKEN } }))
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(viewMcpServers(readMcpServers(file))).toEqual([
      {
        name: 'issues',
        url: 'https://mcp.example.com/mcp',
        headers: ['Authorization'],
        read: true,
        write: false,
        where: 'internet',
      },
    ])
    // A header sent without its value keeps it; one left out goes
    saveMcpServer(
      file,
      draft({ name: 'tracker', headers: { Authorization: null } }),
      'issues'
    )
    expect(readMcpServers(file)[0]!.headers).toEqual({ Authorization: TOKEN })
    saveMcpServer(file, draft({ name: 'tracker' }), 'tracker')
    expect(readMcpServers(file)[0]!.headers).toEqual({})
    removeMcpServer(file, 'tracker')
    expect(readMcpServers(file)).toEqual([])
  })

  it('refuses names Pace uses, names taken, and URLs that are not HTTP', () => {
    const file = path.join(root, 'checks.json')
    saveMcpServer(file, draft())
    expect(saveMcpServer(file, draft())).toEqual(['nameTaken'])
    expect(saveMcpServer(file, draft({ name: 'pacenote' }))).toEqual([
      'nameReserved',
    ])
    expect(saveMcpServer(file, draft({ name: 'Has Space' }))).toEqual(['name'])
    expect(
      saveMcpServer(file, draft({ name: 'local', url: 'file:///etc/passwd' }))
    ).toEqual(['url'])
    expect(
      saveMcpServer(file, draft({ name: 'odd', headers: { 'a b': 'x' } }))
    ).toEqual(['header'])
    expect(saveMcpServer(file, draft(), 'gone')).toEqual(['notFound'])
  })

  it('says where a server answers', () => {
    expect(placeOf('http://localhost:3000/mcp')).toBe('mac')
    expect(placeOf('http://127.0.0.1:3000/mcp')).toBe('mac')
    expect(placeOf('http://[::1]:3000/mcp')).toBe('mac')
    expect(placeOf('http://10.1.2.3/mcp')).toBe('network')
    expect(placeOf('http://grafana.local/mcp')).toBe('network')
    expect(placeOf('https://mcp.linear.app/sse')).toBe('internet')
  })

  it('hands the reasoner those with a switch on, through the door', () => {
    expect(
      yourServerRefs([
        {
          name: 'issues',
          url: 'https://x',
          headers: {},
          read: true,
          write: false,
        },
        {
          name: 'off',
          url: 'https://y',
          headers: {},
          read: false,
          write: false,
        },
      ])
    ).toEqual([
      { name: 'issues', url: 'http://127.0.0.1:8080/pace/servers/issues/mcp' },
    ])
  })
})

describe('servers found in your AI tools', () => {
  const home = path.join(root, 'home')
  beforeAll(() => {
    mkdirSync(path.join(home, '.codex'), { recursive: true })
    writeFileSync(
      path.join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          linear: { type: 'sse', url: 'https://mcp.linear.app/sse' },
          grafana: {
            type: 'http',
            url: 'http://localhost:8000/mcp',
            headers: { Authorization: 'Bearer abc', 'X-Org': '${GRAFANA_ORG}' },
          },
          files: { type: 'stdio', command: 'npx', args: ['files-mcp'] },
        },
        projects: {
          '/Users/me/git/api': {
            mcpServers: {
              ops: { type: 'http', url: 'https://ops.example/mcp' },
            },
          },
        },
      })
    )
    writeFileSync(
      path.join(home, '.codex', 'config.toml'),
      [
        'model = "gpt-5"',
        '',
        '[mcp_servers.figma]',
        'url = "https://mcp.figma.com/mcp"',
        'bearer_token_env_var = "FIGMA_TOKEN"',
        '',
        '[mcp_servers.sentry]',
        'url = "https://mcp.sentry.dev/mcp"',
        'http_headers = { "X-Team" = "core" }',
        '',
        '[mcp_servers.git]',
        'command = "uvx"',
        'args = ["mcp-server-git"]',
        '',
        '[mcp_servers."linear-again"]',
        'url = "https://mcp.linear.app/sse"',
      ].join('\n')
    )
  })

  it('reads HTTP servers from Claude Code and Codex, never programs', () => {
    expect(claudeServers(path.join(home, '.claude.json'))).toEqual([
      {
        name: 'linear',
        url: 'https://mcp.linear.app/sse',
        transport: 'sse',
        headers: {},
        missing: [],
        from: { cli: 'claude' },
      },
      {
        name: 'grafana',
        url: 'http://localhost:8000/mcp',
        headers: { Authorization: 'Bearer abc' },
        missing: ['X-Org'],
        from: { cli: 'claude' },
      },
      {
        name: 'ops',
        url: 'https://ops.example/mcp',
        headers: {},
        missing: [],
        from: { cli: 'claude', project: 'api' },
      },
    ])
    expect(codexServers(path.join(home, '.codex', 'config.toml'))).toEqual([
      {
        name: 'figma',
        url: 'https://mcp.figma.com/mcp',
        headers: {},
        missing: ['Authorization'],
        from: { cli: 'codex' },
      },
      {
        name: 'sentry',
        url: 'https://mcp.sentry.dev/mcp',
        headers: { 'X-Team': 'core' },
        missing: [],
        from: { cli: 'codex' },
      },
      {
        name: 'linear-again',
        url: 'https://mcp.linear.app/sse',
        headers: {},
        missing: [],
        from: { cli: 'codex' },
      },
    ])
  })

  it('offers each once, not those added, under a name Pace does not use', () => {
    const found = foundMcpServers(
      [
        {
          name: 'figma',
          url: 'https://mcp.figma.com/mcp',
          headers: {},
          read: true,
          write: false,
        },
      ],
      home
    )
    expect(found.map((server) => [server.name, server.where])).toEqual([
      ['linear', 'internet'],
      ['grafana', 'mac'],
      ['ops-2', 'internet'],
      ['sentry', 'internet'],
    ])
    expect(found[1]!.values).toEqual({ Authorization: 'Bearer abc' })
    expect(found[1]!.headers).toEqual(['Authorization', 'X-Org'])
  })
})

describe('the reasoner and your servers', () => {
  it('gets them for the owner only, and its prompt names them', async () => {
    const runs: SandboxRun[] = []
    const sandbox: Sandbox = {
      kind: 'vm',
      isolated: true,
      pathIn: (_mount, file) => file,
      run: async (run) => {
        runs.push(run)
        return {
          stdout: '{"type":"result","subtype":"success","result":"ok"}',
          stderr: '',
        }
      },
      extractPdfText: async () => '',
      verify: async () => [],
    }
    const reasoner = createReasoner(
      {
        backend: 'claude',
        timeoutMs: 1000,
        mcpServers: [
          { name: 'pacenote', url: 'http://127.0.0.1:8080/pace/mcp' },
        ],
        yourServers: (requester) =>
          requester?.user === OWNER
            ? [
                {
                  name: 'issues',
                  url: 'http://127.0.0.1:8080/pace/servers/issues/mcp',
                },
              ]
            : [],
      },
      sandbox
    )
    await reasoner.complete({ system: 's', prompt: 'p', requester: asking })
    await reasoner.complete({
      system: 's',
      prompt: 'p',
      requester: {
        user: 'U0SOMEONE',
        conversation: 'C0PORT',
        thread: '1792163700.000100',
      },
    })
    const config = (run: SandboxRun) =>
      JSON.parse(run.args[run.args.indexOf('--mcp-config') + 1]!).mcpServers
    expect(Object.keys(config(runs[0]!))).toEqual(['pacenote', 'issues'])
    expect(runs[0]!.args).toContain('mcp__issues')
    expect(Object.keys(config(runs[1]!))).toEqual(['pacenote'])

    const names = reasoner.yourServers?.(asking).map((server) => server.name)
    const prompt = systemPrompt(
      { name: 'Slack', venues: 'channels', markup: 'mrkdwn', public: true },
      { yourServers: names }
    )
    expect(prompt).toContain('MCP servers the user added in Pacenote: issues.')
    expect(
      systemPrompt({
        name: 'Slack',
        venues: 'channels',
        markup: 'mrkdwn',
        public: true,
      })
    ).not.toContain('MCP servers the user added')
  })
})
