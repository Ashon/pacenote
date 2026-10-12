// Calls one of the ops broker's tools over MCP from inside a reasoner VM, the
// way the CLIs do: at 127.0.0.1:8080, which the image forwards to the broker's
// VM. Prints the tool's text, or "error ..." when the call fails.
// Usage: node mcp.mjs TOOL ARGUMENTS_JSON
const [name, args = '{}'] = process.argv.slice(2)
const post = async (body) => {
  const res = await fetch('http://127.0.0.1:8080/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }),
  })
  const text = await res.text()
  // A streamed reply carries the message on its data lines.
  const json = text.includes('data:')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5))
        .join('')
    : text
  return JSON.parse(json)
}
try {
  const reply = await post({
    method: 'tools/call',
    params: { name, arguments: JSON.parse(args) },
  })
  if (reply.error) process.stdout.write(`error ${reply.error.message}`)
  else
    process.stdout.write(
      reply.result.content.map((part) => part.text ?? '').join('\n')
    )
} catch (err) {
  process.stdout.write(`error ${err.message}`)
}
