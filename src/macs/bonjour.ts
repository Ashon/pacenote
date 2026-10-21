import { spawn, type ChildProcess } from 'node:child_process'

/**
 * Finding your other Macs on the network with Bonjour, through macOS's own
 * dns-sd: each Mac advertises Pacenote (_pacenote._tcp) with its group and id,
 * and looks for the others. Nothing is installed for it, and macOS asks once
 * whether Pacenote may look on the local network.
 */

export const SERVICE = '_pacenote._tcp'
const DNS_SD = '/usr/bin/dns-sd'
const RESOLVE_MS = 5_000

/** A Mac found on the network */
export interface Found {
  /** Its Bonjour name, the Mac's name */
  instance: string
  host: string
  port: number
  /** From its TXT record */
  group?: string
  id?: string
}

/** A line of `dns-sd -B`: a Mac that came or went */
export function browseLine(
  line: string
): { added: boolean; instance: string } | undefined {
  const match =
    /^\s*\S+\s+(Add|Rmv)\s+\d+\s+\d+\s+\S+\s+_pacenote\._tcp\.\s+(.+?)\s*$/.exec(
      line
    )
  return match ? { added: match[1] === 'Add', instance: match[2]! } : undefined
}

/**
 * Where `dns-sd -L` says a Mac can be reached, and its TXT record on the line
 * after, or undefined until both have come
 */
export function resolved(
  output: string
): { host: string; port: number; txt: Record<string, string> } | undefined {
  const lines = output.split('\n')
  const at = lines.findIndex((line) => / can be reached at /.test(line))
  if (at < 0 || at + 1 >= lines.length) return undefined
  const where = / can be reached at (\S+):(\d+)/.exec(lines[at]!)
  if (!where) return undefined
  const txt: Record<string, string> = {}
  for (const pair of lines[at + 1]!.trim().split(/\s+/)) {
    const eq = pair.indexOf('=')
    if (eq > 0) txt[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  if (!txt.g) return undefined
  return {
    host: where[1]!.replace(/\.$/, ''),
    port: Number(where[2]),
    txt,
  }
}

/**
 * Advertising this Mac and looking for the others, until stop(). found and
 * lost tell about the Macs in the same group; a Mac with another Slack app is
 * never reported.
 */
export class Bonjour {
  private readonly children: ChildProcess[] = []
  /** Each Mac is seen once per network interface: how many now */
  private readonly seen = new Map<string, number>()
  private stopped = false

  constructor(
    private readonly options: {
      name: string
      port: number
      group: string
      id: string
      found: (mac: Found) => void
      lost: (instance: string) => void
      log: (message: string) => void
      /** dns-sd, unless a test names another */
      bin?: string
    }
  ) {}

  start(): void {
    const { name, port, group, id } = this.options
    this.children.push(
      this.run([
        '-R',
        name,
        SERVICE,
        'local.',
        String(port),
        `g=${group}`,
        `id=${id}`,
      ])
    )
    const browser = this.run(['-B', SERVICE, 'local.'])
    this.children.push(browser)
    let rest = ''
    browser.stdout?.on('data', (chunk: Buffer) => {
      const lines = (rest + chunk.toString()).split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines) {
        const event = browseLine(line)
        if (!event) continue
        const count = this.seen.get(event.instance) ?? 0
        const next = Math.max(0, count + (event.added ? 1 : -1))
        if (next > 0) this.seen.set(event.instance, next)
        else this.seen.delete(event.instance)
        if (count === 0 && next > 0) void this.resolve(event.instance)
        else if (count > 0 && next === 0) this.options.lost(event.instance)
      }
    })
  }

  stop(): void {
    this.stopped = true
    for (const child of this.children.splice(0)) child.kill()
  }

  private async resolve(instance: string): Promise<void> {
    const child = this.run(['-L', instance, SERVICE, 'local.'])
    this.children.push(child)
    const result = await new Promise<ReturnType<typeof resolved>>((settle) => {
      let output = ''
      const timer = setTimeout(() => settle(undefined), RESOLVE_MS)
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        const found = resolved(output)
        if (found) {
          clearTimeout(timer)
          settle(found)
        }
      })
      child.once('exit', () => {
        clearTimeout(timer)
        settle(resolved(output))
      })
    })
    child.kill()
    this.children.splice(this.children.indexOf(child), 1)
    if (this.stopped || !result) return
    if (result.txt.g !== this.options.group) return
    if (result.txt.id === this.options.id) return
    this.options.found({
      instance,
      host: result.host,
      port: result.port,
      group: result.txt.g,
      id: result.txt.id,
    })
  }

  private run(args: string[]): ChildProcess {
    const child = spawn(this.options.bin ?? DNS_SD, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    child.on('error', (err) =>
      this.options.log(`Bonjour (dns-sd ${args[0]}): ${err.message}`)
    )
    return child
  }
}
