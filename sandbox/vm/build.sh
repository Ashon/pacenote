#!/bin/sh
# Builds the reasoner image of the built-in VM sandbox (pacenote-vm build), with
# the CLI versions src/sandbox/vm-setup.ts pins.
# Runs as root in a VM of its own on node:24-bookworm-slim, with this folder at
# /pacenote; the only way out is the host's egress proxy, open for the build to
# the Debian and npm package hosts.
set -eu
. /pacenote/egress.sh
start_relays /pacenote/egress-forward.mjs
export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128
export http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY"

apt-get -o Acquire::http::Proxy="$HTTP_PROXY" update
apt-get -o Acquire::http::Proxy="$HTTP_PROXY" install -y --no-install-recommends \
  ca-certificates git ripgrep poppler-utils
rm -rf /var/lib/apt/lists/*

npm install -g \
  "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  "@openai/codex@${CODEX_VERSION}"
npm cache clean --force

install -D -m 0644 /pacenote/egress.sh /usr/local/lib/pacenote/egress.sh
install -D -m 0644 /pacenote/egress-forward.mjs /usr/local/lib/pacenote/egress-forward.mjs
install -m 0755 /pacenote/entrypoint.sh /usr/local/bin/sandbox-entrypoint
mkdir -p /work /run/secrets
chown node:node /work
