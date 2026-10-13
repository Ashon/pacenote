#!/bin/sh
# Usage: render <mermaid|dot|vega-lite|svg> <input file> <output PNG>
#        render resize <input image> <output PNG> <max long side px>
# Runs in a VM of its own with no way out, a read-only image and an empty /tmp;
# /io is the folder the bot shares for the input and the PNG.
#
# Every format is drawn as Pacenote's app looks (apps/web/src/index.css), in its
# light theme and its typeface, Pretendard: on the white content surface,
# shapes are the app's choice cards (white, a #d8e5df hairline, rounded), groups
# its wells (#f1f8f5, no border, a small muted name), lines and secondary text
# its muted foreground (#84948e, #4f665e) and text its foreground (#10211c).
# What a node means takes the app's look for it, by class: accent (the checked
# choice), primary (the primary button), warn (a notice), error and muted.
# Charts are the app's: rounded bars in the logo's gradient, series in the
# chart and status colors. mermaid takes it from mermaid.json, vega-lite from
# vega-lite.json and dot from dot.gvpr and the defaults below; what a block
# sets itself comes first, except mermaid's theme, which a block cannot change.
set -eu
format="$1"
input="$2"
output="$3"
mkdir -p "$HOME"

case "$format" in
  mermaid)
    mmdc --quiet -i "$input" -o "$output" -b '#ffffff' -s 2 \
      -p /etc/renderer/puppeteer.json -c /etc/renderer/mermaid.json
    ;;
  dot)
    # The theme's groups and classes first (dot.gvpr), then its defaults, which
    # what the block sets itself overrides
    gvpr -c -f /etc/renderer/dot.gvpr "$input" > /tmp/themed.dot
    dot -Tpng -Gdpi=150 -Gpad=0.3 -Gbgcolor='#ffffff' -Gnodesep=0.35 -Granksep=0.45 \
      -Gfontname='Pretendard SemiBold' -Gfontsize=12 -Gfontcolor='#4f665e' -Glabeljust=l \
      -Nshape=box -Nstyle=rounded,filled -Nfillcolor='#ffffff' -Ncolor='#d8e5df' \
      -Npenwidth=1 -Nmargin=0.2,0.1 -Nheight=0.42 \
      -Nfontname='Pretendard Medium' -Nfontsize=13 -Nfontcolor='#10211c' \
      -Ecolor='#84948e' -Epenwidth=1.2 -Earrowsize=0.6 \
      -Efontname=Pretendard -Efontsize=11 -Efontcolor='#4f665e' \
      -o "$output" /tmp/themed.dot
    ;;
  vega-lite)
    python3 - "$input" "$output" <<'PY'
import json
import sys
import vl_convert as vlc
vlc.register_font_directory("/usr/share/fonts")


def merged(theme, own):
    """The theme, with what the block's own config sets over it"""
    out = dict(theme)
    for key, value in own.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = merged(out[key], value)
        else:
            out[key] = value
    return out


spec = json.loads(open(sys.argv[1], encoding="utf-8").read())
theme = json.load(open("/etc/renderer/vega-lite.json", encoding="utf-8"))
spec["config"] = merged(theme, spec.get("config") or {})
# A single chart without a set size is drawn at a size that reads well in Slack.
if "mark" in spec:
    spec.setdefault("width", 520)
    spec.setdefault("height", 260)
png = vlc.vegalite_to_png(json.dumps(spec), scale=2)
open(sys.argv[2], "wb").write(png)
PY
    ;;
  svg)
    rsvg-convert --format png --zoom 2 --background-color '#ffffff' --output "$output" "$input"
    ;;
  resize)
    python3 - "$input" "$output" "${4:?max long side px is required}" <<'PY'
import sys
from PIL import Image
src, dst, limit = sys.argv[1], sys.argv[2], int(sys.argv[3])
with Image.open(src) as img:
    img.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "transparency" in img.info else "RGB")
    img.save(dst, "PNG", optimize=True)
PY
    ;;
  *)
    echo "unsupported format: $format" >&2
    exit 2
    ;;
esac
