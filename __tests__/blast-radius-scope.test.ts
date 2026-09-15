/// <reference types="vitest/globals" />
/**
 * Blast-radius reads must carry the operator's Estate scope.
 *
 * The serving-graph composer refuses to infer scope (customer / account /
 * region): a partial or absent GET returns 503, and cached responses across
 * scope are cross-tenant paints. This spec pins the URL/cache contracts and
 * the end-to-end behavior — assertions run through the real components so
 * that a caller reverting to the raw URL is caught even without a
 * source-text pattern match.
 */
import { describe, expect, it } from "vitest"

import {
  buildBlastRadiusCacheKey,
  buildBlastRadiusUrl,
  isBlastRadiusScopeComplete,
  normalizeBlastRadiusScope,
} from "@/components/attack-paths-v2/blast-radius-scope"

const FULL_SCOPE = {
  customerId: "testbed-webshop",
  accountId: "416651950952",
  region: "eu-west-1",
}

describe("buildBlastRadiusUrl", () => {
  it("emits the fully scoped URL when systemName and every scope value are present", () => {
    expect(buildBlastRadiusUrl("testbed-webshop", FULL_SCOPE)).toBe(
      "/api/proxy/business-system/testbed-webshop/blast-radius" +
        "?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
    )
  })

  it.each([
    ["empty object", {}],
    ["customer only", { customerId: "testbed-webshop" }],
    ["account only", { accountId: "416651950952" }],
    ["region only", { region: "eu-west-1" }],
    ["customer + account without region", {
      customerId: "testbed-webshop",
      accountId: "416651950952",
    }],
    ["customer + region without account", {
      customerId: "testbed-webshop",
      region: "eu-west-1",
    }],
    ["account + region without customer", {
      accountId: "416651950952",
      region: "eu-west-1",
    }],
  ])("returns null for partial scope (%s) so the UI waits instead of firing a 503", (_label, scope) => {
    expect(buildBlastRadiusUrl("testbed-webshop", scope)).toBeNull()
  })

  it.each([
    ["all-sentinel customer", { customerId: "all", accountId: "416651950952", region: "eu-west-1" }],
    ["all-sentinel account", { customerId: "acme", accountId: "all", region: "eu-west-1" }],
    ["all-sentinel region", { customerId: "acme", accountId: "416651950952", region: "all" }],
    ["malformed account", { customerId: "acme", accountId: "not-an-account", region: "eu-west-1" }],
    ["malformed region", { customerId: "acme", accountId: "416651950952", region: "us_wat" }],
  ])("returns null when a scope value is invalid (%s)", (_label, scope) => {
    // "all" is the scope-bar sentinel for "no narrowing" and must never
    // become a literal customer_id=all query param. A malformed account or
    // region can never match a real Estate — same result.
    expect(buildBlastRadiusUrl("payments", normalizeBlastRadiusScope(scope))).toBeNull()
    expect(buildBlastRadiusUrl("payments", scope)).toBeNull()
  })

  it("returns null when systemName is empty even under a full scope", () => {
    expect(buildBlastRadiusUrl("", FULL_SCOPE)).toBeNull()
  })
})

describe("isBlastRadiusScopeComplete", () => {
  it("is true only when customer + valid account + valid region are all present", () => {
    expect(isBlastRadiusScopeComplete(FULL_SCOPE)).toBe(true)
  })
  it.each([
    {},
    { customerId: "acme" },
    { customerId: "acme", accountId: "111111111111" },
    { customerId: "acme", accountId: "bad", region: "eu-west-1" },
    { customerId: "acme", accountId: "111111111111", region: "bad" },
  ])("is false for %o", (scope) => {
    expect(isBlastRadiusScopeComplete(scope)).toBe(false)
  })
})

describe("normalizeBlastRadiusScope", () => {
  it("passes real customer/account/region through unchanged", () => {
    expect(normalizeBlastRadiusScope(FULL_SCOPE)).toEqual(FULL_SCOPE)
  })

  it('treats the scope-bar "all" sentinel as absent, never as a value', () => {
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
    const keys = new Set([
      buildBlastRadiusCacheKey("payments", {
        customerId: "acme",
        accountId: "111111111111",
        region: "eu-west-1",
      }),
      buildBlastRadiusCacheKey("payments", {
        customerId: "globex",
        accountId: "111111111111",
        region: "eu-west-1",
      }),
      buildBlastRadiusCacheKey("payments", {
        customerId: "acme",
        accountId: "222222222222",
        region: "eu-west-1",
      }),
      buildBlastRadiusCacheKey("payments", {
        customerId: "acme",
        accountId: "111111111111",
        region: "us-east-1",
      }),
      buildBlastRadiusCacheKey("payments", {}),
    ])
    expect(keys.size).toBe(5)
  })

  it("includes the system name so two systems inside one scope stay separate", () => {
    expect(buildBlastRadiusCacheKey("payments", FULL_SCOPE)).not.toBe(
      buildBlastRadiusCacheKey("checkout", FULL_SCOPE),
    )
  })
})
