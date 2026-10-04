/**
 * The frontend's release-contract declaration (lib/release-contract.json), read by saferemediate-backend's release bundle
 * builder from this checkout: it must be exactly a cyntro-release-contract/v1 `requires` declaration, and the page's own
 * requirement is that same value (Settings C, agent-coordinator/codex-settings-c-release-gate-ack-review-2026-10-04.txt).
 */
import { describe, expect, it } from "vitest"

import declaration from "@/lib/release-contract.json"
import { REQUIRED_ACCOUNT_REGISTRATION_CONTRACT, registrationStep } from "@/lib/account-admin"

describe("the release contract this frontend requires", () => {
  it("is exactly the shape the backend's bundle builder reads, at level 1", () => {
    expect(declaration).toEqual({ schema: "cyntro-release-contract/v1", requires: { account_registration: 1 } })
    expect(REQUIRED_ACCOUNT_REGISTRATION_CONTRACT).toBe(1)
  })

  it("is required because this frontend carries the option-C journey that level 1 provides", () => {
    // The journey (check access, confirm, retry, release) is what an older connector cannot serve.
    expect(registrationStep({ onboarding_status: "PENDING_UNVERIFIED", registration: {
      registration_id: "a".repeat(32), registration_version: 1, checking: false, activating: false } }, Date.now()))
      .toEqual({ kind: "CHECK_ACCESS", refused: null })
  })
})
