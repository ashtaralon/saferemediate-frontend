/**
 * The frontend's release-contract declaration (lib/release-contract.json), read by saferemediate-backend's release bundle
 * builder from this checkout: it must be exactly a cyntro-release-contract/v1 `requires` declaration, and the page's own
 * requirement is that same value (Settings C, agent-coordinator/codex-settings-c-release-gate-ack-review-2026-10-04.txt).
 */
import { describe, expect, it } from "vitest"

import declaration from "@/lib/release-contract.json"
import { CENSUS_CONTRACT, censusPath } from "@/lib/account-census"
import {
  ORGANIZATION_DISCOVERY_TEMPLATE_PATH,
  REQUIRED_ACCOUNT_REGISTRATION_CONTRACT,
  offboardRequestBody,
  registrationActionPath,
  registrationStep,
} from "@/lib/account-admin"

describe("the release contract this frontend requires", () => {
  it("is exactly the shape the backend's bundle builder reads: account registration at level 5, the census read at 1", () => {
    expect(declaration).toEqual({ schema: "cyntro-release-contract/v1",
      requires: { account_census_read: 1, account_registration: 5 } })
    expect(REQUIRED_ACCOUNT_REGISTRATION_CONTRACT).toBe(5)
    expect(CENSUS_CONTRACT).toBe("account_census_read/v1")
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
