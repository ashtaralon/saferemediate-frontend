/**
 * AP182 · lib/attack-paths/lifecycle-coverage.ts — read the backend's lifecycle evidence exactly as served.
 *
 * Real shapes come from the captured backend bodies (__tests__/fixtures/ap182-lifecycle, provenance in its README).
 * The malformed-input cases are CONSTRUCTED values, labelled where they appear: no producer writes them, and the reader
 * must still never turn them into a count or into "none held".
 */
import { describe, expect, it } from "vitest"

import allHeld from "@/__tests__/fixtures/ap182-lifecycle/all-lifecycle-held.json"
import allMissing from "@/__tests__/fixtures/ap182-lifecycle/all-record-missing.json"
import allResolved from "@/__tests__/fixtures/ap182-lifecycle/all-resolved.json"
import section from "@/__tests__/fixtures/ap182-lifecycle/target-catalog-section.json"
import {
  LIFECYCLE_HELD_EXPLANATION,
  LIFECYCLE_HELD_REASON,
  deriveAllLifecycleCoverage,
  heldCountOrNull,
  heldPathsPhrase,
  targetCoverageCause,
  targetCoverageDescription,
  targetCoverageNote,
  targetZeroCoverageSubtitle,
  unverifiedReasonText,
} from "@/lib/attack-paths/lifecycle-coverage"

type Entry = { name: string; coverage_withheld_reason?: string | null; held_path_count?: number }
const TARGETS = (section as { targets: Entry[] }).targets
const target = (name: string) => TARGETS.find((t) => t.name === name)!
const causeOf = (t: Entry) => targetCoverageCause(t.coverage_withheld_reason, t.held_path_count)

describe("heldCountOrNull: a count only when the backend supplied a well-formed one", () => {
  it.each([
    [1, 1], [3, 3], [0, null], [-1, null], [1.5, null], ["2", null], [true, null], [null, null], [undefined, null],
    [Number.NaN, null], [Number.POSITIVE_INFINITY, null],
  ])("%p → %p", (value, expected) => {
    expect(heldCountOrNull(value)).toBe(expected)
  })

  it("phrases a count, and an unreported one as not reported (never 0)", () => {
    expect(heldPathsPhrase(1)).toBe("1 path held")
    expect(heldPathsPhrase(3)).toBe("3 paths held")
    expect(heldPathsPhrase(null)).toBe("paths held (count not reported)")
  })
})

describe("targetCoverageCause over the captured catalog section", () => {
  it("names each target's recorded cause from its own fields", () => {
    expect(causeOf(target("bucket-1"))).toEqual({ kind: "lifecycle", heldCount: 2 })            // mixed
    expect(causeOf(target("empty-bucket"))).toEqual({ kind: "lifecycle", heldCount: 1 })        // all-held
    expect(causeOf(target("aurora-a"))).toEqual({                                                 // receipt-withheld
      kind: "withheld", code: "database_eni_binding_not_in_normalized_inventory", heldCount: null,
    })
    expect(causeOf(target("db-1"))).toEqual({ kind: "none" })                                    // legacy: no reason
  })

  it("non-install shape (derived by REMOVING held_path_count): still lifecycle, count not reported", () => {
    const { held_path_count: _drop, ...nonInstall } = target("bucket-1")
    expect(causeOf(nonInstall)).toEqual({ kind: "lifecycle", heldCount: null })
  })

  it("CONSTRUCTED edge values: a malformed count is unreported, a count without a reason is still held", () => {
    expect(targetCoverageCause(LIFECYCLE_HELD_REASON, "2")).toEqual({ kind: "lifecycle", heldCount: null })
    expect(targetCoverageCause(undefined, 4)).toEqual({ kind: "lifecycle", heldCount: 4 })
    expect(targetCoverageCause("some_receipt_code", 2)).toEqual({ kind: "withheld", code: "some_receipt_code", heldCount: 2 })
    expect(targetCoverageCause("   ", undefined)).toEqual({ kind: "none" })
    expect(targetCoverageCause(null, 0)).toEqual({ kind: "none" })
  })
})

describe("target wording ties to the recorded cause and nothing else", () => {
  it("lifecycle: the row note and the explanation carry the count only when supplied", () => {
    expect(targetCoverageNote({ kind: "lifecycle", heldCount: 2 })).toBe("+2 held, not counted")
    expect(targetCoverageNote({ kind: "lifecycle", heldCount: null })).toBe("more paths held, not counted")
    expect(targetCoverageDescription({ kind: "lifecycle", heldCount: 1 })).toBe(
      `Lifecycle coverage incomplete (1 path held). ${LIFECYCLE_HELD_EXPLANATION}`,
    )
    expect(targetCoverageDescription({ kind: "lifecycle", heldCount: null })).toBe(
      `Lifecycle coverage incomplete. ${LIFECYCLE_HELD_EXPLANATION}`,
    )
  })

  it("a withheld receipt code is named as withheld, never as lifecycle", () => {
    const withheld = { kind: "withheld" as const, code: "database_eni_binding_not_in_normalized_inventory", heldCount: null }
    expect(targetCoverageNote(withheld)).toBe("coverage withheld")
    expect(targetCoverageDescription(withheld)).toBe(
      "The active generation withheld coverage of this target (database_eni_binding_not_in_normalized_inventory), " +
        "so its paths are not the whole picture.",
    )
    expect(targetCoverageDescription(withheld)).not.toMatch(/lifecycle/i)
    expect(targetZeroCoverageSubtitle(withheld)).toBe(
      "The active generation withheld coverage of this crown jewel (database_eni_binding_not_in_normalized_inventory), " +
        "so Cyntro does not claim that no route exists.",
    )
    // ... and when the same target also has held paths, both are said.
    expect(targetCoverageNote({ ...withheld, heldCount: 2 })).toBe("coverage withheld · +2 held, not counted")
  })

  it("the all-held empty state explains the hold and claims no absent route", () => {
    expect(targetZeroCoverageSubtitle({ kind: "lifecycle", heldCount: 1 })).toBe(
      "Every path the active generation found to this crown jewel is held (1 path held): the current state of its " +
        "source could not be established from the inventory snapshot this analysis used. Cyntro does not claim that no " +
        "route exists.",
    )
  })

  it("nothing recorded: no note, no description, no subtitle (the established copy applies)", () => {
    expect(targetCoverageNote({ kind: "none" })).toBeNull()
    expect(targetCoverageDescription({ kind: "none" })).toBeNull()
    expect(targetZeroCoverageSubtitle({ kind: "none" })).toBeNull()
  })

  it("no wording claims a live check", () => {
    const all = [
      LIFECYCLE_HELD_EXPLANATION,
      targetCoverageDescription({ kind: "lifecycle", heldCount: 2 })!,
      targetZeroCoverageSubtitle({ kind: "lifecycle", heldCount: 2 })!,
    ].join(" ")
    expect(all).not.toMatch(/\blive\b|verified|currently|real[- ]time/i)
  })
})

describe("deriveAllLifecycleCoverage over the captured /all answers", () => {
  it("resolved: no lifecycle evidence", () => {
    expect(deriveAllLifecycleCoverage(allResolved)).toEqual({
      held: [], unverified: [], unreadable: false, heldTotal: null, incomplete: false,
    })
  })

  it("held: the system, its key and its own count", () => {
    expect(deriveAllLifecycleCoverage(allHeld)).toEqual({
      held: [{ system: "Orders", systemKey: "authored_system:ord", heldPathCount: 1 }],
      unverified: [], unreadable: false, heldTotal: 1, incomplete: true,
    })
  })

  it("record missing: the label as the backend named it, and the reason code", () => {
    expect(deriveAllLifecycleCoverage(allMissing)).toEqual({
      held: [],
      unverified: [{ label: "Payments (authored_system:pay)", reason: "jewel_coverage_record_missing" }],
      unreadable: false, heldTotal: null, incomplete: true,
    })
  })

  it("CONSTRUCTED malformed shapes are unreadable, never 'none held'", () => {
    expect(deriveAllLifecycleCoverage({ lifecycle_held_systems: "Orders" }).unreadable).toBe(true)
    expect(deriveAllLifecycleCoverage({ lifecycle_held_systems: [{}] })).toMatchObject({ unreadable: true, incomplete: true })
    expect(deriveAllLifecycleCoverage({ lifecycle_unverified_systems: [5] })).toMatchObject({ unreadable: true, incomplete: true })
    expect(deriveAllLifecycleCoverage({ lifecycle_unverified_systems: {} }).unreadable).toBe(true)
    // a held system with a malformed count is held, count unknown, and the total is unknown
    expect(deriveAllLifecycleCoverage({
      lifecycle_held_systems: [{ system: "A", held_path_count: "2" }, { system: "B", held_path_count: 3 }],
    })).toMatchObject({
      held: [{ system: "A", systemKey: null, heldPathCount: null }, { system: "B", systemKey: null, heldPathCount: 3 }],
      heldTotal: null,
    })
    // a v1-style label and an entry without a reason
    expect(deriveAllLifecycleCoverage({ lifecycle_unverified_systems: ["Billing: jewel_coverage_contract_not_v2", "Odd"] })
      .unverified).toEqual([{ label: "Billing", reason: "jewel_coverage_contract_not_v2" }, { label: "Odd", reason: null }])
    // explicit nulls are absence (the legacy shape), not malformed
    expect(deriveAllLifecycleCoverage({ lifecycle_held_systems: null, lifecycle_unverified_systems: null }).incomplete).toBe(false)
  })

  it("each backend reason has its own wording; an unknown or absent one is the generic wording", () => {
    expect(unverifiedReasonText("jewel_coverage_record_missing")).toBe("no lifecycle coverage record was published for it")
    expect(unverifiedReasonText("jewel_coverage_contract_not_v2")).toBe("its coverage record predates lifecycle checks")
    expect(unverifiedReasonText("jewel_coverage_lifecycle_invalid")).toBe("its coverage record could not be read")
    expect(unverifiedReasonText("jewel_coverage_applicability_unknown")).toBe(
      "whether lifecycle checks apply to it could not be established",
    )
    expect(unverifiedReasonText("something_new")).toBe("its lifecycle coverage could not be verified")
    expect(unverifiedReasonText(null)).toBe("its lifecycle coverage could not be verified")
  })
})
