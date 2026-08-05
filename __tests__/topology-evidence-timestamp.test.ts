import { describe, expect, it } from "vitest"

import { formatEvidenceTimestamp } from "@/components/topology-v0-2/headline-strip"

describe("formatEvidenceTimestamp", () => {
  it("makes missing or malformed evidence time explicit", () => {
    expect(formatEvidenceTimestamp()).toBe("Evidence time unavailable")
    expect(formatEvidenceTimestamp("not-a-date")).toBe("Evidence time unavailable")
  })

  it("labels a valid timestamp as computed evidence", () => {
    expect(formatEvidenceTimestamp("2026-08-05T06:34:32Z")).toMatch(
      /^Evidence computed /,
    )
  })
})
