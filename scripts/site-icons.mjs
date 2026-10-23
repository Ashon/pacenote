import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Writes site/icons.svg: the lucide icons pacenote.dev's drawings of the app
 * use, as one sprite of <symbol>s, taken from the web app's own lucide-react
 * so the site draws the same icons the app does, and lucide's ISC license
 * beside it (site/icons-LICENSE.txt).
 *
 *   node scripts/site-icons.mjs
 *
 * A page uses one as <svg class="av-i"><use href="icons.svg#name"/></svg>;
 * tests/site.test.ts checks that every one it names is in the sprite.
 */
const ICONS = [
  'arrow-right',
  'arrow-right-left',
  'at-sign',
  'bot',
  'calendar-check',
  'chevron-down',
  'chevron-right',
  'circle-check',
  'clock',
  'coins',
  'copy',
  'cpu',
  'ellipsis',
  'external-link',
  'folder-open',
  'history',
  'key-round',
  'laptop',
  'layout-dashboard',
  'list-checks',
  'loader-circle',
  'lock',
  'message-square',
  'panel-left',
  'plug',
  'refresh-cw',
  'rotate-cw',
  'search',
  'server',
  'settings',
  'square-terminal',
  'timer',
  'undo-2',
  'user-round',
  'wrench',
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'))
const lucide = path.dirname(requireWeb.resolve('lucide-react/package.json'))
const { version } = JSON.parse(
  readFileSync(path.join(lucide, 'package.json'), 'utf8')
)

// On each symbol as well as the sprite: what <use> draws inherits from the
// page that uses it, not from the sprite's root
const STROKE =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

const attr = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

const symbols = ICONS.map((name) => {
  const source = readFileSync(
    path.join(lucide, 'dist/esm/icons', `${name}.js`),
    'utf8'
  )
  const literal = source.match(/const __iconNode = (\[[\s\S]*?\]);\n/)
  if (!literal) throw new Error(`${name}: no icon nodes in lucide-react`)
  // The node list is a plain literal of [tag, attributes] pairs
  const nodes = new Function(`return ${literal[1]}`)()
  const children = nodes
    .map(([tag, attributes]) => {
      const pairs = Object.entries(attributes)
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${key}="${attr(value)}"`)
      return `<${tag} ${pairs.join(' ')}/>`
    })
    .join('')
  return `  <symbol id="${name}" viewBox="0 0 24 24" ${STROKE}>${children}</symbol>`
})

const out = path.join(root, 'site/icons.svg')
writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" ${STROKE}>
  <!-- lucide ${version}, ISC license in icons-LICENSE.txt; written by scripts/site-icons.mjs -->
${symbols.join('\n')}
</svg>
`
)
writeFileSync(
  path.join(root, 'site/icons-LICENSE.txt'),
  readFileSync(path.join(lucide, 'LICENSE'), 'utf8')
)
console.log(`wrote ${path.relative(root, out)}: ${ICONS.length} icons`)
