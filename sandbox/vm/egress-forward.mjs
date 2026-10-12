// Inside the built-in VM sandbox: forwards a port on 127.0.0.1 to a unix
// socket pacenote-vm relays in from the host. 3128, where the CLIs'
// HTTPS_PROXY points, leads to the host's egress proxy
// (src/sandbox/egress.ts); 8080, the ops tools' MCP address, to the broker's
// VM. The VM has no network device, so these are the only ways out, and the
// host decides where they lead.
// Usage: node egress-forward.mjs SOCKET PORT READY_FILE
import { writeFileSync } from 'node:fs'
import net from 'node:net'

const [socket, port, ready] = process.argv.slice(2)
net
  .createServer((client) => {
    const upstream = net.connect(socket)
    client.pipe(upstream)
    upstream.pipe(client)
    client.on('error', () => upstream.destroy())
    upstream.on('error', () => client.destroy())
  })
  .listen(Number(port), '127.0.0.1', () => writeFileSync(ready, ''))
