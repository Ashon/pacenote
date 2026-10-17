import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * pacenote.dev is four hand-written pages that share a header, a footer and
 * the claims of "What Pace never does". This holds them together: the same
 * nav everywhere, every link inside the site landing on a page, a picture or
 * an anchor that is there, and the home page's claims the same as the
 * privacy page's headings.
 */
const SITE = path.resolve(__dirname, '../site')
const PAGES = ['', 'how-it-works/', 'privacy/', 'install/']

/** Where the Pages workflow copies each picture in media/ from */
const MEDIA: Record<string, string> = {
  'pacenote-mark.svg': 'assets',
}

const read = (page: string) =>
  readFileSync(path.join(SITE, page, 'index.html'), 'utf8')

/** A site path for a link on a page: '' for the home page, 'privacy/', ... */
const resolve = (page: string, href: string) =>
  path.posix.normalize(path.posix.join('/', page, href)).slice(1)

const between = (html: string, open: RegExp, close: string) => {
  const start = html.search(open)
  expect(start, String(open)).toBeGreaterThanOrEqual(0)
  return html.slice(start, html.indexOf(close, start))
}

/** The links of a piece of a page, as site paths or full URLs */
const links = (page: string, html: string) =>
  [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) =>
    /^https?:/.test(href!) ? href! : resolve(page, href!)
  )

const ids = (html: string) =>
  new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!))

describe('pacenote.dev', () => {
  it('has the same nav and footer on every page, marking the one you are on', () => {
    const navs = PAGES.map((page) => {
      const nav = between(read(page), /<nav aria-label="Pages">/, '</nav>')
      const current = [...nav.matchAll(/href="([^"]+)" aria-current="page"/g)]
      expect(current.map(([, href]) => resolve(page, href!))).toEqual(
        page ? [page] : []
      )
      return links(page, nav)
    })
    const footers = PAGES.map((page) =>
      links(page, between(read(page), /<footer/, '</footer>'))
    )
    for (const nav of navs) expect(nav).toEqual(navs[0])
    for (const footer of footers) expect(footer).toEqual(footers[0])
  })

  it('links only to pages, pictures and anchors that are there', () => {
    for (const page of PAGES) {
      const html = read(page)
      const srcs = [...html.matchAll(/(?:src|srcset|href)="([^"]+)"/g)].map(
        ([, ref]) => ref!
      )
      for (const ref of srcs) {
        if (/^(https?:|mailto:)/.test(ref)) continue
        const [file, anchor] = ref.split('#')
        const target = file ? resolve(page, file) : page
        if (target.startsWith('media/')) {
          const name = target.slice('media/'.length)
          const from = MEDIA[name] ?? 'docs/images'
          expect(existsSync(path.resolve(SITE, '..', from, name)), ref).toBe(
            true
          )
          continue
        }
        const onDisk = path.join(SITE, target)
        const html = target === '' || target.endsWith('/')
        expect(
          existsSync(html ? path.join(onDisk, 'index.html') : onDisk),
          `${page || 'home'}: ${ref}`
        ).toBe(true)
        if (anchor)
          expect(ids(read(target)).has(anchor), `${page}: ${ref}`).toBe(true)
      }
    }
  })

  it('names the same limits on the home page as on the privacy page', () => {
    const home = between(read(''), /<ul class="claims">/, '</ul>')
    const claims = [...home.matchAll(/<li>([^<]+)<\/li>/g)].map(([, c]) => c)
    const headings = [
      ...between(
        read('privacy/'),
        /aria-label="The limits"/,
        '</section>'
      ).matchAll(/<h2>([^<]+)<\/h2>/g),
    ].map(([, h]) => h)
    expect(claims.length).toBe(7)
    expect(headings).toEqual(claims)
  })
})
