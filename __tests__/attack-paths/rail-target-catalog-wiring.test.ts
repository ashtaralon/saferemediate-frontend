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
    // AP201 (R11): the catalog URL comes from the one builder, with the operator's tenant / account claims, and the
    // client cache key carries the same claims (never another account's catalog).
    expect(src).toContain("const jewelsUrl = systemName ? buildTargetCatalogUrl(systemName, scopeClaims) : null")
    expect(src).toContain("cacheKey: `ap-targets:${systemName}${scopeClaimsCacheKey ? `:${scopeClaimsCacheKey}` : \"\"}`")
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

  it("does not fetch or spin a current-access map for an authoritative zero", () => {
    expect(src).toContain("const selectedJewelHasPaths")
    expect(src).toContain("selectedJewelHasPaths && selectedJewel ? systemName : null")
    // AP195: the conclusion's copy moved to the one mapping the page shares with the Topology view. AP196: the page
    // passes the catalog count's validity, so an unreadable count never reaches the "no route" copy.
    expect(src).toContain("targetZeroConclusion(")
    expect(src).toContain("selectedJewel.catalog_path_count !== null")
    expect(src).toContain("title={currentAccessZero.title}")
    const coverage = read("lib/attack-paths/lifecycle-coverage.ts")
    expect(coverage).toContain("No modeled current-access route")
    expect(coverage).toContain('if (state === "no_modeled_route" && !countReadable)')
  })
})

describe("crown-jewel rail panel", () => {
  const src = read(PANEL)

  it("renders the explicit state chip from TARGET_STATE_CONFIG", () => {
    expect(src).toContain("TARGET_STATE_CONFIG[state]")
    // AP182: the chip also takes the target's recorded-cause description (its own state's when none is recorded).
    // AP184: it shows the displayed state (a recorded cause turns "no modeled route" into coverage incomplete) and keeps
    // the served state as the row's identity.
    expect(src).toContain(
      "<TargetStateChip state={shownState} rawState={targetState} description={coverageDescription} />")
    expect(src).toContain("title={description ?? cfg.description}")
    expect(src).toContain("data-target-state={rawState ?? state}")
  })

  it("never defaults a missing severity to LOW", () => {
    expect(src).not.toContain('jewel.severity ?? "LOW"')
    expect(src).toContain("const sev = jewel.severity ?? null")
  })

  it("names zero states instead of showing an unexplained dash", () => {
    // AP184: the zero label reads the SHOWN state (displayedTargetState), so a recorded cause is never "NO PATH".
    // AP194: the mapping moved to targetZeroLabel, which the Topology view's rail shares.
    expect(src).toContain("const zeroLabel = targetZeroLabel(shownState)")
    const coverage = read("lib/attack-paths/lifecycle-coverage.ts")
    expect(coverage).toContain('shownState === "no_modeled_route" ? "NO PATH"')
    expect(coverage).toContain('shownState === "coverage_incomplete" ? "PENDING"')
    // AP201 (I3): a severity label without a served score shows a dash for the score, never 0.
    expect(src).toContain('{hasScore ? score : hasSeverity ? "—" : zeroLabel}')
  })
})
