import { describe, expect, it } from "vitest"
import { resourceAccountId, scopeMatchesResource, withAccountScope } from "@/lib/account-scope"

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
})
