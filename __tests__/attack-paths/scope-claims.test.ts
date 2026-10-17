/**
 * AP201 / CP-C-1 (R11) · the tenant / account claims the Attack Paths page puts on its per-jewel reads.
 *
 * Pure: the client helper (claims from the account scope, through blast-radius's own rule), the URL builders, and
 * the server helper the proxies share (forwarding + the cache-key fragment).
 */
import { describe, expect, it } from "vitest"

import {
  buildConvergenceDetailUrl,
  buildConvergenceFetchUrl,
  buildConvergenceSummaryUrl,
  buildJewelFootholdsUrl,
  buildJewelLateralReachUrl,
  buildJewelSurfaceUrl,
  buildTargetCatalogUrl,
} from "@/lib/attack-paths/convergence-fetch-url"
import { appendScopeClaims, NO_SCOPE_CLAIMS, scopeClaimsFrom, scopeClaimsKey } from "@/lib/attack-paths/scope-claims"
import { forwardScopeClaims, SCOPE_CLAIM_KEYS } from "@/lib/server/scope-claims"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"

const JEWEL = { id: "arn:aws:s3:::acme-data", canonical_id: "arn:aws:s3:::acme-data", name: "acme-data", type: "S3Bucket",
  severity: null, path_count: 1, highest_risk_score: null, is_internet_exposed: null, data_classification: null, priority_score: 0 } as CrownJewelSummary
const ACME = { customerId: "acme", accountId: "111111111111" }

describe("scopeClaimsFrom: the selected account, by blast-radius's rule", () => {
  it("a 12-digit selected account and the tenant are the claims; 'all', a malformed account or no provider are none", () => {
    expect(scopeClaimsFrom(ACME)).toEqual({ customerId: "acme", accountId: "111111111111" })
    expect(scopeClaimsFrom({ customerId: "acme", accountId: "all" })).toEqual({ customerId: "acme", accountId: null })
    expect(scopeClaimsFrom({ customerId: "acme", accountId: "11111" })).toEqual({ customerId: "acme", accountId: null })
    expect(scopeClaimsFrom({ customerId: "all", accountId: "111111111111" })).toEqual({ customerId: null, accountId: "111111111111" })
    expect(scopeClaimsFrom(null)).toEqual(NO_SCOPE_CLAIMS)
    expect(scopeClaimsFrom(undefined)).toEqual(NO_SCOPE_CLAIMS)
  })

  it("appendScopeClaims and scopeClaimsKey carry only the present claims, in a stable order", () => {
    expect(appendScopeClaims(new URLSearchParams({ x: "1" }), scopeClaimsFrom(ACME)).toString()).toBe("x=1&customer_id=acme&account_id=111111111111")
    expect(scopeClaimsKey(scopeClaimsFrom({ customerId: "acme", accountId: "all" }))).toBe("customer_id=acme")
    expect(scopeClaimsKey(NO_SCOPE_CLAIMS)).toBe("")
    expect(scopeClaimsKey(null)).toBe("")
  })
})

describe("the per-jewel read URLs carry the claims; without claims they are unchanged", () => {
  const claims = scopeClaimsFrom(ACME)
  it("summary / detail / full convergence", () => {
    expect(buildConvergenceSummaryUrl("payments", JEWEL)).toBe("/api/proxy/attack-paths/payments/by-crown-jewel/summary?cj_arn=arn%3Aaws%3As3%3A%3A%3Aacme-data&cj_name=acme-data")
    expect(buildConvergenceSummaryUrl("payments", JEWEL, claims)).toBe("/api/proxy/attack-paths/payments/by-crown-jewel/summary?cj_arn=arn%3Aaws%3As3%3A%3A%3Aacme-data&cj_name=acme-data&customer_id=acme&account_id=111111111111")
    expect(buildConvergenceDetailUrl("payments", JEWEL, "p1", claims)).toMatch(/\/by-crown-jewel\/detail\?cj_arn=.*&cj_name=acme-data&path_id=p1&customer_id=acme&account_id=111111111111$/)
    expect(buildConvergenceFetchUrl("payments", JEWEL, claims)).toMatch(/\/by-crown-jewel\?cj_arn=.*&customer_id=acme&account_id=111111111111$/)
    expect(buildConvergenceDetailUrl("payments", JEWEL, "p1")).not.toMatch(/customer_id|account_id/)
  })
  it("targets / footholds / lateral-reach / jewel-surface", () => {
    expect(buildTargetCatalogUrl("payments")).toBe("/api/proxy/attack-paths/payments/targets")
    expect(buildTargetCatalogUrl("payments", claims)).toBe("/api/proxy/attack-paths/payments/targets?customer_id=acme&account_id=111111111111")
    expect(buildJewelFootholdsUrl("payments", "acme-data", { evaluate: true, max_hops: 8 }, claims)).toBe(
      "/api/proxy/attack-paths/payments/jewel-footholds?jewel_ref=acme-data&evaluate=true&max_hops=8&customer_id=acme&account_id=111111111111")
    expect(buildJewelLateralReachUrl("payments", "acme-data", "S3Bucket", claims)).toBe(
      "/api/proxy/attack-paths/payments/jewel-lateral-reach?jewel_ref=acme-data&jewel_type=S3Bucket&customer_id=acme&account_id=111111111111")
    expect(buildJewelLateralReachUrl("payments", "acme-data", "S3Bucket")).toBe("/api/proxy/attack-paths/payments/jewel-lateral-reach?jewel_ref=acme-data&jewel_type=S3Bucket")
    expect(buildJewelSurfaceUrl("payments", "arn:aws:s3:::acme-data", claims)).toBe(
      "/api/proxy/identity-attack-paths/payments/jewel-surface/arn%3Aaws%3As3%3A%3A%3Aacme-data?customer_id=acme&account_id=111111111111")
    expect(buildJewelSurfaceUrl("payments", "arn:aws:s3:::acme-data")).toBe("/api/proxy/identity-attack-paths/payments/jewel-surface/arn%3Aaws%3As3%3A%3A%3Aacme-data")
  })
})

describe("forwardScopeClaims (the proxies' shared helper)", () => {
  it("copies exactly the two claim keys, verbatim, and returns the cache-key fragment", () => {
    expect([...SCOPE_CLAIM_KEYS]).toEqual(["customer_id", "account_id"])
    const to = new URLSearchParams({ cj_arn: "arn:aws:s3:::acme-data" })
    const key = forwardScopeClaims(new URLSearchParams("customer_id=acme&account_id=111111111111&region=eu-west-1&evil=1"), to)
    expect(key).toBe("customer_id=acme&account_id=111111111111")
    expect(to.toString()).toBe("cj_arn=arn%3Aaws%3As3%3A%3A%3Aacme-data&customer_id=acme&account_id=111111111111")
    expect(to.get("region")).toBeNull()
    expect(to.get("evil")).toBeNull()
  })
  it("an absent or empty claim is not forwarded and the fragment is empty", () => {
    const to = new URLSearchParams()
    expect(forwardScopeClaims(new URLSearchParams("account_id=&x=1"), to)).toBe("")
    expect(to.toString()).toBe("")
  })
})
