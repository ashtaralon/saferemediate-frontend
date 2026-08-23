import { describe, expect, it } from "vitest"
import {
  healScopeAgainstOptions,
  normalizeCustomerRoster,
  resolveCustomerId,
  resourceAccountId,
  scopeMatchesResource,
  withAccountScope,
  type AccountScopeOptions,
} from "@/lib/account-scope"

describe("account scope", () => {
  it("resolves account identity from explicit fields before an ARN", () => {
    expect(resourceAccountId({ account_id: "111111111111" })).toBe("111111111111")
    expect(resourceAccountId({ resourceArn: "arn:aws:lambda:eu-west-1:222222222222:function:worker" })).toBe("222222222222")
    expect(resourceAccountId({ resourceArn: "arn:aws:s3:::bucket-without-account" })).toBeNull()
  })

  it("fails closed when an account-scoped row has no account identity", () => {
    expect(scopeMatchesResource(
      { accountId: "111111111111", region: "eu-west-1" },
      { name: "unknown", region: "eu-west-1" },
    )).toBe(false)
  })

  it("preserves existing parameters and adds only selected scope dimensions", () => {
    expect(withAccountScope("/api/proxy/systems?limit=20", {
      customerId: "acme",
      groupId: "production",
      accountId: "111111111111",
      region: "eu-west-1",
    })).toBe(
      "/api/proxy/systems?limit=20&customer_id=acme&account_group=production&account_id=111111111111&region=eu-west-1",
    )

    expect(withAccountScope("/api/proxy/systems", {
      customerId: "acme",
      groupId: "all",
      accountId: "all",
      region: "all",
    })).toBe("/api/proxy/systems?customer_id=acme")
  })

  it("rejects a stale organization and recovers to the first registered customer", () => {
    const roster = normalizeCustomerRoster([
      { customer_id: "testbed-webshop", display_name: "Testbed Webshop" },
    ])

    expect(resolveCustomerId("alon-prod", roster)).toBe("testbed-webshop")
    expect(resolveCustomerId("testbed-webshop", roster)).toBe("testbed-webshop")
  })

  it("does not invent an organization when the authoritative roster is empty", () => {
    expect(resolveCustomerId("alon-prod", [])).toBeNull()
    expect(normalizeCustomerRoster({ customers: [] })).toEqual([])
  })
})

describe("healScopeAgainstOptions", () => {
  const options: AccountScopeOptions = {
    customer_id: "testbed-webshop",
    accounts: [
      {
        account_id: "416651950952",
        display_name: "Testbed",
        regions: ["eu-west-1"],
        group_ids: ["prod"],
        status: "active",
      },
    ],
    groups: [
      { group_id: "prod", name: "Production", account_ids: ["416651950952"] },
    ],
  }

  it("resets a persisted region no account can satisfy — the 2026-08-23 incident", () => {
    const healed = healScopeAgainstOptions(
      { groupId: "all", accountId: "all", region: "us-east-1" },
      options,
    )
    expect(healed.region).toBe("all")
    expect(healed.groupId).toBe("all")
    expect(healed.accountId).toBe("all")
    expect(healed.cleared).toEqual([
      'Region "us-east-1" is not available in the selected scope — reset to All',
    ])
  })

  it("leaves a fully valid narrowing untouched", () => {
    const healed = healScopeAgainstOptions(
      { groupId: "prod", accountId: "416651950952", region: "eu-west-1" },
      options,
    )
    expect(healed).toEqual({
      groupId: "prod",
      accountId: "416651950952",
      region: "eu-west-1",
      cleared: [],
    })
  })

  it("resets an account the organization does not have, then validates region against the widened set", () => {
    const healed = healScopeAgainstOptions(
      { groupId: "all", accountId: "999999999999", region: "eu-west-1" },
      options,
    )
    expect(healed.accountId).toBe("all")
    expect(healed.region).toBe("eu-west-1")
    expect(healed.cleared).toHaveLength(1)
  })

  it("resets an unknown account group and keeps cascading validity checks coherent", () => {
    const healed = healScopeAgainstOptions(
      { groupId: "deleted-group", accountId: "416651950952", region: "eu-west-1" },
      options,
    )
    expect(healed.groupId).toBe("all")
    // The account and region remain valid once the group widens to all.
    expect(healed.accountId).toBe("416651950952")
    expect(healed.region).toBe("eu-west-1")
    expect(healed.cleared).toHaveLength(1)
  })

  it("resets every narrowing when the organization has no accounts at all", () => {
    const healed = healScopeAgainstOptions(
      { groupId: "prod", accountId: "416651950952", region: "eu-west-1" },
      { customer_id: "empty-org", accounts: [], groups: [] },
    )
    expect(healed).toMatchObject({ groupId: "all", accountId: "all", region: "all" })
    expect(healed.cleared).toHaveLength(3)
  })

  it("treats 'all' and blank values as neutral, never as narrowings to heal", () => {
    const healed = healScopeAgainstOptions(
      { groupId: "", accountId: "all", region: "" },
      options,
    )
    expect(healed).toEqual({ groupId: "all", accountId: "all", region: "all", cleared: [] })
  })
})
