"""The accent colors Settings > General offers (apps/web/src/accents.css).

Each is the green theme in apps/web/src/index.css turned to another hue, so
it reads as green reads:
  - The tinted surfaces (background, sidebar, selected rows, borders, the
    dark card) keep their lightness and chroma and turn by the theme's hue
    less green's (165), so every contrast stays as it is.
  - The accent colors (the fill, the ring, the charts, the mark's three stops)
    keep green's luminance, so white text on the fill reads at green's 6.0:1,
    and green's share of the most chroma sRGB holds at that lightness and hue,
    capped at 1.75 times green's own chroma (blue and purple have far more
    room and would shout over the rest).
  - Dark fills sit at 6.2:1 with their dark text: green's 7.7 would leave the
    others pastel.
  - Orange's own color at 6:1 is brown, so its fill sits at 5:1 and its text
    (primary-ink) a step deeper at 6:1. Yellow cannot take white text: its
    fill is gold with dark text, its text a deep gold that reads on white.
The order is the picker's, from green around the wheel (lib/theme.ts).

    pnpm accents          # writes accents.css (Prettier'd), prints contrasts

tests/web-color.test.ts checks what it writes.
"""
import math
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / 'apps/web/src/index.css'
OUT = ROOT / 'apps/web/src/accents.css'

GREEN_H = 165
# Each theme's hue, in OKLCH degrees where green has 165: the wheel from green
THEMES = [
    ('green', 165),
    ('blue', 255),
    ('purple', 300),
    ('pink', 352),
    ('red', 14),  # crimson, away from failed (25)
    ('orange', 50),
    ('yellow', 84),
]
CHROMA_CAP = 1.75
DARK_ON = 6.2
WHITE_ON = {'orange': 5.0}
RING_ALPHA = {'light': 0.5, 'dark': 0.6}
# Tokens that are the same in every theme: statuses keep their meaning, the
# rest are not hued or are made of other tokens
FIXED = {
    'status-running', 'status-succeeded', 'status-failed', 'status-interrupted',
    'destructive', 'skeleton', 'radius', 'pacenote-gradient', 'card-shadow',
    'float-shadow', 'primary-foreground', 'ring',
}
# The accent colors, as green has them
ACCENT = {
    'light': {'primary': '#007154', 'chart-1': '#0cb67e', 'chart-4': '#007c5c',
              'mark-1': '#01ab78', 'mark-2': '#1fc289', 'mark-3': '#48c89c'},
    'dark': {'primary': '#3ccb96', 'chart-1': '#2ec790', 'chart-4': '#a8e7d3',
             'mark-1': '#01ab78', 'mark-2': '#1fc289', 'mark-3': '#48c89c'},
}


# ---- Color
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin_to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def oklch_to_lin(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def hex_to_oklch(hx):
    r, g, b = (srgb_to_lin(int(hx[i:i + 2], 16) / 255) for i in (1, 3, 5))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(x) ** (1 / 3), x) for x in (l, m, s))
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def max_chroma(L, h):
    lo, hi = 0.0, 0.4
    for _ in range(40):
        mid = (lo + hi) / 2
        inside = all(-1e-4 <= x <= 1 + 1e-4 for x in oklch_to_lin(L, mid, h))
        lo, hi = (mid, hi) if inside else (lo, mid)
    return lo


def to_hex(L, C, h):
    C = min(C, max_chroma(L, h))
    rgb = [min(1, max(0, lin_to_srgb(min(1, max(0, x))))) for x in oklch_to_lin(L, C, h)]
    return '#' + ''.join(f'{round(x * 255):02x}' for x in rgb)


def lum(hx):
    r, g, b = (srgb_to_lin(int(hx[i:i + 2], 16) / 255) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def solid(value):
    """An oklch(...) token as hex"""
    if value.startswith('#'):
        return value
    L, C, h = (float(x) for x in re.match(r'oklch\(([\d.]+) ([\d.]+) ([\d.]+)', value).groups())
    return to_hex(L, C, h)


def cusp(h):
    """The lightness where hue h holds the most chroma"""
    return max((max_chroma(L / 200, h), L / 200) for L in range(20, 200))[1]


def by_luminance(Y, rel, h):
    """The lightness at hue h whose color, at rel of the most chroma there, has luminance Y"""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if lum(to_hex(mid, rel * max_chroma(mid, h), h)) < Y else (lo, mid)
    return (lo + hi) / 2


# ---- Themes
def tokens(selector):
    css = INDEX.read_text()
    body = re.search(re.escape(selector) + r' \{(.*?)\n\}', css, re.S).group(1)
    return {name[2:]: value for name, value in re.findall(r'\n  (--[\w-]+): ([^;\n]+);', body)}


def turn(value, H):
    """An oklch(...) token turned to the theme's hue, keeping L, C and alpha"""
    def one(m):
        L, C, h = float(m.group(1)), float(m.group(2)), float(m.group(3))
        hue = h if C == 0 else round((H + h - GREEN_H) % 360, 1)
        return f'oklch({L:g} {C:g} {hue:g}'
    return re.sub(r'oklch\(([\d.]+) ([\d.]+) ([\d.]+)', one, value)


def accent(hx, H, name, Y=None):
    """Green's accent hx at the theme's hue: its luminance (or Y), its share of chroma"""
    L, C, h = hex_to_oklch(hx)
    rel = C / max_chroma(L, h)
    h2 = (H + h - GREEN_H) % 360
    L2 = by_luminance(lum(hx) if Y is None else Y, rel, h2)
    if name.startswith('mark-') and cusp(h2) < L2:
        # The mark keeps its glow where the hue's most vivid color is darker
        L2 = L2 + 0.5 * (cusp(h2) - L2)
        return to_hex(L2, min(rel * max_chroma(L2, h2), C * CHROMA_CAP * 1.4), h2)
    C2 = min(rel * max_chroma(L2, h2), C * CHROMA_CAP)
    if C2 < rel * max_chroma(L2, h2):
        # Capped: the lightness again, for the same luminance
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if lum(to_hex(mid, C2, h2)) < (lum(hx) if Y is None else Y) else (lo, mid)
        L2 = (lo + hi) / 2
    return to_hex(L2, C2, h2)


def dark_fill(H, on):
    """The dark fill: as vivid as green's, light enough for its dark text"""
    L, C, h = hex_to_oklch(ACCENT['dark']['primary'])
    rel, h2 = C / max_chroma(L, h), (H + h - GREEN_H) % 360
    lo, hi = 0.4, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        c = to_hex(mid, min(rel * max_chroma(mid, h2), C * CHROMA_CAP), h2)
        lo, hi = (mid, hi) if contrast(c, on) < DARK_ON else (lo, mid)
    return to_hex(hi, min(rel * max_chroma(hi, h2), C * CHROMA_CAP), h2)


def theme(key, H, green):
    out = {}
    for mode in ('light', 'dark'):
        base = green[mode]
        t = {name: turn(value, H) for name, value in base.items()
             if name not in FIXED and 'oklch' in value}
        if key == 'green':
            t.update(ACCENT[mode])
            t['primary-foreground'] = base['primary-foreground']
        else:
            t.update({name: accent(hx, H, name) for name, hx in ACCENT[mode].items()})
            if mode == 'light':
                t['primary-foreground'] = '#ffffff'
                if key in WHITE_ON:
                    t['primary'] = accent(ACCENT['light']['primary'], H, 'primary',
                                          1.05 / WHITE_ON[key] - 0.05)
            else:
                t['primary-foreground'] = accent(base['primary-foreground'], H, 'primary-foreground')
                t['primary'] = dark_fill(H, t['primary-foreground'])
        t['primary-ink'] = t['primary']
        t['ring'] = t['chart-1'] if mode == 'light' else t['primary']
        # The write-ups' color, 40 degrees on from the theme as teal is from
        # green; the warm hues go the other way, where the turn would be muddy
        t['chart-5'] = turn(base['chart-5'], H if H in (165, 255, 300) else H - 80)
        out[mode] = t

    if key == 'orange':
        # Its text a step deeper than its fill, at green's 6:1
        out['light']['primary-ink'] = accent(ACCENT['light']['primary'], H, 'primary')
    if key == 'yellow':
        light, dark = out['light'], out['dark']
        light['primary'] = to_hex(0.84, 0.165, 88)
        light['primary-foreground'] = to_hex(0.29, 0.06, 80)
        light['primary-ink'] = to_hex(0.51, 0.11, 76)
        light['chart-1'] = light['ring'] = to_hex(0.8, 0.16, 85)
        light['chart-4'] = to_hex(0.6, 0.12, 78)
        marks = to_hex(0.76, 0.16, 72), to_hex(0.82, 0.17, 85), to_hex(0.87, 0.16, 96)
        for mode in (light, dark):
            mode['mark-1'], mode['mark-2'], mode['mark-3'] = marks
        # The same gold in the dark, its dark text on it
        dark['primary'] = dark['primary-ink'] = dark['ring'] = light['primary']
    return out


def rgba(hx, alpha):
    r, g, b = (int(hx[i:i + 2], 16) for i in (1, 3, 5))
    return f'rgba({r}, {g}, {b}, {alpha})'


def declarations(t, mode):
    lines = []
    for name, value in t.items():
        if name == 'ring':
            value = rgba(value, RING_ALPHA[mode])
        lines.append(f'  --{name}: {value};')
    return '\n'.join(lines)


HEADER = '''/*
 * The accent colors, as Settings > General offers them: lib/theme.ts puts
 * data-accent on the window's root, and no data-accent is green. Made by
 * scripts/accent-palette.py from the green theme in index.css (pnpm accents);
 * write it again after changing a color there, not here.
 * Any element can take a theme with data-accent, as a swatch in the picker
 * does: bg-primary there is that theme's fill. Each theme sets every token in
 * both modes, so a light value never shows through in the dark.
 * Status colors are not here: they mean the same in every theme.
 */
'''


def main():
    green = {'light': tokens(':root'), 'dark': tokens('.dark')}
    blocks = []
    report = []
    for key, H in THEMES:
        t = theme(key, H, green)
        blocks.append(f"[data-accent='{key}']:not(.dark) {{\n{declarations(t['light'], 'light')}\n}}")
        blocks.append(f".dark[data-accent='{key}'],\n.dark [data-accent='{key}'] {{\n{declarations(t['dark'], 'dark')}\n}}")
        light, dark = t['light'], t['dark']
        report.append(
            f"{key:7} fill {light['primary']} {contrast(light['primary'], light['primary-foreground']):4.1f}"
            f"  ink {contrast(light['primary-ink'], '#ffffff'):4.1f}"
            f"  dark fill {dark['primary']} {contrast(dark['primary'], dark['primary-foreground']):4.1f}"
            f"  ink {contrast(dark['primary-ink'], solid(dark['card'])):4.1f}")
    OUT.write_text(HEADER + '\n'.join(blocks) + '\n')
    print('\n'.join(report))


main()
