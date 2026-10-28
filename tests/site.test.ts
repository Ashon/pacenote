import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildSite, renderMarkdown } from '../scripts/site-pages.mjs'

/**
 * pacenote.dev as published: four hand-written pages that share a header, a
 * footer and the claims of "What Pace never does", in English and again in
 * Korean under ko/, and the guide and news made from markdown in their frame
 * (scripts/site-pages.mjs). This builds it, then holds it together: the same
 * nav on every page of a language, every link inside the site landing on a
 * page, a picture or an anchor that is there, the home page's claims the same
 * as the privacy page's headings, and each page naming its counterpart in the
 * other language. The join page, which a teammate's share link to a team hub
 * opens, shares the header and the footer but stays out of the sitemap, search
 * and the visit count.
 */
const REPO = path.resolve(__dirname, '..')
const ORIGIN = 'https://pacenote.dev/'
const PAGES = ['', 'how-it-works/', 'privacy/', 'install/']
/** Pages only a link leads to: in neither the nav nor the sitemap */
const UNLISTED = ['join/']
/** Where each language's pages are, and what the page says it is in */
const LANGUAGES = [
  { lang: 'en', dir: '', locale: 'en_US' },
  { lang: 'ko', dir: 'ko/', locale: 'ko_KR' },
]
/** Every hand-written listed page, as a site path: '' and 'ko/' for home */
const ALL = LANGUAGES.flatMap(({ dir }) => PAGES.map((page) => dir + page))

const scratch = mkdtempSync(path.join(tmpdir(), 'pacenote-site-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** Built with these releases out, as the Pages workflow reads them */
const build = (name: string, tags: Record<string, string>) => {
  const releases = path.join(scratch, `${name}.jsonl`)
  writeFileSync(
    releases,
    Object.entries(tags)
      .map(([tag, date]) => JSON.stringify({ tag, date }))
      .join('\n')
  )
  const out = path.join(scratch, name)
  buildSite({ root: REPO, out, releases })
  return out
}
const SITE = build('site', {
  'v0.6.9': '2026-10-26T06:00:00Z',
  'v0.6.10': '2026-10-27T03:00:00Z',
  'v0.6.11': '2026-10-28T03:00:00Z',
  'v0.6.12': '2026-10-28T15:00:00Z',
  'v0.6.13': '2026-10-29T03:00:00Z',
})

const read = (page: string, site = SITE) =>
  readFileSync(path.join(site, page, 'index.html'), 'utf8')

/** Every page there is, as a site path */
const pagesIn = (dir: string, at = ''): string[] =>
  readdirSync(path.join(dir, at), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pagesIn(dir, `${at}${entry.name}/`)
      : entry.name === 'index.html'
        ? [at]
        : []
  )
const EVERY = pagesIn(SITE).sort()
const languageOf = (page: string) => (page.startsWith('ko/') ? 'ko' : 'en')
/** The same page in the other language, when there is one */
const pairOf = (page: string) => {
  const pair = page.startsWith('ko/') ? page.slice(3) : `ko/${page}`
  return EVERY.includes(pair) ? pair : undefined
}

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

/** The nav item a page is under: itself, its section, or none */
const current = (page: string) => {
  const dir = page.startsWith('ko/') ? 'ko/' : ''
  const rest = page.slice(dir.length)
  const section = /^(guide|news)\//.exec(rest)?.[0]
  if (section) return [dir + section]
  return PAGES.includes(rest) && rest ? [page] : []
}

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
    ({ lang }) => {
      const pages = EVERY.filter((page) => languageOf(page) === lang)
      expect(pages.length).toBeGreaterThan(PAGES.length + 4)
      const navs = pages.map((at) => {
        const nav = header(at).replace(LANGUAGE_LINK, '')
        const marked = [...nav.matchAll(/href="([^"]+)" aria-current="page"/g)]
        expect(
          marked.map(([, href]) => resolve(at, href!)),
          at
        ).toEqual(current(at))
        return links(at, nav)
      })
      const footers = pages.map((at) =>
        links(at, between(read(at), /<footer/, '</footer>'))
      )
      for (const nav of navs) expect(nav).toEqual(navs[0])
      for (const footer of footers) expect(footer).toEqual(footers[0])
    }
  )

  it("names the copyright holder NOTICE names, on every page's footer", () => {
    const notice = readFileSync(path.join(REPO, 'NOTICE'), 'utf8')
    const [, year, holder] = notice.match(/^Copyright (\d{4}) (.+)$/m)!
    for (const page of EVERY) {
      const footer = between(read(page), /<footer/, '</footer>')
      expect(footer, page || 'home').toContain(`© ${year} ${holder}.`)
    }
  })

  it('links only to pages, pictures and anchors that are there', () => {
    for (const page of EVERY) {
      const html = read(page)
      const srcs = [...html.matchAll(/(?:src|srcset|href)="([^"]+)"/g)].map(
        ([, ref]) => ref!
      )
      for (const ref of srcs) {
        if (/^(https?:|mailto:)/.test(ref)) continue
        const [file, anchor] = ref.split('#')
        const target = file ? resolve(page, file) : page
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

  it('says on every page which language it is in, and names its counterpart where there is one', () => {
    for (const at of EVERY) {
      const lang = languageOf(at)
      const { locale } = LANGUAGES.find((l) => l.lang === lang)!
      const other = LANGUAGES.find((l) => l.lang !== lang)!
      const html = read(at)
      const head = between(html, /<head>/, '</head>')
      expect(html, at).toMatch(new RegExp(`<html lang="${lang}"[ >]`))
      expect(head, at).toContain(`<link rel="canonical" href="${ORIGIN}${at}">`)
      expect(head, at).toContain(
        `<meta property="og:url" content="${ORIGIN}${at}">`
      )
      expect(head, at).toContain(
        `<meta property="og:locale" content="${locale}">`
      )
      const alternates = [
        ...head.matchAll(
          /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g
        ),
      ].map(([, hreflang, href]) => [hreflang, href])
      const pair = pairOf(at)
      const en = lang === 'en' ? at : pair
      expect(alternates, at).toEqual(
        pair !== undefined
          ? [
              ['en', `${ORIGIN}${en}`],
              ['ko', `${ORIGIN}${lang === 'ko' ? at : pair}`],
              ['x-default', `${ORIGIN}${en}`],
            ]
          : []
      )

      // The header's link to the other language, named in that language: the
      // same page, or (a release noted only in English) the other news
      const [link] = header(at).match(LANGUAGE_LINK) ?? []
      expect(link, at).toBeDefined()
      expect(links(at, link!), at).toEqual([pair ?? `${other.dir}news/`])
      expect(link).toContain(`lang="${other.lang}" hreflang="${other.lang}"`)
    }
  })

  it.each(
    [...PAGES, ...UNLISTED].map((page) => ({
      page: page || 'home',
      path: page,
    }))
  )(
    'has $page in both languages, the same page in other words',
    ({ path: page }) => {
      // The same anchors and the same hooks for site.js
      const hooks = (html: string) =>
        [...html.matchAll(/\sdata-[\w-]+(?:="[^"]*")?/g)].map(([hook]) => hook)
      expect(ids(read(`ko/${page}`))).toEqual(ids(read(page)))
      expect(hooks(read(`ko/${page}`))).toEqual(hooks(read(page)))
    }
  )

  it('lists every page but the unlisted in the sitemap that robots.txt names', () => {
    const sitemap = readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8')
    const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
      ([, url]) => url!
    )
    const listed = EVERY.filter(
      (page) => !UNLISTED.includes(page.replace(/^ko\//, ''))
    )
    const locs = urls.map((url) => url.match(/<loc>([^<]+)<\/loc>/)![1]!)
    expect([...locs].sort()).toEqual(listed.map((page) => ORIGIN + page).sort())
    expect(locs.slice(0, ALL.length)).toEqual(ALL.map((page) => ORIGIN + page))
    for (const url of urls) {
      const at = url.match(/<loc>([^<]+)<\/loc>/)![1]!.slice(ORIGIN.length)
      const pair = pairOf(at)
      const en = languageOf(at) === 'en' ? at : pair
      const ko = languageOf(at) === 'ko' ? at : pair
      const alternates = [
        ...url.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g),
      ].map(([, hreflang, href]) => [hreflang, href])
      expect(alternates, at).toEqual(
        pair !== undefined
          ? [
              ['en', `${ORIGIN}${en}`],
              ['ko', `${ORIGIN}${ko}`],
              ['x-default', `${ORIGIN}${en}`],
            ]
          : []
      )
    }
    expect(readFileSync(path.join(SITE, 'robots.txt'), 'utf8')).toContain(
      `Sitemap: ${ORIGIN}sitemap.xml`
    )
  })

  it.each(LANGUAGES)(
    'keeps the $lang join page out of search, the sitemap and the visit count',
    ({ dir }) => {
      const html = read(`${dir}join/`)
      expect(html).toContain('data-analytics="off"')
      expect(between(html, /<head>/, '</head>')).toContain(
        '<meta name="robots" content="noindex">'
      )
      const sitemap = readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8')
      expect(sitemap).not.toContain(`${ORIGIN}${dir}join/`)
      // What site.js fills in and shows
      for (const hook of ['data-join', 'data-join-hub', 'data-join-none'])
        expect(html).toContain(hook)
      for (const id of ['join-open', 'join-address'])
        expect(ids(html).has(id), id).toBe(true)
    }
  )

  it('counts no visit on a page marked data-analytics="off"', () => {
    const script = readFileSync(path.join(SITE, 'site.js'), 'utf8')
    const guard = between(script, /const ANALYTICS_ID/, 'window.dataLayer')
    expect(guard).toContain(
      "document.documentElement.dataset.analytics !== 'off'"
    )
  })

  it('has a not-found page whose links work at any depth', () => {
    const html = readFileSync(path.join(SITE, '404.html'), 'utf8')
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(
      ([, ref]) => ref!
    )
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      expect(ref).toMatch(/^(\/|#|https:)/)
      // Each page it links to is there
      const page = ref.replace(/^\//, '')
      if (ref.startsWith('/') && (page === '' || page.endsWith('/')))
        expect(existsSync(path.join(SITE, page, 'index.html')), ref).toBe(true)
    }
  })
})

describe('the guide', () => {
  const slugs = (lang: string) =>
    readdirSync(path.join(REPO, 'docs/guide', lang))
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.slice(0, -3))
      .sort()

  it('has each page of docs/guide in both languages, listed on its contents page', () => {
    expect(slugs('en').length).toBeGreaterThanOrEqual(4)
    expect(slugs('ko')).toEqual(slugs('en'))
    for (const { dir } of LANGUAGES) {
      const contents = read(`${dir}guide/`)
      for (const slug of slugs('en')) {
        expect(EVERY).toContain(`${dir}guide/${slug}/`)
        expect(contents).toContain(`href="${slug}/"`)
      }
    }
  })

  it("shows the app's own screens in the page's language, as the e2e tests took them", () => {
    for (const { lang, dir } of LANGUAGES) {
      const shots = [
        ...read(`${dir}guide/messengers/`).matchAll(/src="([^"]*shots[^"]*)"/g),
      ].map(([, src]) => src)
      expect(shots).toEqual([
        `../../${dir ? '../' : ''}shots/${lang}/messengers-hub.png`,
      ])
    }
  })
})

describe('the news', () => {
  const rows = (page: string) =>
    [...read(page).matchAll(/<li data-kind="(\w+)"><a href="([^"]+)"/g)].map(
      ([, kind, href]) => `${kind} ${href}`
    )

  it("lists feature posts and released versions' notes, newest first", () => {
    // The latest post leads in a card of its own, and the list has the rest
    for (const dir of ['', 'ko/'])
      expect(read(`${dir}news/`)).toContain(
        '<a class="news-featured" href="macs-without-slack/" data-kind="post">'
      )
    expect(rows('news/').slice(0, 4)).toEqual([
      'release v0.6.13/',
      'post todo-comes-first/',
      'release v0.6.12/',
      'post share-your-hub/',
    ])
    expect(rows('news/')).not.toContain('post macs-without-slack/')
    // Notes in Korean from v0.6.11; before, the English page, marked so
    expect(rows('ko/news/').slice(0, 6)).toEqual([
      'release v0.6.13/',
      'post todo-comes-first/',
      'release v0.6.12/',
      'post share-your-hub/',
      'release v0.6.11/',
      'release ../../news/v0.6.10/',
    ])
    expect(EVERY).toContain('ko/news/v0.6.11/')
    expect(EVERY).toContain('ko/news/v0.6.13/')
    expect(read('ko/news/')).toContain('class="badge badge-lang"')
    expect(EVERY).not.toContain('ko/news/v0.6.10/')
    // A version not released has no notes yet
    expect(EVERY).not.toContain('news/v0.6.14/')
  })

  it('shows the latest news beside a news page, marking the one open', () => {
    const recent = (page: string) =>
      [
        ...read(page).matchAll(
          /<a href="([^"]+)"( aria-current="page")?[^>]*>[^<]*<span class="news-nav-date">/g
        ),
      ].map(([, href, current]) => `${href}${current ? ' *' : ''}`)
    expect(recent('news/v0.6.12/').slice(0, 4)).toEqual([
      '../macs-without-slack/',
      '../v0.6.13/',
      '../todo-comes-first/',
      './ *',
    ])
    // The Korean rail has the English notes too, as the Korean list has
    expect(recent('ko/news/v0.6.11/').slice(0, 7)).toEqual([
      '../macs-without-slack/',
      '../v0.6.13/',
      '../todo-comes-first/',
      '../v0.6.12/',
      '../share-your-hub/',
      './ *',
      '../../../news/v0.6.10/',
    ])
  })

  it("points the home page's link at the latest news", () => {
    const link = (page: string) =>
      read(page)
        .match(
          /<a class="release" id="release-link" href="([^"]+)">([^<]+)<\/a>/
        )!
        .slice(1)
    // The latest feature post, as it leads the news
    expect(link('')).toEqual([
      'news/macs-without-slack/',
      'New: Pair your Macs, with no Slack app',
    ])
    expect(link('ko/')).toEqual([
      'news/macs-without-slack/',
      '새 소식: Slack 앱 없이 Mac을 페어링해요',
    ])
  })

  it('keeps a feature post back until the version it comes with is out', () => {
    const before = build('before', { 'v0.6.10': '2026-10-27T03:00:00Z' })
    const pages = pagesIn(before)
    expect(pages).not.toContain('news/share-your-hub/')
    expect(pages).not.toContain('ko/news/share-your-hub/')
    expect(read('', before)).toContain(
      '<a class="release" id="release-link" href="news/v0.6.10/">What&#39;s new in v0.6.10</a>'.replace(
        '&#39;',
        "'"
      )
    )
  })

  it('has an Atom feed in each language', () => {
    for (const { lang, dir } of LANGUAGES) {
      const feed = readFileSync(path.join(SITE, dir, 'feed.xml'), 'utf8')
      expect(feed).toContain(
        `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">`
      )
      expect(feed).toContain(`<id>${ORIGIN}${dir}news/share-your-hub/</id>`)
      expect(feed).toContain(`<id>${ORIGIN}news/v0.6.10/</id>`)
    }
  })

  it('has the Korean of every release note from v0.6.11 on', () => {
    const tags = readdirSync(path.join(REPO, 'docs/releases'))
      .filter((name) => /^v\d+\.\d+\.\d+\.md$/.test(name))
      .filter((name) => {
        const [major, minor, patch] = name.slice(1, -3).split('.').map(Number)
        return major! * 1e6 + minor! * 1e3 + patch! >= 6011
      })
    for (const name of tags)
      expect(existsSync(path.join(REPO, 'docs/releases/ko', name)), name).toBe(
        true
      )
  })
})

describe('the markdown the guide and news use', () => {
  const link = (href: string) =>
    href.startsWith('guide:') ? `../${href.slice(6)}/` : href

  it('turns headings, lists, code, bold and links into HTML, and the rest into text', () => {
    const html = renderMarkdown(
      [
        '## Fixes',
        '',
        '- **Electron 43.8.1**, for `<webview>` workers: see',
        '  [the notes](https://example.com/a?b=1&c=2).',
        '- Two',
        '',
        '1. First',
        '2. [Join](guide:join-hub)',
        '',
        'A <b>tag</b> stays text.',
      ].join('\n'),
      { link }
    )
    expect(html).toBe(
      [
        '<h2>Fixes</h2>',
        '<ul><li><b>Electron 43.8.1</b>, for <code>&lt;webview&gt;</code> workers: see <a href="https://example.com/a?b=1&amp;c=2">the notes</a>.</li><li>Two</li></ul>',
        '<ol><li>First</li><li><a href="../join-hub/">Join</a></li></ol>',
        '<p>A &lt;b&gt;tag&lt;/b&gt; stays text.</p>',
      ].join('\n')
    )
  })

  it('makes a shell block a command to copy, and a shot a picture', () => {
    const html = renderMarkdown(
      '```sh\nbrew upgrade\n```\n\n![The screen](shot:todo)\n\n```\nplain\n```',
      {
        command: (source: string) => `[copy ${source}]`,
        shot: (name: string, alt: string) => `[shot ${name} ${alt}]`,
      }
    )
    expect(html).toBe(
      '[copy brew upgrade]\n[shot todo The screen]\n<pre><code>plain</code></pre>'
    )
  })
})
