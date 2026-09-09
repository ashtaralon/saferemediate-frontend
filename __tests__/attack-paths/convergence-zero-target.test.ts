import { describe, expect, it } from "vitest"

import { hasAuthoritativeZeroPaths } from "@/lib/attack-paths/use-crown-jewel-convergence"

const jewel = {
  id: "arn:aws:rds:eu-west-1:123456789012:cluster:no-route",
  name: "no-route",
  type: "RDSCluster",
  path_count: 0,
}

describe("authoritative zero-path target handling", () => {
  it.each([
    "no_modeled_route",
    "coverage_incomplete",
    "projection_not_ready",
  ] as const)("settles %s without requesting a missing path summary", (target_state) => {
    expect(hasAuthoritativeZeroPaths({ ...jewel, target_state } as never)).toBe(true)
  })

  it("still fetches a summary when the catalog says paths exist", () => {
    expect(
      hasAuthoritativeZeroPaths({
        ...jewel,
        path_count: 2,
        target_state: "observed",
      } as never),
    ).toBe(false)
  })

  it("does not turn an unspecified zero into an authoritative conclusion", () => {
    expect(hasAuthoritativeZeroPaths(jewel as never)).toBe(false)
  })
})
