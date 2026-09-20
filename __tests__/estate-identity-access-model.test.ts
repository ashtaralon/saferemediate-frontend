/**
 * Estate · Identity & access — the decisions, on real projector output.
 *
 * The fixture in __tests__/fixtures/estate-identity-access.json was COMPOSED by
 * calling the backend's own projector helpers, not typed by hand, so these
 * tests run against the shapes the projector actually emits.
 *
 * The distinctions under test are the ones an empty screen would destroy:
 * a snapshot with no identity block, a projection that refused, and a
 * projection that read the canonical generation and found nothing are three
 * different facts.
 */

import { describe, expect, it } from "vitest"

import {
  CAPABILITY_REASON_CODES,
  IDENTITY_ACCESS_CONTRACT_VERSION,
  bindScope,
  buildGraph,
  buildIdentityView,
} from "@/components/topology-v0-2/estate-identity-access-model"

import fixtures from "./fixtures/estate-identity-access.json"

const TOPOLOGY = {
  system: "payments-core",
  account_id: "111122223333",
  region: "us-east-1",
  vpc_id: "vpc-0abc123",
  scored_at: "2026-09-18T11:30:00Z",
  scoring_window_days: 30,
  system_kpis: null,
  nodes: [],
} as any

function payload(identityAccess: unknown) {
  return { ...TOPOLOGY, identity_access: identityAccess } as any
}

describe("the four states never collapse into one another", () => {
  it("a snapshot with no identity block says so, and does not say zero roles", () => {
    const view = buildIdentityView(TOPOLOGY)
    expect(view.state).toBe("absent")
    expect(view.emptyAuthoritative).toBe(false)
    expect(view.headline).toContain("no identity projection")
    // The phrase that would be a lie here.
    expect(view.headline.toLowerCase()).not.toContain("no workload")
    expect(view.detail).toContain("estate projection worker")
  })

  it("a null identity block is absent, not invalid", () => {
    expect(buildIdentityView(payload(null)).state).toBe("absent")
  })

  it("a non-object identity block is withheld, never rendered as data", () => {
    for (const bad of ["{}", 42, [], true]) {
      const view = buildIdentityView(payload(bad))
      expect(view.state).toBe("invalid")
      expect(view.roles).toEqual([])
      expect(view.graph.nodes).toEqual([])
    }
  })

  it("a foreign contract version is withheld and names both versions", () => {
    const view = buildIdentityView(
      payload({ ...fixtures.ready, contract_version: "estate-identity-access/v2" }),
    )
    expect(view.state).toBe("invalid")
    expect(view.detail).toContain(IDENTITY_ACCESS_CONTRACT_VERSION)
    expect(view.detail).toContain("estate-identity-access/v2")
  })

  it("an unavailable projection names every gap the projector reported", () => {
    const view = buildIdentityView(payload(fixtures.unavailable))
    expect(view.state).toBe("unavailable")
    expect(view.emptyAuthoritative).toBe(false)
    expect(view.gaps.map(gap => gap.code)).toEqual([
      "ACTIVE_DECISION_POINTER_MISSING",
      "VISIBLE_WORKLOAD_UNRESOLVED",
    ])
    expect(view.gaps[1].workload_id).toBe("i-0ee55ff66aa77bb88")
  })

  it("empty-authoritative is an ANSWER, and is not the unavailable state", () => {
    const view = buildIdentityView(payload(fixtures.empty_authoritative))
    expect(view.state).toBe("ready")
    expect(view.emptyAuthoritative).toBe(true)
    expect(view.roles).toEqual([])
    expect(view.gaps).toEqual([])
    expect(view.headline).toContain("No workload in this scope is bound")
    expect(view.detail).toContain("read successfully")
    expect(view.detail).toContain("not a missing read")
    // It keeps its receipts: a read that found nothing still had an authority.
    expect(view.receipts.length).toBe(2)
  })

  it("no state returns an empty view with nothing to explain it", () => {
    const states = [
      buildIdentityView(TOPOLOGY),
      buildIdentityView(payload("bad")),
      buildIdentityView(payload(fixtures.unavailable)),
      buildIdentityView(payload(fixtures.empty_authoritative)),
      buildIdentityView(payload(fixtures.ready)),
    ]
    for (const view of states) {
      expect(view.headline.length).toBeGreaterThan(20)
      expect(view.detail.length).toBeGreaterThan(20)
    }
  })
})

describe("scope binding", () => {
  it("verifies the three fields both payloads carry, and echoes vpc_id too", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const fields = view.scopeBinding!.verified.map(item => item.field).sort()
    expect(fields).toEqual(["account_id", "region", "system_name", "vpc_id"])
    expect(view.scopeBinding!.mismatches).toEqual([])
  })

  it("marks customer_id echoed-only, because the topology payload cannot check it", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const echoed = view.scopeBinding!.echoedOnly.map(item => item.field)
    expect(echoed).toContain("customer_id")
    expect(view.scopeBinding!.verified.map(item => item.field)).not.toContain("customer_id")
  })

  it("withholds tenant data when the identity block was built for another account", () => {
    const view = buildIdentityView(
      payload({
        ...fixtures.ready,
        scope: { ...fixtures.ready.scope, account_id: "999988887777" },
      }),
    )
    expect(view.state).toBe("scope_mismatch")
    expect(view.roles).toEqual([])
    expect(view.graph.nodes).toEqual([])
    expect(view.detail).toContain("999988887777")
    expect(view.detail).toContain("111122223333")
  })

  it("keeps the capability matrix through a scope mismatch", () => {
    const view = buildIdentityView(
      payload({
        ...fixtures.ready,
        scope: { ...fixtures.ready.scope, system_name: "other-system" },
      }),
    )
    expect(view.state).toBe("scope_mismatch")
    // It describes the installed data path, not this tenant's data.
    expect(view.capabilities.length).toBe(15)
    expect(view.capabilitiesUnavailableReason).toBeNull()
  })

  it("a field the topology payload does not carry is echoed, never counted as verified", () => {
    const binding = bindScope(
      { customer_id: "cust-1", system_name: "payments-core", region: "us-east-1" },
      { system: "payments-core", account_id: null, region: null, vpc_id: null } as any,
    )
    expect(binding.verified.map(item => item.field)).toEqual(["system_name"])
    expect(binding.echoedOnly.map(item => item.field).sort()).toEqual(["customer_id", "region"])
    expect(binding.mismatches).toEqual([])
  })
})

describe("workload -> role -> decision", () => {
  it("draws one edge family per hop and no others", () => {
    const view = buildIdentityView(payload(fixtures.partial))
    const families = [...new Set(view.graph.edges.map(edge => edge.family))].sort()
    expect(families).toEqual(["ROLE_ACTION_DECISION", "WORKLOAD_USES_ROLE"])
  })

  it("links every workload the projector bound, by its topology node id", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const workloads = view.graph.nodes
      .filter(node => node.kind === "workload")
      .map(node => (node as any).visibleId)
      .sort()
    expect(workloads).toEqual(["i-0aa11bb22cc33dd44", "payments-settlement"])
    const roleEdges = view.graph.edges.filter(edge => edge.family === "WORKLOAD_USES_ROLE")
    expect(roleEdges.length).toBe(2)
    expect(roleEdges.every(edge => edge.to === "role:AROAEXAMPLEPAYMENTS1")).toBe(true)
  })

  it("a role shared by two workloads yields one role node, not two", () => {
    const graph = buildGraph([
      {
        role_id: "AROASHARED",
        workload_ids: ["i-a", "i-b"],
        attachment_modes: ["instance_profile"],
        configured_grants: { state: "ready", exact_action_count: 1 },
        observed_use: { state: "ready" },
      },
    ] as any)
    expect(graph.nodes.filter(node => node.kind === "role").length).toBe(1)
    expect(graph.nodes.filter(node => node.kind === "workload").length).toBe(2)
  })

  it("the decision hop is observed ONLY when observed evidence was read", () => {
    const view = buildIdentityView(payload(fixtures.partial))
    const byRole = new Map(
      view.graph.edges
        .filter(edge => edge.family === "ROLE_ACTION_DECISION")
        .map(edge => [edge.to, edge] as const),
    )
    expect(byRole.get("decision:AROAEXAMPLEPAYMENTS1")!.plane).toBe("observed")
    // Decisions were withheld for this role; an observed plane would assert
    // evidence that was never read.
    expect(byRole.get("decision:AROAEXAMPLELEDGER002")!.plane).toBe("configured")
  })

  it("a withheld decision shows no counts at all — zero is not unknown", () => {
    const view = buildIdentityView(payload(fixtures.partial))
    const node: any = view.graph.nodes.find(n => n.id === "decision:AROAEXAMPLELEDGER002")
    expect(node.state).toBe("unavailable")
    expect(node.configuredGrantCount).toBeNull()
    expect(node.observed).toBeNull()
    expect(node.gaps.map((gap: any) => gap.code)).toEqual(["ROLE_DECISION_UNIVERSE_INCOMPLETE"])
  })

  it("a decided role carries configured and observed counts on separate planes", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const node: any = view.graph.nodes.find(n => n.id === "decision:AROAEXAMPLEPAYMENTS1")
    expect(node.state).toBe("ready")
    expect(node.configuredGrantCount).toBe(3)
    expect(node.observed.successful).toBe(1)
    expect(node.observed.deniedOnly).toBe(1)
    expect(node.observed.notObserved).toBe(1)
    expect(node.observed.lastSuccessAt).toBe("2026-09-17T22:14:05Z")
  })

  it("never claims an effective allow — v1 does not decide effective authorization", () => {
    const view = buildIdentityView(payload(fixtures.partial))
    for (const node of view.graph.nodes.filter(n => n.kind === "decision") as any[]) {
      expect(node.effectiveAuthorization.availability).toBe("unavailable")
      expect(node.effectiveAuthorization.decision).toBeNull()
      expect(node.effectiveAuthorization.reasonCodes.length).toBeGreaterThan(0)
    }
  })
})

describe("the capability matrix", () => {
  it("carries a verdict for all fifteen requested families", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    expect(view.capabilities.length).toBe(15)
    expect(view.capabilitiesUnavailableReason).toBeNull()
  })

  it("names exactly the two families the installed path can serve", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const available = view.capabilities.filter(row => row.status === "available")
    expect(available.map(row => row.family).sort()).toEqual([
      "ROLE_ACTION_DECISION",
      "WORKLOAD_USES_ROLE",
    ])
    expect(available.every(row => Boolean(row.canonical_writer) && Boolean(row.bounded_read))).toBe(
      true,
    )
  })

  it("asserts no plane for any unavailable family", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const unavailable = view.capabilities.filter(row => row.status === "unavailable")
    expect(unavailable.length).toBe(13)
    for (const row of unavailable) {
      expect(row.plane).toBeNull()
      expect(row.canonical_writer).toBeNull()
      expect(row.bounded_read).toBeNull()
      expect(row.reason_codes.length).toBeGreaterThan(0)
      expect(row.detail.length).toBeGreaterThan(40)
    }
  })

  it("reports DATA_ACCESS unavailable with the asset-anchored reason", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const row = view.capabilities.find(item => item.family === "DATA_ACCESS")!
    expect(row.status).toBe("unavailable")
    expect(row.reason_codes).toContain("ASSET_ANCHORED_AUTHORITY_ONLY")
    expect(row.detail).toContain("asset_uids")
  })

  it("every reason code on every row is in the closed set", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const allowed = new Set<string>(CAPABILITY_REASON_CODES as readonly string[])
    for (const row of view.capabilities) {
      for (const code of row.reason_codes) expect(allowed.has(code)).toBe(true)
    }
  })

  it("the frontend's closed set matches the backend's, exactly", () => {
    expect([...CAPABILITY_REASON_CODES].sort()).toEqual(fixtures.capability_reason_codes)
  })

  it("a missing matrix is an explicit unknown, never a silent empty list", () => {
    const { relationship_capabilities, ...withoutMatrix } = fixtures.ready as any
    const view = buildIdentityView(payload(withoutMatrix))
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("predates")
    expect(view.capabilitiesUnavailableReason).toContain("not empty")
  })

  it("an empty matrix is not a claim that every family is servable", () => {
    const view = buildIdentityView(payload({ ...fixtures.ready, relationship_capabilities: [] }))
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("not a")
  })

  it("survives the unavailable state — that is when a screen most needs it", () => {
    const view = buildIdentityView(payload(fixtures.unavailable))
    expect(view.state).toBe("unavailable")
    expect(view.capabilities.length).toBe(15)
  })
})

describe("receipts and truncation", () => {
  it("surfaces both authority receipts with generation and hashes", () => {
    const view = buildIdentityView(payload(fixtures.ready))
    const inventory = view.receipts.find(item => item.label === "Canonical inventory")!
    expect(inventory.generation).toBe(41)
    expect(inventory.projectionReceiptHash).toBe("b".repeat(64))
    expect(inventory.sourceVectorHash).toBe("a".repeat(64))
    const decision = view.receipts.find(item => item.label === "Role action decision")!
    expect(decision.projectionReceiptHash).toBe("c".repeat(64))
  })

  it("keeps the inventory receipt when the decision authority was never read", () => {
    const view = buildIdentityView(payload(fixtures.unavailable))
    expect(view.receipts.map(item => item.label)).toEqual(["Canonical inventory"])
  })

  it("reports truncation and unresolved omissions rather than hiding them", () => {
    const view = buildIdentityView(
      payload({
        ...fixtures.ready,
        roles_total: 140,
        roles_truncated: true,
        roles_omitted_unresolved: 4,
      }),
    )
    expect(view.rolesTotal).toBe(140)
    expect(view.rolesTruncated).toBe(true)
    expect(view.rolesOmittedUnresolved).toBe(4)
    expect(view.rolesReturned).toBe(1)
  })
})
