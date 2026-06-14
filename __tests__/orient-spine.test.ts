// orientSpine — the hero-map spine re-anchor (BE-9). The facade sometimes
// serializes an assume-chain jewel-first / source-not-first, which would draw
// the attacker "entering" at the crown jewel, contradicting the card's own
// lede. orientSpine pulls the source to the head and the jewel to the tail and
// re-derives display tiers from position. These cases mirror the live
// alon-prod assume-chain (pivot → treasury → prod-data).

import { describe, it, expect } from "vitest"
import { orientSpine } from "@/components/attack-paths-v2/attack-path-map-light"
import type { PathNodeDetail } from "@/components/identity-attack-paths/types"

function nd(id: string, name: string, tier: PathNodeDetail["tier"]): PathNodeDetail {
  return {
    id,
    name,
    type: tier === "crown_jewel" ? "S3Bucket" : tier === "entry" ? "IAMRole" : "IAMRole",
    tier,
  } as unknown as PathNodeDetail
}

describe("orientSpine", () => {
  it("returns spines shorter than 2 untouched", () => {
    const one = [nd("a", "only", "entry")]
    expect(orientSpine(one, "only", "x")).toBe(one)
    expect(orientSpine([], null, null)).toEqual([])
  })

  it("leaves a well-ordered Shape-A chain (source already first) untouched", () => {
    const spine = [
      nd("ec2", "cyntro-web-server", "entry"),
      nd("role", "alon-demo-ec2-role", "identity"),
      nd("jewel", "saferemediate-logs", "crown_jewel"),
    ]
    const out = orientSpine(spine, "cyntro-web-server", "saferemediate-logs")
    expect(out).toBe(spine) // identity — no reorder
    expect(out.map((n) => n.name)).toEqual([
      "cyntro-web-server",
      "alon-demo-ec2-role",
      "saferemediate-logs",
    ])
  })

  it("jewel-already-last but source not first: re-anchors source to head (the BE-9 case)", () => {
    // Serialized treasury(entry) → pivot(identity) → prod-data(jewel), but the
    // real story is pivot enters and assumes treasury. src=pivot, tgt=prod-data.
    const spine = [
      nd("treasury", "cyntro-demo-treasury", "entry"),
      nd("pivot", "cyntro-demo-pivot", "identity"),
      nd("jewel", "prod-data", "crown_jewel"),
    ]
    const out = orientSpine(spine, "cyntro-demo-pivot", "prod-data")
    expect(out.map((n) => n.name)).toEqual([
      "cyntro-demo-pivot",
      "cyntro-demo-treasury",
      "prod-data",
    ])
    // Tiers re-derived from position: head=entry, middle=identity, tail=jewel.
    expect(out.map((n) => n.tier)).toEqual(["entry", "identity", "crown_jewel"])
  })

  it("reverses a clearly jewel-first array when the source is unknown", () => {
    const spine = [
      nd("jewel", "prod-data", "crown_jewel"),
      nd("mid", "cyntro-demo-treasury", "identity"),
      nd("entry", "cyntro-demo-pivot", "entry"),
    ]
    const out = orientSpine(spine, "no-such-source", "prod-data")
    expect(out.map((n) => n.name)).toEqual([
      "cyntro-demo-pivot",
      "cyntro-demo-treasury",
      "prod-data",
    ])
  })

  it("does not touch an unrecognizable spine (source unknown, not jewel-first)", () => {
    const spine = [
      nd("a", "node-a", "identity"),
      nd("b", "node-b", "identity"),
      nd("c", "node-c", "identity"),
    ]
    const out = orientSpine(spine, "no-such-source", "no-such-target")
    expect(out).toBe(spine)
  })

  it("keeps the crown jewel on the tail even when source equals jewel index edge case", () => {
    // jewelIdx falls through to last; src matches head → already well-ordered.
    const spine = [
      nd("src", "entry-role", "entry"),
      nd("jewel", "prod-data", "crown_jewel"),
    ]
    const out = orientSpine(spine, "entry-role", "prod-data")
    expect(out.map((n) => n.name)).toEqual(["entry-role", "prod-data"])
  })
})
