/**
 * T10 S1, mounted: one system per catalogue row, the URL tuple as its carrier, and no value or link attributed to an account
 * it was not computed for. Agreed: agent-coordinator/claude-onboarding-t10-corrected-concurrence-2026-10-05.txt with Codex's
 * S1 refinements (codex-onboarding-t10-implementation-decision-2026-10-05.txt).
 *
 * Every backend answer is a real producer capture (see each fixture's _provenance): the catalogue is the backend's T10 S2
 * golden (checkout served by 123456789012 with 3 resources and by 222222222222 with 5), served as the backend serves a
 * narrowed scope -- the rows of that account only; with-families is the real all-systems handler's answer per scope.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import golden from "./fixtures/systems-catalog-checkout-3-5.json"
import families from "./fixtures/systems-with-families.json"

const nav = vi.hoisted(() => ({
  search: new URLSearchParams(),
  pathname: "/services",
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.search,
}))

vi.mock("@/components/dependency-map/graph-view-v2", () => ({
  default: ({ systemName }: { systemName: string }) => <div data-testid="graph">graph:{systemName}</div>,
}))

import { SystemGuard } from "@/components/system-guard"
import { DenseSystemsTable } from "@/components/dashboard/dense/dense-systems-table"
import { TopSystemsCard } from "@/components/dashboard/v3/top-systems-card"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { SharedResourcesListView } from "@/components/shared-resources/shared-resources-list-view"
import DependencyMapPage from "@/app/dependency-map/page"
import { AccountScopeProvider, useAccountScope } from "@/lib/account-scope-context"
import { SystemProvider } from "@/lib/system-context"

type Row = Record<string, unknown> & { catalog_identity: Record<string, unknown> & { account_id: string } }
const CATALOGUE = (golden as unknown as { answer: { systems: Row[] } }).answer
const FAMILIES = (families as unknown as { answers: Record<string, unknown> }).answers
const A = "123456789012"
const B = "222222222222"

let accounts: string[] = [A, B]
let catalogueRows: Row[] = CATALOGUE.systems
let catalogueStatus = 200
let familiesGate: Promise<void> | null = null
let catalogueGate: Promise<void> | null = null
const calls: string[] = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function setUrl(pathname: string, query: string) {
  nav.pathname = pathname
  for (const key of Array.from(nav.search.keys())) nav.search.delete(key)
  new URLSearchParams(query).forEach((value, key) => nav.search.set(key, value))
  window.history.replaceState({}, "", `${pathname}${query ? `?${query}` : ""}`)
}

beforeEach(() => {
  accounts = [A, B]
  catalogueRows = CATALOGUE.systems
  catalogueStatus = 200
  familiesGate = null
  catalogueGate = null
  calls.length = 0
  window.localStorage.clear()
  nav.replace.mockReset()
  nav.replace.mockImplementation((url: string) => {
    const [path, query = ""] = url.split("?")
    setUrl(path, query)
  })
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://cyntro.local")
    calls.push(`${url.pathname}${url.search}`)
    if (url.pathname === "/api/proxy/admin/customers") return json([{ customer_id: "acme", display_name: "Acme" }])
    if (url.pathname === "/api/proxy/admin/accounts/scope/options/all") {
      return json({
        customer_id: "acme",
        accounts: accounts.map((id) => ({ account_id: id, display_name: id, regions: ["eu-west-1"], group_ids: [], status: "active" })),
        groups: [],
      })
    }
    if (url.pathname === "/api/proxy/systems") {
      if (catalogueGate && url.searchParams.get("account_id") === B) await catalogueGate
      if (catalogueStatus !== 200) return json({ error: "unavailable" }, catalogueStatus)
      const account = url.searchParams.get("account_id")
      const rows = account ? catalogueRows.filter((row) => row.catalog_identity.account_id === account) : catalogueRows
      return json({ ...CATALOGUE, systems: rows })
    }
    if (url.pathname === "/api/proxy/systems/with-families") {
      if (familiesGate) await familiesGate
      return json(FAMILIES[url.searchParams.get("account_id") ?? "all"])
    }
    if (url.pathname === "/api/proxy/iam/shared-roles") return json({ shared_roles: [] })
    if (url.pathname === "/api/proxy/sg/shared-sgs") return json({ shared_sgs: [] })
    return json({ error: "not found" }, 404)
  }))
})

afterEach(() => vi.unstubAllGlobals())

function mount(ui: React.ReactNode) {
  return render(
    <SystemProvider>
      <AccountScopeProvider>{ui}</AccountScopeProvider>
    </SystemProvider>,
  )
}

const Page = () => <div data-testid="system-page">system page</div>

function catalogueCalls() {
  return calls.filter((call) => call.startsWith("/api/proxy/systems?"))
}

// ── the guard ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("SystemGuard", () => {
  it("a label two accounts serve shows the chooser, each account linked with its full tuple, never the first", async () => {
    setUrl("/services", "system=checkout&customer_id=acme")
    mount(<SystemGuard><Page /></SystemGuard>)
    const list = await screen.findByRole("list", { name: "Accounts serving this system" })
    const links = within(list).getAllByRole("link")
    expect(links.map((link) => Object.fromEntries(new URL(link.getAttribute("href")!, "http://x").searchParams))).toEqual([
      { system: "checkout", customer_id: "acme", account_id: A, region: "eu-west-1" },
      { system: "checkout", customer_id: "acme", account_id: B, region: "eu-west-1" },
    ])
    expect(screen.queryByTestId("system-page")).not.toBeInTheDocument()
  })

  it("the URL tuple opens exactly that account, over a different stored scope, on a fresh or a bookmarked load", async () => {
    for (const stored of [null, { customerId: "acme", groupId: "all", accountId: A, region: "all" }]) {
      window.localStorage.clear()
      if (stored) window.localStorage.setItem("cyntro-product-scope", JSON.stringify(stored))
      calls.length = 0
      setUrl("/services", `system=checkout&customer_id=acme&account_id=${B}&region=eu-west-1`)
      const view = mount(<SystemGuard><Page /></SystemGuard>)
      expect(await screen.findByTestId("system-page")).toBeInTheDocument()
      expect(catalogueCalls().every((call) => call.includes(`account_id=${B}`))).toBe(true)
      view.unmount()
    }
  })

  it("renders nothing dependent while the catalogue loads, and says so when it cannot be read", async () => {
    catalogueStatus = 503
    setUrl("/services", "system=checkout&customer_id=acme")
    mount(<SystemGuard><Page /></SystemGuard>)
    expect(screen.getByRole("status")).toHaveTextContent("Resolving system")
    expect(await screen.findByText("Systems catalogue unavailable")).toBeInTheDocument()
    expect(screen.queryByTestId("system-page")).not.toBeInTheDocument()
  })

  it("a row whose identity cannot be verified is never opened", async () => {
    const [first] = CATALOGUE.systems
    catalogueRows = [{ ...first, catalog_identity: { ...first.catalog_identity, version: 9 } }]
    setUrl("/services", "system=checkout&customer_id=acme")
    mount(<SystemGuard><Page /></SystemGuard>)
    expect(await screen.findByText("System identity unavailable")).toBeInTheDocument()
    expect(screen.queryByTestId("system-page")).not.toBeInTheDocument()
  })

  it("an account removed and healed out of the URL is NOT_FOUND, never the other account that now serves the label alone", async () => {
    accounts = [B]
    catalogueRows = CATALOGUE.systems.filter((row) => row.catalog_identity.account_id === B)
    setUrl("/services", `system=checkout&customer_id=acme&account_id=${A}&region=eu-west-1`)
    mount(<SystemGuard><Page /></SystemGuard>)
    await waitFor(() => expect(nav.search.get("account_id")).toBeNull())        // the provider healed the scope to "all"
    expect(await screen.findByText("System not found in this scope")).toBeInTheDocument()
    expect(screen.queryByTestId("system-page")).not.toBeInTheDocument()
  })

  it("after a switch, the label is judged only on the NEW scope's catalogue: resolving until it answers", async () => {
    setUrl("/services", `system=checkout&customer_id=acme&account_id=${A}&region=eu-west-1`)
    function Switch() {
      const scope = useAccountScope()
      return <button type="button" onClick={() => scope.setAccountId(B)}>switch</button>
    }
    mount(<><Switch /><SystemGuard><Page /></SystemGuard></>)
    expect(await screen.findByTestId("system-page")).toBeInTheDocument()
    let release!: () => void
    catalogueGate = new Promise<void>((resolve) => { release = resolve })
    fireEvent.click(screen.getByRole("button", { name: "switch" }))
    await waitFor(() => expect(catalogueCalls().at(-1)).toContain(`account_id=${B}`))
    expect(screen.getByRole("status")).toHaveTextContent("Resolving system")
    expect(screen.queryByText("System not found in this scope")).not.toBeInTheDocument()
    expect(screen.queryByTestId("system-page")).not.toBeInTheDocument()
    release()
    expect(await screen.findByTestId("system-page")).toBeInTheDocument()
  })

  it("an explicit account switch re-resolves the label against the new scope: no row there is NOT_FOUND", async () => {
    const C = "333333333333"
    accounts = [A, C]
    setUrl("/services", `system=checkout&customer_id=acme&account_id=${A}&region=eu-west-1`)
    function Switch() {
      const scope = useAccountScope()
      return <button type="button" onClick={() => scope.setAccountId(C)}>switch</button>
    }
    mount(<><Switch /><SystemGuard><Page /></SystemGuard></>)
    expect(await screen.findByTestId("system-page")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "switch" }))
    expect(await screen.findByText("System not found in this scope")).toBeInTheDocument()
    expect(catalogueCalls().at(-1)).toContain(`account_id=${C}`)
  })
})

// ── the three callers that used to fall back to the first system ───────────────────────────────────────────────────

describe("no ambiguity-to-first fallback", () => {
  it("the dependency map asks which account instead of drawing the first", async () => {
    setUrl("/dependency-map", "system=checkout&customer_id=acme")
    mount(<DependencyMapPage />)
    expect(await screen.findByText("Choose an account")).toBeInTheDocument()
    expect(screen.queryByTestId("graph")).not.toBeInTheDocument()
  })

  it("the dependency map with no request opens no repeated label by default", async () => {
    setUrl("/dependency-map", "customer_id=acme")
    mount(<DependencyMapPage />)
    expect(await screen.findByText("No system available")).toBeInTheDocument()
    expect(screen.queryByTestId("graph")).not.toBeInTheDocument()
  })

  it("the dependency map draws exactly the account the URL names", async () => {
    setUrl("/dependency-map", `system=checkout&customer_id=acme&account_id=${A}&region=eu-west-1`)
    mount(<DependencyMapPage />)
    expect(await screen.findByTestId("graph")).toHaveTextContent("graph:checkout")
  })

  it("the sidebar counts nothing for a label two accounts serve", async () => {
    setUrl("/", "system=checkout&customer_id=acme")
    mount(<LeftSidebarNav />)
    await waitFor(() => expect(catalogueCalls().length).toBeGreaterThan(0))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    expect(calls.some((call) => call.startsWith("/api/proxy/iam/shared-roles"))).toBe(false)
  })

  it("shared resources asks which account instead of mapping the first, and reads no shared control", async () => {
    setUrl("/shared-resources", "system=checkout&customer_id=acme")
    mount(<SharedResourcesListView />)
    expect(await screen.findByText("Choose an account")).toBeInTheDocument()
    expect(calls.some((call) => call.startsWith("/api/proxy/iam/shared-roles"))).toBe(false)
  })
})

// ── the two cards ─────────────────────────────────────────────────────────────────────────────────────────────────────

function cardRow(name: string) {
  return screen.getAllByText(name)[0].closest("tr") as HTMLElement
}

describe("dashboard cards", () => {
  it("under all accounts the dense table links checkout to the chooser and withholds its graph values", async () => {
    setUrl("/", "customer_id=acme")
    mount(<DenseSystemsTable />)
    await screen.findByText("checkout")
    const row = cardRow("checkout")
    expect(within(row).getByRole("link", { name: "checkout" })).toHaveAttribute("href", "/?system=checkout")
    expect(row.querySelector("[data-attributable]")).toHaveAttribute("data-attributable", "false")
    expect(within(row).queryByText("3")).not.toBeInTheDocument()
  })

  it("narrowed to the account and region it was computed for, the dense table shows its values and the full tuple", async () => {
    setUrl("/", `customer_id=acme&account_id=${A}&region=eu-west-1`)
    mount(<DenseSystemsTable />)
    await screen.findByText("checkout")
    const row = cardRow("checkout")
    const href = within(row).getByRole("link", { name: "checkout" }).getAttribute("href")!
    expect(Object.fromEntries(new URL(href, "http://x").searchParams)).toEqual({
      system: "checkout", customer_id: "acme", account_id: A, region: "eu-west-1",
    })
    expect(row.querySelector("[data-attributable]")).toHaveAttribute("data-attributable", "true")
    expect(within(row).getByText("3")).toBeInTheDocument()
  })

  it("after a scope change, a previous scope's values never appear under the new one", async () => {
    setUrl("/", `customer_id=acme&account_id=${A}&region=eu-west-1`)
    function Widen() {
      const scope = useAccountScope()
      return <button type="button" onClick={() => scope.setAccountId("all")}>widen</button>
    }
    mount(<><Widen /><DenseSystemsTable /></>)
    await screen.findByText("3")
    let release!: () => void
    familiesGate = new Promise<void>((resolve) => { release = resolve })
    fireEvent.click(screen.getByRole("button", { name: "widen" }))
    await waitFor(() => expect(calls.some((call) => call.startsWith("/api/proxy/systems/with-families?") && !call.includes("account_id"))).toBe(true))
    expect(document.querySelector('[data-attributable="true"]')).toBeNull()
    release()
    await waitFor(() => expect(document.querySelector('[data-attributable="false"]')).not.toBeNull())
    expect(document.querySelector('[data-attributable="true"]')).toBeNull()
  })

  it("the top-systems card withholds score and mix under all accounts and shows them for the exact scope", async () => {
    setUrl("/", "customer_id=acme")
    const wide = mount(<TopSystemsCard />)
    await screen.findByText("checkout")
    expect(cardRow("checkout").querySelector("[data-attributable]")).toHaveAttribute("data-attributable", "false")
    expect(within(cardRow("checkout")).getByRole("link", { name: "checkout" })).toHaveAttribute("href", "/systems?systemName=checkout")
    wide.unmount()

    window.localStorage.clear()
    setUrl("/", `customer_id=acme&account_id=${A}&region=eu-west-1`)
    mount(<TopSystemsCard />)
    await screen.findByText("checkout")
    const row = cardRow("checkout")
    expect(row.querySelector("[data-attributable]")).toHaveAttribute("data-attributable", "true")
    expect(within(row).getByRole("link", { name: "checkout" }).getAttribute("href"))
      .toBe(`/systems?systemName=checkout&customer_id=acme&account_id=${A}&region=eu-west-1`)
  })
})
