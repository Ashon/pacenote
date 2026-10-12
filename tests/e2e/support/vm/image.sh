#!/bin/sh
# The built-in sandbox's image for end-to-end tests (pacenote-vm build on
# node:24-alpine): Pacenote's VM entrypoint and way out from sandbox/vm at
# /pacenote, this folder at /fake and its parent at /support. Its claude is the
# fake claude (fake-claude.mjs), answering with what it finds in the VM.
# Nothing is downloaded.
set -eu
mkdir -p /usr/local/lib/pacenote /opt/fake /work /run/secrets
cp /pacenote/egress.sh /pacenote/egress-forward.mjs /usr/local/lib/pacenote/
cp /pacenote/entrypoint.sh /usr/local/bin/sandbox-entrypoint
cp /support/fake-claude.mjs /fake/reach.mjs /fake/check.sh /opt/fake/
cp /fake/claude.sh /usr/local/bin/claude
chmod 0755 /usr/local/bin/sandbox-entrypoint /usr/local/bin/claude /opt/fake/check.sh
chown node:node /work
