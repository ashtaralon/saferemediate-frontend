import { describe, expect, it } from "vitest"
import { jewelIdsMatch, normalizeJewelArn } from "@/lib/server/normalize-jewel-id"

describe("normalizeJewelArn", () => {
  it("repairs S3 ARN triple-colon lost in path segments", () => {
    const iap = "arn:aws:s3:::saferemediate-logs-745783559495"
    const mangled = "arn:aws:s3::saferemediate-logs-745783559495"
    expect(normalizeJewelArn(mangled)).toBe(iap)
    expect(jewelIdsMatch(iap, mangled)).toBe(true)
  })

  it("leaves correct S3 ARNs unchanged", () => {
    const iap = "arn:aws:s3:::saferemediate-logs-745783559495"
    expect(normalizeJewelArn(iap)).toBe(iap)
  })
})
