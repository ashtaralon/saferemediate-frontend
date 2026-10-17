/**
 * A hold that is a defined STATE of the install reads as that state, in plain words; every other hold keeps the
 * server's own reason verbatim. NO_DATA_ACCOUNTS: a control-plane install with no workload account connected
 * (backend cyntro_data/semantic/estate_read.py) — the estate is not empty, it has not been connected.
 */
import { describe, expect, it } from "vitest"

import { semanticHoldMessage, semanticStatusHold } from "@/lib/semantic-hold"

describe("state holds", () => {
  it("no connected workload account points the operator to Settings › Accounts", () => {
    const hold = semanticStatusHold({ semantic_status: "not_recorded", hold_reason: "NO_DATA_ACCOUNTS" })
    expect(hold).toEqual({ kind: "not_recorded", reason: "NO_DATA_ACCOUNTS", state: "NO_DATA_ACCOUNTS" })
    expect(semanticHoldMessage(hold!)).toBe(
      "No workload account is connected yet — connect one in Settings › Accounts",
    )
  })

  it("any other hold keeps the server's words verbatim", () => {
    const hold = semanticStatusHold({
      semantic_status: "not_recorded",
      hold_reason: "222222222222:CONSUMER_NOT_READY:lifecycle_not_active:SHADOW",
    })
    expect(semanticHoldMessage(hold!)).toBe(
      "Not recorded yet — 222222222222:CONSUMER_NOT_READY:lifecycle_not_active:SHADOW",
    )
  })

  it("the state wording never replaces a refusal", () => {
    expect(semanticHoldMessage({ kind: "refused", reason: "NO_DATA_ACCOUNTS" })).toBe(
      "Read refused by the server — NO_DATA_ACCOUNTS",
    )
  })
})
