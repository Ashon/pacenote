import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../src/i18n/locale.js'
import { StatusProblems } from '../src/runtime/problems.js'

afterEach(() => setLocale('en'))

function problems(checked: 'sandbox' | 'reasoner' = 'sandbox') {
  const told: string[][] = []
  let sandbox: string[] = []
  let images: string[] = []
  const list = new StatusProblems({
    checked,
    sandbox: () => sandbox,
    images: () => images,
    changed: (all) => told.push(all),
  })
  return {
    list,
    told,
    setSandbox: (value: string[]) => (sandbox = value),
    setImages: (value: string[]) => (images = value),
  }
}

describe('the problems the bot’s status shows', () => {
  it('lists each part in order: the check, the reasoner, images, the rest', () => {
    const { list, setSandbox, setImages } = problems()
    setSandbox(['the VM helper is missing'])
    setImages(['An image is from another version'])
    list.add('Diagram rendering disabled: no image')
    list.setReasoner('signed out')
    const all = list.all()
    expect(all).toHaveLength(4)
    expect(all[0]).toContain('the VM helper is missing')
    expect(all[1]).toContain('signed out')
    expect(all.slice(2)).toEqual([
      'An image is from another version',
      'Diagram rendering disabled: no image',
    ])
  })

  it('tells the status only when what the reasoner said changes', () => {
    const { list, told } = problems()
    list.setReasoner('signed out')
    list.setReasoner('signed out')
    list.setReasoner(undefined)
    expect(told).toHaveLength(2)
    expect(told[1]).toEqual([])
    expect(list.reasoner).toBeUndefined()
  })

  it('keeps a problem for the process’s life until the next change is told', () => {
    const { list, told } = problems()
    list.add('Diagram rendering disabled: no image')
    expect(told).toEqual([])
    list.changed()
    expect(told).toEqual([['Diagram rendering disabled: no image']])
  })

  it('names what was checked: the CLI on this Mac, or the sandbox', () => {
    const host = problems('reasoner')
    const vm = problems('sandbox')
    host.setSandbox(['claude is not signed in'])
    vm.setSandbox(['claude is not signed in'])
    expect(host.list.all()[0]).not.toEqual(vm.list.all()[0])
  })
})
