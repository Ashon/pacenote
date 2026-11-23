import { describe, expect, it } from 'vitest'
import {
  cleanMessage,
  IMAGE_BYTES,
  IMAGES_MAX,
  imageBytes,
  imageOfContent,
  messageContent,
} from '../src/sessions/images.js'

/** A 1x1 PNG */
const PNG = 'iVBORw0KGODhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
const png = { mediaType: 'image/png' as const, data: PNG }

describe('images sent with a message to a session', () => {
  it('takes what you typed alone, or with images of the kinds Claude takes', () => {
    expect(cleanMessage('Why is this red?')).toEqual({
      text: 'Why is this red?',
      images: [],
    })
    expect(cleanMessage({ text: 'Why?', images: [png] })).toEqual({
      text: 'Why?',
      images: [png],
    })
    // Images alone, nothing typed
    expect(cleanMessage({ images: [png] })).toEqual({ text: '', images: [png] })
    // Only what it needs goes on
    expect(
      cleanMessage({ text: '', images: [{ ...png, name: 'shot.png' }] })
    ).toEqual({ text: '', images: [png] })
  })

  it('refuses another kind, too many, too large or not base64', () => {
    const refused = { refused: 'images' }
    expect(
      cleanMessage({ text: 'x', images: [{ ...png, mediaType: 'image/heic' }] })
    ).toEqual(refused)
    expect(
      cleanMessage({ text: 'x', images: Array(IMAGES_MAX + 1).fill(png) })
    ).toEqual(refused)
    const large = 'A'.repeat(Math.ceil((IMAGE_BYTES + 3) / 3) * 4)
    expect(imageBytes(large)).toBeGreaterThan(IMAGE_BYTES)
    expect(
      cleanMessage({ text: 'x', images: [{ ...png, data: large }] })
    ).toEqual(refused)
    expect(
      cleanMessage({ text: 'x', images: [{ ...png, data: '<svg/>' }] })
    ).toEqual(refused)
    expect(cleanMessage({ text: 'x', images: 'shot.png' })).toEqual(refused)
  })

  it('counts an image’s bytes from its base64', () => {
    expect(imageBytes('QUJD')).toBe(3)
    expect(imageBytes('QUI=')).toBe(2)
    expect(imageBytes('QQ==')).toBe(1)
  })

  it('puts the images before what you typed, as Claude reads them best', () => {
    expect(messageContent('Make it 5', [])).toBe('Make it 5')
    expect(messageContent('Why?', [png])).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: PNG },
      },
      { type: 'text', text: 'Why?' },
    ])
    expect(messageContent('', [png])).toHaveLength(1)
  })

  it('gives an image of a logged message as a data: URL', () => {
    const content = messageContent('Why?', [
      png,
      { ...png, mediaType: 'image/jpeg' },
    ])
    expect(imageOfContent(content, 0)).toBe(`data:image/png;base64,${PNG}`)
    expect(imageOfContent(content, 1)).toBe(`data:image/jpeg;base64,${PNG}`)
    expect(imageOfContent(content, 2)).toBeUndefined()
    expect(imageOfContent('Why?', 0)).toBeUndefined()
    // Only base64 of a kind it knows, never a link
    expect(
      imageOfContent(
        [{ type: 'image', source: { type: 'url', url: 'https://x/y.png' } }],
        0
      )
    ).toBeUndefined()
  })
})
