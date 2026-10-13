#!/bin/sh
# Builds the diagram renderer's image for the built-in VM sandbox (pacenote-vm
# build): mermaid, dot, vega-lite and svg written by the model to PNG, and
# generated images shrunk before upload (renderer/render.sh). Runs as root in a
# VM of its own on node:24-bookworm-slim, with this folder at /pacenote; the way
# out goes only to the Debian, npm and Python package hosts. Renders run with no
# way out at all. Diagrams are drawn in Pacenote's theme and its typeface,
# Pretendard (SIL Open Font License), from its npm package.
set -eu
. /pacenote/egress.sh
start_relays /pacenote/egress-forward.mjs
export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128
export http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY"

apt-get -o Acquire::http::Proxy="$HTTP_PROXY" update
apt-get -o Acquire::http::Proxy="$HTTP_PROXY" install -y --no-install-recommends \
  ca-certificates chromium graphviz librsvg2-bin fontconfig fonts-noto-cjk python3 python3-pip
rm -rf /var/lib/apt/lists/*

# mermaid-cli uses the system chromium. (Skips puppeteer's browser download)
PUPPETEER_SKIP_DOWNLOAD=true npm install -g "@mermaid-js/mermaid-cli@${MERMAID_CLI_VERSION}"
npm cache clean --force
pip3 install --no-cache-dir --break-system-packages \
  "vl-convert-python==${VL_CONVERT_VERSION}" "pillow==${PILLOW_VERSION}"

# npm pack checks the package against the registry's integrity hash.
fonts=$(mktemp -d)
(cd "$fonts" && npm pack --silent "pretendard@${PRETENDARD_VERSION}" >/dev/null)
tar -xzf "$fonts"/pretendard-*.tgz -C "$fonts" package/dist/LICENSE.txt \
  package/dist/public/static/Pretendard-Regular.otf \
  package/dist/public/static/Pretendard-Medium.otf \
  package/dist/public/static/Pretendard-SemiBold.otf \
  package/dist/public/static/Pretendard-Bold.otf
install -D -m 0644 -t /usr/share/fonts/opentype/pretendard \
  "$fonts"/package/dist/public/static/*.otf "$fonts"/package/dist/LICENSE.txt
rm -rf "$fonts"
npm cache clean --force
fc-cache -f

install -D -m 0644 /pacenote/renderer/puppeteer.json /etc/renderer/puppeteer.json
install -D -m 0644 /pacenote/renderer/mermaid.json /etc/renderer/mermaid.json
install -D -m 0644 /pacenote/renderer/vega-lite.json /etc/renderer/vega-lite.json
install -D -m 0644 /pacenote/renderer/dot.gvpr /etc/renderer/dot.gvpr
install -m 0755 /pacenote/renderer/render.sh /usr/local/bin/render
mkdir -p /work
