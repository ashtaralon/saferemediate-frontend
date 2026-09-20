/**
 * Estate · Identity & access — the decisions, on real projector output.
 *
 * Every payload in __tests__/fixtures/estate-identity-access.json is the
 * literal return value of the backend's build_estate_identity_access, driven
 * over a real-shape graph. The six states differ because their INPUT rows
 * differ, so these tests run against what the projector actually emits.
 *
 * The distinctions under test are the ones an empty screen would destroy. Four
 * payloads here render zero or near-zero content and mean four different
 * things, and only one of them means "nothing is bound".
 */

import { describe, expect, it } from "vitest"

import {
  CAPABILITY_REASON_CODES,
  IDENTITY_ACCESS_CONTRACT_VERSION,
  REQUIRED_CAPABILITY_FAMILIES,
  REQUIRED_SCOPE_FIELDS,
  SUPPORTED_PLANES,
  VALID_STATUSES,
  bindScope,
  buildGraph,
  buildIdentityView,
  layoutGraph,
} from "@/components/topology-v0-2/estate-identity-access-model"

import fixtures from "./fixtures/estate-identity-access.json"

const TOPOLOGY = {
  system: "testbed-webshop",
  account_id: "416651950952",
  region: "eu-west-1",
  vpc_id: "vpc-1",
  scored_at: "2026-09-15T07:00:00Z",
  scoring_window_days: 30,
  system_kpis: null,
  nodes: [],
} as any

function payload(identityAccess: unknown) {
  return { ...TOPOLOGY, identity_access: identityAccess } as any
}

function viewOf(identityAccess: unknown) {
  return buildIdentityView(payload(identityAccess))
}

describe("status is a closed set", () => {
  it("accepts exactly the three the backend emits", () => {
    expect([...VALID_STATUSES].sort()).toEqual(["partial", "ready", "unavailable"])
  })

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["unknown", "degraded"],
    ["near-miss", "READY"],
    ["wrong type", 1],
    ["a truthy object", {}],
  ])("a %s status is invalid, never readable", (_label, status) => {
    const view = viewOf({ ...fixtures.ready, status })
    expect(view.state).toBe("invalid")
    expect(view.roles).toEqual([])
    expect(view.graph.nodes).toEqual([])
    expect(view.emptyAuthoritative).toBe(false)
    expect(view.detail).toContain("partial, ready, unavailable")
  })

  it("an unknown status never reaches the ready branch, even with real roles", () => {
    const view = viewOf({ ...fixtures.ready, status: "authoritative" })
    expect(view.state).toBe("invalid")
    // The roles were present in the payload and are still withheld.
    expect(fixtures.ready.roles.length).toBeGreaterThan(0)
    expect(view.roles).toEqual([])
  })

  it("keeps the capability matrix through an invalid status", () => {
    // The matrix describes the installed data path, not this tenant's data.
    expect(viewOf({ ...fixtures.ready, status: "nonsense" }).capabilities.length).toBe(15)
  })
})

describe("a malformed v1 payload is withheld, never thrown on", () => {
  it.each([
    ["roles as an object", { roles: {} }],
    ["roles as a string", { roles: "none" }],
    ["gaps as an object", { gaps: {} }],
    ["gaps missing a code", { gaps: [{ detail: "no code here" }] }],
    ["scope as an array", { scope: [] }],
    ["scope as a string", { scope: "eu-west-1" }],
    ["inventory_authority as an array", { inventory_authority: [] }],
    ["decision_authority as a number", { decision_authority: 7 }],
  ])("%s is invalid", (_label, override) => {
    const view = viewOf({ ...fixtures.ready, ...override })
    expect(view.state).toBe("invalid")
    expect(view.headline).toContain("does not match")
  })

  it.each([
    ["a role that is not an object", "not-a-role"],
    ["a role with no role_id", { name: "web" }],
    ["a role whose role_id is blank", { role_id: "   " }],
    ["a role whose workload_ids is an object", { role_id: "R", workload_ids: {} }],
    ["a role whose workload_ids holds a number", { role_id: "R", workload_ids: [1] }],
    ["a role whose attachment_modes is a string", { role_id: "R", attachment_modes: "direct" }],
    ["a role whose gaps is an object", { role_id: "R", gaps: {} }],
    ["a role whose reason_codes is an object", {
      role_id: "R",
      effective_authorization: { reason_codes: {} },
    }],
    ["a role whose configured_grants is an array", { role_id: "R", configured_grants: [] }],
  ])("%s makes the whole projection invalid", (_label, role) => {
    const view = viewOf({ ...fixtures.ready, roles: [role] })
    expect(view.state).toBe("invalid")
    expect(view.graph.nodes).toEqual([])
  })

  it("does not throw on any malformed shape it is handed", () => {
    const hostile: unknown[] = [
      { ...fixtures.ready, roles: {} },
      { ...fixtures.ready, roles: [null] },
      { ...fixtures.ready, gaps: [42] },
      { ...fixtures.ready, scope: 0 },
      { ...fixtures.ready, relationship_capabilities: "matrix" },
      { ...fixtures.ready, relationship_capabilities: [null, 1, "x"] },
      { contract_version: IDENTITY_ACCESS_CONTRACT_VERSION },
      {},
      [],
      "",
      0,
      false,
    ]
    for (const block of hostile) {
      expect(() => buildIdentityView(payload(block))).not.toThrow()
    }
  })

  it("a malformed role is never silently dropped from a rendered set", () => {
    const view = viewOf({
      ...fixtures.ready,
      roles: [...fixtures.ready.roles, { name: "no role id" }],
    })
    expect(view.state).toBe("invalid")
    // NOT: one good role rendered and the bad one quietly gone.
    expect(view.roles).toEqual([])
  })
})

describe("scope authority fails closed", () => {
  it("the four fields the scope guard rests on are required", () => {
    expect([...REQUIRED_SCOPE_FIELDS].sort()).toEqual([
      "account_id",
      "customer_id",
      "region",
      "system_name",
    ])
  })

  it.each([
    ["account_id as an empty array", "account_id", []],
    ["account_id as an object", "account_id", {}],
    ["account_id as a number", "account_id", 416651950952],
    ["account_id as null", "account_id", null],
    ["account_id blank", "account_id", "   "],
    ["customer_id as an array", "customer_id", []],
    ["system_name as an array", "system_name", []],
    ["region as an array", "region", []],
    ["region as false", "region", false],
  ])("%s is invalid, and never renders tenant data", (_label, field, value) => {
    const view = viewOf({ ...fixtures.ready, scope: { ...fixtures.ready.scope, [field]: value } })
    expect(view.state).toBe("invalid")
    expect(view.roles).toEqual([])
    expect(view.graph.nodes).toEqual([])
    expect(view.detail).toContain(field)
  })

  it("the exact bypass: {account_id: []} must not slip past the mismatch guard", () => {
    // str([]) is null, so the old code treated this as an ABSENT account_id,
    // skipped the comparison, found no mismatch, and rendered the roles.
    const view = viewOf({
      ...fixtures.ready,
      scope: { ...fixtures.ready.scope, account_id: [] },
    })
    expect(view.state).not.toBe("ready")
    expect(view.state).toBe("invalid")
    expect(view.roles).toEqual([])
  })

  it.each([
    ["a missing scope", undefined],
    ["a null scope", null],
    ["an array scope", []],
    ["a string scope", "eu-west-1"],
    ["an empty scope", {}],
  ])("%s is invalid", (_label, scope) => {
    expect(viewOf({ ...fixtures.ready, scope }).state).toBe("invalid")
  })

  it("accepts a null vpc_id, because an account-wide projection has none", () => {
    const view = viewOf({ ...fixtures.ready, scope: { ...fixtures.ready.scope, vpc_id: null } })
    expect(view.state).toBe("ready")
    expect(view.scopeBinding!.verified.map(item => item.field)).not.toContain("vpc_id")
  })

  it("rejects a vpc_id that is neither text nor null", () => {
    expect(
      viewOf({ ...fixtures.ready, scope: { ...fixtures.ready.scope, vpc_id: [] } }).state,
    ).toBe("invalid")
  })
})

describe("authority receipts fail closed", () => {
  it.each([
    ["an empty inventory authority", { inventory_authority: {} }],
    ["a null inventory authority", { inventory_authority: null }],
    ["a missing inventory authority", { inventory_authority: undefined }],
    ["an empty decision authority", { decision_authority: {} }],
    ["a null decision authority on a ready payload", { decision_authority: null }],
  ])("%s makes a ready payload invalid", (_label, override) => {
    const view = viewOf({ ...fixtures.ready, ...override })
    expect(view.state).toBe("invalid")
    expect(view.roles).toEqual([])
    expect(view.receipts).toEqual([])
  })

  it.each([
    ["no projection_scope", { projection_scope: "" }],
    ["a string generation", { generation: "31" }],
    ["a negative generation", { generation: -1 }],
    ["a fractional generation", { generation: 1.5 }],
    ["a boolean generation", { generation: true }],
    ["a null generation", { generation: null }],
    ["no staging_run_id", { staging_run_id: "" }],
    ["no source_vector_hash", { source_vector_hash: null }],
    ["no projected_through", { projected_through: undefined }],
    ["a receipt hash that is an array", { projection_receipt_hash: [] }],
  ])("an inventory authority with %s is invalid", (_label, override) => {
    const view = viewOf({
      ...fixtures.ready,
      inventory_authority: { ...fixtures.ready.inventory_authority, ...override },
    })
    expect(view.state).toBe("invalid")
  })

  it("a partial payload may legitimately carry no decision authority", () => {
    const source = fixtures.partial_no_decision_authority
    expect(source.status).toBe("partial")
    expect(source.decision_authority).toBeNull()
    expect(viewOf(source).state).toBe("ready")
  })

  it("but a partial payload with a MALFORMED decision authority is invalid", () => {
    const view = viewOf({ ...fixtures.partial, decision_authority: { generation: 12 } })
    expect(view.state).toBe("invalid")
  })

  it("an unavailable payload with a malformed authority is still invalid", () => {
    const view = viewOf({ ...fixtures.unavailable, inventory_authority: {} })
    expect(view.state).toBe("invalid")
  })

  it("accepts a null receipt hash — a pre-receipt generation stays readable", () => {
    // ActiveProjection: "EMPTY on a pointer activated before this field
    // existed -- those generations are readable and servable."
    const view = viewOf({
      ...fixtures.ready,
      inventory_authority: {
        ...fixtures.ready.inventory_authority,
        projection_receipt_hash: null,
      },
    })
    expect(view.state).toBe("ready")
    expect(view.receipts[0].projectionReceiptHash).toBeNull()
  })

  it("never says hash-verified for a decision generation with no receipt", () => {
    const view = viewOf({
      ...fixtures.ready,
      decision_authority: {
        ...fixtures.ready.decision_authority,
        projection_receipt_hash: null,
      },
    })
    expect(view.state).toBe("ready")
    expect(view.detail).not.toContain("hash-verified")
    expect(view.detail).toContain("not certifiable")
    expect(view.detail).toContain(`generation ${fixtures.ready.decision_authority.generation}`)
  })

  it("never says generation unknown", () => {
    for (const source of [fixtures.ready, fixtures.partial]) {
      expect(viewOf(source).detail).not.toContain("unknown")
    }
  })
})

describe("counters are typed and conserved", () => {
  it.each([
    ["roles_returned as a string", { roles_returned: "1" }],
    ["roles_returned as a float", { roles_returned: 1.5 }],
    ["roles_returned as a boolean", { roles_returned: true }],
    ["roles_total as a string", { roles_total: "1" }],
    ["roles_total negative", { roles_total: -1 }],
    ["roles_omitted_unresolved as a string", { roles_omitted_unresolved: "0" }],
    ["roles_truncated as a string", { roles_truncated: "false" }],
    ["roles_truncated as a number", { roles_truncated: 0 }],
  ])("%s is invalid, never coerced away", (_label, override) => {
    const view = viewOf({ ...fixtures.ready, ...override })
    expect(view.state).toBe("invalid")
    // NOT: silently null/false and rendered as if sound.
    expect(view.rolesTotal).toBeNull()
    expect(view.rolesTruncated).toBe(false)
    expect(view.roles).toEqual([])
  })

  it("roles_returned must equal the roles actually carried", () => {
    const view = viewOf({ ...fixtures.ready, roles_returned: 5 })
    expect(view.state).toBe("invalid")
    expect(view.detail).toContain("reports 5 roles returned but carries 1")
  })

  it("returned plus omitted cannot exceed the total", () => {
    const view = viewOf({
      ...fixtures.ready,
      roles_total: 1,
      roles_returned: 1,
      roles_omitted_unresolved: 3,
    })
    expect(view.state).toBe("invalid")
    expect(view.detail).toContain("out of a total of 1")
  })

  it("a total that says rows were dropped cannot report no truncation", () => {
    const view = viewOf({
      ...fixtures.ready,
      roles_total: 9,
      roles_returned: 1,
      roles_omitted_unresolved: 0,
      roles_truncated: false,
    })
    expect(view.state).toBe("invalid")
    expect(view.detail).toContain("no truncation")
  })

  it("truncation the totals contradict is invalid", () => {
    const view = viewOf({
      ...fixtures.ready,
      roles_total: 1,
      roles_returned: 1,
      roles_omitted_unresolved: 0,
      roles_truncated: true,
    })
    expect(view.state).toBe("invalid")
    expect(view.detail).toContain("contradict")
  })

  it("a null total may not come with roles, omissions or truncation", () => {
    for (const override of [
      { roles_total: null, roles_omitted_unresolved: 2 },
      { roles_total: null, roles_truncated: true },
    ]) {
      expect(viewOf({ ...fixtures.ready, ...override }).state).toBe("invalid")
    }
  })

  it("every real producer payload satisfies the conservation law", () => {
    for (const key of [
      "ready",
      "partial",
      "empty_authoritative",
      "partial_unresolved_role_id",
      "partial_no_decision_authority",
      "unavailable",
    ] as const) {
      expect(viewOf((fixtures as any)[key]).state).not.toBe("invalid")
    }
  })
})

describe("a ready state must have the counts it claims", () => {
  const role = () => JSON.parse(JSON.stringify(fixtures.ready.roles[0]))

  it.each([
    ["a missing successful count", "successful_action_count", undefined],
    ["a string successful count", "successful_action_count", "1"],
    ["a negative denied count", "denied_only_action_count", -1],
    ["a null not-observed count", "not_observed_action_count", null],
    ["a float unknown count", "unknown_action_count", 0.5],
  ])("observed_use ready with %s cannot become an observed edge", (_label, field, value) => {
    const bad = role()
    bad.observed_use[field] = value
    const view = viewOf({ ...fixtures.ready, roles: [bad] })
    expect(view.state).toBe("invalid")
    // The thing this prevents: an animated edge over numbers never read.
    expect(view.graph.edges.filter(edge => edge.animated)).toEqual([])
    expect(view.graph.edges.filter(edge => edge.plane === "observed")).toEqual([])
  })

  it.each([
    ["missing", undefined],
    ["not an object", "complete"],
    ["missing a bucket", { complete: 1, partial: 0 }],
    ["a string bucket", { complete: "1", partial: 0, unknown: 0 }],
  ])("observed_use ready with coverage counts %s is invalid", (_label, coverage) => {
    const bad = role()
    bad.observed_use.coverage_counts = coverage
    expect(viewOf({ ...fixtures.ready, roles: [bad] }).state).toBe("invalid")
  })

  it.each([
    ["missing", undefined],
    ["a string", "3"],
    ["negative", -2],
    ["null", null],
  ])("configured_grants ready with an exact_action_count %s is invalid", (_label, count) => {
    const bad = role()
    bad.configured_grants.exact_action_count = count
    const view = viewOf({ ...fixtures.ready, roles: [bad] })
    expect(view.state).toBe("invalid")
    expect(view.graph.nodes).toEqual([])
  })

  it.each([
    ["configured_grants", "configured_grants"],
    ["observed_use", "observed_use"],
  ])("an undefined state on %s is invalid", (_label, key) => {
    const bad = role()
    bad[key].state = "degraded"
    expect(viewOf({ ...fixtures.ready, roles: [bad] }).state).toBe("invalid")
  })

  it("an unavailable state needs no counts at all", () => {
    // The real withheld role: every count null, and that is correct.
    const view = viewOf(fixtures.partial_no_decision_authority)
    expect(view.state).toBe("ready")
    const node: any = view.graph.nodes.find(item => item.kind === "decision")
    expect(node.configuredGrantCount).toBeNull()
    expect(node.observed).toBeNull()
  })

  it("a last_success_at that is neither text nor null is invalid", () => {
    const bad = role()
    bad.observed_use.last_success_at = 1758000000
    expect(viewOf({ ...fixtures.ready, roles: [bad] }).state).toBe("invalid")
  })
})

describe("the capability matrix is all-or-nothing", () => {
  it("carries a verdict for all fifteen requested families", () => {
    const view = viewOf(fixtures.ready)
    expect(view.capabilities.length).toBe(15)
    expect(view.capabilitiesUnavailableReason).toBeNull()
  })

  it("names exactly the two families the installed path can serve", () => {
    const available = viewOf(fixtures.ready).capabilities.filter(
      row => row.status === "available",
    )
    expect(available.map(row => row.family).sort()).toEqual([
      "ROLE_ACTION_DECISION",
      "WORKLOAD_USES_ROLE",
    ])
    expect(available.every(row => Boolean(row.canonical_writer) && Boolean(row.bounded_read))).toBe(
      true,
    )
  })

  it("asserts no plane for any unavailable family", () => {
    const unavailable = viewOf(fixtures.ready).capabilities.filter(
      row => row.status === "unavailable",
    )
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
    const row = viewOf(fixtures.ready).capabilities.find(
      item => item.family === "DATA_ACCESS",
    )!
    expect(row.status).toBe("unavailable")
    expect(row.reason_codes).toContain("ASSET_ANCHORED_AUTHORITY_ONLY")
    expect(row.detail).toContain("asset_uids")
  })

  it("every reason code on every row is in the closed set", () => {
    const allowed = new Set<string>(CAPABILITY_REASON_CODES as readonly string[])
    for (const row of viewOf(fixtures.ready).capabilities) {
      for (const code of row.reason_codes) expect(allowed.has(code)).toBe(true)
    }
  })

  it("the frontend's closed set matches the backend's, exactly", () => {
    expect([...CAPABILITY_REASON_CODES].sort()).toEqual(fixtures.capability_reason_codes)
  })

  it.each([
    ["a row that is not an object", null],
    ["a row with no family", { status: "unavailable", reason_codes: [], detail: "d" }],
    ["a row with an unknown status", {
      family: "X", status: "maybe", plane: null, reason_codes: [], detail: "d",
    }],
    ["a row whose reason_codes is an object", {
      family: "X", status: "unavailable", plane: null, reason_codes: {}, detail: "d",
    }],
    ["a row whose plane is a number", {
      family: "X", status: "available", plane: 1, reason_codes: [], detail: "d",
    }],
    ["a row with no detail", { family: "X", status: "unavailable", plane: null, reason_codes: [] }],
  ])("%s withholds the WHOLE matrix, not just that row", (_label, row) => {
    const view = viewOf({
      ...fixtures.ready,
      relationship_capabilities: [...fixtures.ready.relationship_capabilities, row],
    })
    // The tenant's projection is still readable; only the matrix is withheld.
    expect(view.state).toBe("ready")
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("whole matrix is withheld")
    expect(view.capabilitiesUnavailableReason).toContain("1 of 16")
  })

  it("the frontend's required family list matches the backend's, exactly", () => {
    expect([...REQUIRED_CAPABILITY_FAMILIES].sort()).toEqual(
      fixtures.ready.relationship_capabilities.map((row: any) => row.family).sort(),
    )
  })

  it("the supported planes are the ones the producer asserts", () => {
    const planes = new Set(
      fixtures.ready.relationship_capabilities
        .map((row: any) => row.plane)
        .filter(Boolean),
    )
    for (const plane of planes) {
      expect(SUPPORTED_PLANES as readonly string[]).toContain(plane as string)
    }
  })

  it.each([
    ["a reason code outside the closed set", {
      family: "DATA_ACCESS", status: "unavailable", plane: null,
      canonical_writer: null, bounded_read: null,
      reason_codes: ["SOMETHING_ELSE"], detail: "a detail",
    }],
    ["an unavailable row asserting a plane", {
      family: "DATA_ACCESS", status: "unavailable", plane: "observed",
      canonical_writer: null, bounded_read: null,
      reason_codes: ["NO_CANONICAL_PRODUCER"], detail: "a detail",
    }],
    ["an unavailable row naming a writer", {
      family: "DATA_ACCESS", status: "unavailable", plane: null,
      canonical_writer: "some.writer", bounded_read: null,
      reason_codes: ["NO_CANONICAL_PRODUCER"], detail: "a detail",
    }],
    ["an unavailable row naming a bounded read", {
      family: "DATA_ACCESS", status: "unavailable", plane: null,
      canonical_writer: null, bounded_read: "some.read",
      reason_codes: ["NO_CANONICAL_PRODUCER"], detail: "a detail",
    }],
    ["an unavailable row with no reason at all", {
      family: "DATA_ACCESS", status: "unavailable", plane: null,
      canonical_writer: null, bounded_read: null,
      reason_codes: [], detail: "a detail",
    }],
    ["an available row on an unsupported plane", {
      family: "WORKLOAD_USES_ROLE", status: "available", plane: "observed",
      canonical_writer: "w", bounded_read: "r", reason_codes: [], detail: "a detail",
    }],
    ["an available row with a null plane", {
      family: "WORKLOAD_USES_ROLE", status: "available", plane: null,
      canonical_writer: "w", bounded_read: "r", reason_codes: [], detail: "a detail",
    }],
    ["an available row with no writer", {
      family: "WORKLOAD_USES_ROLE", status: "available", plane: "configured",
      canonical_writer: null, bounded_read: "r", reason_codes: [], detail: "a detail",
    }],
    ["an available row with no bounded read", {
      family: "WORKLOAD_USES_ROLE", status: "available", plane: "configured",
      canonical_writer: "w", bounded_read: "", reason_codes: [], detail: "a detail",
    }],
    ["an available row carrying a reason code", {
      family: "WORKLOAD_USES_ROLE", status: "available", plane: "configured",
      canonical_writer: "w", bounded_read: "r",
      reason_codes: ["NO_CANONICAL_PRODUCER"], detail: "a detail",
    }],
  ])("%s withholds the whole matrix", (_label, row) => {
    const rows = fixtures.ready.relationship_capabilities.map((item: any) =>
      item.family === (row as any).family ? row : item,
    )
    const view = viewOf({ ...fixtures.ready, relationship_capabilities: rows })
    expect(view.state).toBe("ready")
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("whole matrix is withheld")
  })

  it("a duplicated family is an incomplete matrix, not a complete one", () => {
    const rows = [
      ...fixtures.ready.relationship_capabilities,
      fixtures.ready.relationship_capabilities.find((r: any) => r.family === "DATA_ACCESS"),
    ]
    const view = viewOf({ ...fixtures.ready, relationship_capabilities: rows })
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("incomplete")
    expect(view.capabilitiesUnavailableReason).toContain("DATA_ACCESS ruled on more than once")
  })

  it("a missing family is an incomplete matrix, and is named", () => {
    const rows = fixtures.ready.relationship_capabilities.filter(
      (row: any) => row.family !== "TRUSTS",
    )
    expect(rows.length).toBe(14)
    const view = viewOf({ ...fixtures.ready, relationship_capabilities: rows })
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("no verdict for TRUSTS")
  })

  it("a matrix missing several families names every one of them", () => {
    const rows = fixtures.ready.relationship_capabilities.filter(
      (row: any) => !["TRUSTS", "IN_ORG", "MEMBER_OF"].includes(row.family),
    )
    const reason = viewOf({
      ...fixtures.ready,
      relationship_capabilities: rows,
    }).capabilitiesUnavailableReason!
    for (const family of ["TRUSTS", "IN_ORG", "MEMBER_OF"]) {
      expect(reason).toContain(family)
    }
  })

  it("an EXTRA family is allowed — a backend may rule on more", () => {
    const rows = [
      ...fixtures.ready.relationship_capabilities,
      {
        family: "SOME_NEW_FAMILY",
        status: "unavailable",
        plane: null,
        canonical_writer: null,
        bounded_read: null,
        reason_codes: ["NO_CANONICAL_PRODUCER"],
        detail: "a family this frontend has never heard of",
      },
    ]
    const view = viewOf({ ...fixtures.ready, relationship_capabilities: rows })
    expect(view.capabilitiesUnavailableReason).toBeNull()
    expect(view.capabilities.length).toBe(16)
  })

  it("a malformed row never leaves a family silently absent", () => {
    // The 15-into-14 failure: drop one row's validity and the matrix must not
    // present the remaining 14 as a complete account.
    const rows = fixtures.ready.relationship_capabilities.map((row: any) =>
      row.family === "TRUSTS" ? { ...row, reason_codes: ["MADE_UP_CODE"] } : row,
    )
    const view = viewOf({ ...fixtures.ready, relationship_capabilities: rows })
    expect(view.capabilities.length).toBe(0)
    expect(view.capabilities.length).not.toBe(14)
  })

  it("a missing matrix is an explicit unknown, never a silent empty list", () => {
    const { relationship_capabilities, ...withoutMatrix } = fixtures.ready as any
    const view = viewOf(withoutMatrix)
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("predates")
    expect(view.capabilitiesUnavailableReason).toContain("not empty")
  })

  it("an empty matrix is not a claim that every family is servable", () => {
    const view = viewOf({ ...fixtures.ready, relationship_capabilities: [] })
    expect(view.capabilities).toEqual([])
    expect(view.capabilitiesUnavailableReason).toContain("not a")
  })

  it("survives the unavailable state — that is when a screen most needs it", () => {
    expect(viewOf(fixtures.unavailable).capabilities.length).toBe(15)
  })
})

describe("empty-authoritative is the strongest claim, so it is the narrowest", () => {
  it("is granted only for a complete, zero-total ready projection", () => {
    const view = viewOf(fixtures.empty_authoritative)
    expect(view.state).toBe("ready")
    expect(view.emptyAuthoritative).toBe(true)
    expect(view.headline).toContain("No workload in this scope is bound")
    expect(view.detail).toContain("not a missing read")
    expect(view.receipts.length).toBe(2)
  })

  it("is REFUSED for the partial payload whose role has no AWS RoleId", () => {
    // Real projector output: zero roles rendered, one role counted and omitted.
    const source = fixtures.partial_unresolved_role_id
    expect(source.status).toBe("partial")
    expect(source.roles).toEqual([])
    expect(source.roles_total).toBe(1)
    expect(source.roles_omitted_unresolved).toBe(1)

    const view = viewOf(source)
    expect(view.emptyAuthoritative).toBe(false)
    expect(view.state).toBe("incomplete")
    expect(view.headline).not.toContain("No workload in this scope is bound")
    expect(view.headline).toContain("could not be shown")
    expect(view.detail).toContain("no AWS RoleId")
    expect(view.detail).toContain("NOT a statement that no workload is bound")
  })

  // Each override below is INTERNALLY CONSISTENT: the counters obey the
  // producer's conservation law, so what disqualifies the claim is the fact
  // being reported, not a malformed payload.
  it.each([
    ["a non-zero total with nothing returned", {
      roles_total: 3, roles_returned: 0, roles_omitted_unresolved: 0, roles_truncated: true,
    }],
    ["a truncated list", {
      roles_total: 1, roles_returned: 0, roles_omitted_unresolved: 0, roles_truncated: true,
    }],
    ["an unresolved omission", {
      roles_total: 2, roles_returned: 0, roles_omitted_unresolved: 2, roles_truncated: false,
    }],
    ["a reported gap", { gaps: [{ code: "X", detail: "something" }] }],
    ["status partial", {
      status: "partial",
      roles_total: 1, roles_returned: 0, roles_omitted_unresolved: 1, roles_truncated: false,
    }],
  ])("%s disqualifies the zero-roles claim", (_label, override) => {
    const view = viewOf({ ...fixtures.empty_authoritative, ...override })
    expect(view.emptyAuthoritative).toBe(false)
    expect(view.state).toBe("incomplete")
  })

  it("the incomplete state keeps its receipts and its matrix", () => {
    const view = viewOf(fixtures.partial_unresolved_role_id)
    expect(view.receipts.length).toBe(2)
    expect(view.capabilities.length).toBe(15)
    expect(view.gaps.map(gap => gap.code)).toEqual(["ROLE_ID_UNRESOLVED"])
  })

  it("incomplete and empty-authoritative render zero roles but say opposite things", () => {
    const empty = viewOf(fixtures.empty_authoritative)
    const incomplete = viewOf(fixtures.partial_unresolved_role_id)
    expect(empty.roles).toEqual(incomplete.roles)
    expect(empty.emptyAuthoritative).not.toBe(incomplete.emptyAuthoritative)
    expect(empty.headline).not.toBe(incomplete.headline)
  })
})

describe("the ready detail follows the receipts it actually has", () => {
  it("claims the hash-verified decision authority only when one was read", () => {
    const view = viewOf(fixtures.ready)
    expect(view.state).toBe("ready")
    expect(view.detail).toContain("hash-verified decision authority")
    expect(view.detail).toContain(`generation ${fixtures.ready.decision_authority.generation}`)
  })

  it("makes NO such claim when decision_authority is null", () => {
    const source = fixtures.partial_no_decision_authority
    expect(source.decision_authority).toBeNull()
    expect(source.roles.length).toBeGreaterThan(0)

    const view = viewOf(source)
    expect(view.state).toBe("ready")
    expect(view.detail).not.toContain("hash-verified")
    expect(view.detail).toContain("No decision authority")
    expect(view.detail).toContain("no role shows configured or observed action counts")
    expect(view.receipts.map(item => item.label)).toEqual(["Canonical inventory"])
  })

  it("says how many roles the decision authority withheld, when some were", () => {
    const view = viewOf(fixtures.partial)
    expect(view.detail).toContain("withheld decision evidence for 1 of 2 roles")
  })

  it("does not say 'withheld' when every role was decided", () => {
    expect(viewOf(fixtures.ready).detail).not.toContain("withheld")
  })
})

describe("the four non-readable states never collapse into one another", () => {
  it("a snapshot with no identity block says so, and does not say zero roles", () => {
    const view = buildIdentityView(TOPOLOGY)
    expect(view.state).toBe("absent")
    expect(view.emptyAuthoritative).toBe(false)
    expect(view.headline).toContain("no identity projection")
    expect(view.headline.toLowerCase()).not.toContain("no workload")
    expect(view.detail).toContain("estate projection worker")
  })

  it("a null identity block is absent, not invalid", () => {
    expect(viewOf(null).state).toBe("absent")
  })

  it("a non-object identity block is withheld, never rendered as data", () => {
    for (const bad of ["{}", 42, [], true]) {
      const view = viewOf(bad)
      expect(view.state).toBe("invalid")
      expect(view.roles).toEqual([])
    }
  })

  it("a foreign contract version is withheld and names both versions", () => {
    const view = viewOf({ ...fixtures.ready, contract_version: "estate-identity-access/v2" })
    expect(view.state).toBe("invalid")
    expect(view.detail).toContain(IDENTITY_ACCESS_CONTRACT_VERSION)
    expect(view.detail).toContain("estate-identity-access/v2")
  })

  it("an unavailable projection names every gap the projector reported", () => {
    const view = viewOf(fixtures.unavailable)
    expect(view.state).toBe("unavailable")
    expect(view.emptyAuthoritative).toBe(false)
    expect(view.gaps.map(gap => gap.code)).toEqual(["ACTIVE_INVENTORY_POINTER_MISSING"])
  })

  it("no state returns an empty view with nothing to explain it", () => {
    for (const view of [
      buildIdentityView(TOPOLOGY),
      viewOf("bad"),
      viewOf({ ...fixtures.ready, status: "unknown" }),
      viewOf(fixtures.unavailable),
      viewOf(fixtures.empty_authoritative),
      viewOf(fixtures.partial_unresolved_role_id),
      viewOf(fixtures.partial_no_decision_authority),
      viewOf(fixtures.ready),
    ]) {
      expect(view.headline.length).toBeGreaterThan(20)
      expect(view.detail.length).toBeGreaterThan(20)
    }
  })
})

describe("scope binding", () => {
  it("verifies every field both payloads carry", () => {
    const fields = viewOf(fixtures.ready).scopeBinding!.verified.map(item => item.field).sort()
    expect(fields).toEqual(["account_id", "region", "system_name", "vpc_id"])
    expect(viewOf(fixtures.ready).scopeBinding!.mismatches).toEqual([])
  })

  it("marks customer_id echoed-only, because the topology payload cannot check it", () => {
    const binding = viewOf(fixtures.ready).scopeBinding!
    expect(binding.echoedOnly.map(item => item.field)).toContain("customer_id")
    expect(binding.verified.map(item => item.field)).not.toContain("customer_id")
  })

  it("withholds tenant data when the identity block was built for another account", () => {
    const view = viewOf({
      ...fixtures.ready,
      scope: { ...fixtures.ready.scope, account_id: "999988887777" },
    })
    expect(view.state).toBe("scope_mismatch")
    expect(view.roles).toEqual([])
    expect(view.graph.nodes).toEqual([])
    expect(view.detail).toContain("999988887777")
    expect(view.detail).toContain("416651950952")
    expect(view.capabilities.length).toBe(15)
  })

  it("a field the topology payload does not carry is echoed, never counted as verified", () => {
    const binding = bindScope(
      { customer_id: "cust-1", system_name: "testbed-webshop", region: "eu-west-1" },
      { system: "testbed-webshop", account_id: null, region: null, vpc_id: null } as any,
    )
    expect(binding.verified.map(item => item.field)).toEqual(["system_name"])
    expect(binding.echoedOnly.map(item => item.field).sort()).toEqual(["customer_id", "region"])
  })
})

describe("workload → role → decision", () => {
  it("draws one edge family per hop and no others", () => {
    const families = [...new Set(viewOf(fixtures.partial).graph.edges.map(edge => edge.family))]
    expect(families.sort()).toEqual(["ROLE_ACTION_DECISION", "WORKLOAD_USES_ROLE"])
  })

  it("links every workload the projector bound, by its topology node id", () => {
    const view = viewOf(fixtures.partial)
    const workloads = view.graph.nodes
      .filter(node => node.kind === "workload")
      .map(node => (node as any).visibleId)
      .sort()
    expect(workloads).toEqual(["i-api", "i-web"])
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
    const byTarget = new Map(
      viewOf(fixtures.partial)
        .graph.edges.filter(edge => edge.family === "ROLE_ACTION_DECISION")
        .map(edge => [edge.to, edge] as const),
    )
    expect(byTarget.get("decision:AROAEXAMPLE")!.plane).toBe("observed")
    expect(byTarget.get("decision:AROAAPI")!.plane).toBe("configured")
  })

  it("a withheld decision shows no counts at all — zero is not unknown", () => {
    const node: any = viewOf(fixtures.partial).graph.nodes.find(
      item => item.id === "decision:AROAAPI",
    )
    expect(node.state).toBe("unavailable")
    expect(node.configuredGrantCount).toBeNull()
    expect(node.observed).toBeNull()
    expect(node.gaps.map((gap: any) => gap.code)).toEqual(["ROLE_DECISION_UNIVERSE_INCOMPLETE"])
  })

  it("a decided role carries configured and observed counts on separate planes", () => {
    const node: any = viewOf(fixtures.ready).graph.nodes.find(
      item => item.id === "decision:AROAEXAMPLE",
    )
    expect(node.state).toBe("ready")
    expect(node.configuredGrantCount).toBe(1)
    expect(node.observed.successful).toBe(1)
  })

  it("never claims an effective allow — v1 does not decide effective authorization", () => {
    for (const node of viewOf(fixtures.partial).graph.nodes.filter(
      item => item.kind === "decision",
    ) as any[]) {
      expect(node.effectiveAuthorization.availability).toBe("unavailable")
      expect(node.effectiveAuthorization.decision).toBeNull()
      expect(node.effectiveAuthorization.reasonCodes.length).toBeGreaterThan(0)
    }
  })
})

describe("motion is a claim, so it is gated twice", () => {
  it("only the observed hop may animate", () => {
    for (const edge of viewOf(fixtures.ready).graph.edges) {
      if (edge.animated) expect(edge.plane).toBe("observed")
    }
  })

  it("a configured attachment never animates", () => {
    const attachments = viewOf(fixtures.partial).graph.edges.filter(
      edge => edge.family === "WORKLOAD_USES_ROLE",
    )
    expect(attachments.length).toBeGreaterThan(0)
    expect(attachments.every(edge => edge.animated === false)).toBe(true)
  })

  it("an observed hop with NO decision generation behind it does not animate", () => {
    const graph = buildGraph(
      [
        {
          role_id: "R",
          workload_ids: ["i-a"],
          configured_grants: { state: "ready", exact_action_count: 1 },
          observed_use: { state: "ready" },
        },
      ] as any,
      { decisionGeneration: null },
    )
    const hop = graph.edges.find(edge => edge.family === "ROLE_ACTION_DECISION")!
    expect(hop.plane).toBe("observed")
    expect(hop.animated).toBe(false)
  })

  it("the same hop animates once a generation stands behind it", () => {
    const graph = buildGraph(
      [
        {
          role_id: "R",
          workload_ids: ["i-a"],
          configured_grants: { state: "ready", exact_action_count: 1 },
          observed_use: { state: "ready" },
        },
      ] as any,
      { decisionGeneration: 12 },
    )
    expect(graph.edges.find(edge => edge.family === "ROLE_ACTION_DECISION")!.animated).toBe(true)
  })

  it("the withheld role in a real partial payload never animates", () => {
    const hop = viewOf(fixtures.partial).graph.edges.find(
      edge => edge.to === "decision:AROAAPI",
    )!
    expect(hop.animated).toBe(false)
  })
})

describe("map layout", () => {
  it("places each kind in its own lane, left to right", () => {
    const layout = layoutGraph(viewOf(fixtures.partial).graph)
    const x = (kind: string) =>
      layout.nodes.filter(item => item.node.kind === kind).map(item => item.x)
    expect(Math.max(...x("workload"))).toBeLessThan(Math.min(...x("role")))
    expect(Math.max(...x("role"))).toBeLessThan(Math.min(...x("decision")))
  })

  it("routes every edge left to right, so direction is geometric not just labelled", () => {
    const view = viewOf(fixtures.partial)
    const layout = layoutGraph(view.graph)
    const byId = new Map(layout.nodes.map(item => [item.node.id, item] as const))
    expect(layout.edges.length).toBe(view.graph.edges.length)
    for (const placed of layout.edges) {
      const from = byId.get(placed.edge.from)!
      const to = byId.get(placed.edge.to)!
      expect(from.x + from.width).toBeLessThan(to.x)
      expect(placed.path.startsWith("M ")).toBe(true)
      expect(placed.path).toContain(" C ")
    }
  })

  it("grows its canvas height with the tallest lane, and never overlaps nodes", () => {
    const one = layoutGraph(viewOf(fixtures.ready).graph)
    const two = layoutGraph(viewOf(fixtures.partial).graph)
    expect(two.height).toBeGreaterThan(one.height)
    const lane = two.nodes.filter(item => item.lane === "role").sort((a, b) => a.y - b.y)
    for (let i = 1; i < lane.length; i += 1) {
      expect(lane[i].y).toBeGreaterThan(lane[i - 1].y + lane[i - 1].height)
    }
  })

  it("is deterministic — the same graph lays out identically twice", () => {
    const graph = viewOf(fixtures.partial).graph
    expect(JSON.stringify(layoutGraph(graph))).toBe(JSON.stringify(layoutGraph(graph)))
  })

  it("lays out an empty graph without throwing", () => {
    const layout = layoutGraph({ nodes: [], edges: [] })
    expect(layout.nodes).toEqual([])
    expect(layout.edges).toEqual([])
    expect(layout.height).toBeGreaterThan(0)
  })
})

describe("receipts and truncation", () => {
  it("surfaces both authority receipts with generation and hashes", () => {
    const view = viewOf(fixtures.ready)
    const inventory = view.receipts.find(item => item.label === "Canonical inventory")!
    expect(inventory.generation).toBe(fixtures.ready.inventory_authority.generation)
    expect(inventory.projectionReceiptHash).toBe(
      fixtures.ready.inventory_authority.projection_receipt_hash,
    )
    const decision = view.receipts.find(item => item.label === "Role action decision")!
    expect(decision.generation).toBe(fixtures.ready.decision_authority.generation)
  })

  it("keeps the inventory receipt when the decision authority was never read", () => {
    expect(viewOf(fixtures.partial_no_decision_authority).receipts.map(r => r.label)).toEqual([
      "Canonical inventory",
    ])
  })

  it("reports truncation and unresolved omissions rather than hiding them", () => {
    const view = viewOf({
      ...fixtures.ready,
      roles_total: 140,
      roles_truncated: true,
      roles_omitted_unresolved: 4,
    })
    expect(view.rolesTotal).toBe(140)
    expect(view.rolesTruncated).toBe(true)
    expect(view.rolesOmittedUnresolved).toBe(4)
  })
})
