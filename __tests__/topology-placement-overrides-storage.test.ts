/**
 * Engineer placement overrides — storage contract.
 *
 * An override is a human's claim about where a resource lives, kept only in the
 * browser. Two things must hold, and both are failure modes that would put a
 * chip somewhere nobody chose:
 *
 * 1. **A malformed entry is dropped, never repaired.** Hand-edited or
 *    stale-schema JSON must not become a placement by having its holes filled
 *    with defaults.
 * 2. **A scope's overrides are read and written only under that scope.** The
 *    host loads on scope change and persists on change in the same commit, so
 *    an unfenced persist writes the previous VPC's placements into the new
 *    VPC's key.
 */
import { beforeEach, describe, expect, it } from "vitest"
import {
  EMPTY_SCOPED_OVERRIDES,
  isAssignableTier,
  loadPlacementOverrides,
  loadScopedOverrides,
  persistScopedOverrides,
  placementOverrideStorageKey,
  readScopedOverrides,
  savePlacementOverrides,
  updateScopedOverrides,
  withPlacementOverride,
  withoutPlacementOverride,
  type PlacementOverride,
} from "@/components/topology-v0-2/placement-overrides"

const SYS = "cyntro-testbed"
const SCOPE = "416651950952:eu-west-1:vpc-0c39cde96f29f8f4e"
const OTHER_SCOPE = "416651950952:eu-west-1:vpc-0aaaaaaaaaaaaaaaa"
const VPC = "vpc-0c39cde96f29f8f4e"
const KEY = placementOverrideStorageKey(SYS, SCOPE)

const GOOD: PlacementOverride = {
  node_id: "i-0abc",
  vpc_id: VPC,
  az: "eu-west-1b",
  tier: "app",
  placed_at: "2026-09-09T21:24:00.000Z",
}

function writeRaw(value: unknown, key = KEY) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

beforeEach(() => window.localStorage.clear())

describe("isAssignableTier", () => {
  it("accepts the three real tiers and refuses anything else", () => {
    for (const t of ["web", "app", "data"]) expect(isAssignableTier(t)).toBe(true)
    // `unknown` is a tier a SUBNET can have; it is not a place to put something.
    for (const t of ["unknown", "ingress", "", "WEB", "database"]) {
      expect(isAssignableTier(t)).toBe(false)
    }
  })
})

describe("round trip", () => {
  it("saves and reloads a placement unchanged", () => {
    savePlacementOverrides(SYS, SCOPE, { [GOOD.node_id]: GOOD })
    expect(loadPlacementOverrides(SYS, SCOPE)).toEqual({ [GOOD.node_id]: GOOD })
  })

  it("keeps scopes apart — no bleed between VPCs of one account", () => {
    savePlacementOverrides(SYS, SCOPE, { [GOOD.node_id]: GOOD })
    expect(loadPlacementOverrides(SYS, OTHER_SCOPE)).toEqual({})
    expect(loadPlacementOverrides("other-system", SCOPE)).toEqual({})
  })

  it("removes the key entirely when the last placement is cleared", () => {
    savePlacementOverrides(SYS, SCOPE, { [GOOD.node_id]: GOOD })
    savePlacementOverrides(SYS, SCOPE, {})
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it("stamps placed_at itself so a caller cannot omit the provenance", () => {
    const at = new Date("2026-09-09T21:24:00.000Z")
    const next = withPlacementOverride({}, "i-1", VPC, "eu-west-1a", "data", at)
    expect(next["i-1"].placed_at).toBe(at.toISOString())
    expect(next["i-1"]).toEqual({
      node_id: "i-1",
      vpc_id: VPC,
      az: "eu-west-1a",
      tier: "data",
      placed_at: at.toISOString(),
    })
  })

  it("returns the same object when clearing a placement that was never made", () => {
    const before = { [GOOD.node_id]: GOOD }
    expect(withoutPlacementOverride(before, "i-never")).toBe(before)
    expect(withoutPlacementOverride(before, GOOD.node_id)).toEqual({})
  })
})

describe("a malformed entry is dropped, not repaired", () => {
  it.each([
    ["missing vpc_id", { node_id: "i-0abc", az: "eu-west-1b", tier: "app", placed_at: GOOD.placed_at }],
    ["empty vpc_id", { ...GOOD, vpc_id: "" }],
    ["missing az", { node_id: "i-0abc", vpc_id: VPC, tier: "app", placed_at: GOOD.placed_at }],
    ["unassignable tier", { ...GOOD, tier: "unknown" }],
    ["tier as a number", { ...GOOD, tier: 2 }],
    ["unparseable placed_at", { ...GOOD, placed_at: "whenever" }],
    ["missing placed_at", { node_id: "i-0abc", vpc_id: VPC, az: "eu-west-1b", tier: "app" }],
    ["node_id disagrees with its key", { ...GOOD, node_id: "i-somethingelse" }],
    ["not an object", "i-0abc"],
    ["null", null],
  ])("drops an entry with %s", (_label, entry) => {
    writeRaw({ "i-0abc": entry })
    expect(loadPlacementOverrides(SYS, SCOPE)).toEqual({})
  })

  it("keeps the good entries alongside a bad one, rather than failing the whole slot", () => {
    writeRaw({ "i-0abc": GOOD, "i-bad": { ...GOOD, node_id: "i-bad", tier: "unknown" } })
    expect(loadPlacementOverrides(SYS, SCOPE)).toEqual({ "i-0abc": GOOD })
  })

  it.each([
    ["unparseable JSON", "{not json"],
    ["a JSON array", "[]"],
    ["a JSON scalar", '"hello"'],
    ["null", "null"],
  ])("survives %s in the slot", (_label, raw) => {
    window.localStorage.setItem(KEY, raw)
    expect(loadPlacementOverrides(SYS, SCOPE)).toEqual({})
  })
})

describe("the scope fence", () => {
  it("loads with the scope stamped on the value", () => {
    savePlacementOverrides(SYS, SCOPE, { [GOOD.node_id]: GOOD })
    const state = loadScopedOverrides(SYS, SCOPE)
    expect(state.scope).toBe(KEY)
    expect(state.map).toEqual({ [GOOD.node_id]: GOOD })
  })

  it("reads nothing for a scope the value did not come from", () => {
    const state = loadScopedOverrides(SYS, SCOPE)
    expect(readScopedOverrides(state, SYS, SCOPE)).toBe(state.map)
    expect(readScopedOverrides(state, SYS, OTHER_SCOPE)).toEqual({})
    expect(readScopedOverrides(EMPTY_SCOPED_OVERRIDES, SYS, SCOPE)).toEqual({})
  })

  it("refuses to persist one scope's placements into another's key", () => {
    // The exact ordering bug: state still holds SCOPE's overrides while the
    // view has already switched to OTHER_SCOPE.
    const state = { scope: KEY, map: { [GOOD.node_id]: GOOD } }
    expect(persistScopedOverrides(state, SYS, OTHER_SCOPE)).toBe(false)
    expect(window.localStorage.getItem(placementOverrideStorageKey(SYS, OTHER_SCOPE))).toBeNull()
    expect(persistScopedOverrides(state, SYS, SCOPE)).toBe(true)
    expect(loadPlacementOverrides(SYS, SCOPE)).toEqual({ [GOOD.node_id]: GOOD })
  })

  it("refuses a mount-time persist that would wipe the stored slot", () => {
    // First commit: state is still EMPTY while the key already holds a
    // placement. An unfenced persist writes {} and removes the key.
    savePlacementOverrides(SYS, SCOPE, { [GOOD.node_id]: GOOD })
    expect(persistScopedOverrides(EMPTY_SCOPED_OVERRIDES, SYS, SCOPE)).toBe(false)
    expect(loadPlacementOverrides(SYS, SCOPE)).toEqual({ [GOOD.node_id]: GOOD })
  })

  it("applies a placement, and clears one, within the matching scope", () => {
    const at = new Date("2026-09-09T21:24:00.000Z")
    const loaded = loadScopedOverrides(SYS, SCOPE)
    const placed = updateScopedOverrides(loaded, SYS, SCOPE, "i-0abc", {
      vpc_id: VPC,
      az: "eu-west-1b",
      tier: "app",
    }, at)
    expect(placed.map).toEqual({ "i-0abc": GOOD })
    const cleared = updateScopedOverrides(placed, SYS, SCOPE, "i-0abc", null)
    expect(cleared.map).toEqual({})
  })

  it("drops a click that lands after a scope switch rather than mis-attributing it", () => {
    const loaded = loadScopedOverrides(SYS, SCOPE)
    const after = updateScopedOverrides(loaded, SYS, OTHER_SCOPE, "i-0abc", {
      vpc_id: VPC,
      az: "eu-west-1b",
      tier: "app",
    })
    expect(after).toBe(loaded)
    expect(after.map).toEqual({})
  })

  it("does not churn state when clearing a placement that was never made", () => {
    const loaded = loadScopedOverrides(SYS, SCOPE)
    expect(updateScopedOverrides(loaded, SYS, SCOPE, "i-never", null)).toBe(loaded)
  })
})
