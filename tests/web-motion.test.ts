import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The app's motion is designed in one place (apps/web/src/motion.css) and
 * carried by the primitives in components/ui. These checks keep a screen from
 * making up its own: a duration, an easing or an animation written outside
 * them fails here, as does a motion pattern class that does not exist.
 */

const WEB = path.join(import.meta.dirname, '../apps/web/src')
const MOTION_CSS = readFileSync(path.join(WEB, 'motion.css'), 'utf8')

/** Where motion is defined: the patterns, the primitives, Pace's spinner */
const OWNERS = [
  /^motion\.css$/,
  /^components\/ui\//,
  /^components\/pace-spinner\./,
]

/** Things that move on their own because Pace is at work */
const AT_WORK = [/^text-shimmer$/, /^pulse-dot$/, /^pace-spinner-/]

/** Motion a screen may not write itself, with what to use instead */
const MADE_UP: [RegExp, string][] = [
  [/(?<![\w-])duration-[\w[(]/, 'a duration'],
  [/(?<![\w-])delay-[\w[(]/, 'a delay'],
  [/(?<![\w-])ease-(?:linear|in|out|in-out|\[|\()/, 'an easing'],
  [/(?<![\w-])transition-(?:all|\[|\()/, 'a transition of its own'],
  [
    /(?<![\w-])animate-(?:in|out|collapsible|bounce|pulse(?!-dot)|\[|\()/,
    'an animation',
  ],
  [/(?<![\w-])(?:fade|zoom|slide)-(?:in|out)/, 'an animation'],
  [/(?<![\w-])motion-(?:reduce|safe):/, 'a reduced-motion form'],
  [
    /\b(?:animation|transition)(?:Duration|Delay|TimingFunction|Name)?\s*:/,
    'an inline animation',
  ],
]

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(dir, entry.name))
      : [path.join(dir, entry.name)]
  )
}

const sources = files(WEB)
  .map((file) => ({
    name: path.relative(WEB, file).split(path.sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }))
  .filter(({ name }) => /\.(tsx?|css)$/.test(name))
const screens = sources.filter(
  ({ name }) => !OWNERS.some((owner) => owner.test(name))
)

describe('motion', () => {
  it('screens use the motion patterns, not durations, easings or animations of their own', () => {
    const found = screens.flatMap(({ name, text }) =>
      text
        .split('\n')
        .flatMap((line, index) =>
          name.endsWith('.css')
            ? []
            : MADE_UP.filter(([pattern]) => pattern.test(line)).map(
                ([, what]) =>
                  `${name}:${index + 1} writes ${what}: ${line.trim()}`
              )
        )
    )
    expect(found).toEqual([])
  })

  it('stylesheets outside motion.css animate only Pace at work, and transition nothing', () => {
    const found = screens
      .filter(({ name }) => name.endsWith('.css'))
      .flatMap(({ name, text }) => [
        ...[...text.matchAll(/@keyframes\s+([\w-]+)/g)]
          .map((match) => match[1]!)
          .filter((frames) => !AT_WORK.some((ok) => ok.test(frames)))
          .map((frames) => `${name} defines @keyframes ${frames}`),
        ...[...text.matchAll(/^\s*transition[\w-]*\s*:/gm)].map(
          () => `${name} sets a transition`
        ),
      ])
    expect(found).toEqual([])
  })

  it('every motion pattern a component names is in motion.css', () => {
    const named = new Set(
      sources
        .filter(({ name }) => name.endsWith('.tsx'))
        .flatMap(({ text }) => [
          ...text.matchAll(/(?<![\w-])motion-(?!reduce:|safe:)[a-z][a-z-]*/g),
        ])
        .map((match) => match[0])
    )
    expect(named.size).toBeGreaterThan(0)
    const missing = [...named].filter(
      (name) => !MOTION_CSS.includes(`.${name}`)
    )
    expect(missing).toEqual([])
  })

  it('every pattern has its reduced form', () => {
    const reduced = MOTION_CSS.slice(
      MOTION_CSS.indexOf('@media (prefers-reduced-motion: reduce)')
    )
    const moving = [
      ...MOTION_CSS.matchAll(/^\s*(\.motion-[\w-]+|\[data-motion-item\])/gm),
    ].map((match) => match[1]!)
    expect(moving.length).toBeGreaterThan(0)
    const missing = [...new Set(moving)].filter(
      (selector) => !reduced.includes(selector)
    )
    expect(missing).toEqual([])
  })
})
