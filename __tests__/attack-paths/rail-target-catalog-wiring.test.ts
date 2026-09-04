/// <reference types="vitest/globals" />
/**
 * AP3-104 — the Attack Paths rail reads the inventory-first target catalog.
 *
 * Source-reading like retry-budgets.test.ts: the fetch URL and the retired
 * reachable-only filter are wiring facts a unit test cannot otherwise observe
 * without rendering the whole 1,300-line component.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const RAIL = "components/attack-paths-v2/attack-paths-v2.tsx"
const RESOLVER = "lib/attack-paths/resolve-jewel-rail.ts"
const PANEL = "components/identity-attack-paths/crown-jewel-list-panel.tsx"

describe("attack-paths-v2 rail", () => {
  const src = read(RAIL)

  it("fetches the target catalog, not the legacy /jewels list", () => {
    expect(src).toContain(
      "`/api/proxy/attack-paths/${encodeURIComponent(systemName)}/targets`",
    )
    expect(src).not.toContain("/jewels`")
    expect(src).toContain("targetCatalogToJewelSummaries(jewelsRaw)")
    expect(src).toContain("isCacheable: isTargetCatalogCacheable")
  })

  it("keeps zero-path targets listed (no reachable-only filter)", () => {
    expect(src).not.toContain("reachableJewelPickerList")
    expect(read(RESOLVER)).not.toContain("reachableJewelPickerList")
  })

  it("hands the catalog state to the rail panel", () => {
    expect(src).toContain("serveState={targetCatalogServeState}")
    expect(src).toContain("notReadyReason={targetCatalogNotReadyReason}")
    expect(src).toContain("stateCounts={targetCatalogCounts}")
  })
})

describe("crown-jewel rail panel", () => {
  const src = read(PANEL)

  it("renders the explicit state chip from TARGET_STATE_CONFIG", () => {
    expect(src).toContain("TARGET_STATE_CONFIG[state]")
    expect(src).toContain("<TargetStateChip state={targetState} />")
  })

  it("never defaults a missing severity to LOW", () => {
    expect(src).not.toContain('jewel.severity ?? "LOW"')
    expect(src).toContain("const sev = jewel.severity ?? null")
  })
})
