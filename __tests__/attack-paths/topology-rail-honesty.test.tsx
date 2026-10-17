/**
 * AP194 / AP195 · the Topology view (TopologyAttackGraph), reached the way a user reaches it: the WHOLE AttackPathsV2
 * page in ?mode=topology. The page passes the very jewels its own rail shows, so the Topology view must say the same
 * things:
 * - (AP194) its crown-jewel rail: no invented severity (it printed "MEDIUM" for a null one), the state a no-path target
 *   is SHOWN in instead of a bare "0", its recorded cause's note, and no number for a catalog count that could not be
 *   read;
 * - (AP195) its center and right rail: a target the catalog settles with no listed path is never requested
 *   (hasAuthoritativeZeroPaths), and that intentional empty answer shows the catalog's conclusion (held, unreadable, not
 *   ready, or a proved no route), never "convergence API unavailable" + Retry or "No paths available.". A genuine
 *   failure, a read in flight, a NOT_READY answer and a listed answer each keep their own state.
 *
 * Real: AttackPathsV2, TopologyAttackGraph, useCrownJewelConvergence, the target-catalog adapter, AccountScopeProvider,
 * useCachedFetch. Stubbed: `fetch` (the target catalog answers the captured section, __tests__/fixtures/ap182-lifecycle;
 * the by-crown-jewel summary answers per case; everything else 502) and next/navigation. CONSTRUCTED rows and summary
 * bodies are labelled per case.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import capturedSection from "@/__tests__/fixtures/ap182-lifecycle/target-catalog-section.json"
import { CONVERGENCE_NOT_READY_MESSAGE } from "@/lib/attack-paths/convergence-readiness"

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

type Section = { system_name: string; customer_id: string; account_id: string; targets: Array<Record<string, unknown>> }
const SECTION = capturedSection as unknown as Section
const SYSTEM = SECTION.system_name
const idOf = (name: string, kind: string) => String(SECTION.targets.find((t) => t.name === name && t.kind === kind)!.target_id)

/** A by-crown-jewel summary answer: a status + body, or "pending" (never settles). Absent: 502. */
type Summary = { status: number; body: unknown } | "pending"

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function serve(section: unknown, summary?: Summary) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === "/api/proxy/admin/customers") return respond(200, [{ customer_id: SECTION.customer_id, display_name: SECTION.customer_id }])
    if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
      return respond(200, { customer_id: SECTION.customer_id,
        accounts: [{ account_id: SECTION.account_id, display_name: SECTION.customer_id, regions: [], group_ids: [], status: "active" }], groups: [] })
    }
    if (url.startsWith("/api/proxy/systems")) return respond(200, { systems: [{ name: SYSTEM }] })
    if (url.startsWith(`/api/proxy/attack-paths/${encodeURIComponent(SYSTEM)}/targets`)) return respond(200, section)
    if (url.includes("/by-crown-jewel/summary") && summary !== undefined) {
      if (summary === "pending") return new Promise<Response>(() => undefined)
      return respond(summary.status, summary.body)
    }
    return respond(502, { detail: "bad gateway" })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

/** Every by-crown-jewel summary request made for one target name. */
const summaryCallsFor = (fetchMock: ReturnType<typeof serve>, name: string) =>
  fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/by-crown-jewel/summary") && u.includes(`cj_name=${name}`))

beforeEach(() => {
  for (const key of Array.from(nav.params.keys())) nav.params.delete(key)
  nav.params.set("system", SYSTEM)
  nav.params.set("mode", "topology")
  nav.params.set("jewel", idOf("empty-bucket", "S3Bucket"))
  window.localStorage.clear()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

async function mountPage(section: unknown = capturedSection, summary?: Summary) {
  const fetchMock = serve(section, summary)
  await act(async () => {
    render(<AccountScopeProvider><AttackPathsV2 systemName={SYSTEM} /></AccountScopeProvider>)
  })
  return fetchMock
}

async function topologyRail(section: unknown = capturedSection) {
  await mountPage(section)
  const heading = await screen.findByText("Crown jewels · ranked by reachable paths")
  const rail = heading.closest("nav") as HTMLElement
  await waitFor(() => expect(within(rail).getAllByRole("button").length).toBeGreaterThan(0))
  return rail
}
const rowOf = (rail: HTMLElement, name: string) =>
  within(rail).getAllByRole("button").find((b) => b.textContent?.includes(name)) as HTMLElement

describe("the Topology view's rail says what the Attack Paths rail says (AP194)", () => {
  it("captured all-held empty-bucket: PENDING, 'coverage incomplete', '+1 held, not counted' — never '0 MEDIUM'", async () => {
    const row = rowOf(await topologyRail(), "empty-bucket")
    expect(row.textContent).not.toMatch(/MEDIUM/)
    expect(row).toHaveTextContent("coverage incomplete")
    expect(within(row).getByTestId("topology-rail-count")).toHaveTextContent(/^PENDING$/)
    expect(within(row).getByTestId("topology-rail-coverage-note")).toHaveTextContent(/^\+1 held, not counted$/)
  })

  it("captured bucket-1 (a severity and a listed path): its count and label as before, plus its held note", async () => {
    const row = rowOf(await topologyRail(), "bucket-1")
    expect(row).toHaveTextContent("+2 held, not counted")
    expect(row).toHaveTextContent("CRITICAL")
    expect(within(row).getByTestId("topology-rail-count")).toHaveTextContent(/^1$/)
    expect(within(row).getByTestId("topology-rail-coverage-note")).toHaveTextContent(/^\+2 held, not counted$/)
  })

  it("no captured row with a null severity says MEDIUM (it was every one of them)", async () => {
    const rail = await topologyRail()
    const nullSeverity = SECTION.targets.filter((t) => t.max_severity_label == null).map((t) => String(t.name))
    expect(nullSeverity.length).toBeGreaterThan(0)
    for (const name of nullSeverity) expect(rowOf(rail, name).textContent, name).not.toMatch(/MEDIUM/)
  })

  it("CONSTRUCTED db-x1 no_modeled_route with nothing recorded: NO PATH, 'no modeled route', no note (the legacy control)", async () => {
    const row = rowOf(await topologyRail({
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route" } : t)),
    }), "db-x1")
    expect(row).toHaveTextContent("no modeled route")
    expect(within(row).getByTestId("topology-rail-count")).toHaveTextContent(/^NO PATH$/)
    expect(within(row).queryByTestId("topology-rail-coverage-note")).toBeNull()
  })

  it("CONSTRUCTED db-us-only no_modeled_route + an unreadable held count: shown as coverage incomplete, never 'no route'", async () => {
    const row = rowOf(await topologyRail({
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "db-us-only" ? { ...t, state: "no_modeled_route", held_path_count: "bad" } : t)),
    }), "db-us-only")
    expect(row).toHaveTextContent("coverage incomplete")
    expect(row.textContent).not.toMatch(/no modeled route|NO PATH/)
    expect(within(row).getByTestId("topology-rail-count")).toHaveTextContent(/^PENDING$/)
    expect(within(row).getByTestId("topology-rail-coverage-note")).toHaveTextContent(/^coverage evidence unreadable$/)
  })

  it("CONSTRUCTED bucket-1 path_count \"bad\": '—', with the reason in the title, never NaN", async () => {
    const row = rowOf(await topologyRail({
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "bucket-1" ? { ...t, path_count: "bad" } : t)),
    }), "bucket-1")
    expect(row.textContent).not.toMatch(/NaN/)
    const count = within(row).getByTestId("topology-rail-count")
    expect(count).toHaveTextContent(/^—$/)
    expect(count.getAttribute("title")).toMatch(/could not be read/)
    expect(within(row).getByTestId("topology-rail-count-unreadable")).toHaveTextContent(/^path count unreadable$/)
  })

  it("CONSTRUCTED db-x1 no_modeled_route + a null path_count (AP196): '—' and 'path count unreadable', never NO PATH", async () => {
    const row = rowOf(await topologyRail({
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route", path_count: null } : t)),
    }), "db-x1")
    expect(row).toHaveTextContent("path count unreadable")
    expect(row.textContent).not.toMatch(/NO PATH|no modeled route/)
    expect(row).toHaveTextContent("coverage incomplete")
    expect(within(row).getByTestId("topology-rail-count")).toHaveTextContent(/^—$/)
    expect(within(row).getByTestId("topology-rail-count-unreadable")).toHaveTextContent(/^path count unreadable$/)
  })
})

// ── AP195: the center and the right rail ────────────────────────────────────────────────────────────────────────

const OUTAGE = "convergence API unavailable"
const NO_PATHS = "No paths available."
/** CONSTRUCTED summary path and a whole READY answer listing it (the backend serves paths_total = len(paths)). */
const PATH = { path_id: "p1", workload_arn: "arn:aws:lambda:eu-west-1:111122223333:function:f", damage: [], score: 1,
  confidence: "observed", hop_count: 0 }
const readySummary = () => ({ system: SYSTEM, serve_state: "ACTIVE", coverage_state: "READY", paths_total: 1,
  observed_paths: 1, choke_points: {}, paths: [PATH] })

async function topologyGraph() {
  return screen.findByTestId("topology-attack-graph")
}

/** The settled target's whole Topology view: the conclusion in the center and the right rail, no outage, no Retry,
 *  no "no paths", no summary request. */
async function expectCatalogConclusion(fetchMock: ReturnType<typeof serve>, name: string, title: string, subtitle: RegExp,
  note: string | null) {
  const graph = await topologyGraph()
  // The defect first, as a user sees it (the state is synchronous: it needs no answer).
  expect(within(graph).queryByText(OUTAGE)).toBeNull()
  expect(within(graph).queryByText(NO_PATHS)).toBeNull()
  expect(within(graph).queryByRole("button", { name: /Retry/ })).toBeNull()
  const center = within(graph).getByTestId("topology-catalog-conclusion")
  expect(center).toHaveTextContent(title)
  expect(center).toHaveTextContent(subtitle)
  const right = within(graph).getByTestId("topology-path-rail-state")
  expect(right).toHaveTextContent(title)
  expect(right).toHaveTextContent("No path is listed for this crown jewel.")
  if (note === null) expect(within(right).queryByTestId("topology-path-rail-note")).toBeNull()
  else expect(within(right).getByTestId("topology-path-rail-note")).toHaveTextContent(new RegExp(`^${note.replace("+", "\\+")}$`))
  // The stage label stays short (a long one covered the conclusion in a narrow center column) and never a count.
  const stage = within(graph).getByTestId("topology-stage-label")
  expect(stage).toHaveTextContent(title === "Path count unreadable" ? /— path count unreadable$/ : /— no listed path$/)
  expect(stage.textContent).not.toMatch(/\d+ (listed )?paths?/)
  expect(within(graph).queryByTestId("topology-not-ready")).toBeNull()
  expect(summaryCallsFor(fetchMock, name)).toEqual([])
}

describe("the Topology view's center and right rail keep the catalog's conclusion (AP195)", () => {
  it("captured all-held empty-bucket (Codex's reproduction): coverage incomplete with every path held, '+1 held'", async () => {
    const fetchMock = await mountPage()
    await expectCatalogConclusion(fetchMock, "empty-bucket", "Current-access coverage incomplete",
      /Every path the active generation found to this crown jewel is held \(1 path held\)/, "+1 held, not counted")
  })

  it("captured db-1 (coverage_incomplete, nothing recorded): the no-manifest conclusion, no note", async () => {
    nav.params.set("jewel", idOf("db-1", "RDSInstance"))
    const fetchMock = await mountPage()
    await expectCatalogConclusion(fetchMock, "db-1", "Current-access coverage incomplete",
      /has no evaluation manifest for this crown jewel/, "coverage incomplete")
  })

  it("CONSTRUCTED db-us-only no_modeled_route + an unreadable held count: coverage incomplete, never 'no route'", async () => {
    nav.params.set("jewel", idOf("db-us-only", "RDSInstance"))
    const fetchMock = await mountPage({
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "db-us-only" ? { ...t, state: "no_modeled_route", held_path_count: "bad" } : t)),
    })
    await expectCatalogConclusion(fetchMock, "db-us-only", "Current-access coverage incomplete",
      /coverage evidence served for this crown jewel could not be read/, "coverage evidence unreadable")
    expect((await topologyGraph()).textContent).not.toMatch(/No modeled current-access route/)
  })

  it.each([
    ["a null path_count", { path_count: null }],
    ["no path_count at all", { path_count: undefined }],
    // S13: the adapter gives a malformed count as null too (it was NaN, which read the summary), so it settles alike.
    ["a malformed path_count (\"bad\")", { path_count: "bad" }],
  ])("CONSTRUCTED db-x1 no_modeled_route with %s, nothing recorded (AP196-R1): 'Path count unreadable' in the center, the"
    + " narrative and the right rail, never 'no route'", async (_label, count) => {
    nav.params.set("jewel", idOf("db-x1", "RDSInstance"))
    const fetchMock = await mountPage({
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route", ...count } : t)),
    })
    const graph = await topologyGraph()
    expect(graph.textContent).not.toMatch(/No modeled current-access route|NO PATH/)
    await expectCatalogConclusion(fetchMock, "db-x1", "Path count unreadable",
      /path count in a shape that could not be read, so Cyntro does not claim that no route exists/, null)
    expect(within(graph).getByText("Path count unreadable: no listed path to show.")).toBeInTheDocument()
  })

  it("CONSTRUCTED db-x1 projection_not_ready: the not-ready conclusion, not an outage", async () => {
    nav.params.set("jewel", idOf("db-x1", "RDSInstance"))
    const fetchMock = await mountPage({
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "projection_not_ready" } : t)),
    })
    await expectCatalogConclusion(fetchMock, "db-x1", "Attack-path projection not ready",
      /No active Attack Paths generation can author a current-access conclusion yet/, null)
  })

  it("CONTROL (proved no route): CONSTRUCTED db-x1 no_modeled_route, a readable 0, nothing recorded", async () => {
    nav.params.set("jewel", idOf("db-x1", "RDSInstance"))
    const fetchMock = await mountPage({
      ...SECTION, targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route" } : t)),
    })
    await expectCatalogConclusion(fetchMock, "db-x1", "No modeled current-access route",
      /evaluated this crown jewel and found no compute-to-jewel route/, null)
  })

  it("CONTROL (genuine outage): bucket-1 lists a path and its summary answers 502: the error with Retry, no conclusion", async () => {
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    const fetchMock = await mountPage(capturedSection, { status: 502, body: { detail: "bad gateway" } })
    const graph = await topologyGraph()
    await waitFor(() => expect(within(graph).getByText("Backend busy (502)")).toBeInTheDocument())
    expect(within(graph).getByRole("button", { name: /Retry/ })).toBeInTheDocument()
    expect(within(graph).getByText("Paths unavailable — see canvas.")).toBeInTheDocument()
    expect(within(graph).queryByTestId("topology-catalog-conclusion")).toBeNull()
    expect(within(graph).queryByTestId("topology-path-rail-state")).toBeNull()
    expect(summaryCallsFor(fetchMock, "bucket-1").length).toBeGreaterThan(0)
  })

  it("CONTROL (genuine loading): bucket-1's summary never answers: loading in both, never 'unavailable' or 'no paths'", async () => {
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    const fetchMock = await mountPage(capturedSection, "pending")
    const graph = await topologyGraph()
    await waitFor(() => expect(summaryCallsFor(fetchMock, "bucket-1").length).toBeGreaterThan(0))
    expect(within(graph).getByText("Loading topology…")).toBeInTheDocument()
    expect(within(graph).getByText("Loading paths…")).toBeInTheDocument()
    expect(within(graph).queryByText(OUTAGE)).toBeNull()
    expect(within(graph).queryByText(NO_PATHS)).toBeNull()
    expect(within(graph).queryByTestId("topology-catalog-conclusion")).toBeNull()
  })

  it("CONSTRUCTED NOT_READY summary for bucket-1: paths unknown in the center, the rail and the label, never '0 paths'", async () => {
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    await mountPage(capturedSection, {
      status: 200, body: { system: SYSTEM, serve_state: "NOT_READY", coverage_state: "NOT_READY", paths_total: 0, paths: [] },
    })
    const graph = await topologyGraph()
    await waitFor(() => expect(within(graph).getAllByText(CONVERGENCE_NOT_READY_MESSAGE)).toHaveLength(2))
    expect(graph.textContent).not.toMatch(/\b0 paths/)
    expect(within(graph).getByTestId("topology-not-ready")).toHaveTextContent(CONVERGENCE_NOT_READY_MESSAGE)
    expect(within(graph).getByTestId("topology-path-rail-state")).toHaveTextContent(CONVERGENCE_NOT_READY_MESSAGE)
    expect(within(graph).getByTestId("topology-stage-label")).toHaveTextContent("paths unknown, projection not ready")
    expect(within(graph).queryByText(OUTAGE)).toBeNull()
    expect(within(graph).queryByTestId("topology-catalog-conclusion")).toBeNull()
  })

  it("CONSTRUCTED NOT_READY summary that still carries a path (AP196): the narrative shows no path while the center"
    + " and the rail say unknown", async () => {
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    await mountPage(capturedSection, {
      status: 200, body: { system: SYSTEM, serve_state: "NOT_READY", coverage_state: "NOT_READY", paths_total: 1, paths: [PATH] },
    })
    const graph = await topologyGraph()
    await waitFor(() => expect(within(graph).getAllByText(CONVERGENCE_NOT_READY_MESSAGE)).toHaveLength(2))
    expect(within(graph).getByText("Paths unknown — projection not ready.")).toBeInTheDocument()
    expect(within(graph).queryByText("Pick a path on the right rail to see its kill chain.")).toBeNull()
    expect(within(graph).queryByText(/ranked by severity/)).toBeNull()
    expect(within(graph).queryByText("#1")).toBeNull()
    expect(graph.textContent).not.toMatch(/\b1 (listed )?paths?\b/)
  })

  it.each([
    ["cardinality says more paths than returned", { cardinality: { generation_total: 3, eligible_total: 3, returned_count: 1, truncated: true } },
      "+2 held, not counted · more paths than returned"],
    ["an unrecognised serve state", { serve_state: "WARMING" }, "+2 held, not counted · serve state WARMING not recognised"],
    ["a malformed cardinality", { cardinality: { generation_total: "3" } }, "+2 held, not counted · path cardinality unreadable"],
  ])("CONSTRUCTED READY summary for bucket-1 with %s: the stage count says listed and why (AP196)", async (_l, extra, why) => {
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    await mountPage(capturedSection, { status: 200, body: { ...readySummary(), ...extra } })
    const graph = await topologyGraph()
    expect(await within(graph).findByText(/ranked by severity/)).toBeInTheDocument()
    expect(graph.textContent).toContain(`bucket-1 — 1 listed path · ${why}`)
    expect(within(graph).getByTestId("topology-stage-label")).toHaveTextContent(`bucket-1 — 1 listed path · ${why}`)
  })

  it("CONSTRUCTED bucket-1 with nothing recorded and a whole READY answer: the plain count (one path), no 'listed'", async () => {
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    await mountPage({
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "bucket-1" ? { ...t, coverage_withheld_reason: null, held_path_count: undefined } : t)),
    }, { status: 200, body: readySummary() })
    const graph = await topologyGraph()
    expect(await within(graph).findByText(/ranked by severity/)).toBeInTheDocument()
    expect(graph.textContent).toMatch(/bucket-1 — 1 path · /)
    expect(within(graph).getByTestId("topology-stage-label")).toHaveTextContent(/^bucket-1 — 1 path · /)
  })

  it("CONSTRUCTED READY summary with one path for bucket-1: the canvas and the ranked rail, the label keeps '+2 held'; then"
    + " a click on empty-bucket in the Topology rail shows its conclusion with no request for it", async () => {
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    const fetchMock = await mountPage(capturedSection, { status: 200, body: readySummary() })
    const graph = await topologyGraph()
    expect(await within(graph).findByText(/ranked by severity/)).toBeInTheDocument()
    expect(graph.textContent).toMatch(/bucket-1 — 1 listed path · \+2 held, not counted/)
    expect(within(graph).getByTestId("topology-stage-label")).toHaveTextContent(/bucket-1 — 1 listed path · \+2 held, not counted/)
    expect(within(graph).queryByTestId("topology-catalog-conclusion")).toBeNull()
    expect(within(graph).queryByTestId("topology-path-rail-state")).toBeNull()

    const rail = within(graph).getByText("Crown jewels · ranked by reachable paths").closest("nav") as HTMLElement
    await act(async () => { fireEvent.click(rowOf(rail, "empty-bucket")) })
    await expectCatalogConclusion(fetchMock, "empty-bucket", "Current-access coverage incomplete",
      /Every path the active generation found to this crown jewel is held \(1 path held\)/, "+1 held, not counted")
    expect(within(graph).queryByText(/ranked by severity/)).toBeNull()
  })
})

describe("the Attack Paths page's rail, empty state and path list use the same validated-count guard (AP196)", () => {
  /** CONSTRUCTED: db-x1 served as no_modeled_route, with the served state counts moved to match (1 no route, 7 incomplete). */
  const dbX1NoRoute = (patch: Record<string, unknown>) => ({
    ...SECTION,
    counts: { ...(SECTION as unknown as { counts: Record<string, number> }).counts, no_modeled_route: 1, coverage_incomplete: 7 },
    targets: SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route", ...patch } : t)),
  })
  /** The Attack Paths rail's own db-x1 row (the button that carries its state chip). */
  const mainRailRow = () => {
    const chip = document.querySelector('[data-target-state="no_modeled_route"]') as HTMLElement
    return { chip, row: chip.closest("button") as HTMLElement }
  }

  it.each([
    ["a null path_count", { path_count: null }],
    ["no path_count at all", { path_count: undefined }],
    ["path_count \"bad\"", { path_count: "bad" }],
  ])("CONSTRUCTED db-x1 no_modeled_route with %s: the rail row, its state count, the empty state and the path list never"
    + " say 'no route'", async (_l, count) => {
    nav.params.set("mode", "attack-path")
    nav.params.set("jewel", idOf("db-x1", "RDSInstance"))
    await mountPage(dbX1NoRoute(count))
    await waitFor(() => expect(screen.getAllByText("Path count unreadable")).toHaveLength(2))
    expect(screen.queryByText("No modeled current-access route")).toBeNull()
    expect(screen.queryByTestId("no-modeled-route-state")).toBeNull()
    expect(screen.getByTestId("path-count-unreadable-state")).toHaveTextContent(/does not claim that no route exists/)
    const { chip, row } = mainRailRow()
    expect(row.textContent).not.toMatch(/NO PATH|no modeled route/)
    expect(row).toHaveTextContent("PENDING")
    expect(row).toHaveTextContent("path count unreadable")
    expect(chip).toHaveTextContent(/^coverage incomplete$/)
    expect(chip.getAttribute("data-displayed-state")).toBe("coverage_incomplete")
    expect(chip.getAttribute("title")).toMatch(/path count in a shape that could not be read/)
    const line = screen.getByTestId("target-zero-states")
    expect(line.textContent).not.toMatch(/no modeled route/)
    expect(line).toHaveTextContent("8 coverage incomplete")
    expect(line.getAttribute("data-served-zero-states")).toMatch(/1 no modeled route/)
  })

  it("CONTROL: CONSTRUCTED db-x1 no_modeled_route with a readable 0 and nothing recorded keeps 'No modeled"
    + " current-access route' in the empty state, the path list and the rail row", async () => {
    nav.params.set("mode", "attack-path")
    nav.params.set("jewel", idOf("db-x1", "RDSInstance"))
    await mountPage(dbX1NoRoute({}))
    await waitFor(() => expect(screen.getAllByText("No modeled current-access route")).toHaveLength(2))
    expect(screen.getByTestId("no-modeled-route-state")).toBeInTheDocument()
    expect(screen.queryByText("Path count unreadable")).toBeNull()
    const { chip, row } = mainRailRow()
    expect(row).toHaveTextContent("NO PATH")
    expect(chip).toHaveTextContent(/^no modeled route$/)
    expect(chip.getAttribute("data-displayed-state")).toBeNull()
    expect(screen.getByTestId("target-zero-states")).toHaveTextContent("1 no modeled route")
  })

  it("CONTROL: CONSTRUCTED db-us-only no_modeled_route + a null count + an unreadable held count: the recorded cause"
    + " wins (coverage incomplete), never 'no route'", async () => {
    nav.params.set("mode", "attack-path")
    nav.params.set("jewel", idOf("db-us-only", "RDSInstance"))
    await mountPage({
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "db-us-only"
        ? { ...t, state: "no_modeled_route", path_count: null, held_path_count: "bad" } : t)),
    })
    await waitFor(() => expect(screen.getByText("Current-access coverage incomplete")).toBeInTheDocument())
    expect(screen.getByTestId("coverage-incomplete-state")).toHaveTextContent(/could not be read/)
    expect(screen.queryByText("No modeled current-access route")).toBeNull()
  })
})
