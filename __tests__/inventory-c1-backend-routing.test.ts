/// <reference types="vitest/globals" />
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Source-level guard: Vercel may retain a public build-time backend URL from
// the legacy service. C1 runtime routes must resolve the same destination as
// /api/proxy/meta, using the server-owned resolver and its explicit override.
const ROUTES = [
  "app/api/proxy/system-resources/[systemName]/route.ts",
  "app/api/proxy/decision-coverage/system/[system]/route.ts",
  "app/api/proxy/decision-coverage/resource/[neo4jLabel]/[resourceId]/route.ts",
] as const

describe("C1 inventory/readiness routes use a single backend authority", () => {
  for (const path of ROUTES) {
    it(path, () => {
      const source = readFileSync(join(process.cwd(), path), "utf8")
      expect(source).toContain('from "@/lib/server/backend-url"')
      expect(source).toMatch(/const BACKEND_URL = getBackendBaseUrl\(\)/)
      expect(source).not.toContain("process.env.NEXT_PUBLIC_BACKEND_URL")
    })
  }
})
