import { describe, expect, it } from "vitest"

import { hasAuthoritativePositiveTraffic } from "@/components/topology-v0-2/types"

describe("topology traffic authority state", () => {
  it.each(["authoritative", "authoritative_positive_only"])(
    "treats %s as authoritative for confirmed moving segments",
    (state) => {
      expect(hasAuthoritativePositiveTraffic(state)).toBe(true)
    },
  )

  it.each(["rebuilding", "legacy_unverified", undefined])(
    "does not promote %s",
    (state) => {
      expect(hasAuthoritativePositiveTraffic(state)).toBe(false)
    },
  )
})
