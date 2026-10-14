import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * The licenses that travel with the app and the hub's image
 * (scripts/third-party-notices.mjs): every package the bundles are built
 * from, and what the web app takes from its build tools.
 */

const REPO = path.join(import.meta.dirname, '..')
const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-notices-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('third-party notices', () => {
  it('name every production dependency and the bundled assets, with their license texts', () => {
    const out = path.join(dir, 'THIRD-PARTY-NOTICES.txt')
    execFileSync('node', ['scripts/third-party-notices.mjs', out], {
      cwd: REPO,
    })
    const text = readFileSync(out, 'utf8')
    const heading = (name: string) =>
      new RegExp(`^${name.replace(/[/.]/g, '\\$&')} \\S+`, 'm')
    for (const file of [
      'package.json',
      'apps/web/package.json',
      'apps/desktop/package.json',
    ]) {
      const { dependencies = {} } = JSON.parse(
        readFileSync(path.join(REPO, file), 'utf8')
      ) as { dependencies?: Record<string, string> }
      for (const name of Object.keys(dependencies))
        expect(text, name).toMatch(heading(name))
    }
    // The font and the styles the web app bundles from its build tools
    expect(text).toMatch(heading('pretendard'))
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1')
    expect(text).toMatch(heading('tailwindcss'))
    // License texts, not only names
    expect(text).toContain('Permission is hereby granted, free of charge')
  })
})
