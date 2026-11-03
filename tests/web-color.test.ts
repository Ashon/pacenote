import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The accents Settings offers (apps/web/src/accents.css, made by
 * scripts/accent-palette.py). These checks keep each one as readable as green:
 * text on its fill, its text on a card and on a selected row, in light and
 * dark; and keep the file in step with index.css and with lib/theme.ts.
 */

const WEB = path.join(import.meta.dirname, '../apps/web/src')
const ACCENTS_CSS = readFileSync(path.join(WEB, 'accents.css'), 'utf8')
const INDEX_CSS = readFileSync(path.join(WEB, 'index.css'), 'utf8')
/**
 * The accents lib/theme.ts offers, read from its source: the app's imports do
 * not resolve under the tests' own module settings
 */
const ACCENTS = [
  ...readFileSync(path.join(WEB, 'lib/theme.ts'), 'utf8')
    .match(/export const ACCENTS = \[([^\]]*)\]/)![1]!
    .matchAll(/'(\w+)'/g),
].map((m) => m[1]!)

type Tokens = Record<string, string>
const declared = (body: string): Tokens =>
  Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!])
  )

/** Each accent's tokens in light and in dark, in the file's order */
function themes() {
  const found: { key: string; light: Tokens; dark: Tokens }[] = []
  for (const m of ACCENTS_CSS.matchAll(
    /\[data-accent='(\w+)'\]:not\(\.dark\) \{([^}]*)\}\s*\.dark\[data-accent='\1'\],\s*\.dark \[data-accent='\1'\] \{([^}]*)\}/g
  ))
    found.push({ key: m[1]!, light: declared(m[2]!), dark: declared(m[3]!) })
  return found
}
const block = (selector: string) =>
  declared(INDEX_CSS.match(new RegExp(`\\n${selector} \\{([^}]*)\\}`))![1]!)

// ---- Contrast, as WCAG measures it
const linear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
/** A token's color as linear sRGB: hex or oklch(), as the file writes them */
function rgb(value: string): [number, number, number] {
  if (value.startsWith('#'))
    return [1, 3, 5].map((i) =>
      linear(parseInt(value.slice(i, i + 2), 16) / 255)
    ) as [number, number, number]
  const [L = 0, C = 0, h = 0] = value
    .match(/oklch\(([^)/]+)/)![1]!
    .trim()
    .split(/\s+/)
    .map(Number)
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => Math.min(1, Math.max(0, x))) as [number, number, number]
}
const luminance = (value: string) => {
  const [r, g, b] = rgb(value)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('accent colors', () => {
  const all = themes()

  it('offers the accents lib/theme.ts lists, in its order', () => {
    expect(all.map((theme) => theme.key)).toEqual(ACCENTS)
  })

  it('makes green what index.css has', () => {
    const green = all.find((theme) => theme.key === 'green')!
    const root = block(':root')
    const dark = { ...root, ...block('\\.dark') }
    for (const [name, value] of Object.entries(green.light))
      expect([name, value]).toEqual([name, root[name]])
    for (const [name, value] of Object.entries(green.dark))
      expect([name, value]).toEqual([name, dark[name]])
  })

  it('sets in the dark every token it sets in light', () => {
    for (const { key, light, dark } of all)
      expect([key, Object.keys(dark).sort()]).toEqual([
        key,
        Object.keys(light).sort(),
      ])
  })

  it('leaves the statuses as they are', () => {
    expect(ACCENTS_CSS).not.toMatch(/--(status-[\w-]+|destructive):/)
  })

  it.each(['light', 'dark'] as const)(
    'reads at 4.5:1 or more in %s: text on the fill, the ink on a card and a selected row',
    (mode) => {
      for (const theme of all) {
        const t = theme[mode]
        const checks = {
          fill: contrast(t['primary']!, t['primary-foreground']!),
          ink: contrast(t['primary-ink']!, t.card!),
          inkSelected: contrast(t['primary-ink']!, t.selected!),
        }
        for (const [what, ratio] of Object.entries(checks))
          expect([theme.key, what, ratio >= 4.5]).toEqual([
            theme.key,
            what,
            true,
          ])
      }
    }
  )
})
