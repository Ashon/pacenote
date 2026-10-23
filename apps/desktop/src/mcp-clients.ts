import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { localized } from '../../../src/i18n/locale.js'
import {
  MCP_CLIENT_IDS,
  MCP_CLIENT_NAMES,
  MCP_SERVER_NAME,
  parseClaudeGet,
  parseCodexGet,
  sameLaunch,
  type McpClientId,
  type McpClientStatus,
  type McpLaunch,
} from '../../../src/history/mcp-clients.js'
import {
  opencodeConfigFiles,
  opencodeWithout,
  parseOpencodeConfig,
} from '../../../src/history/opencode-config.js'
import { text } from './mcp-clients.text.js'

export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
  /** The command is not on the PATH */
  missing?: boolean
}

type RunCommand = (command: string, args: string[]) => Promise<CommandResult>

export type ProbeResult =
  { ok: true; tools: string[] } | { ok: false; error: string }

const COMMAND_TIMEOUT_MS = 60_000
const PROBE_TIMEOUT_MS = 15_000

/**
 * Adds Pacenote's MCP server to Claude Code, Codex and opencode with their own
 * CLIs (user scope, so every project has it), and checks that each one reaches
 * it, so nobody has to type the commands. Changes run only from a button in the
 * app.
 * - Claude Code: `claude mcp get` runs Claude's own connection check.
 * - Codex and opencode have no check of their own, so Pacenote launches what
 *   they have registered and lists the server's tools over MCP.
 * - opencode's CLI cannot take a server out, so Pacenote takes it out of
 *   opencode's global config itself, keeping the rest of the file as it was.
 */
export class McpClients {
  private readonly run: RunCommand
  private readonly probe: (launch: McpLaunch) => Promise<ProbeResult>

  constructor(
    private readonly options: {
      /** How this app launches the server; ready: the bundle exists */
      launch: () => McpLaunch & { ready: boolean }
      /**
       * PATH from the login shell, so claude and codex are found when the app
       * starts from Finder
       */
      toolPath: () => string
      /** For tests */
      run?: RunCommand
      probe?: (launch: McpLaunch) => Promise<ProbeResult>
      /** Where opencode's global config is looked for; for tests */
      opencodeFiles?: string[]
    }
  ) {
    const env = () => ({ ...process.env, PATH: options.toolPath() })
    this.run =
      options.run ?? ((command, args) => runCommand(command, args, env()))
    this.probe = options.probe ?? ((launch) => probeMcp(launch, { env: env() }))
  }

  status(): Promise<McpClientStatus[]> {
    return Promise.all(MCP_CLIENT_IDS.map((id) => this.check(id)))
  }

  async check(id: McpClientId): Promise<McpClientStatus> {
    const t = localized(text)
    const ours = this.ourLaunch()
    const status = (rest: Omit<McpClientStatus, 'id' | 'name'>) => ({
      id,
      name: MCP_CLIENT_NAMES[id],
      ...rest,
    })

    if (id === 'claude') {
      const result = await this.run('claude', ['mcp', 'get', MCP_SERVER_NAME])
      if (result.missing) return status({ state: 'missing' })
      const found = parseClaudeGet(result.stdout)
      if (!found) return status({ state: 'absent' })
      if (!sameLaunch(found.launch, ours))
        return status({ state: 'elsewhere', command: found.launch.command })
      return found.connected
        ? status({ state: 'connected' })
        : status({
            state: 'failed',
            error: found.issue ?? t.claudeCouldNot,
          })
    }

    if (id === 'opencode') {
      const version = await this.run('opencode', ['--version'])
      if (version.missing) return status({ state: 'missing' })
      const file = this.opencodeFile()
      if (!existsSync(file)) return status({ state: 'absent' })
      const found = parseOpencodeConfig(readFileSync(file, 'utf8'))
      if (!found) return status({ state: 'absent' })
      if (!found.launch || !sameLaunch(found.launch, ours))
        return status({
          state: 'elsewhere',
          command: found.launch?.command ?? found.url,
        })
      if (!found.enabled)
        return status({ state: 'failed', error: t.opencodeOff })
      const probe = await this.probe(found.launch)
      return probe.ok
        ? status({ state: 'connected', tools: probe.tools })
        : status({ state: 'failed', error: probe.error })
    }

    const result = await this.run('codex', [
      'mcp',
      'get',
      MCP_SERVER_NAME,
      '--json',
    ])
    if (result.missing) return status({ state: 'missing' })
    if (result.code !== 0)
      return /no mcp server named/i.test(result.stderr + result.stdout)
        ? status({ state: 'absent' })
        : status({ state: 'failed', error: firstLine(result) })
    const found = parseCodexGet(result.stdout)
    if (!found) return status({ state: 'failed', error: t.codexUnreadable })
    if (!found.launch || !sameLaunch(found.launch, ours))
      return status({
        state: 'elsewhere',
        command: found.launch?.command ?? found.url,
      })
    if (!found.enabled) return status({ state: 'failed', error: t.codexOff })
    const probe = await this.probe(found.launch)
    return probe.ok
      ? status({ state: 'connected', tools: probe.tools })
      : status({ state: 'failed', error: probe.error })
  }

  /** Adds this app's server to the tool, in place of what it had */
  async connect(id: McpClientId): Promise<McpClientStatus> {
    const launch = this.options.launch()
    if (!launch.ready)
      return { ...(await this.check(id)), error: localized(text).notBuilt }
    const ours = this.ourLaunch()
    let added: CommandResult
    if (id === 'claude') {
      // Claude Code does not replace a server of the same name.
      await this.remove(id)
      added = await this.run('claude', [
        'mcp',
        'add-json',
        '--scope',
        'user',
        MCP_SERVER_NAME,
        JSON.stringify({ type: 'stdio', ...ours }),
      ])
    } else if (id === 'opencode') {
      // opencode puts it in place of a server of the same name.
      added = await this.run('opencode', [
        'mcp',
        'add',
        '--global',
        ...Object.entries(ours.env).flatMap(([key, value]) => [
          '--env',
          `${key}=${value}`,
        ]),
        MCP_SERVER_NAME,
        '--',
        ours.command,
        ...ours.args,
      ])
    } else {
      added = await this.run('codex', [
        'mcp',
        'add',
        MCP_SERVER_NAME,
        ...Object.entries(ours.env).flatMap(([key, value]) => [
          '--env',
          `${key}=${value}`,
        ]),
        '--',
        ours.command,
        ...ours.args,
      ])
    }
    const status = await this.check(id)
    return added.code === 0 ? status : { ...status, error: firstLine(added) }
  }

  /** Takes Pacenote out of the tool */
  async disconnect(id: McpClientId): Promise<McpClientStatus> {
    const removed = await this.remove(id)
    const status = await this.check(id)
    return removed.code === 0 || status.state === 'absent'
      ? status
      : { ...status, error: firstLine(removed) }
  }

  private remove(id: McpClientId): Promise<CommandResult> {
    if (id === 'opencode') return Promise.resolve(this.removeFromOpencode())
    return id === 'claude'
      ? this.run('claude', [
          'mcp',
          'remove',
          MCP_SERVER_NAME,
          '--scope',
          'user',
        ])
      : this.run('codex', ['mcp', 'remove', MCP_SERVER_NAME])
  }

  /** opencode's global config: the one it reads, or where it would write */
  private opencodeFile(): string {
    const files =
      this.options.opencodeFiles ?? opencodeConfigFiles(process.env, homedir())
    return files.find((file) => existsSync(file)) ?? files.at(-1)!
  }

  private removeFromOpencode(): CommandResult {
    const file = this.opencodeFile()
    try {
      if (existsSync(file)) {
        const text = readFileSync(file, 'utf8')
        const next = opencodeWithout(text)
        if (next !== text) writeFileSync(file, next)
      }
      return { code: 0, stdout: '', stderr: '' }
    } catch (err) {
      return { code: 1, stdout: '', stderr: (err as Error).message }
    }
  }

  private ourLaunch(): McpLaunch {
    const { command, args, env } = this.options.launch()
    return { command, args, env }
  }
}

function firstLine(result: CommandResult): string {
  const lines = `${result.stderr}\n${result.stdout}`
    .split('\n')
    .map((line) => line.replace(/^error:\s*/i, '').trim())
    .filter(Boolean)
  return lines[0] ?? localized(text).exited(result.code)
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { env, cwd: homedir(), timeout: COMMAND_TIMEOUT_MS, maxBuffer: 1 << 20 },
      (error, stdout, stderr) => {
        const code = (error as NodeJS.ErrnoException | null)?.code
        resolve({
          code: error ? (typeof code === 'number' ? code : 1) : 0,
          stdout,
          stderr,
          missing: code === 'ENOENT',
        })
      }
    )
  })
}

/**
 * Launches an MCP server over stdio the way a tool would, and asks for its
 * tools: initialize, then tools/list.
 */
export function probeMcp(
  launch: McpLaunch,
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<ProbeResult> {
  const t = localized(text)
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    const child = spawn(launch.command, launch.args, {
      env: { ...(options.env ?? process.env), ...launch.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const finish = (result: ProbeResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      resolve(result)
    }
    const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS
    const timer = setTimeout(
      () => finish({ ok: false, error: t.noAnswer(timeoutMs / 1000) }),
      timeoutMs
    )
    const send = (message: object) =>
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)

    child.on('error', (error) => finish({ ok: false, error: error.message }))
    child.on('exit', (code) =>
      finish({
        ok: false,
        error: stderr.trim().split('\n').at(-1) || t.serverExited(code),
      })
    )
    child.stdin.on('error', () => undefined)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.stdout.on('data', (chunk: Buffer) => {
      const lines = (stdout + chunk.toString('utf8')).split('\n')
      stdout = lines.pop() ?? ''
      for (const line of lines) {
        let message: {
          id?: number
          error?: { message?: string }
          result?: { tools?: { name: string }[] }
        }
        try {
          message = JSON.parse(line.trim()) as typeof message
        } catch {
          continue
        }
        if (message.error)
          return finish({
            ok: false,
            error: message.error.message ?? t.refused,
          })
        if (message.id === 1) {
          send({ method: 'notifications/initialized' })
          send({ id: 2, method: 'tools/list' })
        } else if (message.id === 2) {
          finish({
            ok: true,
            tools: (message.result?.tools ?? []).map((tool) => tool.name),
          })
        }
      }
    })
    send({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pacenote-check', version: '1' },
      },
    })
  })
}
