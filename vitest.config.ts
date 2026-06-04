import { defineConfig } from 'vitest/config'
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
      'tests/integration/**/*.spec.ts',
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
