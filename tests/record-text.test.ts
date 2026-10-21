import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../src/i18n/locale.js'
import { recordText } from '../src/history/record-text.js'
import { text } from '../src/history/record-text.text.js'

describe('recordText', () => {
  afterEach(() => setLocale('en'))

  it("finds each of Pacenote's own recorded notes by its English", () => {
    const en = text.en
    const recorded = [
      en.interruptedBecause('bot'),
      en.interruptedBy('app'),
      en.resumed(2),
      en.tooManySteps,
      en.redacted(1),
      en.redacted(3),
      en.imageUploadFailed,
      en.stoppedToShutDown,
      en.notResumedOwner,
      en.queueFull,
      en.generatedImage(1),
      en.figure(2),
    ]
    for (const note of recorded) expect(recordText(note)).toBe(note)
    setLocale('ko')
    for (const note of recorded) expect(recordText(note)).not.toBe(note)
    expect(recordText(en.resumed(2))).toBe(
      '봇이 다시 시작한 뒤 이어서 했어요 (2번째 시도)'
    )
  })

  it('leaves anything else as it was recorded', () => {
    setLocale('ko')
    expect(recordText('claude exited with code 1')).toBe(
      'claude exited with code 1'
    )
  })
})
