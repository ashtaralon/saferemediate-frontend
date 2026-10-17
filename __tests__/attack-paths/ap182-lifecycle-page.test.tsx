/**
 * AP182 · the WHOLE Attack Paths V2 page over the captured target catalog section: the header's counts are listed
 * paths only, and say so beside them; an all-held crown jewel's empty state names the hold; a target with nothing
 * recorded keeps its established copy.
 *
 * Real: AttackPathsV2 and everything it mounts, AccountScopeProvider, useCachedFetch. Stubbed: `fetch` (the Next proxy)
 * — the target catalog answers the captured section (__tests__/fixtures/ap182-lifecycle/target-catalog-section.json),
 * the IAP an untyped 502 — and next/navigation. Harness after __tests__/cf01-attack-paths-v2-page.test.tsx.
 */
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
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

function serve(section: unknown, summary?: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    // AP188: the selected jewel's by-crown-jewel summary, when a case supplies one (CONSTRUCTED, labelled per case)
    if (summary && url.startsWith(`/api/proxy/attack-paths/${encodeURIComponent(SYSTEM)}/by-crown-jewel/summary`)) {
      return respond(summary.status, summary.body)
    }
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

  it.each([["bad"], [-1], [null]])("AP193 CONSTRUCTED bucket-1 path_count %j: the header total is not complete and never NaN", async (raw) => {
    serve({ ...SECTION, targets: SECTION.targets.map((t) => (t.name === "bucket-1" ? { ...t, path_count: raw } : t)) })
    await renderPage()
    const unreadable = await screen.findByTestId("catalog-coverage-unreadable")
    expect(unreadable).toHaveTextContent("· coverage evidence unreadable for 1 target")
    const header = unreadable.parentElement as HTMLElement
    // bucket-1's paths are in neither count: aurora-a's 1 path is what is listed, and it is not called a total
    expect(header).toHaveTextContent(/^1 active paths · 1 reachable targets · /)
    expect(header.textContent).not.toMatch(/NaN/)
  })

  it("AP184-2 CONSTRUCTED: a receipt code beside a malformed count adds no held path to the header", async () => {
    // aurora-a carries the receipt code; give it a malformed count. The held total stays bucket-1 2 + empty-bucket 1.
    serve({ ...SECTION, targets: SECTION.targets.map((t) => (t.name === "aurora-a" ? { ...t, held_path_count: "bad" } : t)) })
    await renderPage()
    expect(await screen.findByTestId("catalog-held-not-counted")).toHaveTextContent("· 3 paths held, not counted")
    expect(screen.getByTestId("catalog-coverage-withheld")).toHaveTextContent("· coverage withheld for 3 targets")
    expect(screen.getByTestId("catalog-coverage-unreadable")).toHaveTextContent("· coverage evidence unreadable for 1 target")
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

// AP187-F3 / AP188 / AP189: the graph header's count. A catalog that lists no path for the target is the count (0, with
// the row's note when its coverage is incomplete). A target the catalog lists paths for is counted only from a detail
// answer: while that read runs (here it answers 502 unless a case supplies a CONSTRUCTED summary) the header says it is
// loading, never "0"; a NOT_READY answer says not ready; a whole answer keeps the established "<name> · N paths".
describe("AttackPathsV2 header count — what the read state supports, never a bare zero (AP187-F3, AP188, AP189)", () => {
  async function headerFor(name: string, kind: string, section: unknown = capturedSection,
    summary?: { status: number; body: unknown }) {
    setUrl({ system: SYSTEM, jewel: idOf(name, kind) })
    serve(section, summary)
    await renderPage()
    return waitFor(() => {
      const el = screen.getByTestId("mode-bar-target-count")
      expect(el.textContent).toContain(name)
      return el
    })
  }
  const first = (header: HTMLElement) => (header.firstElementChild ?? header) as HTMLElement
  const real = (i: number) => ({ path_id: `ap188-p${i}`, workload_arn: `arn:aws:lambda:eu-west-1:111122223333:function:f${i}`,
    damage: [], score: 10, confidence: "observed", evidence: "observed", hop_count: 0 })
  const withoutLifecycle = (name: string) => ({
    ...SECTION,
    targets: SECTION.targets.map((t) => {
      if (t.name !== name) return t
      const { held_path_count: _h, coverage_withheld_reason: _r, ...rest } = t
      return rest
    }),
  })

  it.each([
    ["empty-bucket", "S3Bucket", "+1 held, not counted"],             // all held: the catalog lists none
    ["cluster-1", "RDSCluster", "coverage withheld"],                 // receipt-withheld, no path listed
    ["db-1", "RDSInstance", "coverage incomplete"],                   // served coverage_incomplete, nothing recorded
  ])("captured %s (the catalog lists no path): '0 listed paths', the row's note beside it", async (name, kind, note) => {
    const header = await headerFor(name, kind)
    expect(first(header)).toHaveTextContent(new RegExp(`^${name} · 0 listed paths$`))
    const noteEl = within(header).getByTestId("mode-bar-coverage-note")
    expect(noteEl).toHaveTextContent(new RegExp(`^${note.replace("+", "\\+")}$`))
    expect(noteEl).toHaveAttribute("title", note)                               // the full note, if the line truncates
    // Layout contract (measured in the AP187 browser harness, not by jsdom): the note line never widens the block, so
    // the already-clipped tab strip beside it loses only the word "listed".
    expect(noteEl.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-0", "min-w-full", "truncate"]))
  })

  it.each([
    ["bucket-1", "S3Bucket", "+2 held, not counted"],                 // mixed: the catalog lists 1 path, 2 held
    ["aurora-a", "RDSCluster", "coverage withheld"],                  // receipt-withheld beside a listed path
  ])("AP188 captured %s (the catalog lists paths, the detail read answers 502): loading, never '0'", async (name, kind, note) => {
    const header = await headerFor(name, kind)
    expect(first(header)).toHaveTextContent(new RegExp(`^${name} · paths loading…$`))
    expect(within(header).getByTestId("mode-bar-coverage-note")).toHaveTextContent(new RegExp(`^${note.replace("+", "\\+")}$`))
    expect(header.textContent).not.toMatch(/· 0 (listed )?paths/)
  })

  it("CONSTRUCTED unreadable evidence on a no_modeled_route target: '0 listed paths', 'coverage evidence unreadable'", async () => {
    const header = await headerFor("db-us-only", "RDSInstance", {
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "db-us-only" ? { ...t, state: "no_modeled_route", held_path_count: "bad" } : t)),
    })
    expect(first(header)).toHaveTextContent(/^db-us-only · 0 listed paths$/)
    expect(within(header).getByTestId("mode-bar-coverage-note")).toHaveTextContent(/^coverage evidence unreadable$/)
  })

  it("AP188 CONSTRUCTED projection_not_ready target: 'projection not ready', no number at all", async () => {
    const header = await headerFor("db-1", "RDSInstance", {
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-1" ? { ...t, state: "projection_not_ready" } : t)),
    })
    expect(header).toHaveTextContent(/^db-1 · projection not ready$/)
    expect(header.textContent!.replace("db-1", "")).not.toMatch(/\d/)
  })

  it("AP188 CONSTRUCTED loaded detail: a whole READY answer is '<name> · N paths'; a PARTIAL one is 'listed'", async () => {
    const card = { generation_total: 2, eligible_total: 2, returned_count: 2, drawn_count: null, excluded_count_by_reason: {}, truncated: false }
    const whole = await headerFor("bucket-1", "S3Bucket", withoutLifecycle("bucket-1"), { status: 200, body: {
      system: SYSTEM, serve_state: "ACTIVE", coverage_state: "READY", paths_total: 2, observed_paths: 2, choke_points: {},
      paths: [real(1), real(2)], cardinality: card } })
    await waitFor(() => expect(whole).toHaveTextContent(/^bucket-1 · 2 paths$/))
    expect(within(whole).queryByTestId("mode-bar-coverage-note")).toBeNull()
    cleanup()
    vi.unstubAllGlobals()
    window.localStorage.clear()
    // the captured held bucket-1 over an install-shaped PARTIAL answer
    const partial = await headerFor("bucket-1", "S3Bucket", capturedSection, { status: 200, body: {
      system: SYSTEM, serve_state: "ACTIVE", coverage_state: "PARTIAL", paths_total: 2, observed_paths: 2, choke_points: {},
      paths: [real(1), real(2)] } })
    await waitFor(() => expect(first(partial)).toHaveTextContent(/^bucket-1 · 2 listed paths$/))
    expect(within(partial).getByTestId("mode-bar-coverage-note")).toHaveTextContent(/^\+2 held, not counted · coverage partial$/)
  })

  it.each([
    ["serve_state NOT_READY, pathless", { system: SYSTEM, serve_state: "NOT_READY" }],
    ["CONTROL: a valid NOT_READY with an empty list", { system: SYSTEM, serve_state: "NOT_READY", coverage_state: "NOT_READY", paths: [] }],
  ])("AP189 CONSTRUCTED %s: the header and the path list say not ready; no crash, never 'no paths today'", async (_label, body) => {
    const header = await headerFor("bucket-1", "S3Bucket", withoutLifecycle("bucket-1"), { status: 200, body })
    await waitFor(() => expect(header).toHaveTextContent(/^bucket-1 · projection not ready$/))
    expect(await screen.findByTestId("paths-not-ready-state")).toHaveTextContent("Paths are unknown — not absent.")
    expect(screen.queryByText(/No attack paths to/)).toBeNull()
    expect(consoleError.mock.calls.map((c) => String(c[0])).join("\n")).not.toMatch(/reading 'map'/)
  })

  it("AP188 CONSTRUCTED a 200 hold as the summary: no zero, no crash; AP201 (M4) the hold is settled — named, not retried", async () => {
    const header = await headerFor("bucket-1", "S3Bucket", withoutLifecycle("bucket-1"), { status: 200, body: {
      semantic_status: "not_recorded", hold_reason: "JEWEL_NOT_IN_IAP_PUBLICATION" } })
    // AP188 asserted "paths loading…" here because the hold was retried as a cold backend. A typed hold is the
    // server's answer about right now (M4): the read has failed with the hold as its reason, never a zero.
    await waitFor(() => expect(first(header)).toHaveTextContent(/^bucket-1 · detail paths unavailable$/))
    // the catalog's own count (1 for bucket-1 in this section) stays said as the catalog's, never as loaded detail
    expect(header).toHaveTextContent(/1 listed in the catalog/)
    // with a secondary line the full explanation is the primary line's title
    expect(first(header).getAttribute("title")).toMatch(/Not recorded yet — JEWEL_NOT_IN_IAP_PUBLICATION/)
    expect(screen.queryByText(/No attack paths to/)).toBeNull()
    expect(screen.queryByText(/Loading paths for this jewel/)).toBeNull()
    expect(consoleError.mock.calls.map((c) => String(c[0])).join("\n")).not.toMatch(/reading 'map'|reading 'length'/)
  })

  it.each([["bad"], [-1]])("AP190-R2 CONSTRUCTED a catalog path_count of %j: no zero, the count named unreadable", async (raw) => {
    const header = await headerFor("bucket-1", "S3Bucket", {
      ...withoutLifecycle("bucket-1"),
      targets: withoutLifecycle("bucket-1").targets.map((t) => (t.name === "bucket-1" ? { ...t, path_count: raw } : t)),
    })
    await waitFor(() => expect(header).toHaveTextContent(/^bucket-1 · detail paths unavailable$/))
    expect(header.getAttribute("title")).toBe("the catalog's path count could not be read")
    expect(header.textContent).not.toMatch(/· \d+ (listed )?paths?/)
  })

  it("CONSTRUCTED control: legacy no-route keeps exactly '<name> · 0 paths', no note", async () => {
    const legacy = await headerFor("db-x1", "RDSInstance", {
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route" } : t)),
    })
    expect(legacy).toHaveTextContent(/^db-x1 · 0 paths$/)
    expect(within(legacy).queryByTestId("mode-bar-coverage-note")).toBeNull()
  })
})

// AP188 (F4 P1+P2, F5): class contracts only -- jsdom has no layout. The geometry and the real wheel / keyboard / click
// reachability are measured by the browser journey (agent-coordinator AP188 packet, journey.mjs).
describe("AttackPathsV2 responsive journey contracts (AP188 F4/F5)", () => {
  async function renderSelected() {
    setUrl({ system: SYSTEM, jewel: idOf("empty-bucket", "S3Bucket") })
    serve(capturedSection)
    await renderPage()
    await waitFor(() => expect(screen.getByTestId("mode-bar-target-count")).toHaveTextContent("empty-bucket"))
    return document.querySelector("aside") as HTMLElement
  }

  it("the rail's Collapse narrows the ASIDE itself (lg:w-9), and Expand restores lg:w-[320px]", async () => {
    const aside = await renderSelected()
    expect(aside.className).toContain("lg:w-[320px]")
    await act(async () => { screen.getByTitle("Collapse to give the attack graph more room").click() })
    expect(aside.className).toContain("lg:w-9")
    expect(aside.className).not.toContain("lg:w-[320px]")
    await act(async () => { screen.getByTitle("Expand crown jewel list").click() })
    expect(aside.className).toContain("lg:w-[320px]")
  })

  it("below lg the panes stack and the shell scrolls; from lg up the row is as before (AP192: md left 180px at 900)", async () => {
    const aside = await renderSelected()
    const shell = aside.parentElement as HTMLElement
    for (const c of ["flex-col", "lg:flex-row", "overflow-y-auto", "lg:overflow-hidden"]) expect(shell.className.split(/\s+/)).toContain(c)
    expect(shell.className).not.toMatch(/\bmd:/)
    expect(aside.className.split(/\s+/)).toContain("w-full")
    const main = shell.querySelector(":scope > main") as HTMLElement
    expect(main.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex-1", "min-h-[70vh]", "lg:min-h-0"]))
  })

  it("F5: the tab row keeps its full width inside the scrolling wrapper (no max-w-full clip); every tab is a button", async () => {
    await renderSelected()
    const wrap = screen.getByTestId("mode-bar-tabs")
    // AP192: sized by its content (flex-auto), so the wrapping bar gives it a full line whenever the first has no room
    expect(wrap.className.split(/\s+/)).toEqual(expect.arrayContaining(["overflow-x-auto", "min-w-0", "flex-auto"]))
    expect(wrap.className.split(/\s+/)).not.toEqual(expect.arrayContaining(["flex-1"]))
    expect(wrap.className).not.toMatch(/\bmd:/)
    const row = wrap.firstElementChild as HTMLElement
    expect(row.className.split(/\s+/)).toContain("w-max")
    expect(row.className.split(/\s+/)).not.toContain("max-w-full")
    expect(within(wrap).getAllByRole("button").length).toBeGreaterThanOrEqual(5)
  })

  it("F5: a tab reached by keyboard asks to be scrolled fully into view (nearest)", async () => {
    await renderSelected()
    const tabs = within(screen.getByTestId("mode-bar-tabs")).getAllByRole("button")
    const calls: unknown[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) { calls.push([this.textContent, arg]) } as typeof original
    try {
      await act(async () => { tabs[tabs.length - 1].focus() })
    } finally {
      Element.prototype.scrollIntoView = original
    }
    expect(calls).toEqual([[tabs[tabs.length - 1].textContent, { block: "nearest", inline: "nearest" }]])
  })

  it("the selected-target count is shown at every width (no md-only hiding), and the bar may wrap below md", async () => {
    await renderSelected()
    const count = screen.getByTestId("mode-bar-target-count")
    expect(count.className.split(/\s+/)).not.toContain("hidden")
    const bar = count.parentElement as HTMLElement
    // AP192: the bar always wraps by its own room (md:flex-nowrap forced one line and squeezed the strip to 0px)
    expect(bar.className.split(/\s+/)).toContain("flex-wrap")
    expect(bar.className).not.toMatch(/flex-nowrap/)
    // DOM order = visual order: freshness, the count, Expand, then the tab strip last
    const order = [...bar.children].map((c) => c.getAttribute("data-testid") ?? c.tagName.toLowerCase())
    expect(order.indexOf("mode-bar-target-count")).toBeLessThan(order.indexOf("mode-bar-tabs"))
    expect(order[order.length - 1]).toBe("mode-bar-tabs")
  })

  it("the single-line count (a whole count, here the legacy no-route control) is shown at every width too", async () => {
    setUrl({ system: SYSTEM, jewel: idOf("db-x1", "RDSInstance") })
    serve({ ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route" } : t)) })
    await renderPage()
    const count = await waitFor(() => {
      const el = screen.getByTestId("mode-bar-target-count")
      expect(el).toHaveTextContent(/^db-x1 · 0 paths$/)
      return el
    })
    expect(within(count).queryByTestId("mode-bar-coverage-note")).toBeNull()      // the single-line form
    expect(count.className.split(/\s+/)).not.toContain("hidden")
  })
})

