import path from 'node:path'
import type { MadeThing } from './types.js'

/**
 * What a session made, read from its log (A1, A2): what Claude Code put on
 * claude.ai with its Artifact tool (a page, or one made from a type) or with
 * the Claude Docs connector (a doc), and the files in its folder a Codex
 * answer linked. Links and titles come from the log alone: Pacenote never
 * asks claude.ai. Pure, so it is tested without Claude Code; whether a file
 * is there comes from the caller.
 */

/** A claude.ai link to an artifact or a doc */
const CLAUDE_AI = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+$/
/** The connector's calls that make a doc; its reads and edits look alike */
const DOCS_CALL = /^mcp__.+__(?:create|batch)$/
/** A doc made: its result says created, and where it opens */
const DOC_MADE =
  /"created":\{[^}]*\}[\s\S]*?"artifactUrl":"(https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+)"/
/** Links in an answer: [name](target) */
const LINK = /\[([^\]\n]{1,200})\]\(<?([^)\s>]{1,1000})>?\)/g
const TITLE_CHARS = 200

/** The files an answer links that count as made: pages, images, PDFs, notes */
const FILES: Record<string, NonNullable<MadeThing['file']>> = {
  '.html': 'html',
  '.htm': 'html',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.pdf': 'pdf',
  '.md': 'markdown',
}

type Value = Record<string, unknown>
const object = (value: unknown): Value | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Value)
    : undefined
const string = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined
const title = (value: unknown) => string(value)?.slice(0, TITLE_CHARS)

/** A tool result's text, as Claude Code keeps it: a string or text blocks */
const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => string(object(block)?.text) ?? '').join('\n')
      : ''

/** Whether a file the log names is in the session's folder */
const inside = (file: string, cwd: string) => {
  const relative = path.relative(cwd, file)
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export class MadeReader {
  private readonly things = new Map<string, MadeThing>()
  /** Its Artifact and connector calls by their id, until they come back */
  private readonly asked = new Map<string, { name: string; input: Value }>()
  /** The names of the types its results told, by the type's link */
  private readonly types = new Map<string, string>()
  /** The type each was made from, by its key */
  private readonly typeOf = new Map<string, string>()

  constructor(
    /** The session's folder, for the files its answers link */
    private readonly cwd?: string,
    /** Whether a file is there: the caller's, so this stays pure */
    private readonly exists: (file: string) => boolean = () => true
  ) {}

  /** A step it took: one that may put something on claude.ai, kept */
  use(name: string, input: unknown, id?: string): void {
    if (id && (name === 'Artifact' || DOCS_CALL.test(name)))
      this.asked.set(id, { name, input: object(input) ?? {} })
  }

  /**
   * How a step came back: the key of what it made, for the step's card; the
   * name of a type it told, for the cards of what was made from it
   */
  result(
    id: string,
    result: unknown,
    content: unknown,
    failed: boolean,
    at?: string
  ): string | undefined {
    const call = this.asked.get(id)
    if (!call) return undefined
    // A result can be logged twice: it counts once
    this.asked.delete(id)
    if (failed) return undefined
    return call.name === 'Artifact'
      ? this.published(call.input, object(result), at)
      : this.doc(call.input, textOf(content), at)
  }

  /** An answer: the files in its folder it links, for its cards */
  said(text: string, at?: string): string[] {
    if (!this.cwd) return []
    const keys: string[] = []
    for (const [, name, target] of text.matchAll(LINK)) {
      let file = target!.replace(/^file:\/\//, '')
      try {
        file = decodeURI(file)
      } catch {
        continue
      }
      // A place in it (a line) still names the file
      file = file.replace(/(?::\d+)+$|#L\d+.*$/, '')
      if (/^[a-z][\w+.-]*:/i.test(file)) continue
      file = path.resolve(this.cwd, file)
      const kind = FILES[path.extname(file).toLowerCase()]
      if (!kind || !inside(file, this.cwd) || !this.exists(file)) continue
      const was = this.things.get(file)
      this.things.set(file, {
        key: file,
        kind: 'file',
        title: title(path.basename(file)) ?? title(name) ?? '',
        path: file,
        file: kind,
        times: (was?.times ?? 0) + 1,
        ...(at ? { at } : {}),
      })
      if (!keys.includes(file)) keys.push(file)
    }
    return keys
  }

  /** What it made, in the order it first made them */
  made(): MadeThing[] {
    return [...this.things.values()].map((thing) => {
      const type = this.typeOf.get(thing.key)
      const typeName = type && this.types.get(type)
      return typeName ? { ...thing, typeName } : thing
    })
  }

  /**
   * An Artifact call: a publish of a page, or of one made from a type (made
   * new, or its files); not a read, a list, a quickstart or an asset
   */
  private published(input: Value, result: Value | undefined, at?: string) {
    if (!result) return undefined
    this.told(result)
    const action = string(input.action) ?? 'publish'
    if (action !== 'publish' || input.asset === true) return undefined
    const url = string(result.url)
    if (!url || !CLAUDE_AI.test(url)) return undefined
    const was = this.things.get(url)
    const type =
      string(object(result.type)?.url) ??
      string(input.type_url) ??
      this.typeOf.get(url)
    if (type) this.typeOf.set(url, type)
    const version = result.seq
    const audience = string(result.audience)
    const file = string(input.file_path)
    this.things.set(url, {
      key: url,
      kind: type || result.created_from_type === true ? 'typed' : 'page',
      title:
        title(result.title) ??
        title(input.title) ??
        was?.title ??
        (file ? path.basename(file) : ''),
      url,
      ...(typeof version === 'number'
        ? { version }
        : was?.version !== undefined
          ? { version: was.version }
          : {}),
      times: (was?.times ?? 0) + 1,
      ...(audience
        ? { onlyYou: audience === 'owner' }
        : was?.onlyYou !== undefined
          ? { onlyYou: was.onlyYou }
          : {}),
      ...(at ? { at } : {}),
    })
    return url
  }

  /** A connector call that made a doc */
  private doc(input: Value, text: string, at?: string) {
    const url = DOC_MADE.exec(text)?.[1]
    if (!url) return undefined
    const was = this.things.get(url)
    const made = object(object(input.container)?.create)
    this.things.set(url, {
      key: url,
      kind: 'doc',
      title: title(made?.name) ?? title(input.name) ?? was?.title ?? '',
      url,
      times: (was?.times ?? 0) + 1,
      ...(at ? { at } : {}),
    })
    return url
  }

  /** The type names a result tells: a read of one made from a type says it */
  private told(result: Value) {
    for (const value of [result, ...Object.values(result)]) {
      const type = object(object(value)?.type)
      const url = string(type?.url)
      const name = title(type?.title)
      if (url && name) this.types.set(url, name)
    }
  }
}
