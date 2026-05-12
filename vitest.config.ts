import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Minimal Vitest config: pure-function tests under __tests__/.
// No DOM (node env), no JSX, no Next/React integration — those would
// pull in jsdom/happy-dom and a much bigger dep tree. If component
// tests are added later, switch `environment` to 'happy-dom' (smaller
// + faster than jsdom) and add `setupFiles`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    // describe/it/expect available without import — keeps existing
    // sg-inspector.test.ts and the new instance-profile-routing tests
    // working with their Jest-style implicit globals.
    globals: true,
    // Existing tooling expects ts-only imports to resolve without a
    // separate Babel/SWC config — vite-node handles this natively.
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
