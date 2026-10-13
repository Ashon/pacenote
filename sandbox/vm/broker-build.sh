#!/bin/sh
# Builds the ops broker's image for the built-in VM sandbox (pacenote-vm build),
# with the kubectl src/sandbox/vm-setup.ts pins.
# Runs as root in a VM of its own on node:24-bookworm-slim, with this folder at
# /pacenote; the way out goes only to the Debian and Kubernetes download hosts.
# The broker's code is not in the image: its bundle is mounted at /app when the
# VM starts, so a new build of the broker needs no new image.
set -eu
. /pacenote/egress.sh
start_relays /pacenote/egress-forward.mjs
export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128
export http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY"

apt-get -o Acquire::http::Proxy="$HTTP_PROXY" update
apt-get -o Acquire::http::Proxy="$HTTP_PROXY" install -y --no-install-recommends \
  openssh-client ca-certificates curl ripgrep git
curl -fsSL -o /usr/local/bin/kubectl \
  "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/arm64/kubectl"
chmod 0755 /usr/local/bin/kubectl
apt-get purge -y curl && apt-get autoremove -y
rm -rf /var/lib/apt/lists/*

install -D -m 0644 /pacenote/egress.sh /usr/local/lib/pacenote/egress.sh
install -D -m 0644 /pacenote/egress-forward.mjs /usr/local/lib/pacenote/egress-forward.mjs
install -D -m 0644 /pacenote/proxy-connect.mjs /usr/local/lib/pacenote/proxy-connect.mjs
install -m 0755 /pacenote/entrypoint.sh /usr/local/bin/sandbox-entrypoint
mkdir -p /app /work /run/broker /run/secrets /etc/ops
chown node:node /work /run/broker
