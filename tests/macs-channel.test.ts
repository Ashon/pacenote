import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import {
  accept,
  dial,
  macsGroup,
  macsKey,
  type MacChannel,
} from '../src/macs/channel.js'

/** Waits for a Mac to get there, with room for a busy test run */
const poll = <T>(check: () => T) =>
  expect.poll(check, { timeout: 15_000, interval: 50 })

describe('the channel between two Macs', () => {
  const servers: WebSocketServer[] = []
  afterEach(() => {
    for (const server of servers.splice(0)) server.close()
  })

  /** A listening Mac and a dialing one, each with its app token */
  async function pair(listenerToken: string, dialerToken: string) {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    servers.push(wss)
    await new Promise((resolve) => wss.once('listening', resolve))
    const port = (wss.address() as { port: number }).port
    const accepted = new Promise<MacChannel>((resolve, reject) =>
      wss.once('connection', (ws) =>
        accept(ws, {
          key: macsKey(listenerToken),
          me: { id: 'pro', name: 'MacBook Pro' },
          timeoutMs: 1_000,
        }).then(resolve, reject)
      )
    )
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`)
    await new Promise((resolve) => ws.once('open', resolve))
    const dialed = dial(ws, {
      key: macsKey(dialerToken),
      me: { id: 'air', name: 'MacBook Air' },
      timeoutMs: 1_000,
    })
    return Promise.all([accepted, dialed])
  }

  it('opens between Macs with the same Slack app and carries sealed messages', async () => {
    const [pro, air] = await pair('xapp-1-A', 'xapp-1-A')
    expect(pro.peer).toEqual({ id: 'air', name: 'MacBook Air' })
    expect(air.peer).toEqual({ id: 'pro', name: 'MacBook Pro' })
    const got: unknown[] = []
    pro.on('message', (message) => got.push(message))
    // Sent at once after the handshake: none is lost.
    air.send({ hello: 1 })
    air.send({ hello: 2 })
    await poll(() => got).toEqual([{ hello: 1 }, { hello: 2 }])
    const back = new Promise((resolve) => air.once('message', resolve))
    pro.send({ answer: 'yes' })
    await expect(back).resolves.toEqual({ answer: 'yes' })
    pro.close()
  })

  it('never opens between Macs with different Slack apps', async () => {
    expect(macsGroup(macsKey('xapp-1-A'))).not.toBe(
      macsGroup(macsKey('xapp-1-B'))
    )
    await expect(pair('xapp-1-A', 'xapp-1-B')).rejects.toThrow(
      /another Slack app/
    )
  })
})
