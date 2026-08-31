import { describe, expect, it } from "vitest"

import { resolveLPReviewSurface } from "@/lib/lp-review-routing"

describe("least-privilege review routing", () => {
  it("keeps IAM on its canonical Change Case", () => {
    expect(resolveLPReviewSurface("IAMRole")).toBe("iam")
    expect(resolveLPReviewSurface("IAM Role")).toBe("iam")
    expect(resolveLPReviewSurface("iam_role")).toBe("iam")
  })

  it("keeps Security Group and data-access findings on their typed workflows", () => {
    expect(resolveLPReviewSurface("SecurityGroup")).toBe("security-group")
    expect(resolveLPReviewSurface("Security Group")).toBe("security-group")
    expect(resolveLPReviewSurface("S3Bucket")).toBe("s3")
    expect(resolveLPReviewSurface("s3-bucket")).toBe("s3")
  })

  it("fails unknown resource types closed", () => {
    expect(resolveLPReviewSurface("LambdaFunction")).toBe("read-only")
  })
})
