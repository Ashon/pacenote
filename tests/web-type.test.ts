import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Text takes its size from the type scale in apps/web/src/index.css. These
 * checks keep a screen from making up a size of its own, and keep cn() knowing
 * the scale's own sizes, which it would otherwise take for colors and drop.
 */

const WEB = path.join(import.meta.dirname, '../apps/web/src')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(dir, entry.name))
      : [path.join(dir, entry.name)]
  )
}

const sources = files(WEB)
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => ({
    name: path.relative(WEB, file).split(path.sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }))

describe('type scale', () => {
  it('screens size text from the scale, not sizes of their own', () => {
    const found = sources.flatMap(({ name, text }) =>
      text
        .split('\n')
        .flatMap((line, index) =>
          /(?<![\w-])text-\[\d+(?:\.\d+)?(?:px|rem|em)\]/.test(line)
            ? [`${name}:${index + 1}: ${line.trim()}`]
            : []
        )
    )
    expect(found).toEqual([])
  })

  it("cn() knows the scale's own sizes", () => {
    const css = readFileSync(path.join(WEB, 'index.css'), 'utf8')
    const own = [...css.matchAll(/^\s*--text-([\w-]+):/gm)].map((m) => m[1]!)
    expect(own.length).toBeGreaterThan(0)
    const utils = readFileSync(path.join(WEB, 'lib/utils.ts'), 'utf8')
    const taught = utils.match(/text:\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(own.filter((size) => !taught.includes(`'${size}'`))).toEqual([])
  })
})
