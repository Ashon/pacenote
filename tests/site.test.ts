import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * pacenote.dev is four hand-written pages that share a header, a footer and
 * the claims of "What Pace never does", in English and again in Korean under
 * ko/. This holds them together: the same nav on every page of a language,
 * every link inside the site landing on a page, a picture or an anchor that
 * is there, the home page's claims the same as the privacy page's headings,
 * and each page naming its counterpart in the other language.
 */
const SITE = path.resolve(__dirname, '../site')
const ORIGIN = 'https://pacenote.dev/'
const PAGES = ['', 'how-it-works/', 'privacy/', 'install/']
/** Where each language's pages are, and what the page says it is in */
const LANGUAGES = [
  { lang: 'en', dir: '', locale: 'en_US' },
  { lang: 'ko', dir: 'ko/', locale: 'ko_KR' },
]
/** Every page, as a site path: '' and 'ko/' for the home pages */
const ALL = LANGUAGES.flatMap(({ dir }) => PAGES.map((page) => dir + page))

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

/** The header, up to the end of its nav */
const header = (page: string) =>
  between(read(page), /<header class="top">/, '</nav>')

/** The link to the same page in the other language */
const LANGUAGE_LINK = /<a class="lang" [^>]*>[^<]*<\/a>/

/** The home page's claims, and the privacy page's headings for them */
const claims = (dir: string) => {
  const home = between(read(dir), /<ul class="claims">/, '</ul>')
  const privacy = between(
    read(`${dir}privacy/`),
    /<div class="claim">/,
    '</section>'
  )
  return {
    home: [...home.matchAll(/<li>([^<]+)<\/li>/g)].map(([, c]) => c),
    privacy: [...privacy.matchAll(/<h2>([^<]+)<\/h2>/g)].map(([, h]) => h),
  }
}

describe('pacenote.dev', () => {
  it.each(LANGUAGES)(
    'has the same nav and footer on every $lang page, marking the one you are on',
    ({ dir }) => {
      const navs = PAGES.map((page) => {
        const at = dir + page
        const nav = header(at).replace(LANGUAGE_LINK, '')
        const current = [...nav.matchAll(/href="([^"]+)" aria-current="page"/g)]
        expect(current.map(([, href]) => resolve(at, href!))).toEqual(
          page ? [at] : []
        )
        return links(at, nav)
      })
      const footers = PAGES.map((page) =>
        links(dir + page, between(read(dir + page), /<footer/, '</footer>'))
      )
      for (const nav of navs) expect(nav).toEqual(navs[0])
      for (const footer of footers) expect(footer).toEqual(footers[0])
    }
  )

  it("names the copyright holder NOTICE names, on every page's footer", () => {
    const notice = readFileSync(path.resolve(SITE, '../NOTICE'), 'utf8')
    const [, year, holder] = notice.match(/^Copyright (\d{4}) (.+)$/m)!
    for (const page of ALL) {
      const footer = between(read(page), /<footer/, '</footer>')
      expect(footer, page || 'home').toContain(`© ${year} ${holder}.`)
    }
  })

  it('links only to pages, pictures and anchors that are there', () => {
    for (const page of ALL) {
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
        if (!anchor) continue
        // An icon names a symbol in the sprite; a page, an element on it
        const named = target.endsWith('.svg')
          ? ids(readFileSync(onDisk, 'utf8'))
          : ids(read(target))
        expect(named.has(anchor), `${page || 'home'}: ${ref}`).toBe(true)
      }
    }
  })

  it.each(LANGUAGES)(
    'names the same limits on the $lang home page as on its privacy page',
    ({ dir }) => {
      const { home, privacy } = claims(dir)
      expect(home.length).toBe(7)
      expect(privacy).toEqual(home)
    }
  )

  it.each(PAGES.map((page) => ({ page: page || 'home', path: page })))(
    'has $page in both languages, each naming and linking to the other',
    ({ path: page }) => {
      for (const { lang, dir, locale } of LANGUAGES) {
        const at = dir + page
        const html = read(at)
        const head = between(html, /<head>/, '</head>')
        expect(html, at).toContain(`<html lang="${lang}">`)
        expect(head).toContain(`<link rel="canonical" href="${ORIGIN}${at}">`)
        expect(head).toContain(
          `<meta property="og:url" content="${ORIGIN}${at}">`
        )
        expect(head).toContain(
          `<meta property="og:locale" content="${locale}">`
        )
        const alternates = [
          ...head.matchAll(
            /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g
          ),
        ].map(([, hreflang, href]) => [hreflang, href])
        expect(alternates, at).toEqual([
          ['en', `${ORIGIN}${page}`],
          ['ko', `${ORIGIN}ko/${page}`],
          ['x-default', `${ORIGIN}${page}`],
        ])

        // The header's link to the other language, named in that language
        const other = LANGUAGES.find((language) => language.lang !== lang)!
        const [link] = header(at).match(LANGUAGE_LINK) ?? []
        expect(link, at).toBeDefined()
        expect(links(at, link!)).toEqual([other.dir + page])
        expect(link).toContain(`lang="${other.lang}" hreflang="${other.lang}"`)
      }
      // The same page in other words: the same anchors and the same hooks
      // for site.js
      const hooks = (html: string) =>
        [...html.matchAll(/\sdata-[\w-]+(?:="[^"]*")?/g)].map(([hook]) => hook)
      expect(ids(read(`ko/${page}`))).toEqual(ids(read(page)))
      expect(hooks(read(`ko/${page}`))).toEqual(hooks(read(page)))
    }
  )
})
