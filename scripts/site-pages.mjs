#!/usr/bin/env node
// pacenote.dev as published: site/ as written, plus the pages made from
// markdown. The guide (docs/guide/<lang>/*.md) and the news (feature posts in
// docs/news/<lang>/*.md and the release notes in docs/releases, with their
// Korean in docs/releases/ko from v0.6.11) become pages in the hand-written
// pages' own header and footer, taken from install/ in each language. It also
// writes the sitemap, an Atom feed per language, and the home page's link to
// the latest news.
//
// Only released versions are news: the release list (--releases, the GitHub
// releases as JSON lines of { tag, date }, as the Pages workflow reads them)
// says which, else the repository's own version tags. A feature post waits
// for the version it names.
//
//   node scripts/site-pages.mjs [--out _site] [--releases releases.jsonl]
//
// No dependency: the markdown is the small part of it these pages use
// (renderMarkdown).

import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'https://pacenote.dev/'
const REPO_URL = 'https://github.com/Ashon/pacenote'
/** The first release whose notes are written in Korean too */
const KO_NOTES_FROM = '0.6.11'
/** News rows on a list page; older releases are on GitHub */
const LIST_LIMIT = 30
/** The latest news beside a news page */
const RECENT_LIMIT = 8
const FEED_LIMIT = 20

const LANGS = /** @type {const} */ (['en', 'ko'])
/** Where a language's pages are, as a site path prefix */
const DIR = { en: '', ko: 'ko/' }
const LOCALE = { en: 'en_US', ko: 'ko_KR' }

/** The words these pages say, beside the ones taken from install/ */
const TEXT = {
  en: {
    guide: 'Guide',
    guideLede:
      'From the day you open Pacenote to the screens you use every day, under the names the app uses.',
    guideDescription:
      'How to use Pacenote: setup, joining your team hub, and each screen.',
    start: 'Getting started',
    startLede: 'Each one goes through a few screens in order, start to finish.',
    screens: 'By screen',
    screensLede: 'What each screen shows and what you can do there.',
    moreDocs: 'More in the docs',
    moreDocsText: (link) =>
      `Every setting, the built-in sandbox and running a team hub are in ${link}.`,
    docsLink: 'the docs on GitHub',
    contents: 'Guide contents',
    edit: 'Edit this page',
    news: 'News',
    newsLede: (command) =>
      `New features and release notes in one place. Updating is always ${command}.`,
    newsDescription: "What's new in Pacenote: new features and release notes.",
    subscribe: 'Subscribe with RSS',
    recent: 'Recent news',
    filter: 'Kind',
    all: 'All',
    posts: 'Features',
    releases: 'Releases',
    post: 'Feature',
    release: 'Release',
    read: 'Read',
    olderReleases: 'Older releases are on GitHub',
    whatsNew: (version) => `What's new in ${version}`,
    newPost: (title) => `New: ${title}`,
    releaseTitle: (version) => `Pacenote ${version}`,
    english: 'In English',
    englishBadge: 'EN',
    update: 'Update',
    older: 'Older',
    newer: 'Newer',
    date: (iso) =>
      new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }),
  },
  ko: {
    guide: '가이드',
    guideLede:
      'Pacenote를 처음 여는 날부터 매일 쓰는 화면까지, 앱에 나오는 이름 그대로 찾아요.',
    guideDescription:
      'Pacenote 사용 안내: 초기 설정, 팀 허브 합류, 화면별 안내.',
    start: '처음이라면',
    startLede: '여러 화면을 순서대로 지나는 안내예요. 하나씩 따라 하면 끝나요.',
    screens: '화면별 안내',
    screensLede: '화면마다 무엇이 보이고, 무엇을 할 수 있는지.',
    moreDocs: '더 자세히',
    moreDocsText: (link) =>
      `모든 설정, 내장 샌드박스, 팀 허브 운영은 ${link}에 있어요.`,
    docsLink: 'GitHub의 문서',
    contents: '가이드 목차',
    edit: '이 쪽 고치기',
    news: '소식',
    newsLede: (command) =>
      `새 기능 이야기와 릴리스 노트를 한곳에서. 업데이트는 언제나 ${command}.`,
    newsDescription: 'Pacenote의 새 기능과 릴리스 노트.',
    subscribe: 'RSS로 구독',
    recent: '최근 소식',
    filter: '종류',
    all: '전체',
    posts: '새 기능',
    releases: '릴리스',
    post: '새 기능',
    release: '릴리스',
    read: '읽기',
    olderReleases: '이전 릴리스는 GitHub에 있어요',
    whatsNew: (version) => `${version}에서 달라진 점`,
    newPost: (title) => `새 소식: ${title}`,
    releaseTitle: (version) => `Pacenote ${version}`,
    english: '영어 원문',
    englishBadge: 'EN',
    update: '업데이트',
    older: '이전',
    newer: '다음',
    date: (iso) =>
      new Date(iso).toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Seoul',
      }),
  },
}

const UPDATE_COMMAND = 'brew update && brew upgrade --cask pacenote'

/** Text for HTML, in an element or a quoted attribute */
export const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** A version tag's numbers, to sort and compare: v0.6.10 > v0.6.9 */
const semver = (tag) => tag.replace(/^v/, '').split('.').map(Number)
const compare = (a, b) => {
  const [x, y] = [semver(a), semver(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** front matter (key: value lines between ---) and the body */
export function frontMatter(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) throw new Error(`${file}: no front matter`)
  const data = {}
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':')
    if (at < 0) continue
    data[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return { data, body: text.slice(match[0].length) }
}

/**
 * The markdown these pages use: ## and ### headings, paragraphs, - and 1.
 * lists (a line indented under an item carries it on), ``` code (```sh: a
 * command with a Copy button), `code`, **bold**, [links](...) and, on a line
 * of its own, ![a picture](shot:<name>) from site/shots. Everything else is
 * text.
 */
export function renderMarkdown(text, { link = (href) => href, shot, command }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  const item = /^(\s*)(?:([-*])|(\d+)\.)\s+(.*)$/
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = /^```\s*(.*)$/.exec(line)
    if (fence) {
      const code = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i]))
        code.push(lines[i++])
      i++
      const source = code.join('\n')
      out.push(
        /^(sh|bash|copy)\b/.test(fence[1]) && command
          ? command(source)
          : `<pre><code>${esc(source)}</code></pre>`
      )
      continue
    }
    const heading = /^(#{2,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2], link)}</h${level}>`)
      i++
      continue
    }
    const picture = /^!\[([^\]]*)\]\(shot:([\w-]+)\)\s*$/.exec(line)
    if (picture && shot) {
      out.push(shot(picture[2], picture[1]))
      i++
      continue
    }
    const first = item.exec(line)
    if (first) {
      const ordered = first[3] !== undefined
      const items = []
      while (i < lines.length) {
        const next = item.exec(lines[i])
        if (
          next &&
          next[1].length === 0 &&
          (next[3] !== undefined) === ordered
        ) {
          items.push(next[4])
          i++
        } else if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`
          i++
        } else if (
          !lines[i].trim() &&
          i + 1 < lines.length &&
          item.exec(lines[i + 1])?.[1] === '' &&
          (item.exec(lines[i + 1])[3] !== undefined) === ordered
        ) {
          i++
        } else break
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(
        `<${tag}>${items.map((it) => `<li>${inline(it, link)}</li>`).join('')}</${tag}>`
      )
      continue
    }
    const paragraph = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```|^#{2,3}\s/.test(lines[i]) &&
      !item.test(lines[i]) &&
      !/^!\[[^\]]*\]\(shot:/.test(lines[i])
    )
      paragraph.push(lines[i++].trim())
    out.push(`<p>${inline(paragraph.join(' '), link)}</p>`)
  }
  return out.join('\n')
}

/** `code`, **bold** and [links](...) in a line of markdown, the rest as text */
function inline(text, link) {
  const token = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let html = ''
  let last = 0
  for (const match of text.matchAll(token)) {
    html += esc(text.slice(last, match.index))
    if (match[1] !== undefined) html += `<code>${esc(match[1])}</code>`
    else if (match[2] !== undefined) html += `<b>${inline(match[2], link)}</b>`
    else
      html += `<a href="${esc(link(match[4]))}">${inline(match[3], link)}</a>`
    last = match.index + match[0].length
  }
  return html + esc(text.slice(last))
}

/** The first paragraph of a release note, as plain text, and what follows it */
function lead(body) {
  const blocks = body.trim().split(/\n\s*\n/)
  return {
    summary: blocks[0]
      .replace(/\s*\n\s*/g, ' ')
      .replace(/[*`]/g, '')
      .trim(),
    rest: blocks.slice(1).join('\n\n'),
  }
}

/** A site path as a link from another page: '../../guide/' from 'ko/news/x/' */
const relative = (from, to) => {
  const link = path.posix.relative(`/${from}`, `/${to}`)
  if (!link) return './'
  return to === '' || to.endsWith('/') ? `${link}/` : link
}

/**
 * Releases as { tag, date }, newest first: the given list, else the
 * repository's tags
 */
function readReleases(root, file) {
  let list
  if (file) {
    list = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .flatMap((line) => {
        const value = JSON.parse(line)
        return Array.isArray(value) ? value : [value]
      })
      .filter((r) => !r.draft && !r.prerelease)
  } else {
    list = execFileSync(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)\t%(creatordate:iso-strict)',
        'refs/tags/v*',
      ],
      { cwd: root, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [tag, date] = line.split('\t')
        return { tag, date }
      })
  }
  return list
    .filter((r) => /^v\d+\.\d+\.\d+$/.test(r.tag))
    .map((r) => ({ tag: r.tag, date: new Date(r.date).toISOString() }))
    .sort((a, b) => compare(b.tag, a.tag))
}

/**
 * Writes pacenote.dev into out: site/ as it is, the generated pages, the
 * sitemap and the feeds. Returns the pages it made, by site path.
 */
export function buildSite({ root, out, releases }) {
  const site = path.join(root, 'site')
  rmSync(out, { recursive: true, force: true })
  cpSync(site, out, { recursive: true })
  // The mark has one home, beside the app's other assets.
  mkdirSync(path.join(out, 'media'), { recursive: true })
  cpSync(
    path.join(root, 'assets/pacenote-mark.svg'),
    path.join(out, 'media/pacenote-mark.svg')
  )

  const frame = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      frameOf(
        readFileSync(path.join(site, DIR[lang], 'install/index.html'), 'utf8')
      ),
    ])
  )

  /** Each page made, by site path: { lang, pair?, listed, html } */
  const made = new Map()
  const write = (at, page) => {
    const file = path.join(out, at, 'index.html')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, page.html)
    made.set(at, page)
  }

  // Guide
  const guide = Object.fromEntries(
    LANGS.map((lang) => [lang, readGuide(root, lang)])
  )
  const enSlugs = guide.en.map((p) => p.slug).sort()
  const koSlugs = guide.ko.map((p) => p.slug).sort()
  if (enSlugs.join() !== koSlugs.join())
    throw new Error(
      `docs/guide: each page in both languages (en: ${enSlugs}, ko: ${koSlugs})`
    )

  // News: feature posts and released versions' notes
  const released = readReleases(root, releases)
  const releaseDate = new Map(
    released.map((r) => [r.tag.replace(/^v/, ''), r.date])
  )
  const notes = released
    .filter((r) => existsSync(path.join(root, 'docs/releases', `${r.tag}.md`)))
    .map((r) => {
      const body = Object.fromEntries(
        LANGS.map((lang) => {
          const file = path.join(
            root,
            'docs/releases',
            lang === 'ko' ? 'ko' : '',
            `${r.tag}.md`
          )
          return [
            lang,
            existsSync(file) ? readFileSync(file, 'utf8') : undefined,
          ]
        })
      )
      if (!body.ko && compare(r.tag, `v${KO_NOTES_FROM}`) >= 0)
        throw new Error(
          `docs/releases/ko/${r.tag}.md is missing: notes from v${KO_NOTES_FROM} are in Korean too`
        )
      return { kind: 'release', slug: r.tag, tag: r.tag, date: r.date, body }
    })
  const posts = readPosts(root).filter((post) => {
    if (!post.version) return true
    post.date ??= releaseDate.get(post.version)
    return releaseDate.has(post.version)
  })
  const items = [...posts, ...notes].sort((a, b) =>
    a.date === b.date
      ? a.kind === 'post'
        ? -1
        : 1
      : b.date.localeCompare(a.date)
  )

  for (const lang of LANGS) {
    const t = TEXT[lang]
    const other = lang === 'en' ? 'ko' : 'en'
    const pages = orderGuide(guide[lang])

    // The guide's contents page
    const guideAt = `${DIR[lang]}guide/`
    write(guideAt, {
      lang,
      pair: `${DIR[other]}guide/`,
      listed: true,
      html: page({
        lang,
        at: guideAt,
        frame,
        section: 'guide',
        pair: `${DIR[other]}guide/`,
        title: t.guide,
        description: t.guideDescription,
        main: guideIndex({ lang, at: guideAt, pages }),
      }),
    })
    pages.forEach((p, n) => {
      const at = `${DIR[lang]}guide/${p.slug}/`
      write(at, {
        lang,
        pair: `${DIR[other]}guide/${p.slug}/`,
        listed: true,
        html: page({
          lang,
          at,
          frame,
          section: 'guide',
          pair: `${DIR[other]}guide/${p.slug}/`,
          title: p.title,
          description: p.summary,
          main: guidePage({
            lang,
            at,
            root,
            p,
            pages,
            prev: pages[n - 1],
            next: pages[n + 1],
          }),
        }),
      })
    })

    // News
    const newsAt = `${DIR[lang]}news/`
    const rows = items.map((it) => newsItem(it, lang)).filter(Boolean)
    write(newsAt, {
      lang,
      pair: `${DIR[other]}news/`,
      listed: true,
      html: page({
        lang,
        at: newsAt,
        frame,
        section: 'news',
        pair: `${DIR[other]}news/`,
        title: t.news,
        description: t.newsDescription,
        main: newsIndex({ lang, at: newsAt, rows }),
        feed: `${DIR[lang]}feed.xml`,
      }),
    })
    const own = rows.filter((row) => row.own)
    own.forEach((row, n) => {
      const pair = row.pairAt
      write(row.at, {
        lang,
        pair,
        listed: true,
        html: page({
          lang,
          at: row.at,
          frame,
          section: 'news',
          pair,
          title: row.title,
          description: row.summary,
          image: row.shot && shotUrl(lang, row.shot),
          main: newsPage({
            lang,
            at: row.at,
            row,
            rows,
            older: own[n + 1],
            newer: own[n - 1],
          }),
          feed: `${DIR[lang]}feed.xml`,
        }),
      })
    })

    writeFileSync(path.join(out, DIR[lang], 'feed.xml'), feed({ lang, rows }))

    // The home page's link to the latest news
    const latest = rows[0]
    if (latest) {
      const home = path.join(out, DIR[lang], 'index.html')
      const html = readFileSync(home, 'utf8')
      const words =
        latest.kind === 'release'
          ? t.whatsNew(latest.tag)
          : t.newPost(latest.title)
      const link =
        /(<a class="release" id="release-link" href=")[^"]*(">)[^<]*(<\/a>)/
      if (!link.test(html)) throw new Error(`${home}: no release-link`)
      writeFileSync(
        home,
        html.replace(
          link,
          `$1${esc(relative(DIR[lang], latest.at))}$2${esc(words)}$3`
        )
      )
    }
  }

  // Each picture a page names is one the e2e tests took (pnpm site:shots)
  for (const [at, { html }] of made)
    for (const [, shot] of html.matchAll(
      /src="[^"]*?(shots\/(?:en|ko)\/[\w-]+\.png)"/g
    ))
      if (!existsSync(path.join(out, shot)))
        throw new Error(
          `${at}: site/${shot} is missing (pnpm site:shots takes it)`
        )

  writeFileSync(path.join(out, 'sitemap.xml'), sitemap(root, made))
  return made

  // A news item as a row in a language's list: its own page in that language,
  // or (a release noted only in English) the English page
  function newsItem(it, lang) {
    const t = TEXT[lang]
    const other = lang === 'en' ? 'ko' : 'en'
    if (it.kind === 'post') {
      const post = it[lang]
      return {
        kind: 'post',
        own: true,
        at: `${DIR[lang]}news/${it.slug}/`,
        pairAt: `${DIR[other]}news/${it.slug}/`,
        date: it.date,
        version: it.version,
        title: post.title,
        summary: post.summary,
        shot: post.shot,
        body: post.body,
        source: post.file,
        label: t.post,
      }
    }
    const text = it.body[lang]
    const { summary, rest } = lead(it.body[text ? lang : 'en'])
    return {
      kind: 'release',
      own: Boolean(text),
      english: !text,
      tag: it.tag,
      at: text ? `${DIR[lang]}news/${it.slug}/` : `news/${it.slug}/`,
      pairAt: it.body[other] ? `${DIR[other]}news/${it.slug}/` : undefined,
      date: it.date,
      version: it.tag.slice(1),
      title: t.releaseTitle(it.tag),
      summary,
      body: rest,
      source: `docs/releases/${lang === 'ko' && text ? 'ko/' : ''}${it.tag}.md`,
      label: t.release,
    }
  }
}

/** The guide's pages in a language, from docs/guide/<lang> */
function readGuide(root, lang) {
  const dir = path.join(root, 'docs/guide', lang)
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = path.join(dir, name)
      const { data, body } = frontMatter(readFileSync(file, 'utf8'), file)
      for (const key of ['title', 'summary', 'kind', 'order'])
        if (!data[key]) throw new Error(`${file}: no ${key}`)
      if (!['start', 'screen'].includes(data.kind))
        throw new Error(`${file}: kind is start or screen`)
      return {
        slug: name.slice(0, -3),
        title: data.title,
        summary: data.summary,
        kind: data.kind,
        order: Number(data.order),
        shot: data.shot,
        body,
        source: `docs/guide/${lang}/${name}`,
      }
    })
}

/** Getting started first, then the screens, each by its order */
const orderGuide = (pages) =>
  [...pages].sort((a, b) =>
    a.kind === b.kind ? a.order - b.order : a.kind === 'start' ? -1 : 1
  )

/** Feature posts, in both languages each: docs/news/<lang>/<slug>.md */
function readPosts(root) {
  const read = (lang) => {
    const dir = path.join(root, 'docs/news', lang)
    if (!existsSync(dir)) return new Map()
    return new Map(
      readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .map((name) => {
          const file = path.join(dir, name)
          const { data, body } = frontMatter(readFileSync(file, 'utf8'), file)
          for (const key of ['title', 'summary'])
            if (!data[key]) throw new Error(`${file}: no ${key}`)
          if (!data.version && !data.date)
            throw new Error(`${file}: a version it comes with, or a date`)
          return [
            name.slice(0, -3),
            { ...data, body, file: `docs/news/${lang}/${name}` },
          ]
        })
    )
  }
  const en = read('en')
  const ko = read('ko')
  if ([...en.keys()].sort().join() !== [...ko.keys()].sort().join())
    throw new Error('docs/news: each post in both languages')
  return [...en.keys()].map((slug) => {
    const { version, date } = en.get(slug)
    return {
      kind: 'post',
      slug,
      en: en.get(slug),
      ko: ko.get(slug),
      version,
      date: date && new Date(date).toISOString(),
    }
  })
}

/** install/'s header and footer, to frame each page made here */
function frameOf(html) {
  const take = (open, close) => {
    const start = html.indexOf(open)
    const end = html.indexOf(close, start)
    if (start < 0 || end < 0) throw new Error(`install/: no ${open}`)
    return html.slice(start, end + close.length)
  }
  return {
    skip: take('<a class="skip"', '</a>'),
    header: take('<header class="top">', '</header>'),
    footer: take('<footer class="status">', '</footer>'),
  }
}

/**
 * A frame's links, written from install/ in its language, for a page at
 * another place
 */
function reframe(part, lang, at, { section, pair } = {}) {
  const from = `${DIR[lang]}install/`
  const links = part
    .replace(/\saria-current="page"/g, '')
    .replace(/(href|src)="([^"]+)"/g, (whole, name, href) => {
      if (/^(https?:|mailto:|#)/.test(href)) return whole
      const target = path.posix
        .normalize(path.posix.join('/', from, href))
        .slice(1)
      return `${name}="${relative(at, target)}"`
    })
  if (!section) return links
  return links
    .replace(/(<a class="lang" href=")[^"]*/, `$1${relative(at, pair)}`)
    .replace(
      `<a href="${relative(at, `${DIR[lang]}${section}/`)}"`,
      `<a href="${relative(at, `${DIR[lang]}${section}/`)}" aria-current="page"`
    )
}

const shotUrl = (lang, name) => `${ORIGIN}shots/${lang}/${name}.png`

/** A page made here: head, the frame and its main */
function page({
  lang,
  at,
  frame,
  section,
  pair,
  title,
  description,
  main,
  image,
  feed,
}) {
  const other = lang === 'en' ? 'ko' : 'en'
  const own = { [lang]: at, [other]: pair }
  const alternates =
    pair !== undefined
      ? `
  <link rel="alternate" hreflang="en" href="${ORIGIN}${own.en}">
  <link rel="alternate" hreflang="ko" href="${ORIGIN}${own.ko}">
  <link rel="alternate" hreflang="x-default" href="${ORIGIN}${own.en}">`
      : ''
  const name = title === 'Pacenote' ? title : `${title} - Pacenote`
  return `<!doctype html>
<!-- Made by scripts/site-pages.mjs from the markdown in docs/; edit that, not this. -->
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${ORIGIN}${at}">${alternates}
  <meta name="theme-color" content="#f3f9f6" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0e1a17" media="(prefers-color-scheme: dark)">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${ORIGIN}${at}">
  <meta property="og:site_name" content="Pacenote">
  <meta property="og:locale" content="${LOCALE[lang]}">
  <meta property="og:image" content="${image ?? `${ORIGIN}assets/og.png`}">
  <meta name="twitter:card" content="summary_large_image">${
    feed
      ? `
  <link rel="alternate" type="application/atom+xml" title="Pacenote" href="${ORIGIN}${feed}">`
      : ''
  }
  <link rel="icon" type="image/svg+xml" href="${relative(at, 'media/pacenote-mark.svg')}">
  <link rel="stylesheet" href="${relative(at, 'style.css')}">
  <script>document.documentElement.classList.add('js')</script>
</head>
<body>
  ${frame[lang].skip}

  ${reframe(frame[lang].header, lang, at, { section, pair: pair ?? `${DIR[other]}${section}/` })}

  <main id="main">
${main}
  </main>

  ${reframe(frame[lang].footer, lang, at)}

  <script src="${relative(at, 'site.js')}"></script>
</body>
</html>
`
}

/** The markdown's links and pictures, for a page at a place */
function markdownFor({ lang, at, source }) {
  return {
    link: (href) => {
      const guide = /^guide:([\w-]+)$/.exec(href)
      if (guide) return relative(at, `${DIR[lang]}guide/${guide[1]}/`)
      const news = /^news:([\w.-]+)$/.exec(href)
      if (news) return relative(at, `${DIR[lang]}news/${news[1]}/`)
      if (/^(https?:|mailto:|#)/.test(href)) return href
      // A file in the repository: on GitHub
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(source), href)
      )
      return `${REPO_URL}/blob/main/${target}`
    },
    shot: (name, alt) =>
      `<figure class="shot-pic"><img src="${relative(at, `shots/${lang}/${name}.png`)}" alt="${esc(alt)}" width="1360" height="880" loading="lazy"></figure>`,
    command: commandBox(lang),
  }
}

/** A command with a Copy button, as the install page has (site.js copies it) */
function commandBox(lang) {
  let n = 0
  return (source) => {
    const id = `command-${++n}`
    const lines = source
      .split('\n')
      .map((l) => `<span>${esc(l)}</span>`)
      .join('\n')
    return `<div class="get"><div class="command" role="group" aria-label="${lang === 'ko' ? '명령' : 'Command'}"><code id="${id}">${lines}</code><button class="button primary copy" type="button" data-copy="${id}">${lang === 'ko' ? '복사' : 'Copy'}</button><span class="copied" role="status" aria-live="polite"></span></div></div>`
  }
}

function guideIndex({ lang, at, pages }) {
  const t = TEXT[lang]
  const start = pages.filter((p) => p.kind === 'start')
  const screens = pages.filter((p) => p.kind === 'screen')
  const card = (
    p
  ) => `          <a class="guide-card" href="${relative(at, `${DIR[lang]}guide/${p.slug}/`)}">
            ${p.shot ? `<span class="shot-crop"><img src="${relative(at, `shots/${lang}/${p.shot}.png`)}" alt="" width="1360" height="880" loading="lazy"></span>` : ''}
            <span class="guide-card-text"><span class="guide-card-title">${esc(p.title)}</span><span class="guide-card-summary">${esc(p.summary)}</span></span>
          </a>`
  const row = (p) =>
    `          <a class="screen-row" href="${relative(at, `${DIR[lang]}guide/${p.slug}/`)}"><span class="screen-name">${esc(p.title)}</span><span class="screen-summary">${esc(p.summary)}</span></a>`
  return `    <div class="page-head">
      <h1>${esc(t.guide)}</h1>
      <p class="lede">${esc(t.guideLede)}</p>
    </div>

    <div class="surface">
      <section class="block" id="start" aria-labelledby="start-title">
        <h2 id="start-title">${esc(t.start)}</h2>
        <p>${esc(t.startLede)}</p>
        <div class="guide-cards">
${start.map(card).join('\n')}
        </div>
      </section>
${
  screens.length
    ? `
      <section class="block" id="screens" aria-labelledby="screens-title">
        <h2 id="screens-title">${esc(t.screens)}</h2>
        <p>${esc(t.screensLede)}</p>
        <div class="screen-list">
${screens.map(row).join('\n')}
        </div>
      </section>
`
    : ''
}
      <section class="block closing" aria-labelledby="docs-title">
        <h2 id="docs-title">${esc(t.moreDocs)}</h2>
        <p>${t.moreDocsText(`<a href="${REPO_URL}/tree/main/docs">${esc(t.docsLink)}</a>`)}</p>
      </section>
    </div>`
}

function guidePage({ lang, at, p, pages, prev, next }) {
  const t = TEXT[lang]
  const link = (q) => relative(at, `${DIR[lang]}guide/${q.slug}/`)
  const group = (kind, words) => {
    const list = pages.filter((q) => q.kind === kind)
    if (!list.length) return ''
    return `        <p class="guide-nav-group">${esc(words)}</p>
${list.map((q) => `        <a href="${link(q)}"${q.slug === p.slug ? ' aria-current="page"' : ''}>${esc(q.title)}</a>`).join('\n')}`
  }
  return `    <div class="guide">
      <nav class="guide-nav" aria-label="${esc(t.contents)}">
        <a class="guide-nav-home" href="${relative(at, `${DIR[lang]}guide/`)}">${esc(t.guide)}</a>
${group('start', t.start)}
${group('screen', t.screens)}
      </nav>

      <article class="guide-page">
        <p class="crumb"><a href="${relative(at, `${DIR[lang]}guide/`)}">${esc(t.guide)}</a> › ${esc(p.kind === 'start' ? t.start : t.screens)}</p>
        <h1>${esc(p.title)}</h1>
        <p class="lede">${esc(p.summary)}</p>
        <div class="prose">
${renderMarkdown(p.body, markdownFor({ lang, at, source: p.source }))}
        </div>
        <nav class="pager" aria-label="${esc(t.contents)}">
          ${prev ? `<a href="${link(prev)}">← ${esc(prev.title)}</a>` : '<span></span>'}
          <a class="edit" href="${REPO_URL}/edit/main/${p.source}">${esc(t.edit)} ↗</a>
          ${next ? `<a href="${link(next)}">${esc(next.title)} →</a>` : '<span></span>'}
        </nav>
      </article>
    </div>`
}

function newsIndex({ lang, at, rows }) {
  const t = TEXT[lang]
  // The latest feature post leads, in a card of its own; the list has the rest
  const featured = rows.find((row) => row.kind === 'post')
  const list = rows.filter((row) => row !== featured).slice(0, LIST_LIMIT)
  const command = `<code>${esc('brew upgrade --cask pacenote')}</code>`
  const href = (row) => relative(at, row.at)
  return `    <div class="page-head news-head">
      <div>
        <h1>${esc(t.news)}</h1>
        <p class="lede">${t.newsLede(command)}</p>
      </div>
      <a class="button secondary" href="${relative(at, `${DIR[lang]}feed.xml`)}">${esc(t.subscribe)}</a>
    </div>

    <div class="surface">
      <section class="block news-block">
        <div class="news-filter" role="group" aria-label="${esc(t.filter)}">
          <button type="button" data-news-filter="all" aria-pressed="true">${esc(t.all)}</button>
          <button type="button" data-news-filter="post" aria-pressed="false">${esc(t.posts)}</button>
          <button type="button" data-news-filter="release" aria-pressed="false">${esc(t.releases)}</button>
        </div>
${
  featured
    ? `        <a class="news-featured" href="${href(featured)}" data-kind="post">
          ${featured.shot ? `<span class="shot-crop"><img src="${relative(at, `shots/${lang}/${featured.shot}.png`)}" alt="" width="1360" height="880"></span>` : ''}
          <span class="news-featured-text">
            <span class="news-meta"><span class="badge badge-post">${esc(t.post)}</span>${esc(t.date(featured.date))}</span>
            <span class="news-featured-title">${esc(featured.title)}</span>
            <span class="news-featured-summary">${esc(featured.summary)}</span>
          </span>
        </a>
`
    : ''
}        <ul class="news-list">
${list
  .map(
    (
      row
    ) => `          <li data-kind="${row.kind}"><a href="${href(row)}"${row.english ? ' hreflang="en"' : ''}>
            <span class="news-date">${esc(t.date(row.date))}</span>
            <span class="badge badge-${row.kind}">${esc(row.label)}</span>
            <span class="news-text"><span class="news-title">${esc(row.title)}${row.english ? ` <span class="badge badge-lang" title="${esc(t.english)}">${t.englishBadge}</span>` : ''}</span><span class="news-summary">${esc(row.summary)}</span></span>
          </a></li>`
  )
  .join('\n')}
        </ul>
        <p class="news-more"><a href="${REPO_URL}/releases">${esc(t.olderReleases)} ↗</a></p>
      </section>
    </div>`
}

function newsPage({ lang, at, row, rows, older, newer }) {
  const t = TEXT[lang]
  const md = markdownFor({ lang, at, source: row.source })
  const meta = [row.version && `v${row.version}`, t.date(row.date)].filter(
    Boolean
  )
  const recent = rows.slice(0, RECENT_LIMIT)
  // In the guide's frame: the latest news beside it, as the guide's contents
  return `    <div class="guide">
      <nav class="guide-nav news-nav" aria-label="${esc(t.recent)}">
        <a class="guide-nav-home" href="${relative(at, `${DIR[lang]}news/`)}">${esc(t.news)}</a>
        <p class="guide-nav-group">${esc(t.recent)}</p>
${recent.map((q) => `        <a href="${relative(at, q.at)}"${q.at === row.at ? ' aria-current="page"' : ''}${q.english ? ' hreflang="en"' : ''}>${esc(q.title)}<span class="news-nav-date">${esc(t.date(q.date))}</span></a>`).join('\n')}
        <a class="news-nav-feed" href="${relative(at, `${DIR[lang]}feed.xml`)}">${esc(t.subscribe)}</a>
      </nav>

      <article class="guide-page news-article">
        <p class="crumb"><a href="${relative(at, `${DIR[lang]}news/`)}">${esc(t.news)}</a> › ${esc(row.label)}</p>
        <p class="news-meta"><span class="badge badge-${row.kind}">${esc(row.label)}</span>${esc(meta.join(' · '))}</p>
        <h1>${esc(row.title)}</h1>
        <p class="lede">${esc(row.summary)}</p>
${row.shot ? md.shot(row.shot, row.title) : ''}
        <div class="prose">
${renderMarkdown(row.body, md)}
${row.kind === 'post' ? `<h2>${esc(t.update)}</h2>\n${md.command(UPDATE_COMMAND)}` : ''}
        </div>
        <nav class="pager" aria-label="${esc(t.news)}">
          ${older ? `<a href="${relative(at, older.at)}">← ${esc(older.title)}</a>` : '<span></span>'}
          <a class="edit" href="${relative(at, `${DIR[lang]}feed.xml`)}">RSS</a>
          ${newer ? `<a href="${relative(at, newer.at)}">${esc(newer.title)} →</a>` : '<span></span>'}
        </nav>
      </article>
    </div>`
}

/** An Atom feed of a language's news */
function feed({ lang, rows }) {
  const t = TEXT[lang]
  const entries = rows.slice(0, FEED_LIMIT)
  const updated = entries[0]?.date ?? new Date(0).toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">
  <title>Pacenote ${esc(t.news)}</title>
  <subtitle>${esc(t.newsDescription)}</subtitle>
  <id>${ORIGIN}${DIR[lang]}news/</id>
  <link rel="alternate" href="${ORIGIN}${DIR[lang]}news/"/>
  <link rel="self" href="${ORIGIN}${DIR[lang]}feed.xml"/>
  <updated>${new Date(updated).toISOString()}</updated>
  <author><name>Ashon</name></author>
${entries
  .map(
    (row) => `  <entry>
    <title>${esc(row.title)}</title>
    <id>${ORIGIN}${row.at}</id>
    <link rel="alternate" href="${ORIGIN}${row.at}"/>
    <updated>${new Date(row.date).toISOString()}</updated>
    <summary>${esc(row.summary)}</summary>
  </entry>`
  )
  .join('\n')}
</feed>
`
}

/**
 * Every page there is, but those only a link leads to, each with its
 * counterpart
 */
function sitemap(root, made) {
  const listed = ['', 'how-it-works/', 'privacy/', 'install/']
  const pages = [
    ...LANGS.flatMap((lang) =>
      listed.map((p) => ({
        at: DIR[lang] + p,
        pair: DIR[lang === 'en' ? 'ko' : 'en'] + p,
        lang,
      }))
    ),
    ...[...made]
      .filter(([, p]) => p.listed)
      .map(([at, p]) => ({ at, pair: p.pair, lang: p.lang })),
  ]
  const entry = ({ at, pair, lang }) => {
    const own = { [lang]: at, [lang === 'en' ? 'ko' : 'en']: pair }
    const alternates =
      pair !== undefined
        ? `
    <xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}${own.en}"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${ORIGIN}${own.ko}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${own.en}"/>`
        : ''
    return `  <url>
    <loc>${ORIGIN}${at}</loc>${alternates}
  </url>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Made by scripts/site-pages.mjs: every page in both languages, but those only a link leads to (join/) -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map(entry).join('\n')}
</urlset>
`
}

// From the command line
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const option = (name) => {
    const at = args.indexOf(name)
    return at >= 0 ? args[at + 1] : undefined
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const out = path.resolve(root, option('--out') ?? '_site')
  const made = buildSite({ root, out, releases: option('--releases') })
  console.log(
    `pacenote.dev in ${path.relative(root, out)}: ${made.size} pages made`
  )
}
