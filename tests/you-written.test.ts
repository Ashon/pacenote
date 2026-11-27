import { describe, expect, it } from 'vitest'
import { writtenAs, writtenBlocks, writtenOf } from '../src/you/written.js'

const WEEK = [
  '## Riftlancer',
  '- 하이브십과 마더쉽 재디자인',
  '- 서바이벌 밸런스 조정',
  '',
  '## Pacenote',
  '- v0.6.17–v0.6.25 출시',
  '',
  '## 남은 일',
  '- Slack 데모 영상',
].join('\n')

describe('writtenBlocks: a write-up in its parts', () => {
  it('reads each area as its heading over its bullets', () => {
    expect(writtenBlocks(WEEK)).toEqual([
      { kind: 'heading', text: 'Riftlancer' },
      {
        kind: 'bullets',
        items: ['하이브십과 마더쉽 재디자인', '서바이벌 밸런스 조정'],
      },
      { kind: 'heading', text: 'Pacenote' },
      { kind: 'bullets', items: ['v0.6.17–v0.6.25 출시'] },
      { kind: 'heading', text: '남은 일' },
      { kind: 'bullets', items: ['Slack 데모 영상'] },
    ])
  })

  it('keeps a write-up from before as its sentences', () => {
    const before =
      '이번 주에는 Supragnosis에 가장 많은 손이 갔습니다. 아직 남은 일은 데모 영상입니다.'
    expect(writtenBlocks(before)).toEqual([{ kind: 'text', text: before }])
  })

  it('takes other bullets, a bullet going on and a name over bullets', () => {
    expect(
      writtenBlocks(
        [
          'Payments:',
          '* Retry backoff shipped',
          '  for card payments',
          '1. Review asked of mina',
        ].join('\n')
      )
    ).toEqual([
      { kind: 'heading', text: 'Payments' },
      {
        kind: 'bullets',
        items: [
          'Retry backoff shipped for card payments',
          'Review asked of mina',
        ],
      },
    ])
    // A sentence over bullets stays a sentence
    expect(
      writtenBlocks('Most of it went to Payments.\n- Retry backoff')[0]
    ).toEqual({ kind: 'text', text: 'Most of it went to Payments.' })
  })
})

describe('writtenOf: what the AI wrote, as Pacenote keeps it', () => {
  it('keeps headings and bullets, and leaves out bold and blank lines', () => {
    expect(
      writtenOf(
        '### **Payments**\n\n* Retry **backoff** shipped\n•  Review asked\n\n\n## Still open\n- PR review'
      )
    ).toBe(
      '## Payments\n- Retry backoff shipped\n- Review asked\n\n## Still open\n- PR review'
    )
  })
})

describe('writtenAs: a write-up to paste', () => {
  it('in Markdown and in Slack', () => {
    expect(writtenAs(WEEK, 'markdown').split('\n').slice(0, 4)).toEqual([
      '**Riftlancer**',
      '- 하이브십과 마더쉽 재디자인',
      '- 서바이벌 밸런스 조정',
      '',
    ])
    expect(writtenAs(WEEK, 'slack')).toContain(
      '*Pacenote*\n• v0.6.17–v0.6.25 출시'
    )
  })
})
