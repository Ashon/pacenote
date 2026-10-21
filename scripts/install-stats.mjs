// One line a day for the install-stats workflow: how many install Pacenote, as
// far as public numbers tell. The app itself reports nothing.
// - brew_30d, brew_90d, brew_365d: new installs of the cask in Homebrew's own
//   analytics (formulae.brew.sh), from those who leave them on; upgrades are
//   not counted, and Homebrew keeps only these rolling totals
// - downloads: downloads of every release's zip, installs and upgrades alike
// - latest, latest_downloads: the newest release and its zip's downloads
// Usage: node scripts/install-stats.mjs <installs.csv>. A second run on the
// same day replaces that day's line.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const CASK = 'ashon/tap/pacenote'
const REPO = 'Ashon/pacenote'
const HEADER =
  'date,brew_30d,brew_90d,brew_365d,downloads,latest,latest_downloads'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/install-stats.mjs <installs.csv>')
  process.exit(2)
}

async function json(url, headers = {}) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.json()
}

/** New installs of the cask in a period; one with none is not listed */
async function brewInstalls(period) {
  const { items } = await json(
    `https://formulae.brew.sh/api/analytics/cask-install/${period}.json`
  )
  const item = items.find((entry) => entry.cask === CASK)
  return item ? Number(item.count.replaceAll(',', '')) : 0
}

const github = {
  Accept: 'application/vnd.github+json',
  ...(process.env.GITHUB_TOKEN && {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  }),
}

/** Every published release, newest first */
async function releases() {
  const all = []
  for (let page = 1; ; page++) {
    const batch = await json(
      `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,
      github
    )
    all.push(...batch.filter((release) => !release.draft))
    if (batch.length < 100) return all
  }
}

const zipDownloads = (release) =>
  release.assets
    .filter((asset) => asset.name.endsWith('.zip'))
    .reduce((sum, asset) => sum + asset.download_count, 0)

const [brew30, brew90, brew365, published] = await Promise.all([
  brewInstalls('30d'),
  brewInstalls('90d'),
  brewInstalls('365d'),
  releases(),
])
const latest = published.find((release) => !release.prerelease)
const date = new Date().toISOString().slice(0, 10)
const line = [
  date,
  brew30,
  brew90,
  brew365,
  published.reduce((sum, release) => sum + zipDownloads(release), 0),
  latest?.tag_name ?? '',
  latest ? zipDownloads(latest) : 0,
].join(',')

const lines = existsSync(file)
  ? readFileSync(file, 'utf8').trimEnd().split('\n')
  : [HEADER]
if (lines.at(-1).startsWith(`${date},`)) lines.pop()
lines.push(line)
writeFileSync(file, `${lines.join('\n')}\n`)
console.log(line)
