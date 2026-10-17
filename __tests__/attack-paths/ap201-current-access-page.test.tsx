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
    await waitFor(() => expect(within(observed).getByTestId("current-access-planes").textContent).toMatch(/identity observed · 3 hits \(server plane total\) \(cloudtrail_api\)/))
    expect(within(observed).getByTestId("current-access-qualifier").textContent).toBe("observed — observed on every plane (runtime evidence)")
    // Rev 6 §3.1 / §3.7 on the mounted page: activity sections only; the inferred route with unavailable planes is Unknown.
    expect(within(list).queryByTestId("current-access-section-not_observed")).toBeNull()
    expect(within(within(list).getByTestId("current-access-section-unknown")).getAllByTestId("current-access-source").length).toBe(2)
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

  it("AP201 (R11): with an account selected, every per-jewel read names the tenant AND the account; with 'all', no claim (byte-identical)", async () => {
    // the selection the scope provider persists (lib/account-scope-context.tsx), healed against the served options
    window.localStorage.setItem("cyntro-product-scope",
      JSON.stringify({ customerId: SECTION.customer_id, groupId: "all", accountId: SECTION.account_id, region: "all" }))
    nav.params.set("jewel", JEWEL)
    const f = serve(capturedSummary)
    await mountPage()
    await screen.findByTestId("current-access-sources")
    const urls = () => f.mock.calls.map((c) => String(c[0] instanceof Request ? c[0].url : c[0]))
    const claimed = (needle: string) => urls().filter((u) => u.includes(needle)).map((u) => new URL(u, "http://fe.local").searchParams)
    for (const needle of ["/targets", "/by-crown-jewel/summary", "/by-crown-jewel/detail"]) {
      const reads = claimed(needle)
      expect(reads.length, needle).toBeGreaterThan(0)
      for (const qs of reads) {
        expect(qs.get("customer_id"), needle).toBe(SECTION.customer_id)
        expect(qs.get("account_id"), needle).toBe(SECTION.account_id)
      }
    }
    cleanup()
    vi.unstubAllGlobals()
    window.localStorage.setItem("cyntro-product-scope",
      JSON.stringify({ customerId: SECTION.customer_id, groupId: "all", accountId: "all", region: "all" }))
    const g = serve(capturedSummary)
    await mountPage()
    await screen.findByTestId("current-access-sources")
    const all = g.mock.calls.map((c) => String(c[0] instanceof Request ? c[0].url : c[0])).filter((u) => u.includes("/targets") || u.includes("/by-crown-jewel/"))
    expect(all.length).toBeGreaterThan(0)
    for (const u of all) {
      const qs = new URL(u, "http://fe.local").searchParams
      expect(qs.has("customer_id"), u).toBe(false)
      expect(qs.has("account_id"), u).toBe(false)
    }
  })

  it("merged rule: a system key's own account scopes the reads over a different selected account, and the page says so", async () => {
    // The keyed systems catalogue: the captured two-identities list (one "Payments" is key `payments`, account 416651950952).
    const systems = (await import("@/__tests__/fixtures/systems-list-captures/systems_list_v2_two_identities_one_name.json")).default as { body: unknown }
    window.localStorage.setItem("cyntro-product-scope",
      JSON.stringify({ customerId: SECTION.customer_id, groupId: "all", accountId: SECTION.account_id, region: "all" }))
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      urls.push(url)
      if (url === "/api/proxy/admin/customers") return respond(200, [{ customer_id: SECTION.customer_id, display_name: SECTION.customer_id }])
      if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
        return respond(200, { customer_id: SECTION.customer_id, groups: [],
          accounts: [{ account_id: SECTION.account_id, display_name: SECTION.customer_id, regions: [], group_ids: [], status: "active" }] })
      }
      if (url.startsWith("/api/proxy/systems")) return respond(200, systems.body)
      if (url.includes("/targets")) return respond(200, { ...SECTION, system_name: "Payments" })
      return respond(502, { detail: "bad gateway" })
    }))
    nav.params.set("system", "Payments")
    await act(async () => {
      render(<AccountScopeProvider><AttackPathsV2 systemName="Payments" systemKey="payments" systemAccountId="416651950952" /></AccountScopeProvider>)
    })
    await waitFor(() => expect(screen.getByTestId("ap-read-account-override")).toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByTestId("ap-read-account-override").textContent).toMatch(
      new RegExp(`Reads scoped to account 416651950952 \\(this system's own account\\), not the selected\\s+account ${SECTION.account_id}\\.`))
    const targets = urls.find((u) => u.includes("/targets"))!
    const qs = new URL(targets, "http://fe.local").searchParams
    expect([qs.get("system_key"), qs.getAll("account_id")]).toEqual(["payments", ["416651950952"]])
  }, 30_000)

  it("a NOT_READY answer shows no source list (unknown, not absent) — the path list's not-ready state speaks", async () => {
    nav.params.set("jewel", JEWEL)
    serve({ system: SYSTEM, serve_state: "NOT_READY", coverage_state: "NOT_READY", paths: [] })
    await mountPage()
    await waitFor(() => expect(screen.getByTestId("paths-not-ready-state")).toBeInTheDocument())
    expect(screen.queryByTestId("current-access-sources")).toBeNull()
  })
})
