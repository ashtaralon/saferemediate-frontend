import path from "node:path"
import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: [
      "__tests__/**/*.test.ts",
      "__tests__/**/*.test.tsx",
      "tests/integration/**/*.spec.ts",
    ],
    exclude: [
      ...configDefaults.exclude,
      "tests/integration/**/*-live.spec.ts",
      "tests/integration/**/ac1_capital_one_e2e.spec.ts",
    ],
    globals: true,
    setupFiles: ["./__tests__/setup.ts"],
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
})
