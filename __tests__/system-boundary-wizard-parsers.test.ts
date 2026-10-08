/**
 * A7 rev 4: the wizard's strict readers -- stacks (C-A), applied (C-C), capability, result (C-D) -- on synthetic answers in the
 * backend's exact shapes (api/account_census_stacks.py, unified/system_boundary_applied.py, unified/system_boundary_wizard.py),
 * and on the REAL route captures once the backend harness has written them (tests/cyntro_data/
 * test_system_boundary_wizard_captures.py, copied into __tests__/fixtures/system-boundary-captures/).
 *
 * WRITTEN 2026-10-08 UNDER ALON'S BUILD-NOW RULE: NOT EXECUTED. The capture cases need the copied captures (test phase).
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { APPLIED_CONTRACT, isApplied, parseAppliedResponse } from "@/lib/system-boundary-applied"
import {
  CAPABILITY_CONTRACT,
  CAPABILITY_ROUTE_ABSENT,
  REQUIRED_SAVE_ENVELOPE_LEVEL,
  capabilitySentence,
  parseCapabilityResponse,
} from "@/lib/system-boundary-capability"
import {
  MEMBERSHIP_V2_NOT_SERVED,
  RESULT_CONTRACT,
  parseResultResponse,
  notMemberSentence,
  proofSentence,
  savedSystemKey,
} from "@/lib/system-boundary-result"
import { STACKS_CONTRACT, parseStackArn, parseStacksResponse, stackCaveat } from "@/lib/system-boundary-stacks"

const ACCOUNT = "111111111111"
const PARENT = `arn:aws:cloudformation:eu-west-1:${ACCOUNT}:stack/shop/0f0f0f0f-1111-4222-8333-444455556666`
const CHILD = `arn:aws:cloudformation:eu-west-1:${ACCOUNT}:stack/shop-Db-1ABC/0f0f0f0f-1111-4222-8333-777788889999`

function stack(overrides: Record<string, unknown> = {}) {
  return {
    stack_id: PARENT, stack_name: "shop", region: "eu-west-1", stack_status: "UPDATE_COMPLETE", settled: true,
    parent_stack_id: null, read_outcome: "COMPLETE",
    resources: { total: 2, by_type: { "ec2:instance": 1, "cloudformation:stack": 1 }, collected: 1, listed_only: 1,
                 inventory_pending: 0, deleted: 0, not_a_resource: null },
    tagged_for_other_systems: [{ system_name: "payments", count: 1 }], bound: null, ...overrides,
  }
}

function stacksBody(overrides: Record<string, unknown> = {}) {
  return {
    contract: STACKS_CONTRACT, account_id: ACCOUNT, state: "populated", reason_code: null,
    account_authority: { registration_id: "5".repeat(32), install_account: false },
    publication: { attempt: "a".repeat(32), generation: 3, source_identity: "v1:" + "3".repeat(64),
                   authority_digest: "v1:" + "2".repeat(64), published_at_epoch: 1, confirmed_at_epoch: 1 },
    stacks: [stack(), stack({ stack_id: CHILD, stack_name: "shop-Db-1ABC", parent_stack_id: PARENT,
                               resources: { total: 1, by_type: { "dynamodb:table": 1 }, collected: 0, listed_only: 1,
                                            inventory_pending: 0, deleted: 0, not_a_resource: null },
                               tagged_for_other_systems: [] })],
    bindings_state: "read", ...overrides,
  }
}

function capture(name: string): { status: number; body: unknown } | null {
  const path = resolve(process.cwd(), "__tests__/fixtures/system-boundary-captures", `${name}.json`)
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null
}

describe("the stack list reader (C-A)", () => {
  it("reads a populated answer exactly, nested stack and all", () => {
    const parsed = parseStacksResponse(200, stacksBody(), ACCOUNT)
    expect(parsed.kind).toBe("data")
    if (parsed.kind !== "data") return
    expect(parsed.stacks.map((s) => [s.stackName, s.parentStackId])).toEqual([["shop", null], ["shop-Db-1ABC", PARENT]])
    expect(parsed.stacks[0].resources.notAResource).toBeNull()
    expect(stackCaveat(parsed.stacks[0])).toBeNull()
  })

  it.each([
    ["another contract version", { contract: "account_census_stacks_read/v2" }],
    ["another account", { account_id: "222222222222" }],
    ["a stack of another account", { stacks: [stack({ stack_id: PARENT.replace(ACCOUNT, "222222222222") })] }],
    ["a stack name that is not its ARN's", { stacks: [stack({ stack_name: "other" })] }],
    ["counts by type that do not add up", { stacks: [stack({ resources: { ...stack().resources, total: 5 } })] }],
    ["a settled stack with no status", { stacks: [stack({ stack_status: null })] }],
    ["populated with no stack", { stacks: [] }],
    ["a binding shown while bindings were not read", { bindings_state: "not_configured",
      stacks: [stack({ bound: { system_name: "X", deployment_key: "prod", kind: "exclusive", version: 1 } })] }],
    ["an unknown read outcome", { stacks: [stack({ read_outcome: "MAYBE" })] }],
  ])("refuses %s as unavailable, showing nothing", (_name, overrides) => {
    expect(parseStacksResponse(200, stacksBody(overrides), ACCOUNT).kind).toBe("unavailable")
  })

  it("names the census route's row-less states and keeps errors from carrying data", () => {
    const held = parseStacksResponse(200, stacksBody({ state: "held", reason_code: "AUTHORITY_CHANGED", stacks: [] }), ACCOUNT)
    expect(held).toMatchObject({ kind: "evidence", state: "held", reasonCode: "AUTHORITY_CHANGED" })
    expect(parseStacksResponse(500, stacksBody(), ACCOUNT).kind).toBe("unavailable")
    expect(parseStacksResponse(403, stacksBody({ state: "refused", reason_code: "PERSON_NOT_AUTHORIZED", stacks: [] }), ACCOUNT))
      .toMatchObject({ kind: "refused" })
  })

  it("says why an unsettled or incompletely read stack adds nothing yet", () => {
    const parsed = parseStacksResponse(200, stacksBody({ stacks: [stack({ stack_status: "UPDATE_IN_PROGRESS", settled: false }),
      stack({ stack_id: CHILD, stack_name: "shop-Db-1ABC", read_outcome: "INCOMPLETE:SCOPE_DENIED" })] }), ACCOUNT)
    expect(parsed.kind).toBe("data")
    if (parsed.kind !== "data") return
    expect(stackCaveat(parsed.stacks[0])).toContain("until it settles")
    expect(stackCaveat(parsed.stacks[1])).toContain("SCOPE_DENIED")
    expect(parseStackArn(`arn:aws:cloudformation:eu-west-1:${ACCOUNT}:stack/shop/a1`)).toBeNull()
  })

  it("reads the REAL route's capture at its own version and refuses it at the next", () => {
    const real = capture("stacks")
    if (real === null) return            // copied in the test phase; until then the synthetic cases above stand alone
    expect(parseStacksResponse(real.status, real.body, ACCOUNT_OF(real.body)).kind).toBe("data")
    const next = { ...(real.body as Record<string, unknown>), contract: "account_census_stacks_read/v2" }
    expect(parseStacksResponse(real.status, next, ACCOUNT_OF(real.body)).kind).toBe("unavailable")
  })
})

function ACCOUNT_OF(body: unknown): string {
  return String((body as Record<string, unknown>).account_id)
}

describe("the applied reader (C-C)", () => {
  const base = { contract: APPLIED_CONTRACT, account_id: ACCOUNT, saved_revision: 12, applied_revision: 12, generation: 41,
                 published_at: "2027-01-15T08:00:00+00:00", state: "applied_known", reason_code: null }

  it("is applied only by the numbers", () => {
    const parsed = parseAppliedResponse(200, base)
    expect(parsed.kind).toBe("applied")
    expect(isApplied(parsed, 12)).toBe(true)
    expect(isApplied(parsed, 13)).toBe(false)
    const notYet = parseAppliedResponse(200, { ...base, state: "not_applied_yet", reason_code: "NO_SERVED_COHORT",
                                               applied_revision: null, generation: null, published_at: null })
    expect(notYet.kind).toBe("not_applied")
    expect(isApplied(notYet, 1)).toBe(false)
  })

  it.each([
    ["an applied revision above the saved one", { applied_revision: 13 }],
    ["applied with no revision", { applied_revision: null }],
    ["another contract version", { contract: "declarations_applied/v2" }],
    ["unavailable at 200", { state: "unavailable", applied_revision: null }],
    ["not initialized with a saved revision", { state: "not_initialized" }],
  ])("refuses %s", (_name, overrides) => {
    expect(parseAppliedResponse(200, { ...base, ...overrides }).kind).toBe("unavailable")
  })

  it("reads the route's own refusal as refused, and the REAL capture at its version only", () => {
    expect(parseAppliedResponse(403, { detail: { code: "PERSON_NOT_AUTHORIZED", account_id: ACCOUNT } }).kind).toBe("refused")
    const real = capture("applied")
    if (real === null) return
    expect(parseAppliedResponse(real.status, real.body).kind).toBe("applied")
    expect(parseAppliedResponse(real.status, { ...(real.body as object), contract: "declarations_applied/v2" }).kind).toBe("unavailable")
  })
})

describe("the capability reader", () => {
  const off = { contract: CAPABILITY_CONTRACT, enabled: false, save_envelope_level: 2, reader_contract: "implicit-snapshot-v2",
                reason_code: "WIZARD_DISABLED" }

  it("reads the contract BEFORE anything else: a v2 body is unavailable, whatever it says", () => {
    expect(parseCapabilityResponse(200, off).kind).toBe("disabled")
    expect(parseCapabilityResponse(200, { ...off, contract: "system_boundary_wizard_capability/v2" }).kind).toBe("unavailable")
    expect(parseCapabilityResponse(200, { ...off, enabled: true, reason_code: null }).kind).toBe("enabled")
    expect(REQUIRED_SAVE_ENVELOPE_LEVEL).toBe(2)
  })

  it("keeps the steps hidden on another save level or reader contract, and an older backend says nothing", () => {
    const on = { ...off, enabled: true, reason_code: null }
    expect(parseCapabilityResponse(200, { ...on, save_envelope_level: 3 })).toMatchObject({ kind: "disabled",
      reasonCode: "SAVE_LEVEL_MISMATCH" })
    expect(parseCapabilityResponse(200, { ...on, reader_contract: "implicit-snapshot-v1" })).toMatchObject({ kind: "disabled",
      reasonCode: "READER_CONTRACT_MISMATCH" })
    const absent = parseCapabilityResponse(404, { detail: "Not Found" })
    expect(absent).toMatchObject({ kind: "unavailable", reasonCode: CAPABILITY_ROUTE_ABSENT })
    expect(capabilitySentence(absent)).toBeNull()
    expect(parseCapabilityResponse(403, { detail: { code: "PERSON_NOT_AUTHORIZED" } }).kind).toBe("refused")
    expect(parseCapabilityResponse(200, { ...off, reason_code: null }).kind).toBe("unavailable")   // off must say why
  })

  it("reads the REAL capture (the install default: off) at its version only", () => {
    const real = capture("capability")
    if (real === null) return
    expect(parseCapabilityResponse(real.status, real.body).kind).toBe("disabled")
    expect(parseCapabilityResponse(real.status, { ...(real.body as object), contract: "system_boundary_wizard_capability/v2" }).kind)
      .toBe("unavailable")
  })
})


// ── the result reader (C-D): cyntro_data/semantic/system_boundary_result.py's envelope ─────────────────────────────────

const SYSTEM = "authored_system:" + "1".repeat(64)

function resultBody(overrides: Record<string, unknown> = {}) {
  return {
    contract: RESULT_CONTRACT, state: "served", reason_code: null, account_id: ACCOUNT, system_key: SYSTEM,
    generation: 41, published_at: "2027-01-15T08:00:00+00:00", system_name: "Payments",
    members: [{ resource_uid: "uid:web", resource_type: "ec2:instance", state: "ACTIVE",
                proof: { source: "stack", stack_id: PARENT, logical_id: "Web", proof: "stack_listing" } },
              { resource_uid: "uid:old", state: "STALE", stale_reason: "SUPPORT_CHECK_INCOMPLETE",
                proof: { source: "rule", origin: "derived" } }],
    dependencies: [], held: [{ resource_uid: "uid:db", state: "PENDING_REVIEW", kind: "CANDIDATE", reason: "root_conflict" }],
    not_members: [],
    counts: { members: 3, stale_members: 1, dependencies: 0, held: 1, not_members: 0 },
    omitted: { members: 1 }, ...overrides,
  }
}

describe("the result reader (C-D)", () => {
  it("reads a served result exactly: lists, exact counts, what the cap left out", () => {
    const parsed = parseResultResponse(200, resultBody(), ACCOUNT)
    expect(parsed.kind).toBe("served")
    if (parsed.kind !== "served") return
    expect([parsed.generation, parsed.counts.members, parsed.lists.members.length, parsed.omitted.members]).toEqual([41, 3, 2, 1])
    expect(proofSentence(parsed.lists.members[0])).toBe(`is listed by stack ${PARENT} as Web`)
  })

  it("says how a member's identity is known apart from its lifetime, and the claims it outranked (R4 / R5 / R9)", () => {
    const row = (proof: Record<string, unknown>) => ({ resource_uid: "uid:x", state: "ACTIVE", proof })
    const stack = { source: "stack", stack_id: PARENT, logical_id: "Bucket", proof: "stack_listing" }
    expect(proofSentence(row({ ...stack, identity: "stack_tag", lineage_unproven: true }))).toBe(
      `is listed by stack ${PARENT} as Bucket; identity confirmed by this stack's own tag on the resource now; `
      + "continuity since it joined is not proven by a creation marker")
    const named = proofSentence(row({ ...stack, identity_unconfirmed: true }))
    expect(named).toContain("identity not independently confirmed (named by the stack only)")
    expect(proofSentence(row({ ...stack, identity: "stack_tag", identity_unconfirmed: true })))
      .not.toContain("not independently confirmed")                                    // a proven identity is never undercut
    expect(proofSentence(row({ source: "rule", origin: "root:aws_tag", identity: "marker" }))).toBe(
      "found by Cyntro's rules (root:aws_tag); identity confirmed by its creation marker")
    expect(proofSentence(row({ source: "decision", version: 3, overridden_claims: [
      { system_key: "authored_system:1", system_name: null, origin: "stack" },
      { system_key: "ledger", system_name: "Ledger", origin: "aws_tag" }] }))).toBe(
      "included by a person's decision; also claimed by authored_system:1 (stack listing), Ledger (AWS tag) -- "
      + "kept and shown, not applied")
    expect(proofSentence(row({ source: "decision", declared_by: ["tag:ledger"] }))).toContain(
      "also claimed by tag:ledger -- kept and shown, not applied")
  })

  it("says why a not-a-member row is not one, with what was set aside (R6 / R9 / R1)", () => {
    expect(notMemberSentence({ resource_uid: "uid:eks", state: "APPLIED", kind: "BINDING_OUTCOME", reason: "SHARED_CLUSTER",
                               consumer_systems: ["Ledger"], suppressed: ["stack"],
                               hold_reason: "SEVERAL_SYSTEMS_DECIDE_PER_RESOURCE" })).toBe(
      "not this system's member: a shared cluster other systems' workloads run on (Ledger); this system's stack listing "
      + "claim was set aside (it had been held: SEVERAL_SYSTEMS_DECIDE_PER_RESOURCE); a shared cluster belongs to a "
      + "system only by a person's explicit decision [SHARED_CLUSTER]")
    // A person's decision may have assigned the cluster to ANOTHER system (it is ACTIVE there, R6's exception): this
    // system's row never claims the cluster is nobody's.
    expect(notMemberSentence({ resource_uid: "uid:eks", state: "APPLIED", kind: "BINDING_OUTCOME", reason: "SHARED_CLUSTER" }))
      .not.toContain("no system")
    expect(notMemberSentence({ resource_uid: "uid:x", state: "APPLIED", kind: "DECISION_OUTCOME",
                               reason: "EXCLUDED_BY_DECISION", suppressed: ["aws_tag", "stack"], propagation_stopped: true }))
      .toBe("excluded by a person's decision; this system's AWS tag and stack listing claim was set aside; it also stopped "
            + "this system's propagation there [EXCLUDED_BY_DECISION]")
    expect(notMemberSentence({ resource_uid: "uid:x", state: "RETIRED", kind: "RETIRED",
                               reason: "SHARED_CLUSTER_MEMBER_OF_NONE", valid_to: "2026-10-08T00:00:00+00:00" }))
      .toBe("no longer a member on 2026-10-08T00:00:00+00:00 [SHARED_CLUSTER_MEMBER_OF_NONE]")
    expect(notMemberSentence({ resource_uid: "arn:q", state: "TARGET_UNAVAILABLE", reason: "cannot be a member yet (listed only)" }))
      .toBe("cannot be a member yet (listed only)")
  })

  it("refuses a list that disagrees with its count, another account's answer, and a served answer without a generation", () => {
    expect(parseResultResponse(200, resultBody({ omitted: {} }), ACCOUNT).kind).toBe("unavailable")
    expect(parseResultResponse(200, resultBody(), "222222222222").kind).toBe("unavailable")
    expect(parseResultResponse(200, resultBody({ generation: null }), ACCOUNT).kind).toBe("unavailable")
    expect(parseResultResponse(200, resultBody({ counts: { members: 3, stale_members: 4, dependencies: 0, held: 1,
                                                           not_members: 0 } }), ACCOUNT).kind).toBe("unavailable")
  })

  it("says a hold as itself, never as an empty system", () => {
    const held = parseResultResponse(200, resultBody({ state: "held", reason_code: MEMBERSHIP_V2_NOT_SERVED, generation: null,
                                                      published_at: null, system_name: null, members: [], held: [],
                                                      counts: null, omitted: {} }), ACCOUNT)
    expect(held).toMatchObject({ kind: "held", reasonCode: MEMBERSHIP_V2_NOT_SERVED })
    expect(parseResultResponse(503, resultBody({ state: "unavailable", reason_code: "X" }), ACCOUNT).kind).toBe("unavailable")
    expect(parseResultResponse(403, { detail: { code: "PERSON_NOT_AUTHORIZED" } }, ACCOUNT)).toMatchObject({ kind: "refused" })
  })

  it("takes the system key from the ONE SYSTEM record a save names, never one of several", () => {
    expect(savedSystemKey({ written: [{ key: `SYSTEM#${SYSTEM}` }, { key: "DEPLOYMENT#d" }], references: [] })).toBe(SYSTEM)
    expect(savedSystemKey({ written: [], references: [] })).toBeNull()
    expect(savedSystemKey({ written: [{ key: `SYSTEM#${SYSTEM}` }], references: [{ key: "SYSTEM#authored_system:2" }] })).toBeNull()
  })

  it.each([["result", "served"], ["result_v1_held", "held"]])("reads the REAL %s capture as %s", (name, kind) => {
    const taken = capture(name)
    expect(taken, `capture ${name} not copied yet (test phase)`).not.toBeNull()
    if (taken === null) return
    // The account the harness asked for, from the capture's own provenance (never this file's constant).
    const asked = (taken as unknown as { _provenance: { request: { query: Record<string, string> } } })._provenance.request.query
    expect(parseResultResponse(taken.status, taken.body, asked.account_id).kind).toBe(kind)
  })
})
