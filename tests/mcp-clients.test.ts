import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  McpClients,
  probeMcp,
  type CommandResult,
  type ProbeResult,
} from '../apps/desktop/src/mcp-clients.js'
import {
  parseClaudeGet,
  parseCodexGet,
  sameLaunch,
  type McpLaunch,
} from '../src/history/mcp-clients.js'

const APP = '/Applications/Pacenote.app/Contents/MacOS/Pacenote'
const SCRIPT =
  '/Applications/Pacenote.app/Contents/Resources/app/tools/history-mcp.mjs'
const OURS: McpLaunch = {
  command: APP,
  args: [SCRIPT],
  env: { ELECTRON_RUN_AS_NODE: '1' },
}

// What claude 2.1.296 prints
const CLAUDE_CONNECTED = `pacenote:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: stdio
  Command: ${APP}
  Args: ${SCRIPT}
  Environment:
    ELECTRON_RUN_AS_NODE=1

To remove this server, run: claude mcp remove pacenote -s user
`
const CLAUDE_FAILED = `pacenote:
  Scope: User config (available in all your projects)
  Status: ✘ Failed to connect
  Issue: ENOENT: no such file or directory, posix_spawn '/nonexistent/Pacenote'
  Type: stdio
  Command: /nonexistent/Pacenote
  Args: /x y/z.mjs --flag
  Environment:
    ELECTRON_RUN_AS_NODE=1
    A=b c

To remove this server, run: claude mcp remove pacenote -s user
`
const CLAUDE_ABSENT =
  'No MCP server named "pacenote". Configured servers: supragnosis'

// What codex-cli 0.139.0 prints with --json
const codexJson = (launch: McpLaunch, enabled = true) =>
  JSON.stringify({
    name: 'pacenote',
    enabled,
    transport: { type: 'stdio', ...launch, env_vars: [], cwd: null },
  })

describe('reading what the AI tools have registered', () => {
  it('reads claude mcp get: the launch, and Claude Code’s own check', () => {
    expect(parseClaudeGet(CLAUDE_CONNECTED)).toEqual({
      launch: OURS,
      connected: true,
      issue: undefined,
    })
    const failed = parseClaudeGet(CLAUDE_FAILED)!
    expect(failed.connected).toBe(false)
    expect(failed.issue).toMatch(/^ENOENT/)
    expect(failed.launch.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', A: 'b c' })
    // Arguments come back split on spaces; sameLaunch joins them again.
    expect(
      sameLaunch(failed.launch, {
        command: '/nonexistent/Pacenote',
        args: ['/x y/z.mjs', '--flag'],
        env: {},
      })
    ).toBe(true)
    expect(parseClaudeGet(CLAUDE_ABSENT)).toBeUndefined()
  })

  it('reads codex mcp get --json, with HTTP servers and turned-off ones', () => {
    expect(parseCodexGet(codexJson(OURS))).toEqual({
      launch: OURS,
      enabled: true,
    })
    expect(parseCodexGet(codexJson(OURS, false))?.enabled).toBe(false)
    expect(
      parseCodexGet(
        JSON.stringify({
          enabled: true,
          transport: { type: 'streamable_http', url: 'https://x.test/mcp' },
        })
      )
    ).toEqual({ url: 'https://x.test/mcp', enabled: true })
    expect(parseCodexGet('Error: nope')).toBeUndefined()
  })

  it('tells this app’s server from another Pacenote', () => {
    expect(sameLaunch({ ...OURS, env: { ...OURS.env, X: '1' } }, OURS)).toBe(
      true
    )
    expect(sameLaunch({ ...OURS, env: {} }, OURS)).toBe(false)
    expect(
      sameLaunch({ ...OURS, args: ['/repo/build/tools/history-mcp.mjs'] }, OURS)
    ).toBe(false)
  })
})

/** Fake claude and codex CLIs keeping a registration each */
function fakeTools(
  start: { claude?: McpLaunch; codex?: McpLaunch } = {},
  options: { missing?: string[]; probe?: ProbeResult; ready?: boolean } = {}
) {
  const registered = { ...start }
  const calls: string[][] = []
  const ok = (stdout = ''): CommandResult => ({ code: 0, stdout, stderr: '' })
  const clients = new McpClients({
    launch: () => ({ ...OURS, ready: options.ready ?? true }),
    toolPath: () => '/usr/bin',
    probe: async () => options.probe ?? { ok: true, tools: ['my_tasks'] },
    run: async (command, args) => {
      calls.push([command, ...args])
      if (options.missing?.includes(command))
        return { code: null, stdout: '', stderr: '', missing: true }
      const [, verb] = args
      if (command === 'claude') {
        const launch = registered.claude
        if (verb === 'get')
          return ok(
            launch
              ? `pacenote:\n  Status: ✔ Connected\n  Command: ${launch.command}\n  Args: ${launch.args.join(' ')}\n  Environment:\n${Object.entries(
                  launch.env
                )
                  .map(([key, value]) => `    ${key}=${value}\n`)
                  .join('')}\n`
              : CLAUDE_ABSENT
          )
        if (verb === 'remove') {
          if (!launch)
            return {
              code: 1,
              stdout: '',
              stderr: 'No MCP server named "pacenote" in user scope',
            }
          delete registered.claude
          return ok()
        }
        if (verb === 'add-json') {
          if (launch)
            return {
              code: 1,
              stdout: '',
              stderr: 'MCP server pacenote already exists in user config',
            }
          const json = JSON.parse(args.at(-1)!) as McpLaunch
          registered.claude = {
            command: json.command,
            args: json.args,
            env: json.env,
          }
          return ok()
        }
      }
      if (command === 'codex') {
        if (verb === 'get')
          return registered.codex
            ? ok(codexJson(registered.codex))
            : {
                code: 1,
                stdout: '',
                stderr: "Error: No MCP server named 'pacenote' found.",
              }
        if (verb === 'remove') {
          delete registered.codex
          return ok()
        }
        if (verb === 'add') {
          const rest = args.slice(3)
          const split = rest.indexOf('--')
          const env = Object.fromEntries(
            rest
              .slice(0, split)
              .filter((_, index) => index % 2 === 1)
              .map((entry) => entry.split('=') as [string, string])
          )
          const [command, ...launchArgs] = rest.slice(split + 1)
          registered.codex = { command: command!, args: launchArgs, env }
          return ok()
        }
      }
      throw new Error(`unexpected ${command} ${args.join(' ')}`)
    },
  })
  return { clients, registered, calls }
}

describe('adding Pacenote to Claude Code and Codex from the app', () => {
  it('shows each tool’s state: not installed, not added, another Pacenote, connected', async () => {
    const elsewhere = {
      ...OURS,
      command: '/old/Pacenote.app/Contents/MacOS/Pacenote',
    }
    expect(
      (await fakeTools({ codex: elsewhere }).clients.status()).map((s) => [
        s.id,
        s.state,
        s.command,
      ])
    ).toEqual([
      ['claude', 'absent', undefined],
      ['codex', 'elsewhere', elsewhere.command],
    ])
    expect(
      (
        await fakeTools({}, { missing: ['claude', 'codex'] }).clients.status()
      ).map((s) => s.state)
    ).toEqual(['missing', 'missing'])
    // Codex has no check of its own: Pacenote asks the server for its tools.
    expect(
      await fakeTools({ claude: OURS, codex: OURS }).clients.status()
    ).toEqual([
      { id: 'claude', name: 'Claude Code', state: 'connected' },
      { id: 'codex', name: 'Codex', state: 'connected', tools: ['my_tasks'] },
    ])
    expect(
      await fakeTools(
        { codex: OURS },
        { probe: { ok: false, error: 'The server exited with code 1.' } }
      ).clients.check('codex')
    ).toMatchObject({
      state: 'failed',
      error: 'The server exited with code 1.',
    })
  })

  it('adds this app’s server to Claude Code at user scope, in place of another', async () => {
    const tools = fakeTools({ claude: { ...OURS, command: '/old/Pacenote' } })
    expect(await tools.clients.connect('claude')).toMatchObject({
      state: 'connected',
    })
    expect(tools.registered.claude).toEqual(OURS)
    expect(tools.calls.find((call) => call[2] === 'add-json')).toEqual([
      'claude',
      'mcp',
      'add-json',
      '--scope',
      'user',
      'pacenote',
      JSON.stringify({ type: 'stdio', ...OURS }),
    ])
  })

  it('adds it to Codex with its CLI, and takes it out again', async () => {
    const tools = fakeTools()
    expect(await tools.clients.connect('codex')).toMatchObject({
      state: 'connected',
      tools: ['my_tasks'],
    })
    expect(tools.registered.codex).toEqual(OURS)
    expect(await tools.clients.disconnect('codex')).toMatchObject({
      state: 'absent',
    })
    expect(await tools.clients.disconnect('claude')).toMatchObject({
      state: 'absent',
    })
    expect(tools.registered).toEqual({})
  })

  it('does not add a server that is not built', async () => {
    const tools = fakeTools({}, { ready: false })
    expect(await tools.clients.connect('claude')).toMatchObject({
      state: 'absent',
      error: expect.stringMatching(/pnpm bundle/),
    })
    expect(tools.calls.some((call) => call[2] === 'add-json')).toBe(false)
  })
})

/** A tiny MCP server over stdio: answers initialize and tools/list */
const FAKE_SERVER = `
let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let end
  while ((end = buffer.indexOf('\\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end))
    buffer = buffer.slice(end + 1)
    const reply = (result) =>
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n')
    if (message.method === 'initialize')
      reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } })
    if (message.method === 'tools/list')
      reply({ tools: [{ name: 'collect_context' }, { name: 'add_tasks' }] })
  }
})
`

describe('checking that a server answers over MCP', () => {
  it('lists the tools of a server that answers', async () => {
    expect(
      await probeMcp({
        command: process.execPath,
        args: ['-e', FAKE_SERVER],
        env: {},
      })
    ).toEqual({ ok: true, tools: ['collect_context', 'add_tasks'] })
  })

  it('reports a server that exits, one that is missing, and one that is silent', async () => {
    expect(
      await probeMcp({
        command: process.execPath,
        args: ['-e', 'console.error("Cannot find module x"); process.exit(1)'],
        env: {},
      })
    ).toEqual({ ok: false, error: 'Cannot find module x' })
    expect(
      await probeMcp({ command: '/nonexistent/Pacenote', args: [], env: {} })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/ENOENT/) })
    expect(
      await probeMcp(
        {
          command: process.execPath,
          args: ['-e', 'setInterval(() => {}, 1000)'],
          env: {},
        },
        { timeoutMs: 300 }
      )
    ).toEqual({ ok: false, error: 'The server did not answer in 0.3 seconds.' })
  })

  const bundled = new URL('../build/tools/history-mcp.mjs', import.meta.url)
  it.skipIf(!existsSync(bundled))(
    'reaches the bundled Pacenote server, with the task tools',
    async () => {
      const result = await probeMcp(
        {
          command: process.execPath,
          args: [bundled.pathname],
          env: {},
        },
        { timeoutMs: 10_000 }
      )
      expect(result.ok && result.tools).toEqual(
        expect.arrayContaining(['recent_runs', 'collect_context', 'add_tasks'])
      )
    }
  )
})
