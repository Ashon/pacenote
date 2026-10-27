// The types of site-pages.mjs, for the tests that build the site with it.

export interface BuiltPage {
  lang: 'en' | 'ko'
  /** The same page in the other language, as a site path */
  pair?: string
  /** In the sitemap */
  listed: boolean
  html: string
}

/**
 * Writes pacenote.dev into out: site/ as it is, the pages made from docs/,
 * the sitemap and the feeds. releases is a file of the released versions as
 * JSON lines of { tag, date }; without it, the repository's version tags.
 */
export function buildSite(options: {
  root: string
  out: string
  releases?: string
}): Map<string, BuiltPage>

/** The markdown the guide and the news use, as HTML */
export function renderMarkdown(
  text: string,
  options: {
    link?: (href: string) => string
    shot?: (name: string, alt: string) => string
    command?: (source: string) => string
  }
): string
