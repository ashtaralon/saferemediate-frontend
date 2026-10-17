/**
 * F31 (Codex SW-S1A-20261013-24): the System detail header's metadata.
 * - F31-META-IDENTITY-01: it is read by THE catalogue selection rule (selectCatalogSystem, via selectedCatalogRow). An
 *   authored key opened under an account narrowing (an authored key spans accounts; its row's identity has no account)
 *   gets its metadata. A tag / source key's row is still read only in its own account. A foreign key or a repeated label
 *   reads nothing.
 * - F31-META-ORDER-02: it belongs to the context it was read for. The page can reuse the mounted dashboard across
 *   identities, so:
 *   - a late answer of an earlier identity never overwrites the current one's;
 *   - a refusal or no match withholds, never leaving the earlier identity's metadata;
 *   - nothing of the earlier identity shows while the new read is in flight.
 *
 * Data: the REAL producer capture __tests__/fixtures/systems-list-captures/systems_list_v2_deployments.json, one authored
 * row ``authored_system:pay`` with ``identity.account_id: null``, region eu-west-1. Every other row is an EDIT of that row,
 * said where it is made. The mounted controls render the real SystemDetailDashboard as the page does (no identity key);
 * fetch is routed by URL, and the catalogue answers are deferred so the test chooses their order.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import React from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined },
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
  usePathname: () => "/",
}))

import { SystemDetailDashboard } from "@/components/system-detail-dashboard"
import { AccountScopeProvider } from "@/lib/account-scope-context"
import { selectedCatalogRow } from "@/lib/scoped-system-catalog"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CAPTURE: any = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "systems-list-captures",
  "systems_list_v2_deployments.json"), "utf8"))
const BODY = CAPTURE.body
const PAY = BODY.systems[0]
const PAY_KEY = "authored_system:pay"
const OWN_ACCOUNT = "416651950952"
const OTHER_ACCOUNT = "222222222222"
const CUSTOMER = "tenant-x"

// An edit: a second authored System, Operations, in us-east-1.
const OPS = { ...structuredClone(PAY), name: "Operations", displayName: "Operations", SystemName: "Operations",
              system_key: "authored_system:ops", row_key: "authored_system:ops", region: "us-east-1",
              identity: { system_key: "authored_system:ops", account_id: null } }
const OPS_KEY = "authored_system:ops"
// An edit: an account-bound (tag / source) key's row: it IS one account's system.
const TAG_KEY = "tag:pay"
const TAG = { ...structuredClone(PAY), system_key: TAG_KEY, row_key: `${TAG_KEY}|${OWN_ACCOUNT}`,
              identity: { system_key: TAG_KEY, account_id: OWN_ACCOUNT } }
const answer = (...rows: unknown[]) => ({ ...structuredClone(BODY), systems: rows.map((r) => structuredClone(r)), count: rows.length })

describe("F31-META-IDENTITY-01: the header's row is the one THE selection rule selects", () => {
  it("an authored key under an account narrowing is selected (the reproduced F31 case), in any narrowing account", () => {
    for (const account of [OWN_ACCOUNT, OTHER_ACCOUNT, null]) {
      expect(selectedCatalogRow({ system: "Payments", systemKey: PAY_KEY, accountId: account }, BODY, CUSTOMER)?.region,
             String(account)).toBe("eu-west-1")
    }
  })
  it("an account-bound key's row is selected only in its own account", () => {
    expect(selectedCatalogRow({ system: "Payments", systemKey: TAG_KEY, accountId: OWN_ACCOUNT }, answer(TAG), CUSTOMER))
      .not.toBeNull()
    expect(selectedCatalogRow({ system: "Payments", systemKey: TAG_KEY, accountId: OTHER_ACCOUNT }, answer(TAG), CUSTOMER))
      .toBeNull()
  })
  it("a foreign key, nothing requested, a repeated label or an unknown contract selects nothing (no name fallback)", () => {
    expect(selectedCatalogRow({ system: "Payments", systemKey: "authored_system:nope", accountId: OWN_ACCOUNT }, BODY, CUSTOMER))
      .toBeNull()
    expect(selectedCatalogRow({ system: "", systemKey: null }, BODY, CUSTOMER)).toBeNull()
    const twin = { ...structuredClone(OPS), name: "Payments", displayName: "Payments", SystemName: "Payments" }   // an edit
    expect(selectedCatalogRow({ system: "Payments" }, answer(PAY, twin), CUSTOMER)).toBeNull()
    expect(selectedCatalogRow({ system: "Payments" }, answer(PAY), CUSTOMER)?.region).toBe("eu-west-1")
    expect(selectedCatalogRow({ system: "Payments", systemKey: PAY_KEY }, { ...answer(PAY), contract: "systems_list_read/v9" },
                              CUSTOMER)).toBeNull()
  })
})

// ── mounted: the real dashboard, the catalogue answers deferred ─────────────────────────────────────────────────────
type Hit = { status: number; body: unknown }
const CATALOGUE = /^\/api\/proxy\/systems(\?|$)/
let deferred: { url: string; resolve: (hit: Hit) => void }[] = []

function respond(hit: Hit) {
  return {
    ok: hit.status >= 200 && hit.status < 300, status: hit.status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => hit.body, text: async () => JSON.stringify(hit.body),
  } as unknown as Response
}

function stubFetch() {
  deferred = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url === "/api/proxy/admin/customers") return respond({ status: 200, body: [{ customer_id: CUSTOMER, display_name: "T" }] })
    if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
      return respond({ status: 200, body: { customer_id: CUSTOMER, groups: [], accounts: [
        { account_id: OWN_ACCOUNT, display_name: "A", regions: ["eu-west-1"], group_ids: [], status: "active" }] } })
    }
    if (CATALOGUE.test(url)) return new Promise<Response>((resolve) => deferred.push({ url, resolve: (hit) => resolve(respond(hit)) }))
    return respond({ status: 404, body: { error: "unrouted in test" } })
  }))
}

function page(name: string, systemKey: string, systemAccountId: string | null) {
  return (
    <AccountScopeProvider>
      <SystemDetailDashboard systemName={name} systemKey={systemKey} systemAccountId={systemAccountId} onBack={() => undefined} />
    </AccountScopeProvider>
  )
}

async function reads(n: number) {
  await waitFor(() => expect(deferred.length).toBeGreaterThanOrEqual(n))
}
async function answerRead(i: number, hit: Hit) {
  await act(async () => { deferred[i].resolve(hit) })
}
const regionShown = () => screen.queryByText(/^AWS (region pending|[a-z]{2}-[a-z]+-[0-9]+)$/)?.textContent

beforeEach(() => {
  stubFetch()
  for (const level of ["log", "warn", "error", "info"] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  try { window.localStorage.clear() } catch { /* no storage */ }
})

describe("F31-META-IDENTITY-01, mounted", () => {
  it("an authored key opened with an account narrowing shows its region", async () => {
    render(page("Payments", PAY_KEY, OWN_ACCOUNT))
    await reads(1)
    await answerRead(0, { status: 200, body: BODY })
    await waitFor(() => expect(regionShown()).toBe("AWS eu-west-1"))
  })
  it("an account-bound key opened in another account shows nothing of that row", async () => {
    render(page("Payments", TAG_KEY, OTHER_ACCOUNT))
    await reads(1)
    await answerRead(0, { status: 200, body: answer(TAG) })
    await waitFor(() => expect(regionShown()).toBe("AWS region pending"))
  })
})

// The ordering controls open both identities WITHOUT an account narrowing (as a link from the Systems list does for an
// authored key). The identity rule above is then not involved, and only the ordering is under test.
describe("F31-META-ORDER-02, mounted (the page reuses one dashboard across identities)", () => {
  it("A then B: B's answer is shown", async () => {
    const { rerender } = render(page("Payments", PAY_KEY, null))
    await reads(1)
    await answerRead(0, { status: 200, body: answer(PAY, OPS) })
    await waitFor(() => expect(regionShown()).toBe("AWS eu-west-1"))
    rerender(page("Operations", OPS_KEY, null))
    await reads(2)
    await answerRead(1, { status: 200, body: answer(PAY, OPS) })
    await waitFor(() => expect(regionShown()).toBe("AWS us-east-1"))
  })
  it("B then a LATE A: A's late answer never replaces B's", async () => {
    const { rerender } = render(page("Payments", PAY_KEY, null))
    await reads(1)
    rerender(page("Operations", OPS_KEY, null))
    await reads(2)
    await answerRead(1, { status: 200, body: answer(PAY, OPS) })
    await waitFor(() => expect(regionShown()).toBe("AWS us-east-1"))
    await answerRead(0, { status: 200, body: answer(PAY, OPS) })
    await new Promise((r) => setTimeout(r, 20))
    expect(regionShown()).toBe("AWS us-east-1")
  })
  it("nothing of A shows while B's read is in flight", async () => {
    const { rerender } = render(page("Payments", PAY_KEY, null))
    await reads(1)
    await answerRead(0, { status: 200, body: answer(PAY, OPS) })
    await waitFor(() => expect(regionShown()).toBe("AWS eu-west-1"))
    rerender(page("Operations", OPS_KEY, null))
    expect(regionShown()).toBe("AWS region pending")
  })
  it.each([
    ["a refusal (503)", { status: 503, body: { error: "unavailable" } }],
    ["no match (B absent from the answer)", { status: 200, body: answer(PAY) }],
  ])("after A was shown, B's %s withholds -- A's metadata does not stay", async (_label, hit) => {
    const { rerender } = render(page("Payments", PAY_KEY, null))
    await reads(1)
    await answerRead(0, { status: 200, body: answer(PAY, OPS) })
    await waitFor(() => expect(regionShown()).toBe("AWS eu-west-1"))
    rerender(page("Operations", OPS_KEY, null))
    await reads(2)
    await answerRead(1, hit as Hit)
    await new Promise((r) => setTimeout(r, 20))
    expect(regionShown()).toBe("AWS region pending")
  })
})
