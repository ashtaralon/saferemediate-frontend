/**
 * A7 B5 (Alon 2026-10-08): one Systems row per system IDENTITY, deployments / cells beneath, links and All Services by key; two
 * identities that share a display name are never merged. Shape agreed with Phase 2 (M3 backend).
 *
 * Every v2 body here is the backend's REAL answer, captured by Phase 2's harness in the M3 backend commit and copied to
 * __tests__/fixtures/systems-list-captures/ pinned to that SHA ({_provenance, status, cache_control, body}):
 *   systems_list_v2_two_identities_one_name, systems_list_v2_deployments, system_resources_name_ambiguous_409, and (Phase 2
 *   5e70932f, the part contract with kind "system") systems_list_v2_split_and_system_level.
 * Written 2026-10-08 in the build-only phase: those files do not exist until the harness has run, so these cases are red until
 * then, by design. Malformed variants are edits of a real capture, never hand-written rows.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import {
  ambiguousSystemCandidates,
  catalogEntries,
  catalogEntryHref,
  deploymentIdentity,
  selectCatalogSystem,
  systemDetailHref,
  systemRowIdentity,
  systemsListLevel,
} from "@/lib/scoped-system-catalog"

/* eslint-disable @typescript-eslint/no-explicit-any -- a capture's body is untyped JSON */
const capture = (name: string): { status: number; body: any } =>
  JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/systems-list-captures", `${name}.json`), "utf8"))

/** The rows of a capture that share a display name with another row (case-insensitive), grouped by that name. */
function sharedNameRows(body: any): any[] {
  const byName = new Map<string, any[]>()
  for (const row of body.systems) {
    const name = String(row.name).toLowerCase()
    byName.set(name, [...(byName.get(name) ?? []), row])
  }
  const shared = Array.from(byName.values()).find((rows) => rows.length > 1)
  if (!shared) throw new Error("the capture must hold two identities that share a name")
  return shared
}

describe("the v2 Systems list answer", () => {
  it("is level 2, every row an identity, and two identities sharing a name keep two row keys", () => {
    const { body } = capture("systems_list_v2_two_identities_one_name")
    expect(systemsListLevel(body)).toBe(2)
    const identities = body.systems.map((row: any) => systemRowIdentity(row))
    expect(identities.every((identity: any) => identity !== null)).toBe(true)
    const shared = sharedNameRows(body).map((row) => systemRowIdentity(row)!)
    expect(new Set(shared.map((identity) => identity.rowKey)).size).toBe(shared.length)
  })

  it("lists each deployment / cell with its account, Region and member count", () => {
    const { body } = capture("systems_list_v2_deployments")
    const withDeployments = body.systems.map((row: any) => systemRowIdentity(row)!).find((i: any) => i.deployments.length > 1)
    expect(withDeployments).toBeTruthy()
    for (const deployment of withDeployments.deployments) {
      expect(["deployment", "cell", "system"]).toContain(deployment.kind)
      expect(deployment.accountId).toMatch(/^[0-9]{12}$/)
      expect(Number.isInteger(deployment.memberCount) && deployment.memberCount >= 1).toBe(true)
    }
  })

  // Phase 2's part contract (2026-10-08): a split alias's one part and an authored system's members placed in no deployment
  // are kind "system", keyed by the system key; they are shown, never dropped. Capture from Phase 2's harness (T2).
  it("keeps a row whose parts include kind \"system\" -- a split alias and an authored system's undeployed members", () => {
    const { body } = capture("systems_list_v2_split_and_system_level")
    const identities = body.systems.map((row: any) => systemRowIdentity(row))
    expect(identities.every((identity: any) => identity !== null)).toBe(true)
    const parts = identities.flatMap((identity: any) => identity.deployments.map((part: any) => [identity, part]))
    const systemLevel = parts.filter(([, part]: any) => part.kind === "system")
    expect(systemLevel.length).toBeGreaterThanOrEqual(2)
    for (const [identity, part] of systemLevel) expect(part.key).toBe(identity.systemKey)
    // An authored row beside its deployment parts: the same row carries both kinds.
    expect(identities.some((identity: any) => new Set(identity.deployments.map((p: any) => p.kind)).size > 1)).toBe(true)
    // Parts are identified by (account, kind, key): never two with one identity in a row.
    for (const identity of identities) {
      const keys = identity.deployments.map((p: any) => deploymentIdentity(p))
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it.each([
    ["no row_key", (row: any) => { delete row.row_key }],
    ["a row_key that is not the identity's", (row: any) => { row.row_key = `${row.row_key}x` }],
    ["an identity naming another key", (row: any) => { row.identity = { ...row.identity, system_key: `${row.system_key}x` } }],
    ["an identity account that is not 12 digits", (row: any) => { row.identity = { ...row.identity, account_id: "abc" } }],
    ["no deployments", (row: any) => { delete row.deployments }],
    ["a negative member count", (row: any) => { row.deployments = [{ ...row.deployments[0], member_count: -1 }] }],
    ["an empty part (no ACTIVE member)", (row: any) => { row.deployments = [{ ...row.deployments[0], member_count: 0 }] }],
    ["an unknown deployment kind", (row: any) => { row.deployments = [{ ...row.deployments[0], kind: "region" }] }],
    ["a cell keyed other than its Region", (row: any) => {
      row.deployments = [{ ...row.deployments[0], kind: "cell", key: "cell-x", region: "eu-west-1" }] }],
    ["a system-level part keyed other than the row's system", (row: any) => {
      row.deployments = [{ ...row.deployments[0], kind: "system", key: `${row.system_key}x` }] }],
    ["a tag row's part in another account", (row: any) => {
      row.identity = { ...row.identity, account_id: "111111111111" }
      row.row_key = `${row.system_key}|111111111111`
      row.deployments = [{ ...row.deployments[0], account_id: "222222222222" }] }],
  ])("refuses a row with %s: never listed, never read as a v1 row", (_label, tamper) => {
    const { body } = capture("systems_list_v2_deployments")
    const row = structuredClone(body.systems.find((r: any) => Array.isArray(r.deployments) && r.deployments.length > 0))
    tamper(row)
    expect(systemRowIdentity(row)).toBeNull()
    const entries = catalogEntries({ ...structuredClone(body), systems: [row] }, null)
    expect(entries.map((entry) => entry.status)).toEqual(["MALFORMED"])
  })

  it("reads an unknown list contract as nothing, never as the v1 shape", () => {
    const { body } = capture("systems_list_v2_two_identities_one_name")
    const newer = { ...structuredClone(body), contract: "systems_list_read/v3" }
    expect(systemsListLevel(newer)).toBeNull()
    expect(catalogEntries(newer, null)).toEqual([])
  })
})

describe("selecting and linking a v2 system", () => {
  it("never resolves a shared name to one of its systems: AMBIGUOUS, each linked by its own key", () => {
    const { body } = capture("systems_list_v2_two_identities_one_name")
    const entries = catalogEntries(body, null)
    const [first] = sharedNameRows(body)
    const selection = selectCatalogSystem({ system: first.name }, entries)
    expect(selection.kind).toBe("AMBIGUOUS")
    if (selection.kind !== "AMBIGUOUS") return
    const hrefs = selection.entries.map((entry) => catalogEntryHref("/services", entry))
    expect(new Set(hrefs).size).toBe(selection.entries.length)
    for (const [index, entry] of selection.entries.entries()) {
      const query = new URL(`https://x${hrefs[index]}`).searchParams
      expect(query.get("system_key")).toBe(entry.membership!.systemKey)
      expect(query.get("account_id")).toBe(entry.membership!.accountId)
    }
  })

  it("selects exactly the identity a key (and a tag / source key's account) names", () => {
    const { body } = capture("systems_list_v2_two_identities_one_name")
    const entries = catalogEntries(body, null)
    for (const row of sharedNameRows(body)) {
      const selection = selectCatalogSystem(
        { system: row.name, systemKey: row.system_key, accountId: row.identity.account_id }, entries)
      expect(selection.kind).toBe("SELECTED")
      if (selection.kind === "SELECTED") expect(selection.entry.membership!.rowKey).toBe(row.row_key)
    }
    expect(selectCatalogSystem({ systemKey: "authored_system:not-in-this-answer" }, entries).kind).toBe("NOT_FOUND")
  })

  it("keeps a v1 link byte-identical and adds the key (and account) on a v2 one", () => {
    expect(systemDetailHref("alon prod")).toBe("/systems?systemName=alon%20prod")
    expect(systemDetailHref("alon prod", "k:1")).toBe("/systems?systemName=alon%20prod&system_key=k%3A1")
    expect(systemDetailHref("alon prod", "k:1", "222222222222")).toBe(
      "/systems?systemName=alon%20prod&system_key=k%3A1&account_id=222222222222")
    expect(systemDetailHref("alon prod", null, "222222222222")).toBe("/systems?systemName=alon%20prod")
  })
})

describe("the 409 a person resolves by choosing", () => {
  it("lists the candidates of SYSTEM_NAME_AMBIGUOUS and of SYSTEM_KEY_NEEDS_ACCOUNT, and nothing for any other answer", () => {
    const { status, body } = capture("system_resources_name_ambiguous_409")
    expect(status).toBe(409)
    const candidates = ambiguousSystemCandidates(status, body)!
    expect(candidates.length).toBeGreaterThanOrEqual(2)
    expect(candidates.map((c) => c.systemKey)).toEqual(body.detail.candidate_keys.map((c: any) => c.system_key))
    const needsAccount = structuredClone(body)
    needsAccount.detail.code = "SYSTEM_KEY_NEEDS_ACCOUNT"
    expect(ambiguousSystemCandidates(409, needsAccount)).not.toBeNull()
    const other = structuredClone(body)
    other.detail.code = "READ_MODEL_MISSING"
    expect(ambiguousSystemCandidates(409, other)).toBeNull()
    expect(ambiguousSystemCandidates(200, body)).toBeNull()
    const one = structuredClone(body)
    one.detail.candidate_keys = one.detail.candidate_keys.slice(0, 1)
    expect(ambiguousSystemCandidates(409, one)).toBeNull()
  })
})

// ── the Systems list page ─────────────────────────────────────────────────────────────────────────────────────────

const accountScope = {
  customerId: "acme", groupId: "all", accountId: "all", region: "all",
  options: { customer_id: "acme", accounts: [], groups: [] }, customers: [], loading: false, error: null,
  scopeNotices: [] as string[], dismissScopeNotices: vi.fn(), setCustomerId: vi.fn(), setGroupId: vi.fn(),
  setAccountId: vi.fn(), setRegion: vi.fn(), refresh: vi.fn(),
}
vi.mock("@/lib/account-scope-context", () => ({ useAccountScope: () => accountScope }))
vi.mock("@/components/back-to-dashboard", () => ({ BackToDashboard: () => null }))
vi.mock("@/components/ui/page-header", () => ({ PageHeader: () => null }))
vi.mock("@/components/new-systems-modal", () => ({ NewSystemsModal: () => null }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("SystemsView on a v2 answer", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it("shows two systems that share a name as two rows, each told apart, and opens each by its own key", async () => {
    const { body } = capture("systems_list_v2_two_identities_one_name")
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/proxy/systems") ? json(body) : json({})))
    const { SystemsView } = await import("@/components/systems-view")
    const onSystemSelect = vi.fn()
    render(<SystemsView onSystemSelect={onSystemSelect} />)

    const shared = sharedNameRows(body)
    expect((await screen.findAllByText(shared[0].name)).length).toBeGreaterThanOrEqual(shared.length)
    expect(screen.getAllByTestId("system-identity-hint").length).toBeGreaterThanOrEqual(shared.length)
    for (const button of screen.getAllByRole("button", { name: "View" })) fireEvent.click(button)
    const opened = onSystemSelect.mock.calls.map(([, key, account]) => `${key}|${account ?? ""}`)
    for (const row of shared) expect(opened).toContain(`${row.system_key}|${row.identity.account_id ?? ""}`)
  })

  it("lists a system's deployments / cells beneath its row", async () => {
    const { body } = capture("systems_list_v2_deployments")
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/proxy/systems") ? json(body) : json({})))
    const { SystemsView } = await import("@/components/systems-view")
    render(<SystemsView />)
    const lists = await screen.findAllByTestId("system-deployments")
    const deployments = body.systems.reduce((n: number, row: any) => n + row.deployments.length, 0)
    expect(lists.flatMap((list) => Array.from(list.querySelectorAll("li"))).length).toBe(deployments)
  })

  it("shows every part of a split / system-level row, the \"system\" ones included, and keeps the system", async () => {
    const { body } = capture("systems_list_v2_split_and_system_level")
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/proxy/systems") ? json(body) : json({})))
    const { SystemsView } = await import("@/components/systems-view")
    render(<SystemsView />)
    const items = (await screen.findAllByTestId("system-deployments")).flatMap((list) => Array.from(list.querySelectorAll("li")))
    expect(items.length).toBe(body.systems.reduce((n: number, row: any) => n + row.deployments.length, 0))
    expect(items.filter((li) => li.getAttribute("data-part-kind") === "system").length)
      .toBe(body.systems.reduce((n: number, row: any) => n + row.deployments.filter((p: any) => p.kind === "system").length, 0))
    for (const row of body.systems) expect(screen.getAllByText(row.name).length).toBeGreaterThanOrEqual(1)
  })

  it("says a newer list contract cannot be read, and lists nothing", async () => {
    const { body } = capture("systems_list_v2_two_identities_one_name")
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/proxy/systems") ? json({ ...body, contract: "systems_list_read/v3" }) : json({})))
    const { SystemsView } = await import("@/components/systems-view")
    render(<SystemsView />)
    expect(await screen.findByText(/newer backend than this page can read/)).toBeInTheDocument()
    expect(screen.queryByText(sharedNameRows(body)[0].name)).not.toBeInTheDocument()
  })
})

// ── the proxies ───────────────────────────────────────────────────────────────────────────────────────────────────

describe("the proxies carry what B5 needs", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("system-resources forwards system_key, and account_id only with a key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ resources: [] }))
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/proxy/system-resources/[systemName]/route")
    const params = Promise.resolve({ systemName: "alon prod" })
    await GET(new NextRequest("https://cyntro.example/api/proxy/system-resources/alon%20prod?system_key=k%3A1&account_id=222222222222"),
      { params })
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://backend.example/api/system-resources/alon%20prod?lite=true&system_key=k%3A1&account_id=222222222222")
    fetchMock.mockClear()
    await GET(new NextRequest("https://cyntro.example/api/proxy/system-resources/alon%20prod?account_id=222222222222"),
      { params: Promise.resolve({ systemName: "alon prod" }) })
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example/api/system-resources/alon%20prod?lite=true")
  })

  it("system-resources relays a typed 409 whole (its candidates), never flattened", async () => {
    const { status, body } = capture("system_resources_name_ambiguous_409")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body, status)))
    const { GET } = await import("@/app/api/proxy/system-resources/[systemName]/route")
    const response = await GET(new NextRequest("https://cyntro.example/api/proxy/system-resources/x"),
      { params: Promise.resolve({ systemName: "x" }) })
    expect(response.status).toBe(409)
    const relayed = await response.json()
    expect(relayed.detail).toEqual(body.detail)
    expect(ambiguousSystemCandidates(409, relayed)).not.toBeNull()
  })

  it("systems relays the list contract when the backend states one, and adds none to a v1 answer", async () => {
    const { body } = capture("systems_list_v2_two_identities_one_name")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)))
    const { GET } = await import("@/app/api/proxy/systems/route")
    const relayed = await (await GET(new NextRequest("https://cyntro.example/api/proxy/systems?customer_id=acme"))).json()
    expect(relayed.contract).toBe("systems_list_read/v2")
    vi.resetModules()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ systems: [], timestamp: "t" })))
    const { GET: GET2 } = await import("@/app/api/proxy/systems/route")
    const v1 = await (await GET2(new NextRequest("https://cyntro.example/api/proxy/systems?customer_id=acme2"))).json()
    expect("contract" in v1).toBe(false)
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
