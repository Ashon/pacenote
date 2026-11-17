import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  loginShellPath,
  toolDirs,
  withToolDirs,
} from '../apps/desktop/src/tool-path.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-tool-path-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const join = (...parts: string[]) => path.join(...parts)
const joined = (parts: string[]) => parts.join(path.delimiter)

/** Only what the fake home owns: the machine's own folders may really exist */
function underHome(home: string, dirs: string[]): string[] {
  return dirs.filter((dir) => dir.startsWith(home))
}

/** A fake home with an nvm that has these node versions installed */
function nvmHome(prefix: string, versions: string[], alias?: string): string {
  const home = mkdtempSync(path.join(root, `${prefix}-`))
  for (const version of versions) {
    mkdirSync(join(home, '.nvm', 'versions', 'node', version, 'bin'), {
      recursive: true,
    })
  }
  if (alias !== undefined) {
    const dir = join(home, '.nvm', 'alias')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'default'), alias)
  }
  return home
}

const binOf = (home: string, version: string) =>
  join(home, '.nvm', 'versions', 'node', version, 'bin')

/** A shell the tests can run: it ignores the -ilc arguments it is given */
function fakeShell(name: string, body: string): string {
  const file = join(root, name)
  writeFileSync(file, `#!/bin/sh\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

const FOUR = ['v18.20.4', 'v20.11.1', 'v22.3.0', 'v9.9.9']
const NEWEST_FIRST = ['v22.3.0', 'v20.11.1', 'v18.20.4', 'v9.9.9']

describe('toolDirs: where a version manager keeps CLIs', () => {
  it('lists nvm versions newest first, by number', () => {
    const home = nvmHome('newest', FOUR)
    expect(underHome(home, toolDirs(home))).toEqual(
      NEWEST_FIRST.map((version) => binOf(home, version))
    )

    // 10 is newer than 9, whatever the digits look like
    const ten = nvmHome('ten', ['v9.9.9', 'v10.0.0'])
    expect(underHome(ten, toolDirs(ten))).toEqual([
      binOf(ten, 'v10.0.0'),
      binOf(ten, 'v9.9.9'),
    ])
  })

  it("puts the version nvm's default alias names first", () => {
    const major = nvmHome('alias-major', FOUR, '20')
    expect(underHome(major, toolDirs(major))).toEqual(
      ['v20.11.1', 'v22.3.0', 'v18.20.4', 'v9.9.9'].map((version) =>
        binOf(major, version)
      )
    )

    const exact = nvmHome('alias-exact', FOUR, 'v18.20.4\n')
    expect(underHome(exact, toolDirs(exact))).toEqual(
      ['v18.20.4', 'v22.3.0', 'v20.11.1', 'v9.9.9'].map((version) =>
        binOf(exact, version)
      )
    )

    // A minor alias only takes the versions that match all of its numbers
    const minor = nvmHome(
      'alias-minor',
      ['v20.11.1', 'v20.9.0', 'v22.3.0'],
      '20.9'
    )
    expect(underHome(minor, toolDirs(minor))).toEqual(
      ['v20.9.0', 'v22.3.0', 'v20.11.1'].map((version) => binOf(minor, version))
    )
  })

  it('stays newest first when the alias names nothing it can use', () => {
    for (const alias of ['node', 'lts/*', '7', '', '  ']) {
      const prefix = alias.replace(/\W+/g, '') || 'empty'
      const home = nvmHome(`alias-${prefix}`, FOUR, alias)
      expect(underHome(home, toolDirs(home))).toEqual(
        NEWEST_FIRST.map((version) => binOf(home, version))
      )
    }

    // No alias file at all is the same
    const none = nvmHome('alias-missing', FOUR)
    expect(underHome(none, toolDirs(none))).toEqual(
      NEWEST_FIRST.map((version) => binOf(none, version))
    )
  })

  it('leaves out folders that hold no bin, and names that are no version', () => {
    const home = nvmHome('odd', FOUR)
    mkdirSync(join(home, '.nvm', 'versions', 'node', 'v21.0.0'))
    mkdirSync(join(home, '.nvm', 'versions', 'node', 'system', 'bin'), {
      recursive: true,
    })
    expect(underHome(home, toolDirs(home))).toEqual(
      NEWEST_FIRST.map((version) => binOf(home, version))
    )
  })

  it('adds the other managers after nvm, and only the ones that exist', () => {
    const home = nvmHome('managers', ['v22.3.0'])
    for (const dir of ['.local/bin', '.volta/bin']) {
      mkdirSync(join(home, dir), { recursive: true })
    }
    expect(underHome(home, toolDirs(home))).toEqual([
      binOf(home, 'v22.3.0'),
      join(home, '.volta/bin'),
      join(home, '.local/bin'),
    ])
  })

  it('gives nothing for a home with no nvm, and never throws', () => {
    const home = mkdtempSync(path.join(root, 'no-nvm-'))
    expect(() => toolDirs(home)).not.toThrow()
    expect(underHome(home, toolDirs(home))).toEqual([])
  })
})

describe('withToolDirs: PATH with the tool folders added', () => {
  it('keeps PATH as it is and appends only what is missing', () => {
    const home = '/home/me'
    expect(
      withToolDirs(joined(['/a', '/b']), [`${home}/.volta/bin`, '/b'])
    ).toBe(joined(['/a', '/b', `${home}/.volta/bin`]))
    expect(withToolDirs(joined(['/b', '/a']), ['/a', '/b'])).toBe(
      joined(['/b', '/a'])
    )
  })

  it('drops empty parts, and takes the folders alone when PATH is missing', () => {
    const home = '/home/me'
    expect(withToolDirs(`:${joined(['/a'])}::`, [])).toBe('/a')
    expect(withToolDirs(undefined, [`${home}/.local/bin`])).toBe(
      `${home}/.local/bin`
    )
    expect(withToolDirs('', [`${home}/a`, `${home}/a`])).toBe(`${home}/a`)
  })
})

describe('loginShellPath: PATH from the login shell', () => {
  it('reads the line the shell marks', () => {
    const shell = fakeShell(
      'shell-ok',
      String.raw`echo hello; printf 'PACENOTE_PATH=/a:/b\n'`
    )
    expect(loginShellPath(shell)).toBe('/a:/b')
  })

  it('takes the last marked line', () => {
    const shell = fakeShell(
      'shell-twice',
      String.raw`printf 'PACENOTE_PATH=/old\n'; printf 'PACENOTE_PATH=/a:/b\n'`
    )
    expect(loginShellPath(shell)).toBe('/a:/b')
  })

  it('gives undefined for a shell that is not there', () => {
    expect(loginShellPath(join(root, 'no-such-shell'))).toBeUndefined()
  })

  it('gives undefined when the shell marks nothing, or marks it empty', () => {
    const quiet = fakeShell('shell-quiet', 'echo hello')
    expect(loginShellPath(quiet)).toBeUndefined()

    const empty = fakeShell(
      'shell-empty',
      String.raw`printf 'PACENOTE_PATH=\n'`
    )
    expect(loginShellPath(empty)).toBeUndefined()
  })

  it('gives undefined when the shell is slower than the timeout', () => {
    const slow = fakeShell('shell-slow', 'sleep 5')
    expect(loginShellPath(slow, 100)).toBeUndefined()
  })
})
