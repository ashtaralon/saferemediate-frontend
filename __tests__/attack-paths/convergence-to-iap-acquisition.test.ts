import { describe, expect, it } from "vitest"
import { convergencePathsToIdentityAttackPaths } from "@/lib/attack-paths/convergence-to-iap"
import { compilePathListRow } from "@/components/attack-paths-v2/compile-path-list-row"
import { acquisitionChrome } from "@/lib/attack-paths/acquisition-chrome"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"

/**
 * Regression: the jewel rail renders from `serve` (convergence), converted into
 * IdentityAttackPath shape. That converter is a WHITELIST object literal, so a
 * field absent from it is silently dropped — which is how `acquisition` stayed
 * dark on production while the graph, both APIs, and the browser payload all
 * verified clean.
 *
 * This walks the real chain the UI walks: ConvergencePath → IAP → row → chip.
 */

const jewel = {
  id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
  canonical_id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
  name: "cyntro-demo-prod-data-745783559495",
  type: "S3Bucket",
} as unknown as CrownJewelSummary

function convergencePath(
  acquisition: ConvergencePath["acquisition"],
): ConvergencePath {
  return {
    path_id: "p1",
    source: "cyntro-web-server",
    identity: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
    identity_name: "alon-demo-ec2-role",
    confidence: "configured",
    damage: [],
    score: 64,
    hop_count: 2,
    acquisition,
  } as unknown as ConvergencePath
}

// The real object production returns for alon-demo-ec2-role.
const LIVE = {
  acquisition: "intra_account_assume_role",
  assumable_by: ["AWS:arn:aws:iam::745783559495:root"],
  account_wide_trust: true,
  trust_has_conditions: false,
  resolves_initial_access: false,
} as NonNullable<ConvergencePath["acquisition"]>

describe("convergence → IAP → row → chip", () => {
  it("carries acquisition across the shape change", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      convergencePath(LIVE),
    ])
    expect(iap.acquisition).toBeTruthy()
    expect(iap.acquisition!.account_wide_trust).toBe(true)
  })

  it("reaches the rendered chip end to end", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      convergencePath(LIVE),
    ])
    const row = compilePathListRow(iap, jewel)
    expect(row.acquisition).toBeTruthy()

    const chip = acquisitionChrome(row.acquisition)!
    expect(chip.label).toBe("Assumable by anyone in the account")
    expect(chip.accountWide).toBe(true)
    expect(chip.unconditioned).toBe(true)
    // The guard that must never regress: acquisition is not entry.
    expect(chip.detail).toContain(
      "does NOT explain how they got into the account",
    )
  })

  it("stays null when the server has nothing provable", () => {
    const [iap] = convergencePathsToIdentityAttackPaths(jewel, [
      convergencePath(null),
    ])
    expect(iap.acquisition ?? null).toBeNull()
    const row = compilePathListRow(iap, jewel)
    expect(acquisitionChrome(row.acquisition)).toBeNull()
  })
})
