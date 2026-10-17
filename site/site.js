// Every page of pacenote.dev loads this: the copy buttons, the track's line,
// and the two animations, "every tool reports back to Pacenote" on the home
// page and "one answer, end to end" on How it works. They move only transform
// and opacity (the compositor's properties, smooth at any refresh rate), run
// only while on screen, can be paused, and hold still under reduced motion.

// Copy the install command; the status line says so for screen readers too.
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent
    const status = button.parentElement.querySelector('.copied')
    try {
      await navigator.clipboard.writeText(text)
      button.textContent = 'Copied'
      status.textContent = 'Install command copied'
    } catch {
      status.textContent = 'Select the command to copy it'
    }
    setTimeout(() => {
      button.textContent = 'Copy'
      status.textContent = ''
    }, 2000)
  })
}

// The track's line draws once, the first time it is seen. The stages are
// there all along.
for (const track of document.querySelectorAll('.track')) {
  if (!('IntersectionObserver' in window)) {
    track.classList.add('drawn')
    continue
  }
  new IntersectionObserver(
    (entries, observer) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        track.classList.add('drawn')
        observer.disconnect()
      }
    },
    { threshold: 0.4 }
  ).observe(track)
}

const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const STANDARD = 'cubic-bezier(0.2, 0, 0, 1)'

/**
 * Stops into keyframes on one timeline: each stop is { at: ms, ...props },
 * held before the first and after the last; a stop's easing shapes the way
 * to the next one.
 */
function keyframes(stops, duration) {
  const sorted = [...stops].sort((a, b) => a.at - b.at)
  const frame = ({ at, easing, ...props }) => ({
    ...props,
    offset: Math.min(Math.max(at / duration, 0), 1),
    easing: easing ?? 'linear',
  })
  const frames = sorted.map(frame)
  if (frames[0].offset > 0) frames.unshift({ ...frames[0], offset: 0 })
  const last = frames[frames.length - 1]
  if (last.offset < 1) frames.push({ ...last, offset: 1 })
  return frames
}

/**
 * Animations that share one duration, so one control plays, pauses and
 * seeks them all
 */
class Timeline {
  constructor(duration, { loop = false, onstate = () => {} } = {}) {
    this.duration = duration
    this.loop = loop
    this.onstate = onstate
    this.animations = []
    this.state = 'paused'
    this.at = 0
  }

  add(el, stops) {
    const animation = el.animate(keyframes(stops, this.duration), {
      duration: this.duration,
      iterations: this.loop ? Infinity : 1,
      fill: 'both',
    })
    animation.pause()
    animation.currentTime = this.now()
    if (this.state === 'playing') animation.play()
    this.animations.push(animation)
    return animation
  }

  drop(animation) {
    animation.cancel()
    this.animations = this.animations.filter((a) => a !== animation)
  }

  now() {
    const first = this.animations[0]
    return first ? Number(first.currentTime) : this.at
  }

  play() {
    if (this.state === 'ended') this.seek(0)
    for (const animation of this.animations) animation.play()
    this.set('playing')
    if (!this.loop) {
      const first = this.animations[0]
      first?.finished
        .then(() => this.state === 'playing' && this.set('ended'))
        .catch(() => {})
    }
  }

  pause() {
    for (const animation of this.animations) animation.pause()
    this.at = this.now()
    if (this.state === 'playing') this.set('paused')
  }

  seek(ms) {
    for (const animation of this.animations) animation.currentTime = ms
    this.at = ms
  }

  end() {
    this.seek(this.duration)
    for (const animation of this.animations) animation.pause()
    this.set('ended')
  }

  set(state) {
    this.state = state
    this.onstate(state)
  }
}

const ICONS = {
  pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  replay:
    '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
}

/** The pause, play and replay button, named for what it will do */
function control(get, what) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'motion-control'
  const show = (state) => {
    const [icon, label] =
      state === 'playing'
        ? ['pause', 'Pause']
        : state === 'ended'
          ? ['replay', 'Replay']
          : ['play', 'Play']
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[icon]}</svg><span>${label}</span>`
    button.setAttribute('aria-label', `${label} ${what}`)
  }
  button.addEventListener('click', () => {
    const timeline = get()
    button.dataset.chosen = 'yes'
    timeline.resume = false
    if (timeline.state === 'playing') timeline.pause()
    else timeline.play()
  })
  show(get().state)
  return { button, show }
}

/**
 * Plays while at least part of it is on screen and pauses when it leaves,
 * unless the person paused it or it has ended.
 */
function whileVisible(el, get, wanted) {
  new IntersectionObserver(
    (entries) => {
      const timeline = get()
      const seen = entries.some((entry) => entry.isIntersecting)
      if (seen && wanted() && timeline.state === 'paused') timeline.play()
      if (!seen && timeline.state === 'playing') {
        timeline.pause()
        timeline.resume = true
      }
    },
    { threshold: 0.35 }
  ).observe(el)
}

const div = (cls, parent, style = {}) => {
  const el = document.createElement('div')
  if (cls) el.className = cls
  Object.assign(el.style, style)
  parent.append(el)
  return el
}
const px = (n) => `${Math.round(n * 10) / 10}px`

/* ---------- Home: every tool reports back to Pacenote ---------- */

const LANES = [
  ['slack', 'Slack'],
  ['pacenote', 'Pacenote'],
  ['claude', 'Claude Code'],
  ['codex', 'Codex'],
]

// One ask after another, in beats: who it is at, where, and what it says
const NODES = {
  n0: { lane: 'slack', t: 0, text: 'mina asked you' },
  n1: { lane: 'pacenote', t: 1, text: 'On your list' },
  n2: { lane: 'claude', t: 2, text: 'Session in Claude Code' },
  n3: { lane: 'pacenote', t: 3, text: 'How it ended' },
  n4: { lane: 'slack', t: 4, text: 'Reply you send' },
  nh: {
    lane: 'slack',
    t: 5,
    text: 'hyun asked you',
    wide: 'above',
    tall: 'above',
  },
  n5: {
    lane: 'pacenote',
    t: 5,
    text: 'Next task, with how #482 ended',
    wide: 'above',
  },
  n6: { lane: 'codex', t: 6, text: 'Session in Codex' },
  n7: { lane: 'pacenote', t: 7, text: 'How it ended', wide: 'left' },
}
const LINES = [
  { from: 'n0', to: 'n1', beat: 1 },
  { from: 'n1', to: 'n2', beat: 2 },
  { from: 'n2', to: 'n3', beat: 3, back: true },
  { from: 'n3', to: 'n4', beat: 4, laneFirst: true },
  { from: 'nh', to: 'n5', beat: 5 },
  { from: 'n3', to: 'n5', beat: 5, carried: true },
  { from: 'n5', to: 'n6', beat: 6 },
  { from: 'n6', to: 'n7', beat: 7, back: true },
]
const LEDGER = [
  ["mina's ask", 1],
  ['to Claude Code', 2],
  ['Claude Code: how it ended', 3],
  ['reply drafted', 4],
  ["hyun's ask", 5],
  ['to Codex, with #482', 6],
  ['Codex: how it ended', 7],
]
const BEAT = 1150
const LEAD = 250
const beatAt = (beat) => LEAD + (beat - 1) * BEAT
const CONVERGE_MS = beatAt(7) + BEAT + 1400

// The two ways to lay it out: time across and lanes down, or the other way
const LAYOUTS = {
  wide: {
    w: 960,
    h: 404,
    lane: { slack: 44, pacenote: 136, claude: 226, codex: 296 },
    time: (t) => 190 + 100 * t,
    at(node) {
      return { x: this.time(node.t), y: this.lane[node.lane] }
    },
  },
  tall: {
    w: 340,
    h: 744,
    lane: { slack: 44, pacenote: 124, claude: 212, codex: 294 },
    time: (t) => 74 + 72 * t,
    at(node) {
      return { x: this.lane[node.lane], y: this.time(node.t) }
    },
  },
}

function converge(figure) {
  const stage = figure.querySelector('.converge-stage')
  const caption = figure.querySelector('.converge-caption')
  const steps = [...figure.querySelectorAll('.converge-list li')].map((li) =>
    li.textContent.trim()
  )
  const top = document.createElement('div')
  top.className = 'converge-top'
  figure.prepend(top)
  figure.classList.add('ready')

  let timeline
  let shape
  let space
  const build = () => {
    const width = stage.clientWidth
    const next = width < 700 ? 'tall' : 'wide'
    const L = LAYOUTS[next]
    const scale = Math.min(width / L.w, next === 'tall' ? 1.3 : 1.15)
    stage.style.height = px(L.h * scale)
    if (next === shape && space) {
      space.style.transform = `scale(${scale})`
      space.style.left = px((width - L.w * scale) / 2)
      return
    }
    const at = timeline ? timeline.now() : 0
    const state = timeline ? timeline.state : 'paused'
    for (const animation of timeline?.animations ?? []) animation.cancel()
    shape = next
    stage.replaceChildren()
    caption.replaceChildren()
    space = div('cv-space', stage, {
      width: px(L.w),
      height: px(L.h),
      transform: `scale(${scale})`,
      left: px((width - L.w * scale) / 2),
    })
    timeline = drawConverge(space, caption, L, next === 'wide', steps, timeline)
    timeline.seek(at)
    if (state === 'playing') timeline.play()
    else if (state === 'ended') timeline.end()
  }

  build()
  const { button, show } = control(() => timeline, 'the animation')
  top.append(button)
  timeline.onstate = show
  if (still) {
    timeline.end()
    top.remove()
  } else {
    whileVisible(
      figure,
      () => timeline,
      () => !button.dataset.chosen || timeline.resume
    )
  }
  new ResizeObserver(() => {
    const before = timeline
    build()
    if (timeline !== before) timeline.onstate = show
  }).observe(stage)
}

function drawConverge(space, caption, L, wide, steps, old) {
  const timeline = new Timeline(CONVERGE_MS, { onstate: old?.onstate })
  const hub = L.lane.pacenote

  // Lanes and their names; the Pacenote lane is a band the rest come back to
  const band = wide
    ? { left: 132, top: hub - 30, width: 822, height: 60 }
    : { left: hub - 27, top: 32, width: 54, height: 590 }
  div('cv-band', space, {
    left: px(band.left),
    top: px(band.top),
    width: px(band.width),
    height: px(band.height),
  })
  const glow = div('cv-band-glow', space, {
    left: px(band.left),
    top: px(band.top),
    width: px(band.width),
    height: px(band.height),
  })
  for (const [lane, name] of LANES) {
    const pos = L.lane[lane]
    const label = div(`cv-label${lane === 'pacenote' ? ' hub' : ''}`, space)
    label.textContent = name
    if (wide) {
      Object.assign(label.style, {
        left: '0px',
        top: px(pos - 8),
        width: '120px',
      })
      div('cv-lane', space, {
        left: '142px',
        top: px(pos),
        width: '808px',
        height: '1px',
      })
    } else {
      Object.assign(label.style, {
        left: px(pos - 44),
        top: '6px',
        width: '88px',
        textAlign: 'center',
      })
      div('cv-lane', space, {
        left: px(pos),
        top: '30px',
        width: '1px',
        height: '596px',
      })
    }
  }

  // A node shows when the first line reaching it arrives; one that nothing
  // reaches shows as its first line sets out
  const shown = {}
  for (const line of LINES) {
    const parts = route(L, wide, NODES[line.from], NODES[line.to], line)
    let t = beatAt(line.beat) + 60
    for (const part of parts) {
      const d = parts.length > 1 ? 280 : 440
      segment(space, timeline, part, line, t, d)
      t += d
    }
    shown[line.to] = Math.min(shown[line.to] ?? Infinity, t - 40)
    if (line.back) head(space, timeline, parts[parts.length - 1], t - 80)
  }
  for (const line of LINES)
    if (!(line.from in shown)) shown[line.from] = beatAt(line.beat) - 150

  for (const [id, node] of Object.entries(NODES)) {
    const p = L.at(node)
    const t = shown[id]
    const isHub = node.lane === 'pacenote'
    const dot = div(`cv-node${isHub ? ' hub' : ''}`, space, {
      left: px(p.x - 7),
      top: px(p.y - 7),
    })
    timeline.add(dot, [
      { at: t, opacity: 0, scale: '0.3', easing: STANDARD },
      { at: t + 240, opacity: 1, scale: '1' },
    ])
    if (isHub) {
      const ring = div('cv-ring', space, {
        left: px(p.x - 13),
        top: px(p.y - 13),
      })
      const last = beatAt(7) + BEAT
      timeline.add(ring, [
        { at: last, opacity: 0 },
        { at: last + 420, opacity: 1 },
      ])
    }
    chip(space, timeline, L, wide, node, p, t + 200)
  }

  const finale = beatAt(7) + BEAT
  timeline.add(glow, [
    { at: finale - 100, opacity: 0 },
    { at: finale + 400, opacity: 1 },
  ])

  // What Pacenote keeps, one chip per beat, already in its place
  const ledgerTop = wide ? 348 : 650
  const label = div(
    'cv-ledger-label',
    space,
    wide
      ? { left: '0px', top: px(ledgerTop + 4) }
      : { left: '0px', top: px(ledgerTop - 24) }
  )
  label.textContent = 'Pacenote keeps'
  const ledger = div(
    'cv-ledger',
    space,
    wide
      ? { left: '142px', top: px(ledgerTop), width: '808px' }
      : { left: '0px', top: px(ledgerTop), width: '340px' }
  )
  for (const [text, beat] of LEDGER) {
    const item = document.createElement('span')
    item.textContent = text
    ledger.append(item)
    const t = beatAt(beat) + 620
    timeline.add(item, [
      { at: t, opacity: 0, translate: '-10px 0', easing: STANDARD },
      { at: t + 240, opacity: 1, translate: '0 0' },
    ])
  }

  // One line of words per beat, the same as the list beside it
  steps.forEach((text, i) => {
    const line = document.createElement('span')
    line.textContent = text
    caption.append(line)
    const t0 = beatAt(i + 1)
    const stops = [
      { at: t0 - 160, opacity: 0 },
      { at: t0 + 120, opacity: 1 },
    ]
    if (i < steps.length - 1)
      stops.push(
        { at: t0 + BEAT - 160, opacity: 1 },
        { at: t0 + BEAT + 40, opacity: 0 }
      )
    timeline.add(line, stops)
  })
  return timeline
}

/**
 * The straight parts of a line: along time first, then across lanes, or the
 * other way round
 */
function route(L, wide, from, to, line) {
  const a = L.at(from)
  const b = L.at(to)
  if (a.x === b.x || a.y === b.y) return [{ a, b }]
  const timeFirst = !line.laneFirst
  const alongTime = wide ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
  const acrossLanes = wide ? { x: a.x, y: b.y } : { x: b.x, y: a.y }
  const corner = timeFirst ? alongTime : acrossLanes
  return [
    { a, b: corner },
    { a: corner, b },
  ]
}

function segment(space, timeline, part, line, t, d) {
  const { a, b } = part
  const thick = line.back ? 4 : 3
  const across = a.y === b.y
  const cls = `cv-seg${line.back ? ' back' : ''}${line.carried ? ' carried' : ''}${line.carried && !across ? ' down' : ''}`
  const el = across
    ? div(cls, space, {
        left: px(Math.min(a.x, b.x)),
        top: px(a.y - thick / 2),
        width: px(Math.abs(b.x - a.x)),
        height: px(thick),
        transformOrigin: b.x >= a.x ? 'left center' : 'right center',
      })
    : div(cls, space, {
        left: px(a.x - thick / 2),
        top: px(Math.min(a.y, b.y)),
        width: px(thick),
        height: px(Math.abs(b.y - a.y)),
        transformOrigin: b.y >= a.y ? 'center top' : 'center bottom',
      })
  timeline.add(el, [
    { at: t, scale: across ? '0 1' : '1 0', easing: STANDARD },
    { at: t + d, scale: '1 1' },
  ])
}

/** The arrowhead where a tool's line comes back into Pacenote */
function head(space, timeline, part, t) {
  const { a, b } = part
  const dx = Math.sign(b.x - a.x)
  const dy = Math.sign(b.y - a.y)
  const angle = dy < 0 ? 0 : dy > 0 ? 180 : dx > 0 ? 90 : -90
  const el = div('cv-head', space, {
    left: px(b.x - 5 - dx * 15),
    top: px(b.y - 3.5 - dy * 15),
    transform: `rotate(${angle}deg)`,
  })
  timeline.add(el, [
    { at: t, opacity: 0 },
    { at: t + 160, opacity: 1 },
  ])
}

function chip(space, timeline, L, wide, node, p, t) {
  const isHub = node.lane === 'pacenote'
  const el = div(`cv-chip${isHub ? ' hub' : ''}`, space)
  el.textContent = node.text
  let place = wide
    ? (node.wide ?? 'below')
    : (node.tall ??
      (node.lane === 'claude' || node.lane === 'codex' ? 'left' : 'right'))
  const spots = {
    below: { left: px(p.x + 12), top: px(p.y + 10) },
    above: { left: px(p.x + 12), top: px(p.y - 32) },
    left: {
      left: px(p.x - 12),
      top: px(wide ? p.y + 10 : p.y - 11),
      transform: 'translateX(-100%)',
    },
    right: { left: px(p.x + 14), top: px(p.y - 11) },
  }
  if (!wide && place === 'above')
    spots.above = { left: px(p.x - 8), top: px(p.y - 36) }
  Object.assign(el.style, spots[place])
  timeline.add(el, [
    { at: t, opacity: 0, translate: '0 6px', easing: STANDARD },
    { at: t + 240, opacity: 1, translate: '0 0' },
  ])
}

for (const figure of document.querySelectorAll('[data-converge]')) {
  if ('animate' in Element.prototype && 'ResizeObserver' in window)
    converge(figure)
}

/* ---------- How it works: one answer, end to end ---------- */

const ARCH_MS = 9600
// Where the mention is, and when it gets there
const PATH = [
  [250, 's_mention'],
  [750, 's_socket'],
  [1250, 'p_msg'],
  [1950, 'p_pipe'],
  [3250, 'p_reason'],
  [3650, 'p_sandbox'],
  [4150, 'v_vm'],
  [4750, 'v_proxy'],
  [5150, 'v_allow'],
  [5800, 'v_broker'],
  [6400, 'v_vm'],
  [6850, 'p_sandbox'],
  [7250, 'p_redact'],
  [7650, 'p_msg'],
  [8050, 's_api'],
  [8450, 's_reply'],
]
// What lights up while it passes
const GLOW = [
  ['s_mention', 150, 1000],
  ['s_socket', 600, 1150],
  ['p_msg', 1150, 1750],
  ['p_pipe', 1850, 3000],
  ['p_reason', 3150, 3650],
  ['p_sandbox', 3550, 4050],
  ['v_vm', 4050, 6600],
  ['v_proxy', 4650, 5350],
  ['v_allow', 5050, 5700],
  ['v_block', 5450, 6100],
  ['v_broker', 5700, 6300],
  ['p_sandbox', 6750, 7150],
  ['p_msg', 7550, 7950],
  ['s_api', 7950, 8350],
  ['p_runs', 8550, 9300],
  ['v_gone', 8650, 9300],
]
// What appears on the way, gone again when it starts over
const LATE = { p_checks: 2250, p_redact: 7150, s_reply: 8350 }
// The four steps of the text above, by time
const STEPS = [
  [0, 1800],
  [1800, 3100],
  [3100, 6300],
  [6300, ARCH_MS],
]

function architecture(figure) {
  const nodes = Object.fromEntries(
    [...figure.querySelectorAll('[data-node]')].map((el) => [
      el.dataset.node,
      el,
    ])
  )
  const steps = [
    ...(figure.closest('section')?.querySelectorAll('ol.steps > li') ?? []),
  ]
  const timeline = new Timeline(ARCH_MS, { loop: true })
  const glows = {}
  for (const [id, el] of Object.entries(nodes)) {
    glows[id] = div(`glow${id === 'v_block' ? ' stop' : ''}`, el)
  }
  for (const [id, from, to] of GLOW) {
    if (!glows[id]) continue
    const stops = [
      { at: from, opacity: 0 },
      { at: from + 180, opacity: 1 },
      { at: to - 240, opacity: 1 },
      { at: to, opacity: 0 },
    ]
    glows[id].stops = (glows[id].stops ?? []).concat(stops)
  }
  for (const el of Object.values(glows))
    if (el.stops) timeline.add(el, el.stops)
  for (const [id, t] of Object.entries(LATE)) {
    timeline.add(nodes[id], [
      { at: 0, opacity: 0, scale: '0.94' },
      { at: t, opacity: 0, scale: '0.94', easing: STANDARD },
      { at: t + 240, opacity: 1, scale: '1' },
      { at: ARCH_MS - 260, opacity: 1, scale: '1' },
      { at: ARCH_MS, opacity: 0, scale: '0.94' },
    ])
  }
  timeline.add(nodes.v_vm, [
    { at: 8650, opacity: 1 },
    { at: 8950, opacity: 0.45 },
    { at: ARCH_MS - 300, opacity: 0.45 },
    { at: ARCH_MS, opacity: 1 },
  ])
  steps.forEach((li, i) => {
    const stops = [{ at: 0, opacity: i === 0 ? 1 : 0.4 }]
    const [from, to] = STEPS[i]
    if (i > 0)
      stops.push({ at: from - 200, opacity: 0.4 }, { at: from, opacity: 1 })
    if (i < STEPS.length - 1)
      stops.push({ at: to - 200, opacity: 1 }, { at: to, opacity: 0.4 })
    else
      stops.push(
        { at: ARCH_MS - 200, opacity: 1 },
        { at: ARCH_MS, opacity: 0.4 }
      )
    timeline.add(li, stops)
  })

  const packet = div('packet', figure)
  const ghost = div('packet ghost', figure)
  let moving = []
  const place = () => {
    for (const animation of moving) timeline.drop(animation)
    const box = figure.getBoundingClientRect()
    // On each card's left edge, so it never covers the words
    const centre = (id) => {
      const r = nodes[id].getBoundingClientRect()
      return `${px(r.left - box.left)} ${px(r.top + r.height / 2 - box.top)}`
    }
    const stops = [{ at: 0, opacity: 0, translate: centre(PATH[0][1]) }]
    PATH.forEach(([t, id], i) => {
      if (i === 0) {
        stops.push(
          { at: t - 100, opacity: 0, translate: centre(id) },
          { at: t + 100, opacity: 1, translate: centre(id) }
        )
        return
      }
      const before = centre(PATH[i - 1][1])
      stops.push(
        { at: t - 380, opacity: 1, translate: before, easing: STANDARD },
        { at: t, opacity: 1, translate: centre(id) }
      )
    })
    const end = PATH[PATH.length - 1][0]
    stops.push(
      { at: end + 150, opacity: 1, translate: centre('s_reply') },
      { at: end + 350, opacity: 0, translate: centre('s_reply') }
    )
    moving = [
      timeline.add(packet, stops),
      timeline.add(ghost, [
        { at: 4950, opacity: 0, translate: centre('v_proxy'), scale: '1' },
        {
          at: 5100,
          opacity: 1,
          translate: centre('v_proxy'),
          scale: '1',
          easing: STANDARD,
        },
        { at: 5450, opacity: 1, translate: centre('v_block'), scale: '1' },
        { at: 5850, opacity: 0, translate: centre('v_block'), scale: '0.4' },
      ]),
    ]
  }
  place()

  const bar = figure.querySelector('.arch-head')
  const { button, show } = control(() => timeline, 'the diagram')
  timeline.onstate = show
  bar.append(button)

  // The steps' numbers move the diagram to that step
  const list = steps[0]?.parentElement
  if (list) {
    list.classList.add('jumpable')
    steps.forEach((li, i) => {
      const jump = document.createElement('button')
      jump.type = 'button'
      jump.className = 'step-num'
      jump.textContent = String(i + 1)
      jump.setAttribute('aria-label', `Show step ${i + 1} in the diagram`)
      jump.addEventListener('click', () => {
        timeline.seek(STEPS[i][0] + 1)
        if (timeline.state !== 'playing') timeline.play()
        figure.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
      li.prepend(jump)
    })
  }

  whileVisible(
    figure,
    () => timeline,
    () => !button.dataset.chosen || timeline.resume
  )
  let pending
  new ResizeObserver(() => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(place)
  }).observe(figure)
}

if (!still && 'animate' in Element.prototype && 'ResizeObserver' in window) {
  for (const figure of document.querySelectorAll('[data-arch]'))
    architecture(figure)
}
