// Asks the way out of the VM (127.0.0.1:3128, the forwarder to Pacenote's
// egress proxy) for one thing and prints the status code it gets:
//   node reach.mjs CONNECT host:443   a tunnel, as the CLIs open one
//   node reach.mjs GET http://host/   a plain request, printing the body too
import net from 'node:net'

const [method, target] = process.argv.slice(2)
const host = method === 'CONNECT' ? target : new URL(target).host
const socket = net.connect(3128, '127.0.0.1', () =>
  socket.write(
    `${method} ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`
  )
)
let reply = ''
socket.on('data', (data) => {
  reply += data
  if (method === 'CONNECT') socket.destroy()
})
socket.on('close', () => {
  const [head, body = ''] = reply.split('\r\n\r\n')
  const code = head.split(' ')[1] ?? 'none'
  process.stdout.write(method === 'CONNECT' ? code : `${code} ${body}`)
})
socket.on('error', (err) => process.stdout.write(`error ${err.code}`))
