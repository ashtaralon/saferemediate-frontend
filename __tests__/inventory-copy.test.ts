/**
 * QA-13 / QA-04: every hold the inventory route can answer has words. The holds are the backend's own, captured by EXECUTING
 * its readiness provider for every onboarding state (fixtures/account-inventory-types/hold-reasons.json): a state or a lapse
 * the backend adds without words here fails this test.
 */
import { describe, expect, it } from "vitest"
import holds from "@/__tests__/fixtures/account-inventory-types/hold-reasons.json"
import { heldCopy, LIFECYCLE_NOW, PASS_LAPSE_COPY } from "@/lib/inventory-copy"

const ACCOUNT = "111122223333"

describe("the readiness holds", () => {
  it("words every non-ACTIVE onboarding state the backend's provider holds on", () => {
    const states = holds.lifecycle_states.filter((state) => state !== "ACTIVE")
    expect(Object.keys(holds.lifecycle_holds).sort()).toEqual([...states].sort())
    for (const [state, code] of Object.entries(holds.lifecycle_holds)) {
      const words = heldCopy(code)
      expect(words, state).not.toContain("CONSUMER_NOT_READY")
      expect(words, state).not.toContain(state)
      if (state !== "OFFBOARDED") expect(words).toContain(`Now: ${LIFECYCLE_NOW[state]}.`)
    }
    expect(heldCopy(holds.lifecycle_holds.OFFBOARDED)).toBe("This account was removed from Cyntro, so its inventory is not shown.")
  })

  it("speaks for the account's data, never for its connection (Settings shows the connector's verified connection)", () => {
    // First-account QA (2026-10-08): 376419027176 was Connected on Settings while this read "its connection is not verified yet".
    for (const [state, words] of Object.entries(LIFECYCLE_NOW)) expect(words, state).not.toMatch(/connect|verif/i)
    expect(heldCopy(holds.lifecycle_holds.INSTALLING)).toBe(
      "Inventory appears once this account's data is active. Now: no stage of its data has been recorded yet.")
  })

  it("words every pass lapse, with or without the verdict's detail", () => {
    expect(Object.keys(PASS_LAPSE_COPY).sort()).toEqual([...holds.pass_lapse_reasons].sort())
    for (const lapse of holds.pass_lapse_reasons) {
      expect(heldCopy(`${ACCOUNT}:CONSUMER_NOT_READY:${lapse}`)).toBe(PASS_LAPSE_COPY[lapse])
      expect(heldCopy(`${ACCOUNT}:CONSUMER_NOT_READY:${lapse}:detail`)).toBe(PASS_LAPSE_COPY[lapse])
    }
  })

  it("shows a hold it has no words for by its own code, never a guess", () => {
    expect(heldCopy(`${ACCOUNT}:CONSUMER_NOT_READY:lifecycle_not_active:SOMETHING_NEW`))
      .toBe(`Inventory is held and not shown (${ACCOUNT}:CONSUMER_NOT_READY:lifecycle_not_active:SOMETHING_NEW).`)
    expect(heldCopy("NO_DATA_ACCOUNTS")).toBe("Inventory is held and not shown (NO_DATA_ACCOUNTS).")
    expect(heldCopy(null)).toBe("Inventory is held and not shown (no reason given).")
  })
})
