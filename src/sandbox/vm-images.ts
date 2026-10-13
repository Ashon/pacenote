import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The built-in VM sandbox's images, as recipes: the script each build runs
 * with which files of sandbox/vm, the versions it pins, and the settings the
 * image keeps. The setup builds them (vm-setup.ts), and each image keeps its
 * recipe's hash, so an image built from another recipe, by an older Pacenote,
 * shows as out of date (vm.ts) until the setup builds it again.
 */

/** The reasoner image, which runs use */
export const VM_IMAGE = 'reasoner'
/** The diagram renderer's image, built when diagrams are on */
export const VM_RENDERER_IMAGE = 'renderer'
/** The broker's image, built when ops tools are on */
export const VM_BROKER_IMAGE = 'broker'

/**
 * What goes into the images. The CLIs are the ones the sandbox runs: bump them
 * with the host CLIs, and existing images show as out of date until the
 * built-in sandbox is set up again.
 */
export const VERSIONS = {
  claude: '2.1.296',
  codex: '0.162.1',
  kubectl: 'v1.37.0',
  mermaidCli: '12.0.0',
  vlConvert: '1.9.0.post1',
  pillow: '12.3.0',
  /** The diagrams' typeface, as the app's (apps/web/src/index.css) */
  pretendard: '1.3.9',
}

/** What the images are built on */
export const VM_BASE_IMAGE = 'docker.io/library/node:24-bookworm-slim'
/** Where the image build may go: Debian's and npm's package hosts */
export const BUILD_DOMAINS = ['deb.debian.org', 'registry.npmjs.org']
/** The renderer's build: those, and Python's packages */
export const RENDERER_BUILD_DOMAINS = [
  ...BUILD_DOMAINS,
  'pypi.org',
  'files.pythonhosted.org',
]
/** The broker image's build: Debian's packages and kubectl's downloads */
export const BROKER_BUILD_DOMAINS = [
  'deb.debian.org',
  'dl.k8s.io',
  'cdn.dl.k8s.io',
]

/** pacenote-vm build options: the reasoner image's settings from then on */
export const VM_IMAGE_SETTINGS = [
  '--set-user',
  '1000:1000',
  '--set-workdir',
  '/work',
  '--set-entrypoint',
  '/usr/local/bin/sandbox-entrypoint',
  ...[
    'HOME=/home/node',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
    'DISABLE_AUTOUPDATER=1',
    'HTTPS_PROXY=http://127.0.0.1:3128',
    'HTTP_PROXY=http://127.0.0.1:3128',
    'NO_PROXY=localhost,127.0.0.1',
  ].flatMap((entry) => ['--set-env', entry]),
]

/** The label (pacenote-vm build --label) an image keeps its recipe's hash in */
export const RECIPE_LABEL = 'pacenote.recipe'

export interface ImageRecipe {
  /** What the setup's log and the check issues call it */
  title: string
  /** The pinned versions, for the setup's log */
  versions: string
  /** The build script in sandbox/vm, run as root on the base image */
  script: string
  /** The other files of sandbox/vm the script installs */
  files: string[]
  /** pacenote-vm build options: the image's settings from then on */
  settings: string[]
  /** The pinned versions, passed to the script */
  env: Record<string, string>
  /** Where the build may go */
  domains: string[]
  /** The build VM's memory, in MiB */
  memoryMiB: number
}

export const IMAGE_RECIPES: Record<string, ImageRecipe> = {
  [VM_IMAGE]: {
    title: 'Reasoner image',
    versions: `claude ${VERSIONS.claude} and codex ${VERSIONS.codex}`,
    script: 'build.sh',
    files: ['egress.sh', 'egress-forward.mjs', 'entrypoint.sh'],
    settings: VM_IMAGE_SETTINGS,
    env: {
      CLAUDE_CODE_VERSION: VERSIONS.claude,
      CODEX_VERSION: VERSIONS.codex,
    },
    domains: BUILD_DOMAINS,
    memoryMiB: 4096,
  },
  [VM_RENDERER_IMAGE]: {
    title: 'Diagram renderer image',
    versions: `mermaid-cli ${VERSIONS.mermaidCli} and Pretendard ${VERSIONS.pretendard}`,
    script: 'renderer-build.sh',
    files: [
      'egress.sh',
      'egress-forward.mjs',
      'renderer/render.sh',
      'renderer/mermaid.json',
      'renderer/vega-lite.json',
      'renderer/dot.gvpr',
      'renderer/puppeteer.json',
    ],
    settings: [
      '--set-user',
      '1000:1000',
      '--set-workdir',
      '/work',
      // The format is the run's command: render mermaid IN OUT
      '--set-entrypoint',
      '/usr/local/bin/render',
      '--set-env',
      'HOME=/tmp/home',
      '--set-env',
      'PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium',
    ],
    env: {
      MERMAID_CLI_VERSION: VERSIONS.mermaidCli,
      VL_CONVERT_VERSION: VERSIONS.vlConvert,
      PILLOW_VERSION: VERSIONS.pillow,
      PRETENDARD_VERSION: VERSIONS.pretendard,
    },
    domains: RENDERER_BUILD_DOMAINS,
    memoryMiB: 4096,
  },
  [VM_BROKER_IMAGE]: {
    title: 'Ops broker image',
    versions: `kubectl ${VERSIONS.kubectl}`,
    script: 'broker-build.sh',
    files: [
      'egress.sh',
      'egress-forward.mjs',
      'proxy-connect.mjs',
      'entrypoint.sh',
    ],
    settings: [
      '--set-user',
      '1000:1000',
      '--set-workdir',
      '/app',
      '--set-entrypoint',
      '/usr/local/bin/sandbox-entrypoint',
      '--set-env',
      'HOME=/tmp',
    ],
    env: { KUBECTL_VERSION: VERSIONS.kubectl },
    domains: BROKER_BUILD_DOMAINS,
    memoryMiB: 2048,
  },
}

/**
 * The hash of an image's recipe: the base, the script, the settings and
 * versions, and the content of the files of sandbox/vm it uses. sandboxDir is
 * the repository's (or the app's) sandbox folder.
 */
export function recipeHash(name: string, sandboxDir: string): string {
  const recipe = IMAGE_RECIPES[name]
  if (!recipe) throw new Error(`No recipe for the image ${name}.`)
  const hash = createHash('sha256').update(
    JSON.stringify({
      base: VM_BASE_IMAGE,
      script: recipe.script,
      settings: recipe.settings,
      env: recipe.env,
    })
  )
  for (const file of [recipe.script, ...recipe.files].sort())
    hash
      .update(`\0${file}\0`)
      .update(readFileSync(path.join(sandboxDir, 'vm', file)))
  return hash.digest('hex')
}

/**
 * Whether an image was built from this Pacenote's recipe, from the labels it
 * keeps. When the recipe cannot be read (no sandbox folder, an image that has
 * none), there is nothing to compare, and the image counts as current.
 */
export function imageCurrent(
  name: string,
  labels: Record<string, string> | undefined,
  sandboxDir: string | undefined
): boolean {
  if (!sandboxDir) return true
  let expected: string
  try {
    expected = recipeHash(name, sandboxDir)
  } catch {
    return true
  }
  return labels?.[RECIPE_LABEL] === expected
}
