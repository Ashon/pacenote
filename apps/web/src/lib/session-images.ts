import {
  IMAGE_BYTES,
  IMAGE_EDGE,
  IMAGE_TYPES,
  type ImageType,
  type SessionImage,
} from '@src/sessions/images'

/**
 * Images you attach to a message for a session, made small enough on the
 * way: at most IMAGE_EDGE on their longest side (Claude looks at no more) and
 * IMAGE_BYTES each. One that fits goes as it is, so a GIF keeps moving; a
 * larger one is drawn smaller, as PNG while that fits (sharp text in a
 * screenshot), else as JPEG, less and less fine until it does.
 */

/** An image attached in the composer, ready to send */
export interface Attached extends SessionImage {
  /** Its key in the composer */
  id: string
  /** What it was called, for its label */
  name: string
}

export type AttachRefusal = 'kind' | 'size'

const isImageType = (type: string): type is ImageType =>
  IMAGE_TYPES.includes(type as ImageType)

/** How fine each JPEG try is, finest first */
const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5]

const base64Of = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'))
    reader.readAsDataURL(blob)
  })

const blobOf = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/** Draws it at a scale; JPEG has no see-through, so white under it */
function draw(bitmap: ImageBitmap, scale: number, opaque: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no canvas')
  if (opaque) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * A file or pasted image as it goes with a message; why not, for one Claude
 * does not take or that stays too large
 */
export async function attachImage(
  file: Blob,
  name = ''
): Promise<Attached | { refused: AttachRefusal }> {
  if (!isImageType(file.type)) return { refused: 'kind' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { refused: 'kind' }
  }
  const id = crypto.randomUUID()
  try {
    const edge = Math.max(bitmap.width, bitmap.height)
    if (edge <= IMAGE_EDGE && file.size <= IMAGE_BYTES)
      return { id, name, mediaType: file.type, data: await base64Of(file) }
    let scale = Math.min(1, IMAGE_EDGE / edge)
    // Smaller and smaller until it fits; a few times at most
    for (let tries = 0; tries < 4; tries += 1, scale *= 0.75) {
      const png = await blobOf(draw(bitmap, scale, false), 'image/png')
      if (png && png.size <= IMAGE_BYTES)
        return { id, name, mediaType: 'image/png', data: await base64Of(png) }
      const canvas = draw(bitmap, scale, true)
      for (const quality of QUALITIES) {
        const jpeg = await blobOf(canvas, 'image/jpeg', quality)
        if (jpeg && jpeg.size <= IMAGE_BYTES)
          return {
            id,
            name,
            mediaType: 'image/jpeg',
            data: await base64Of(jpeg),
          }
      }
    }
    return { refused: 'size' }
  } finally {
    bitmap.close()
  }
}

/** The images among what was pasted or dropped */
export const imageFiles = (files: FileList | readonly File[] | null) =>
  [...(files ?? [])].filter((file) => file.type.startsWith('image/'))

/** An attached image for an <img> */
export const imageUrl = (image: SessionImage) =>
  `data:${image.mediaType};base64,${image.data}`
