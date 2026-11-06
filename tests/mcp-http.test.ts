import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { BodyTooLargeError, readBody } from '../src/http.js'
import { serveStatelessMcp } from '../src/mcp-http.js'

/** A server for one request, with one tool that echoes what it is given */
function echoServer(): McpServer {
  const server = new McpServer({ name: 'echo', version: '1.0.0' })
  server.registerTool(
    'echo',
    { inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: 'text', text }] })
  )
  return server
}

let made = 0
let base = ''
const server = http.createServer((req, res) => {
  void serveStatelessMcp(
    req,
    res,
    () => {
      made += 1
      return echoServer()
    },
    { maxBody: 64 * 1024 }
  )
})

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const post = (body: string) =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body,
  })

describe('serving MCP with no session', () => {
  it('answers a tool call, with a server made for the request', async () => {
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(base)))
    const result = await client.callTool({
      name: 'echo',
      arguments: { text: '안녕' },
    })
    expect(result.content).toEqual([{ type: 'text', text: '안녕' }])
    await client.close()
  })

  it('turns away a body past its limit before making a server', async () => {
    const before = made
    const res = await post(JSON.stringify({ padding: 'x'.repeat(200 * 1024) }))
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({
      error: { message: 'Request body too large' },
    })
    expect(made).toBe(before)
  })

  it('takes only POST, and only JSON', async () => {
    const get = await fetch(`${base}/mcp`)
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    const bad = await post('{not json')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ error: { code: -32700 } })
  })
})

describe('reading a request body', () => {
  it('stops at its limit, keeping none of the rest', async () => {
    const reader = http.createServer((req, res) => {
      readBody(req, 10).then(
        (body) => res.end(`read ${body.length}`),
        (error: unknown) =>
          res.end(error instanceof BodyTooLargeError ? 'too large' : 'failed')
      )
    })
    await new Promise<void>((resolve) => reader.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(reader.address() as AddressInfo).port}`
    const small = await fetch(url, { method: 'POST', body: '0123456789' })
    expect(await small.text()).toBe('read 10')
    const big = await fetch(url, { method: 'POST', body: '0123456789!' })
    expect(await big.text()).toBe('too large')
    await new Promise<void>((resolve) => reader.close(() => resolve()))
  })
})
