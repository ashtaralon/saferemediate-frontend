// gate-collapse — on an identity-only path (assume-chain / standing-access,
// shape B/C) there's no network hop to cross, so route_gate arrives UNKNOWN
// structurally. We collapse the network card and say "IAM is the only gate" —
// but ONLY when the gate carries no real signal. A concrete OPEN/CLOSED keeps
// the card even on B/C, and a compute path (A) always shows the network gate.

import { describe, it, expect } from "vitest"
import { isNetworkGateNA } from "@/components/attack-paths-v2/attack-path-card-light"

describe("isNetworkGateNA (gate-collapse)", () => {
  it("collapses on shape B with no/UNKNOWN network signal", () => {
    expect(isNetworkGateNA("B", "UNKNOWN")).toBe(true)
    expect(isNetworkGateNA("B", undefined)).toBe(true)
    expect(isNetworkGateNA("B", null)).toBe(true)
  })

  it("collapses on shape C with no/UNKNOWN network signal", () => {
    expect(isNetworkGateNA("C", "UNKNOWN")).toBe(true)
    expect(isNetworkGateNA("C", undefined)).toBe(true)
  })

  it("KEEPS the network card on B/C when the gate carries a real signal", () => {
    expect(isNetworkGateNA("B", "OPEN_OBSERVED")).toBe(false)
    expect(isNetworkGateNA("B", "OPEN_CONFIG")).toBe(false)
    expect(isNetworkGateNA("C", "CLOSED")).toBe(false)
  })

  it("never collapses on a compute path (shape A) — network is always a real check", () => {
    expect(isNetworkGateNA("A", "UNKNOWN")).toBe(false)
    expect(isNetworkGateNA("A", undefined)).toBe(false)
    expect(isNetworkGateNA(undefined, "UNKNOWN")).toBe(false)
  })
})
