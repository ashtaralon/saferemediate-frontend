import { describe, expect, it } from "vitest"

import { ESTATE_TOPOLOGY_TAB, estateSurfaceInitialTab } from "@/lib/estate-surface-deep-link"

describe("Estate surface deep link", () => {
  it("opens the Topology leaf for an addressable Estate surface", () => {
    // EstateMapView reads ?surface= itself, but it only mounts under this leaf.
    expect(estateSurfaceInitialTab("identity")).toBe(ESTATE_TOPOLOGY_TAB)
    expect(estateSurfaceInitialTab("map")).toBe(ESTATE_TOPOLOGY_TAB)
    expect(ESTATE_TOPOLOGY_TAB).toBe("dependency-map")
  })

  it("selects no tab for an absent or unrecognised surface", () => {
    for (const value of [null, undefined, "", "overview", "identity ", "IDENTITY", "attack-paths"]) {
      expect(estateSurfaceInitialTab(value)).toBeUndefined()
    }
  })
})
