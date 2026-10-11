import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleLocalApi } from '../../src/local-api'
import { HistoryReader } from '../../src/history/reader'
import { defaultHome } from '../../src/settings/home'

/**
 * The dev server also reads real history through the same /api as the desktop
 * app. (read-only, 127.0.0.1 only)
 */
function historyApi(): Plugin {
  return {
    name: 'pacenote-history-api',
    configureServer(server) {
      // PACENOTE_DATA_DIR, else the default home
      const raw = process.env.PACENOTE_DATA_DIR?.trim() || defaultHome()
      const root = raw.startsWith('~')
        ? path.join(homedir(), raw.slice(1))
        : raw
      const reader = new HistoryReader(path.resolve(root))
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        void handleLocalApi(
          reader,
          req.method ?? 'GET',
          new URL(req.url, 'http://127.0.0.1')
        )
          .then(async (response) => {
            res.statusCode = response.status
            response.headers.forEach((value, key) => res.setHeader(key, value))
            res.end(Buffer.from(await response.arrayBuffer()))
          })
          .catch(next)
      })
    },
  }
}

/** The app's version (the three package.json files are bumped together) */
const { version } = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
) as { version: string }

/**
 * Where the build stands in git when it is not exactly the release:
 * v0.3.9-3-g2034e74-dirty is 3 commits after v0.3.9, with uncommitted
 * changes. None for a build of the release tag, or without git or its tags.
 */
function gitDescribe(): string | undefined {
  try {
    const describe = execFileSync(
      'git',
      ['describe', '--tags', '--dirty', '--match', 'v*'],
      { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }
    )
      .toString()
      .trim()
    return describe === `v${version}` ? undefined : describe
  } catch {
    return undefined
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), historyApi()],
  define: {
    __PACENOTE_BUILD__: JSON.stringify({ version, describe: gitDescribe() }),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@history': path.resolve(__dirname, '../../src/history'),
      '@runtime': path.resolve(__dirname, '../../src/runtime'),
      '@src': path.resolve(__dirname, '../../src'),
    },
  },
  server: { host: '127.0.0.1', port: 5179, strictPort: true },
  // A single bundle is enough for a local desktop app.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
})
