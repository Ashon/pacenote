import { useId, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import './pace-spinner.css'

/** The ring, radius 164 around the center, drawn from the pupil's spot. */
const RING = {
  d: 'M372 140A164 164 0 1 0 140 372A164 164 0 1 0 372 140',
  // 2 pi 164: the dash lengths in pace-spinner.css are measured in it
  pathLength: 1030.44,
  fill: 'none',
  stroke: '#fff',
  strokeWidth: 84,
  strokeLinecap: 'round',
} as const

/** The logo's dot (where RING starts), from the center */
const DOT = { x: 372 - 256, y: 140 - 256 }
/** A saccade: fast start, hard stop (as in scripts/spinner-keyframes.py) */
const SACC = 'cubic-bezier(.15,.85,.3,1)'
const PARTS = ['eye', 'track', 'pupil', 'front'] as const
/**
 * How fast the mark turns: on duty, one turn in 16 seconds (pace-spinner.css),
 * and four times that while Pace answers
 */
const TURN_RATE = { slow: 1, fast: 4 } as const
/** How long a change of the turn's speed takes */
const RAMP_MS = 600

/**
 * Pace's mark at work: the dot looks around on the ring, now and then opens
 * into an arc like a lens, or comes to the middle to face you and skims a few
 * lines (keyframes in pace-spinner.css, made by scripts/spinner-keyframes.py).
 * Only the mask moves; the gradient stays put.
 * When active turns off, it eases back into the logo from wherever it was;
 * when it turns on, the loop starts again from the logo, still for its first
 * 0.3 seconds, so a short load never moves.
 * With turn, the whole mark goes round at a steady pace instead: Pace on duty
 * (slow) or answering (fast). A change of speed eases in without a jump, and
 * when turn ends the mark turns back to the logo the short way.
 * Meant for 24 pixels and up: smaller, the dot and the gap blur together.
 */
export function PaceSpinner({
  className,
  label,
  active = true,
  turn,
}: {
  className?: string
  /** Read out instead of the text beside it; without one it is decoration */
  label?: string
  /** Looking around (default), or the logo */
  active?: boolean
  /** Turning steadily, slow or fast; pass active={false} with it */
  turn?: keyof typeof TURN_RATE
}) {
  // Each spinner needs its own gradient and mask ids.
  const id = useId().replace(/[^\w-]/g, '')
  const svg = useRef<SVGSVGElement>(null)
  const settling = useRef<Animation[]>([])
  const mounted = useRef(false)
  const turnBack = useRef<Animation>(undefined)

  useLayoutEffect(() => {
    const element = svg.current
    if (!element) return
    const first = !mounted.current
    mounted.current = true
    if (active) {
      for (const animation of settling.current) animation.cancel()
      settling.current = []
      delete element.dataset.still
    } else if (first) {
      element.dataset.still = ''
    } else if (element.dataset.still === undefined) {
      settling.current = settle(element)
    }
  }, [active])

  useLayoutEffect(() => {
    const element = svg.current
    const group = element?.querySelector<SVGGElement>('.pace-spinner-turn')
    if (!element || !group) return
    if (turn) {
      turnBack.current?.cancel()
      const starting = element.dataset.turn === undefined
      element.dataset.turn = ''
      // The CSS animation, once the style is read; none with reduced motion
      const animation = group.getAnimations()[0]
      if (!animation) return
      if (starting) animation.playbackRate = TURN_RATE[turn]
      else return ramp(animation, TURN_RATE[turn])
    } else if (element.dataset.turn !== undefined) {
      const angle = angleOf(getComputedStyle(group).transform)
      delete element.dataset.turn
      const { keyframes, duration } = homing(angle)
      turnBack.current = group.animate(keyframes, { duration })
    }
  }, [turn])

  return (
    <svg
      ref={svg}
      viewBox="0 0 512 512"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('pace-spinner size-7 shrink-0', className)}
    >
      <defs>
        <linearGradient
          id={`${id}-gradient`}
          gradientUnits="userSpaceOnUse"
          x1="54"
          y1="314"
          x2="458"
          y2="198"
        >
          <stop offset="0" stopColor="#01ab78" />
          <stop offset="0.46" stopColor="#1fc289" />
          <stop offset="1" stopColor="#48c89c" />
        </linearGradient>
        <mask
          id={`${id}-mask`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="512"
          height="512"
        >
          {/* Both are dashes on one circle that starts at the pupil: the
              track's dash leaves the opening, and the pupil's dash is the
              dot, or an arc while it focuses. (dash lengths: the CSS) */}
          <g className="pace-spinner-turn">
            <g className="pace-spinner-eye">
              <path className="pace-spinner-track" {...RING} />
              <path className="pace-spinner-pupil" {...RING} />
            </g>
            {/* The pupil facing you, in the middle while it reads */}
            <circle
              className="pace-spinner-front"
              cx="256"
              cy="256"
              r="42"
              fill="#fff"
            />
          </g>
        </mask>
      </defs>
      <rect
        width="512"
        height="512"
        fill={`url(#${id}-gradient)`}
        mask={`url(#${id}-mask)`}
      />
    </svg>
  )
}

/**
 * Stops the loop and eases each part from where it is to the logo: the
 * opening and the dot back to their size, a facing pupil back to the dot's
 * spot on the ring, and the eye turning the short way to rest with a small
 * overshoot. The logo is what the CSS gives without its animations
 * (data-still), so the settle ends on it exactly.
 */
function settle(svg: SVGSVGElement): Animation[] {
  const [eye, track, pupil, front] = PARTS.map(
    (part) => svg.querySelector(`.pace-spinner-${part}`) as SVGElement
  ) as [SVGElement, SVGElement, SVGElement, SVGElement]
  // The settle plays at the loop's speed (slow motion on the debug page).
  const rate = eye.getAnimations()[0]?.playbackRate ?? 1
  const [eyeNow, trackNow, pupilNow, frontNow] = [eye, track, pupil, front].map(
    read
  ) as [Style, Style, Style, Style]
  svg.dataset.still = ''
  // Without its animations each part is at rest: the logo.
  const rest = (part: Element) => dash(read(part))

  const facing = Number(frontNow.opacity) > 0.5
  const { keyframes: home, duration } = homing(angleOf(eyeNow.transform))
  const play = (
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ) => {
    const animation = element.animate(keyframes, { fill: 'both', ...options })
    animation.playbackRate = rate
    return animation
  }

  const animations = [
    play(eye, home, { duration }),
    play(track, [dash(trackNow), rest(track)], {
      duration: duration * 0.8,
      easing: 'cubic-bezier(.3,.7,.4,1)',
    }),
    play(pupil, [dash(pupilNow), rest(pupil)], {
      duration: duration * 0.6,
      easing: 'ease-out',
    }),
  ]
  if (facing) {
    // The facing pupil goes to the dot's spot while the eye turns to rest;
    // the ring's dot shows again where it lands.
    const at = matrix(frontNow.transform)
    animations.push(
      play(
        front,
        [
          {
            transform: `translate(${at.e}px, ${at.f}px) scale(${at.a}, ${at.d})`,
            opacity: 1,
          },
          {
            transform: `translate(${DOT.x}px, ${DOT.y}px) scale(1, 1)`,
            opacity: 1,
          },
        ],
        { duration, easing: 'cubic-bezier(.4,0,.2,1)' }
      ),
      play(pupil, [{ opacity: 0 }, { opacity: 0 }], { duration })
    )
  }
  void Promise.all(animations.map((animation) => animation.finished))
    .then(() => {
      for (const animation of animations) animation.cancel()
    })
    .catch(() => {
      // Cancelled: active turned on again first.
    })
  return animations
}

/**
 * Back to rest from a turn of angle degrees: the short way, fast at first,
 * with a small overshoot (the eye when the loop stops, the turn when it ends)
 */
function homing(angle: number) {
  const overshoot = -Math.sign(angle) * Math.max(1.5, Math.abs(angle) * 0.06)
  return {
    duration: Math.min(720, 300 + Math.abs(angle) * 2.2),
    keyframes: [
      { transform: `rotate(${angle}deg)`, easing: SACC },
      { transform: `rotate(${overshoot}deg)`, offset: 0.7, easing: 'linear' },
      { transform: `rotate(${-overshoot * 0.35}deg)`, offset: 0.85 },
      { transform: 'rotate(0deg)' },
    ],
  }
}

/**
 * Eases a turn to another speed. Setting the rate keeps where the animation
 * is, so the mark never jumps. Returns a cancel.
 */
function ramp(animation: Animation, rate: number) {
  const from = animation.playbackRate
  const start = performance.now()
  let frame = requestAnimationFrame(function step(now) {
    const t = Math.min(1, Math.max(0, (now - start) / RAMP_MS))
    animation.playbackRate = from + (rate - from) * t * t * (3 - 2 * t)
    if (t < 1) frame = requestAnimationFrame(step)
  })
  return () => cancelAnimationFrame(frame)
}

const matrix = (transform: string) =>
  transform && transform !== 'none' ? new DOMMatrix(transform) : new DOMMatrix()

/** A rotation's angle in degrees, from a computed transform */
const angleOf = (transform: string) => {
  const { a, b } = matrix(transform)
  return (Math.atan2(b, a) * 180) / Math.PI
}

/** What settle reads of a part's computed style */
interface Style {
  transform: string
  strokeDasharray: string
  strokeDashoffset: string
  opacity: string
}

/** The style is live, so the values are copied while the loop still runs */
function read(part: Element): Style {
  const style = getComputedStyle(part)
  return {
    transform: style.transform,
    strokeDasharray: style.strokeDasharray,
    strokeDashoffset: style.strokeDashoffset,
    opacity: style.opacity,
  }
}

const dash = ({ strokeDasharray, strokeDashoffset }: Style) => ({
  strokeDasharray,
  strokeDashoffset,
})
