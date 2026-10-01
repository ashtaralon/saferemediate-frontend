/**
 * "Not observed during this window" must never read as "unused", "never used",
 * "safe to remove" or "does not exist" (owner ruling 2026-10-01). These are the
 * phrases this change removed, pinned per file so they cannot come back.
 *
 * LP / remediation surfaces keep their own evidence messaging (observed days,
 * decision-grade holds); what is pinned here is only the absence-as-fact claim.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const REMOVED: Record<string, RegExp[]> = {
  "components/sg-least-privilege-modal.tsx": [
    /No traffic observed in \{observationDays\} days — safe to remove/,
  ],
  "components/system-security-overview.tsx": [
    /No traffic observed in 365 days/,
    /Consider removing this unused rule/,
    /never used in 365 days/,
    /No traffic observed - safe to remove/,
    /Consider removing this rule if no longer needed/,
    /no recorded traffic in the last 365 days/,
    /Observation window: 365 days/,
  ],
  "components/aws-topology-map-live.tsx": [/Unused rule - no traffic observed/],
  "components/system-detail-dashboard.tsx": [
    /allowed but never used\./,
    /permission was never used/,
    /won't break anything/,
    /Observed: 7 days/,
    /Last used: Never/,
    /doesn't need this permission/,
  ],
  "components/iam-permission-analysis-modal.tsx": [/were never used in \{observationDays\} days/],
  "components/attack-paths-v2/exfil-view-v4.tsx": [/allowed but never used — gap/],
  "components/dependency-map/traffic-flow-map.tsx": [/<TimelineSlider/, /from '\.\/timeline-slider'/],
  "components/dependency-map/graph-view-v2.tsx": [/const \[timeWindow\] = useState\('7d'\)/],
}

/** Phrases no changed file may contain anywhere (absence stated as fact). */
const NEVER = [/safe to remove/i, /won't break anything/i, /does not exist/i]
const NEVER_IN: string[] = [
  "components/system-security-overview.tsx",
  "components/aws-topology-map-live.tsx",
  "components/system-detail-dashboard.tsx",
  "components/attack-paths-v2/exfil-view-v4.tsx",
  "components/sg-least-privilege-modal.tsx",
  "components/dependency-map/graph-view-v2.tsx",
  "components/coverage/observation-chip.tsx",
  "components/coverage/source-coverage-panel.tsx",
  "components/dependency-map/observation-window-selector.tsx",
  "lib/observation-coverage.ts",
]

describe("absence-as-fact copy stays removed", () => {
  for (const [file, patterns] of Object.entries(REMOVED)) {
    it(`${file} no longer states absence in a window as fact`, () => {
      const source = readFileSync(file, "utf8")
      for (const pattern of patterns) expect(source).not.toMatch(pattern)
    })
  }

  for (const file of NEVER_IN) {
    it(`${file} never says "safe to remove", "won't break anything" or "does not exist"`, () => {
      const source = readFileSync(file, "utf8")
      for (const pattern of NEVER) expect(source).not.toMatch(pattern)
    })
  }

  it("the replacement copy says 'not observed' with the window", () => {
    expect(readFileSync("components/sg-least-privilege-modal.tsx", "utf8")).toContain("notObservedInDaysCopy(analysis?.summary?.observation_days)")
    expect(readFileSync("components/aws-topology-map-live.tsx", "utf8")).toContain("notObservedInDaysCopy(gapData.observation_days)")
    expect(readFileSync("components/system-security-overview.tsx", "utf8")).toContain("NOT_OBSERVED_IN_RECORDED_WINDOW")
    expect(readFileSync("components/dependency-map/graph-view-v2.tsx", "utf8")).toContain("notObservedCopy(effectiveWindow)")
  })
})
