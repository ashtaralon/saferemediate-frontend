/**
 * The frontend's release-contract declaration (lib/release-contract.json), read by saferemediate-backend's release bundle
 * builder from this checkout: it must be exactly a cyntro-release-contract/v1 `requires` declaration, and the page's own
 * requirement is that same value (Settings C, agent-coordinator/codex-settings-c-release-gate-ack-review-2026-10-04.txt).
 */
import { describe, expect, it } from "vitest"

import declaration from "@/lib/release-contract.json"
import { REQUIRED_ACCOUNT_REGISTRATION_CONTRACT, registrationActionPath, registrationStep } from "@/lib/account-admin"

describe("the release contract this frontend requires", () => {
  it("is exactly the shape the backend's bundle builder reads, at level 3", () => {
    expect(declaration).toEqual({ schema: "cyntro-release-contract/v1", requires: { account_registration: 3 } })
    expect(REQUIRED_ACCOUNT_REGISTRATION_CONTRACT).toBe(3)
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
