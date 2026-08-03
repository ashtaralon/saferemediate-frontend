import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..", "..")
const cockpit = readFileSync(join(root, "components/dashboard/v3/executive-cockpit.tsx"), "utf8")
const contract = readFileSync(join(root, "lib/executive-snapshot.ts"), "utf8")

describe("ExecutiveCockpit — Neo4j-backed honesty", () => {
  it("declares Neo4j as the snapshot source", () => {
    expect(contract).toContain('source: "neo4j"')
    expect(cockpit).toContain("Neo4j graph snapshot")
  })

  it("does not contain customer-specific or mock values", () => {
    expect(cockpit).not.toMatch(/alon-prod|demo-system|mockSystems|fakeSystems/)
  })

  it("keeps unknown metrics unknown", () => {
    expect(cockpit).toContain('if (value === null) return "—"')
    expect(cockpit).not.toMatch(/\?\?\s*0/)
    expect(cockpit).not.toContain("outcomes.window_days || 7")
  })

  it("labels the proposed-change count as page-scoped", () => {
    expect(cockpit).toMatch(/reviewed page/i)
    expect(contract).toContain('count_scope?: "returned_page"')
  })
})
