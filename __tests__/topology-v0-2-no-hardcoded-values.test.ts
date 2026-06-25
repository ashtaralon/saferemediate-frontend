/**
 * Sentinels for Topology v0.2 Estate page — guards against hardcoded values
 * leaking into the production page (CLAUDE.md rule #1: "Real data only — no
 * mock, ever").
 *
 * The mockup at public/design/topology-v0.2-estate.html shipped 57 workloads,
 * 4 flagged, 3 stale, 17/57 coverage, 14d freshness — all hardcoded. The
 * React port at app/topology/v0.2-estate/page.tsx + components/topology-v0-2/
 * must NOT carry those, nor any of the mockup's other fabricated values
 * (Frontend-1/Frontend-2 EC2 names, specific instance IDs, role names,
 * tier classification strings, AZ labels, route-table IDs).
 *
 * If this test ever regresses, the page is rendering fabricated decoration
 * and CLAUDE.md rule #1 is violated.
 */
import { describe, expect, test } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const repoRoot = resolve(__dirname, "..")
const pagePath = join(repoRoot, "app/topology/v0.2-estate/page.tsx")
const componentsDir = join(repoRoot, "components/topology-v0-2")

function readAllSources(): { path: string; src: string }[] {
  const files = [pagePath]
  for (const f of readdirSync(componentsDir)) {
    if (f.endsWith(".tsx") || f.endsWith(".ts")) {
      files.push(join(componentsDir, f))
    }
  }
  return files.map(p => ({ path: p, src: readFileSync(p, "utf8") }))
}

const FORBIDDEN_MOCKUP_NUMBERS = [
  // KPI strip from the mockup (lines 1338-1361)
  "57 workloads",
  "4 flagged",
  "3 stale",
  "17 / 57",
  "17/57",
  "14d",
  "11 of 30",
  // Specific EC2/role identifiers from the mockup (lines 1424+)
  "i-0f51b8b7",
  "i-03c72e12",
  "i-0df88ac8",
  "i-0aa725bf",
  "Frontend-1",
  "Frontend-2",
  "cyntro-demo-frontend-ssm-role",
  "CyntroEC2S3Role",
  "cyntro-demo-ec2-s3-role",
  "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Test-Public-1",
  "SafeRemediate-Test-Public-2",
  "SafeRemediate-Test-Private-App-1",
  "SafeRemediate-Test-App-1",
  "SafeRemediate-Test-Frontend",
  // VPC + account identifiers from the mockup
  "vpc-0329e985",
  "vpc-086bcc21",
  "745783559495",
  "payment-prod-alb",
  // AZ labels (contract has no AZ field)
  "eu-west-1a",
  "eu-west-1b",
  // Tier classification labels (contract has no tier field)
  "Web Tier",
  "Application Tier",
  // Decorative AWS chrome the contract doesn't back
  "rtb-0cd30616",
  "alon-prod-igw",
  "saferemediate-test-alb-sg",
  "saferemediate-test-app-sg",
]

describe("Topology v0.2 Estate page — no hardcoded mockup values", () => {
  for (const forbidden of FORBIDDEN_MOCKUP_NUMBERS) {
    test(`source does not contain mockup value "${forbidden}"`, () => {
      const sources = readAllSources()
      const hits = sources.filter(s => s.src.includes(forbidden))
      expect(hits.map(h => h.path)).toEqual([])
    })
  }

  test("the only string literal of a system name is the URL default fallback", () => {
    // alon-prod IS allowed as the query-param fallback in page.tsx — but
    // ONLY there. Verify no component file hardcodes it.
    const sources = readAllSources()
    for (const s of sources) {
      if (s.path.endsWith("page.tsx")) continue
      const lines = s.src.split("\n")
      lines.forEach((line, idx) => {
        if (line.includes("alon-prod") || line.includes("alon prod")) {
          throw new Error(
            `Component ${s.path}:${idx + 1} hardcodes "alon-prod" — components must accept the system name as a prop`,
          )
        }
      })
    }
  })

  test("no component imports from public/design (the static mockup)", () => {
    const sources = readAllSources()
    for (const s of sources) {
      expect(s.src).not.toContain("public/design/topology")
      expect(s.src).not.toContain("topology-v0.2-estate.html")
    }
  })

  test("every numeric KPI tile reads from props, not literals", () => {
    const sources = readAllSources()
    const headline = sources.find(s => s.path.endsWith("headline-strip.tsx"))
    expect(headline, "headline-strip.tsx must exist").toBeDefined()
    // KPI literal numbers MUST come through kpis.* — fail if a digit run
    // appears inside a `num=` prop value.
    expect(headline!.src).not.toMatch(/num=\{\d+\}/)
    expect(headline!.src).not.toMatch(/num="\d+"/)
  })

  test("filter-rail counts read from props, not literals", () => {
    const sources = readAllSources()
    const rail = sources.find(s => s.path.endsWith("filter-rail.tsx"))
    expect(rail, "filter-rail.tsx must exist").toBeDefined()
    // CountChip MUST receive n from a variable, not a literal.
    expect(rail!.src).not.toMatch(/<CountChip\s+n=\{\d+\}/)
  })
})
