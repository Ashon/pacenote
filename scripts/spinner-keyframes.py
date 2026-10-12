"""Keyframes for Pace's spinner (apps/web/src/components/pace-spinner.tsx).

Pace looks around on the ring: irregular saccades, each with a small overshoot
and two corrections, uneven holds with a faint tremor. Two kinds of closer
looks happen along the way, one of each in each half of the loop:
  - focus: the pupil opens into an arc along the ring like a lens, hunts for
    focus, locks, and closes back to a dot. The track's opening follows it.
  - read: the pupil leaves the ring and comes to the middle, facing you, and
    the ring closes into a full eye. The pupil skims a few lines like reading
    a page (now and then a look back, a glance off the page, a lean in on a
    word), looks at you, and goes back to the ring, which opens again.
Two full turns per loop, landing back on the rest position (the logo). The
path is seeded random, so the rhythm is irregular but repeatable.

    pnpm spinner                        # writes pace-spinner.css (Prettier'd)
    pnpm spinner --seed 11 --svg /tmp/spinner.svg

--svg also writes a standalone SVG to preview in a browser.
"""

import argparse
import math
import os
import random
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "apps/web/src/components/pace-spinner.css")

SACC = "cubic-bezier(.15,.85,.3,1)"  # saccade: fast start, hard stop
END = 720  # two full turns, lands back on rest
FIRST_REST = 300  # ms still before the first look: a short load never moves
LAST_REST = 700  # ms resting after the last one (with tremor)
TURN_SECONDS = 16  # one turn while connected (TURN_RATE in pace-spinner.tsx)

# Sizes come from a fixed bag so big and small moves are spread across the loop
# instead of clustering: no two small moves (or look-backs) in a row, and the
# loop always ends with one decisive large move into a calm rest.
BAG = ["L", "L", "L", "M", "M", "M", "M", "S", "S", "B", "B"]
RANGE = {"L": (115, 165), "M": (55, 100), "S": (22, 40), "B": (18, 45)}
HOLD = {"L": (300, 560), "M": (170, 330), "S": (70, 150), "B": (120, 240)}

STRETCH = 62.0  # locked pupil arc in a focus, degrees along the ring
HUNT = STRETCH / 36.0  # focus hunting grows with the stretch
FRONT = 1.22  # pupil size when it faces you in the middle
READ_LINES = 3  # lines skimmed in a read
READ_X = 46  # half width of a skimmed line, from the middle
READ_Y = (-30, -4, 22)  # line heights, from the middle (screen space)
READ_ZOOM = 1.5  # pupil size when it leans in on a word

# Ring geometry: radius, half stroke (round cap radius), and the gap between
# the pupil's cap and each track end, measured along the ring. At rest this
# gives the logo's 78 degree opening.
R, HALF = 164.0, 42.0
INNER = R - HALF  # radius of the ring's inner edge
BASE = -45.0  # screen angle of the pupil at rotation 0
CIRC = 2 * math.pi * R
DEG = CIRC / 360
REST_GAP = 39 * DEG  # half opening at rest (the logo)
CLEAR = REST_GAP - 2 * HALF


def gap_for(stretch):
    """Arc length from the pupil center to each track end: half the pupil arc,
    the two round caps and the clearance, so the opening follows the pupil."""
    return stretch * DEG / 2 + 2 * HALF + CLEAR


class Track:
    """One animated property: a list of (ms, value, timing)."""

    def __init__(self, v0):
        self.frames = [(0, v0, None)]

    def hold(self, t, timing=None):
        self.frames.append((t, self.frames[-1][1], timing))

    def to(self, t, v, timing=None):
        self.frames.append((t, v, timing))


def plan_path(rng):
    small = {"S", "B"}
    while True:
        kinds = BAG[:]
        rng.shuffle(kinds)
        kinds.append("L")
        if kinds[0] == "B" or kinds[-2] in small:
            continue
        if any(a in small and b in small for a, b in zip(kinds, kinds[1:])):
            continue
        break
    jumps = [(-1 if k == "B" else 1) * rng.uniform(*RANGE[k]) for k in kinds]
    fwd = sum(j for j in jumps if j > 0)
    back = -sum(j for j in jumps if j < 0)
    scale = (END + back) / fwd  # stretch forward moves to land on END
    plan, cur = [], 0.0
    for k, j in zip(kinds, jumps):
        cur += j * scale if j > 0 else j
        plan.append(
            {
                "kind": k,
                "at": round(cur, 1),
                "hold": round(rng.uniform(*HOLD[k])),
                "event": None,
            }
        )
    plan[-1].update(at=END, hold=LAST_REST)
    # One focus and one read in each half, on big or medium stops, never on
    # neighboring stops.
    half = len(plan) // 2
    for part in (range(1, half), range(half, len(plan) - 1)):
        picks = [i for i in part if plan[i]["kind"] in ("L", "M")]
        rng.shuffle(picks)
        events = ["focus", "read"]
        rng.shuffle(events)
        used = []
        for i in picks:
            if not events:
                break
            if any(abs(i - u) < 2 for u in used):
                continue
            plan[i]["event"] = events.pop()
            used.append(i)
    return plan


def build(rng, plan):
    rot = Track(0.0)  # eye rotation, degrees
    arc = Track(0.0)  # pupil arc on the ring, degrees
    gap = Track(REST_GAP)  # half opening of the ring, arc length
    gz = Track((0.0, 0.0, 1.0, 1.0))  # front pupil: x, y, scale x, scale y
    show_ring = Track(1)
    show_front = Track(0)
    tracks = (rot, arc, gap, gz, show_ring, show_front)

    t, cur = FIRST_REST, 0.0
    for stop in plan:
        target = stop["at"]
        jump = target - cur
        sign = 1 if jump > 0 else -1
        ov = max(1.5, abs(jump) * rng.uniform(0.04, 0.09)) * sign
        rot.to(t, cur, SACC)
        t += round(rng.uniform(45, 70) + abs(jump) * rng.uniform(0.35, 0.55))
        rot.to(t, target + ov, "ease-out")
        t += round(rng.uniform(30, 50))
        rot.to(t, target - ov * rng.uniform(0.25, 0.45), "linear")
        t += round(rng.uniform(22, 38))
        rot.to(t, target + ov * rng.uniform(0.08, 0.18))
        t += round(rng.uniform(22, 38))
        rot.to(t, target)
        if stop["event"] == "focus":
            t = focus(rng, t, target, rot, arc, gap)
        elif stop["event"] == "read":
            t = read(rng, t, target, *tracks)
        # tremor while holding: a few tiny, uneven twitches
        left = stop["hold"]
        while left > 140 and target != END:
            step = round(rng.uniform(60, 180))
            if step >= left - 40:
                break
            t += step
            left -= step
            rot.to(t, target + rng.uniform(-0.6, 0.6))
        t += left
        rot.to(t, target)
        cur = target
    return tracks, t


def focus(rng, t, angle, rot, arc, gap):
    """Open the pupil into an arc fast, hunt back and forth for focus while the
    eye trembles, lock, hold, then close it back to a dot with a small
    after-bounce. The track's opening follows the pupil."""

    def both(t, z, timing=None):
        arc.to(t, z, timing)
        gap.to(t, gap_for(z), timing)

    arc.hold(t, "cubic-bezier(.2,.8,.3,1)")
    gap.hold(t, "cubic-bezier(.2,.8,.3,1)")
    t += round(rng.uniform(130, 160))
    both(t, STRETCH + HUNT * rng.uniform(6, 9), "ease-in-out")
    hunt = [
        STRETCH - HUNT * rng.uniform(7, 10),
        STRETCH + HUNT * rng.uniform(3, 5),
        STRETCH - HUNT * rng.uniform(2, 4),
        STRETCH + HUNT * rng.uniform(0.5, 1.5),
        STRETCH,
    ]
    for z in hunt:
        t += round(rng.uniform(55, 95))
        both(t, z, "ease-in-out")
        rot.to(t, angle + rng.uniform(-1.6, 1.6))
    rot.to(t + 30, angle)
    t += round(rng.uniform(380, 620))  # locked: look closely
    both(t, STRETCH, "cubic-bezier(.5,0,.7,.4)")
    rot.to(t, angle + rng.uniform(-0.4, 0.4))
    t += round(rng.uniform(150, 180))
    both(t, 0.0, "ease-out")
    t += round(rng.uniform(50, 70))
    both(t, rng.uniform(4, 6), "ease-in-out")
    t += round(rng.uniform(50, 70))
    both(t, 0.0)
    rot.to(t, angle)
    return t


def foreshorten(x, y, s):
    """Off the middle, a pupil on a sphere looks a little flatter along that
    axis."""
    return (
        x,
        y,
        s * (1 - 0.14 * min(1, abs(x) / 62)),
        s * (1 - 0.14 * min(1, abs(y) / 62)),
    )


def lean_in(rng, t, x, y, gz):
    """Lean in on a word: the pupil grows, hunts for focus with a slight drift,
    holds, and eases back to reading size."""
    room = INNER - HALF * (READ_ZOOM + 0.1) - 6  # keep the big pupil inside
    d = math.hypot(x, y)
    if d > room:
        x, y = x * room / d, y * room / d
    z = READ_ZOOM
    seq = [
        z + rng.uniform(0.07, 0.11),
        z - rng.uniform(0.08, 0.12),
        z + rng.uniform(0.03, 0.05),
        z - rng.uniform(0.01, 0.03),
        z,
    ]
    gz.frames[-1] = (gz.frames[-1][0], gz.frames[-1][1], "cubic-bezier(.2,.8,.3,1)")
    for k, zz in enumerate(seq):
        t += round(rng.uniform(110, 140) if k == 0 else rng.uniform(55, 90))
        gz.to(
            t,
            foreshorten(x + rng.uniform(-2.5, 2.5), y + rng.uniform(-2, 2), zz),
            "ease-in-out",
        )
    t += round(rng.uniform(280, 460))
    gz.to(t, foreshorten(x, y, z), "cubic-bezier(.4,0,.6,1)")
    t += round(rng.uniform(120, 150))
    gz.to(t, foreshorten(x, y, FRONT * 0.96), "ease-out")
    t += round(rng.uniform(45, 65))
    gz.to(t, foreshorten(x, y, FRONT), SACC)
    return t


def read(rng, t, angle, rot, arc, gap, gz, show_ring, show_front):
    """Come to the middle facing you, skim a few lines, look at you, go back."""
    a = math.radians(BASE + angle)
    home = (R * math.cos(a), R * math.sin(a), 1.0, 1.0)
    # swap the ring pupil for the front pupil at the same spot (they overlap
    # exactly)
    show_ring.hold(t, "step-end")
    show_front.hold(t, "step-end")
    show_ring.to(t + 1, 0, "step-end")
    show_front.to(t + 1, 1, "step-end")
    gz.to(t, home)
    gz.to(t + 1, home, SACC)
    gap.hold(t + 1, "cubic-bezier(.3,.7,.4,1)")
    # into the middle: fast, a little overshoot in size, the ring closes
    # behind it
    t += 1 + round(rng.uniform(140, 170))
    gz.to(t, (0.0, 0.0, FRONT + 0.08, FRONT + 0.08), "ease-out")
    gap.to(t, 0.0)
    t += round(rng.uniform(50, 70))
    gz.to(t, (0.0, 0.0, FRONT, FRONT))
    t += round(rng.uniform(140, 220))
    gz.to(t, (0.0, 0.0, FRONT, FRONT), SACC)
    # skim lines, unevenly: fixations of mixed length, now and then a look
    # back, a glance off the page, and a lean in on a word that hunts for focus
    zooms_left = rng.choice([1, 2])
    glance_line = rng.randrange(READ_LINES)
    for line in range(READ_LINES):
        y = READ_Y[line] + rng.uniform(-3, 3)
        n = rng.choice([3, 4, 4, 5])
        xs = sorted(rng.uniform(-READ_X, READ_X) for _ in range(n - 2))
        stops = [-READ_X + rng.uniform(0, 8)] + xs + [READ_X - rng.uniform(0, 8)]
        if line and rng.random() < 0.6:
            t += round(rng.uniform(40, 220))  # a beat before the next line
        for i, x in enumerate(stops):
            t += round(rng.uniform(70, 95) if i == 0 else rng.uniform(38, 62))
            gz.to(t, foreshorten(x, y, FRONT), "ease-out")
            kind = rng.choices(["short", "normal", "long"], [3, 5, 2])[0]
            if kind == "long" and zooms_left and abs(x) < READ_X * 0.8:
                zooms_left -= 1
                t = lean_in(rng, t, x, y, gz)
            else:
                dwell = {"short": (45, 90), "normal": (100, 180), "long": (240, 400)}
                t += round(rng.uniform(*dwell[kind]))
                gz.to(
                    t,
                    foreshorten(x + rng.uniform(-1.5, 1.5), y + rng.uniform(-1, 1), FRONT),
                    SACC,
                )
            if i > 1 and rng.random() < 0.22:  # look back a word or two
                bx = x - rng.uniform(14, 30)
                t += round(rng.uniform(35, 55))
                gz.to(t, foreshorten(bx, y, FRONT), "ease-out")
                t += round(rng.uniform(90, 160))
                gz.to(t, foreshorten(bx, y, FRONT), SACC)
            if line == glance_line and i == len(stops) // 2:  # off the page
                ga = rng.uniform(0, 2 * math.pi)
                gr = INNER - HALF * FRONT - 10
                gx, gy = gr * math.cos(ga), gr * math.sin(ga)
                t += round(rng.uniform(50, 70))
                gz.to(t, foreshorten(gx, gy, FRONT), "ease-out")
                t += round(rng.uniform(140, 260))
                gz.to(t, foreshorten(gx, gy, FRONT), SACC)
                t += round(rng.uniform(55, 75))
                gz.to(t, foreshorten(x, y, FRONT), "ease-out")
                t += round(rng.uniform(60, 110))
                gz.to(t, foreshorten(x, y, FRONT), SACC)
    # look at you, then back to the ring; the ring opens again in front of it
    t += round(rng.uniform(80, 100))
    gz.to(t, (0.0, 0.0, FRONT, FRONT), "ease-out")
    t += round(rng.uniform(260, 380))
    gz.to(t, (0.0, 0.0, FRONT, FRONT), "cubic-bezier(.4,0,.2,1)")
    gap.hold(t, "cubic-bezier(.4,0,.2,1)")
    t += round(rng.uniform(150, 180))
    gz.to(t, home)
    gap.to(t, REST_GAP)
    show_ring.hold(t, "step-end")
    show_front.hold(t, "step-end")
    show_ring.to(t + 1, 1, "step-end")
    show_front.to(t + 1, 0, "step-end")
    return t + 1


def track_dash(h):
    return (
        f"stroke-dasharray: {CIRC - 2 * h:.2f} {2 * h:.2f}; "
        f"stroke-dashoffset: {-h:.2f}"
    )


def pupil_dash(z):
    length = max(1.0, z * DEG)  # a dash of 0 is not drawn; 1 draws the dot
    return (
        f"stroke-dasharray: {length:.2f} {CIRC - length:.2f}; "
        f"stroke-dashoffset: {length / 2:.2f}"
    )


def front(v):
    x, y, sx, sy = v
    return f"transform: translate({x:.1f}px, {y:.1f}px) scale({sx:.3f}, {sy:.3f})"


def keyframes(name, frames, total, declare):
    """One frame per offset (a hold's end and the next move's start merge), and
    a last frame at 100% when the frames end early."""
    merged = []
    for ms, v, tf in frames:
        if merged and merged[-1][0] == ms:
            merged[-1] = (ms, v, tf or merged[-1][2])
        else:
            merged.append((ms, v, tf))
    if merged[-1][0] < total:
        merged.append((total, merged[-1][1], None))
    lines = [f"@keyframes {name} {{"]
    for ms, v, tf in merged:
        timing = f" animation-timing-function: {tf};" if tf else ""
        lines.append(f"  {ms / total * 100:.3f}% {{ {declare(v)};{timing} }}")
    lines.append("}")
    return "\n".join(lines)


def css(seed):
    rng = random.Random(seed)
    (rot, arc, gap, gz, show_ring, show_front), total = build(rng, plan_path(rng))
    secs = f"{total / 1000:.2f}s"
    look = keyframes(
        "pace-spinner-look", rot.frames, total, lambda v: f"transform: rotate({v:.1f}deg)"
    )
    opacity = lambda v: f"opacity: {v}"  # noqa: E731
    return f"""/*
 * Generated by scripts/spinner-keyframes.py (seed {seed}): run `pnpm spinner`
 * instead of editing. Six animations of the same length, so they stay in step:
 * the eye turning, the pupil opening into an arc, the track's opening
 * following it, the pupil facing you in the middle, and the swap between the
 * two pupils.
 * The rules without animation are the logo: PaceSpinner stops the loop
 * (data-still) and eases back to them from wherever the loop was.
 * Apart from the loop, the turn: the whole mark going round at a steady pace
 * (data-turn), while Pace is connected. It turns the svg itself, gradient and
 * all, so the compositor runs it without repainting. PaceSpinner speeds it up
 * while Pace answers.
 */
.pace-spinner-eye {{
  transform-box: view-box;
  transform-origin: 256px 256px;
  animation: pace-spinner-look {secs} infinite;
}}
.pace-spinner-track {{
  {track_dash(REST_GAP)};
  animation: pace-spinner-open {secs} infinite;
}}
.pace-spinner-pupil {{
  {pupil_dash(0.0)};
  animation:
    pace-spinner-focus {secs} infinite,
    pace-spinner-ring-pupil {secs} infinite;
}}
.pace-spinner-front {{
  transform-box: view-box;
  transform-origin: 256px 256px;
  opacity: 0;
  animation:
    pace-spinner-read {secs} infinite,
    pace-spinner-front-pupil {secs} infinite;
}}
.pace-spinner[data-still] :is(.pace-spinner-eye, .pace-spinner-track, .pace-spinner-pupil, .pace-spinner-front) {{
  animation: none;
}}
.pace-spinner[data-turn] {{
  animation: pace-spinner-turn {TURN_SECONDS}s linear infinite;
}}
@keyframes pace-spinner-turn {{
  to {{ transform: rotate(360deg); }}
}}
{look}
{keyframes("pace-spinner-focus", arc.frames, total, pupil_dash)}
{keyframes("pace-spinner-open", gap.frames, total, track_dash)}
{keyframes("pace-spinner-read", gz.frames, total, front)}
{keyframes("pace-spinner-ring-pupil", show_ring.frames, total, opacity)}
{keyframes("pace-spinner-front-pupil", show_front.frames, total, opacity)}
/* Reduced motion: still, and a slow fade says it is still working. */
@media (prefers-reduced-motion: reduce) {{
  .pace-spinner-eye,
  .pace-spinner-track,
  .pace-spinner-pupil,
  .pace-spinner-front,
  .pace-spinner[data-turn] {{
    animation: none;
  }}
  .pace-spinner:not([data-still]) {{
    animation: pace-spinner-pulse 1.6s ease-in-out infinite;
  }}
}}
@keyframes pace-spinner-pulse {{
  50% {{ opacity: 0.45; }}
}}
"""


# The ring as a full circle starting at the pupil (both paths draw it), as in
# pace-spinner.tsx.
CIRCLE = "M372 140A164 164 0 1 0 140 372A164 164 0 1 0 372 140"


def preview_svg(style):
    ring = (
        f'd="{CIRCLE}" pathLength="{CIRC:.2f}" fill="none" stroke="#fff" '
        'stroke-width="84" stroke-linecap="round"'
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"
  width="512" height="512" class="pace-spinner">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse"
      x1="54" y1="314" x2="458" y2="198">
      <stop offset="0" stop-color="#01ab78"/>
      <stop offset="0.46" stop-color="#1fc289"/>
      <stop offset="1" stop-color="#48c89c"/>
    </linearGradient>
    <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <g class="pace-spinner-eye">
        <path class="pace-spinner-track" {ring}/>
        <path class="pace-spinner-pupil" {ring}/>
      </g>
      <circle class="pace-spinner-front" cx="256" cy="256" r="{HALF:.0f}" fill="#fff"/>
    </mask>
    <style>{style}</style>
  </defs>
  <rect width="512" height="512" fill="url(#g)" mask="url(#m)"/>
</svg>
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--svg", help="also write a standalone preview SVG")
    args = parser.parse_args()
    style = css(args.seed)
    with open(CSS, "w") as f:
        f.write(style)
    subprocess.run(
        ["pnpm", "exec", "prettier", "--write", CSS],
        cwd=ROOT,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    if args.svg:
        with open(args.svg, "w") as f:
            f.write(preview_svg(style))
    print(f"wrote {os.path.relpath(CSS, ROOT)}")


if __name__ == "__main__":
    main()
