import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

describe("Neptune-only frontend graph boundary", () => {
  it("does not expose direct Neo4j database routes", () => {
    for (const route of [
      "app/api/neo4j/query/route.ts",
      "app/api/neo4j/graph/route.ts",
      "app/api/proxy/neo4j/query/route.ts",
    ]) {
      expect(existsSync(join(root, route)), route).toBe(false)
    }
  })

  it("loads the dependency data view through the Neptune path", () => {
    const source = readFileSync(
      join(root, "components/dependency-map-tab.tsx"),
      "utf8",
    )
    expect(source).toContain("./dependency-map/neptune-data-view")
    expect(source).not.toContain("./dependency-map/neo4j-data-view")
  })
})
