import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"


describe("estate map traffic payload wiring", () => {
  it("merges current scoped traffic with the unscoped Compare snapshot", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/topology-v0-2/estate-map-view.tsx"),
      "utf8",
    )

    expect(source).toContain("mergeTrafficEdges(")
    expect(source).toContain("data?.traffic_edges ?? []")
    expect(source).toContain("fullSystemPayload?.traffic_edges ?? []")
    expect(source).not.toContain("trafficEdges: source.traffic_edges ?? []")
  })
})
