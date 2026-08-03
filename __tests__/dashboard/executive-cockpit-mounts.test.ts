import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..", "..")
const v3 = join(root, "components/dashboard/v3")
const exec = readFileSync(join(v3, "executive-cockpit.tsx"), "utf8")
const ops = readFileSync(join(v3, "operations-view.tsx"), "utf8")
const shell = readFileSync(join(v3, "home-dashboard-v3.tsx"), "utf8")

describe("Home view ownership", () => {
  it("mounts the executive snapshot and operations views", () => {
    expect(shell).toContain("<ExecutiveCockpit")
    expect(shell).toContain("<OperationsView")
  })

  it("keeps technical cards in Operations", () => {
    for (const card of [
      "HeroBrssCard",
      "SeverityDonutCard",
      "FamilyStrip",
      "DecisionRoutingCard",
      "WildcardBloatCard",
      "LPTopIssuesCard",
      "RecentActivityCard",
    ]) {
      expect(ops).toContain(`<${card}`)
    }
  })

  it("does not remount five independently-timed executive readers", () => {
    for (const card of [
      "TopSystemsCard",
      "SafeRemediationsQueueCard",
      "AttackPathsCard",
      "EvidenceHealthCardV3",
      "NarrowingSummaryCard",
    ]) {
      expect(exec).not.toContain(`<${card}`)
    }
  })

  it("the management report describes the same snapshot", () => {
    expect(exec).toContain("onReadiness")
    expect(exec).toContain("sources")
  })
})
