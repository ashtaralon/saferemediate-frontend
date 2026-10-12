/**
 * S0 F31 (Codex installed QA, SW-20261013-01): the Systems list shows each authored Criticality tier as itself.
 *
 * The seven tiers are the ones the declarations view serves (__tests__/fixtures/system-boundary/view_after_save.json,
 * limits.criticalities). Each answer is the REAL v2 Systems list capture (systems-list-captures/systems_list_v2_deployments.json,
 * from tests/cyntro_data/test_systems_b5_identity.py) with its row's ``criticality`` / ``businessCriticality`` set to one tier,
 * as an authored row carries its System's declared tier (api/systems.py _with_authored_attributes) -- an edit of a real
 * capture, never a hand-written row. Ranking and colour may share buckets; the words may not.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/* eslint-disable @typescript-eslint/no-explicit-any -- a capture's body is untyped JSON */
const fixture = (path: string): any => JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", path), "utf8"))
const TIERS: string[] = fixture("system-boundary/view_after_save.json").body.limits.criticalities
const LIST = fixture("systems-list-captures/systems_list_v2_deployments.json").body

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

function withTier(tier: string | null) {
  const body = structuredClone(LIST)
  for (const row of body.systems) Object.assign(row, { criticality: tier, businessCriticality: tier })
  return body
}

function serve(answer: Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
    String(input).startsWith("/api/proxy/systems") ? answer : new Response("{}", { status: 200 })))
}

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }))

/** The "Business Criticality" cell of the row naming ``name``. */
async function criticalityOf(name: string): Promise<string> {
  await screen.findAllByText(name)
  const headers = screen.getAllByRole("columnheader")
  const column = headers.findIndex((th) => th.textContent === "Business Criticality")
  expect(column).toBeGreaterThanOrEqual(0)
  const row = screen.getAllByRole("row").slice(1).find((r) => r.querySelectorAll("td")[0]?.textContent?.includes(name))
  return row!.querySelectorAll("td")[column].textContent ?? ""
}

describe("F31: the Systems list keeps the seven authored Criticality tiers", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("serves exactly seven tiers to choose from", () => {
    expect(TIERS).toHaveLength(7)
  })

  it.each(TIERS)("%s is shown as itself, and again from this browser's copy after a reload", async (tier) => {
    const { SystemsView } = await import("@/components/systems-view")
    const name = LIST.systems[0].name
    serve(ok(withTier(tier)))
    render(<SystemsView />)
    expect(await criticalityOf(name)).toBe(tier)
    cleanup()
    serve(new Promise<Response>(() => undefined))                       // reloaded: the fresh answer has not come yet
    render(<SystemsView />)
    expect(await criticalityOf(name)).toBe(tier)
  })

  it("a legacy tier is shown as the backend sent it, and an absent one as not classified", async () => {
    const { SystemsView } = await import("@/components/systems-view")
    const name = LIST.systems[0].name
    serve(ok(withTier("HIGH")))
    render(<SystemsView />)
    expect(await criticalityOf(name)).toBe("HIGH")
    cleanup()
    localStorage.clear()
    serve(ok(withTier(null)))
    render(<SystemsView />)
    expect(await criticalityOf(name)).toBe("Not classified")
  })
})
