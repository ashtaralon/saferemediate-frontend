/**
 * "Not observed during this window" must never read as "unused", "never used",
 * "safe to remove", "safe to cut" or "does not exist" (owner ruling 2026-10-01).
 * LP and remediation may say a removal is a CANDIDATE, gated by their own
 * evidence; they may not state absence as fact.
 *
 * 1. A tree-wide scan of every file under components/ and app/ (code, copy and
 *    comments alike), with an allowlist keyed by exact file:line plus the text
 *    expected there and a reason. An entry whose line moved or changed fails, so
 *    the allowlist cannot silently cover something new.
 * 2. Per-file pins for the specific strings this change removed, including the
 *    ones the tree-wide phrases do not catch (e.g. the SG modal's UNUSED badge).
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SCANNED_ROOTS = ["components", "app"]
const BANNED = /never used|safe to remove|safe to cut|unused rule|does not exist|won't break anything/i

/** file:line → the text that line must still contain, and why it may stay. */
const ALLOWED: Record<string, { text: string; reason: string }> = {
  "components/system-detail-dashboard.tsx.backup:1489": {
    text: "These permissions are allowed but never used.",
    reason: "Tracked backup copy of a pre-rewrite file; not imported, not compiled (eslint ignores **/*.backup). The live file was reworded.",
  },
  "components/system-detail-dashboard.tsx.backup:1652": {
    text: "permission was never used.",
    reason: "Same backup copy as above; never rendered.",
  },
  "components/system-detail-dashboard.tsx.backup:1654": {
    text: "Removing it won't break anything.",
    reason: "Same backup copy as above; never rendered.",
  },
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function bannedHits(): Array<{ key: string; line: string }> {
  const hits: Array<{ key: string; line: string }> = []
  for (const root of SCANNED_ROOTS) {
    for (const file of walk(root)) {
      const lines = readFileSync(file, "utf8").split("\n")
      lines.forEach((line, index) => {
        if (BANNED.test(line)) hits.push({ key: `${file}:${index + 1}`, line: line.trim() })
      })
    }
  }
  return hits
}

describe("no absence-as-fact phrase anywhere under components/ or app/", () => {
  const hits = bannedHits()

  it("every hit is an allowlisted file:line", () => {
    const unexpected = hits.filter((hit) => !(hit.key in ALLOWED)).map((hit) => `${hit.key}: ${hit.line}`)
    expect(unexpected).toEqual([])
  })

  it("every allowlist entry still matches its line (no stale or drifted entries)", () => {
    const byKey = new Map(hits.map((hit) => [hit.key, hit.line]))
    const stale = Object.entries(ALLOWED)
      .filter(([key, entry]) => !byKey.get(key)?.includes(entry.text))
      .map(([key, entry]) => `${key} no longer holds "${entry.text}" (now: ${byKey.get(key) ?? "no banned phrase"})`)
    expect(stale).toEqual([])
  })

  it("the scan actually reads the tree (positive control)", () => {
    // The allowlisted backup lines are real hits; if the walk or the regex broke,
    // this would find nothing and the two checks above would pass vacuously.
    expect(hits.length).toBeGreaterThanOrEqual(Object.keys(ALLOWED).length)
    expect(BANNED.test("Never Used — Safe To Cut")).toBe(true)
    expect(BANNED.test("Not observed in the recorded window — removal candidate")).toBe(false)
  })
})

const REMOVED: Record<string, RegExp[]> = {
  "components/sg-least-privilege-modal.tsx": [
    /No traffic observed in \{observationDays\} days — safe to remove/,
    />UNUSED<\/span>/,
    /Unused Rules \(\{unusedRules\}\)/,
    /No unused rules found/,
    /Identifying unused rules/,
  ],
  "components/system-security-overview.tsx": [
    /No traffic observed in 365 days/,
    /never used in 365 days/,
    /no recorded traffic in the last 365 days/,
    /Observation window: 365 days/,
    /'Unused Rule'/,
  ],
  "components/aws-topology-map-live.tsx": [/Unused rule - no traffic observed/],
  "components/system-detail-dashboard.tsx": [
    /Observed: 7 days/,
    /Last used: Never/,
    /doesn't need this permission/,
  ],
  "components/iam-permission-analysis-modal.tsx": [
    /were never used in \{observationDays\} days/,
    /'Safe to remove \(≥70/,
  ],
  "components/attack-paths-v2/exfil-view-v4.tsx": [/allowed but never used — gap/],
  "components/attack-paths-v2/lateral-reach-bands.tsx": [/Never used — safe to cut/, /never used it/],
  "components/dependency-map/executive-summary.tsx": [/Open doors nobody uses/, /never used it in 30 days/, /Closing the permission\s+is safe/],
  "components/system-dependency-map.tsx": [/<span>Unused Rule<\/span>/, /unused rules/],
  "components/per-resource-analysis.tsx": [/Never used \(/, /ports they don&apos;t use/],
  "components/sg-remediation-card.tsx": [/label: "Safe to remove"/],
  "components/s3-remediation-card.tsx": [/label: "Safe to remove"/],
  "app/api/proxy/orphan-services/[systemName]/route.ts": [/Completely isolated — safe to remove/, /Safe to terminate/],
  "components/dependency-map/traffic-flow-map.tsx": [/<TimelineSlider/, /from '\.\/timeline-slider'/],
  "components/dependency-map/graph-view-v2.tsx": [/const \[timeWindow\] = useState\('7d'\)/],
}

describe("the strings this change removed stay removed", () => {
  for (const [file, patterns] of Object.entries(REMOVED)) {
    it(`${file}`, () => {
      const source = readFileSync(file, "utf8")
      for (const pattern of patterns) expect(source).not.toMatch(pattern)
    })
  }

  it("the replacements say 'not observed' with the window, and 'removal candidate' on LP / remediation", () => {
    expect(readFileSync("components/sg-least-privilege-modal.tsx", "utf8")).toContain("notObservedInDaysCopy(analysis?.summary?.observation_days)")
    expect(readFileSync("components/aws-topology-map-live.tsx", "utf8")).toContain("notObservedInDaysCopy(gapData.observation_days)")
    expect(readFileSync("components/system-security-overview.tsx", "utf8")).toContain("NOT_OBSERVED_IN_RECORDED_WINDOW")
    expect(readFileSync("components/dependency-map/graph-view-v2.tsx", "utf8")).toContain("notObservedCopy(effectiveWindow)")
    expect(readFileSync("components/attack-paths-v2/lateral-reach-bands.tsx", "utf8")).toContain("notObservedInUseCopy(window)} — ${REMOVAL_CANDIDATE}")
    expect(readFileSync("components/iam-permission-analysis-modal.tsx", "utf8")).toContain("Removal candidate (execution evidence ${execution}% ≥70 — auto-eligible)")
    expect(readFileSync("components/sg-remediation-card.tsx", "utf8")).toContain('label: "Removal candidate (not observed in use)"')
    expect(readFileSync("components/s3-remediation-card.tsx", "utf8")).toContain('label: "Removal candidate (not observed in use)"')
  })
})
