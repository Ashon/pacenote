#!/bin/sh
# The ops broker's image for end-to-end tests (pacenote-vm build on
# node:24-alpine): what sandbox/vm/broker-build.sh puts in, from sandbox/vm at
# /pacenote, but no ssh or kubectl, which only the tools these tests leave out
# use. The broker's own code is mounted at /app when its VM starts.
set -eu
mkdir -p /usr/local/lib/pacenote /app /work /run/broker /run/secrets /etc/ops
cp /pacenote/egress.sh /pacenote/egress-forward.mjs /pacenote/proxy-connect.mjs /usr/local/lib/pacenote/
cp /pacenote/entrypoint.sh /usr/local/bin/sandbox-entrypoint
chmod 0755 /usr/local/bin/sandbox-entrypoint
chown node:node /work /run/broker
