import { configDefaults, defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest config: pure-function tests + a small set of component
// render-smoke tests under __tests__/. happy-dom is used (rather than
// jsdom) for its smaller footprint; existing pure-function tests
// (sg-inspector, instance-profile-routing) are env-agnostic and run
// fine under it.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: [
      '__tests__/**/*.test.ts',
      '__tests__/**/*.test.tsx',
      // Vitest integration specs only (bulk-iam-sg-fallback.spec.ts,
      // canvas-canonical-id-live.vitest.spec.ts) — the Playwright ones in the
      // same dir are removed below.
      'tests/integration/**/*.spec.ts',
    ],
    // tests/integration mixes two runners. The PLAYWRIGHT specs import
    // @playwright/test + call test.describe() and run via `playwright test`
    // (playwright.config.ts, testMatch: "*-live.spec.ts"); vitest CANNOT run
    // them ("Playwright Test did not expect test.describe() to be called
    // here"). Exclude those (12 *-live.spec.ts + the legacy ac1 e2e) so vitest
    // runs only the real vitest integration specs.
    exclude: [
      ...configDefaults.exclude,
      'tests/integration/**/*-live.spec.ts',
      'tests/integration/**/ac1_capital_one_e2e.spec.ts',
    ],
    // describe/it/expect available without import — keeps existing
    // sg-inspector.test.ts and the new instance-profile-routing tests
    // working with their Jest-style implicit globals.
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    reporters: ['default'],
  },
  resolve: {
    // Match the Next.js path alias so tests can `import "@/lib/..."`
    // the same way components do.
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
