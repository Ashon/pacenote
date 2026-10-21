import { describe, expect, it } from 'vitest'
import { josa } from '../src/i18n/korean.js'
import { pickLocale } from '../src/i18n/locale.js'
import { listWords } from '../src/i18n/words.js'

describe('pickLocale', () => {
  it('takes the first preferred language Pacenote is written in', () => {
    expect(pickLocale(['ko-KR', 'en-US'])).toBe('ko')
    expect(pickLocale(['ja-JP', 'ko-KR'])).toBe('ko')
    expect(pickLocale(['en-GB', 'ko'])).toBe('en')
    expect(pickLocale(['ko_KR.UTF-8'])).toBe('ko')
    expect(pickLocale(['fr-FR'])).toBe('en')
    expect(pickLocale([])).toBe('en')
  })
})

describe('josa', () => {
  it('picks the particle by how the word before it ends', () => {
    expect(josa('설정', '을/를')).toBe('설정을')
    expect(josa('슬랙', '을/를')).toBe('슬랙을')
    expect(josa('토큰', '이/가')).toBe('토큰이')
    expect(josa('사과', '이/가')).toBe('사과가')
    expect(josa('Slack', '을/를')).toBe('Slack을')
    expect(josa('Codex', '을/를')).toBe('Codex를')
    expect(josa('Claude Code', '은/는')).toBe('Claude Code는')
    expect(josa('GitHub', '과/와')).toBe('GitHub와')
    expect(josa('VM', '이/가')).toBe('VM이')
    expect(josa('ChatGPT', '이/가')).toBe('ChatGPT가')
    expect(josa('API', '을/를')).toBe('API를')
    expect(josa('macOS', '을/를')).toBe('macOS를')
    expect(josa('URL', '으로/로')).toBe('URL로')
    expect(josa('Mac', '으로/로')).toBe('Mac으로')
    expect(josa('파일', '으로/로')).toBe('파일로')
    expect(josa('3', '이/가')).toBe('3이')
    expect(josa('2', '이/가')).toBe('2가')
    expect(josa('Pace', '이에요/예요')).toBe('Pace예요')
  })
})

describe('listWords', () => {
  it('joins a list the way each language does', () => {
    expect(listWords(['a'], 'en')).toBe('a')
    expect(listWords(['a', 'b'], 'en')).toBe('a and b')
    expect(listWords(['a', 'b', 'c'], 'en')).toBe('a, b and c')
    expect(listWords(['가', '나', '다'], 'ko')).toBe('가, 나, 다')
  })
})
