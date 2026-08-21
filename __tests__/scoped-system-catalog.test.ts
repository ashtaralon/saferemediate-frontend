import { describe, expect, it } from "vitest"
import {
  catalogSystemName,
  productScopeKey,
  scopedStorageKey,
} from "@/lib/scoped-system-catalog"

describe("scoped system catalog helpers", () => {
  it("keys browser state by every scope dimension", () => {
    const first = productScopeKey({
      customerId: "customer-a",
      groupId: "prod",
      accountId: "111111111111",
      region: "eu-west-1",
    })
    const second = productScopeKey({
      customerId: "customer-a",
      groupId: "prod",
      accountId: "111111111111",
      region: "us-east-1",
    })
    expect(first).not.toBe(second)
    expect(scopedStorageKey("cyntro:lastSystem", first)).toContain(first)
  })

  it("accepts a requested system only when it belongs to the scoped catalog", () => {
    expect(catalogSystemName("PAYMENTS", ["payments", "reports"])).toBe("payments")
    expect(catalogSystemName("other-tenant", ["payments", "reports"])).toBeNull()
  })
})
