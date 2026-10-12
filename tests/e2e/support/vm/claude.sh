#!/bin/sh
# claude in the end-to-end image: the fake claude (fake-claude.mjs), told to
# answer with what it finds in the VM: the kernel, the network devices, the
# user, whether the sandbox login came in, and what the way out says to a host
# off the allowed list (refused there, so nothing leaves this computer).
set -eu
dir=$(mktemp -d)
login=missing
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then login=set; fi
devices=$(ls /sys/class/net | tr '\n' ' ' | sed 's/ $//')
found="$(uname -s) $(uname -m), uid $(id -u), network devices: $devices, login $login, example.com $(node /opt/fake/reach.mjs CONNECT example.com:443)"
printf '{"answer": "From the VM: %s"}\n' "$found" > "$dir/script.json"
FAKE_CLAUDE_DIR="$dir" exec node /opt/fake/fake-claude.mjs "$@"
