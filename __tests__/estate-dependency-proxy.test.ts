import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "..")

describe("Estate dependency-map production contract", () => {
  it("uses the canonical backend resolver and surfaces snapshot provenance", () => {
    const route = fs.readFileSync(
      path.join(ROOT, "app/api/proxy/dependency-map/full/route.ts"),
      "utf8",
    )

    expect(route).toContain("getBackendBaseUrl()")
    expect(route).toContain('"X-Upstream-Duration-Ms"')
    expect(route).toContain('"X-Data-Source"')
    expect(route).toContain("data.from_snapshot")
    expect(route).toContain("data.fromStaleCache")
  })

  it("marks stale flow evidence without changing the topology layout", () => {
    const view = fs.readFileSync(
      path.join(ROOT, "components/topology-v0-2/estate-map-view.tsx"),
      "utf8",
    )

    expect(view).toContain('data-testid="estate-flow-evidence-stale"')
    expect(view).toContain("Flow evidence stale")
    expect(view).toContain('role="status"')
    expect(view).toContain("depMapIsStale")
    expect(view).toContain("depMapCachedAt")
  })
})
