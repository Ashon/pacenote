import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { argsFromDevice, DeviceAsks, MacAsker } from '../src/macs/asks.js'

describe('argsFromDevice', () => {
  it('adds a task with the device Your devices names, never its own', () => {
    expect(
      argsFromDevice(
        'tasks.add',
        ['Renew the TLS certificate', 'acme/api', 'Friday', true, 'A Mac', 'x'],
        'iPad',
        'ipad-1'
      )
    ).toEqual([
      {
        title: 'Renew the TLS certificate',
        repo: 'acme/api',
        from: 'iPad',
        due: 'Friday',
        peer: 'ipad-1',
        guessed: true,
      },
    ])
  })

  it('reads an older device, which says no due date or guess', () => {
    const [input] = argsFromDevice('tasks.add', ['Book the offsite'], 'iPhone')
    expect(input).toEqual({
      title: 'Book the offsite',
      repo: undefined,
      from: 'iPhone',
      due: undefined,
      peer: undefined,
      guessed: false,
    })
  })

  it('hands tasks over with the device that asked', () => {
    const tasks = [{ id: 'local:0123456789ab', title: 'Call the bank' }]
    expect(
      argsFromDevice('tasks.handOver', [tasks, 'someone'], 'iPad', 'ipad-1')
    ).toEqual([tasks, 'ipad-1', 'iPad'])
  })

  it('leaves the settings that stay on the Mac out of a change', () => {
    expect(
      argsFromDevice('settings.save', [
        { REASONER: 'codex', SLACK_BOT_TOKEN: 'xoxb-new', OPS_FS_ROOT: '/' },
        true,
      ])
    ).toEqual([{ REASONER: 'codex' }, true])
  })

  it('passes any other ask as it came', () => {
    expect(argsFromDevice('recap.get', ['week', '2026-W45'])).toEqual([
      'week',
      '2026-W45',
    ])
  })
})

/**
 * Two Macs and a phone on one fake channel: what one sends, the one it is
 * sent to hears as from the sender
 */
function network(devices: string[] = []) {
  const ends = new Map<string, EventEmitter>()
  const end = (me: string) => {
    const events = new EventEmitter()
    ends.set(me, events)
    return {
      on: (event: 'message', listener: (peer: string, m: unknown) => void) =>
        void events.on(event, listener),
      off: (event: 'message', listener: (peer: string, m: unknown) => void) =>
        void events.off(event, listener),
      send: (peer: string, message: unknown) => {
        const there = ends.get(peer)
        if (!there) return false
        queueMicrotask(() => there.emit('message', me, message))
        return true
      },
      isDevice: (peer: string) => devices.includes(peer),
    }
  }
  return { end }
}

describe('another Mac asking for the sessions', () => {
  const answered: string[] = []
  const answerer = (macs: ReturnType<ReturnType<typeof network>['end']>) =>
    new DeviceAsks({
      macs: macs as never,
      answer: (what, args) => {
        answered.push(what)
        return { what, args }
      },
      log: () => undefined,
    })

  it('reads the sessions and a session’s page, and nothing else', async () => {
    answered.length = 0
    const net = network()
    const pro = answerer(net.end('pro'))
    pro.start()
    const asker = new MacAsker(net.end('air') as never)
    asker.start()
    await expect(asker.ask('pro', 'sessions.view')).resolves.toEqual({
      what: 'sessions.view',
      args: [],
    })
    await expect(
      asker.ask('pro', 'sessions.talk', ['claude:abc'])
    ).resolves.toEqual({ what: 'sessions.talk', args: ['claude:abc'] })
    // What a device may change, a Mac may not
    await expect(
      asker.ask('pro', 'sessions.send' as never, ['claude:abc', 'hi'])
    ).rejects.toThrow('not-allowed')
    await expect(asker.ask('pro', 'settings.get' as never)).rejects.toThrow(
      'not-allowed'
    )
    expect(answered).toEqual(['sessions.view', 'sessions.talk'])
    asker.stop()
    pro.stop()
  })

  it('still lets a device ask what a device may', async () => {
    answered.length = 0
    const net = network(['phone'])
    const pro = answerer(net.end('pro'))
    pro.start()
    const phone = new MacAsker(net.end('phone') as never)
    phone.start()
    await expect(
      phone.ask('pro', 'sessions.send' as never, ['claude:abc', 'hi'])
    ).resolves.toEqual({ what: 'sessions.send', args: ['claude:abc', 'hi'] })
    phone.stop()
    pro.stop()
  })

  it('gives up on a Mac that does not answer, or is not linked', async () => {
    const net = network()
    // An older Pacenote there: it hears the ask and says nothing
    net.end('old')
    const asker = new MacAsker(net.end('air') as never, 20)
    asker.start()
    await expect(asker.ask('old', 'sessions.view')).rejects.toThrow('no answer')
    await expect(asker.ask('gone', 'sessions.view')).rejects.toThrow(
      'not linked'
    )
    asker.stop()
  })

  it('takes an answer only from the Mac it asked', async () => {
    const net = network()
    const other = net.end('other')
    net.end('old')
    const asker = new MacAsker(net.end('air') as never, 50)
    asker.start()
    const asked = asker.ask('old', 'sessions.view')
    // Another Mac answers the same id: not the one asked
    other.send('air', { t: 'answer', id: 1, value: 'wrong' })
    await expect(asked).rejects.toThrow('no answer')
    asker.stop()
  })
})
