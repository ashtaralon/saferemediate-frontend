/**
 * AP182 · the WHOLE Attack Paths V2 page over the captured target catalog section: the header's counts are listed
 * paths only, and say so beside them; an all-held crown jewel's empty state names the hold; a target with nothing
 * recorded keeps its established copy.
 *
 * Real: AttackPathsV2 and everything it mounts, AccountScopeProvider, useCachedFetch. Stubbed: `fetch` (the Next proxy)
 * — the target catalog answers the captured section (__tests__/fixtures/ap182-lifecycle/target-catalog-section.json),
 * the IAP an untyped 502 — and next/navigation. Harness after __tests__/cf01-attack-paths-v2-page.test.tsx.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import capturedSection from "@/__tests__/fixtures/ap182-lifecycle/target-catalog-section.json"

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
import { LIFECYCLE_HELD_EXPLANATION } from "@/lib/attack-paths/lifecycle-coverage"
import { AccountScopeProvider } from "@/lib/account-scope-context"

type Section = { system_name: string; customer_id: string; account_id: string; targets: Array<Record<string, unknown>> }
const SECTION = capturedSection as unknown as Section
const SYSTEM = SECTION.system_name
const idOf = (name: string, kind: string) => String(SECTION.targets.find((t) => t.name === name && t.kind === kind)!.target_id)

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function setUrl(params: Record<string, string>) {
  for (const key of Array.from(nav.params.keys())) nav.params.delete(key)
  for (const [k, v] of Object.entries(params)) nav.params.set(k, v)
}

function serve(section: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    // The app shell's scope + systems catalog for the section's own tenant (infrastructure, not under test).
    if (url === "/api/proxy/admin/customers") {
      return respond(200, [{ customer_id: SECTION.customer_id, display_name: SECTION.customer_id }])
    }
    if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
      return respond(200, {
        customer_id: SECTION.customer_id,
        accounts: [{ account_id: SECTION.account_id, display_name: SECTION.customer_id, regions: [], group_ids: [], status: "active" }],
        groups: [],
      })
    }
    if (url.startsWith("/api/proxy/systems")) return respond(200, { systems: [{ name: SYSTEM }] })
    if (url.startsWith(`/api/proxy/attack-paths/${encodeURIComponent(SYSTEM)}/targets`)) return respond(200, section)
    if (url.startsWith("/api/proxy/identity-attack-paths/")) return respond(502, { detail: "bad gateway" })
    if (url.startsWith("/api/proxy/attack-paths/")) return respond(502, { detail: "bad gateway" })
    return respond(404, { detail: "not stubbed in this test" })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setUrl({ system: SYSTEM })
  window.localStorage.clear()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  const actWarnings = consoleError.mock.calls.filter((args) => String(args[0]).includes("not wrapped in act"))
  expect(actWarnings).toEqual([])
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

async function renderPage() {
  await act(async () => {
    render(
      <AccountScopeProvider>
        <AttackPathsV2 systemName={SYSTEM} />
      </AccountScopeProvider>,
    )
  })
}

describe("AttackPathsV2 whole page — lifecycle-held targets", () => {
  it("the header quotes listed paths with the held and withheld causes beside them, never as totals", async () => {
    const fetchMock = serve(capturedSection)
    await renderPage()
    const held = await screen.findByTestId("catalog-held-not-counted")
    expect(held).toHaveTextContent("· 3 paths held, not counted")
    expect(held).toHaveAttribute("title", LIFECYCLE_HELD_EXPLANATION)
    expect(screen.getByTestId("catalog-coverage-withheld")).toHaveTextContent("· coverage withheld for 3 targets")
    expect(held.parentElement).toHaveTextContent(
      "2 active paths · 2 reachable targets · 3 paths held, not counted · coverage withheld for 3 targets")
    // Precondition: the catalog route was really asked.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes(`/attack-paths/${SYSTEM}/targets`))).toBe(true)
  })

  it("non-install shape (derived by REMOVING every held_path_count): held, the count not reported", async () => {
    serve({ ...SECTION, targets: SECTION.targets.map(({ held_path_count: _drop, ...rest }) => rest) })
    await renderPage()
    expect(await screen.findByTestId("catalog-held-not-counted")).toHaveTextContent(
      "· paths held (count not reported), not counted")
  })

  it("an all-held crown jewel's empty state names the hold, not a missing manifest", async () => {
    setUrl({ system: SYSTEM, jewel: idOf("empty-bucket", "S3Bucket") })
    serve(capturedSection)
    await renderPage()
    await waitFor(() => expect(screen.getByText("Current-access coverage incomplete")).toBeInTheDocument())
    // Both columns: the page's empty state AND the path list (AP183: the path list had kept the manifest copy).
    expect(screen.getAllByText(/Every path the active generation found to this crown jewel is held \(1 path held\)/))
      .toHaveLength(2)
    expect(screen.getByTestId("coverage-incomplete-state")).toHaveAttribute("data-coverage-cause", "lifecycle")
    expect(screen.queryByText(/has no evaluation manifest for/)).toBeNull()
  })

  it("a target with nothing recorded keeps the established empty-state copy", async () => {
    setUrl({ system: SYSTEM, jewel: idOf("db-1", "RDSInstance") })
    serve(capturedSection)
    await renderPage()
    await waitFor(() => expect(screen.getByText("Current-access coverage incomplete")).toBeInTheDocument())
    expect(screen.getByText(
      "The active generation has no evaluation manifest for this crown jewel, so Cyntro does not claim that no route exists.",
    )).toBeInTheDocument()
    // ... and the path list keeps its own established copy, with no recorded cause on it.
    const pathList = screen.getByTestId("coverage-incomplete-state")
    expect(pathList).not.toHaveAttribute("data-coverage-cause")
    expect(pathList).toHaveTextContent("The active generation has no evaluation manifest for db-1. No zero-path conclusion is claimed.")
  })

  it("AP183-R2 CONSTRUCTED unreadable evidence on the selected target (a captured row's value replaced)", async () => {
    // db-1 is a no-manifest coverage_incomplete row; db-us-only is turned into a no_modeled_route row. Both carry a
    // held count no producer writes (0, "bad"): unreadable, so neither empty state may claim a complete answer.
    const unreadable = {
      ...SECTION,
      targets: SECTION.targets.map((t) =>
        t.name === "db-1" ? { ...t, held_path_count: 0 }
          : t.name === "db-us-only" ? { ...t, state: "no_modeled_route", held_path_count: "bad" } : t),
    }
    for (const name of ["db-1", "db-us-only"]) {
      setUrl({ system: SYSTEM, jewel: idOf(name, "RDSInstance") })
      serve(unreadable)
      await renderPage()
      await waitFor(() => expect(screen.getByText("Current-access coverage incomplete")).toBeInTheDocument())
      const subtitles = screen.getAllByText(/The coverage evidence served for this crown jewel could not be read/)
      expect(subtitles, name).toHaveLength(2)                                   // the page and the path list
      for (const subtitle of subtitles) {
        expect(subtitle).toHaveTextContent("No held count is reported.")
        expect(subtitle.textContent).not.toMatch(/Every path|\d+ paths? held/)
      }
      expect(screen.getByTestId("coverage-incomplete-state")).toHaveAttribute("data-coverage-cause", "unreadable")
      expect(screen.queryByText("No modeled current-access route")).toBeNull()
      expect(screen.queryByText(/has no evaluation manifest for/)).toBeNull()
      expect(screen.getByTestId("catalog-coverage-unreadable")).toHaveTextContent(
        "· coverage evidence unreadable for 2 targets")
      cleanup()
      vi.unstubAllGlobals()
      window.localStorage.clear()
    }
  })

  it("CONSTRUCTED control: a no_modeled_route target with nothing recorded keeps its established copy", async () => {
    setUrl({ system: SYSTEM, jewel: idOf("db-us-only", "RDSInstance") })
    serve({
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "db-us-only" ? { ...t, state: "no_modeled_route" } : t)),
    })
    await renderPage()
    // Both columns keep the established copy: the page's empty state and the path list.
    await waitFor(() => expect(screen.getAllByText("No modeled current-access route")).toHaveLength(2))
    expect(screen.getByTestId("no-modeled-route-state")).toBeInTheDocument()
    expect(screen.queryByTestId("coverage-incomplete-state")).toBeNull()
    expect(screen.queryByTestId("catalog-coverage-unreadable")).toBeNull()
  })

  it("a withheld crown jewel is named withheld with its code, never lifecycle", async () => {
    setUrl({ system: SYSTEM, jewel: idOf("cluster-1", "RDSCluster") })
    serve(capturedSection)
    await renderPage()
    await waitFor(() => expect(screen.getByText("Current-access coverage incomplete")).toBeInTheDocument())
    const subtitles = screen.getAllByText(/withheld coverage of this crown jewel/)
    expect(subtitles).toHaveLength(2)                                           // the page and the path list
    for (const subtitle of subtitles) {
      expect(subtitle).toHaveTextContent("database_eni_binding_not_in_normalized_inventory")
      expect(subtitle.textContent).not.toMatch(/lifecycle|held \(/i)
    }
    expect(screen.getByTestId("coverage-incomplete-state")).toHaveAttribute("data-coverage-cause", "withheld")
  })
})
