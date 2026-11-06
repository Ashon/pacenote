import { describe, expect, it } from 'vitest'
import type { VmStatus } from '../src/sandbox/types.js'
import { vmReadiness } from '../src/sandbox/vm-ready.js'

const image = {
  createdAt: '2026-11-01T00:00:00Z',
  base: 'alpine',
  current: true,
}
const vm = (more: Partial<VmStatus> = {}): VmStatus => ({
  helper: { path: '/Applications/Pacenote.app/pacenote-vm', ok: true },
  kernel: true,
  initfs: true,
  image,
  ...more,
})

describe('whether the built-in sandbox is ready', () => {
  it('is ready with its helper, kernel, init image and image', () => {
    expect(vmReadiness(vm())).toBe('ready')
  })

  it('needs setting up while any part is missing', () => {
    expect(vmReadiness(vm({ kernel: false }))).toBe('set-up')
    // The first run once called a VM with no init image ready
    expect(vmReadiness(vm({ initfs: false }))).toBe('set-up')
    expect(vmReadiness(vm({ image: undefined }))).toBe('set-up')
  })

  it('says first what no setup step can fix', () => {
    expect(vmReadiness(vm({ unsupported: 'Intel Mac', kernel: false }))).toBe(
      'unsupported'
    )
    // And a helper that did not answer, which the first run once missed
    expect(
      vmReadiness(vm({ helper: { path: 'x', ok: false, error: 'no' } }))
    ).toBe('helper')
  })

  it('asks for an update when an image is from another version', () => {
    expect(vmReadiness(vm({ outdated: ['reasoner'] }))).toBe('outdated')
    expect(vmReadiness(vm({ outdated: [] }))).toBe('ready')
  })
})
