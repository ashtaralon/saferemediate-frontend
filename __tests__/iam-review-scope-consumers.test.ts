/**
 * Every reachable reader of the IAM Review contract names the account.
 *
 * The modal was not the only consumer: a completion audit found thirteen more
 * call sites on the same endpoint, all of which resolved a role without saying
 * which account to resolve it in. A role id is not unique across accounts, so
 * an unscoped read asks the backend to pick one.
 *
 * The React consumers now call `buildIamGapAnalysisUrl`, whose behaviour is
 * covered in iam-gap-analysis-scope-end-to-end.test.tsx. The copilot router is
 * different in kind -- it is a pure function that RETURNS a URL for the gallery
 * to fetch -- so its behaviour is asserted here, against the real router.
 */
import { describe, expect, it } from "vitest"

import { resolveIntent } from "@/components/copilot/intent-router"

const ROLE = "cyntro-tb-prod-web-role"
const SYSTEM = "tb-prod-webshop"
/** What the gallery passes: the operator's real selection, every field present. */
const SELECTED = {
  customerId: "cust-testbed",
  groupId: "prod",
  accountId: "416651950952",
  region: "eu-west-1",
}
const params = (url: string) => new URL(url, "https://app.example").searchParams

describe("copilot router: the per-role read carries the operator's selection", () => {
  it("scopes the gap-analysis route when the gallery supplies a selection", () => {
    const route = resolveIntent("unused-on-role", {
      systemName: SYSTEM, roleName: ROLE, scope: SELECTED,
    })
    expect(route).not.toBeNull()
    const q = params(route!.url)
    expect(q.get("customer_id")).toBe(SELECTED.customerId)
    expect(q.get("account_id")).toBe(SELECTED.accountId)
    expect(q.get("region")).toBe(SELECTED.region)
    // The envelope and window this route already asked for are not lost.
    expect(q.get("envelope")).toBe("true")
    expect(q.get("days")).toBe("365")
    expect(route!.url).not.toContain("undefined")
    expect(route!.url).not.toContain("null")
  })

  it("invents nothing when the caller supplied no selection", () => {
    // Absence is preserved as absence. A guessed account is a cross-tenant
    // read, so the router never fills one in -- it just asks for less.
    const route = resolveIntent("unused-on-role", { systemName: SYSTEM, roleName: ROLE })
    const q = params(route!.url)
    expect(q.has("customer_id")).toBe(false)
    expect(q.has("account_id")).toBe(false)
    expect(q.has("region")).toBe(false)
    expect(q.get("envelope")).toBe("true")
    expect(q.get("days")).toBe("365")
  })

  it("still locks every admitted tool to its system", () => {
    // Regression guard: adding scope must not disturb the system boundary the
    // copilot already enforced (see copilot-scope-lock.test.ts).
    for (const tool of [
      "top-unused-iam", "broad-s3", "blast-radius", "paths-to-jewels",
      "recent-changes", "safe-to-apply", "highest-risk", "inventory-count",
      "inventory-list",
    ]) {
      const route = resolveIntent(tool, { systemName: "payments", resourceType: "s3" })
      expect(route, tool).not.toBeNull()
      const url = new URL(route!.url, "https://app.example")
      expect(url.searchParams.get("system") ?? url.searchParams.get("systemName"), tool)
        .toBe("payments")
    }
  })
})
