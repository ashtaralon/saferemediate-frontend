import { describe, expect, it } from "vitest"
import {
  isTargetCatalogCacheable,
  isTargetCatalogPayload,
  targetCatalogToJewelSummaries,
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
