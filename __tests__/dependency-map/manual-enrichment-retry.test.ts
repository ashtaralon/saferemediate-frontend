import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SOURCE = readFileSync(
  join(__dirname, "..", "..", "components/dependency-map/traffic-flow-map.tsx"),
  "utf8",
)

describe("TrafficFlowMap manual enrichment retry", () => {
  it("clears the IAM/SG batch de-duplication key before refreshing", () => {
    const handler = SOURCE.match(
      /const handleManualRefresh = useCallback\(\(\) => \{([\s\S]*?)\n\s*\}, \[\]\)/,
    )?.[1]

    expect(handler).toBeTruthy()
    expect(handler).toContain("lastBatchEnrichmentKeyRef.current = null")
    expect(handler?.indexOf("lastBatchEnrichmentKeyRef.current = null")).toBeLessThan(
      handler?.indexOf("setManualBustEpoch") ?? -1,
    )
  })
})
