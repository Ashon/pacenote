import { describe, expect, it } from 'vitest'
import { areaChoices, guessArea, wordsOf } from '../src/you/guess.js'
import type { AreaView } from '../src/you/types.js'

const area = (
  id: string,
  name: string,
  parts: AreaView['parts'],
  extra: Partial<AreaView> = {}
): AreaView => ({
  id,
  name,
  parts,
  state: 'active',
  roles: [],
  now: [],
  lately: [],
  latelyMore: 0,
  people: [],
  weeks: [],
  ...extra,
})

const payments = area(
  'payments',
  'Payments',
  [
    { kind: 'repo', id: 'Ashon/payments', label: 'Ashon/payments' },
    { kind: 'channel', id: 'C1', label: '#payments' },
  ],
  {
    now: [{ id: '1', title: 'Review the payment retry PR' }],
    lately: [
      { id: '2', title: 'Shipped retry backoff for payment retries', at: '' },
    ],
    lastActiveAt: '2026-10-28T08:00:00Z',
  }
)
const billing = area(
  'billing',
  'Billing migration',
  [{ kind: 'repo', id: 'Ashon/billing', label: 'Ashon/billing' }],
  { lastActiveAt: '2026-10-28T09:00:00Z' }
)
const oncall = area('oncall', 'Infra on-call', [
  { kind: 'channel', id: 'C2', label: '#infra-oncall' },
])

describe('the project of a task you add', () => {
  it('is guessed from its name, or from two words its tasks share', () => {
    expect(
      guessArea('Draft the billing migration plan', [payments, billing])
    ).toEqual({
      id: 'billing',
      name: 'Billing migration',
      repo: 'Ashon/billing',
      word: 'billing',
    })
    expect(
      guessArea('Write the rollout note for retry backoff', [payments, billing])
    ).toMatchObject({ id: 'payments', word: 'retry' })
  })

  it('is not guessed with nothing to go on, nor where it has no repository', () => {
    expect(guessArea('Book a dentist', [payments, billing])).toBeUndefined()
    expect(guessArea('Fix the retry', [payments])).toBeUndefined()
    expect(
      guessArea('Look at the infra on-call alert', [oncall])
    ).toBeUndefined()
    expect(guessArea('', [payments])).toBeUndefined()
  })

  it('offers the projects with a repository, active and latest first', () => {
    expect(
      areaChoices([payments, oncall, { ...billing, state: 'resting' }]).map(
        (choice) => choice.id
      )
    ).toEqual(['payments', 'billing'])
  })

  it('reads Korean words too', () => {
    expect(wordsOf('결제 재시도 노트 쓰기')).toEqual([
      '결제',
      '재시도',
      '노트',
      '쓰기',
    ])
  })
})
