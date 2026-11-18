import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Processes } from '../apps/desktop/src/open-sessions.js'
import {
  CodexTitles,
  OpenSessions,
  codexToday,
  parseAgents,
  parseProcesses,
  runsIn,
} from '../apps/desktop/src/open-sessions.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-open-sessions-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('parseAgents: claude agents --json', () => {
  it('reads what it needs and drops entries with no id or no pid', () => {
    const out = JSON.stringify([
      {
        pid: 100,
        cwd: '/w/a',
        sessionId: 's-a',
        name: 'Alpha',
        status: 'busy',
        kind: 'interactive',
      },
      { pid: 101, cwd: '/w/b', sessionId: 's-b' },
      { pid: 102, cwd: '/w/c', name: 'no id' },
      { cwd: '/w/d', sessionId: 's-d' },
      'not an entry',
    ])
    expect(parseAgents(out)).toEqual([
      {
        pid: 100,
        cwd: '/w/a',
        sessionId: 's-a',
        name: 'Alpha',
        status: 'busy',
        kind: 'interactive',
      },
      { pid: 101, cwd: '/w/b', sessionId: 's-b' },
    ])
  })

  it('gives nothing for output that is not a JSON array', () => {
    expect(parseAgents('nope')).toEqual([])
    expect(parseAgents('{"a":1}')).toEqual([])
    expect(parseAgents('null')).toEqual([])
  })
})

describe('parseProcesses: ps -axo pid=,ppid=,command=', () => {
  it('reads pid to ppid and command, spaces and all', () => {
    const out = [
      '  100   1 /bin/zsh -il',
      '101 100 /usr/bin/claude --continue',
      '  102  101 node index.js --title "a  b" --flag',
      'garbage line',
      '',
    ].join('\n')
    const procs = parseProcesses(out)
    expect(procs.size).toBe(3)
    expect(procs.get(100)).toEqual({ ppid: 1, command: '/bin/zsh -il' })
    expect(procs.get(101)).toEqual({
      ppid: 100,
      command: '/usr/bin/claude --continue',
    })
    expect(procs.get(102)).toEqual({
      ppid: 101,
      command: 'node index.js --title "a  b" --flag',
    })
  })
})

describe('runsIn: where a process runs, from its parents', () => {
  const procs = (entries: [number, number, string][]): Processes =>
    new Map(entries.map(([pid, ppid, command]) => [pid, { ppid, command }]))

  it('names claude.ai under a claude remote-control parent', () => {
    const p = procs([
      [10, 11, 'claude'],
      [11, 1, '/Users/me/.local/bin/claude remote-control --name x'],
    ])
    expect(runsIn(10, p)).toEqual({ where: 'web' })
  })

  it('names the Claude app under its helper', () => {
    const p = procs([
      [10, 11, 'claude'],
      [11, 1, '/Applications/Claude.app/Contents/Helpers/disclaimer'],
    ])
    expect(runsIn(10, p)).toEqual({ where: 'claude-app' })
  })

  it('names the terminal app at the top of the chain', () => {
    const p = procs([
      [10, 11, 'claude'],
      [11, 12, '-zsh'],
      [12, 13, '/usr/bin/login -fp me'],
      [13, 1, '/Applications/iTerm.app/Contents/MacOS/iTerm2'],
    ])
    expect(runsIn(10, p)).toEqual({
      where: 'terminal',
      terminal: 'iTerm',
      app: '/Applications/iTerm.app',
    })
  })

  it('takes the outer .app of an editor helper', () => {
    const p = procs([
      [10, 11, 'claude'],
      [
        11,
        1,
        '/Applications/Visual Studio Code.app/Contents/Frameworks/' +
          'Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)',
      ],
    ])
    expect(runsIn(10, p)).toEqual({
      where: 'terminal',
      terminal: 'Visual Studio Code',
      app: '/Applications/Visual Studio Code.app',
    })
  })

  it('gives a plain terminal when the chain runs out under pid 1', () => {
    const p = procs([
      [10, 11, 'claude'],
      [11, 1, 'tmux'],
    ])
    expect(runsIn(10, p)).toEqual({ where: 'terminal' })
  })

  it('gives a plain terminal for a pid nothing knows', () => {
    expect(runsIn(4242, procs([]))).toEqual({ where: 'terminal' })
  })
})

describe('OpenSessions: claude agents and ps together', () => {
  const AGENTS = JSON.stringify([
    {
      pid: 100,
      cwd: '/w/a',
      sessionId: 's-a',
      name: 'Alpha',
      status: 'busy',
      kind: 'interactive',
    },
    {
      pid: 101,
      cwd: '/w/b',
      sessionId: 's-b',
      status: 'busy',
      kind: 'background',
    },
    { pid: 102, cwd: '/w/c', sessionId: 's-c', status: 'idle' },
  ])
  const PS = [
    '  100 111 claude',
    '  111 1 /Applications/iTerm.app/Contents/MacOS/iTerm2',
    '  102 112 claude',
    '  112 1 /Users/me/.local/bin/claude remote-control --name x',
  ].join('\n')

  const sessionsWith = (
    exec: (file: string, args: string[]) => Promise<string>,
    warn: (message: string) => void = () => {}
  ) =>
    new OpenSessions({
      bin: () => 'claude',
      env: () => ({}),
      home: '/home/me',
      warn,
      exec,
    })

  const ok = async (file: string) => (file === 'claude' ? AGENTS : PS)

  it('lists the interactive ones with where each runs', async () => {
    const list = await sessionsWith(ok).list()
    expect(list).toEqual([
      {
        session: 's-a',
        cwd: '/w/a',
        name: 'Alpha',
        busy: true,
        where: 'terminal',
        terminal: 'iTerm',
        app: '/Applications/iTerm.app',
        pid: 100,
      },
      { session: 's-c', cwd: '/w/c', busy: false, where: 'web', pid: 102 },
    ])
  })

  it('reads a listing anew when asked, and after it ends a process', async () => {
    const asks: string[] = []
    const endings: number[] = []
    const os = new OpenSessions({
      bin: () => 'claude',
      env: () => ({}),
      home: '/home',
      warn: () => {},
      exec: async (file) => {
        asks.push(file)
        return file === 'claude' ? AGENTS : PS
      },
      end: async (pid) => {
        endings.push(pid)
        return true
      },
    })
    const at = Date.now()
    await os.list(at)
    await os.list(at, { fresh: true })
    expect(asks.filter((file) => file === 'claude')).toHaveLength(2)
    await expect(os.end(100)).resolves.toBe(true)
    expect(endings).toEqual([100])
    await os.list(at)
    expect(asks.filter((file) => file === 'claude')).toHaveLength(3)
  })

  it('keeps a listing for five seconds: one ask per window', async () => {
    const asks: string[][] = []
    const os = sessionsWith(async (file, args) => {
      asks.push([file, ...args])
      return file === 'claude' ? AGENTS : PS
    })
    const at = Date.now()
    await os.list(at)
    await os.list(at)
    expect(asks).toEqual([
      ['claude', 'agents', '--json'],
      ['/bin/ps', '-axo', 'pid=,ppid=,command='],
    ])
    await os.list(at + 6_000)
    expect(asks.filter((a) => a[0] === 'claude')).toHaveLength(2)
  })

  it('gives nothing and warns once while claude keeps failing', async () => {
    const warnings: string[] = []
    const os = sessionsWith(
      async (file) => {
        if (file === 'claude') throw new Error('spawn claude ENOENT')
        return PS
      },
      (message) => warnings.push(message)
    )
    const at = Date.now()
    expect(await os.list(at)).toBeUndefined()
    expect(await os.list(at + 6_000)).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('spawn claude ENOENT')
  })

  it('gives nothing when the output is not a list', async () => {
    const warnings: string[] = []
    const os = sessionsWith(
      async () => 'Claude Code is not installed',
      (message) => warnings.push(message)
    )
    expect(await os.list()).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('no list')
  })
})

describe('CodexTitles: the session index', () => {
  const index = (lines: string[]) => {
    const home = mkdtempSync(path.join(root, 'codex-home-'))
    writeFileSync(path.join(home, 'session_index.jsonl'), lines.join('\n'))
    return new CodexTitles(home)
  }

  it('maps ids to the last name, skipping broken lines and empty names', async () => {
    const titles = await index([
      '{"id":"x","thread_name":"First"}',
      '{ this line got cut short',
      '{"id":"x","thread_name":"  Second  "}',
      '{"id":"y","thread_name":"Yay"}',
      '{"id":"z","thread_name":"   "}',
      '{"id":"w"}',
    ]).get()
    expect([...titles]).toEqual([
      ['x', 'Second'],
      ['y', 'Yay'],
    ])
  })

  it('gives an empty map when there is no index', async () => {
    const titles = await new CodexTitles(path.join(root, 'no-such-home')).get()
    expect(titles.size).toBe(0)
  })
})

describe('codexToday: counting yours from the log heads', () => {
  it('counts only the sessions that are yours', async () => {
    const dir = mkdtempSync(path.join(root, 'codex-logs-'))
    const log = (name: string, first: string) => {
      const file = path.join(dir, name)
      writeFileSync(file, `${first}\n{"type":"response_item"}\n`)
      return file
    }
    const meta = (payload: string) =>
      `{"timestamp":"2026-11-17T10:00:00Z","type":"session_meta",` +
      `"payload":{"id":"x","cwd":"/w",${payload}}}`
    const files = [
      log('mine', meta('"originator":"Codex Desktop","source":"vscode"')),
      log('exec-run', meta('"originator":"codex_exec"')),
      log('exec-src', meta('"originator":"Codex CLI","source":"exec"')),
      log(
        'subagent',
        meta('"originator":"Codex CLI","source":{"subagent":{}}')
      ),
      log('plain', '{"type":"response_item","payload":{}}'),
      path.join(dir, 'missing.jsonl'),
    ]
    expect(await codexToday(files)).toBe(1)
  })
})
