/// <reference types="vitest/globals" />
/**
 * Blast-radius reads must carry the operator's Estate scope.
 *
 * The serving-graph composer refuses to infer scope (customer / account /
 * region): an unscoped GET returns 503, and cached responses across scope
 * are cross-tenant paints. This spec pins the URL/cache contracts, plus
 * asserts every active call site actually uses them — the P0.3 incident on
 * 2026-09-15 was a working helper that no caller had adopted, so the browser
 * was still hitting the unscoped URL and getting a 503 wall.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  buildBlastRadiusCacheKey,
  buildBlastRadiusUrl,
  normalizeBlastRadiusScope,
} from "@/components/attack-paths-v2/blast-radius-scope"

const ATTACK_PATHS_V2 = resolve(
  __dirname,
  "../components/attack-paths-v2/attack-paths-v2.tsx",
)
const BUSINESS_SYSTEM_VIEW = resolve(
  __dirname,
  "../components/business-system/blast-radius-view.tsx",
)
const KEEP_WARM_CRON = resolve(
  __dirname,
  "../app/api/cron/keep-backend-warm/route.ts",
)

/** Strip block comments so prose about a URL isn't mistaken for one. */
function code(path: string): string {
  const raw = readFileSync(path, "utf8")
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
  expect(stripped.length).toBe(raw.length)
  expect(stripped.split("\n").length).toBe(raw.split("\n").length)
  return stripped
}

describe("buildBlastRadiusUrl", () => {
  it("binds the blast-radius read to the selected estate scope", () => {
    expect(
      buildBlastRadiusUrl("testbed-webshop", {
        customerId: "testbed-webshop",
        accountId: "416651950952",
        region: "eu-west-1",
      }),
    ).toBe(
      "/api/proxy/business-system/testbed-webshop/blast-radius" +
        "?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
    )
  })

  it("does not invent scope when it is unavailable", () => {
    expect(buildBlastRadiusUrl("testbed-webshop", {})).toBe(
      "/api/proxy/business-system/testbed-webshop/blast-radius",
    )
  })
})

describe("normalizeBlastRadiusScope", () => {
  it("passes real customer/account/region through unchanged", () => {
    expect(
      normalizeBlastRadiusScope({
        customerId: "testbed-webshop",
        accountId: "416651950952",
        region: "eu-west-1",
      }),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: "416651950952",
      region: "eu-west-1",
    })
  })

  it('treats the scope-bar "all" sentinel as absent, never as a value', () => {
    // A silent "all" would fabricate scope from the operator's UI-level
    // "no narrowing" state and turn a 503 into a wrong-tenant compose.
    expect(
      normalizeBlastRadiusScope({
        customerId: "testbed-webshop",
        accountId: "all",
        region: "all",
      }),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: null,
      region: null,
    })
  })

  it("rejects malformed accountId and region rather than forwarding them", () => {
    expect(
      normalizeBlastRadiusScope({
        customerId: "testbed-webshop",
        accountId: "not-an-account",
        region: "us_wat",
      }),
    ).toEqual({
      customerId: "testbed-webshop",
      accountId: null,
      region: null,
    })
  })

  it("returns an empty scope for null/undefined input, not a partial one", () => {
    expect(normalizeBlastRadiusScope(null)).toEqual({})
    expect(normalizeBlastRadiusScope(undefined)).toEqual({})
  })
})

describe("buildBlastRadiusCacheKey", () => {
  it("is distinct across customer / account / region so scope switches never paint a cached other-tenant compose", () => {
    const a = buildBlastRadiusCacheKey("payments", {
      customerId: "acme",
      accountId: "111111111111",
      region: "eu-west-1",
    })
    const otherCustomer = buildBlastRadiusCacheKey("payments", {
      customerId: "globex",
      accountId: "111111111111",
      region: "eu-west-1",
    })
    const otherAccount = buildBlastRadiusCacheKey("payments", {
      customerId: "acme",
      accountId: "222222222222",
      region: "eu-west-1",
    })
    const otherRegion = buildBlastRadiusCacheKey("payments", {
      customerId: "acme",
      accountId: "111111111111",
      region: "us-east-1",
    })
    const unscoped = buildBlastRadiusCacheKey("payments", {})
    // No two of these five may collide.
    const keys = [a, otherCustomer, otherAccount, otherRegion, unscoped]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("includes the system name so two systems inside one scope stay separate", () => {
    const scope = {
      customerId: "acme",
      accountId: "111111111111",
      region: "eu-west-1",
    }
    expect(buildBlastRadiusCacheKey("payments", scope)).not.toBe(
      buildBlastRadiusCacheKey("checkout", scope),
    )
  })
})

describe("blast-radius consumers wire scope end-to-end", () => {
  // These assertions are done against the source so the guard fires whenever
  // a call site is added or reverted, independent of any single component
  // render path. The regression that motivated this file was exactly a
  // helper nobody imported: the tests-as-render approach would have passed.

  it("attack-paths-v2 shell reads scope from useAccountScope and routes it through the helper", () => {
    const source = code(ATTACK_PATHS_V2)
    expect(source).toContain('from "@/lib/account-scope-context"')
    expect(source).toContain("useAccountScope(")
    expect(source).toContain("buildBlastRadiusUrl")
    expect(source).toContain("buildBlastRadiusCacheKey")
    // Guard against silent regression to the unscoped literal URL.
    expect(source).not.toMatch(
      /["'`]\/api\/proxy\/business-system\/\$\{encodeURIComponent\(systemName\)\}\/blast-radius["'`]/,
    )
  })

  it("business-system blast-radius view uses the same scope helpers", () => {
    const source = code(BUSINESS_SYSTEM_VIEW)
    expect(source).toContain('from "@/lib/account-scope-context"')
    expect(source).toContain("useAccountScope(")
    expect(source).toContain("buildBlastRadiusUrl")
    expect(source).toContain("buildBlastRadiusCacheKey")
    expect(source).not.toMatch(
      /["'`]\/api\/proxy\/business-system\/\$\{encodeURIComponent\(systemName\)\}\/blast-radius["'`]/,
    )
  })

  it("keep-backend-warm cron only fires blast-radius warms when it knows the scope", () => {
    const source = code(KEEP_WARM_CRON)
    // Skip cleanly when scope is unknown — never a silent unscoped GET.
    expect(source).toContain("skipped_missing_scope")
    // The URL builder in the cron must attach the three scope params.
    expect(source).toMatch(/customer_id[^\n]*target\.customerId/)
    expect(source).toMatch(/account_id[^\n]*target\.accountId/)
    expect(source).toMatch(/region[^\n]*target\.region/)
  })
})
