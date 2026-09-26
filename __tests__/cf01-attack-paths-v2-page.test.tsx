/**
 * CF01 · the WHOLE Attack Paths V2 page (components/attack-paths-v2/attack-paths-v2.tsx,
 * mounted by app/attack-paths-v2/page.tsx → attack-paths-v2-client.tsx):
 *   - names an IAP hold / refusal on its crown-jewel rail — never "No crown jewels";
 *   - prints the pinned path's server evidence (class, effective damage, runtime per
 *     plane, permission coverage per action) in the Current Access dossier
 *     (zoom0-fan-in-panel.tsx → current-access-dossier-panel.tsx).
 *
 * Real: AttackPathsV2 and everything it mounts, AccountScopeProvider, useCachedFetch
 * and its localStorage cache. Stubbed: `fetch` (the Next proxy + backend), answering
 * with the captured backend bodies in __tests__/fixtures/cf01-attack-path-evidence/,
 * and next/navigation.
 *
 * Every SERVE read (/api/proxy/attack-paths/…) answers an untyped 502, so the rail
 * and the path list can only have come from the IAP — the case this change serves.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import holdsFixture from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-holds.json"
import twoCustomers from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-two-customers.json"

// Stable identities, as Next provides: a fresh object per render would re-fire
// every effect keyed on them and loop the page.
const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined },
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
  usePathname: () => "/attack-paths-v2",
}))

import { AttackPathsV2 } from "@/components/attack-paths-v2/attack-paths-v2"
import { AccountScopeProvider } from "@/lib/account-scope-context"

const HOLDS = holdsFixture as Record<string, { status: number; body: unknown }>
const IAP_CACHE = "cyntro:swr:iap-v2:5x5:payments"

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

// The app shell's scope + systems catalog, answered for the fixture's own
// customer (snapshot_provenance: customer_id "acme", account 111111111111).
// Infrastructure the page needs before it asks anything; not under test.
type Customer = "acme" | "beta"
type CustomerBody = {
  snapshot_provenance: { customer_id: string; account_id: string }
  system_name: string
  crown_jewels: Array<{ id: string; name: string }>
  paths: Array<{ id: string; evidence_contract: { classification: string } }>
}
const TWO = twoCustomers as unknown as Record<Customer, CustomerBody>

function shell(url: string, customer: Customer): Response | null {
  const scope = TWO[customer].snapshot_provenance
  if (url === "/api/proxy/admin/customers") {
    return respond(200, [{ customer_id: scope.customer_id, display_name: scope.customer_id }])
  }
  if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
    return respond(200, {
      customer_id: scope.customer_id,
      accounts: [{ account_id: scope.account_id, display_name: scope.customer_id, regions: [], group_ids: [], status: "active" }],
      groups: [],
    })
  }
  if (url.startsWith("/api/proxy/systems")) {
    return respond(200, { systems: [{ name: TWO[customer].system_name }] })
  }
  return null
}

function setUrl(params: Record<string, string>) {
  for (const key of Array.from(nav.params.keys())) nav.params.delete(key)
  for (const [k, v] of Object.entries(params)) nav.params.set(k, v)
}

function serve(iap: { status: number; body: unknown }, customer: Customer = "acme") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    const shellAnswer = shell(url, customer)
    if (shellAnswer) return shellAnswer
    if (url.startsWith("/api/proxy/identity-attack-paths/payments")) {
      return respond(iap.status, iap.body)
    }
    // SERVE reads (target catalog, by-crown-jewel summary/detail) are down,
    // untyped: the page falls back to the IAP — the path this change serves.
    if (url.startsWith("/api/proxy/attack-paths/")) {
      return respond(502, { detail: "bad gateway" })
    }
    return respond(404, { detail: "not stubbed in this test" })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setUrl({ system: "payments" })
  window.localStorage.clear()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  // An act() warning means state settled after an assertion ran — the
  // absence checks above would then be racing the render.
  const actWarnings = consoleError.mock.calls.filter((args) => String(args[0]).includes("not wrapped in act"))
  expect(actWarnings).toEqual([])
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

async function renderPage() {
  await act(async () => {
    // The real scope provider the app shell mounts; its own scope reads are
    // answered 404 by the stub (not under test here).
    render(
      <AccountScopeProvider>
        <AttackPathsV2 systemName="payments" />
      </AccountScopeProvider>,
    )
  })
}

describe("AttackPathsV2 whole page — IAP hold on the crown-jewel rail", () => {
  it.each([
    ["install_not_recorded", "Attack-path evidence not recorded yet", "CONSUMER_READINESS_UNOBSERVABLE"],
    ["install_serving_read_refused", "Attack-path read refused", "SERVING_READ_REFUSED: FACADE_READ_OUTSIDE_ADMISSION"],
    ["install_serving_route_held", "Attack-path route held", "SERVING_ROUTE_HELD: HELD_CUSTOMER_READ"],
  ])("%s: the rail names the hold, never 'No crown jewels'", async (key, title, reason) => {
    const fetchMock = serve(HOLDS[key])
    await renderPage()

    const hold = await screen.findByTestId("crown-jewel-hold")
    expect(hold).toHaveTextContent(title)
    expect(hold).toHaveTextContent(reason)
    expect(screen.queryByText(/No crown jewels detected/)).toBeNull()
    // The page header names it too — never a bare "0 targets".
    expect(screen.queryByText(/\b0 targets\b/)).toBeNull()
    expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(3)
    // Precondition: the IAP proxy route was really asked.
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/proxy/identity-attack-paths/payments")),
    ).toBe(true)
    // A hold is never persisted as a reading.
    expect(window.localStorage.getItem(IAP_CACHE)).toBeNull()
  })

  it("a refusal clears a map this browser cached earlier and names the refusal", async () => {
    // A previously cached IAP answer for this key (the captured customer body).
    window.localStorage.setItem(IAP_CACHE, JSON.stringify({ ts: Date.now(), data: twoCustomers.acme }))
    serve(HOLDS.install_serving_read_refused)
    await renderPage()

    await waitFor(() => expect(window.localStorage.getItem(IAP_CACHE)).toBeNull())
    expect(await screen.findByTestId("crown-jewel-hold")).toHaveTextContent("Attack-path read refused")
    expect(screen.queryByText("acme-data")).toBeNull()
  })

  it("a legacy 200 error with no rows is not persisted and is named on the rail", async () => {
    // Derived from the captured C1 body by REMOVING semantic_status — the shape a
    // backend that predates the semantic contract sends. Nothing is added.
    const legacy = { ...(HOLDS.c1_unavailable.body as Record<string, unknown>) }
    delete legacy.semantic_status
    serve({ status: 200, body: legacy })
    await renderPage()

    await waitFor(() => expect(screen.queryByTestId("crown-jewel-hold")).not.toBeNull())
    expect(screen.getByTestId("crown-jewel-hold")).toHaveTextContent("503: Neo4j not connected")
    expect(window.localStorage.getItem(IAP_CACHE)).toBeNull()
  })
})

describe("AttackPathsV2 whole page — an empty rail beside a failed catalog", () => {
  it("an untyped IAP failure too: the rail names the catalog failure, never 'No crown jewels'", async () => {
    serve({ status: 502, body: { detail: "bad gateway" } })
    await renderPage()
    const hold = await screen.findByTestId("crown-jewel-hold")
    expect(hold).toHaveTextContent("Attack-path read failed")
    expect(hold).toHaveTextContent("HTTP 502")
    expect(screen.queryByText(/No crown jewels detected/)).toBeNull()
  })

  it("a typed refusal of the catalog itself is named as a refusal", async () => {
    const refused = HOLDS.install_serving_read_refused
    const fetchMock = serve({ status: 502, body: { detail: "bad gateway" } })
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith("/api/proxy/attack-paths/payments/targets")) return respond(refused.status, refused.body)
      return base(input)
    })
    await renderPage()
    const hold = await screen.findByTestId("crown-jewel-hold")
    expect(hold).toHaveTextContent("Attack-path read refused")
    expect(hold).toHaveTextContent("SERVING_READ_REFUSED: FACADE_READ_OUTSIDE_ADMISSION")
  })
})

describe("AttackPathsV2 whole page — the pinned path's evidence in the Current Access dossier", () => {
  function pin(customer: Customer, cls: string) {
    const body = TWO[customer]
    const path = body.paths.find((p) => p.evidence_contract.classification === cls)!
    setUrl({ system: "payments", jewel: body.crown_jewels[0].id, path: path.id })
    return serve({ status: 200, body }, customer)
  }

  it.each(["acme", "beta"] as const)("%s: an unknown path is printed unknown, with unavailable data plane", async (customer) => {
    pin(customer, "unknown")
    await renderPage()
    const block = await screen.findByTestId("dossier-path-evidence", {}, { timeout: 4000 })
    expect(block).toHaveTextContent("UNKNOWN")
    expect(block).toHaveTextContent("Effective damage: unknown — data-plane reachability not evaluated")
    expect(block).toHaveTextContent("Runtime evidence: identity observed · network observed · data unavailable")
    expect(block).toHaveTextContent("Permission coverage: 1 of 2 actions have an evaluated permission")
    expect(block.textContent).not.toMatch(/blocked|live —/i)
    // The route picker stays a FROM → TO selector: no evidence strip there.
    expect(screen.queryByTestId("path-evidence-strip")).toBeNull()
    // Nothing of the other customer anywhere on the page.
    const other: Customer = customer === "acme" ? "beta" : "acme"
    const html = document.body.innerHTML
    expect(html).toContain(`${customer}-data`)
    expect(html).not.toContain(TWO[other].snapshot_provenance.account_id)
    expect(html).not.toContain(`${other}-`)
  })

  it("a blocked path is printed blocked (control)", async () => {
    pin("acme", "blocked")
    await renderPage()
    const block = await screen.findByTestId("dossier-path-evidence", {}, { timeout: 4000 })
    expect(screen.getByTestId("dossier-evidence-class")).toHaveTextContent("BLOCKED")
    expect(block).toHaveTextContent("blocked by network controls")
  })
})

