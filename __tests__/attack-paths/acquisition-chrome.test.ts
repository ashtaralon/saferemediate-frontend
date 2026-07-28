import { describe, expect, it } from "vitest"
import {
  acquisitionChrome,
  isAcquisitionNoteworthy,
  shortPrincipal,
} from "@/lib/attack-paths/acquisition-chrome"

const base = {
  acquisition: "intra_account_assume_role",
  assumable_by: ["AWS:arn:aws:iam::745783559495:role/pivot"],
  account_wide_trust: false,
  trust_has_conditions: false,
  resolves_initial_access: false,
}

describe("acquisition chrome", () => {
  it("renders nothing when the server has nothing provable", () => {
    // Absence of an acquisition claim is not itself a finding — no chip.
    expect(acquisitionChrome(null)).toBeNull()
    expect(acquisitionChrome(undefined)).toBeNull()
    expect(acquisitionChrome({ ...base, acquisition: "" })).toBeNull()
  })

  it("names a single trusting principal", () => {
    const c = acquisitionChrome(base)!
    expect(c.label).toBe("Assumable by pivot")
    expect(c.accountWide).toBe(false)
    expect(isAcquisitionNoteworthy(c)).toBe(false)
  })

  it("flags account-wide unconditioned trust as the noteworthy case", () => {
    const c = acquisitionChrome({
      ...base,
      assumable_by: ["AWS:arn:aws:iam::745783559495:root"],
      account_wide_trust: true,
    })!
    expect(c.label).toBe("Assumable by anyone in the account")
    expect(c.accountWide).toBe(true)
    expect(c.unconditioned).toBe(true)
    expect(isAcquisitionNoteworthy(c)).toBe(true)
  })

  it("does not flag account-wide when conditions apply", () => {
    const c = acquisitionChrome({
      ...base,
      assumable_by: ["AWS:arn:aws:iam::745783559495:root"],
      account_wide_trust: true,
      trust_has_conditions: true,
    })!
    expect(isAcquisitionNoteworthy(c)).toBe(false)
    expect(c.detail).toContain("not evaluated")
  })

  it("never lets the tooltip imply entry was explained", () => {
    // The whole point of the acquisition/initial-access split.
    for (const acq of [
      base,
      { ...base, account_wide_trust: true },
      { ...base, trust_has_conditions: null },
    ]) {
      const c = acquisitionChrome(acq)!
      expect(c.detail).toContain("does NOT explain how they got into the account")
      expect(c.detail).toContain("still unknown")
    }
  })

  it("counts principals rather than listing them when there are several", () => {
    const c = acquisitionChrome({
      ...base,
      assumable_by: ["AWS:arn:aws:iam::1:role/a", "AWS:arn:aws:iam::1:role/b"],
    })!
    expect(c.label).toBe("Assumable by 2 principals")
  })

  it("shortens principals readably", () => {
    expect(shortPrincipal("AWS:arn:aws:iam::1:role/pivot")).toBe("pivot")
    expect(shortPrincipal("AWS:arn:aws:iam::1:root")).toBe("account root")
    expect(shortPrincipal("weird")).toBe("weird")
  })
})
