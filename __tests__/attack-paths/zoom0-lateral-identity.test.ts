import { describe, expect, it } from "vitest"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"
import {
  lateralBreachLabel,
  resolveZoom0LateralIdentity,
} from "@/lib/attack-paths/zoom0-lateral-identity"

function path(partial: Partial<ConvergencePath> & { path_id: string }): ConvergencePath {
  return {
    damage: [],
    score: 0,
    confidence: "configured",
    hop_count: 0,
    ...partial,
  }
}

describe("resolveZoom0LateralIdentity", () => {
  it("uses pinned path identity — never risk_summary", () => {
    const pinned = path({
      path_id: "p-pin",
      identity: "arn:aws:iam::1:role/pinned-role",
      identity_name: "pinned-role",
      source: "alon-demo-app2",
    })
    const other = path({
      path_id: "p-other",
      identity: "arn:aws:iam::1:role/top-risk-role",
      identity_name: "top-risk-role",
      source: "other",
    })
    const r = resolveZoom0LateralIdentity({
      pinnedPath: pinned,
      jewelPaths: [pinned, other],
    })
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.identityId).toBe("arn:aws:iam::1:role/pinned-role")
    expect(r.identityName).toBe("pinned-role")
    expect(r.autoPinned).toBe(false)
    expect(r.identityId).not.toBe("arn:aws:iam::1:role/top-risk-role")
  })

  it("need_pin when multi-path and unpinned — does not take paths[0]", () => {
    const a = path({
      path_id: "a",
      identity: "arn:aws:iam::1:role/a",
    })
    const b = path({
      path_id: "b",
      identity: "arn:aws:iam::1:role/b",
    })
    expect(
      resolveZoom0LateralIdentity({ pinnedPath: null, jewelPaths: [a, b] }),
    ).toEqual({ status: "need_pin" })
  })

  it("explicit single-path auto-pin for Lateral", () => {
    const only = path({
      path_id: "only",
      identity: "arn:aws:iam::1:role/solo",
      identity_name: "solo",
      source: "lambda-x",
    })
    const r = resolveZoom0LateralIdentity({
      pinnedPath: null,
      jewelPaths: [only],
    })
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.autoPinned).toBe(true)
    expect(r.identityId).toBe("arn:aws:iam::1:role/solo")
  })

  it("null identity → honest empty, not risk_summary fallback", () => {
    const pinned = path({
      path_id: "p",
      identity: null,
      identity_name: null,
      source: "ec2-x",
    })
    const r = resolveZoom0LateralIdentity({
      pinnedPath: pinned,
      jewelPaths: [pinned],
    })
    expect(r.status).toBe("no_identity")
    if (r.status !== "no_identity") return
    expect(r.path.path_id).toBe("p")
  })

  it("blank identity string is no_identity", () => {
    const pinned = path({ path_id: "p", identity: "  " })
    expect(
      resolveZoom0LateralIdentity({ pinnedPath: pinned, jewelPaths: [pinned] })
        .status,
    ).toBe("no_identity")
  })
})

describe("lateralBreachLabel", () => {
  it("prefers source short name", () => {
    expect(
      lateralBreachLabel(
        path({
          path_id: "p",
          source: "alon-demo-app2",
          workload_arn: "arn:aws:ec2:eu-west-1:1:instance/i-abc",
        }),
      ),
    ).toBe("alon-demo-app2")
  })
})
