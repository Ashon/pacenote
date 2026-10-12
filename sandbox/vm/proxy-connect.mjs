// ssh's ProxyCommand in the broker's VM, which has no network device: opens a
// tunnel to HOST:PORT through the way out (127.0.0.1:3128, the host's egress
// proxy, which lets the broker reach only what its settings name) and joins it
// to stdin and stdout.
// Usage: node proxy-connect.mjs HOST PORT
import net from 'node:net'

const [host, port] = process.argv.slice(2)
const proxy = net.connect(3128, '127.0.0.1', () =>
  proxy.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`)
)
let head = Buffer.alloc(0)
const onHead = (chunk) => {
  head = Buffer.concat([head, chunk])
  const end = head.indexOf('\r\n\r\n')
  if (end < 0) return
  proxy.off('data', onHead)
  const status = head.subarray(0, head.indexOf('\r\n')).toString()
  if (!/^HTTP\/1\.[01] 200/.test(status)) {
    process.stderr.write(`proxy-connect: ${host}:${port}: ${status}\n`)
    process.exit(1)
  }
  const rest = head.subarray(end + 4)
  if (rest.length) process.stdout.write(rest)
  proxy.pipe(process.stdout)
  process.stdin.pipe(proxy)
}
proxy.on('data', onHead)
proxy.on('error', (err) => {
  process.stderr.write(`proxy-connect: ${err.message}\n`)
  process.exit(1)
})
proxy.on('close', () => process.exit(0))
