import { lookup } from 'node:dns/promises'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { expandHome } from '../../../src/settings/home.js'
import { runCommand, type RunCommand } from './command.js'
import {
  byCount,
  githubOwner,
  namesOneHost,
  parseSshConfig,
  privateRange,
  remoteUrls,
  type FoundGap,
  type FoundName,
  type FoundOnMac,
  type SshHost,
} from '../../../src/settings/found.js'

/** Folders in your home that often hold repositories, for the work folder */
const HOME_FOLDERS = [
  'git',
  'github',
  'workspaces',
  'workspace',
  'src',
  'code',
  'Developer',
  'projects',
  'repos',
  'dev',
  'work',
]

const COMMAND_TIMEOUT_MS = 15_000
const RESOLVE_TIMEOUT_MS = 1_500
/** How long what the tools found holds before they are asked again */
const KEEP_MS = 60_000
/** How deep and how far a folder is looked through for repositories */
const REPO_DEPTH = 3
const REPO_DIRS = 5_000

/**
 * What Settings > Tools offers to pick for each connection, looked up on this
 * Mac (src/settings/found.ts): folders of repositories in your home, your gh
 * account and its orgs (or, without gh, the owners of the work folder's
 * repositories), your kubeconfig contexts, and the users, keys and private
 * ranges of the hosts in your SSH config. It reads names and paths only: gh
 * and kubectl print names, and keys are found by their paths, never opened.
 */
export class FoundHere {
  private readonly run: RunCommand
  private readonly home: string
  private readonly resolve: (name: string) => Promise<string | undefined>
  private tools?: { at: number; found: Promise<FoundOnMac> }

  constructor(
    private readonly options: {
      /** PATH from the login shell, so gh and kubectl are found */
      toolPath: () => string
      /** For tests */
      run?: RunCommand
      home?: string
      resolve?: (name: string) => Promise<string | undefined>
      now?: () => number
    }
  ) {
    this.run =
      options.run ??
      ((command, args) =>
        runCommand(command, args, {
          env: { ...process.env, PATH: options.toolPath() },
          timeoutMs: COMMAND_TIMEOUT_MS,
        }))
    this.home = options.home ?? homedir()
    this.resolve = options.resolve ?? resolveIpv4
  }

  /**
   * The names for each setting. workFolder: the work folder as the screen has
   * it, saved or not, for the owners of its repositories. fresh: looks at
   * everything again ("Look again"); otherwise what was found holds a minute.
   */
  async find(workFolder?: string, fresh = false): Promise<FoundOnMac> {
    const now = (this.options.now ?? Date.now)()
    if (fresh || !this.tools || now - this.tools.at > KEEP_MS)
      this.tools = { at: now, found: this.fromTools() }
    const tools = await this.tools.found
    const folder = workFolder?.trim()
    // gh knows your orgs; without it, the owners of your repositories stand in.
    const gh = tools.names.OPS_GIT_ALLOWED_OWNERS ?? []
    return {
      names: {
        ...tools.names,
        OPS_GIT_ALLOWED_OWNERS:
          gh.length > 0 || !folder || !path.isAbsolute(folder)
            ? gh
            : this.repoOwners(folder),
      },
      gaps: tools.gaps,
    }
  }

  private async fromTools(): Promise<FoundOnMac> {
    const [github, k8s, ssh] = await Promise.all([
      this.github(),
      this.contexts(),
      this.ssh(),
    ])
    return {
      names: {
        OPS_FS_ROOT: this.workFolders(),
        OPS_GIT_ALLOWED_OWNERS: github.names,
        OPS_K8S_CONTEXTS: k8s.names,
        ...ssh,
      },
      gaps: [...github.gaps, ...k8s.gaps],
    }
  }

  /** Your gh account, then its orgs */
  private async github(): Promise<{ names: FoundName[]; gaps: FoundGap[] }> {
    const user = await this.run('gh', ['api', 'user', '--jq', '.login'])
    if (user.missing) return { names: [], gaps: ['noGh'] }
    if (user.code !== 0)
      return {
        names: [],
        gaps: /auth login|not logged|authenticat/i.test(user.stderr)
          ? ['ghSignedOut']
          : [],
      }
    const orgs = await this.run('gh', [
      'api',
      'user/orgs',
      '--paginate',
      '--jq',
      '.[].login',
    ])
    const names = [
      ...lines(user.stdout),
      ...(orgs.code === 0 ? lines(orgs.stdout) : []),
    ]
    return {
      names: names.map((value) => ({ value, from: 'gh' as const })),
      gaps: [],
    }
  }

  private async contexts(): Promise<{ names: FoundName[]; gaps: FoundGap[] }> {
    const result = await this.run('kubectl', [
      'config',
      'get-contexts',
      '-o',
      'name',
    ])
    if (result.missing) return { names: [], gaps: ['noKubectl'] }
    return {
      names:
        result.code === 0
          ? lines(result.stdout).map((value) => ({
              value,
              from: 'kubeconfig' as const,
            }))
          : [],
      gaps: [],
    }
  }

  /** Users, keys and private ranges from your SSH config and ~/.ssh */
  private async ssh(): Promise<FoundOnMac['names']> {
    const sshDir = path.join(this.home, '.ssh')
    const config = readText(path.join(sshDir, 'config'))
    const all = config
      ? parseSshConfig(config, (file) => this.included(file, sshDir))
      : []
    // Git hosting and VMs on this Mac are no hosts for the broker to check,
    // and their keys no keys for it.
    const hosts = all.filter((host) => !notChecked(host))
    const keysOf = (each: SshHost[]) =>
      each.flatMap((host) =>
        host.identityFiles.flatMap((file) => this.keyPath(file) ?? [])
      )
    const theirs = new Set(keysOf(all.filter(notChecked)))
    const users = byCount(hosts.flatMap((host) => host.user ?? []))
    const keyUses = byCount(keysOf(hosts))
    const keys: FoundName[] = keyUses
      .filter(({ value }) => existsSync(value))
      .map(({ value, count }) => ({ value, from: 'sshConfig', count }))
    for (const name of safeList(sshDir)) {
      const key = path.join(sshDir, name)
      if (
        !name.endsWith('.pub') &&
        existsSync(`${key}.pub`) &&
        !theirs.has(key) &&
        !keys.some((each) => each.value === key)
      )
        keys.push({ value: key, from: 'sshFolder' })
    }
    return {
      OPS_SSH_USER: users.map(({ value, count }) => ({
        value,
        from: 'sshConfig',
        count,
      })),
      OPS_SSH_KEY: keys,
      OPS_SSH_ALLOWED_CIDR: await this.ranges(hosts),
    }
  }

  /** The private /24s your SSH hosts are in, with the hosts in each */
  private async ranges(hosts: SshHost[]): Promise<FoundName[]> {
    const named = hosts.filter(
      (host) => host.patterns.length > 0 && host.patterns.every(namesOneHost)
    )
    const found = await Promise.all(
      named.map(async (host) => {
        const alias = host.patterns[0]!
        const address = (host.hostName ?? alias).replaceAll('%h', alias)
        const ip = /^[\d.]+$/.test(address)
          ? address
          : await this.resolve(address)
        const range = ip ? privateRange(ip) : undefined
        return range ? { range, alias } : undefined
      })
    )
    const byRange = new Map<string, string[]>()
    for (const each of found)
      if (each)
        byRange.set(each.range, [
          ...(byRange.get(each.range) ?? []),
          each.alias,
        ])
    return [...byRange]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([value, names]) => ({
        value,
        from: 'sshConfig' as const,
        count: names.length,
        hosts: names,
      }))
  }

  /** The files an Include line names: ~ and relative paths, * in the name */
  private included(pattern: string, sshDir: string): string[] {
    const file = this.expand(pattern, sshDir)
    if (!file) return []
    const base = path.basename(file)
    if (!/[*?]/.test(base)) return [readText(file)].filter(isText)
    const dir = path.dirname(file)
    const match = new RegExp(
      `^${base
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replaceAll('*', '.*')
        .replaceAll('?', '.')}$`
    )
    return safeList(dir)
      .filter((name) => match.test(name))
      .sort()
      .map((name) => readText(path.join(dir, name)))
      .filter(isText)
  }

  /** An IdentityFile as a path: ~ and %d are your home; other tokens skipped */
  private keyPath(file: string): string | undefined {
    const expanded = file.replaceAll('%d', this.home)
    return expanded.includes('%')
      ? undefined
      : this.expand(expanded, path.join(this.home, '.ssh'))
  }

  private expand(file: string, relativeTo: string): string | undefined {
    // ~name is someone else's home
    if (/^~[^/]/.test(file)) return undefined
    const expanded = expandHome(file, this.home)
    return path.isAbsolute(expanded)
      ? expanded
      : path.join(relativeTo, expanded)
  }

  /** Folders in your home with repositories in them, most first */
  private workFolders(): FoundName[] {
    return HOME_FOLDERS.map((name) => path.join(this.home, name))
      .filter(isDir)
      .map((folder) => ({
        value: folder,
        from: 'home' as const,
        count: repositories(folder).length,
      }))
      .filter((each) => each.count > 0)
      .sort((a, b) => b.count - a.count)
  }

  /** The GitHub owners of a folder's repositories, by how many each has */
  private repoOwners(folder: string): FoundName[] {
    const owners = repositories(folder).flatMap((repo) =>
      remoteUrls(readText(path.join(repo, '.git', 'config')) ?? '').flatMap(
        (url) => githubOwner(url) ?? []
      )
    )
    return byCount(owners, (owner) => owner.toLowerCase()).map(
      ({ value, count }) => ({ value, from: 'repositories', count })
    )
  }
}

/** A host on a git hosting service, or on this Mac (a VM's forwarded port) */
function notChecked(host: SshHost): boolean {
  return [host.hostName, ...host.patterns].some(
    (name) =>
      name !== undefined &&
      (/(^|\.)(github\.com|gitlab\.com|bitbucket\.org)$/i.test(name) ||
        /^(localhost|127\.\d+\.\d+\.\d+|::1)$/i.test(name))
  )
}

/**
 * The repositories in a folder, up to three levels down
 * (~/git/github/owner/repo), without looking into them, hidden folders or
 * node_modules
 */
export function repositories(folder: string): string[] {
  const found: string[] = []
  let looked = 0
  const walk = (dir: string, depth: number) => {
    if (looked++ > REPO_DIRS) return
    if (existsSync(path.join(dir, '.git'))) {
      found.push(dir)
      return
    }
    if (depth >= REPO_DEPTH) return
    for (const name of safeList(dir).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const child = path.join(dir, name)
      if (isDir(child)) walk(child, depth + 1)
    }
  }
  walk(folder, 0)
  return found
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const isText = (text: string | undefined): text is string =>
  typeof text === 'string'

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isDir(file: string): boolean {
  try {
    return statSync(file).isDirectory()
  } catch {
    return false
  }
}

/** A name's IPv4 address, or none when it does not resolve in a moment */
async function resolveIpv4(name: string): Promise<string | undefined> {
  const timeout = new Promise<undefined>((resolve) =>
    setTimeout(() => resolve(undefined), RESOLVE_TIMEOUT_MS).unref()
  )
  const found = lookup(name, { family: 4 })
    .then((result) => result.address)
    .catch(() => undefined)
  return Promise.race([found, timeout])
}
