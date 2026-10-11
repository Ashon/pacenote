import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatShortDay,
  formatTokens,
  previewArgs,
} from '../apps/web/src/lib/format.js'
import { slackToMarkdown } from '../apps/web/src/lib/slack.js'

describe('slackToMarkdown', () => {
  it('converts Slack bold, strikethrough, and links to Markdown and leaves code alone', () => {
    expect(slackToMarkdown('*web-01 check results*')).toBe(
      '**web-01 check results**'
    )
    expect(slackToMarkdown('- usage *90%* (180G)')).toBe(
      '- usage **90%** (180G)'
    )
    expect(slackToMarkdown('* list item')).toBe('* list item')
    expect(slackToMarkdown('already **bold** stays')).toBe(
      'already **bold** stays'
    )
    expect(slackToMarkdown('`a*b*c` and *x*')).toBe('`a*b*c` and **x**')
    expect(slackToMarkdown('2*3*4 math')).toBe('2*3*4 math')
    expect(slackToMarkdown('~struck~')).toBe('~~struck~~')
    expect(slackToMarkdown('<https://github.com/x/y/pull/1|PR #1>')).toBe(
      '[PR #1](https://github.com/x/y/pull/1)'
    )
    expect(slackToMarkdown('```\n*keep*\n```\n*bold*')).toBe(
      '```\n*keep*\n```\n**bold**'
    )
    expect(
      slackToMarkdown(
        'Registered.\n\n• Attach chart\n  ◦ Show range\n• Text on failure'
      )
    ).toBe('Registered.\n\n- Attach chart\n  - Show range\n- Text on failure')
    expect(slackToMarkdown('```\n• keep\n```')).toBe('```\n• keep\n```')
  })
})

describe('UI display formats', () => {
  it('formats durations and tool argument previews', () => {
    expect(formatDuration(850)).toBe('850ms')
    expect(formatDuration(12_340)).toBe('12.3s')
    expect(formatDuration(125_000)).toBe('2m 5s')
    expect(formatDuration(899_700)).toBe('15m')
    expect(formatDuration(7_217_000)).toBe('2h')
    expect(formatDuration(7_500_000)).toBe('2h 5m')
    expect(formatDuration(undefined)).toBe('-')
    expect(previewArgs({ host: 'web-01', check: 'uptime' })).toBe(
      'host=web-01 check=uptime'
    )
    expect(previewArgs({ q: 'x'.repeat(200) }, 20)).toHaveLength(20)
  })
})

describe('formatTokens', () => {
  it('shortens token counts', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(8_600)).toBe('8.6k')
    expect(formatTokens(9_960)).toBe('10k')
    expect(formatTokens(37_220)).toBe('37k')
    expect(formatTokens(999_600)).toBe('1M')
    expect(formatTokens(1_541_000)).toBe('1.54M')
  })
})

describe('formatShortDay', () => {
  it('names the day in a short list: Today, Yesterday, then the weekday', () => {
    const now = new Date(2026, 9, 11, 15)
    expect(formatShortDay(new Date(2026, 9, 11, 9).toISOString(), now)).toBe(
      'Today'
    )
    expect(formatShortDay(new Date(2026, 9, 10, 9).toISOString(), now)).toBe(
      'Yesterday'
    )
    expect(formatShortDay(new Date(2026, 9, 9, 9).toISOString(), now)).toBe(
      'Fri'
    )
  })
})
