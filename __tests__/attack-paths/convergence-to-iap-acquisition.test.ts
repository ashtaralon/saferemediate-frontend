import { describe, expect, it } from "vitest"
import { convergencePathsToIdentityAttackPaths } from "@/lib/attack-paths/convergence-to-iap"
import {
  compilePathListRow,
  compilePathListRows,
  resolvePathOrigin,
} from "@/components/attack-paths-v2/compile-path-list-row"
import { acquisitionChrome } from "@/lib/attack-paths/acquisition-chrome"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"
import type {
  CrownJewelSummary,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"

/**
 * Regression: the jewel rail renders from `serve` (convergence), converted into
 * IdentityAttackPath shape. That converter is a WHITELIST object literal, so a
 * field absent from it is silently dropped — which is how `acquisition` stayed
 * dark on production while the graph, both APIs, and the browser payload all
 * verified clean.
 *
 * This walks the real chain the UI walks: ConvergencePath → IAP → row → chip.
 */

const jewel = {
  id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
  canonical_id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
  name: "cyntro-demo-prod-data-745783559495",
  type: "S3Bucket",
} as unknown as CrownJewelSummary

function convergencePath(
  acquisition: ConvergencePath["acquisition"],
): ConvergencePath {
  return {
    path_id: "p1",
    source: "cyntro-web-server",
    identity: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
    identity_name: "alon-demo-ec2-role",
    confidence: "configured",
    damage: [],
    score: 64,
    hop_count: 2,
    acquisition,
  } as unknown as ConvergencePath
}

// The real object production returns for alon-demo-ec2-role.
const LIVE = {
  acquisition: "intra_account_assume_role",
  assumable_by: ["AWS:arn:aws:iam::745783559495:root"],
  account_wide_trust: true,
  trust_has_conditions: false,
  resolves_initial_access: false,
} as NonNullable<ConvergencePath["acquisition"]>

describe("convergence → IAP → row → chip", () => {
  it("carries acquisition across the shape change", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      convergencePath(LIVE),
    ])
    expect(iap.acquisition).toBeTruthy()
    expect(iap.acquisition!.account_wide_trust).toBe(true)
  })

  it("reaches the rendered chip end to end", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      convergencePath(LIVE),
    ])
    const row = compilePathListRow(iap, jewel)
    expect(row.acquisition).toBeTruthy()

    const chip = acquisitionChrome(row.acquisition)!
    expect(chip.label).toBe("Assumable by anyone in the account")
    expect(chip.accountWide).toBe(true)
    expect(chip.unconditioned).toBe(true)
    // The guard that must never regress: acquisition is not entry.
    expect(chip.detail).toContain(
      "does NOT explain how they got into the account",
    )
  })

  it("stays null when the server has nothing provable", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      convergencePath(null),
    ])
    expect(iap.acquisition ?? null).toBeNull()
    const row = compilePathListRow(iap, jewel)
    expect(acquisitionChrome(row.acquisition)).toBeNull()
  })
})

/**
 * The FULL chain the UI actually walks, boundary by boundary:
 *
 *   summary payload
 *     → mergeSummaryWithPathDetails   (field-by-field REBUILD, whitelist #1)
 *     → convergencePathsToIdentityAttackPaths (object literal, whitelist #2)
 *     → compilePathListRow
 *     → acquisitionChrome  → chip
 *
 * Each whitelist dropped `acquisition` in turn, and every drop looked the
 * same from outside: correct upstream, invisible in the UI. This test exists
 * so the next ConvergencePath field only has to be debugged once.
 */
describe("full jewel-rail chain preserves acquisition", () => {
  it("survives merge → convert → row → chip", async () => {
    const { mergeSummaryWithPathDetails } = await import(
      "@/lib/attack-paths/convergence-path-details"
    )

    const summary = {
      system: "alon-prod",
      cj_arn: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
      cj_name: "cyntro-demo-prod-data-745783559495",
      paths_total: 1,
      observed_paths: 0,
      paths: [convergencePath(LIVE)],
    } as never

    const merged = mergeSummaryWithPathDetails(summary, {})
    expect(
      merged.paths[0].acquisition,
      "mergeSummaryWithPathDetails rebuilds field-by-field — it must copy acquisition",
    ).toBeTruthy()

    const [iap] = convergencePathsToIdentityAttackPaths(jewel, merged.paths)
    const row = compilePathListRow(iap, jewel)
    const chip = acquisitionChrome(row.acquisition)!

    expect(chip.label).toBe("Assumable by anyone in the account")
    expect(chip.accountWide && chip.unconditioned).toBe(true)
  })
})

/**
 * AP3-001-FE — the same whitelist defect, one class wider.
 *
 * The backend serves the compute origin on EVERY by-crown-jewel row
 * (`source_kind` = (:AttackPath).workload_kind, `workload_arn`) plus the
 * verdict envelope (`route_verdict`, `feasibility`, A1/O1 fields). The
 * adapter's object literal named none of them, so every consumer downstream
 * rebuilt "where does this path start" from hop order (nodes[0] / nodes[last])
 * and presented the reconstruction as fact. These pin the passthrough the same
 * way `acquisition` is pinned above: through the chain the UI actually walks.
 */
const ROUTE_VERDICT = {
  winning_gateway: "vpce-1",
  route_kind: "VPCEndpoint",
  basis: "prefix-list",
  evidence: "configured",
}
const WORKLOAD_NETWORK = {
  is_vpc_attached: true,
  vpc_attachment_state: "VPC_ATTACHED" as const,
  vpc_id: "vpc-1",
  evidence: "collector",
}

function serveRow(overrides: Partial<ConvergencePath> = {}): ConvergencePath {
  return {
    path_id: "ap-ec2",
    source: "cyntro-web-server",
    source_kind: "EC2Instance",
    workload_arn: "arn:aws:ec2:eu-west-1:745783559495:instance/i-0abc",
    identity: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
    identity_name: "alon-demo-ec2-role",
    confidence: "configured",
    evidence: "configured",
    damage: ["read"],
    score: 64,
    severity_label: "HIGH",
    hop_count: 3,
    cj_target_id: jewel.id,
    route_verdict: ROUTE_VERDICT,
    workload_network: WORKLOAD_NETWORK,
    authz_decision: "ALLOW",
    authz_technique_id: "T1078",
    authz_verdict: { basis: "policy" },
    live_traffic_promoted: true,
    path_bound_observations: [{ kind: "flow", hits: 3 }],
    feasibility: { path_state: "OPEN", activity_state: "ACTIVE" },
    hops: [
      {
        node_id: "i-0abc",
        name: "cyntro-web-server",
        node_type: "EC2Instance",
        plane: "compute",
        security_groups: [],
        is_crown_jewel: false,
      },
      {
        node_id: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
        name: "alon-demo-ec2-role",
        node_type: "IAMRole",
        plane: "identity",
        security_groups: [],
        is_crown_jewel: false,
        edge_type_from_prev: "USES_ROLE",
      },
      {
        node_id: jewel.id,
        name: jewel.name,
        node_type: "S3Bucket",
        plane: "data",
        security_groups: [],
        is_crown_jewel: true,
        edge_type_from_prev: "ACCESSES_RESOURCE",
      },
    ],
    ...overrides,
  } as ConvergencePath
}

describe("AP3-001-FE: server-authored origin + verdicts survive the jewel-rail chain", () => {
  it("merge → convert → row keeps source_kind / workload_arn / route_verdict / feasibility", async () => {
    const { mergeSummaryWithPathDetails } = await import(
      "@/lib/attack-paths/convergence-path-details"
    )
    const summary = {
      system: "alon-prod",
      cj_arn: jewel.id,
      cj_name: jewel.name,
      paths_total: 1,
      observed_paths: 0,
      paths: [serveRow()],
    } as never
    const merged = mergeSummaryWithPathDetails(summary, {})
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, merged.paths)

    expect(iap.source_kind).toBe("EC2Instance")
    expect(iap.workload_arn).toBe(
      "arn:aws:ec2:eu-west-1:745783559495:instance/i-0abc",
    )
    expect(iap.route_verdict).toEqual(ROUTE_VERDICT)
    expect(iap.feasibility).toMatchObject({
      path_state: "OPEN",
      activity_state: "ACTIVE",
    })

    const row = compilePathListRow(iap, jewel)
    expect(row.source_kind).toBe("EC2Instance")
    expect(row.workload_arn).toBe(
      "arn:aws:ec2:eu-west-1:745783559495:instance/i-0abc",
    )
    expect(row.start_type).toBe("EC2Instance")
    expect(row.start_label).toBe("cyntro-web-server")
    expect(row.path_state).toBe("OPEN")
    expect(row.activity_state).toBe("ACTIVE")
    expect(row.origin_inferred).toBe(false)
  })

  it("carries cj_target_id, workload_network, authz_*, live_traffic_promoted, path_bound_observations", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [serveRow()])
    expect(iap.cj_target_id).toBe(jewel.id)
    expect(iap.workload_network).toEqual(WORKLOAD_NETWORK)
    expect(iap.authz_decision).toBe("ALLOW")
    expect(iap.authz_technique_id).toBe("T1078")
    expect(iap.authz_verdict).toEqual({ basis: "policy" })
    expect(iap.live_traffic_promoted).toBe(true)
    expect(iap.path_bound_observations).toEqual([{ kind: "flow", hits: 3 }])
  })

  it("absent server fields stay null / omitted — never a client default", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      convergencePath(null),
    ])
    expect(iap.source_kind).toBeNull()
    expect(iap.workload_arn).toBeNull()
    expect(iap.cj_target_id).toBeNull()
    expect(iap.route_verdict).toBeNull()
    expect(iap.workload_network).toBeNull()
    expect(iap.authz_decision).toBeNull()
    expect(iap.live_traffic_promoted).toBeNull()
    expect("path_bound_observations" in iap).toBe(false)
    expect(iap.feasibility).toBeNull()
    expect(iap.origin_inferred).toBeUndefined()
    const row = compilePathListRow(iap, jewel)
    expect(row.source_kind).toBeNull()
    expect(row.workload_arn).toBeNull()
  })
})

describe("AP3-001-FE: origin_inferred is set only when hop order decided", () => {
  it("server is_crown_jewel + workload identity anchor → tiers from the server, no flag", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [serveRow()])
    expect(iap.nodes.map((n) => n.tier)).toEqual([
      "entry",
      "identity",
      "crown_jewel",
    ])
    expect(iap.origin_inferred).toBeUndefined()
  })

  it("legacy hops without is_crown_jewel and no server origin → index fallback, flagged", () => {
    const legacy = serveRow({
      path_id: "ap-legacy",
      source: undefined,
      source_kind: undefined,
      workload_arn: undefined,
      // Older payloads omit is_crown_jewel entirely (not `false`).
      hops: serveRow().hops!.map((h) => {
        const legacyHop: Record<string, unknown> = { ...h }
        delete legacyHop.is_crown_jewel
        return legacyHop as never
      }),
    })
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [legacy])
    expect(iap.nodes.map((n) => n.tier)).toEqual([
      "entry",
      "identity",
      "crown_jewel",
    ])
    expect(iap.origin_inferred).toBe(true)
    const row = compilePathListRow(iap, jewel)
    expect(row.origin_inferred).toBe(true)
    expect(row.source_kind).toBeNull()
    // The FROM tile still resolves (from hop order) — it is badged, not hidden.
    expect(row.start_label).toBe("cyntro-web-server")
    expect(row.start_type).toBe("EC2Instance")
  })

  it("server origin that no hop matches → entry falls back to hop 0 and is flagged", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      serveRow({
        workload_arn: "arn:aws:ec2:eu-west-1:745783559495:instance/i-zzzz",
        source: "somewhere-else",
      }),
    ])
    expect(iap.nodes[0].tier).toBe("entry")
    expect(iap.nodes[2].tier).toBe("crown_jewel")
    expect(iap.origin_inferred).toBe(true)
    // The row keeps the server kind but must badge the reconstruction.
    const row = compilePathListRow(iap, jewel)
    expect(row.source_kind).toBe("EC2Instance")
    expect(row.origin_inferred).toBe(true)
  })

  it("row prefers the server origin before detail hops load (summary-only rows)", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      serveRow({ hops: undefined }),
    ])
    expect(iap.nodes).toEqual([])
    const row = compilePathListRow(iap, jewel)
    expect(row.start_type).toBe("EC2Instance")
    expect(row.start_label).toBe("cyntro-web-server")
    expect(row.source_label).toBe("cyntro-web-server")
    expect(row.origin_inferred).toBe(false)
  })
})

describe("AP3-001-FE: identity-only exposures are counted out of the route list, never dropped", () => {
  const sev = {
    overall_score: 50,
    severity: "HIGH",
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
  }
  function legacyIap(id: string, chain: Array<[string, string]>): IdentityAttackPath {
    return {
      id,
      crown_jewel_id: jewel.id,
      severity: sev,
      path_kind: "behavioral",
      hop_count: chain.length,
      edges: [],
      nodes: chain.map(([type, name], i) => ({
        id: `${id}-${i}`,
        name,
        type,
        tier:
          i === chain.length - 1
            ? "crown_jewel"
            : i === 0
              ? "entry"
              : "identity",
        lp_score: null,
      })),
    } as IdentityAttackPath
  }
  const orphan = serveRow({
    path_id: "ap-orphan",
    source: "orphan-role",
    source_kind: "OrphanRole",
    workload_arn: "arn:aws:iam::745783559495:role/orphan-role",
    hops: [
      {
        node_id: "arn:aws:iam::745783559495:role/orphan-role",
        name: "orphan-role",
        node_type: "IAMRole",
        plane: "identity",
        security_groups: [],
        is_crown_jewel: false,
      },
      serveRow().hops![2],
    ],
  })
  const external = serveRow({
    path_id: "ap-external",
    source: "external:wildcard",
    source_kind: "ExternalPrincipal",
    workload_arn: "external:wildcard",
    hops: [],
  })

  it("compilePathListRows excludes OrphanRole / role-first / principal→jewel chains with a count", () => {
    const paths: IdentityAttackPath[] = [
      ...convergencePathsToIdentityAttackPaths(jewel, [serveRow(), orphan, external]),
      legacyIap("legacy-role-first", [["IAMRole", "r1"], ["S3Bucket", jewel.name]]),
      legacyIap("legacy-principal-jewel", [["AWSPrincipal", "AROAXXXX"], ["S3Bucket", jewel.name]]),
      legacyIap("legacy-compute", [
        ["AWSPrincipal", "sess"],
        ["EC2Instance", "box"],
        ["IAMRole", "r"],
        ["S3Bucket", jewel.name],
      ]),
    ]
    const list = compilePathListRows(paths, jewel)
    expect(list.rows.map((r) => r.id)).toEqual([
      "ap-ec2",
      "ap-external",
      "legacy-compute",
    ])
    expect(list.excludedByReason).toEqual({ identity_only: 3 })
    expect(list.excludedPathIds).toEqual([
      "ap-orphan",
      "legacy-role-first",
      "legacy-principal-jewel",
    ])
  })

  it("keeps ExternalPrincipal (server-authored) and legacy chains that have a compute foothold", () => {
    const list = compilePathListRows(
      [
        ...convergencePathsToIdentityAttackPaths(jewel, [external]),
        legacyIap("legacy-compute", [
          ["IAMRole", "r"],
          ["EC2Instance", "box"],
          ["S3Bucket", jewel.name],
        ]),
      ],
      jewel,
    )
    expect(list.excludedByReason).toEqual({})
    expect(list.rows.map((r) => r.start_type)).toEqual([
      "ExternalPrincipal",
      "IAMRole",
    ])
    expect(list.rows[1].origin_inferred).toBe(true)
  })

  it("resolves [Principal, S3Bucket] to the principal, not the crown jewel", () => {
    const origin = resolvePathOrigin(
      legacyIap("p", [["AWSPrincipal", "AROAXXXX"], ["S3Bucket", jewel.name]]),
    )
    expect(origin.node?.type).toBe("AWSPrincipal")
    expect(origin.inferred).toBe(true)
    expect(origin.identity_only).toBe(true)
  })
})
