import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { systemPrompt } from '../src/mention/prompt.js'
import type { MessengerProfile } from '../src/messengers/types.js'
import {
  composeAnswer,
  extractDiagrams,
  MAX_DIAGRAMS,
  renderArgs,
} from '../src/render/diagrams.js'

const answer = [
  'The structure is as follows:',
  '```mermaid',
  'flowchart LR',
  '  a --> b',
  '```',
  'Example command:',
  '```bash',
  'kubectl get pods',
  '```',
  '```graphviz',
  'digraph { a -> b }',
  '```',
  '```vega-lite',
  '{"mark":"bar","data":{"values":[]}}',
  '```',
].join('\n')

describe('extractDiagrams', () => {
  it('picks only diagram language blocks, in order, and skips other code blocks', () => {
    const blocks = extractDiagrams(answer)
    expect(blocks.map((b) => b.format)).toEqual(['mermaid', 'dot', 'vega-lite'])
    expect(blocks[0]!.source).toBe('flowchart LR\n  a --> b')
    expect(blocks[0]!.raw.startsWith('```mermaid')).toBe(true)
  })

  it('respects the maximum count and skips empty blocks', () => {
    const many = Array.from(
      { length: 5 },
      (_, i) => `\`\`\`dot\ndigraph { n${i} }\n\`\`\``
    ).join('\n')
    expect(extractDiagrams(many)).toHaveLength(MAX_DIAGRAMS)
    expect(extractDiagrams('```mermaid\n   \n```')).toEqual([])
  })
})

describe('composeAnswer', () => {
  it('replaces rendered blocks with (Figure N) and keeps the source and a note for failed ones', () => {
    const [mermaid, dot, vega] = extractDiagrams(answer)
    const text = composeAnswer(answer, [
      { block: mermaid!, figure: 1 },
      { block: dot! },
      { block: vega!, figure: 2 },
    ])
    expect(text).toContain('_(Figure 1: image below)_')
    expect(text).toContain('_(Figure 2: image below)_')
    expect(text).not.toContain('flowchart LR')
    expect(text).toContain(
      "```graphviz\ndigraph { a -> b }\n```\n_(Couldn't render this diagram, so the source is shown)_"
    )
    expect(text).toContain('```bash\nkubectl get pods\n```')
  })
})

const vm = {
  bin: '/bin/pacenote-vm',
  root: '/home/me/.pacenote/vm',
  image: 'renderer',
}

describe('renderArgs', () => {
  it('renders in a VM of its own with no way out, seeing only its folder', () => {
    const args = renderArgs(
      vm,
      '/home/me/agent/data/x/renders',
      'mermaid',
      'figure-1'
    )
    expect(args.slice(0, 5)).toEqual([
      'run',
      '--root',
      '/home/me/.pacenote/vm',
      '--image',
      'renderer',
    ])
    expect(args).not.toContain('--egress')
    expect(args).not.toContain('--relay')
    expect(args.filter((arg) => arg === '--mount')).toHaveLength(1)
    expect(args).toContain('/home/me/agent/data/x/renders:/io:rw')
    // The image's entrypoint is render: the format comes first.
    expect(args.slice(-4)).toEqual([
      '--',
      'mermaid',
      '/io/figure-1.mmd',
      '/io/figure-1.png',
    ])
  })
})

const slack: MessengerProfile = {
  name: 'Slack',
  venues: 'public channels',
  markup: 'Slack mrkdwn',
  public: true,
}

describe('systemPrompt', () => {
  it('adds diagram instructions only when a renderer is available', () => {
    expect(systemPrompt(slack)).not.toContain('```mermaid')
    expect(systemPrompt(slack, { diagrams: true })).toContain('```mermaid')
  })
})

describe("the renderer's theme", () => {
  const renderer = path.resolve(import.meta.dirname, '../sandbox/vm/renderer')
  const read = (file: string) => readFileSync(path.join(renderer, file), 'utf8')

  it('keeps a mermaid block from changing the theme', () => {
    const config = JSON.parse(read('mermaid.json')) as {
      theme: string
      secure: string[]
    }
    expect(config.theme).toBe('base')
    expect(config.secure).toEqual(
      expect.arrayContaining([
        'secure',
        'securityLevel',
        'theme',
        'themeVariables',
        'themeCSS',
        'fontFamily',
      ])
    )
  })

  it('gives svg the colors the other formats are drawn in', () => {
    const colors =
      systemPrompt(slack, { diagrams: true }).match(/#[0-9a-f]{6}/g) ?? []
    expect(colors.length).toBeGreaterThan(0)
    const theme = read('mermaid.json') + read('render.sh')
    for (const color of colors) expect(theme).toContain(color)
  })

  it('draws as the app looks', () => {
    const css = readFileSync(
      path.resolve(import.meta.dirname, '../apps/web/src/index.css'),
      'utf8'
    )
    const vegaLite = JSON.parse(read('vega-lite.json')) as {
      range: { category: string[] }
      bar: { color: { stops: { color: string }[] } }
    }
    // Shapes are the app's choice cards: white on a border hairline.
    expect(css).toContain('--border: oklch(0.91 0.016 168)')
    expect(read('mermaid.json')).toContain('"primaryBorderColor": "#d8e5df"')
    expect(read('render.sh')).toContain("-Ncolor='#d8e5df'")
    // Bars are filled with the logo's gradient, and series lead with the
    // logo's emerald and the primary color.
    for (const { color } of vegaLite.bar.color.stops)
      expect(css).toContain(color)
    expect(css).toContain('--chart-1: #0cb67e')
    expect(css).toContain('--primary: #007c5c')
    expect(vegaLite.range.category.slice(0, 2)).toEqual(['#0cb67e', '#007c5c'])
  })

  it('has the classes the model is told about, in mermaid and dot', () => {
    const prompt = systemPrompt(slack, { diagrams: true })
    const mermaid = (JSON.parse(read('mermaid.json')) as { themeCSS: string })
      .themeCSS
    const dot = read('dot.gvpr')
    for (const name of ['accent', 'primary', 'warn', 'error', 'muted']) {
      expect(prompt).toContain(name)
      expect(mermaid).toContain(`.node.${name} > rect`)
      expect(dot).toContain(`class == "*${name}*"`)
    }
  })
})

describe('generated images', () => {
  it('collects images from the output directory in creation order', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } =
      await import('node:fs')
    const { tmpdir } = await import('node:os')
    const path = await import('node:path')
    const { collectGeneratedImages } =
      await import('../src/mention/generated.js')
    const dir = mkdtempSync(path.join(tmpdir(), 'gen-'))
    mkdirSync(path.join(dir, 'thread-1'))
    writeFileSync(path.join(dir, 'thread-1', 'b.png'), 'B')
    writeFileSync(path.join(dir, 'thread-1', 'a.png'), 'A')
    writeFileSync(path.join(dir, 'thread-1', 'note.txt'), 'x')
    writeFileSync(path.join(dir, 'thread-1', 'empty.png'), '')
    utimesSync(
      path.join(dir, 'thread-1', 'b.png'),
      new Date(1000),
      new Date(1000)
    )
    utimesSync(
      path.join(dir, 'thread-1', 'a.png'),
      new Date(2000),
      new Date(2000)
    )
    const images = await collectGeneratedImages(dir)
    expect(images.map((b) => b.toString())).toEqual(['B', 'A'])
    expect(await collectGeneratedImages(path.join(dir, 'missing'))).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('adds image generation instructions only for codex', () => {
    expect(
      systemPrompt(slack, { diagrams: true, imageGeneration: true })
    ).toContain('image generation tool')
    expect(systemPrompt(slack, { diagrams: true })).not.toContain(
      'image generation tool'
    )
  })
})

describe('resizeArgs', () => {
  it('runs resize with the same isolation as rendering', async () => {
    const { resizeArgs } = await import('../src/render/diagrams.js')
    const args = resizeArgs(vm, '/h/x/resized', 'image-1', 512)
    expect(args).not.toContain('--egress')
    expect(args).toContain('/h/x/resized:/io:rw')
    expect(args.slice(-5)).toEqual([
      '--',
      'resize',
      '/io/image-1.src',
      '/io/image-1.png',
      '512',
    ])
  })
})
