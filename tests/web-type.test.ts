import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Text takes its size from a type role in apps/web/src/index.css. These checks
 * keep a screen from making up a size of its own or reaching for one of
 * Tailwind's (index.css drops them, so one would set nothing), keep captions
 * heavy enough to stay sharp, and keep cn() knowing the roles, which it would
 * otherwise take for colors and drop. The surfaces get the same care: radii and
 * shadows from their ladders, and chart-1 off icons and text.
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

/** Lines of code (not comments) that match a pattern, as file:line: text */
function offending(pattern: RegExp): string[] {
  return sources.flatMap(({ name, text }) =>
    text
      .split('\n')
      .flatMap((line, index) =>
        !/^\s*(?:\/\/|\/?\*|\{\/\*)/.test(line) && pattern.test(line)
          ? [`${name}:${index + 1}: ${line.trim()}`]
          : []
      )
  )
}

describe('type roles', () => {
  it('screens size text by role, not sizes of their own', () => {
    expect(offending(/(?<![\w-])text-\[\d+(?:\.\d+)?(?:px|rem|em)\]/)).toEqual(
      []
    )
  })

  it('screens take no Tailwind size, which index.css drops', () => {
    expect(
      offending(/(?<![\w-])text-(?:2xs|xs|sm|base|lg|\d?xl)(?![\w-])/)
    ).toEqual([])
  })

  it('captions are 500 or heavier', () => {
    expect(
      offending(
        /(?<![\w-])text-caption(?![\w-]).*(?<![\w:-])font-(?:thin|extralight|light|normal)(?![\w-])|(?<![\w:-])font-(?:thin|extralight|light|normal)(?![\w-]).*(?<![\w-])text-caption(?![\w-])/
      )
    ).toEqual([])
  })

  it('cn() knows the roles', () => {
    const css = readFileSync(path.join(WEB, 'index.css'), 'utf8')
    const own = [...css.matchAll(/^\s*--text-([a-z0-9]+):/gm)].map((m) => m[1]!)
    expect(own.length).toBeGreaterThan(0)
    const utils = readFileSync(path.join(WEB, 'lib/utils.ts'), 'utf8')
    const taught = utils.match(/text:\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(own.filter((size) => !taught.includes(`'${size}'`))).toEqual([])
  })
})

describe('surfaces and color', () => {
  it('radii come from the ladder', () => {
    expect(
      offending(
        /(?<![\w-])rounded(?:-[trblse]{1,2})?(?:-(?:xs|2xl|3xl|4xl))?(?![\w/-])/
      )
    ).toEqual([])
  })

  it('what lies over the content takes shadow-float', () => {
    expect(offending(/(?<![\w-])shadow-(?:md|lg|xl|2xl)(?![\w-])/)).toEqual([])
  })

  it('icons and text do not take chart-1, which is too faint for them', () => {
    expect(
      offending(/(?<![\w-])(?:text|fill|stroke)-chart-1(?![\w-])/)
    ).toEqual([])
  })
})
