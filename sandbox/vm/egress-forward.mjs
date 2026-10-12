// Inside the built-in VM sandbox: forwards 127.0.0.1:3128, where the CLIs'
// HTTPS_PROXY points, to the host's egress proxy (src/sandbox/egress.ts), which
// pacenote-vm relays in as a unix socket. The VM has no network device, so this
// is the only way out, and the host's allowlist decides where it leads.
// Usage: node egress-forward.mjs SOCKET READY_FILE
import { writeFileSync } from 'node:fs'
import net from 'node:net'

const [socket, ready] = process.argv.slice(2)
net
  .createServer((client) => {
    const upstream = net.connect(socket)
    client.pipe(upstream)
    upstream.pipe(client)
    client.on('error', () => upstream.destroy())
    upstream.on('error', () => client.destroy())
  })
  .listen(3128, '127.0.0.1', () => writeFileSync(ready, ''))
