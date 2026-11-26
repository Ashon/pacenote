/**
 * The scrollbar's thumb as a line it runs along. Where the scroll area meets
 * a rounded corner of the surface, the line bends round that corner,
 * concentric with it, so the thumb at either end is not cut off by the curve.
 */

/**
 * The thumb's width as the bar draws it: slimmer than the bar (w-2.5), which
 * keeps its width as the strip you grab it by
 */
export const THUMB_WIDTH = 4
/** Its middle line from the bar's right edge: 1px padding, half the width */
const INSET = 1 + THUMB_WIDTH / 2
/** Radix's smallest thumb */
const MIN_THUMB = 18
/**
 * How far round a corner the line bends: part of the way, so a thumb at the
 * end still reads as standing at the side, its tip following the curve,
 * rather than lying along the top
 */
const BEND = Math.PI / 3

const round = (n: number) => Math.round(n * 100) / 100

/** What the thumb runs along: an SVG path in the bar's box, and its length */
export type ThumbTrack = { d: string; length: number }

/**
 * The line in a scrollbar box `width` by `height`. `top` and `bottom` are the
 * radii of the corners it meets there, 0 where it meets none.
 */
export function thumbTrack({
  width,
  height,
  top,
  bottom,
}: {
  width: number
  height: number
  top: number
  bottom: number
}): ThumbTrack {
  const x = width - INSET
  // A corner too tight to bend round, or a bar too short for both bends,
  // keeps the straight end
  const bends = (radius: number) => radius - INSET >= 1
  let up = bends(top) ? top : 0
  let down = bends(bottom) ? bottom : 0
  if (up + down > height - THUMB_WIDTH) up = down = 0
  const start = up || INSET
  const end = height - (down || INSET)
  // Where the bend leaves the corner's circle, from its centre
  const dx = (r: number) => round(r * Math.cos(BEND))
  const dy = (r: number) => round(r * Math.sin(BEND))
  let d = ''
  let length = Math.max(0, end - start)
  if (up) {
    const r = up - INSET
    d += `M${round(width - up + dx(r))} ${round(up - dy(r))}A${r} ${r} 0 0 1 ${x} ${up}`
    length += BEND * r
  } else {
    d += `M${x} ${start}`
  }
  d += `L${x} ${end}`
  if (down) {
    const r = down - INSET
    d += `A${r} ${r} 0 0 1 ${round(width - down + dx(r))} ${round(height - down + dy(r))}`
    length += BEND * r
  }
  return { d, length }
}

/**
 * How much of the line the thumb covers (`dash`, its round ends aside) and
 * how far along it starts (`offset`), for a viewport showing `viewport` of
 * `content` scrolled to `scrollTop`. The same sizes Radix gives its thumb:
 * the bar's length times the share shown, 18px at least.
 */
export function thumbDash(
  track: ThumbTrack,
  {
    viewport,
    content,
    scrollTop,
  }: { viewport: number; content: number; scrollTop: number }
): { dash: number; offset: number } {
  const shown = content > 0 ? Math.min(1, viewport / content) : 1
  const thumb = Math.max((track.length + THUMB_WIDTH) * shown, MIN_THUMB)
  const dash = Math.max(0, Math.min(track.length, thumb - THUMB_WIDTH))
  const max = content - viewport
  const at = max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0
  return { dash, offset: at * (track.length - dash) }
}
