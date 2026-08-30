import { describe, expect, it } from "vitest"

import {
  resolveSecurityGroupReviewTarget,
  securityGroupReviewQuery,
} from "@/lib/security-group-review-target"

describe("Security Group review target", () => {
  it("binds SG id, account, and Region from one finding", () => {
    const target = resolveSecurityGroupReviewTarget({
      id: "sg-0028d181663ac8b1b",
      resourceName: "cyntro-tb-prod-alb-public",
      resourceArn:
        "arn:aws:ec2:eu-west-1:416651950952:security-group/sg-0028d181663ac8b1b",
      accountId: "416651950952",
    })

    expect(target).toEqual({
      sgId: "sg-0028d181663ac8b1b",
      accountId: "416651950952",
      region: "eu-west-1",
      resourceArn:
        "arn:aws:ec2:eu-west-1:416651950952:security-group/sg-0028d181663ac8b1b",
    })
    expect(securityGroupReviewQuery(target!)).toBe(
      "account_id=416651950952&region=eu-west-1",
    )
  })

  it("derives account and Region from the ARN", () => {
    expect(
      resolveSecurityGroupReviewTarget({
        id: "not-canonical",
        resourceArn:
          "arn:aws:ec2:eu-west-1:416651950952:security-group/sg-0028d181663ac8b1b",
      }),
    ).toMatchObject({
      sgId: "sg-0028d181663ac8b1b",
      accountId: "416651950952",
      region: "eu-west-1",
    })
  })

  it("fails closed when account or Region is absent", () => {
    expect(
      resolveSecurityGroupReviewTarget({ id: "sg-0028d181663ac8b1b" }),
    ).toBeNull()
  })
})
