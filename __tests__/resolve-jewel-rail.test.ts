import { describe, expect, it } from "vitest"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import {
  isServeJewelsAuthoritative,
  reachableJewelPickerList,
  resolveJewelPickerList,
  resolveJewelRailPaths,
  shouldShowAttackPathsNotComputed,
} from "@/lib/attack-paths/resolve-jewel-rail"

const jewel: CrownJewelSummary = {
  id: "arn:aws:s3:::saferemediate-logs-745783559495",
  canonical_id: "arn:aws:s3:::saferemediate-logs-745783559495",
  name: "saferemediate-logs",
  type: "S3Bucket",
  severity: "HIGH",
  path_count: 0,
  highest_risk_score: 0,
  data_classification: null,
  priority_score: 1,
  is_internet_exposed: false,
}

const iapPath = {
  attack_path_id: "iap-1",
  crown_jewel_id: jewel.id,
  nodes: [],
  edges: [],
  severity: {
    overall_score: 70,
    severity: "HIGH" as const,
    impact: 0,
    internet_exposure: 0,
    permission_breadth: 0,
    data_sensitivity: 0,
    identity_chain: 0,
    network_controls: 0,
    weights: {
      impact: 0,
      internet_exposure: 0,
      permission_breadth: 0,
      data_sensitivity: 0,
      identity_chain: 0,
      network_controls: 0,
    },
  },
} as any

function serveEnvelope(
  paths: CrownJewelConvergence["paths"],
  coverage_state: string = "READY_ZERO",
): CrownJewelConvergence {
  return {
    system: "alon-prod",
    cj_arn: jewel.id,
    cj_name: jewel.name,
    cj_type: "S3Bucket",
    paths_total: paths.length,
    observed_paths: 0,
    choke_points: {},
    paths,
    risk_summary: null,
    serve_state: "ACTIVE",
    coverage_state: coverage_state as any,
    generation: "1",
    as_of: "2026-07-26T19:07:22Z",
  }
}

describe("resolveJewelRailPaths", () => {
  it("READY_ZERO SERVE wins over non-empty IAP (no phantom rail)", () => {
    const out = resolveJewelRailPaths({
      serve: serveEnvelope([], "READY_ZERO"),
      serveError: null,
      jewel,
      iapPaths: [iapPath],
    })
    expect(out.source).toBe("serve")
    expect(out.paths).toHaveLength(0)
  })

  it("NOT_READY SERVE wins over IAP", () => {
    const out = resolveJewelRailPaths({
      serve: serveEnvelope([], "NOT_READY"),
      serveError: null,
      jewel,
      iapPaths: [iapPath],
    })
    expect(out.source).toBe("serve")
    expect(out.paths).toHaveLength(0)
  })

  it("uses SERVE paths when present", () => {
    const out = resolveJewelRailPaths({
      serve: serveEnvelope([
        {
          path_id: "serve-1",
          identity: "role/a",
          identity_name: "a",
          hop_count: 2,
          evidence: "configured",
          severity_label: "HIGH",
          severity_score: 70,
          hops: [],
        } as any,
      ]),
      serveError: null,
      jewel,
      iapPaths: [iapPath],
    })
    expect(out.source).toBe("serve")
    expect(out.paths).toHaveLength(1)
    expect(out.paths[0]?.attack_path_id).toBe("serve-1")
  })

  it("IAP fallback only when SERVE unreachable", () => {
    const out = resolveJewelRailPaths({
      serve: null,
      serveError: "Backend busy (502)",
      jewel,
      iapPaths: [iapPath],
    })
    expect(out.source).toBe("iap_fallback")
    expect(out.paths).toHaveLength(1)
  })

  it("no IAP while SERVE still loading (no error, no data)", () => {
    const out = resolveJewelRailPaths({
      serve: null,
      serveError: null,
      jewel,
      iapPaths: [iapPath],
    })
    expect(out.source).toBe("none")
    expect(out.paths).toHaveLength(0)
  })
})

describe("resolveJewelPickerList", () => {
  it("prefers SERVE /jewels including empty over IAP", () => {
    const iapJewels = [{ ...jewel, path_count: 4 }]
    expect(
      resolveJewelPickerList({
        serveJewels: [],
        serveJewelsError: null,
        iapJewels,
      }),
    ).toEqual([])
  })

  it("uses IAP jewels only when SERVE jewels missing/errored", () => {
    const iapJewels = [{ ...jewel, path_count: 4 }]
    expect(
      resolveJewelPickerList({
        serveJewels: null,
        serveJewelsError: "502",
        iapJewels,
      }),
    ).toEqual(iapJewels)
  })

  it("keeps only assets with real paths on the Attack Paths selector", () => {
    const reachable = { ...jewel, id: "reachable", path_count: 2 }
    const internalStore = { ...jewel, id: "internal", path_count: 0 }
    const clusterMember = { ...jewel, id: "member", path_count: 0 }

    expect(
      reachableJewelPickerList([internalStore, reachable, clusterMember]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["reachable"])
  })
})

describe("shouldShowAttackPathsNotComputed", () => {
  it("never shows when SERVE /jewels answered empty (IAP stale must not brick)", () => {
    expect(
      shouldShowAttackPathsNotComputed({
        serveJewelsRaw: { result: { crown_jewels: [] } },
        serveJewelsError: null,
        jewelsEmpty: true,
        iapFailed: true,
        jewelsLoading: false,
        iapLoading: false,
      }),
    ).toBe(false)
    expect(isServeJewelsAuthoritative({ result: { crown_jewels: [] } }, null)).toBe(
      true,
    )
  })

  it("shows when SERVE unavailable and IAP cold/stale envelope", () => {
    expect(
      shouldShowAttackPathsNotComputed({
        serveJewelsRaw: null,
        serveJewelsError: "502",
        jewelsEmpty: true,
        iapFailed: true,
        jewelsLoading: false,
        iapLoading: false,
      }),
    ).toBe(true)
  })

  it("hides while either fetch is still in flight", () => {
    expect(
      shouldShowAttackPathsNotComputed({
        serveJewelsRaw: null,
        serveJewelsError: null,
        jewelsEmpty: true,
        iapFailed: true,
        jewelsLoading: true,
        iapLoading: false,
      }),
    ).toBe(false)
  })
})
