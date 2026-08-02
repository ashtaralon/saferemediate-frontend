/**
 * Integrity guard for the V3 executive cockpit.
 *
 * Re-introducing unknown→0 or hardcoded systems must fail these tests.
 *
 * These assertions were written for `estate-risk-brief.tsx`. The cockpit
 * replaced it — same four KPIs, same fail-closed rules, now inside the
 * bento. The component was DELETED rather than left beside its successor:
 * an unmounted duplicate is how this repo accumulated V2 sprawl, and an
 * honesty guard pointing at dead code protects nothing.
 *
 * The contract moves with the code. Every assertion below survived the
 * move unchanged except the mount check at the bottom.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
/**
 * Comments are STRIPPED before matching. These guards grep for coercion
 * patterns, and a comment explaining why `?? 0` is forbidden contains the
 * literal `?? 0` — so an accurate explanation failed the test that the
 * explanation exists to protect. Grep the code, not the prose.
 */
function code(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const BRIEF = code(readFileSync(
  join(ROOT, "components/dashboard/v3/executive-cockpit.tsx"),
  "utf8",
))
const HOME = code(readFileSync(
  join(ROOT, "components/dashboard/v3/home-dashboard-v3.tsx"),
  "utf8",
))

describe("ExecutiveCockpit — Neo4j-backed honesty", () => {
  it("wires only real proxy endpoints (no hardcoded systems)", () => {
    expect(BRIEF).toContain('/api/proxy/systems/with-families')
    expect(BRIEF).toContain('/api/proxy/identity-attack-paths/all')
    expect(BRIEF).toContain('/api/proxy/remediation-candidates')
    expect(BRIEF).not.toMatch(/alon-prod|demo-system|fakeSystems|mockSystems/)
  })

  it("MUTATION: unknown metrics must not coerce to 0", () => {
    // Em-dash for null is the unavailable glyph; ?? 0 invents authority.
    //
    // Assert the CONTRACT, not one spelling — the same lesson recorded in the
    // test below. This pinned `metric.value ?? "—"` verbatim, which forbade
    // strengthening the cell to ALSO suppress a value whose source could not
    // vouch for it. Against the pre-provenance backend that gap rendered
    // "Reachable crown jewels 18" directly above "Not established — this is
    // not a zero": a number and its own disclaimer in one cell.
    expect(BRIEF).toMatch(/\?\?\s*"—"/)
    expect(BRIEF).toMatch(/kpi\.unavailable\s*\?\s*null\s*:\s*kpi\.value/)
    expect(BRIEF).not.toMatch(/\?\?\s*0/)
    expect(BRIEF).not.toMatch(/\|\|\s*0\b/)
  })

  it("MUTATION: missing path/system payloads stay null until data arrives", () => {
    // Assert the CONTRACT, not one spelling of it. The previous version pinned
    // `paths.data?.total_jewels ?? null` verbatim, which forbade strengthening
    // it: `?? null` only catches null/undefined, so a backend returning NaN or
    // the string "18" flows straight through as a rendered number. The guard
    // is now Number.isFinite, which rejects both — a stricter check that the
    // old exact-match test would have failed.
    expect(BRIEF).toMatch(/Number\.isFinite/)
    for (const field of ["total_jewels", "total_paths", "exposed_jewels"]) {
      expect(BRIEF).toMatch(new RegExp(`num\\(paths\\.data\\?\\.${field}\\)`))
    }
    // Every metric value must be `number | null` — never widened to number.
    expect(BRIEF).toMatch(/value: number \| null/)
  })

  it("MUTATION: counts are never derived from a truncated list", () => {
    // The remediation fetch is ?limit=50. Counting the returned candidates and
    // presenting that as the total under-reports silently past 50, which is a
    // fabricated number wearing a real one's label.
    // Was `toContain("limit=50")` — a literal. Replacing the hardcoded
    // number with CANDIDATES_REQUEST_LIMIT, so the request and the
    // pagination claim have ONE owner, failed a guard whose actual
    // contract is "the request is bounded and counts don't come from the
    // truncated array". Third time in this PR a pinned literal blocked
    // the improvement it existed to protect.
    expect(BRIEF).toMatch(/remediation-candidates\?limit=(\d+|\$\{[A-Z_]+\})/)
    expect(BRIEF).not.toMatch(/candidates\s*\.\s*filter\([^)]*\)\.length/)
  })

  it("MUTATION: every source fails closed on an exhausted refresh", () => {
    // A cached value whose refresh failed keeps rendering as current unless the
    // hook is told otherwise — useCachedFetch only surfaces errors when data is
    // null. Three fetches, three opt-ins.
    // Assert the CONTRACT — every source fails closed — not a source count.
    // This pinned 3, so adding Evidence health and Verified outcomes to the
    // cockpit (so the management report could vouch for them) failed a test
    // that the additions strictly improved.
    const fetches = (BRIEF.match(/useCachedFetch</g) ?? []).length
    const failClosed = (BRIEF.match(/failClosedOnError:\s*true/g) ?? []).length
    expect(fetches).toBeGreaterThanOrEqual(3)
    expect(failClosed).toBe(fetches)
  })

  it("home dashboard mounts the cockpit, and the brief is gone for good", () => {
    expect(HOME).toContain("<ExecutiveCockpit")
    // Deleted, not orphaned beside its replacement.
    expect(HOME).not.toContain("EstateRiskBrief")
  })
})
