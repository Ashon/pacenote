/**
 * Images you send with a message to a Claude Code session Pacenote runs:
 * pasted, dropped or picked in its composer, made small enough on the way
 * (apps/web/src/lib/session-images.ts) and checked again here before they go
 * to Claude Code as image blocks. They stay in Claude Code's own log, as
 * images pasted into Claude Code do; Pacenote keeps none of them.
 */

/** The kinds Claude takes */
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const
export type ImageType = (typeof IMAGE_TYPES)[number]

/** An image as it goes with a message: its kind and its bytes in base64 */
export interface SessionImage {
  mediaType: ImageType
  data: string
}

/** What you send: what you typed, and the images with it */
export interface SessionMessage {
  text: string
  images?: SessionImage[]
}

/**
 * Each image's most, in bytes: 1 MB is enough for what Claude sees, and keeps
 * the session's log small (it holds each image in base64)
 */
export const IMAGE_BYTES = 1024 * 1024
/**
 * The longest side Claude looks at; a larger image is made smaller first, so
 * more would only cost time
 */
export const IMAGE_EDGE = 1568
/** The most images in one message */
export const IMAGES_MAX = 10

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** An image's size in bytes, from its base64 */
export const imageBytes = (data: string) =>
  Math.floor((data.length * 3) / 4) - (data.match(/=+$/)?.[0].length ?? 0)

const isImageType = (value: unknown): value is ImageType =>
  IMAGE_TYPES.includes(value as ImageType)

/**
 * What a composer sent, checked: what you typed, and images of the kinds
 * Claude takes, each at most IMAGE_BYTES, at most IMAGES_MAX. A string is
 * what you typed alone. Why it is refused, for anything else.
 */
export function cleanMessage(
  value: unknown
): { text: string; images: SessionImage[] } | { refused: 'images' } {
  if (typeof value === 'string') return { text: value, images: [] }
  const message = (value ?? {}) as Partial<
    Record<keyof SessionMessage, unknown>
  >
  const text = typeof message.text === 'string' ? message.text : ''
  if (message.images === undefined) return { text, images: [] }
  if (!Array.isArray(message.images) || message.images.length > IMAGES_MAX)
    return { refused: 'images' }
  const images: SessionImage[] = []
  for (const image of message.images as Partial<SessionImage>[]) {
    const data = image?.data
    if (
      !isImageType(image?.mediaType) ||
      typeof data !== 'string' ||
      !data ||
      imageBytes(data) > IMAGE_BYTES ||
      !BASE64.test(data)
    )
      return { refused: 'images' }
    images.push({ mediaType: image.mediaType, data })
  }
  return { text, images }
}

/**
 * A message's content for Claude Code: what you typed alone, or the images
 * first and then what you typed (Claude reads an image best before the words
 * about it)
 */
export function messageContent(text: string, images: readonly SessionImage[]) {
  if (!images.length) return text
  return [
    ...images.map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    })),
    ...(text ? [{ type: 'text', text }] : []),
  ]
}

/**
 * An image of a message in a Claude Code log, as a data: URL for an <img>;
 * undefined when it has no such image
 */
export function imageOfContent(
  content: unknown,
  index: number
): string | undefined {
  if (!Array.isArray(content)) return undefined
  const image = (content as Record<string, unknown>[]).filter(
    (block) => block?.type === 'image'
  )[index]
  const source = image?.source as Record<string, unknown> | undefined
  if (
    source?.type !== 'base64' ||
    !isImageType(source.media_type) ||
    typeof source.data !== 'string' ||
    !BASE64.test(source.data)
  )
    return undefined
  return `data:${source.media_type};base64,${source.data}`
}
