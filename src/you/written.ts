/**
 * A recap's write-up (Write it up), in its parts: a heading for each area and
 * what was done in it as short bullets, what is still open last. One written
 * before is sentences, kept as they are. Pure, so it is tested without the AI.
 */

export type WrittenBlock =
  /** An area's name, or the still open block's */
  | { kind: 'heading'; text: string }
  /** What was done, a few words each */
  | { kind: 'bullets'; items: string[] }
  /** Sentences: a write-up from before, or a line outside the bullets */
  | { kind: 'text'; text: string }

const HEADING = /^#{1,6}\s+(.+?)\s*#*$/
const BULLET = /^[-*•+]\s+(.+)$/
/** A numbered one, as a bullet */
const NUMBERED = /^\d+[.)]\s+(.+)$/
/** A line this short over bullets may be their heading */
const HEADING_CHARS = 60

/**
 * What the AI wrote, kept as Pacenote keeps it: headings as "## ", bullets
 * as "- ", no bold
 */
export const writtenOf = (answer: string): string =>
  lay(writtenBlocks(answer.replace(/\*\*/g, '')), (words) => `## ${words}`, '-')

/** A write-up in its parts, in order */
export function writtenBlocks(text: string): WrittenBlock[] {
  const blocks: WrittenBlock[] = []
  const last = () => blocks.at(-1)
  /** A paragraph's lines, joined once it ends */
  let lines: string[] = []
  const endParagraph = () => {
    if (lines.length) blocks.push({ kind: 'text', text: lines.join(' ') })
    lines = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      endParagraph()
      continue
    }
    const heading = HEADING.exec(line)
    const bullet = BULLET.exec(line) ?? NUMBERED.exec(line)
    const before = last()
    if (heading) {
      endParagraph()
      blocks.push({ kind: 'heading', text: heading[1]! })
    } else if (bullet) {
      endParagraph()
      if (before?.kind === 'bullets') before.items.push(bullet[1]!.trim())
      else blocks.push({ kind: 'bullets', items: [bullet[1]!.trim()] })
    } else if (before?.kind === 'bullets' && !lines.length && /^\s/.test(raw)) {
      // A bullet's words go on, indented under it
      before.items[before.items.length - 1] += ` ${line}`
    } else lines.push(line)
  }
  endParagraph()
  // A short line of its own over bullets is their heading: an area's name
  // written bold or with a colon rather than as a heading
  return blocks.map((block, index) =>
    block.kind === 'text' &&
    blocks[index + 1]?.kind === 'bullets' &&
    block.text.length <= HEADING_CHARS &&
    !/[.!?。]$/.test(block.text)
      ? { kind: 'heading', text: block.text.replace(/\s*[:：]$/, '') }
      : block
  )
}

/** A write-up to paste: Markdown, or Slack's own marks */
export const writtenAs = (
  text: string,
  format: 'markdown' | 'slack'
): string =>
  format === 'slack'
    ? lay(writtenBlocks(text), (words) => `*${words}*`, '•')
    : lay(writtenBlocks(text), (words) => `**${words}**`, '-')

/** Its parts as lines: a block's bullets right under its heading */
function lay(
  blocks: readonly WrittenBlock[],
  heading: (words: string) => string,
  bullet: string
): string {
  const out: string[] = []
  for (const block of blocks)
    if (block.kind === 'heading') out.push('', heading(block.text))
    else if (block.kind === 'bullets')
      out.push(...block.items.map((item) => `${bullet} ${item}`))
    else out.push('', block.text)
  return out.join('\n').trim()
}
