import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync("components/all-services-inventory.tsx", "utf8")

describe("All Services inventory list scope", () => {
  it("sends customer/account scope on graph-backed inventory list fetches", () => {
    expect(source).toContain("withAccountScope(")
    expect(source).toContain("fetchGraphListRows('kms', undefined, scope)")
    expect(source).toContain("fetchSubnetServiceItems(systemName, accountScope)")
    expect(source).toContain("fetchDataSecurityServiceItems(systemName, accountScope)")
    expect(source).not.toMatch(
      /fetch\(\s*`\/api\/proxy\/resource-inventory\/list/,
    )
  })
})
