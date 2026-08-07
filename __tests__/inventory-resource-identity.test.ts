import { describe, expect, it } from "vitest"

import { canonicalInventoryResourceId } from "@/lib/inventory-resource-identity"

describe("canonicalInventoryResourceId", () => {
  it("prefers the ARN over a duplicate display name", () => {
    expect(canonicalInventoryResourceId({
      arn: "arn:aws:iam::745783559495:role/AlonIAMTest",
      id: "AlonIAMTest",
      name: "AlonIAMTest",
    })).toBe("arn:aws:iam::745783559495:role/AlonIAMTest")
  })

  it("uses AWS resource and instance ids before the display name", () => {
    expect(canonicalInventoryResourceId({
      resource_id: "sg-0123456789abcdef0",
      name: "web-sg",
    })).toBe("sg-0123456789abcdef0")
    expect(canonicalInventoryResourceId({
      instance_id: "i-0123456789abcdef0",
      name: "web-server",
    })).toBe("i-0123456789abcdef0")
  })

  it("keeps the graph id when no AWS identity is available", () => {
    expect(canonicalInventoryResourceId({
      id: "subnet-0123456789abcdef0",
      name: "private-a",
    })).toBe("subnet-0123456789abcdef0")
  })

  it("uses a display name only as the final legacy fallback", () => {
    expect(canonicalInventoryResourceId({ name: "legacy-resource" })).toBe("legacy-resource")
  })

  it("never invents a random identity", () => {
    expect(canonicalInventoryResourceId({})).toBe("Unknown")
    expect(canonicalInventoryResourceId({})).toBe("Unknown")
  })
})
