import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Unit tests (pnpm test), in two projects:
 * - unit: tests/*.test.ts in Node, for the bot, the hub, the desktop app's
 *   main process and the screen's plain helpers
 * - web: the screen's components (apps/web/src/**\/*.test.tsx) in happy-dom,
 *   with React and Testing Library from the web app's own packages
 * Both resolve the screen's aliases as its Vite config does, so a test loads
 * any of its modules. pnpm test:coverage adds the coverage of src and both
 * apps, and fails below the floors set here (raise them as tests are added;
 * never lower them to pass).
 * The end-to-end tests have their own config (vitest.e2e.config.ts).
 */
const root = import.meta.dirname
const web = path.join(root, 'apps/web')
const alias = {
  '@': path.join(web, 'src'),
  '@history': path.join(root, 'src/history'),
  '@runtime': path.join(root, 'src/runtime'),
  '@src': path.join(root, 'src'),
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: 'unit', include: ['tests/**/*.test.ts'] },
      },
      {
        root: web,
        resolve: { alias },
        define: {
          __PACENOTE_BUILD__: JSON.stringify({ version: '0.0.0-test' }),
        },
        test: {
          name: 'web',
          include: ['src/**/*.test.tsx'],
          environment: 'happy-dom',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.ts',
        'apps/desktop/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.d.ts', '**/*.test.{ts,tsx}'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage/unit',
      thresholds: { lines: 60, statements: 59, branches: 50, functions: 48 },
    },
  },
})
