import { describe, expect, it } from 'vitest'
import { argsFromDevice } from '../src/macs/asks.js'

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
