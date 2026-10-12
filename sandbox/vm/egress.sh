# Sourced by the built-in VM sandbox's entrypoint and image build: when the host
# relays its egress proxy in, forwards 127.0.0.1:3128 to it (egress-forward.mjs)
# and waits until that listens.
EGRESS_SOCKET=/run/pacenote/egress.sock

start_egress() {
  [ -S "$EGRESS_SOCKET" ] || return 0
  ready=$(mktemp -u /tmp/pacenote-egress.XXXXXX)
  node "$1" "$EGRESS_SOCKET" "$ready" &
  i=0
  while [ ! -e "$ready" ]; do
    i=$((i + 1))
    if [ "$i" -gt 100 ]; then
      echo "The way out of the sandbox did not open." >&2
      return 1
    fi
    sleep 0.05
  done
  rm -f "$ready"
}
