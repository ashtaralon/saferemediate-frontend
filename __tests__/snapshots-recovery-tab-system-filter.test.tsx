/**
 * Recovery tab system view (S-3): a system's snapshots are shown only under a server-proven scope, and never by name.
 *
 * Decision bodies: `fixtures/semantic-decision-inventory-slices-closed-v1` (synthetic closed-local, see SOURCES.md)
 * through the REAL decision-list proxy route. The legacy snapshot listing rows below are SYNTHETIC, shaped from this
 * component's own reader. The listing, its provenance, restore and the scoped envelope belong to Permissions (C); the
 * legacy listing states no scope, so a selected system hides it by name. The component is declared but not rendered
 * by `system-detail-dashboard.tsx` at FE `cd3c67b6`, so these controls mount it directly.
 */
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://customer-backend.example" }))
const scope = vi.hoisted(() => ({
  current: { customerId: "c-1", groupId: "all", accountId: "111122223333", region: "all", options: null } as Record<string, unknown>,
}))
vi.mock("@/lib/account-scope-context", () => ({ useAccountScope: () => scope.current }))

import RecoveryTab, {
  SNAPSHOT_SCOPE_UNPROVEN,
  SNAPSHOT_SYSTEM_FAMILIES,
  SYSTEM_FILTER_UNAVAILABLE,
  snapshotsInView,
  systemSnapshotView,
} from "@/components/snapshots-recovery-tab"
import { fetchDecisionFamilyAnswers } from "@/lib/inventory-decision-families"
import { routeThroughProxy, type Reply, type UpstreamCall } from "./fixtures/semantic-decision-inventory-slices-closed-v1/route-chain"

const SG_ARN = "arn:aws:ec2:eu-west-1:111122223333:security-group/sg-0000000000000001"
/** Synthetic legacy listing rows: one whose sg_name collides with a listed SG's name, one IAM role checkpoint. */
const LEGACY_LISTING = [
  { snapshot_id: "SG-legacy-1", sg_id: "sg-0000000000000001", sg_name: "fixture-substitute-sg-1", region: "eu-west-1",
    timestamp: "2026-09-01T00:00:00Z", reason: "synthetic", triggered_by: "synthetic", status: "available" },
  { snapshot_id: "IAMRole-fixture-substitute-role-1-abcd1234", role_name: "fixture-substitute-role-1", region: "eu-west-1",
    timestamp: "2026-09-02T00:00:00Z", reason: "synthetic", triggered_by: "synthetic", status: "available" },
]
const READY: Record<string, string> = { sg: "list-ready-sg", "iam-role": "list-ready-iam-role", s3: "list-ready-s3" }
const PAGE = { customerId: "c-1", groupId: "all", accountId: "111122223333", region: "all" }
const originalFetch = globalThis.fetch
const legacyListing = (raw: string) =>
  raw.startsWith("/api/proxy/snapshots") ? Response.json({ snapshots: LEGACY_LISTING })
    : raw.startsWith("/api/proxy/iam-snapshots") ? Response.json({ snapshots: [] })
      : undefined

beforeEach(() => {
  process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
  scope.current = { ...PAGE, options: null }
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  vi.restoreAllMocks()
})

async function readyFamilies(replies: Record<string, string> = READY) {
  routeThroughProxy((alias) => replies[alias], [], legacyListing)
  return fetchDecisionFamilyAnswers("payments", PAGE, SNAPSHOT_SYSTEM_FAMILIES)
}

describe("S-3 mounted: a selected system never shows the unscoped legacy listing", () => {
  it("hides the collection and every action by name, even when a listed resource's name matches a snapshot", async () => {
    const upstream: UpstreamCall[] = []
    routeThroughProxy((alias) => READY[alias], upstream, legacyListing)

    const { container } = render(<RecoveryTab systemName="payments" />)
    await waitFor(() => expect(container.querySelector("[data-testid=recovery-system-scope-state]")).not.toBeNull())

    expect(upstream.map((call) => call.alias).sort()).toEqual(["iam-role", "s3", "sg"])
    for (const call of upstream) expect(call.query).toMatchObject({ system: "payments", customer_id: "c-1", account_id: "111122223333" })
    const state = container.querySelector("[data-testid=recovery-system-scope-state]")
    expect(state?.getAttribute("data-code")).toBe(SNAPSHOT_SCOPE_UNPROVEN)
    expect(state?.textContent).toContain("Snapshots for payments are not shown (SNAPSHOT_SCOPE_UNPROVEN)")
    for (const hidden of ["SG-legacy-1", "fixture-substitute-sg-1", "fixture-substitute-role-1", "Delete All", "Select All", "No snapshots yet"]) {
      expect(container.textContent).not.toContain(hidden)
    }
    expect(container.textContent).not.toMatch(/\d+ snapshots?/)
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(0)
  })

  it("names a snapshot family that did not answer, and still shows nothing", async () => {
    routeThroughProxy((alias) => ({ ...READY, "iam-role": "list-refused-null-stable-id-iam-role" } as Record<string, string>)[alias], [], legacyListing)

    const { container } = render(<RecoveryTab systemName="payments" />)
    await waitFor(() => expect(container.querySelector("[data-testid=recovery-system-filter-notices]")).not.toBeNull())

    expect(container.querySelector("[data-testid=recovery-system-filter-notices]")?.textContent)
      .toBe("IAM roles: refused (INVENTORY_LIST_STABLE_ID_UNAVAILABLE)")
    expect(container.textContent).not.toContain("SG-legacy-1")
  })

  it("without a selected system the listing is shown as before, and no Decision family is asked", async () => {
    const upstream: UpstreamCall[] = []
    routeThroughProxy((alias) => READY[alias], upstream, legacyListing)

    const { container } = render(<RecoveryTab />)
    await waitFor(() => expect(container.textContent).toContain("2 snapshots"))

    expect(upstream).toHaveLength(0)
    expect(container.querySelector("[data-testid=recovery-system-scope-state]")).toBeNull()
  })
})

describe("S-3 view rule: server scope first, exact identity only", () => {
  const proven = { tenant_id: "c-1", account_id: "111122223333", resolved_by: "server" }

  it("a proven same-scope listing with every family ready keeps only exact ARN matches, never names", async () => {
    const families = await readyFamilies()
    const view = systemSnapshotView("payments", families, proven, PAGE)
    expect(view.kind).toBe("scoped")

    const rows = [
      { snapshot_id: "exact", resource_arn: SG_ARN },
      { snapshot_id: "name-only", sg_name: "fixture-substitute-sg-1" },
      { snapshot_id: "twin-account", resource_arn: SG_ARN.replace("111122223333", "444455556666") },
      { snapshot_id: "case-folded", resource_arn: SG_ARN.toUpperCase() },
    ]
    expect(snapshotsInView(rows, view).map((row) => row.snapshot_id)).toEqual(["exact"])
  })

  it.each([
    ["no stated scope (the legacy listing)", null, PAGE],
    ["a client-resolved scope", { ...proven, resolved_by: "client" }, PAGE],
    ["another account", { ...proven, account_id: "444455556666" }, PAGE],
    ["another tenant", { ...proven, tenant_id: "c-2" }, PAGE],
    ["an all-accounts page", proven, { ...PAGE, accountId: "all" }],
    ["a page without a tenant", proven, { ...PAGE, customerId: "" }],
  ])("%s is SNAPSHOT_SCOPE_UNPROVEN and shows no row", async (_label, listingScope, page) => {
    const families = await readyFamilies()
    const view = systemSnapshotView("payments", families, listingScope, page)

    expect(view).toMatchObject({ kind: "hidden", code: SNAPSHOT_SCOPE_UNPROVEN })
    expect(snapshotsInView([{ snapshot_id: "exact", resource_arn: SG_ARN }], view)).toEqual([])
  })

  it.each([
    ["a refused family", { ...READY, sg: "list-refused-forbidden-sg" }],
    ["an offboarded-tenant refusal", { ...READY, s3: "list-refused-offboarded-s3" }],
  ])("under a proven scope, %s makes the filter unavailable instead of a partial match", async (_label, replies) => {
    const families = await readyFamilies(replies)
    const view = systemSnapshotView("payments", families, proven, PAGE)

    expect(view).toMatchObject({ kind: "hidden", code: SYSTEM_FILTER_UNAVAILABLE })
    expect(snapshotsInView([{ snapshot_id: "exact", resource_arn: SG_ARN }], view)).toEqual([])
  })
})

describe("S-3: an earlier selection's response never renders", () => {
  it("an account switch while the first account's filter is pending renders only the second account's state", async () => {
    let releaseFirst: (name: string) => void = () => {}
    const first = new Promise<string>((resolve) => { releaseFirst = resolve })
    routeThroughProxy((alias, query): Reply =>
      query.account_id === "111122223333" && alias === "sg" ? { deferred: first } : READY[alias], [], legacyListing)

    const { container, rerender } = render(<RecoveryTab systemName="payments" />)
    scope.current = { ...scope.current, accountId: "444455556666" }
    rerender(<RecoveryTab systemName="payments" />)
    await waitFor(() => expect(container.querySelector("[data-testid=recovery-system-scope-state]")).not.toBeNull())
    expect(container.querySelector("[data-testid=recovery-system-filter-notices]")).toBeNull()

    await act(async () => {
      releaseFirst("list-refused-forbidden-sg")
      await first
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(container.textContent).not.toContain("ANALYST_RESOURCE_TYPE_FORBIDDEN")
    expect(container.querySelector("[data-testid=recovery-system-filter-notices]")).toBeNull()
  })

  it("leaving the system view while its load is pending never hides the page with that system's state", async () => {
    let releaseFirst: (name: string) => void = () => {}
    const first = new Promise<string>((resolve) => { releaseFirst = resolve })
    routeThroughProxy((alias): Reply => (alias === "sg" ? { deferred: first } : READY[alias]), [], legacyListing)

    const { container, rerender } = render(<RecoveryTab systemName="payments" />)
    rerender(<RecoveryTab />)
    await waitFor(() => expect(container.textContent).toContain("2 snapshots"))

    await act(async () => {
      releaseFirst("list-ready-sg")
      await first
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(container.querySelector("[data-testid=recovery-system-scope-state]")).toBeNull()
    expect(container.textContent).toContain("2 snapshots")
  })
})

describe("S-3 corrections (Root228): a new attempt never exposes the previous collection", () => {
  it("a system switch while the first system's filter is pending renders only the second system's state", async () => {
    let releaseFirst: (name: string) => void = () => {}
    const first = new Promise<string>((resolve) => { releaseFirst = resolve })
    routeThroughProxy((alias, query): Reply =>
      query.system === "payments" && alias === "sg" ? { deferred: first } : READY[alias], [], legacyListing)

    const { container, rerender } = render(<RecoveryTab systemName="payments" />)
    rerender(<RecoveryTab systemName="ledger" />)
    await waitFor(() => expect(container.textContent).toContain("Snapshots for ledger are not shown"))

    await act(async () => {
      releaseFirst("list-refused-forbidden-sg")
      await first
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(container.textContent).toContain("Snapshots for ledger are not shown (SNAPSHOT_SCOPE_UNPROVEN)")
    expect(container.textContent).not.toContain("payments")
    expect(container.textContent).not.toContain("ANALYST_RESOURCE_TYPE_FORBIDDEN")
  })

  it("a successful listing followed by a failed load in a new scope shows no earlier row, count, checkbox or action", async () => {
    let listingFails = false
    routeThroughProxy((alias) => READY[alias], [], (raw) => {
      if (raw.startsWith("/api/proxy/snapshots")) {
        if (listingFails) throw new TypeError("network error")
        return Response.json({ snapshots: LEGACY_LISTING })
      }
      return raw.startsWith("/api/proxy/iam-snapshots") ? Response.json({ snapshots: [] }) : undefined
    })

    const { container, rerender } = render(<RecoveryTab />)
    await waitFor(() => expect(container.textContent).toContain("2 snapshots"))

    listingFails = true
    scope.current = { ...scope.current, accountId: "444455556666" }
    rerender(<RecoveryTab />)
    await waitFor(() => expect(container.textContent).toContain("network error"))

    for (const hidden of ["SG-legacy-1", "fixture-substitute-sg-1", "Delete All", "Select All", "2 snapshots"]) {
      expect(container.textContent).not.toContain(hidden)
    }
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(0)
  })

  it("a selection made before a failed attempt is cleared, not carried into the next successful read", async () => {
    let listingFails = false
    routeThroughProxy((alias) => READY[alias], [], (raw) => {
      if (raw.startsWith("/api/proxy/snapshots")) {
        if (listingFails) throw new TypeError("network error")
        return Response.json({ snapshots: LEGACY_LISTING })
      }
      return raw.startsWith("/api/proxy/iam-snapshots") ? Response.json({ snapshots: [] }) : undefined
    })

    const { container, rerender, getByText } = render(<RecoveryTab />)
    await waitFor(() => expect(container.textContent).toContain("2 snapshots"))
    await act(async () => { (container.querySelectorAll("input[type=checkbox]")[1] as HTMLInputElement).click() })
    expect(container.textContent).toContain("Select All (1 of 2 selected)")

    listingFails = true
    scope.current = { ...scope.current, accountId: "444455556666" }
    rerender(<RecoveryTab />)
    await waitFor(() => expect(container.textContent).toContain("network error"))

    listingFails = false
    await act(async () => { getByText("Retry").click() })
    await waitFor(() => expect(container.textContent).toContain("2 snapshots"))
    expect(container.textContent).toContain("Select All (0 of 2 selected)")
  })
})

describe("the shared listing proxies answer with the canonical envelope, and the recovery tab consumes its stated scope", () => {
  // The envelope shape is the accepted supplier's (backend afa99c98, pa178/listing_bodies_178.raw.json), with one
  // row whose exact ARN is the S-3 fixture's listed IAM role.
  //
  // R221 correction: the tab used to pass `null` as the listing scope unconditionally, so a selected system was
  // hidden even when the canonical listing proved its own tenant and account server-side. It now passes the
  // envelope's OWN `scope` statement through unchanged, and the existing positive rule judges it. Visibility is
  // still earned, never assumed: the row below appears only because the listing resolved_by === "server" and its
  // tenant and single account equal the page's, AND the row's exact ARN is one the system's Decision families
  // listed. No name is ever matched, and the ambiguity cases above (all-accounts page, page without a tenant,
  // foreign account) remain withheld by that same rule.
  const ENVELOPE = {
    scope: { tenant_id: "c-1", account_id: "111122223333", region: null, resolved_by: "server" },
    selectors: { system_name: null, resource_arn: null, limit: 200 }, complete: true, incomplete_reason: null,
    sources: [{ source: "operation_ledger", state: "read", rows: 1, examined: 1, withheld: 0, withheld_reasons: {}, unsettled: 0, unsettled_operations: [] },
              { source: "graph_iam_snapshots", state: "refused", reason: "SNAPSHOT_SCOPE_UNPROVEN" }],
    snapshots: [{ snapshot_id: "IAMRole-fixture-substitute-role-1-abcd1234", operation_id: "op-1", snapshot_type: "IAM_BOUNDARY_CHECKPOINT",
                  resource_type: "IAMRole", resource_arn: "arn:aws:iam::111122223333:role/fixture-substitute-role-1",
                  tenant_id: "c-1", account_id: "111122223333", state: "VERIFIED", created_at: "2026-09-02T00:00:00+00:00",
                  current: { code: "CURRENT", operationId: "op-1" }, restoration: null, offer_withheld_reason: null,
                  rollback_available: true, scope_proof: "PROVEN_TENANT_ACCOUNT", role_name: "fixture-substitute-role-1", original_role: "fixture-substitute-role-1" }],
    count: 1, total_rows: 1,
    proxy_retired_sources: [{ source: "sg_least_privilege_snapshots", state: "not_requested", reason: "SNAPSHOT_SCOPE_UNPROVEN" }],
  }
  const envelopeListing = (raw: string) =>
    raw.startsWith("/api/proxy/snapshots") ? Response.json(ENVELOPE)
      : raw.startsWith("/api/proxy/iam-snapshots") ? Response.json({ ...ENVELOPE, snapshots: [], count: 0, total_rows: 0 })
        : undefined

  it("without a system the envelope's rows are listed", async () => {
    routeThroughProxy((alias) => READY[alias], [], envelopeListing)
    const { container } = render(<RecoveryTab />)
    await waitFor(() => expect(container.textContent).toMatch(/1 snapshots?/))
    expect(container.textContent).toContain("fixture-substitute-role-1")
  })

  it("with a system, a listing that proves the page's own tenant and account shows the row by exact identity", async () => {
    routeThroughProxy((alias) => READY[alias], [], envelopeListing)
    const scoped = render(<RecoveryTab systemName="payments" />)
    // The row's ARN is one the ready IAM-role family listed, so it survives the identity filter.
    await waitFor(() => expect(scoped.container.textContent).toContain("fixture-substitute-role-1"))
    // Nothing was withheld: a proven scope leaves no scope-state marker.
    expect(scoped.container.querySelector("[data-testid=recovery-system-scope-state]")).toBeNull()
  })

  it("with a system, the SAME envelope is withheld when its account is not the page's", async () => {
    const previous = scope.current
    scope.current = { ...previous, accountId: "444455556666" }
    try {
      routeThroughProxy((alias) => READY[alias], [], envelopeListing)
      const foreign = render(<RecoveryTab systemName="payments" />)
      await waitFor(() => expect(foreign.container.querySelector("[data-testid=recovery-system-scope-state]")).not.toBeNull())
      expect(foreign.container.querySelector("[data-testid=recovery-system-scope-state]")?.getAttribute("data-code")).toBe(SNAPSHOT_SCOPE_UNPROVEN)
      expect(foreign.container.textContent).not.toContain("fixture-substitute-role-1")
    } finally {
      scope.current = previous
    }
  })
})
