import { describe, expect, it } from "vitest"

import { resolveLPReviewSurface } from "@/lib/lp-review-routing"

describe("least-privilege review routing", () => {
  it("keeps IAM on its canonical Change Case when mutation authority is held", () => {
    expect(resolveLPReviewSurface("IAMRole", true)).toBe("iam")
    expect(resolveLPReviewSurface("IAMRole", false)).toBe("iam")
  })

  it("keeps held SG and S3 findings on the read-only surface", () => {
    expect(resolveLPReviewSurface("SecurityGroup", true)).toBe("read-only")
    expect(resolveLPReviewSurface("S3Bucket", true)).toBe("read-only")
  })

  it("opens typed SG and S3 review only when integrity is ready", () => {
    expect(resolveLPReviewSurface("SecurityGroup", false)).toBe("security-group")
    expect(resolveLPReviewSurface("S3Bucket", false)).toBe("s3")
  })

  it("fails unknown resource types closed", () => {
    expect(resolveLPReviewSurface("LambdaFunction", false)).toBe("read-only")
  })
})
