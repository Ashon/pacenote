import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runProcess } from '../sandbox/process.js'
import { vmProblems, vmRunArgs, vmStatus } from '../sandbox/vm.js'

/**
 * Renders the diagram/chart code blocks in an answer to PNG.
 * Rendering runs in a VM of its own with no way out (the built-in sandbox's
 * renderer image, sandbox/vm/renderer).
 */
export type DiagramFormat = 'mermaid' | 'dot' | 'vega-lite' | 'svg'

const LANGUAGES: Record<string, DiagramFormat> = {
  mermaid: 'mermaid',
  dot: 'dot',
  graphviz: 'dot',
  'vega-lite': 'vega-lite',
  vegalite: 'vega-lite',
  svg: 'svg',
}
const EXTENSION: Record<DiagramFormat, string> = {
  mermaid: 'mmd',
  dot: 'dot',
  'vega-lite': 'vl.json',
  svg: 'svg',
}

export const MAX_DIAGRAMS = 3
const MAX_SOURCE_CHARS = 20_000
const MAX_PNG_BYTES = 10 * 1024 * 1024

export interface DiagramBlock {
  format: DiagramFormat
  source: string
  /** Raw code block text in the answer (including the ```) */
  raw: string
}

/**
 * Finds diagram code blocks such as ```mermaid in order. Blocks in other
 * languages are left alone.
 */
export function extractDiagrams(markdown: string): DiagramBlock[] {
  const blocks: DiagramBlock[] = []
  for (const match of markdown.matchAll(
    /^```([A-Za-z-]+)[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm
  )) {
    const format = LANGUAGES[match[1]!.toLowerCase()]
    const source = match[2]!
    if (!format || !source.trim() || source.length > MAX_SOURCE_CHARS) continue
    blocks.push({ format, source, raw: match[0] })
    if (blocks.length >= MAX_DIAGRAMS) break
  }
  return blocks
}

/**
 * Replaces rendered blocks with a (Figure N) marker and keeps the source of
 * blocks that could not be rendered.
 */
export function composeAnswer(
  markdown: string,
  results: { block: DiagramBlock; figure?: number }[]
): string {
  let text = markdown
  for (const { block, figure } of results) {
    text = text.replace(
      block.raw,
      figure !== undefined
        ? `_(Figure ${figure}: image below)_`
        : `${block.raw}\n_(Couldn't render this diagram, so the source is shown)_`
    )
  }
  return text
}

/** Where the renderer runs: its VM's helper, folder and image */
export interface RendererVm {
  /** pacenote-vm */
  bin: string
  /** pacenote-vm's folder: kernel, init filesystem, images */
  root: string
  /** The renderer's image (VM_RENDERER_IMAGE) */
  image: string
}

/** chromium (mermaid) needs room; the rest is small. */
const RENDER_MEMORY_MIB = 1536

/**
 * pacenote-vm arguments for one render: a VM with no way out, a read-only image
 * and an empty /tmp, which sees only the folder with this block (/io). The
 * image's entrypoint is render, so the format comes first: render mermaid IN
 * OUT.
 */
export function renderArgs(
  vm: RendererVm,
  dir: string,
  format: DiagramFormat,
  name: string
): string[] {
  return vmArgs(vm, dir, format, [
    `/io/${name}.${EXTENSION[format]}`,
    `/io/${name}.png`,
  ])
}

/** pacenote-vm arguments for shrinking an image, isolated as a render is */
export function resizeArgs(
  vm: RendererVm,
  dir: string,
  name: string,
  maxPx: number
): string[] {
  return vmArgs(vm, dir, 'resize', [
    `/io/${name}.src`,
    `/io/${name}.png`,
    String(maxPx),
  ])
}

function vmArgs(
  vm: RendererVm,
  dir: string,
  command: string,
  args: string[]
): string[] {
  return vmRunArgs(
    { ...vm, memoryMiB: RENDER_MEMORY_MIB, cpus: 2 },
    {
      command,
      args,
      mounts: [{ host: dir, at: '/io', writable: true }],
    }
  )
}

export interface DiagramRendererOptions extends RendererVm {
  timeoutMs: number
}

export class DiagramRenderer {
  constructor(private readonly options: DiagramRendererOptions) {}

  /** Renders one block and returns the PNG buffer. */
  async render(
    block: DiagramBlock,
    dir: string,
    name: string
  ): Promise<Buffer> {
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, `${name}.${EXTENSION[block.format]}`),
      block.source
    )
    await this.run(renderArgs(this.options, dir, block.format, name))
    const png = await readFile(path.join(dir, `${name}.png`))
    if (png.length === 0 || png.length > MAX_PNG_BYTES) {
      throw new Error(`Invalid PNG size (${png.length} bytes)`)
    }
    return png
  }

  /**
   * Returns a PNG scaled down with the aspect ratio kept when the long edge
   * exceeds maxPx.
   */
  async resize(
    image: Buffer,
    dir: string,
    name: string,
    maxPx: number
  ): Promise<Buffer> {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, `${name}.src`), image)
    await this.run(resizeArgs(this.options, dir, name, maxPx))
    const png = await readFile(path.join(dir, `${name}.png`))
    if (png.length === 0) throw new Error('The resize result is empty.')
    return png
  }

  /** What keeps it from rendering: this Mac, or the built-in sandbox's parts */
  async verify(): Promise<string[]> {
    const status = await vmStatus(this.options)
    const problems = vmProblems(status, 'the diagram renderer image')
    return problems
  }

  private async run(args: string[]): Promise<void> {
    await runProcess(this.options.bin, args, {
      cwd: process.cwd(),
      input: '',
      timeoutMs: this.options.timeoutMs,
    })
  }
}
