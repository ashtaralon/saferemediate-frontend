/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest"

import { getServiceMeta, resolveServiceType } from "@/lib/service-type"

describe("InstanceProfile service type", () => {
  it("does not collapse an instance profile into EC2 or IAM role", () => {
    expect(resolveServiceType("InstanceProfile")).toBe("InstanceProfile")
    expect(resolveServiceType("instance_profile")).toBe("InstanceProfile")
    expect(resolveServiceType("AWS::IAM::InstanceProfile")).toBe("InstanceProfile")
    expect(resolveServiceType("arn:aws:iam::745783559495:instance-profile/worker")).toBe("InstanceProfile")
  })

  it("uses a distinct identity-plane label", () => {
    expect(getServiceMeta("InstanceProfile")).toMatchObject({
      key: "InstanceProfile",
      label: "Instance profile",
      short: "Profile",
      category: "identity",
    })
  })
})
