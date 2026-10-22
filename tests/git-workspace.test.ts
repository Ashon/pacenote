import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  applyEdit,
  GitWorkspaces,
  parseGithubRemote,
  reviewChanges,
} from '../src/broker/git.js'

describe('parseGithubRemote', () => {
  it('converts ssh and https remotes to owner/repo', () => {
    expect(parseGithubRemote('git@github.com:acme/k8s-manifests.git')).toEqual({
      owner: 'acme',
      repo: 'k8s-manifests',
    })
    expect(parseGithubRemote('https://github.com/acme/inventory')).toEqual({
      owner: 'acme',
      repo: 'inventory',
    })
    expect(parseGithubRemote('git@gitlab.com:a/b.git')).toBeUndefined()
    expect(parseGithubRemote('https://github.com/a/b/c')).toBeUndefined()
  })
})

describe('applyEdit', () => {
  it('replaces only a string that appears exactly once', () => {
    expect(applyEdit('a\nb\nc', 'b', 'B')).toBe('a\nB\nc')
    expect(() => applyEdit('a', 'x', 'y')).toThrow(/not found/)
    expect(() => applyEdit('b b', 'b', 'c')).toThrow(/2 times/)
    expect(applyEdit('b b', 'b', 'c', true)).toBe('c c')
  })

  it('does not treat $ patterns in the replacement as special', () => {
    expect(applyEdit('x', 'x', '$& $1')).toBe('$& $1')
  })
})

describe('reviewChanges', () => {
  it('passes valid changes', () => {
    expect(
      reviewChanges(['clusters/main/rbac.yaml'], '+kind: ServiceAccount', 1)
    ).toEqual([])
  })

  it('rejects empty changes, protected paths, secret files, secrets, and oversized changes', () => {
    expect(reviewChanges([], '', 0)).toEqual(['There are no changes.'])
    expect(
      reviewChanges(['.github/workflows/ci.yaml'], '+x', 1).join()
    ).toMatch(/Protected path/)
    expect(reviewChanges(['app/.env'], '+X=1', 1).join()).toMatch(
      /restricted path/
    )
    expect(
      reviewChanges(['a.yaml'], '+token: abcdefghijklmnop', 1).join()
    ).toMatch(/secret/)
    expect(reviewChanges(['a.yaml'], '+x', 5000).join()).toMatch(
      /changed lines/
    )
    const many = Array.from({ length: 51 }, (_, i) => `f${i}.txt`)
    expect(reviewChanges(many, '+x', 51).join()).toMatch(/changed files/)
  })
})

describe('GitWorkspaces', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pacenote-git-ws-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: 't@example.com',
      },
    })
  const put = (file: string, content: string | Buffer) => {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  /**
   * A workspace for acme/repo, whose mirror's origin is a local folder, so
   * nothing reaches GitHub
   */
  const prepare = async () => {
    const upstream = path.join(root, 'upstream')
    mkdirSync(upstream)
    git(upstream, 'init', '-q', '-b', 'main')
    put(path.join(upstream, 'README.md'), 'hello\nworld\n')
    put(path.join(upstream, 'src/old.ts'), 'old\n')
    put(path.join(upstream, 'logo.png'), Buffer.from([0, 1, 2, 0, 255]))
    git(upstream, 'add', '--all')
    git(upstream, 'commit', '-q', '-m', 'init')
    const work = path.join(root, 'work')
    mkdirSync(path.join(work, 'mirrors'), { recursive: true })
    git(
      root,
      'clone',
      '-q',
      '--bare',
      upstream,
      path.join(work, 'mirrors', 'acme__repo.git')
    )
    const local = path.join(root, 'local', 'repo')
    mkdirSync(local, { recursive: true })
    git(local, 'init', '-q')
    git(local, 'remote', 'add', 'origin', 'https://github.com/acme/repo.git')
    const workspaces = new GitWorkspaces({
      localRoot: path.join(root, 'local'),
      workRoot: work,
      token: 'ghp_test',
      authorName: 'Pace',
      authorEmail: 'pace@example.com',
      allowedOwners: ['acme'],
      timeoutMs: 30_000,
    })
    return { workspaces, workspace: await workspaces.prepare('repo') }
  }

  it('shows the stat and the patch of the changes, and checks them before a PR', async () => {
    const { workspaces, workspace } = await prepare()
    const header = `acme/repo ${workspace.branch} (base main)`
    expect(await workspaces.diff(workspace.id)).toBe(`${header}\n\n`)

    await workspaces.edit(workspace.id, 'README.md', 'world', 'there')
    await workspaces.write(workspace.id, 'src/new.ts', 'export {}\n')
    await workspaces.remove(workspace.id, 'src/old.ts')
    await workspaces.remove(workspace.id, 'logo.png')
    git(workspace.dir, 'add', '--all')
    const stat = git(workspace.dir, 'diff', '--cached', '--stat')
    const patch = git(workspace.dir, 'diff', '--cached')
    expect(stat).toContain('4 files changed')
    expect(patch).toContain('Binary files a/logo.png and /dev/null differ')
    expect(await workspaces.diff(workspace.id)).toBe(
      `${header}\n${stat}\n${patch}`
    )

    // What only a person may change, and a secret in the diff
    put(path.join(workspace.dir, '.github/workflows/ci.yml'), 'on: push\n')
    put(path.join(workspace.dir, 'config.yml'), 'token: abcdefghijklmnop\n')
    await expect(
      workspaces.createPullRequest(workspace.id, 'feat: x', 'why')
    ).rejects.toThrow(
      [
        'Cannot create the PR:',
        '- Protected path (must be changed by a human): .github/workflows/ci.yml',
        '- The diff contains what looks like a secret.',
      ].join('\n')
    )
  })
})
