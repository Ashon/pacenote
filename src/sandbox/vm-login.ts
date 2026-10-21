import { spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { localized } from '../i18n/locale.js'
import type { Logger } from '../logger.js'
import { EgressProxy, type Resolve } from './egress.js'
import { SANDBOX_PATHS, type Mount } from './runtime.js'
import { vmRunArgs } from './vm.js'
import type { LoginResult } from './types.js'
import { text } from './vm-login.text.js'

/**
 * The built-in sandbox's own sign-in to Claude Code or Codex. The CLI's own
 * login runs in a VM, through the vendor's own flow, and the CLI keeps what it
 * gets in a login folder on this Mac that each run's VM then has as the CLI's
 * config folder. Pacenote starts the login, shows its link and code, and hands
 * the code Claude's page shows back to the CLI; it never reads what the CLI
 * keeps (Claude Code's terms: no collecting, storing or passing on claude.ai
 * credentials; sign-in completes through Anthropic's own flow).
 */
export type LoginCli = 'claude' | 'codex'

/** Where the login folder is in the VM */
export const LOGIN_AT = '/run/login'

/** The variable that makes the folder the CLI's config folder */
export const LOGIN_ENV: Record<LoginCli, string> = {
  claude: 'CLAUDE_CONFIG_DIR',
  codex: 'CODEX_HOME',
}

/** The file whose presence says the CLI is signed in; never read */
const SIGNED_IN: Record<LoginCli, string> = {
  claude: '.credentials.json',
  codex: 'auth.json',
}

/**
 * What a CLI keeps in the folder between runs. The rest (sessions, history,
 * logs) goes once no run is using the folder, as HOME does after each run.
 */
const KEEP: Record<LoginCli, readonly string[]> = {
  claude: ['.credentials.json', '.claude.json'],
  codex: ['auth.json', 'generated_images'],
}

/** The hosts each login reaches from the VM, and nothing else */
export const LOGIN_DOMAINS: Record<LoginCli, readonly string[]> = {
  claude: ['platform.claude.com', 'api.anthropic.com'],
  codex: ['auth.openai.com'],
}

/** A login left waiting for the browser this long is given up */
const LOGIN_TIMEOUT_MS = 15 * 60_000

export function loginDir(vmRoot: string, cli: LoginCli): string {
  return path.join(vmRoot, 'login', cli)
}

/** Whether the CLI signed in, from whether its credentials file is there */
export function signedIn(vmRoot: string, cli: LoginCli): boolean {
  return existsSync(path.join(loginDir(vmRoot, cli), SIGNED_IN[cli]))
}

/**
 * The login folder, made if missing. Codex in it puts the images it generates
 * in generated_images, which links to the run's output folder in the VM.
 */
export function prepareLoginDir(dir: string, cli: LoginCli): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (cli !== 'codex') return
  const images = path.join(dir, 'generated_images')
  let there = false
  try {
    lstatSync(images)
    there = true
  } catch {
    // Not made yet.
  }
  if (!there) symlinkSync(SANDBOX_PATHS.output, images)
}

/** Takes away all but what the CLI keeps between runs */
export function tidyLoginDir(dir: string, cli: LoginCli): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names)
    if (!KEEP[cli].includes(name))
      rmSync(path.join(dir, name), { recursive: true, force: true })
}

/** Signs the sandbox's CLI out: its login folder goes */
export function signOut(vmRoot: string, cli: LoginCli): void {
  rmSync(loginDir(vmRoot, cli), { recursive: true, force: true })
}

const holds = new Map<string, number>()

/**
 * A run's use of a login folder: the mount and variable it needs, and a
 * release that tidies the folder once no run holds it
 */
export function holdLogin(
  dir: string,
  cli: LoginCli
): { mount: Mount; env: Record<string, string>; release: () => void } {
  prepareLoginDir(dir, cli)
  holds.set(dir, (holds.get(dir) ?? 0) + 1)
  let released = false
  return {
    mount: { host: dir, at: LOGIN_AT, writable: true },
    env: { [LOGIN_ENV[cli]]: LOGIN_AT },
    release: () => {
      if (released) return
      released = true
      const left = (holds.get(dir) ?? 1) - 1
      if (left > 0) {
        holds.set(dir, left)
        return
      }
      holds.delete(dir)
      tidyLoginDir(dir, cli)
    },
  }
}

/**
 * What the login asks of the person: a page to open, and either a code to
 * enter there (Codex) or the code the page shows to paste back (Claude)
 */
export interface LoginPrompt {
  url: string
  /** Codex: the one-time code to enter on the page */
  code?: string
  /** Claude: the page shows a code to paste back here */
  paste?: boolean
}

// eslint-disable-next-line no-control-regex -- terminal colors
const ANSI = /\x1b\[[0-9;]*m/g

/** The prompt in what the CLI printed so far, once it is all there */
export function parseLoginPrompt(
  cli: LoginCli,
  output: string
): LoginPrompt | undefined {
  const text = output.replace(ANSI, '')
  if (cli === 'claude') {
    const url = /visit:\s*(https:\/\/\S+)/.exec(text)?.[1]
    return url ? { url, paste: true } : undefined
  }
  const url = /(https:\/\/auth\.openai\.com\/\S*device\S*)/.exec(text)?.[1]
  const code = /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/.exec(text)?.[1]
  return url && code ? { url, code } : undefined
}

const LOGIN_COMMAND: Record<LoginCli, { command: string; args: string[] }> = {
  claude: { command: 'claude', args: ['auth', 'login', '--claudeai'] },
  codex: { command: 'codex', args: ['login', '--device-auth'] },
}

export type { LoginResult }

/**
 * One sign-in, in a VM of its own: start() runs the CLI's login and calls
 * onPrompt once its link (and code) are printed; submit() hands Claude the
 * code its page showed; cancel() stops it.
 */
export class VmLogin {
  private child?: ChildProcess
  private cancelled = false

  constructor(
    private readonly options: {
      cli: LoginCli
      /** pacenote-vm */
      bin: string
      /** pacenote-vm's folder */
      root: string
      image: string
      resolve?: Resolve
      log?: Logger
    }
  ) {}

  async start(onPrompt: (prompt: LoginPrompt) => void): Promise<LoginResult> {
    const { cli, bin, root, image } = this.options
    const dir = loginDir(root, cli)
    prepareLoginDir(dir, cli)
    // Only the hosts the login needs, whatever the runs' list allows
    const egress = new EgressProxy({
      socket: path.join(tmpdir(), `pacenote-login-${process.pid}.sock`),
      allowed: () => LOGIN_DOMAINS[cli],
      resolve: this.options.resolve,
      log: this.options.log?.child('egress'),
    })
    await egress.listen()
    const env = { [LOGIN_ENV[cli]]: LOGIN_AT }
    const { command, args } = LOGIN_COMMAND[cli]
    try {
      return await new Promise<LoginResult>((resolve) => {
        const child = spawn(
          bin,
          vmRunArgs(
            { root, image, memoryMiB: 512, cpus: 1 },
            {
              command,
              args,
              env,
              mounts: [{ host: dir, at: LOGIN_AT, writable: true }],
            },
            egress.socket
          ),
          {
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        )
        this.child = child
        let output = ''
        let prompted = false
        const read = (chunk: Buffer) => {
          output += chunk.toString('utf8')
          if (prompted) return
          const prompt = parseLoginPrompt(cli, output)
          if (!prompt) return
          prompted = true
          onPrompt(prompt)
        }
        child.stdout.on('data', read)
        child.stderr.on('data', read)
        const timer = setTimeout(() => child.kill('SIGTERM'), LOGIN_TIMEOUT_MS)
        child.on('error', (err) => {
          clearTimeout(timer)
          resolve({ ok: false, error: err.message })
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          this.child = undefined
          if (this.cancelled)
            resolve({
              ok: false,
              error: localized(text).cancelled,
              cancelled: true,
            })
          else if (code === 0 && signedIn(root, cli)) resolve({ ok: true })
          else resolve({ ok: false, error: failure(output, code) })
        })
      })
    } finally {
      await egress.close()
    }
  }

  /** Claude: the code its page showed, as the CLI's prompt takes it */
  submit(code: string): void {
    this.child?.stdin?.write(`${code.trim()}\n`)
  }

  cancel(): void {
    this.cancelled = true
    this.child?.kill('SIGTERM')
  }
}

/** Why a login ended without signing in, from the CLI's last words */
function failure(output: string, code: number | null): string {
  const last = output
    .replace(ANSI, '')
    // claude's prompt has no line of its own: what follows it is the answer
    .replace(/Paste code here if prompted >/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
  const t = localized(text)
  return last ? t.notFinished(last) : t.notFinishedCode(code)
}
