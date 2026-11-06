import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBroker } from '../src/broker/app.js'

/**
 * The ops broker set up from its environment and served on its own, the way
 * the broker VM runs it: here with only a work directory to browse
 */
const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-broker-'))
const root = path.join(dir, 'workspace')
mkdirSync(path.join(root, 'shop', 'docs'), { recursive: true })
writeFileSync(path.join(root, 'shop', 'docs', 'run.md'), 'restart the api\n')
writeFileSync(path.join(root, 'shop', '.env'), 'TOKEN=secret\n')

const log: Record<string, unknown>[] = []
const missing = path.join(dir, 'none')
const broker = createBroker(
  {
    FS_ROOT: root,
    WORK_ROOT: path.join(dir, 'work'),
    HOSTS_FILE: missing,
    SSH_KEY_FILE: missing,
    KUBECONFIG_FILE: missing,
    PATH: process.env.PATH,
  },
  { log: (line) => log.push(JSON.parse(line) as Record<string, unknown>) }
)

let base = ''
const server = http.createServer((req, res) => void broker.handle(req, res))
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

async function connect(): Promise<Client> {
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`))
  )
  return client
}

const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as { text: string }[]).map((part) => part.text).join('')

describe('the ops broker', () => {
  it('says what it offers on /healthz', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`fs=${root}`)
    expect(body).toContain('hosts=0')
    expect(body).toContain('git=off')
    expect((await fetch(`${base}/other`)).status).toBe(404)
  })

  it('offers only what is set up: here the work directory', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name)
    expect(names).toContain('fs_list')
    expect(names).toContain('fs_read')
    expect(names.some((name) => /^(host|k8s|ws|gh|jira)_/.test(name))).toBe(
      false
    )
    await client.close()
  })

  it('lists and reads the work directory, hiding secret files', async () => {
    const client = await connect()
    const listed = text(
      await client.callTool({ name: 'fs_list', arguments: { path: 'shop' } })
    )
    expect(listed).toContain('docs')
    expect(listed).not.toContain('.env')
    const read = await client.callTool({
      name: 'fs_read',
      arguments: { path: 'shop/docs/run.md' },
    })
    expect(text(read)).toContain('restart the api')
    await client.close()
  })

  it('turns away a path outside the work directory, and logs that it did', async () => {
    const client = await connect()
    const result = await client.callTool({
      name: 'fs_read',
      arguments: { path: '../../etc/passwd' },
    })
    expect(result.isError).toBe(true)
    expect(log).toContainEqual(
      expect.objectContaining({ tool: 'fs_read', refused: expect.any(String) })
    )
    await client.close()
  })

  it('takes nothing from a request it does not trust', async () => {
    // TRUST_REQUESTER is off: who is asking is never read from the headers
    log.length = 0
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { 'x-pacenote-user': 'U1' } },
      })
    )
    await client.callTool({ name: 'fs_list', arguments: {} })
    expect(log.some((entry) => 'by' in entry)).toBe(false)
    await client.close()
  })
})
