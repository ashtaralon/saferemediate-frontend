/**
 * Posture must reach EVERY view that has path DTOs, not just the Zoom-0 fan-in.
 *
 * PR #465 derived the posture inside `buildPathAuthorityArchitecture`, which
 * only runs for `pathAuthorityOnly`. Production on 2026-07-30 showed the gap:
 * the attacker map rendered `data-network-banner="path-scoped"` with a NULL
 * reason, meaning it fell through to the renderer's `?? true` default instead of
 * reading a derived posture — so a path with pending hops was still described as
 * having no network hops there.
 */
import { describe, expect, it } from "vitest"
import {
  attachLoadStatePosture,
  attachNetworkPosture,
  type PostureBearing,
} from "@/lib/attack-paths/attach-network-posture"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

function path(overrides: Partial<ConvergencePath>): ConvergencePath {
  return {
    path_id: "p1",
    damage: [],
    score: 50,
    confidence: "configured",
    hop_count: 2,
    hops: [],
    ...overrides,
  } as ConvergencePath
}

/** Stand-in for the fetched dependency-map architecture.
 *
 * Annotated rather than left as a bare literal: TS2559 rejects an object
 * literal with "no properties in common" against a type whose only member is
 * optional, so an un-annotated fixture fails to typecheck even though the call
 * is valid. */
type FakeArch = PostureBearing & {
  subnets: unknown[]
  securityGroups: unknown[]
  nacls: unknown[]
  resources?: unknown[]
  marker?: number
}
const arch = (): FakeArch => ({ subnets: [], securityGroups: [], nacls: [] })

describe("attachNetworkPosture", () => {
  it("derives a posture for a non-fan-in architecture", () => {
    const out = attachNetworkPosture(
      arch(),
      [path({ hops_load_state: "ready" })],
      "p1",
    )
    expect(out.networkPosture).toEqual({ settled: true, reason: "hops_ready" })
  })

  it("carries the un-hydrated state through — the whole point", () => {
    const out = attachNetworkPosture(
      arch(),
      [path({ hops_load_state: "pending" })],
      "p1",
    )
    expect(out.networkPosture).toEqual({
      settled: false,
      reason: "hops_pending",
    })
  })

  it("fails closed when hops_load_state is absent", () => {
    const out = attachNetworkPosture(arch(), [path({})], "p1")
    expect(out.networkPosture?.settled).toBe(false)
    expect(out.networkPosture?.reason).toBe("hops_state_absent")
  })

  // ── must not clobber, must not invent ────────────────────────────────────

  it("never overwrites a posture the fan-in builder already derived", () => {
    // Both call the same derivation, so clobbering would make the result depend
    // on call order for no benefit.
    const existing = { settled: true, reason: "hops_ready" }
    const out = attachNetworkPosture(
      { ...arch(), networkPosture: existing },
      [path({ hops_load_state: "pending" })],
      "p1",
    )
    expect(out.networkPosture).toBe(existing)
  })

  it("leaves the architecture untouched when there are no path DTOs", () => {
    // An estate map with nothing selected has no path evidence at all; the
    // renderer's own default governs there.
    const input = arch()
    expect(attachNetworkPosture(input, [], null)).toBe(input)
    expect(attachNetworkPosture(input, null, null)).toBe(input)
    expect(attachNetworkPosture(input, undefined, null)).toBe(input)
  })

  it("does not mutate the input architecture", () => {
    const input = arch()
    attachNetworkPosture(input, [path({ hops_load_state: "pending" })], "p1")
    expect("networkPosture" in input).toBe(false)
  })

  // ── lane agreement: the posture must describe the paths being DRAWN ──────

  it("scopes to the pinned path, not every path in the fan-in", () => {
    // Pinning p1 (ready) must not inherit p2's pending state — the posture has
    // to describe the lane on screen.
    const out = attachNetworkPosture(
      arch(),
      [
        path({ path_id: "p1", hops_load_state: "ready" }),
        path({ path_id: "p2", hops_load_state: "pending" }),
      ],
      "p1",
    )
    expect(out.networkPosture).toEqual({ settled: true, reason: "hops_ready" })
  })

  it("with no pin, one un-hydrated path holds the whole lane back", () => {
    const out = attachNetworkPosture(
      arch(),
      [
        path({ path_id: "p1", hops_load_state: "ready" }),
        path({ path_id: "p2", hops_load_state: "pending" }),
      ],
      null,
    )
    expect(out.networkPosture?.settled).toBe(false)
  })

  it("preserves every other field on the architecture", () => {
    const input = { ...arch(), resources: [{ id: "s3-a" }], marker: 7 }
    const out = attachNetworkPosture(
      input,
      [path({ hops_load_state: "ready" })],
      "p1",
    )
    expect(out.resources).toEqual([{ id: "s3-a" }])
    expect(out.marker).toBe(7)
  })
})

/**
 * The attacker map has NO ConvergencePath.
 *
 * `attack-path-lane-flow-map.tsx` passes `architectureOverride` and an
 * `IdentityAttackPath`, which carries no `hops_load_state` — so
 * attachNetworkPosture can never help it, and PR #466 did not in fact fix that
 * view: production still rendered a null `data-network-banner-reason`.
 *
 * Its hydration signal is `architectureLoading`, already trusted to drive the
 * "Partial view — loading full path topology…" chip.
 */
describe("attachLoadStatePosture (views with no ConvergencePath)", () => {
  it("is NOT settled while the topology is still loading", () => {
    // The regression: empty lanes during load were claimed as "no network hops".
    const out = attachLoadStatePosture(arch(), true)
    expect(out.networkPosture).toEqual({
      settled: false,
      reason: "architecture_pending",
    })
  })

  it("is settled once the topology has loaded", () => {
    const out = attachLoadStatePosture(arch(), false)
    expect(out.networkPosture).toEqual({
      settled: true,
      reason: "architecture_loaded",
    })
  })

  it("always supplies a non-null reason — the exact prod assertion", () => {
    // data-network-banner-reason was null in production precisely because no
    // posture object reached the renderer.
    for (const loading of [true, false]) {
      const out = attachLoadStatePosture(arch(), loading)
      expect(out.networkPosture?.reason).toBeTruthy()
    }
  })

  it("never overwrites a real hop-derived posture", () => {
    // hops_load_state is strictly better evidence than architecture load state.
    const existing = { settled: false, reason: "hops_pending" }
    const out = attachLoadStatePosture(
      { ...arch(), networkPosture: existing },
      false,
    )
    expect(out.networkPosture).toBe(existing)
  })

  it("does not mutate the input and preserves other fields", () => {
    const input = { ...arch(), marker: 7 }
    const out = attachLoadStatePosture(input, true)
    expect("networkPosture" in input).toBe(false)
    expect(out.marker).toBe(7)
  })
})
