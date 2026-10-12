#!/bin/sh
# The built-in VM sandbox's entrypoint, as sandbox/reasoner/entrypoint.sh is the
# Docker one's: HOME is an empty tmpfs every time, so it makes the CLI state
# folders and uses a copy of codex's auth file if one is mounted. /out is the one
# writable path back to the host. It opens the ways out first (egress.sh).
set -eu
. /usr/local/lib/pacenote/egress.sh
start_relays /usr/local/lib/pacenote/egress-forward.mjs
mkdir -p "$HOME/.claude" "$HOME/.codex"
if [ -f /run/secrets/codex-auth.json ]; then
  cp /run/secrets/codex-auth.json "$HOME/.codex/auth.json"
  chmod 600 "$HOME/.codex/auth.json"
fi
if [ -d /out ]; then
  ln -sfn /out "$HOME/.codex/generated_images"
fi
exec "$@"
