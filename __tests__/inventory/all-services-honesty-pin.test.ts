/// <reference types="vitest/globals" />
/**
 * Resource Dossier §0 acceptance pin.
 *
 * Absent list-view fields must yield UNKNOWN / NOT_APPLICABLE — never a
 * substantive fabrication. Forced fetch failures must be typed failures,
 * not empty success lists. Source-scan guards the inventory component.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  NOT_APPLICABLE,
  UNKNOWN,
  failedGroupMessage,
  mapEncryption,
  mapLastSyncEvidence,
  mapRegion,
  mapStatus,
  regionsQueryParam,
  type FetchResult,
} from "@/lib/inventory-honesty"

const ROOT = join(__dirname, "..", "..")
const INVENTORY_SRC = readFileSync(
  join(ROOT, "components/all-services-inventory.tsx"),
  "utf8",
)

describe("§0 inventory honesty — field mappers", () => {
  it("maps absent status to UNKNOWN, never active", () => {
    expect(mapStatus(undefined, null, "")).toBe(UNKNOWN)
    expect(mapStatus("running")).toBe("running")
    expect(mapStatus(undefined, "Enabled")).toBe("Enabled")
  })

  it("maps absent region to UNKNOWN, never eu-west-1", () => {
    expect(mapRegion(undefined, null, "")).toBe(UNKNOWN)
    expect(mapRegion("us-east-1")).toBe("us-east-1")
  })

  it("maps encryption without inventing a verified negative", () => {
    expect(mapEncryption({ type: "S3Bucket" })).toBe(UNKNOWN)
    expect(
      mapEncryption({ type: "S3Bucket", encrypted: true, encryption_read_ok: true }),
    ).toBe("ENCRYPTED")
    expect(
      mapEncryption({
        type: "S3Bucket",
        encrypted: false,
        encryption_read_ok: true,
      }),
    ).toBe("NOT_ENCRYPTED")
    expect(mapEncryption({ type: "IAMRole" })).toBe(NOT_APPLICABLE)
    expect(mapEncryption({ type: "SecurityGroup" })).toBe(NOT_APPLICABLE)
    // Missing fields + no successful read → UNKNOWN, not NOT_ENCRYPTED
    expect(
      mapEncryption({ type: "RDS", encrypted: undefined, encryption_read_ok: false }),
    ).toBe(UNKNOWN)
  })

  it("maps last sync from evidence only — never invents a timestamp", () => {
    expect(mapLastSyncEvidence(undefined, null, "")).toBe(UNKNOWN)
    expect(mapLastSyncEvidence("2026-08-11T12:00:00.000Z")).toBe(
      "2026-08-11T12:00:00.000Z",
    )
  })

  it("omits regions query when tenant config is empty", () => {
    expect(regionsQueryParam([])).toBe("")
    expect(regionsQueryParam([UNKNOWN, null, ""])).toBe("")
    expect(regionsQueryParam(["eu-west-1", "us-east-1"])).toBe(
      "?regions=eu-west-1%2Cus-east-1",
    )
  })

  it("types fetch failure distinctly from empty success", () => {
    const emptyOk: FetchResult<number> = { ok: true, items: [] }
    const failed: FetchResult<number> = {
      ok: false,
      error: failedGroupMessage("kms", "HTTP 503"),
    }
    expect(emptyOk.ok).toBe(true)
    if (emptyOk.ok) expect(emptyOk.items).toEqual([])
    expect(failed.ok).toBe(false)
    if (!failed.ok) {
      expect(failed.error).toContain("kms inventory unavailable")
      expect(failed.error).toContain("HTTP 503")
    }
  })
})

describe("§0 inventory honesty — source scan", () => {
  it("does not fabricate active / eu-west-1 / client last-sync / LP inventory", () => {
    expect(INVENTORY_SRC).not.toMatch(/\|\|\s*['"]active['"]/)
    expect(INVENTORY_SRC).not.toMatch(/\|\|\s*['"]eu-west-1['"]/)
    expect(INVENTORY_SRC).not.toMatch(/regions=eu-west-1,us-east-1/)
    expect(INVENTORY_SRC).not.toMatch(/setLastSync\(\s*new Date\(/)
    expect(INVENTORY_SRC).not.toMatch(/least-privilege\/issues/)
    expect(INVENTORY_SRC).not.toMatch(/isEncrypted\s*\?/)
    expect(INVENTORY_SRC).toMatch(/from '@\/lib\/inventory-honesty'/)
    expect(INVENTORY_SRC).toMatch(/Degraded inventory groups/)
    expect(INVENTORY_SRC).toMatch(/listed account-wide/)
  })
})
