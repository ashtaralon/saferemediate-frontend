import { describe, expect, it } from "vitest"
import { applyInventoryScopeParams } from "@/lib/inventory-proxy-scope"

describe("inventory proxy scope", () => {
  it("forwards customer, tenant, and account onto the backend query", () => {
    const from = new URLSearchParams({
      resource_type: "iam_role",
      customer_id: "testbed-webshop",
      tenant_id: "testbed-webshop",
      account_id: "416651950952",
      envelope: "true",
    })
    const to = new URLSearchParams({ resource_type: "iam_role" })
    applyInventoryScopeParams(from, to)
    expect(to.get("customer_id")).toBe("testbed-webshop")
    expect(to.get("tenant_id")).toBe("testbed-webshop")
    expect(to.get("account_id")).toBe("416651950952")
  })

  it("does not invent scope when the browser omitted it", () => {
    const to = new URLSearchParams({ resource_type: "iam_role" })
    applyInventoryScopeParams(new URLSearchParams({ resource_type: "iam_role" }), to)
    expect(to.has("customer_id")).toBe(false)
    expect(to.has("tenant_id")).toBe(false)
    expect(to.has("account_id")).toBe(false)
  })

  it("does not copy a blank account onto the backend query", () => {
    const to = new URLSearchParams({ resource_type: "iam_role" })
    applyInventoryScopeParams(new URLSearchParams({ account_id: "" }), to)
    expect(to.has("account_id")).toBe(false)
  })
})
