/// <reference types="vitest/globals" />
/**
 * Inverted guard: FE must not derive ATT&CK Initial Access when the
 * backend category is missing. Re-introducing classifyInitialAccess-style
 * node/ARN heuristics should fail this file.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { initialAccessCategoryFromBackend } from "@/lib/attack-paths/initial-access-from-backend"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

const ROOT = join(__dirname, "..", "..")

function basePath(overrides: Partial<IdentityAttackPath> = {}): IdentityAttackPath {
  return {
    id: "p1",
    crown_jewel_id: "arn:aws:s3:::bucket",
    nodes: [
      {
        id: "arn:aws:iam::999:role/external",
        name: "external",
        type: "IAMRole",
        tier: "entry",
        is_internet_exposed: true,
        lp_score: null,
        gap_count: 0,
        has_console_access: true,
        has_mfa: false,
        subnet_is_public: true,
        subnet_ingress_class: "PUBLIC_INGRESS",
      },
      {
        id: "i-abc",
        name: "web",
        type: "EC2Instance",
        tier: "identity",
        is_internet_exposed: true,
        lp_score: null,
        gap_count: 0,
        subnet_is_public: true,
        subnet_ingress_class: "PUBLIC_INGRESS",
      },
      {
        id: "arn:aws:s3:::bucket",
        name: "bucket",
        type: "S3Bucket",
        tier: "crown_jewel",
        is_internet_exposed: true,
        lp_score: null,
        gap_count: 0,
      },
    ],
    edges: [],
    severity: {
      overall_score: 90,
      severity: "CRITICAL",
      impact: 0,
      internet_exposure: 0,
      permission_breadth: 0,
      data_sensitivity: 0,
      identity_chain: 0,
      network_controls: 0,
      weights: {
        impact: 0,
        internet_exposure: 0,
        permission_breadth: 0,
        data_sensitivity: 0,
        identity_chain: 0,
        network_controls: 0,
      },
    },
    path_kind: "materialized",
    evidence_type: "observed",
    hop_count: 2,
    ...overrides,
  }
}

describe("initialAccessCategoryFromBackend — delete-not-fallback", () => {
  it("passes through backend category", () => {
    expect(
      initialAccessCategoryFromBackend(
        basePath({
          initial_access: { category: "IMDS_CREDENTIAL_THEFT" } as never,
        }),
      ),
    ).toBe("IMDS_CREDENTIAL_THEFT")
  })

  it("MUTATION: rich node signals without backend category stay UNKNOWN", () => {
    // Pre-#P0 this returned IMDS_CREDENTIAL_THEFT / CROSS_ACCOUNT_TRUST /
    // EXPOSED_S3_BUCKET from FE heuristics. That invent site is deleted.
    expect(initialAccessCategoryFromBackend(basePath({ initial_access: null }))).toBe(
      "UNKNOWN",
    )
    expect(
      initialAccessCategoryFromBackend(basePath({ initial_access: undefined })),
    ).toBe("UNKNOWN")
  })

  it("MUTATION: path-list-grouped must not contain FE ATT&CK derivation", () => {
    const src = readFileSync(
      join(ROOT, "components/attack-paths-v2/path-list-grouped.tsx"),
      "utf8",
    )
    expect(src).toContain("initialAccessCategoryFromBackend")
    expect(src).not.toContain("function classifyInitialAccess")
    expect(src).not.toMatch(/return "IMDS_CREDENTIAL_THEFT"/)
    expect(src).not.toMatch(/return "CROSS_ACCOUNT_TRUST"/)
    expect(src).not.toMatch(/return "EXPOSED_WORKLOAD_RCE"/)
    expect(src).not.toMatch(/subnet_ingress_class === "PUBLIC_INGRESS"/)
  })

  it("MUTATION: lib helper must stay a passthrough (no local compose)", () => {
    const src = readFileSync(
      join(ROOT, "lib/attack-paths/initial-access-from-backend.ts"),
      "utf8",
    )
    expect(src).toContain('?? "UNKNOWN"')
    expect(src).not.toMatch(/is_internet_exposed/)
    expect(src).not.toMatch(/subnet_is_public/)
    expect(src).not.toMatch(/has_mfa/)
  })
})
