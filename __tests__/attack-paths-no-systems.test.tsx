/**
 * D10 (resident QA, 2026-10-09): Attack Paths with no system in scope said "No systems available. Run an AWS sync from the
 * dashboard to populate this list." On a customer-resident install there is no sync -- GET /api/proxy/sync/capabilities
 * answers 503 -- so the only action it named did not exist.
 *
 * The notice now reads the same capability map the refresh controls read: a refresh is mentioned only when the inventory
 * lane is CONNECTED, and Systems > Add System (the System Boundary wizard) is always named. A catalogue that could not be
 * read says so instead of "no systems". Page-level: the REAL AttackPathsV2 under the real AccountScopeProvider; fetch and
 * next/navigation stubbed.
 */
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
import { NoSystemsNotice } from "@/components/attack-paths-v2/no-systems-notice"
import { AccountScopeProvider } from "@/lib/account-scope-context"

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// The resident install's answer: the sync capability route is not served there (proxy relays the backend's 503).
const RESIDENT_CAPABILITIES = { status: 503, body: { success: false, error: "Backend returned 503", lanes: [] } }
// A deployment whose inventory lane can be refreshed (the capability map's own shape, lib/sync-surfaces.ts).
const CONNECTED_CAPABILITIES = {
  status: 200,
  body: { lanes: [{ lane: "inventory_reconcile", label: "AWS inventory", state: "CONNECTED" }] },
}

function serve({ capabilities, systems }: {
  capabilities: { status: number; body: unknown }
  systems?: { status: number; body: unknown }
}) {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    urls.push(url)
    if (url === "/api/proxy/sync/capabilities") return respond(capabilities.status, capabilities.body)
    if (url === "/api/proxy/admin/customers") return respond(200, [{ customer_id: "acme", display_name: "acme" }])
    if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
      return respond(200, {
        customer_id: "acme",
        accounts: [{ account_id: "111111111111", display_name: "acme", regions: [], group_ids: [], status: "CONNECTED" }],
        groups: [],
      })
    }
    if (url.startsWith("/api/proxy/systems") && systems) return respond(systems.status, systems.body)
    return respond(404, { detail: "not stubbed in this test" })
  }))
  return urls
}

beforeEach(() => {
  for (const key of Array.from(nav.params.keys())) nav.params.delete(key)
  window.localStorage.clear()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("NoSystemsNotice", () => {
  it("on an install without sync, names Add System and claims no sync or refresh", async () => {
    serve({ capabilities: RESIDENT_CAPABILITIES })
    await act(async () => { render(<NoSystemsNotice catalogFailure={null} />) })
    const notice = screen.getByTestId("attack-paths-no-systems")
    expect(notice.textContent).toBe(
      "No systems in this scope yet. A system is declared from an account's inventory: open Systems and choose Add System. Open Systems")
    expect(notice.textContent).not.toMatch(/sync|refresh/i)
    expect(screen.getByRole("link", { name: "Open Systems" }).getAttribute("href")).toBe("/?section=systems")
  })

  it("where the inventory lane is CONNECTED, also names the inventory refresh", async () => {
    serve({ capabilities: CONNECTED_CAPABILITIES })
    await act(async () => { render(<NoSystemsNotice catalogFailure={null} />) })
    expect(screen.getByTestId("attack-paths-no-systems").textContent).toBe(
      "No systems in this scope yet. Open Systems to refresh inventory, or choose Add System there to declare one from an account's inventory. Open Systems")
  })

  it("a catalogue that could not be read says so, never 'no systems'", async () => {
    serve({ capabilities: RESIDENT_CAPABILITIES })
    await act(async () => { render(<NoSystemsNotice catalogFailure="HTTP 502" />) })
    const notice = screen.getByTestId("attack-paths-no-systems")
    expect(notice.textContent).toBe("The systems list could not be read (HTTP 502), so no system can be opened here. Open Systems")
    expect(notice.textContent).not.toMatch(/No systems/)
  })
})

describe("Attack Paths v2 with no system in scope (the real page)", () => {
  async function renderPage() {
    await act(async () => {
      render(<AccountScopeProvider><AttackPathsV2 /></AccountScopeProvider>)
    })
  }

  it("an empty catalogue on a resident install: Add System, and no sync claim", async () => {
    const urls = serve({ capabilities: RESIDENT_CAPABILITIES, systems: { status: 200, body: { success: true, systems: [] } } })
    await renderPage()
    const notice = await screen.findByTestId("attack-paths-no-systems")
    expect(notice.textContent).toContain("open Systems and choose Add System")
    expect(screen.queryByText(/Run an AWS sync/)).toBeNull()
    expect(urls.some((url) => url.startsWith("/api/proxy/systems"))).toBe(true)          // the catalogue was really asked
  })

  it("a catalogue read that failed is named with its status", async () => {
    serve({ capabilities: RESIDENT_CAPABILITIES, systems: { status: 502, body: { error: "bad gateway" } } })
    await renderPage()
    expect((await screen.findByTestId("attack-paths-no-systems")).textContent).toContain(
      "The systems list could not be read (HTTP 502)")
  })
})
