import { spawn, type ChildProcess } from 'node:child_process'

/**
 * Finding your other Macs on the network with Bonjour, through macOS's own
 * dns-sd: each Mac advertises Pacenote (_pacenote._tcp) with its group and id,
 * and looks for the others. Nothing is installed for it, and macOS asks once
 * whether Pacenote may look on the local network.
 */

const SERVICE = '_pacenote._tcp'
const DNS_SD = '/usr/bin/dns-sd'
const RESOLVE_MS = 5_000

export const SETUP_SERVICE = '_pacenote-setup._tcp'

/** A Mac found on the network */
export interface Found {
  /** Its Bonjour name, the Mac's name */
  instance: string
  host: string
  port: number
  /** Its TXT record */
  txt: Record<string, string>
}

/** A line of `dns-sd -B`: a Mac that came or went */
export function browseLine(
  line: string
): { added: boolean; instance: string } | undefined {
  const match =
    /^\s*\S+\s+(Add|Rmv)\s+\d+\s+\d+\s+\S+\s+_[\w-]+\._tcp\.\s+(.+?)\s*$/.exec(
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
  return {
    host: where[1]!.replace(/\.$/, ''),
    port: Number(where[2]),
    txt,
  }
}

/**
 * Advertising this Mac, looking for the others, or both, until stop(). found
 * and lost tell about the Macs accept takes, by their TXT record: Macs in the
 * same group, so one with another Slack app is never reported.
 */
export class Bonjour {
  private readonly children: ChildProcess[] = []
  /** Each Mac is seen once per network interface: how many now */
  private readonly seen = new Map<string, number>()
  private stopped = false
  private readonly service: string

  constructor(
    private readonly options: {
      /** _pacenote._tcp, unless another */
      service?: string
      /** This Mac, advertised; none: it only looks */
      advertise?: { name: string; port: number; txt: Record<string, string> }
      /** Looking for the others; none: it only advertises */
      look?: {
        accept: (txt: Record<string, string>) => boolean
        found: (mac: Found) => void
        lost: (instance: string) => void
      }
      log: (message: string) => void
      /** dns-sd, unless a test names another */
      bin?: string
    }
  ) {
    this.service = options.service ?? SERVICE
  }

  start(): void {
    const { advertise, look } = this.options
    if (advertise)
      this.children.push(
        this.run([
          '-R',
          advertise.name,
          this.service,
          'local.',
          String(advertise.port),
          ...Object.entries(advertise.txt).map(([k, v]) => `${k}=${v}`),
        ])
      )
    if (!look) return
    const browser = this.run(['-B', this.service, 'local.'])
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
        else if (count > 0 && next === 0) look.lost(event.instance)
      }
    })
  }

  stop(): void {
    this.stopped = true
    for (const child of this.children.splice(0)) child.kill()
  }

  private async resolve(instance: string): Promise<void> {
    const child = this.run(['-L', instance, this.service, 'local.'])
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
    const look = this.options.look
    if (this.stopped || !result || !look?.accept(result.txt)) return
    look.found({
      instance,
      host: result.host,
      port: result.port,
      txt: result.txt,
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
