// Draws the design diagrams in docs/diagrams as SVG, in the desktop app's look
// (apps/web/src/index.css): the window's tinted chrome around one content
// surface; groups on it as recessed wells, their rows split by hairlines;
// section headings with the app's icons (lucide); badges and facts as the app
// draws them; the system font, and mono for code. The colors are read from
// index.css on every run, so the diagrams follow the app. Each diagram comes in
// a light and a dark variant for GitHub's <picture>.
// Usage: node scripts/diagrams.mjs [name ...] (pnpm docs:diagrams)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'docs/diagrams')
const CSS = path.join(ROOT, 'apps/web/src/index.css')

const SANS =
  "-apple-system, BlinkMacSystemFont, Pretendard, 'Apple SD Gothic Neo', 'Segoe UI', 'Noto Sans KR', Helvetica, Arial, sans-serif"
const MONO =
  "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"

/** oklch(l c h) as sRGB channels, 0 to 255 */
function oklchToRgb(l, c, h) {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3)
  const linear = [
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
  ].map((row) => row.reduce((sum, k, i) => sum + k * lms[i], 0))
  return linear.map((v) => {
    const x = Math.min(1, Math.max(0, v))
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
  })
}

const toHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** A color from index.css (hex, or oklch with an optional alpha) */
function parseColor(value) {
  const o = value.match(
    /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+)(%?))?\)$/
  )
  if (o)
    return {
      rgb: oklchToRgb(+o[1], +o[2], +o[3]),
      alpha: o[4] ? +o[4] / (o[5] ? 100 : 1) : 1,
    }
  const h = value.match(/^#([0-9a-f]{6})$/i)
  if (h)
    return {
      rgb: [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)),
      alpha: 1,
    }
  throw new Error(`Cannot read the color ${value}`)
}

/**
 * The app's tokens for both themes, as hex so every SVG renderer agrees.
 * Colors with an alpha are flattened over the content surface.
 */
function readThemes() {
  const css = readFileSync(CSS, 'utf8')
  const block = (selector) => {
    const start = css.indexOf(`\n${selector} {`)
    const body = css.slice(start, css.indexOf('\n}', start))
    return Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [
        k,
        v.trim().replace(/\s+/g, ' '),
      ])
    )
  }
  const root = block(':root')
  const gradient = [
    ...root['pacenote-gradient'].matchAll(/(#[0-9a-f]{6}) ([\d.]+)%/gi),
  ].map(([, color, at]) => [color, +at / 100])
  const theme = (vars) => {
    const get = (name) => parseColor(vars[name] ?? root[name])
    const card = get('card').rgb
    const solid = (name) => {
      const { rgb, alpha } = get(name)
      return toHex(rgb.map((v, i) => v * alpha + card[i] * (1 - alpha)))
    }
    return {
      chrome: solid('sidebar'),
      surface: solid('card'),
      accentSurface: solid('card-accent'),
      well: solid('well'),
      foreground: solid('foreground'),
      muted: solid('muted-foreground'),
      // Secondary lines and empty slots: muted text, a step fainter
      faint: toHex(
        get('muted-foreground').rgb.map((v, i) => (v + card[i]) / 2)
      ),
      border: solid('border'),
      primary: solid('primary'),
      primaryFg: solid('primary-foreground'),
      secondary: solid('secondary'),
      secondaryFg: solid('secondary-foreground'),
      accentFg: solid('accent-foreground'),
      running: solid('status-running'),
      succeeded: solid('status-succeeded'),
      failed: solid('status-failed'),
      interrupted: solid('status-interrupted'),
      gradient,
    }
  }
  // The content surface's lift (--card-shadow), as SVG drop shadows
  const lift = toHex(oklchToRgb(0.3, 0.03, 170))
  return {
    light: {
      ...theme(root),
      shadows: [
        { dy: 1, blur: 1, color: lift, opacity: 0.05 },
        { dy: 8, blur: 12, color: lift, opacity: 0.07 },
      ],
    },
    dark: {
      ...theme(block('.dark')),
      shadows: [{ dy: 1, blur: 1, color: '#000000', opacity: 0.25 }],
    },
  }
}

/** The app's icons (lucide-react), as SVG markup on a 24px grid */
async function readIcons(names) {
  const lucide = path.dirname(
    createRequire(path.join(ROOT, 'apps/web/package.json')).resolve(
      'lucide-react/package.json'
    )
  )
  const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  const entries = await Promise.all(
    names.map(async (name) => {
      const file = path.join(lucide, 'dist/esm/icons', `${name}.js`)
      const { __iconNode } = await import(pathToFileURL(file).href)
      const markup = __iconNode
        .map(([tag, attrs]) => {
          const list = Object.entries(attrs)
            .filter(([key]) => key !== 'key')
            .map(([key, value]) => `${kebab(key)}="${value}"`)
          return `<${tag} ${list.join(' ')}/>`
        })
        .join('')
      return [name, markup]
    })
  )
  return Object.fromEntries(entries)
}

const ICONS = [
  'app-window',
  'bot',
  'container',
  'cpu',
  'folder',
  'globe',
  'hash',
  'history',
  'key-round',
  'laptop',
  'messages-square',
  'plug',
  'server',
  'shield-check',
  'terminal',
  'user-check',
]

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** About how wide text sets in the system font, for badges and alignment */
function textWidth(value, size, { mono = false, weight = 400 } = {}) {
  if (mono) return [...value].length * size * 0.6
  let em = 0
  for (const ch of value) {
    if (ch === ' ') em += 0.27
    else if (/[ijlI.,:;'|!]/.test(ch)) em += 0.26
    else if (/[frt()/-]/.test(ch)) em += 0.36
    else if (/[mwMW@]/.test(ch)) em += 0.84
    else if (/[A-Z]/.test(ch)) em += 0.66
    else if (/[0-9]/.test(ch)) em += 0.58
    else if (/\p{Extended_Pictographic}/u.test(ch)) em += 1.4
    else if (/[\u{fe0f}]/u.test(ch)) em += 0
    else em += 0.54
  }
  return em * size * (weight >= 600 ? 1.04 : 1)
}

/** The window's chrome, and the content surface inside it */
const FRAME = { brand: 56, inset: 16, pad: 32 }

/** A diagram drawn into one theme: shapes go in order, later ones on top */
class Canvas {
  constructor(t, icons, width, height) {
    this.t = t
    this.icons = icons
    this.width = width
    this.height = height
    this.left = FRAME.inset + FRAME.pad
    this.right = width - FRAME.inset - FRAME.pad
    this.parts = []
  }

  add(svg) {
    this.parts.push(svg)
    return this
  }

  text(x, y, value, o = {}) {
    const {
      size = 12.5,
      weight = 400,
      fill = this.t.foreground,
      mono = false,
      anchor = 'start',
    } = o
    return this.add(
      `<text x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}"` +
        ` fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`
    )
  }

  /** A lucide icon, size px square, its top left at x, y */
  icon(name, x, y, o = {}) {
    const { size = 16, color = this.t.primary } = o
    return this.add(
      `<g transform="translate(${x} ${y}) scale(${size / 24})" color="${color}" fill="none" stroke="${color}"` +
        ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${this.icons[name]}</g>`
    )
  }

  /** A line between parts of the content surface */
  hairline(x1, x2, y) {
    return this.add(
      `<path d="M${x1} ${y + 0.5}H${x2}" stroke="${this.t.border}" stroke-width="1"/>`
    )
  }

  vline(x, y1, y2) {
    return this.add(
      `<path d="M${x + 0.5} ${y1}V${y2}" stroke="${this.t.border}" stroke-width="1"/>`
    )
  }

  /**
   * A group on the content surface: a recessed well, like a card inside the
   * app's main; accent for the emphasized one (Pace, as its replies)
   */
  well(x, y, w, h, o = {}) {
    const fill = o.accent ? this.t.accentSurface : this.t.well
    return this.add(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.radius ?? 20}" fill="${fill}"/>`
    )
  }

  /**
   * A part inside a group, a step up from its well (higher surfaces are
   * lighter); accent for the emphasized one
   */
  box(x, y, w, h, o = {}) {
    const fill = o.accent ? this.t.accentSurface : this.t.surface
    return this.add(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}"/>`
    )
  }

  /**
   * A section's heading as the app draws one: the icon, the title, and a meta
   * line to the right. y is the title's baseline.
   */
  heading(x, y, w, { icon, title, meta, tone }) {
    if (icon) this.icon(icon, x, y - 13, { color: tone ?? this.t.primary })
    this.text(x + (icon ? 24 : 0), y, title, {
      size: 14,
      weight: 600,
      fill: tone ?? this.t.foreground,
    })
    if (meta)
      this.text(x + w, y, meta, {
        size: 12,
        fill: this.t.muted,
        anchor: 'end',
      })
    return this
  }

  /**
   * Rows split by hairlines, each a label (mono unless said) and a line of
   * help; returns the y below them
   */
  rows(x, y, w, list, o = {}) {
    let top = y
    list.forEach((row, i) => {
      const { label, help, mono = true, after } = row
      if (i > 0 || o.first !== false) this.hairline(x, x + w, top)
      this.text(x, top + 20, label, {
        mono,
        size: mono ? 12 : 13,
        weight: 600,
        fill: row.fill ?? this.t.foreground,
      })
      if (help) this.text(x, top + 37, help, { size: 11.5, fill: this.t.muted })
      const height = after ? after(top + 46) + 8 - top : 46
      top += height
    })
    return top
  }

  /**
   * A badge (ui/badge.tsx): secondary by default, outline, or a status tone
   * (status.tsx, rounded); returns its width
   */
  badge(x, y, value, o = {}) {
    const { tone, outline, mono = false, icon } = o
    const size = 11
    const width = Math.round(
      textWidth(value, size, { mono, weight: 500 }) + (icon ? 30 : 13)
    )
    const color = tone ? this.t[tone] : outline ? this.t.foreground : null
    if (tone)
      this.add(
        `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="19" rx="9.5" fill="${color}" fill-opacity="0.12"` +
          ` stroke="${color}" stroke-opacity="0.3"/>`
      )
    else if (outline)
      this.add(
        `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="19" rx="6" fill="none" stroke="${this.t.border}"/>`
      )
    else
      this.add(
        `<rect x="${x}" y="${y}" width="${width}" height="20" rx="6" fill="${this.t.secondary}"/>`
      )
    const fill = color ?? this.t.secondaryFg
    if (icon) this.icon(icon, x + 7, y + 4, { size: 12, color: fill })
    this.text(x + (icon ? 23 : 6.5), y + 14, value, {
      size,
      weight: 500,
      fill,
      mono,
    })
    return width
  }

  /** Badges in a line from x, gap apart; returns the x after the last */
  badges(x, y, list, o = {}) {
    let at = x
    for (const item of list) {
      const [value, extra] = Array.isArray(item) ? item : [item, {}]
      at += this.badge(at, y, value, { ...o, ...extra }) + (o.gap ?? 6)
    }
    return at
  }

  /**
   * Facts in a row (run-facts.tsx): an icon and a label, a value under them
   * and a hint, split by hairlines
   */
  facts(x, y, w, list) {
    const column = w / list.length
    list.forEach(({ icon, label, value, hint }, i) => {
      const left = x + i * column + (i ? 16 : 0)
      if (i) this.vline(x + i * column, y, y + 58)
      this.icon(icon, left, y + 1, { size: 14, color: this.t.muted })
      this.text(left + 20, y + 12, label, { size: 11, fill: this.t.muted })
      this.text(left, y + 34, value, { size: 14, weight: 600 })
      this.text(left, y + 52, hint, { size: 11.5, fill: this.t.muted })
    })
    return this
  }

  /**
   * Room for an adapter that does not exist yet: a dashed outline with faint
   * text
   */
  slot(x, y, w, label) {
    this.add(
      `<rect x="${x + 0.75}" y="${y + 0.75}" width="${w - 1.5}" height="28.5" rx="10" fill="none"` +
        ` stroke="${this.t.border}" stroke-width="1.5" stroke-dasharray="5 4"/>`
    )
    return this.text(x + 12, y + 19, label, { size: 12, fill: this.t.faint })
  }

  /** A numbered step, in the primary button's colors */
  step(x, y, n) {
    this.add(`<circle cx="${x}" cy="${y}" r="10" fill="${this.t.primary}"/>`)
    return this.text(x, y + 4, n, {
      size: 11,
      weight: 700,
      fill: this.t.primaryFg,
      anchor: 'middle',
    })
  }

  /**
   * A line through points, its corners rounded; main lines are primary,
   * others faint; dashed for optional paths
   */
  arrow(points, o = {}) {
    const color = o.main ? this.t.primary : this.t.faint
    let d = `M${points[0][0]} ${points[0][1]}`
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i]
      const next = points[i + 1]
      if (!next) {
        d += ` L${x} ${y}`
        break
      }
      const [px, py] = points[i - 1]
      const r = Math.min(
        8,
        Math.hypot(x - px, y - py) / 2,
        Math.hypot(next[0] - x, next[1] - y) / 2
      )
      const into = [Math.sign(x - px), Math.sign(y - py)]
      const out = [Math.sign(next[0] - x), Math.sign(next[1] - y)]
      d +=
        ` L${x - into[0] * r} ${y - into[1] * r}` +
        ` Q${x} ${y} ${x + out[0] * r} ${y + out[1] * r}`
    }
    const marker = o.main ? 'arrow-main' : 'arrow'
    this.add(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${o.main ? 1.75 : 1.5}" stroke-linecap="round"` +
        ` stroke-linejoin="round"${o.dashed ? ' stroke-dasharray="5 5"' : ''}` +
        `${o.end === false ? '' : ` marker-end="url(#${marker})"`}` +
        `${o.start ? ` marker-start="url(#${marker})"` : ''}/>`
    )
    if (o.label) this.label(o.at ?? points[0], o.label, o)
    return this
  }

  /**
   * A line's label on a pill of the surface it crosses, led by its step's
   * number when it is one of a sequence
   */
  label([x, y], value, o = {}) {
    const lead = o.step ? 18 : 0
    const width = Math.round(
      textWidth(value, 11, { weight: o.main ? 600 : 400 }) + 14 + lead
    )
    const lx = o.anchor === 'start' ? x : x - width / 2
    this.add(
      `<rect x="${lx}" y="${y - 10}" width="${width}" height="19" rx="9.5" fill="${o.on ?? this.t.surface}"/>`
    )
    if (o.step) {
      this.add(
        `<circle cx="${lx + 10}" cy="${y - 0.5}" r="7.5" fill="${this.t.primary}"/>`
      )
      this.text(lx + 10, y + 3, o.step, {
        size: 10,
        weight: 700,
        fill: this.t.primaryFg,
        anchor: 'middle',
      })
    }
    return this.text(lx + lead + (width - lead) / 2, y + 4, value, {
      size: 11,
      fill: o.main ? this.t.primary : this.t.muted,
      anchor: 'middle',
      weight: o.main ? 600 : 400,
    })
  }

  /** The Pacenote mark (assets/pacenote.svg), size px wide */
  mark(x, y, size) {
    const s = size / 412
    return this.add(
      `<g transform="translate(${x - 50 * s} ${y - 50 * s}) scale(${s})">` +
        `<path d="M273.1 92.9A164 164 0 1 0 419.1 238.9" fill="none" stroke="url(#mark)" stroke-width="84" stroke-linecap="round"/>` +
        `<circle cx="372" cy="140" r="42" fill="url(#mark)"/></g>`
    )
  }

  /**
   * The page header on the content surface, as the app's screens open: the
   * title with a meta line beside it, a line of help, and a hairline
   */
  page(title, meta, help) {
    const top = FRAME.brand + FRAME.pad
    this.text(this.left, top + 18, title, { size: 20, weight: 600 })
    this.text(
      this.left + textWidth(title, 20, { weight: 600 }) + 10,
      top + 18,
      meta,
      { size: 13, fill: this.t.muted }
    )
    this.text(this.left, top + 42, help, { size: 13, fill: this.t.muted })
    return this.hairline(this.left, this.right, top + 64)
  }

  svg(title) {
    const { t, width, height } = this
    const stops = t.gradient
      .map(([color, at]) => `<stop offset="${at}" stop-color="${color}"/>`)
      .join('')
    const shadows = t.shadows
      .map(
        (s) =>
          `<feDropShadow dx="0" dy="${s.dy}" stdDeviation="${s.blur / 2}" flood-color="${s.color}" flood-opacity="${s.opacity}"/>`
      )
      .join('')
    const arrow = (id, color) =>
      `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">` +
      `<path d="M1.5 1.5L8.5 5L1.5 8.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`
    const surface = {
      x: FRAME.inset,
      y: FRAME.brand,
      w: width - 2 * FRAME.inset,
      h: height - FRAME.brand - FRAME.inset,
    }
    const brand = new Canvas(t, this.icons, width, height)
    brand.mark(24, 17, 22)
    brand.text(56, 33, 'Pacenote', { size: 15, weight: 600 })
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="54" y1="314" x2="458" y2="198">${stops}</linearGradient>
  <filter id="lift" x="-5%" y="-5%" width="110%" height="115%">${shadows}</filter>
  ${arrow('arrow', t.faint)}
  ${arrow('arrow-main', t.primary)}
</defs>
<rect width="${width}" height="${height}" rx="24" fill="${t.chrome}"/>
${brand.parts.join('\n')}
<rect x="${surface.x}" y="${surface.y}" width="${surface.w}" height="${surface.h}" rx="20" fill="${t.surface}" filter="url(#lift)"/>
${this.parts.join('\n')}
</svg>
`
  }
}

/**
 * Slack, Pace's layers on the Mac, the Docker sandbox, and what the sandbox
 * may reach
 */
function architecture(c) {
  c.page(
    'Architecture',
    "One person's setup",
    'Pace answers your mentions on your Mac, and reasons each answer in a disposable sandbox.'
  )
  const TOP = 176

  // Slack
  c.well(48, TOP, 216, 242)
  c.heading(64, TOP + 30, 184, {
    icon: 'messages-square',
    title: 'Slack',
    meta: 'Your workspace',
  })
  c.rows(64, TOP + 46, 184, [
    { label: '#ops', help: 'A public channel' },
    {
      label: '@Pace check web-01',
      help: 'A mention, in a thread or not',
      mono: false,
    },
    { label: 'Socket Mode', help: 'Events over a WebSocket' },
    { label: 'Web API', help: 'Replies, reactions, files' },
  ])

  // The Mac. Pace's layers, in the order a mention goes through them.
  c.well(344, TOP, 428, 500)
  c.heading(360, TOP + 30, 396, {
    icon: 'laptop',
    title: 'Your Mac',
    meta: 'Pacenote.app, from Homebrew',
  })
  c.box(360, TOP + 46, 396, 274, { accent: true })
  c.heading(376, TOP + 76, 364, {
    icon: 'bot',
    title: 'Pace',
    meta: 'The bot process, run by the app',
    tone: c.t.primary,
  })
  c.rows(376, TOP + 92, 364, [
    {
      label: 'messengers/slack',
      help: 'Messenger: Slack events in, answers out',
    },
    {
      label: 'mention pipeline',
      help: 'Who may ask, context, attachments, prompt',
    },
    {
      label: 'reasoners/claude, codex',
      help: 'Reasoner: calls the CLI, reads its steps',
    },
    {
      label: 'sandbox/docker',
      help: 'Sandbox: a container per request, or the host',
    },
  ])
  c.badges(376, TOP + 286, [
    ['claude@docker', { icon: 'cpu' }],
    ['👀 on the mention', { tone: 'running' }],
  ])
  c.rows(
    360,
    TOP + 332,
    396,
    [
      {
        label: 'Desktop app',
        help: 'Overview, Todo, Runs, Settings; keeps Pace running',
        mono: false,
      },
      {
        label: 'MCP server',
        help: 'Run history and Todo for Claude Code and Codex',
        mono: false,
      },
      {
        label: '~/.pacenote',
        help: 'Settings and what Pace keeps, outside the app',
        after: (y) => {
          c.badges(360, y - 2, ['.env', 'runs/', 'logs/', 'tasks.json'], {
            outline: true,
            mono: true,
          })
          return y + 18
        },
      },
    ],
    { first: false }
  )

  // The sandbox: the renderer on its own, and the reasoner with its only two
  // ways out
  c.well(844, TOP, 308, 418)
  c.heading(860, TOP + 30, 276, {
    icon: 'container',
    title: 'Docker sandbox',
    meta: 'pacenote-* containers',
  })
  c.hairline(860, 1136, TOP + 46)
  c.text(860, TOP + 66, 'Every container', { size: 11.5, fill: c.t.muted })
  const first = c.badge(860, TOP + 76, 'read-only root')
  c.badge(866 + first, TOP + 76, 'no capabilities')
  const second = c.badge(860, TOP + 102, 'internal network')
  c.badge(866 + second, TOP + 102, 'removed after use')
  c.rows(860, TOP + 138, 276, [
    { label: 'renderer', help: 'Diagrams to PNG, no network' },
    { label: 'reasoner', help: 'claude or codex, a new container per request' },
  ])
  c.hairline(860, 1136, TOP + 230)
  c.vline(998, TOP + 240, TOP + 402)
  ;[
    [929, 'HTTPS'],
    [1071, 'MCP'],
  ].forEach(([x, label]) => {
    c.arrow(
      [
        [x, TOP + 234],
        [x, TOP + 256],
      ],
      {}
    )
    c.text(x + 8, TOP + 249, label, { size: 11, fill: c.t.muted })
  })
  c.text(860, TOP + 274, 'egress-proxy', { mono: true, size: 12, weight: 600 })
  c.text(860, TOP + 291, 'Allowed domains only', {
    size: 11.5,
    fill: c.t.muted,
  })
  c.badge(860, TOP + 304, 'api.anthropic.com')
  c.badge(860, TOP + 330, 'chatgpt.com')
  c.text(860, TOP + 370, 'and your allowlist', {
    size: 11.5,
    fill: c.t.muted,
  })
  c.text(1014, TOP + 274, 'ops-broker', { mono: true, size: 12, weight: 600 })
  c.text(1014, TOP + 291, 'Credentials stay here', {
    size: 11.5,
    fill: c.t.muted,
  })
  c.badge(1014, TOP + 304, 'SSH hosts')
  c.badge(1014, TOP + 330, 'k8s, read-only')
  c.badges(1014, TOP + 356, ['GitHub', 'Jira'])
  c.badge(1014, TOP + 382, 'work directory')

  // Slack and Pace's messenger
  c.arrow(
    [
      [264, TOP + 109],
      [358, TOP + 109],
    ],
    { main: true, label: 'mention', at: [300, TOP + 96] }
  )
  c.arrow(
    [
      [360, TOP + 121],
      [312, TOP + 121],
      [312, TOP + 207],
      [264, TOP + 207],
    ],
    { main: true, label: 'answer', at: [312, TOP + 166] }
  )
  // The pipeline renders diagrams; the sandbox layer starts the reasoner
  c.arrow(
    [
      [756, TOP + 161],
      [852, TOP + 161],
    ],
    { dashed: true, label: 'diagrams', at: [808, TOP + 161] }
  )
  c.arrow(
    [
      [756, TOP + 253],
      [808, TOP + 253],
      [808, TOP + 207],
      [852, TOP + 207],
    ],
    { main: true, label: 'docker run', at: [808, TOP + 230] }
  )

  // The rules that hold everywhere
  c.hairline(48, 1152, 700)
  c.facts(48, 724, 1104, [
    {
      icon: 'globe',
      label: 'Connection',
      value: 'No public endpoint',
      hint: 'Socket Mode connects outward',
    },
    {
      icon: 'hash',
      label: 'Channels',
      value: 'Public channels only',
      hint: 'Private channels and DMs are refused',
    },
    {
      icon: 'user-check',
      label: 'People',
      value: 'Allowed users',
      hint: 'Required when ops tools are on',
    },
    {
      icon: 'shield-check',
      label: 'Egress',
      value: 'Nothing leaves silently',
      hint: 'The proxy allows listed domains only',
    },
  ])
}

/**
 * Your tasks: Collect now has Claude Code read your Slack with your own
 * connector and add them through Pacenote's MCP server, which your AI tools
 * use too
 */
function todo(c) {
  c.page(
    'Todo and AI tools',
    'Your tasks, read as you',
    'Collect now has Claude Code read your Slack with your claude.ai connector; Pacenote holds no Slack token for it.'
  )
  const TOP = 176

  // Your side of Slack, the connector that reads it, and your AI tools
  c.well(48, TOP, 200, 196)
  c.heading(64, TOP + 30, 168, {
    icon: 'messages-square',
    title: 'Slack',
    meta: 'Read as you',
  })
  c.rows(64, TOP + 46, 168, [
    {
      label: 'Mentions of you',
      help: 'Someone asked you by name',
      mono: false,
    },
    {
      label: 'Threads you are in',
      help: 'The last word is not yours',
      mono: false,
    },
    {
      label: 'Your own messages',
      help: 'Saying you will do something',
      mono: false,
    },
  ])
  c.well(48, TOP + 236, 200, 104)
  c.heading(64, TOP + 266, 168, {
    icon: 'plug',
    title: 'claude.ai',
    meta: 'Your account',
  })
  c.rows(64, TOP + 282, 168, [
    {
      label: 'Slack connector',
      help: 'Search, read channels, threads',
      mono: false,
    },
  ])
  c.well(48, TOP + 372, 200, 152)
  c.heading(64, TOP + 402, 168, {
    icon: 'terminal',
    title: 'Your AI tools',
  })
  c.rows(64, TOP + 418, 168, [
    {
      label: 'Claude Code',
      help: 'my_tasks, or collects itself',
      mono: false,
    },
    {
      label: 'Codex',
      help: 'my_tasks and the run history',
      mono: false,
    },
  ])

  // The Mac: the collection, the app, the server and the files
  c.well(344, TOP, 808, 524)
  c.heading(360, TOP + 30, 776, {
    icon: 'laptop',
    title: 'Your Mac',
    meta: 'Pacenote.app',
  })

  c.box(360, TOP + 46, 336, 240, { accent: true })
  c.heading(376, TOP + 76, 304, {
    icon: 'terminal',
    title: 'Claude Code',
    meta: 'Headless, from Collect now',
    tone: c.t.primary,
  })
  c.rows(376, TOP + 92, 304, [
    {
      label: 'claude -p /mcp__pacenote__collect_tasks',
      help: 'One at a time, for at most 10 minutes',
    },
  ])
  c.hairline(376, 680, TOP + 138)
  c.text(376, TOP + 158, 'Allowed', { size: 11.5, fill: c.t.muted })
  c.badges(376, TOP + 168, [
    'Slack read tools',
    'Pacenote task tools',
    'ToolSearch',
  ])
  c.text(376, TOP + 208, 'Denied outright', { size: 11.5, fill: c.t.muted })
  c.badges(376, TOP + 218, ['send', 'draft', 'schedule', 'react', 'canvases'], {
    tone: 'failed',
  })
  c.text(376, TOP + 264, 'Your settings, plugins and MCP servers stay out', {
    size: 11.5,
    fill: c.t.muted,
  })

  c.box(800, TOP + 46, 336, 240)
  c.heading(816, TOP + 76, 304, { icon: 'app-window', title: 'Desktop app' })
  c.rows(816, TOP + 92, 304, [
    { label: 'Todo', help: 'Open, Maybe, Done; your decisions', mono: false },
    {
      label: 'Runs',
      help: 'Each collection, a run beside the answers',
      mono: false,
    },
    {
      label: 'Status bar',
      help: 'Collecting tasks, on any screen',
      mono: false,
    },
    {
      label: 'Settings > Todo',
      help: 'What to gather; adds Pacenote to your tools',
      mono: false,
    },
  ])

  c.box(360, TOP + 318, 336, 190)
  c.heading(376, TOP + 348, 304, {
    icon: 'server',
    title: 'Pacenote MCP server',
    meta: 'stdio',
  })
  c.hairline(376, 680, TOP + 364)
  c.vline(528, TOP + 376, TOP + 494)
  const tools = [
    [
      376,
      'Todo',
      'While Gather my tasks is on',
      ['collect_context', 'add_tasks', 'close_task', 'my_tasks'],
    ],
    [
      544,
      'Run history',
      'While Share is on',
      ['recent_runs', 'search_runs', 'get_run'],
    ],
  ]
  tools.forEach(([x, title, help, names]) => {
    c.text(x, TOP + 386, title, { size: 13, weight: 600 })
    c.text(x, TOP + 403, help, { size: 11, fill: c.t.muted })
    names.forEach((name, i) =>
      c.text(x, TOP + 426 + i * 20, name, { mono: true, size: 11.5 })
    )
  })

  c.box(800, TOP + 318, 336, 190)
  c.heading(816, TOP + 348, 304, { icon: 'folder', title: '~/.pacenote' })
  c.rows(816, TOP + 364, 304, [
    { label: 'tasks.json', help: 'The list: add_tasks, close_task' },
    {
      label: 'tasks-decisions.json',
      help: 'Done, dismissed and kept: yours alone',
    },
    { label: 'runs/', help: 'Collections, kept as long as the answers' },
  ])

  // 1 to 4: one collection
  c.arrow(
    [
      [800, TOP + 108],
      [698, TOP + 108],
    ],
    { main: true, label: 'Collect now', step: '1', at: [748, TOP + 108] }
  )
  c.arrow(
    [
      [698, TOP + 154],
      [798, TOP + 154],
    ],
    { label: 'its steps', at: [748, TOP + 154] }
  )
  c.arrow(
    [
      [432, TOP + 286],
      [432, TOP + 316],
    ],
    {
      main: true,
      label: 'collect_context',
      step: '2',
      at: [444, TOP + 301],
      anchor: 'start',
    }
  )
  c.arrow(
    [
      [360, TOP + 270],
      [250, TOP + 270],
    ],
    { main: true, label: 'read Slack', step: '3', at: [296, TOP + 251] }
  )
  c.arrow(
    [
      [148, TOP + 234],
      [148, TOP + 198],
    ],
    { main: true, label: 'as you', at: [160, TOP + 216], anchor: 'start' }
  )
  c.arrow(
    [
      [600, TOP + 286],
      [600, TOP + 316],
    ],
    {
      main: true,
      label: 'add_tasks, close_task',
      step: '4',
      at: [612, TOP + 301],
      anchor: 'start',
    }
  )
  // What follows from them
  c.arrow(
    [
      [696, TOP + 424],
      [798, TOP + 424],
    ],
    { main: true, label: 'writes', at: [747, TOP + 424] }
  )
  c.arrow(
    [
      [968, TOP + 288],
      [968, TOP + 316],
    ],
    {
      start: true,
      label: 'reads tasks, writes runs',
      at: [980, TOP + 301],
      anchor: 'start',
    }
  )
  c.arrow(
    [
      [248, TOP + 448],
      [358, TOP + 448],
    ],
    { dashed: true, label: 'MCP', at: [296, TOP + 448] }
  )

  c.hairline(48, 1152, TOP + 548)
  c.facts(48, TOP + 572, 1104, [
    {
      icon: 'key-round',
      label: 'Slack token',
      value: 'None for your tasks',
      hint: "The connector is your claude.ai account's",
    },
    {
      icon: 'shield-check',
      label: 'Slack writes',
      value: 'Denied outright',
      hint: "Whatever Claude Code's permissions say",
    },
    {
      icon: 'bot',
      label: "Pace's answers",
      value: 'Never read as you',
      hint: 'They read the thread with the bot token',
    },
    {
      icon: 'history',
      label: "A collection's run",
      value: 'Keeps no messages',
      hint: 'Tool calls and tokens, not what Slack said',
    },
  ])
}

const DIAGRAMS = [
  ['architecture', 'Pacenote architecture', 1200, 816, architecture],
  ['todo', 'Pacenote: Todo and AI tools', 1200, 846, todo],
]

const only = process.argv.slice(2)
const themes = readThemes()
const icons = await readIcons(ICONS)
mkdirSync(OUT, { recursive: true })
for (const [name, title, width, height, draw] of DIAGRAMS) {
  if (only.length && !only.includes(name)) continue
  for (const [theme, tokens] of Object.entries(themes)) {
    const canvas = new Canvas(tokens, icons, width, height)
    draw(canvas)
    const file = path.join(OUT, `${name}-${theme}.svg`)
    writeFileSync(file, canvas.svg(title))
    console.log(path.relative(process.cwd(), file))
  }
}
