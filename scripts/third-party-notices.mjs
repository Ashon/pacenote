import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Writes THIRD-PARTY-NOTICES.txt: the licenses of the third-party software
 * Pacenote ships, which they ask to travel with every copy.
 *
 *   node scripts/third-party-notices.mjs <out> [--swift]
 *
 * - The npm packages the bundles are built from: pnpm's production
 *   dependencies of the workspace, a superset of what the bundles keep
 * - What the web app bundles from its build tools: the Pretendard and Host
 *   Grotesk fonts and Tailwind CSS's styles
 * - With --swift, the Swift packages pacenote-vm is built from (apps/vm, after
 *   swift build has checked them out)
 *
 * Electron's own license and Chromium's notices ship beside it, as Electron
 * releases them (apps/desktop/scripts/package-mac.mjs).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RULE = '='.repeat(80)
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i

/** A package's license and notice files, at its root or in dist/ */
function licenseTexts(dir) {
  for (const sub of ['', 'dist']) {
    const at = path.join(dir, sub)
    if (!existsSync(at)) continue
    const files = readdirSync(at)
      .filter((name) => LICENSE_FILE.test(name))
      .sort()
    if (files.length > 0)
      return files.map((name) =>
        readFileSync(path.join(at, name), 'utf8').trim()
      )
  }
  return []
}

/** The workspace's production npm packages, by name */
function npmPackages() {
  const listed = JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  )
  return Object.values(listed)
    .flat()
    .map((pkg) => ({
      name: pkg.name,
      version: pkg.versions.join(', '),
      license: pkg.license,
      homepage: pkg.homepage,
      dir: pkg.paths[0],
    }))
}

/** What the web app bundles from packages it only builds with */
function webAssets() {
  const requireWeb = createRequire(path.join(root, 'apps/web/package.json'))
  return [
    'pretendard',
    '@fontsource-variable/host-grotesk',
    'tailwindcss',
    '@tailwindcss/typography',
  ].map((name) => {
    const manifest = requireWeb.resolve(`${name}/package.json`)
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    return {
      name,
      version: pkg.version,
      license: pkg.license,
      homepage: pkg.homepage,
      dir: path.dirname(manifest),
    }
  })
}

/** The Swift packages pacenote-vm pins, from swift build's checkouts */
function swiftPackages() {
  const vm = path.join(root, 'apps/vm')
  const { pins } = JSON.parse(
    readFileSync(path.join(vm, 'Package.resolved'), 'utf8')
  )
  return pins.map((pin) => {
    const dir = path.join(vm, '.build/checkouts', pin.identity)
    if (!existsSync(dir))
      throw new Error(
        `${pin.identity} is not checked out: build pacenote-vm first (swift build in apps/vm).`
      )
    return {
      name: pin.identity,
      version: pin.state.version ?? pin.state.revision,
      license: undefined,
      homepage: pin.location.replace(/\.git$/, ''),
      dir,
    }
  })
}

export function thirdPartyNotices({ swift = false } = {}) {
  const { version } = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8')
  )
  const packages = [
    ...npmPackages(),
    ...webAssets(),
    ...(swift ? swiftPackages() : []),
  ]
    .filter(
      (pkg, index, all) =>
        all.findIndex((other) => other.name === pkg.name) === index
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const sections = packages.map((pkg) => {
    const texts = licenseTexts(pkg.dir)
    return [
      RULE,
      `${pkg.name} ${pkg.version}${pkg.license ? ` (${pkg.license})` : ''}`,
      ...(pkg.homepage ? [pkg.homepage] : []),
      RULE,
      '',
      texts.length > 0
        ? texts.join(`\n\n${'-'.repeat(80)}\n\n`)
        : `Licensed under ${pkg.license ?? 'its own license'}; the package has no license file.`,
      '',
    ].join('\n')
  })
  return [
    `Third-party notices for Pacenote ${version}`,
    '',
    'Pacenote is licensed under the Apache License 2.0 (LICENSE). It includes the',
    'software and assets below, each under its own license. The desktop app also',
    "includes Electron, whose license and Chromium's notices are in",
    'LICENSE.electron.txt and LICENSES.chromium.html beside this file.',
    '',
    ...sections,
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  if (!out) {
    console.error('Usage: node scripts/third-party-notices.mjs <out> [--swift]')
    process.exit(2)
  }
  writeFileSync(
    out,
    `${thirdPartyNotices({ swift: process.argv.includes('--swift') })}\n`
  )
  console.log(out)
}
