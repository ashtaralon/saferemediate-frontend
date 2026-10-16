import { describe, expect, it } from "vitest"
import capturedSection from "@/__tests__/fixtures/ap182-lifecycle/target-catalog-section.json"
import {
  isTargetCatalogCacheable,
  isTargetCatalogPayload,
  targetCatalogToJewelSummaries,
  targetCatalogTotals,
  targetEntryToJewelSummary,
  type TargetCatalog,
  type TargetCatalogEntry,
} from "@/lib/attack-paths/target-catalog"
import { TARGET_STATE_CONFIG } from "@/lib/types"

function entry(overrides: Partial<TargetCatalogEntry> = {}): TargetCatalogEntry {
  return {
    target_id: "arn:aws:s3:::orders-data",
    kind: "S3Bucket",
    name: "orders-data",
    arn: "arn:aws:s3:::orders-data",
    native_id: "orders-data",
    region: "eu-west-1",
    account_id: "111122223333",
    is_internet_exposed: false,
    data_classification: "pii",
    data_classification_source: "tag",
    inventory_present: true,
    path_count: 3,
    observed_path_count: 1,
    standing_access_count: 0,
    max_severity: 70,
    max_severity_label: "HIGH",
    manifest_path_count: 3,
    state: "observed",
    crown_jewel_source: null,
    ...overrides,
  }
}

function catalog(overrides: Partial<TargetCatalog> = {}): TargetCatalog {
  return {
    system_name: "webshop",
    serve_state: "READY",
    coverage_state: "READY",
    not_ready_reason: null,
    generation: 7,
    staging_run_id: "stage-7",
    customer_id: "webshop",
    account_id: "111122223333",
    computed_at: "2026-09-04T00:00:00Z",
    total_targets: 1,
    counts: { observed: 1 },
    targets: [entry()],
    endpoint: "target-catalog",
    ...overrides,
  }
}

describe("targetEntryToJewelSummary", () => {
  it("passes the backend severity label through and keeps the score", () => {
    const jewel = targetEntryToJewelSummary(entry())
    expect(jewel.id).toBe("arn:aws:s3:::orders-data")
    expect(jewel.canonical_id).toBe("arn:aws:s3:::orders-data")
    expect(jewel.type).toBe("S3Bucket")
    expect(jewel.severity).toBe("HIGH")
    expect(jewel.highest_risk_score).toBe(70)
    expect(jewel.path_count).toBe(3)
    expect(jewel.materialized_path_count).toBe(3)
    expect(jewel.observed_path_count).toBe(1)
    expect(jewel.target_state).toBe("observed")
    expect(jewel.paths_not_computed).toBe(false)
    expect(jewel.data_classification).toBe("pii")
    expect(jewel.data_classification_source).toBe("tag")
    expect(jewel.inventory_present).toBe(true)
  })

  it("keeps a zero-path target with its state and NO severity", () => {
    const jewel = targetEntryToJewelSummary(entry({
      path_count: 0, observed_path_count: 0, max_severity: 0,
      max_severity_label: null, manifest_path_count: 0, state: "no_modeled_route",
    }))
    expect(jewel.target_state).toBe("no_modeled_route")
    expect(jewel.severity).toBeNull()
    expect(jewel.highest_risk_score).toBe(0)
    expect(jewel.priority_score).toBe(0)
    expect(jewel.path_count).toBe(0)
    expect(jewel.paths_not_computed).toBe(false)
  })

  it("never derives a severity label client-side", () => {
    // a high score with no backend label is still no label
    const jewel = targetEntryToJewelSummary(entry({ max_severity: 95, max_severity_label: null }))
    expect(jewel.severity).toBeNull()
    // a label without any path is not a severity either
    const zero = targetEntryToJewelSummary(entry({ path_count: 0, max_severity_label: "LOW" }))
    expect(zero.severity).toBeNull()
  })

  it("marks projection_not_ready as paths_not_computed", () => {
    const jewel = targetEntryToJewelSummary(entry({
      path_count: 0, max_severity_label: null, state: "projection_not_ready",
    }))
    expect(jewel.paths_not_computed).toBe(true)
    expect(jewel.target_state).toBe("projection_not_ready")
  })

  it("keeps an unrecorded exposure flag null rather than false", () => {
    expect(targetEntryToJewelSummary(entry({ is_internet_exposed: null })).is_internet_exposed).toBeNull()
    expect(targetEntryToJewelSummary(entry({ is_internet_exposed: true })).is_internet_exposed).toBe(true)
  })

  it("carries reachable_only provenance and inventory absence", () => {
    const jewel = targetEntryToJewelSummary(entry({
      target_id: "arn:aws:s3:::other-system-bucket",
      inventory_present: false,
      crown_jewel_source: "reachable_only",
      state: "configured_only",
    }))
    expect(jewel.crown_jewel_source).toBe("reachable_only")
    expect(jewel.inventory_present).toBe(false)
    expect(jewel.target_state).toBe("configured_only")
  })

  it("does not invent a state the config does not know", () => {
    const jewel = targetEntryToJewelSummary(entry({ state: "verified_zero" as never }))
    expect(jewel.target_state).toBeUndefined()
  })

  it("falls back through name → native id → target id for the label", () => {
    expect(targetEntryToJewelSummary(entry({ name: null })).name).toBe("orders-data")
    expect(targetEntryToJewelSummary(entry({ name: null, native_id: null })).name).toBe(
      "arn:aws:s3:::orders-data",
    )
  })
})

describe("targetCatalogToJewelSummaries", () => {
  it("preserves the backend order and every target, zero states included", () => {
    const rows = targetCatalogToJewelSummaries(catalog({
      targets: [
        entry(),
        entry({ target_id: "arn:aws:kms:eu-west-1:1:key/k1", kind: "KMSKey", name: "k1",
                path_count: 0, max_severity: 0, max_severity_label: null, state: "coverage_incomplete" }),
      ],
    }))
    expect(rows.map((r) => r.id)).toEqual([
      "arn:aws:s3:::orders-data",
      "arn:aws:kms:eu-west-1:1:key/k1",
    ])
    expect(rows[1]?.target_state).toBe("coverage_incomplete")
  })

  it("is empty for a missing catalog", () => {
    expect(targetCatalogToJewelSummaries(null)).toEqual([])
    expect(targetCatalogToJewelSummaries(undefined)).toEqual([])
  })
})

describe("targetCatalogTotals", () => {
  it("quotes path and reachable-target totals from the active catalog", () => {
    const value = catalog({
      serve_state: "READY",
      targets: [
        entry({ target_id: "a", path_count: 2 }),
        entry({ target_id: "b", path_count: 0 }),
        entry({ target_id: "c", path_count: 3 }),
      ],
    })

    // AP182: a catalog with no recorded cause names no held path and no withheld target (resolved / legacy).
    expect(targetCatalogTotals(value)).toEqual({
      pathCount: 5,
      reachableTargetCount: 2,
      lifecycleHeld: false,
      heldPathCount: null,
      withheldTargetCount: 0,
    })
  })

  it("does not quote totals from a projection that is not ready", () => {
    expect(targetCatalogTotals(catalog({ serve_state: "NOT_READY" }))).toBeNull()
  })
})

// ── AP182: lifecycle-held and withheld targets, over the captured section (__tests__/fixtures/ap182-lifecycle) ───

describe("AP182 · the catalog's recorded causes reach the rail and the totals", () => {
  const captured = capturedSection as unknown as TargetCatalog
  const byName = (rows: ReturnType<typeof targetCatalogToJewelSummaries>, name: string) => rows.find((r) => r.name === name)!

  it("each target carries its own reason and held count, as served", () => {
    const rows = targetCatalogToJewelSummaries(captured)
    const mixed = byName(rows, "bucket-1")
    expect([mixed.path_count, mixed.held_path_count, mixed.coverage_withheld_reason, mixed.target_state]).toEqual(
      [1, 2, "lifecycle_held", "observed"])
    const allHeld = byName(rows, "empty-bucket")
    expect([allHeld.path_count, allHeld.held_path_count, allHeld.coverage_withheld_reason, allHeld.target_state]).toEqual(
      [0, 1, "lifecycle_held", "coverage_incomplete"])
    const withheld = byName(rows, "aurora-a")
    expect(withheld.coverage_withheld_reason).toBe("database_eni_binding_not_in_normalized_inventory")
    expect("held_path_count" in withheld).toBe(false)
  })

  it("a target with nothing recorded maps exactly as before: no new key", () => {
    const legacy = captured.targets.find((t) => t.name === "db-1")!
    const mapped = targetEntryToJewelSummary(legacy)
    expect("coverage_withheld_reason" in mapped).toBe(false)
    expect("held_path_count" in mapped).toBe(false)
    expect(Object.keys(targetEntryToJewelSummary(entry())).sort()).toEqual(Object.keys(mapped).sort())
  })

  it("CONSTRUCTED malformed held count: carried as null (held, count not reported), never 0", () => {
    const mapped = targetEntryToJewelSummary(entry({ coverage_withheld_reason: "lifecycle_held", held_path_count: "2" as never }))
    expect(mapped.held_path_count).toBeNull()
    expect(targetEntryToJewelSummary(entry({ held_path_count: 0 })).held_path_count).toBeNull()
  })

  it("totals: listed paths only, with the held count and the withheld targets beside them", () => {
    expect(targetCatalogTotals(captured)).toEqual({
      pathCount: 2,               // bucket-1 (1) + aurora-a (1): the eligible, listed paths
      reachableTargetCount: 2,
      lifecycleHeld: true,
      heldPathCount: 3,           // bucket-1 2 + empty-bucket 1, each the target's own count
      withheldTargetCount: 3,     // the three RDS clusters the stage receipt withheld
    })
  })

  it("non-install shape (derived by REMOVING every held_path_count): still held, the count unknown", () => {
    const nonInstall = {
      ...captured,
      targets: captured.targets.map(({ held_path_count: _drop, ...rest }) => rest),
    } as TargetCatalog
    expect(targetCatalogTotals(nonInstall)).toMatchObject({ pathCount: 2, lifecycleHeld: true, heldPathCount: null })
  })

  it("CONSTRUCTED receipt-withheld target that is ALSO held: withheld and held both count", () => {
    const value = catalog({ targets: [
      entry({ target_id: "a", path_count: 1, coverage_withheld_reason: "some_receipt_code", held_path_count: 2 }),
      entry({ target_id: "b", path_count: 1, coverage_withheld_reason: "lifecycle_held", held_path_count: 1 }),
      entry({ target_id: "c", path_count: 0, coverage_withheld_reason: "lifecycle_held", held_path_count: "x" as never }),
    ] })
    expect(targetCatalogTotals(value)).toEqual({
      pathCount: 2, reachableTargetCount: 2, lifecycleHeld: true,
      heldPathCount: null,          // target c is held but reports no well-formed count: the sum is unknown
      withheldTargetCount: 1,
    })
    expect(targetCatalogTotals(catalog({ targets: value.targets.slice(0, 2) }))).toMatchObject({ heldPathCount: 3 })
  })

  it("a captured section keeps its cache rule: READY with targets", () => {
    expect(isTargetCatalogCacheable(captured)).toBe(true)
  })
})

describe("isTargetCatalogCacheable", () => {
  it("caches only a READY catalog with at least one target", () => {
    expect(isTargetCatalogCacheable(catalog())).toBe(true)
    expect(isTargetCatalogCacheable(catalog({ targets: [] }))).toBe(false)
    expect(isTargetCatalogCacheable(catalog({ serve_state: "NOT_READY" }))).toBe(false)
    expect(isTargetCatalogCacheable(catalog({ unavailable: true }))).toBe(false)
    expect(isTargetCatalogCacheable({ result: { crown_jewels: [{}] } })).toBe(false)
    expect(isTargetCatalogCacheable(null)).toBe(false)
  })

  it("recognises the catalog envelope by shape", () => {
    expect(isTargetCatalogPayload(catalog())).toBe(true)
    expect(isTargetCatalogPayload({ targets: [] })).toBe(false)
  })
})

describe("TARGET_STATE_CONFIG", () => {
  it("names exactly the backend TARGET_STATES", () => {
    expect(Object.keys(TARGET_STATE_CONFIG).sort()).toEqual([
      "configured_only",
      "coverage_incomplete",
      "no_modeled_route",
      "observed",
      "projection_not_ready",
    ])
  })
})
