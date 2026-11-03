import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { readJson, writeJson } from '../json-file.js'
import { privateAddress } from '../macs/network.js'

/**
 * The MCP servers Pace may use when it answers (Settings > Tools): HTTP ones
 * only. Pace connects to them here on this Mac for the reasoner in the
 * built-in sandbox (pace/mcp-relay.ts), so their headers stay in this file,
 * which only you read, and never reach the sandbox. Each has a Read switch,
 * on when added, for the tools a server marks read-only, and a Write switch,
 * off until turned on, for the rest. A server that runs here as a program
 * (stdio) is not offered: it would run outside the sandbox.
 */
export interface McpServerSetting {
  /** How the model knows it: lowercase letters, digits, - and _ */
  name: string
  url: string
  /** Sent with each request: an Authorization header, an API key */
  headers: Record<string, string>
  /** sse for a server on the older transport; streamable HTTP otherwise */
  transport?: McpTransport
  read: boolean
  write: boolean
  /** Where it was taken from, when it came from an AI tool's settings */
  from?: McpServerSource
}

export type McpTransport = 'http' | 'sse'

/** An AI tool's settings a server was found in, and the project, if any */
export interface McpServerSource {
  cli: 'claude' | 'codex'
  project?: string
}

/**
 * A server as the settings screen sees it: its headers by name, never their
 * values
 */
export interface McpServerView extends Omit<McpServerSetting, 'headers'> {
  headers: string[]
  where: McpServerPlace
}

/**
 * What the screen sends to save a server: a header left null keeps the value
 * it had
 */
export interface McpServerDraft extends Omit<McpServerSetting, 'headers'> {
  headers: Record<string, string | null>
}

/** A server found in Claude Code's or Codex's settings, not added yet */
export interface McpServerCandidate {
  name: string
  url: string
  transport?: McpTransport
  from: McpServerSource
  /** Headers it has, by name */
  headers: string[]
  /** Headers whose values are not in that file, to fill in here */
  missing: string[]
  where: McpServerPlace
}

/** Where a server answers: this Mac, a network of your own, or the internet */
export type McpServerPlace = 'mac' | 'network' | 'internet'

export type McpServerIssue =
  'name' | 'nameTaken' | 'nameReserved' | 'url' | 'header' | 'notFound'

/** Names Pace's own servers use (config.ts) */
const RESERVED = ['pacenote', 'ops']
const NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/
/** A header name as HTTP allows it */
const HEADER = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/** The servers in the file; one that does not read as a server is left out */
export function readMcpServers(file: string): McpServerSetting[] {
  const value = readJson<{ servers?: unknown }>(file, {})
  if (!Array.isArray(value.servers)) return []
  return value.servers.flatMap((each: unknown) => {
    const server = each as Partial<McpServerSetting> | null
    if (!server || typeof server.name !== 'string') return []
    if (typeof server.url !== 'string') return []
    const headers = Object.fromEntries(
      Object.entries(server.headers ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
    return [
      {
        name: server.name,
        url: server.url,
        headers,
        ...(server.transport === 'sse' || server.transport === 'http'
          ? { transport: server.transport }
          : {}),
        read: server.read !== false,
        write: server.write === true,
        ...(server.from ? { from: server.from } : {}),
      },
    ]
  })
}

function writeMcpServers(file: string, servers: McpServerSetting[]): void {
  writeJson(file, { servers }, 0o600)
}

/** Where a URL answers, by its host alone (nothing is looked up) */
export function placeOf(url: string): McpServerPlace {
  let host: string
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return 'internet'
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host.startsWith('127.')
  )
    return 'mac'
  if (host.endsWith('.local') || privateAddress(host)) return 'network'
  return 'internet'
}

/** The servers for the screen, their header values left out */
export function viewMcpServers(servers: McpServerSetting[]): McpServerView[] {
  return servers.map(({ headers, ...server }) => ({
    ...server,
    headers: Object.keys(headers),
    where: placeOf(server.url),
  }))
}

/** What is wrong with a server about to be saved among the others */
export function checkMcpServer(
  server: McpServerDraft,
  others: McpServerSetting[]
): McpServerIssue[] {
  const issues: McpServerIssue[] = []
  if (!NAME.test(server.name)) issues.push('name')
  else if (RESERVED.includes(server.name)) issues.push('nameReserved')
  else if (others.some((other) => other.name === server.name))
    issues.push('nameTaken')
  let url: URL | undefined
  try {
    url = new URL(server.url)
  } catch {
    // Reported below
  }
  if (!url || !['http:', 'https:'].includes(url.protocol)) issues.push('url')
  if (Object.keys(server.headers).some((name) => !HEADER.test(name)))
    issues.push('header')
  return issues
}

/**
 * Adds a server, or saves one by the name it had (previous). A header sent
 * as null keeps its value; one left out goes.
 */
export function saveMcpServer(
  file: string,
  draft: McpServerDraft,
  previous?: string
): McpServerIssue[] {
  const servers = readMcpServers(file)
  const was = previous
    ? servers.find((server) => server.name === previous)
    : undefined
  if (previous && !was) return ['notFound']
  const others = servers.filter((server) => server !== was)
  const issues = checkMcpServer(draft, others)
  if (issues.length > 0) return issues
  const headers = Object.fromEntries(
    Object.entries(draft.headers).flatMap(([name, value]) => {
      const kept = value ?? was?.headers[name]
      return kept === undefined ? [] : [[name, kept]]
    })
  )
  const saved: McpServerSetting = {
    name: draft.name,
    url: draft.url.trim(),
    headers,
    ...(draft.transport ? { transport: draft.transport } : {}),
    read: draft.read,
    write: draft.write,
    ...(draft.from ? { from: draft.from } : {}),
  }
  writeMcpServers(
    file,
    was
      ? servers.map((server) => (server === was ? saved : server))
      : [...servers, saved]
  )
  return []
}

export function removeMcpServer(file: string, name: string): void {
  const servers = readMcpServers(file)
  const left = servers.filter((server) => server.name !== name)
  if (left.length !== servers.length) writeMcpServers(file, left)
}

/** A name the model can use, from one an AI tool's settings gave */
export function mcpServerName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[-_]+|-+$/g, '')
      .slice(0, 40) || 'server'
  )
}

interface FoundServer {
  name: string
  url: string
  transport?: McpTransport
  headers: Record<string, string>
  missing: string[]
  from: McpServerSource
}

/**
 * HTTP servers in Claude Code's settings (~/.claude.json): yours, and each
 * project's. A header written as ${VARIABLE} has its value elsewhere.
 */
export function claudeServers(file: string): FoundServer[] {
  if (!existsSync(file)) return []
  const config = readJson<{
    mcpServers?: Record<string, unknown>
    projects?: Record<string, { mcpServers?: Record<string, unknown> }>
  }>(file, {})
  const found = (
    servers: Record<string, unknown> | undefined,
    project?: string
  ): FoundServer[] =>
    Object.entries(servers ?? {}).flatMap(([name, each]) => {
      const server = each as {
        type?: string
        url?: string
        headers?: Record<string, unknown>
      }
      if (typeof server?.url !== 'string') return []
      if (server.type && !['http', 'sse'].includes(server.type)) return []
      const headers: Record<string, string> = {}
      const missing: string[] = []
      for (const [header, value] of Object.entries(server.headers ?? {}))
        if (typeof value === 'string' && !value.includes('${'))
          headers[header] = value
        else missing.push(header)
      return [
        {
          name,
          url: server.url,
          ...(server.type === 'sse' ? { transport: 'sse' as const } : {}),
          headers,
          missing,
          from: { cli: 'claude' as const, ...(project ? { project } : {}) },
        },
      ]
    })
  return [
    ...found(config.mcpServers),
    ...Object.entries(config.projects ?? {}).flatMap(([folder, project]) =>
      found(project.mcpServers, path.basename(folder))
    ),
  ]
}

/**
 * HTTP servers in Codex's config.toml ([mcp_servers.<name>] with a url).
 * A token codex reads from the environment (bearer_token_env_var,
 * env_http_headers) is a header to fill in here.
 */
export function codexServers(file: string): FoundServer[] {
  if (!existsSync(file)) return []
  const tables = new Map<string, Record<string, string>>()
  let table: Record<string, string> | undefined
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const header = /^\s*\[([^\]]+)\]\s*(#.*)?$/.exec(line)
    if (header) {
      const key = header[1]!.trim()
      table = tables.get(key) ?? {}
      tables.set(key, table)
      continue
    }
    const entry = /^\s*("[^"]+"|[\w-]+)\s*=\s*(.+?)\s*$/.exec(line)
    if (entry && table) table[unquote(entry[1]!)] = entry[2]!
  }
  const servers: FoundServer[] = []
  for (const [key, values] of tables) {
    const name = /^mcp_servers\.("[^"]+"|[\w-]+)$/.exec(key)?.[1]
    if (!name || !values.url) continue
    const url = stringValue(values.url)
    if (!url) continue
    const headers = {
      ...inlineTable(values.http_headers),
      ...stringTable(tables.get(`${key}.http_headers`)),
    }
    const missing = [
      ...(values.bearer_token_env_var ? ['Authorization'] : []),
      ...Object.keys({
        ...inlineTable(values.env_http_headers),
        ...stringTable(tables.get(`${key}.env_http_headers`)),
      }),
    ].filter((header) => !(header in headers))
    servers.push({
      name: unquote(name),
      url,
      headers,
      missing,
      from: { cli: 'codex' },
    })
  }
  return servers
}

const unquote = (value: string) => value.replace(/^"|"$/g, '')

/** A TOML basic string's value */
function stringValue(value: string | undefined): string | undefined {
  return value ? /^"([^"]*)"/.exec(value)?.[1] : undefined
}

/** A TOML inline table of strings: { "X-Key" = "value", Other = "v" } */
function inlineTable(value: string | undefined): Record<string, string> {
  if (!value?.startsWith('{')) return {}
  return Object.fromEntries(
    [...value.matchAll(/("[^"]+"|[\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [
      unquote(m[1]!),
      m[2]!,
    ])
  )
}

function stringTable(
  values: Record<string, string> | undefined
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values ?? {}).flatMap(([name, value]) => {
      const text = stringValue(value)
      return text === undefined ? [] : [[name, text]]
    })
  )
}

/**
 * The HTTP servers Claude Code and Codex have on this Mac that are not added
 * here yet, each once; with the values found, to add as they are
 */
export function foundMcpServers(
  added: McpServerSetting[],
  home = homedir()
): (McpServerCandidate & { values: Record<string, string> })[] {
  const seen = new Set(added.map((server) => server.url))
  const names = new Set(added.map((server) => server.name))
  return [
    ...claudeServers(path.join(home, '.claude.json')),
    ...codexServers(path.join(home, '.codex', 'config.toml')),
  ].flatMap((server) => {
    if (seen.has(server.url)) return []
    seen.add(server.url)
    let name = mcpServerName(server.name)
    if (RESERVED.includes(name) || names.has(name)) {
      let n = 2
      while (names.has(`${name}-${n}`)) n++
      name = `${name}-${n}`
    }
    names.add(name)
    return [
      {
        name,
        url: server.url,
        ...(server.transport ? { transport: server.transport } : {}),
        from: server.from,
        headers: [...Object.keys(server.headers), ...server.missing],
        missing: server.missing,
        where: placeOf(server.url),
        values: server.headers,
      },
    ]
  })
}
