#!/bin/sh
# Builds the diagram renderer's image for the built-in VM sandbox (pacenote-vm
# build): mermaid, dot, vega-lite and svg written by the model to PNG, and
# generated images shrunk before upload (renderer/render.sh). Runs as root in a
# VM of its own on node:24-bookworm-slim, with this folder at /pacenote; the way
# out goes only to the Debian, npm and Python package hosts. Renders run with no
# way out at all.
set -eu
. /pacenote/egress.sh
start_relays /pacenote/egress-forward.mjs
export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128
export http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY"

apt-get -o Acquire::http::Proxy="$HTTP_PROXY" update
apt-get -o Acquire::http::Proxy="$HTTP_PROXY" install -y --no-install-recommends \
  ca-certificates chromium graphviz librsvg2-bin fonts-noto-cjk python3 python3-pip
rm -rf /var/lib/apt/lists/*

# mermaid-cli uses the system chromium. (Skips puppeteer's browser download)
PUPPETEER_SKIP_DOWNLOAD=true npm install -g "@mermaid-js/mermaid-cli@${MERMAID_CLI_VERSION}"
npm cache clean --force
pip3 install --no-cache-dir --break-system-packages \
  "vl-convert-python==${VL_CONVERT_VERSION}" "pillow==${PILLOW_VERSION}"

install -D -m 0644 /pacenote/renderer/puppeteer.json /etc/renderer/puppeteer.json
install -D -m 0644 /pacenote/renderer/mermaid.json /etc/renderer/mermaid.json
install -m 0755 /pacenote/renderer/render.sh /usr/local/bin/render
mkdir -p /work
