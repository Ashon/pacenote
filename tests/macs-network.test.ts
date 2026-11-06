import { describe, expect, it } from 'vitest'
import { browseLine, resolved } from '../src/macs/bonjour.js'
import { hostPort, MACS_PORT, privateAddress } from '../src/macs/network.js'
import {
  DIAL_MS,
  dialEvery,
  REDIAL_FOR_MS,
  REDIAL_MS,
} from '../src/macs/timing.js'

describe('the network the Macs talk on', () => {
  it('takes only your own networks', () => {
    for (const address of [
      '127.0.0.1',
      '::1',
      '192.168.0.12',
      '10.1.2.3',
      '172.20.0.5',
      '169.254.10.1',
      '100.68.215.39',
      'fd7a:115c:a1e0::1',
      'fe80::1',
      '::ffff:192.168.1.2',
    ])
      expect([address, privateAddress(address)]).toEqual([address, true])
    for (const address of [
      '8.8.8.8',
      '172.32.0.1',
      '100.128.0.1',
      '2001:db8::1',
      '::ffff:1.1.1.1',
      undefined,
    ])
      expect([address, privateAddress(address)]).toEqual([address, false])
  })

  it('reads an address added by hand', () => {
    expect(hostPort('macbook-air.local')).toEqual({
      host: 'macbook-air.local',
      port: MACS_PORT,
    })
    expect(hostPort('100.68.0.12:50000')).toEqual({
      host: '100.68.0.12',
      port: 50000,
    })
    expect(hostPort('[fd7a::1]:50000')).toEqual({
      host: 'fd7a::1',
      port: 50000,
    })
    expect(hostPort('fd7a::1')).toEqual({ host: 'fd7a::1', port: MACS_PORT })
    expect(hostPort('a b')).toBeUndefined()
    expect(hostPort('host:99999')).toBeUndefined()
  })

  it("reads dns-sd's browsing and lookup", () => {
    expect(
      browseLine(
        '12:36:11.499  Add        3  14 local.               _pacenote._tcp.      Ashon’s MacBook Air'
      )
    ).toEqual({ added: true, instance: 'Ashon’s MacBook Air' })
    expect(
      browseLine(
        '12:40:00.000  Rmv        0  14 local.               _pacenote._tcp.      Ashon’s MacBook Air'
      )
    ).toEqual({ added: false, instance: 'Ashon’s MacBook Air' })
    expect(browseLine('Timestamp     A/R    Flags  if Domain')).toBeUndefined()
    const lookup = [
      'Lookup Ashon’s MacBook Air._pacenote._tcp.local.',
      '12:36:11.499  Ashon’s\\032MacBook\\032Air._pacenote._tcp.local. can be reached at ashons-MacBook-Air.local.:49213 (interface 14) Flags: 1',
    ]
    expect(resolved(lookup.join('\n'))).toBeUndefined()
    expect(
      resolved([...lookup, ' g=abcd1234 id=mac-1', ''].join('\n'))
    ).toEqual({
      host: 'ashons-MacBook-Air.local',
      port: 49213,
      txt: { g: 'abcd1234', id: 'mac-1' },
    })
  })

  it('dials again often for a minute while the network turns this Mac away', () => {
    expect(dialEvery(undefined, 100_000)).toBe(DIAL_MS)
    expect(dialEvery(100_000, 100_000)).toBe(REDIAL_MS)
    expect(dialEvery(100_000, 100_000 + REDIAL_FOR_MS - 1)).toBe(REDIAL_MS)
    expect(dialEvery(100_000, 100_000 + REDIAL_FOR_MS)).toBe(DIAL_MS)
  })
})
