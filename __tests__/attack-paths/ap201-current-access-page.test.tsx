/**
 * AP201 / CP-B · the mounted Attack Paths page over the CAPTURED producer-shaped by-crown-jewel summary
 * (__tests__/fixtures/ap201-current-access; provenance in its README): selecting a crown jewel shows Current Access
 * by SOURCE above the path list, and selecting a source pins its strongest route through the page's own URL state.
 *
 * Real: AttackPathsV2, its rail, the convergence hook, the source list. Stubbed: `fetch` (the captured catalog and
 * summary; every other read an untyped 502) and next/navigation (the router's replace is recorded).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: vi.fn(), replace: vi.fn(), prefetch: () => undefined, back: () => undefined },
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
  usePathname: () => "/attack-paths-v2",
}))

import capturedSection from "@/__tests__/fixtures/ap201-current-access/targets.json"
import capturedSummary from "@/__tests__/fixtures/ap201-current-access/by-crown-jewel-summary.json"
import { AttackPathsV2 } from "@/components/attack-paths-v2/attack-paths-v2"
import { AccountScopeProvider } from "@/lib/account-scope-context"

type Target = { name?: string; kind?: string; target_id?: string }
const SECTION = capturedSection as unknown as { system_name: string; customer_id: string; account_id: string; targets: Target[] }
const SYSTEM = SECTION.system_name
const idOf = (name: string, kind: string) => String(SECTION.targets.find((t) => t.name === name && t.kind === kind)!.target_id)

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function serve(summary: unknown) {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === "/api/proxy/admin/customers") return respond(200, [{ customer_id: SECTION.customer_id, display_name: SECTION.customer_id }])
    if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
      return respond(200, { customer_id: SECTION.customer_id, groups: [],
        accounts: [{ account_id: SECTION.account_id, display_name: SECTION.customer_id, regions: [], group_ids: [], status: "active" }] })
    }
    if (url.startsWith("/api/proxy/systems")) return respond(200, { systems: [{ name: SYSTEM }] })
    if (url.startsWith(`/api/proxy/attack-paths/${encodeURIComponent(SYSTEM)}/targets`)) return respond(200, SECTION)
    if (url.includes("/by-crown-jewel/summary")) return respond(200, summary)
    return respond(502, { detail: "bad gateway" })
  })
  vi.stubGlobal("fetch", f)
  return f
}

beforeEach(() => {
  nav.params = new URLSearchParams()
  nav.router.replace.mockReset()
  nav.router.push.mockReset()
  window.localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function mountPage() {
  nav.params.set("system", SYSTEM)
  await act(async () => { render(<AccountScopeProvider><AttackPathsV2 systemName={SYSTEM} /></AccountScopeProvider>) })
}

// The capture is one coherent pair: the `payments` catalog (one target, acme-data) and the summary for that ARN.
const JEWEL = idOf("acme-data", "S3Bucket")

describe("Current Access by source on the mounted page (captured acme-data summary)", () => {
  it("shows every compute source the summary names, grouped, above the path list; approval not recorded on each", async () => {
    nav.params.set("jewel", JEWEL)
    serve(capturedSummary)
    await mountPage()
    const list = await screen.findByTestId("current-access-sources")
    expect(list.getAttribute("data-source-count")).toBe(String((capturedSummary as { paths: unknown[] }).paths.length))
    expect(within(list).getAllByTestId("current-access-approval").length).toBe(Number(list.getAttribute("data-source-count")))
    expect(within(list).getByTestId("current-access-section-observed")).toBeInTheDocument()
    expect(list.textContent).not.toMatch(/legitimate/i)
    // The contract survives the hook's summary/detail MERGE (a field-by-field rebuild): the observed row shows the
    // served per-plane hits on the real page, not "not measured". This is the assertion the first cut lacked.
    const observed = within(list).getAllByTestId("current-access-source").find((r) => r.getAttribute("data-section") === "observed")!
    await waitFor(() => expect(within(observed).getByTestId("current-access-planes").textContent).toMatch(/identity observed · 3 hits \(cloudtrail_api\)/))
    expect(within(observed).getByTestId("current-access-qualifier").textContent).toBe("whole path observed (contract)")
    // the route list is still there, BELOW the source list (not inside it)
    const firstPathRow = (await screen.findAllByTestId("zoom0-path-row"))[0]
    expect(list.contains(firstPathRow)).toBe(false)
    expect(list.compareDocumentPosition(firstPathRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("selecting a source pins its strongest route through the page's URL state (design §7); the list is not replaced", async () => {
    nav.params.set("jewel", JEWEL)
    serve(capturedSummary)
    await mountPage()
    const rows = await screen.findAllByTestId("current-access-source")
    const observed = rows.find((r) => r.getAttribute("data-section") === "observed")!
    const primary = observed.getAttribute("data-primary-path")!
    await act(async () => { fireEvent.click(observed) })
    const replaced = nav.router.replace.mock.calls.map((c) => String(c[0]))
    expect(replaced.some((url) => url.includes(`path=${encodeURIComponent(primary)}`) || url.includes(`path=${primary}`))).toBe(true)
    expect(screen.getAllByTestId("current-access-source").length).toBe(rows.length)
  })

  it("a NOT_READY answer shows no source list (unknown, not absent) — the path list's not-ready state speaks", async () => {
    nav.params.set("jewel", JEWEL)
    serve({ system: SYSTEM, serve_state: "NOT_READY", coverage_state: "NOT_READY", paths: [] })
    await mountPage()
    await waitFor(() => expect(screen.getByTestId("paths-not-ready-state")).toBeInTheDocument())
    expect(screen.queryByTestId("current-access-sources")).toBeNull()
  })
})
