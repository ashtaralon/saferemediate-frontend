/**
 * AP188 / AP189 · lib/attack-paths/convergence-readiness.ts — what one by-crown-jewel answer establishes about a
 * jewel's paths, and the header's selected-target count built on it.
 *
 * Every body here is CONSTRUCTED (labelled by its case). Holds and refusals use the server-owned shapes documented in
 * lib/semantic-hold.ts; the serve / coverage / cardinality values follow api/attack_paths.py and
 * cyntro_data/contracts/workspace.py (PathCardinality). Codex's preliminary AP189 cases
 * (revision5-launch/ap188-wip-review-20261016T2210/review.json) are included verbatim.
 */
import { describe, expect, it } from "vitest"

import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import {
  CONVERGENCE_NOT_READY_MESSAGE,
  readConvergencePaths,
  selectedPathCount,
  selectedPathCountLines,
  zoom0ServeCoverage,
} from "@/lib/attack-paths/convergence-readiness"
import { zoom0ServeCoverage as reExported, zoom0EmptyCanvasMessage } from "@/components/attack-paths-v2/zoom0-fan-in-panel"
import { targetEntryToJewelSummary, type TargetCatalogEntry } from "@/lib/attack-paths/target-catalog"
import { TARGET_STATE_CONFIG } from "@/lib/types"

const PATH = { path_id: "p1", workload_arn: "arn:aws:lambda:eu-west-1:111122223333:function:f", damage: [], score: 1,
  confidence: "observed", hop_count: 0 }
const CARD = { generation_total: 2, eligible_total: 2, returned_count: 2, drawn_count: null, excluded_count_by_reason: {},
  truncated: false }

describe("readConvergencePaths: holds, refusals and failures are no path answer", () => {
  it.each([
    ["a 200 not_recorded hold", { semantic_status: "not_recorded", hold_reason: "JEWEL_NOT_IN_IAP_PUBLICATION" }],
    ["a 200 unavailable hold", { semantic_status: "unavailable", error: "graph read failed" }],
    ["a typed refusal", { detail: { code: "SERVING_READ_REFUSED", reason: "scope" } }],
    ["a typed reader failure", { detail: { code: "SEMANTIC_READ_UNAVAILABLE", reason: "store" } }],
    ["a legacy error with no rows", { error: "compute failed" }],
  ])("%s", (_label, body) => {
    const reading = readConvergencePaths(body)
    expect(reading.kind).toBe("unavailable")
    expect(reading.kind === "unavailable" && reading.reason).toBeTruthy()
  })

  it.each([[null], [undefined], ["text"], [7], [[PATH]]])("a body that is not an object (%j)", (body) => {
    expect(readConvergencePaths(body)).toEqual({ kind: "unavailable", reason: null })
  })

  it("serve error / integrity hold coverage, and a body with no path list", () => {
    expect(readConvergencePaths({ coverage_state: "ERROR", paths: [PATH] })).toEqual({ kind: "unavailable", reason: "coverage ERROR" })
    expect(readConvergencePaths({ coverage_state: "INTEGRITY_HELD", paths: [] }).kind).toBe("unavailable")
    expect(readConvergencePaths({ serve_state: "ACTIVE", coverage_state: "READY" })).toEqual(
      { kind: "unavailable", reason: "the answer carries no path list" })
  })
})

describe("readConvergencePaths: not ready is its own answer, with or without a path list (AP189)", () => {
  it.each([
    ["serve_state NOT_READY, pathless (Codex AP189 case 1)", { serve_state: "NOT_READY" }],
    ["coverage_state NOT_READY, pathless (Codex AP189 case 2)", { coverage_state: "NOT_READY" }],
    ["a valid NOT_READY with an empty list (control)", { serve_state: "NOT_READY", coverage_state: "NOT_READY", paths: [] }],
    ["NOT_READY carried only by risk_summary", { paths: [], risk_summary: { coverage_state: "NOT_READY", observed_paths: 0 } }],
  ])("%s", (_label, body) => {
    expect(readConvergencePaths(body)).toEqual({ kind: "not_ready" })
  })
})

describe("readConvergencePaths: a whole list only when nothing says otherwise", () => {
  it("READY, READY_ZERO and a legacy body with no states are whole", () => {
    for (const body of [
      { serve_state: "ACTIVE", coverage_state: "READY", paths: [PATH], cardinality: CARD },
      { serve_state: "ACTIVE", coverage_state: "READY_ZERO", paths: [] },
      { paths: [PATH] },                                                    // a backend that predates the states
      { paths: [PATH], cardinality: null },                                 // the documented "no cardinality"
    ]) {
      const reading = readConvergencePaths(body)
      expect(reading.kind === "paths" && reading.partial, JSON.stringify(body)).toBeNull()
    }
  })

  it("PARTIAL (every install's capped publication), a withheld reason, a truncated or short cardinality", () => {
    const partial = (body: unknown) => {
      const reading = readConvergencePaths(body)
      return reading.kind === "paths" ? reading.partial : `not paths: ${reading.kind}`
    }
    expect(partial({ serve_state: "ACTIVE", coverage_state: "PARTIAL", paths: [PATH] })).toBe("coverage partial")
    expect(partial({ coverage_state: "PARTIAL", coverage_withheld_reason: "lifecycle_held", paths: [PATH] }))
      .toBe("coverage withheld (lifecycle_held)")
    expect(partial({ coverage_state: "READY", paths: [PATH], cardinality: { ...CARD, truncated: true } }))
      .toBe("more paths than returned")
    expect(partial({ coverage_state: "READY", paths: [PATH], cardinality: { ...CARD, eligible_total: 5 } }))
      .toBe("more paths than returned")
  })

  it("AP189 unknown vocabulary is never whole, and never read as a known ERROR", () => {
    // Codex AP189 case 3: serve_state "ERROR" is not serve vocabulary (ACTIVE / NOT_READY)
    const reading = readConvergencePaths({ serve_state: "ERROR", paths: [] })
    expect(reading).toEqual({ kind: "paths", paths: [], partial: "serve state ERROR not recognised" })
    expect(readConvergencePaths({ serve_state: "WARMING", coverage_state: "READY", paths: [PATH] }))
      .toMatchObject({ kind: "paths", partial: "serve state WARMING not recognised" })
    expect(readConvergencePaths({ coverage_state: "SOMETHING_NEW", paths: [PATH] }))
      .toMatchObject({ kind: "paths", partial: "coverage SOMETHING_NEW" })
    expect(readConvergencePaths({ coverage_state: 3, paths: [PATH] })).toMatchObject({ kind: "paths", partial: "coverage 3" })
  })

  it.each([
    ["Codex AP189 case 4: eligible_total \"bad\"", { eligible_total: "bad", returned_count: 0 }],
    ["a missing generation_total", { eligible_total: 1, returned_count: 1 }],
    ["a fractional returned_count", { ...CARD, returned_count: 1.5 }],
    ["a negative eligible_total", { ...CARD, eligible_total: -1 }],
    ["a string drawn_count", { ...CARD, drawn_count: "1" }],
    ["a string truncated", { ...CARD, truncated: "false" }],
    ["a malformed excluded count", { ...CARD, excluded_count_by_reason: { stale: "2" } }],
    ["excluded counts as a list", { ...CARD, excluded_count_by_reason: [1] }],
    ["a cardinality that is a number", 3],
  ])("AP189 present malformed cardinality never certifies a whole list: %s", (_label, cardinality) => {
    expect(readConvergencePaths({ coverage_state: "READY", paths: [], cardinality }))
      .toEqual({ kind: "paths", paths: [], partial: "path cardinality unreadable" })
  })
})

describe("zoom0ServeCoverage moved, not changed", () => {
  it("the component module re-exports the same function, and the canvas keeps its not-ready copy", () => {
    expect(reExported).toBe(zoom0ServeCoverage)
    expect(zoom0ServeCoverage({ risk_summary: { serve_state: "NOT_READY", observed_paths: 0 } } as never))
      .toEqual({ serve_state: "NOT_READY", coverage_state: null })
    expect(zoom0EmptyCanvasMessage({ serve_state: "NOT_READY", paths: [] } as never).message).toBe(CONVERGENCE_NOT_READY_MESSAGE)
  })
})

// ── the selected target's header count ───────────────────────────────────────────────────────────────────────────

// A catalog row as targetEntryToJewelSummary builds it: `catalog_path_count` is the served count, validated (AP190).
const jewel = (over: Partial<CrownJewelSummary>): CrownJewelSummary => ({
  id: "t1", canonical_id: "arn:aws:s3:::b", name: "bucket-1", type: "S3Bucket", severity: "HIGH", path_count: 3,
  highest_risk_score: 80, is_internet_exposed: false, data_classification: null, target_state: "observed",
  catalog_path_count: over.path_count ?? 3, ...over,
} as CrownJewelSummary)
const base = { coverageNote: null, railSource: "none" as const, listedCount: 0, serve: null, loading: false, failed: false, error: null }

describe("selectedPathCount: never a zero the read state does not support", () => {
  it("projection_not_ready, and a NOT_READY serve answer, have no count", () => {
    expect(selectedPathCount({ ...base, jewel: jewel({ target_state: "projection_not_ready", path_count: 0 }) })).toEqual({ kind: "not_ready" })
    expect(selectedPathCount({ ...base, jewel: jewel({}), railSource: "serve", serve: { serve_state: "NOT_READY", paths: [] } }))
      .toEqual({ kind: "not_ready" })
  })

  it("a pending read is loading; a failed one is unavailable with the CATALOG's count named as the catalog's", () => {
    expect(selectedPathCount({ ...base, jewel: jewel({}), loading: true, coverageNote: "+2 held, not counted" }))
      .toEqual({ kind: "loading", note: "+2 held, not counted" })
    expect(selectedPathCount({ ...base, jewel: jewel({}), failed: true, error: "Backend busy (502)" }))
      .toEqual({ kind: "unavailable", catalogCount: 3, note: null, reason: "Backend busy (502)" })
    // a legacy /jewels rail (no target_state): there is no catalog count to name
    expect(selectedPathCount({ ...base, jewel: jewel({ target_state: undefined }), failed: true, error: "x" }))
      .toMatchObject({ kind: "unavailable", catalogCount: null })
    // a serve answer that is a hold (defensive: the hook no longer stores one)
    expect(selectedPathCount({ ...base, jewel: jewel({}), railSource: "serve", serve: { semantic_status: "not_recorded" } }))
      .toMatchObject({ kind: "unavailable", catalogCount: 3 })
  })

  it("loaded detail: whole when nothing says otherwise, listed when the answer or the row says it is partial", () => {
    const serve = { serve_state: "ACTIVE", coverage_state: "READY", paths: [PATH, PATH], cardinality: CARD }
    expect(selectedPathCount({ ...base, jewel: jewel({}), railSource: "serve", serve, listedCount: 2 }))
      .toEqual({ kind: "count", count: 2, partial: null })
    expect(selectedPathCount({ ...base, jewel: jewel({}), railSource: "serve", listedCount: 2,
      serve: { ...serve, coverage_state: "PARTIAL" }, coverageNote: "+2 held, not counted" }))
      .toEqual({ kind: "count", count: 2, partial: "+2 held, not counted · coverage partial" })
    expect(selectedPathCount({ ...base, jewel: jewel({}), railSource: "iap_fallback", listedCount: 1 }))
      .toEqual({ kind: "count", count: 1, partial: "IAP preview" })
  })

  it("the catalog listing no path: its zero is the count (nothing is fetched), with the row's note", () => {
    expect(selectedPathCount({ ...base, jewel: jewel({ target_state: "no_modeled_route", path_count: 0 }) }))
      .toEqual({ kind: "count", count: 0, partial: null })
    expect(selectedPathCount({ ...base, jewel: jewel({ target_state: "coverage_incomplete", path_count: 0 }),
      coverageNote: "+1 held, not counted" })).toEqual({ kind: "count", count: 0, partial: "+1 held, not counted" })
  })
})

describe("AP190-R2: only a VALID served zero is a zero (rows built by the actual targetEntryToJewelSummary)", () => {
  const row = (path_count: unknown) => targetEntryToJewelSummary({
    target_id: "arn:aws:s3:::bucket-a", kind: "S3Bucket", name: "bucket-a", state: "observed", path_count,
  } as unknown as TargetCatalogEntry)

  it("CONTROL: a served 0 is the catalog's zero (Codex's valid-zero control)", () => {
    expect(row(0).catalog_path_count).toBe(0)
    expect(selectedPathCount({ ...base, jewel: row(0) })).toEqual({ kind: "count", count: 0, partial: null })
  })

  it.each([["bad"], [-1], [1.5], [null], [undefined], ["3"]])("served path_count %j is no zero, failed or not", (raw) => {
    const j = row(raw)
    expect(j.catalog_path_count).toBeNull()
    // Codex's reproduction: rail none + a failed detail read
    expect(selectedPathCount({ ...base, jewel: j, failed: true, error: "unavailable" }))
      .toEqual({ kind: "unavailable", catalogCount: null, note: null, reason: "unavailable" })
    // no read at all (the page fetches only when the coerced count is above 0): still no count, and said why
    const idle = selectedPathCount({ ...base, jewel: j })
    expect(idle.kind === "loading" || idle.kind === "unavailable", JSON.stringify(idle)).toBe(true)
    expect(idle.kind).not.toBe("count")
  })

  it("a valid served count with a failed read names that count as the catalog's", () => {
    expect(selectedPathCount({ ...base, jewel: row(3), failed: true, error: "x" })).toMatchObject({ kind: "unavailable", catalogCount: 3 })
  })
})

describe("selectedPathCountLines: the header's words", () => {
  it.each([
    [{ kind: "count", count: 2, partial: null }, "bucket-1 · 2 paths", null],
    [{ kind: "count", count: 1, partial: null }, "bucket-1 · 1 path", null],
    [{ kind: "count", count: 2, partial: "coverage partial" }, "bucket-1 · 2 listed paths", "coverage partial"],
    [{ kind: "loading", note: null }, "bucket-1 · paths loading…", null],
    [{ kind: "loading", note: "+2 held, not counted" }, "bucket-1 · paths loading…", "+2 held, not counted"],
    [{ kind: "unavailable", catalogCount: 3, note: "+2 held, not counted", reason: "busy" },
      "bucket-1 · detail paths unavailable", "3 listed in the catalog · +2 held, not counted"],
    [{ kind: "unavailable", catalogCount: null, note: null, reason: "busy" }, "bucket-1 · detail paths unavailable", null],
    [{ kind: "not_ready" }, `bucket-1 · ${TARGET_STATE_CONFIG.projection_not_ready.label}`, null],
  ] as const)("%j", (count, primary, secondary) => {
    const lines = selectedPathCountLines("bucket-1", count as never)
    expect(lines.primary).toBe(primary)
    expect(lines.secondary).toBe(secondary)
    // only a whole loaded count carries a bare number, and it never says "listed"
    if (count.kind !== "count") expect(lines.primary.replace("bucket-1", "")).not.toMatch(/\d/)
  })
})
