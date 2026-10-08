/**
 * The frontend's release-contract declaration (lib/release-contract.json), read by saferemediate-backend's release bundle
 * builder from this checkout: it must be exactly a cyntro-release-contract/v1 `requires` declaration, and the page's own
 * requirement is that same value (Settings C, agent-coordinator/codex-settings-c-release-gate-ack-review-2026-10-04.txt).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import declaration from "@/lib/release-contract.json"
import { CENSUS_CONTRACT, censusPath, parseCensusResponse } from "@/lib/account-census"
import { STACKS_CONTRACT, parseStacksResponse } from "@/lib/system-boundary-stacks"
import { APPLIED_CONTRACT, parseAppliedResponse } from "@/lib/system-boundary-applied"
import { CAPABILITY_CONTRACT, REQUIRED_SAVE_ENVELOPE_LEVEL, parseCapabilityResponse } from "@/lib/system-boundary-capability"
import { RESULT_CONTRACT, parseResultResponse } from "@/lib/system-boundary-result"
import { parseInventoryResponse, RESPONSE_MALFORMED } from "@/lib/account-inventory"
import { SYSTEMS_LIST_ACCEPTS, SYSTEMS_LIST_CONTRACT, systemsListLevel } from "@/lib/scoped-system-catalog"
import {
  ORGANIZATION_DISCOVERY_TEMPLATE_PATH,
  REQUIRED_ACCOUNT_REGISTRATION_CONTRACT,
  offboardRequestBody,
  registrationActionPath,
  registrationStep,
} from "@/lib/account-admin"

describe("the release contract this frontend requires", () => {
  it("is exactly the shape the backend's bundle builder reads: account registration at level 5, the census read at 1, the wizard's", () => {
    expect(declaration).toEqual({ schema: "cyntro-release-contract/v1",
      requires: { account_census_read: 1, account_census_stacks_read: 1, account_registration: 5, declarations_applied: 1,
                  system_boundary_result_read: 1, system_boundary_save: 2, system_boundary_wizard_capability: 1 },
      accepts: { account_census_read: 1, account_census_stacks_read: 1, account_inventory_rows: 3, declarations_applied: 1,
                 system_boundary_result_read: 1, system_boundary_wizard_capability: 1, systems_list_read: 2 } })
    expect(REQUIRED_ACCOUNT_REGISTRATION_CONTRACT).toBe(5)
    expect(CENSUS_CONTRACT).toBe("account_census_read/v1")
  })

  it("requires the wizard's three reads at the level its own code reads (A7 rev-4, 2026-10-08)", () => {
    // C-A GET /api/accounts/{id}/census/stacks, C-C GET /api/system-boundary/declarations/applied and the capability read the
    // page makes before it offers the wizard at all. A backend without them answers 404; the bundle builder refuses that pair.
    expect(STACKS_CONTRACT).toBe(`account_census_stacks_read/v${declaration.requires.account_census_stacks_read}`)
    expect(APPLIED_CONTRACT).toBe(`declarations_applied/v${declaration.requires.declarations_applied}`)
    expect(CAPABILITY_CONTRACT).toBe(`system_boundary_wizard_capability/v${declaration.requires.system_boundary_wizard_capability}`)
    // C-D: the wizard's result screen (components/system-boundary/system-result.tsx) reads GET /api/system-boundary/result.
    expect(RESULT_CONTRACT).toBe(`system_boundary_result_read/v${declaration.requires.system_boundary_result_read}`)
  })

  it("requires save envelope level 2 because the wizard saves stack bindings and resource decisions", () => {
    // Level 1 = roots only; level 2 = + bindings / resource_decisions (backend unified/system_boundary_plan.SAVE_ENVELOPE_LEVEL).
    // A level-1 backend would drop the lists the wizard sends; the bundle builder refuses that pair instead.
    expect(REQUIRED_SAVE_ENVELOPE_LEVEL).toBe(2)
    expect(declaration.requires.system_boundary_save).toBe(REQUIRED_SAVE_ENVELOPE_LEVEL)
  })

  it("requires the census read at level 1 because the account inventory page reads GET /api/accounts/{id}/census", () => {
    // Level 1 = the account_census_read/v1 envelope (A7 S1c; backend api/account_census.py). A backend without it answers
    // 404, which the page could only call unavailable; the bundle builder refuses that pair instead, by name.
    expect(censusPath("222222222222", { depth: "listed_only", cursor: null })).toBe(
      "/api/proxy/accounts/222222222222/census?depth=listed_only&limit=200")
  })

  it("is level 5 because this frontend removes an ACTIVATED account, which only level 5 serves", () => {
    // Level 5 = level 4 + POST .../{id}/offboard {registration_id, registration_version, confirm_account_id} and the listing's
    // removed audit (agent-coordinator/claude-settings-account-offboarding-spec-2026-10-06.txt). A level-4 backend answers 404.
    expect(registrationActionPath("offboard", "222222222222", "acme")).toBe("/api/proxy/admin/accounts/222222222222/offboard?customer_id=acme")
    expect(offboardRequestBody({ registration_id: "a".repeat(32), registration_version: 5 }, " 222222222222 ")).toEqual({
      registration_id: "a".repeat(32), registration_version: 5, confirm_account_id: "222222222222" })
  })

  it("is level 4 because this frontend sends what only level 4 serves: the read role ARN, the stack instructions, the listing role", () => {
    // Level 4 = level 3 + POST /accounts {read_role_arn} checked against the account, GET /connect/instructions before any
    // account, POST /organization/discover {role_arn} and GET /organization/template (agent-coordinator/
    // claude-settings-stage1b-contract-2026-10-05.txt ADDENDUM 5). A level-3 backend drops the ARN unchecked and answers
    // the two new reads 404.
    expect(ORGANIZATION_DISCOVERY_TEMPLATE_PATH).toBe("/api/proxy/admin/accounts/organization/template")
  })

  it("is level 3 because this frontend sends a removal only level 3 serves", () => {
    // Level 3 = level 2 + removing a registration that was never activated (POST .../withdraw) and the runs' measured counts
    // (agent-coordinator/claude-settings-stage1b-contract-2026-10-05.txt ADDENDUM 4). A level-2 backend answers 404.
    expect(registrationActionPath("withdraw", "222222222222", "acme")).toBe("/api/proxy/admin/accounts/222222222222/withdraw?customer_id=acme")
  })

  it("is level 2 because this frontend reads what only level 2 provides: a listed account's evidence and the first inventory from its runs", () => {
    // Level 2 = level 1 + the installation gate, the history refusal, the fence, G9's explicit confirmation on both paths and
    // the K2 first_inventory DTO (agent-coordinator/claude-settings-stage1b-contract-2026-10-05.txt section 4).
    expect(registrationStep({ onboarding_status: "LISTED_ADMITTED", registration: {
      registration_id: "a".repeat(32), registration_version: 1, checking: false, activating: false } }, Date.now()))
      .toEqual({ kind: "RECORDING_LISTED" })
  })

  it("is required because this frontend carries the option-C journey that level 1 provides", () => {
    // The journey (check access, confirm, retry, release) is what an older connector cannot serve.
    expect(registrationStep({ onboarding_status: "PENDING_UNVERIFIED", registration: {
      registration_id: "a".repeat(32), registration_version: 1, checking: false, activating: false } }, Date.now()))
      .toEqual({ kind: "CHECK_ACCESS", refused: null })
  })
})

/** The upper bound (r40, agent-coordinator/claude-settings-fe-accepts-spec-2026-10-07.txt): `accepts` is what this frontend's
 *  parsers can READ, pinned to the parsers themselves by running them -- the backend bundle builder refuses a backend that
 *  publishes newer, so this declaration must never claim more (or less) than the code accepts. */
describe("what this frontend can read (accepts)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capture = (dir: string, name: string): { status: number; body: any } =>
    JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", dir, `${name}.json`), "utf8"))

  it("reads inventory rows up to exactly its declared level: that row contract parses, the next one is malformed", () => {
    const n = declaration.accepts.account_inventory_rows
    const page = capture("account-inventory-captures", "populated_page1")
    const at = (level: number) => {
      const body = structuredClone(page.body)
      body.publication.row_contract = `account_inventory_row/v${level}`
      return parseInventoryResponse(page.status, body, body.account_id)
    }
    expect(at(n)).not.toMatchObject({ reasonCode: RESPONSE_MALFORMED })
    expect(at(n).kind).toBe("data")
    expect(at(n + 1)).toMatchObject({ kind: "unavailable", reasonCode: RESPONSE_MALFORMED })
  })

  it("reads the census answer at exactly its declared level: that contract parses, the next one is not read", () => {
    const n = declaration.accepts.account_census_read
    expect(CENSUS_CONTRACT).toBe(`account_census_read/v${n}`)
    const page = capture("account-census-captures", "populated_page1")
    const at = (level: number) =>
      parseCensusResponse(page.status, { ...structuredClone(page.body), contract: `account_census_read/v${level}` },
        page.body.account_id)
    expect(at(n).state).not.toBe("unavailable")
    expect(at(n + 1).state).toBe("unavailable")
  })

  // The wizard's reads (A7 rev-4). Their captures come from the backend's real-route harness, as the census captures do:
  // CYNTRO_REWRITE_WIZARD_CAPTURES=1 pytest tests/cyntro_data/test_system_boundary_wizard_captures.py writes
  // tests/fixtures/system_boundary_wizard_captures/<name>.json ({_provenance, status, cache_control, body}), copied here
  // pinned to that backend SHA. capability.json is the install default (enabled false), so it parses as "disabled": the
  // v{n+1} case below then also proves the parser checks the contract BEFORE it reads `enabled`. At the time this was written
  // (2026-10-08, build-only phase) the harness had not run, so these read files that exist only once it has.
  /* eslint-disable @typescript-eslint/no-explicit-any -- a capture's body is untyped JSON, as in `capture` above */
  it.each([
    ["account_census_stacks_read", "stacks", (status: number, body: any) => parseStacksResponse(status, body, body.account_id)],
    ["declarations_applied", "applied", (status: number, body: any) => parseAppliedResponse(status, body)],
    ["system_boundary_wizard_capability", "capability", (status: number, body: any) => parseCapabilityResponse(status, body)],
  ] as const)("reads %s at exactly its declared level: that contract parses, the next one is not read", (name, file, parse) => {
    const n = declaration.accepts[name]
    const page = capture("system-boundary-captures", file)
    const at = (level: number) => parse(page.status, { ...structuredClone(page.body), contract: `${name}/v${level}` })
    expect(at(n).kind).not.toBe("unavailable")
    expect(at(n + 1).kind).toBe("unavailable")
  })

  // C-D (A7 rev-4): the wizard's result. The capture is the backend's real served answer ("result": a v2 publication named by
  // a real cohort build), from the same harness as the wizard captures; the account its parser is asked for is the one the
  // capture's own request named (_provenance.request.query.account_id), since an answer for another account is refused.
  it("reads the result at exactly its declared level: that contract parses, the next one is not read", () => {
    const n = declaration.accepts.system_boundary_result_read
    expect(RESULT_CONTRACT).toBe(`system_boundary_result_read/v${n}`)
    const page = capture("system-boundary-captures", "result") as { status: number; body: any; _provenance: any }
    const accountId = String(page._provenance.request.query.account_id)
    const at = (level: number) =>
      parseResultResponse(page.status, { ...structuredClone(page.body), contract: `system_boundary_result_read/v${level}` },
        accountId)
    expect(at(n).kind).not.toBe("unavailable")
    expect(at(n + 1).kind).toBe("unavailable")
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // A7 B5: the Systems list. Level 1 is the answer with no contract; level 2 "systems_list_read/v2" (one row per system identity,
  // deployments beneath). The capture is the backend's real /api/systems v2 answer (Phase 2's harness writes
  // systems_list_v2_deployments in the M3 backend commit; copied here pinned to that SHA) -- red until it has run, by design.
  it("reads the Systems list up to exactly its declared level: v1 and v2 parse, the next one is not read", () => {
    const n = declaration.accepts.systems_list_read
    expect(n).toBe(SYSTEMS_LIST_ACCEPTS)
    expect(SYSTEMS_LIST_CONTRACT).toBe(`systems_list_read/v${n}`)
    const page = capture("systems-list-captures", "systems_list_v2_deployments")
    const at = (level: number) => systemsListLevel({ ...structuredClone(page.body), contract: `systems_list_read/v${level}` })
    expect(systemsListLevel(page.body)).toBe(2)
    expect(at(1)).toBe(1)
    expect(at(n)).toBe(n)
    expect(at(n + 1)).toBeNull()
    const v1Body = structuredClone(page.body)
    delete v1Body.contract
    expect(systemsListLevel(v1Body)).toBe(1)
  })
})
