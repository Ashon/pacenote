import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The screen's on/off switch and its row of segments live in components/ui,
 * named by their label or the settings row they sit in. A screen that draws
 * its own fails here: it would drift in look, focus ring and naming.
 */

const WEB = path.join(import.meta.dirname, '../apps/web/src')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(dir, entry.name))
      : [path.join(dir, entry.name)]
  )
}

const screens = files(WEB)
  .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
  .map((file) => ({
    name: path.relative(WEB, file).split(path.sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }))
  .filter(({ name }) => !name.startsWith('components/ui/'))

describe('the shared form controls', () => {
  it('are the only switches', () => {
    const own = screens.filter(({ text }) => text.includes('role="switch"'))
    expect(own.map(({ name }) => name)).toEqual([])
  })

  it('are the only rows of segments', () => {
    // A segmented choice is a radiogroup on the muted track
    const own = screens.filter(({ text }) =>
      /role="radiogroup"[^>]*\n?[^>]*bg-muted p-0\.5/.test(text)
    )
    expect(own.map(({ name }) => name)).toEqual([])
  })
})
