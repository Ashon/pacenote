/**
 * A sheet's gap from the window's edges, and its corners' radius: concentric
 * with the window's own corners (the window's radius less the gap), so the gap
 * keeps one width all the way round them. The gap is 4 to 8px, for corners of
 * 10px or so. Where the window's corners are square (full screen, a browser),
 * nothing is to follow, and it keeps the shape it has in a window on macOS 26.
 */
export function sheetShape(windowRadius: number): {
  gap: number
  radius: number
} {
  if (!(windowRadius > 0)) return { gap: 6, radius: 10 }
  const gap = Math.min(8, Math.max(4, windowRadius - 10))
  return { gap, radius: Math.max(0, windowRadius - gap) }
}
