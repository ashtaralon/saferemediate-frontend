/// <reference types="vitest/globals" />
/**
 * The network view opens on Dependencies.
 *
 * The map exists to show what actually talks to what. Opening on Architecture
 * put every edge behind a second click, so the first frame -- the one a
 * screenshot, a shared link, and a skimming operator all get -- answered a
 * question nobody asked.
 *
 * This is asserted against the SOURCE rather than a render because nothing
 * mounts `EstateMapView` in vitest: it resolves the product scope, the scoped
 * catalog and topology-risk before it mounts, so a render here would prove the
 * fetch mocks, not the default. The Chromium spec proves the rendered toggle;
 * this pins the seed the toggle reads, which is where the divergence lived --
 * `AwsFrame` already defaulted to `all_access`, and only this state seed said
 * otherwise.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { ALL_ACCESS_EDGE_TYPES } from "@/components/topology-v0-2/estate-flow-edges"

const VIEW = resolve(__dirname, "../components/topology-v0-2/estate-map-view.tsx")
const FRAME = resolve(__dirname, "../components/topology-v0-2/aws-frame.tsx")

/** Strip block comments so prose about a default is never mistaken for one.
 *  Replacing each comment with same-length whitespace keeps every other
 *  offset and line intact. */
function code(path: string): string {
  const raw = readFileSync(path, "utf8")
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
  // Self-check: stripping must remove only comments, never code.
  expect(stripped.length).toBe(raw.length)
  expect(stripped.split("\n").length).toBe(raw.split("\n").length)
  return stripped
}

describe("estate map default lens", () => {
  it("seeds the page lens to Dependencies, not Architecture", () => {
    const source = code(VIEW)
    expect(source).toContain('defaultFlowMode = "all_access"')
    expect(source).not.toContain('defaultFlowMode = "architecture"')
  })

  it("agrees with the frame's own default, so the two cannot drift apart", () => {
    // The bug this replaces was exactly a disagreement between these two.
    expect(code(FRAME)).toContain('flowMode = "all_access"')
  })

  it("leaves the focused security surface on attack paths", () => {
    // Blast radius passes the prop explicitly; the new page default must not
    // silently take that surface over.
    const blast = code(resolve(__dirname, "../components/business-system/blast-radius-view.tsx"))
    expect(blast).toContain('defaultFlowMode="attack_paths"')
  })

  it("the Dependencies lens still has edge types to draw", () => {
    // A default pointing at an empty selector would render a blank first frame.
    // It is a Set, not an array -- `.length` here would read undefined and
    // the assertion would fail rather than guard anything.
    expect(ALL_ACCESS_EDGE_TYPES.size).toBeGreaterThan(0)
  })
})
