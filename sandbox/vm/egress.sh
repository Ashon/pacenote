# Sourced by the built-in VM sandbox's entrypoint and image builds: for each
# socket the host relays in, forwards a port on 127.0.0.1 to it
# (egress-forward.mjs) and waits until that listens. The egress proxy's is
# 3128, the broker's 8080.
RELAY_DIR=/run/pacenote

forward() { # SOCKET PORT FORWARDER
  [ -S "$1" ] || return 0
  ready=$(mktemp -u /tmp/pacenote-forward.XXXXXX)
  node "$3" "$1" "$2" "$ready" &
  i=0
  while [ ! -e "$ready" ]; do
    i=$((i + 1))
    if [ "$i" -gt 100 ]; then
      echo "The way out of the sandbox did not open ($2)." >&2
      return 1
    fi
    sleep 0.05
  done
  rm -f "$ready"
}

start_relays() { # FORWARDER
  forward "$RELAY_DIR/egress.sock" 3128 "$1"
  forward "$RELAY_DIR/broker.sock" 8080 "$1"
}
