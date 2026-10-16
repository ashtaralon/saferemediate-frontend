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
  displayedTargetState,
  displayedTargetStateCounts,
  heldCountOrNull,
  heldPathsPhrase,
  targetCoverageCause,
  targetCoverageDescription,
  targetCoverageNote,
  targetEvidenceUnreadable,
  targetHasHeldPaths,
  targetHeldCount,
  targetIncompleteCoverageNote,
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
    expect(causeOf(target("bucket-1"))).toEqual({ kind: "lifecycle", held: 2 })                 // mixed
    expect(causeOf(target("empty-bucket"))).toEqual({ kind: "lifecycle", held: 1 })             // all-held
    expect(causeOf(target("aurora-a"))).toEqual({                                                 // receipt-withheld
      kind: "withheld", code: "database_eni_binding_not_in_normalized_inventory", held: "none",
    })
    expect(causeOf(target("db-1"))).toEqual({ kind: "none" })                                    // legacy: no reason
  })

  it("non-install shape (derived by REMOVING held_path_count): still lifecycle, count not reported", () => {
    const { held_path_count: _drop, ...nonInstall } = target("bucket-1")
    expect(causeOf(nonInstall)).toEqual({ kind: "lifecycle", held: "unreported" })
  })

  it("the non-install route's documented null reason is nothing recorded", () => {
    expect(targetCoverageCause(null, undefined)).toEqual({ kind: "none" })
  })

  it("CONSTRUCTED well-formed edges: a count without a reason is held, a receipt code keeps its own held state", () => {
    expect(targetCoverageCause(undefined, 4)).toEqual({ kind: "lifecycle", held: 4 })
    expect(targetCoverageCause(null, 4)).toEqual({ kind: "lifecycle", held: 4 })
    expect(targetCoverageCause("some_receipt_code", 2)).toEqual({ kind: "withheld", code: "some_receipt_code", held: 2 })
    expect(targetCoverageCause(LIFECYCLE_HELD_REASON, "2")).toEqual({ kind: "lifecycle", held: "unreported" })
  })

  it("AP184-2 CONSTRUCTED: a receipt code establishes withholding; only a well-formed count beside it establishes held", () => {
    const RECEIPT = "target_coverage_withheld_unreadable"
    // receipt + malformed / null / zero count: withheld, the held evidence unreadable, NO held path
    for (const count of ["bad", null, 0, -2, 1.5, "3"]) {
      const cause = targetCoverageCause(RECEIPT, count)
      expect(cause, String(count)).toEqual({ kind: "withheld", code: RECEIPT, held: "unreadable" })
      expect([targetHasHeldPaths(cause), targetHeldCount(cause), targetEvidenceUnreadable(cause)], String(count))
        .toEqual([false, null, true])
    }
    // receipt + a well-formed count: withheld AND held, counted
    const counted = targetCoverageCause(RECEIPT, 2)
    expect(counted).toEqual({ kind: "withheld", code: RECEIPT, held: 2 })
    expect([targetHasHeldPaths(counted), targetHeldCount(counted), targetEvidenceUnreadable(counted)]).toEqual([true, 2, false])
    // receipt, no count served: withheld only
    const plain = targetCoverageCause(RECEIPT, undefined)
    expect([plain, targetHasHeldPaths(plain), targetEvidenceUnreadable(plain)]).toEqual(
      [{ kind: "withheld", code: RECEIPT, held: "none" }, false, false])
    // lifecycle_held with the count missing: held (the reason establishes it), the count not reported
    const uncounted = targetCoverageCause(LIFECYCLE_HELD_REASON, undefined)
    expect([uncounted, targetHasHeldPaths(uncounted), targetHeldCount(uncounted)]).toEqual(
      [{ kind: "lifecycle", held: "unreported" }, true, null])
  })

  it("AP184-1: a recorded cause on a 'no modeled route' target is SHOWN as coverage incomplete; nothing else moves", () => {
    for (const cause of [{ kind: "unreadable" as const }, { kind: "lifecycle" as const, held: 1 },
      { kind: "withheld" as const, code: "c", held: "none" as const }]) {
      expect(displayedTargetState("no_modeled_route", cause)).toBe("coverage_incomplete")
    }
    expect(displayedTargetState("no_modeled_route", { kind: "none" })).toBe("no_modeled_route")
    for (const state of ["observed", "configured_only", "coverage_incomplete", "projection_not_ready"]) {
      expect(displayedTargetState(state, { kind: "unreadable" })).toBe(state)
    }
  })

  it("AP183-R2 CONSTRUCTED present-but-malformed evidence is UNREADABLE, never nothing recorded", () => {
    for (const [reason, count] of [
      [undefined, "bad"], [undefined, 0], [{}, undefined],          // the three cases of the review
      [null, 0], [null, null], [undefined, -1], [undefined, 1.5], [undefined, true],
      ["   ", undefined], ["", undefined], [7, undefined], [[], 2],
    ] as Array<[unknown, unknown]>) {
      expect(targetCoverageCause(reason, count), JSON.stringify([reason, count])).toEqual({ kind: "unreadable" })
    }
  })
})

describe("AP187: counts and header notes agree with the rows' shown states", () => {
  type State = "observed" | "no_modeled_route" | "coverage_incomplete" | "projection_not_ready"
  const NONE = { kind: "none" } as const
  const UNREADABLE = { kind: "unreadable" } as const

  it("moves exactly the rows a recorded cause re-shows, and leaves the served counts untouched", () => {
    const served: Partial<Record<State, number>> = { observed: 2, no_modeled_route: 2, coverage_incomplete: 6 }
    const rows: Array<{ state: State | undefined; cause: Parameters<typeof displayedTargetState>[1] }> = [
      { state: "no_modeled_route", cause: UNREADABLE },                              // shown as coverage incomplete
      { state: "no_modeled_route", cause: NONE },                                    // legacy: stays no route
      { state: "observed", cause: { kind: "lifecycle", held: 2 } },                  // a mixed row: no state change
      { state: "coverage_incomplete", cause: { kind: "withheld", code: "c", held: "none" } },
      { state: undefined, cause: UNREADABLE },                                       // a legacy /jewels row: no state
    ]
    expect(displayedTargetStateCounts(served, rows)).toEqual({ observed: 2, no_modeled_route: 1, coverage_incomplete: 7 })
    expect(served).toEqual({ observed: 2, no_modeled_route: 2, coverage_incomplete: 6 })
  })

  it("nothing to move: the served counts as they are (the captured catalog, and a legacy no-route row)", () => {
    const served = { observed: 2, coverage_incomplete: 8 }
    expect(displayedTargetStateCounts(served, [{ state: "observed", cause: { kind: "lifecycle", held: 2 } }])).toEqual(served)
    expect(displayedTargetStateCounts({ no_modeled_route: 1 }, [{ state: "no_modeled_route", cause: NONE }]))
      .toEqual({ no_modeled_route: 1 })
  })

  it("CONSTRUCTED: served counts that cannot account for a re-shown row are not shown (null), never negative", () => {
    const row = { state: "no_modeled_route" as State, cause: UNREADABLE }
    for (const served of [{}, { no_modeled_route: 0 }, { no_modeled_route: "1" as never }, { no_modeled_route: 0.5 }]) {
      expect(displayedTargetStateCounts(served as Partial<Record<State, number>>, [row]), JSON.stringify(served)).toBeNull()
    }
    expect(displayedTargetStateCounts({ no_modeled_route: 1 }, [row, row])).toBeNull()
  })

  // AP188: Codex's independent reproduction on b2e4425c (ap187-counts-independent-reproduction.json), as cases: one
  // no_modeled_route row with an unreadable cause moved into coverage_incomplete.
  const MOVED = [{ state: "no_modeled_route" as State, cause: UNREADABLE }]

  it("AP188 the reproduced malformed buckets are no count at all, never coerced arithmetic", () => {
    for (const served of [
      { no_modeled_route: 1, coverage_incomplete: "7" },             // was "71"
      { no_modeled_route: 1, coverage_incomplete: -2 },              // was -1
      { no_modeled_route: 1.5, coverage_incomplete: 7 },             // was 0.5 / 8
      { no_modeled_route: 1, coverage_incomplete: null },            // was 1: an explicit null read as zero
    ]) {
      expect(displayedTargetStateCounts(served, MOVED), JSON.stringify(served)).toBeNull()
    }
    // the valid case of the same reproduction
    expect(displayedTargetStateCounts({ no_modeled_route: 1, coverage_incomplete: 7 }, MOVED))
      .toEqual({ no_modeled_route: 0, coverage_incomplete: 8 })
  })

  it("AP188 CONSTRUCTED: a malformed UNTOUCHED bucket, or a non-object body, also makes the whole answer unknown", () => {
    for (const served of [
      { no_modeled_route: 1, coverage_incomplete: 7, observed: "2" },
      { no_modeled_route: 1, coverage_incomplete: 7, projection_not_ready: Number.NaN },
      { no_modeled_route: 1, coverage_incomplete: 7, observed: Number.POSITIVE_INFINITY },
      { no_modeled_route: 1, coverage_incomplete: 7, configured_only: true },
    ]) {
      expect(displayedTargetStateCounts(served, MOVED), JSON.stringify(served)).toBeNull()
      expect(displayedTargetStateCounts(served, []), "no row moves: " + JSON.stringify(served)).toBeNull()
    }
    for (const served of [null, undefined, "8", 8, [1, 7], []]) {
      expect(displayedTargetStateCounts(served, []), JSON.stringify(served)).toBeNull()
    }
  })

  it("AP188 absent buckets keep their documented meaning (no target); valid counts are returned as served", () => {
    // coverage_incomplete absent: the moved row is its only target
    expect(displayedTargetStateCounts({ no_modeled_route: 1, observed: 2 }, MOVED))
      .toEqual({ no_modeled_route: 0, observed: 2, coverage_incomplete: 1 })
    expect(displayedTargetStateCounts({}, [])).toEqual({})
    expect(displayedTargetStateCounts({ observed: 2, coverage_incomplete: 8, no_modeled_route: 0 }, []))
      .toEqual({ observed: 2, coverage_incomplete: 8, no_modeled_route: 0 })
    // a served key named like an Object prototype member stays a plain key and pollutes nothing
    const polluted = JSON.parse('{"__proto__": 3, "coverage_incomplete": 1}')
    const shown = displayedTargetStateCounts(polluted, [])
    expect(shown && Object.prototype.hasOwnProperty.call(shown, "__proto__")).toBe(true)
    expect(({} as Record<string, unknown>).coverage_incomplete).toBeUndefined()
  })

  it("the header note: the row's own note, 'coverage incomplete' for a served incomplete target, else nothing", () => {
    expect(targetIncompleteCoverageNote("observed", { kind: "lifecycle", held: 2 })).toBe("+2 held, not counted")
    expect(targetIncompleteCoverageNote("coverage_incomplete", { kind: "lifecycle", held: 1 })).toBe("+1 held, not counted")
    expect(targetIncompleteCoverageNote("observed", { kind: "withheld", code: "c", held: "none" })).toBe("coverage withheld")
    expect(targetIncompleteCoverageNote("no_modeled_route", UNREADABLE)).toBe("coverage evidence unreadable")
    expect(targetIncompleteCoverageNote("coverage_incomplete", NONE)).toBe("coverage incomplete")
    // nothing recorded on a resolved, legacy no-route or legacy /jewels row: no note, the established header
    // (projection_not_ready is not asserted here: its header is outside AP187-F3 and is reported as a residual)
    for (const state of ["observed", "no_modeled_route", "configured_only", undefined]) {
      expect(targetIncompleteCoverageNote(state, NONE), String(state)).toBeNull()
    }
  })
})

describe("target wording ties to the recorded cause and nothing else", () => {
  it("lifecycle: the row note and the explanation carry the count only when supplied", () => {
    expect(targetCoverageNote({ kind: "lifecycle", held: 2 })).toBe("+2 held, not counted")
    expect(targetCoverageNote({ kind: "lifecycle", held: "unreported" })).toBe("more paths held, not counted")
    expect(targetCoverageDescription({ kind: "lifecycle", held: 1 })).toBe(
      `Lifecycle coverage incomplete (1 path held). ${LIFECYCLE_HELD_EXPLANATION}`,
    )
    expect(targetCoverageDescription({ kind: "lifecycle", held: "unreported" })).toBe(
      `Lifecycle coverage incomplete. ${LIFECYCLE_HELD_EXPLANATION}`,
    )
  })

  it("a withheld receipt code is named as withheld, never as lifecycle", () => {
    const withheld = { kind: "withheld" as const, code: "database_eni_binding_not_in_normalized_inventory", held: "none" as const }
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
    expect(targetCoverageNote({ ...withheld, held: 2 })).toBe("coverage withheld · +2 held, not counted")
    // AP184: a malformed count beside the code is unreadable held evidence: never "more paths held"
    expect(targetCoverageNote({ ...withheld, held: "unreadable" })).toBe("coverage withheld · held-path evidence unreadable")
    const unreadableHeld = targetCoverageDescription({ ...withheld, held: "unreadable" })!
    expect(unreadableHeld).toContain("A held-path count was served beside it but could not be read, so no held path is counted.")
    expect(unreadableHeld).not.toMatch(/paths? held|Further paths/)
  })

  it("AP183-R2 unreadable evidence: unknown and incomplete, no count, and never 'all held'", () => {
    const unreadable = { kind: "unreadable" as const }
    expect(targetCoverageNote(unreadable)).toBe("coverage evidence unreadable")
    for (const text of [targetCoverageDescription(unreadable)!, targetZeroCoverageSubtitle(unreadable)!]) {
      expect(text).toMatch(/could not be read/)
      expect(text).toMatch(/No held count is reported/)
      expect(text).not.toMatch(/\d+ paths? held|Every path|all held/i)
    }
    expect(targetZeroCoverageSubtitle(unreadable)).toContain("Cyntro does not claim that no route exists")
  })

  it("the all-held empty state explains the hold and claims no absent route", () => {
    expect(targetZeroCoverageSubtitle({ kind: "lifecycle", held: 1 })).toBe(
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
      targetCoverageDescription({ kind: "lifecycle", held: 2 })!,
      targetZeroCoverageSubtitle({ kind: "lifecycle", held: 2 })!,
      targetCoverageDescription({ kind: "unreadable" })!,
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
  })

  it("AP183-R1 CONSTRUCTED: an explicit null list is PRESENT and unreadable; only an absent field is no evidence", () => {
    for (const field of ["lifecycle_held_systems", "lifecycle_unverified_systems"]) {
      expect(deriveAllLifecycleCoverage({ [field]: null }), field).toEqual({
        held: [], unverified: [], unreadable: true, heldTotal: null, incomplete: true,
      })
    }
    expect(deriveAllLifecycleCoverage({}).incomplete).toBe(false)
    expect(deriveAllLifecycleCoverage({ lifecycle_held_systems: undefined }).incomplete).toBe(false)
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

  it("AP183-R3: a code that names an Object prototype member is unknown, and its wording is a string", () => {
    for (const code of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "__defineGetter__"]) {
      const text = unverifiedReasonText(code)
      expect(typeof text, code).toBe("string")
      expect(text, code).toBe("its lifecycle coverage could not be verified")
    }
  })
})
