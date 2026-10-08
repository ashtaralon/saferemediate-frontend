/**
 * A7 rev 4: the wizard's three strict readers -- stacks (C-A), applied (C-C), capability -- on synthetic answers in the
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
