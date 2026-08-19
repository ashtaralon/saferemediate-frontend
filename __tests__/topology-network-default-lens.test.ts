import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Network topology default lens", () => {
  it("opens the embedded estate map on dependencies so live traffic is visible", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/dependency-map-tab.tsx"),
      "utf8",
    )

    expect(source).toContain('defaultFlowMode="all_access"')
  })
})
