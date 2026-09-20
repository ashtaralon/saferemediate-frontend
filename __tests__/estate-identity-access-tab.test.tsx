/**
 * Estate · Identity & access tab — rendered.
 *
 * These render the real component against fixtures composed from the backend's
 * own projector helpers (see __tests__/fixtures/estate-identity-access.json).
 * They assert on the DOM the user sees, not on the view model, because the
 * failure this tab exists to prevent is VISUAL: a blank panel that a reader
 * takes for "there is nothing here".
 *
 * The companion suite, estate-identity-access-model.test.ts, covers the same
 * decisions at the model layer. Both are needed: the model suite proves the
 * decisions, these prove they reach the screen.
 */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EstateIdentityAccessTab } from "@/components/topology-v0-2/estate-identity-access-tab"

import fixtures from "./fixtures/estate-identity-access.json"

afterEach(cleanup)

const TOPOLOGY = {
  system: "payments-core",
  account_id: "111122223333",
  region: "us-east-1",
  vpc_id: "vpc-0abc123",
  scored_at: "2026-09-18T11:30:00Z",
  scoring_window_days: 30,
  system_kpis: null,
  nodes: [],
} as any

function renderTab(identityAccess?: unknown) {
  const payload =
    identityAccess === undefined ? TOPOLOGY : { ...TOPOLOGY, identity_access: identityAccess }
  return render(<EstateIdentityAccessTab payload={payload} />)
}

function panel() {
  return screen.getByTestId("estate-identity-access")
}

describe("the tab never renders a blank panel", () => {
  it("issues no request of its own — the block rides on the estate payload", () => {
    const fetchSpy = vi.fn()
    const original = globalThis.fetch
    globalThis.fetch = fetchSpy as any
    try {
      renderTab(fixtures.ready)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
    }
  })

  it.each([
    ["absent", undefined],
    ["invalid", "not-an-object"],
    ["unavailable", fixtures.unavailable],
    ["ready", fixtures.ready],
  ])("state %s still shows a headline and an explanation", (state, block) => {
    renderTab(block)
    expect(panel()).toHaveAttribute("data-state", state)
    expect(screen.getByTestId("identity-headline").textContent!.length).toBeGreaterThan(20)
    expect(screen.getByTestId("identity-detail").textContent!.length).toBeGreaterThan(20)
  })

  it("a snapshot with no identity block does not read as zero roles", () => {
    renderTab()
    const headline = screen.getByTestId("identity-headline").textContent!
    expect(headline).toMatch(/no identity projection/i)
    expect(headline).not.toMatch(/no workload/i)
    expect(screen.getByTestId("identity-detail").textContent).toMatch(
      /estate projection worker/i,
    )
    // Nothing that would read as data.
    expect(screen.queryByTestId("identity-graph")).toBeNull()
    expect(screen.queryByTestId("identity-empty-authoritative")).toBeNull()
  })

  it("an unavailable projection renders every gap code on screen", () => {
    renderTab(fixtures.unavailable)
    const codes = screen
      .getAllByTestId("identity-gap")
      .map(node => node.getAttribute("data-gap-code"))
    expect(codes).toContain("ACTIVE_DECISION_POINTER_MISSING")
    expect(codes).toContain("VISIBLE_WORKLOAD_UNRESOLVED")
    expect(screen.queryByTestId("identity-graph")).toBeNull()
  })

  it("empty-authoritative renders as an ANSWER, not as an unavailable state", () => {
    renderTab(fixtures.empty_authoritative)
    expect(panel()).toHaveAttribute("data-state", "ready")
    const box = screen.getByTestId("identity-empty-authoritative")
    expect(box.textContent).toMatch(/is an answer, not a missing read/i)
    expect(screen.queryByTestId("identity-gap")).toBeNull()
    // The generation it was read from is still on screen.
    expect(screen.getAllByTestId("identity-receipt").length).toBe(2)
  })
})

describe("workload → role → decision is on screen", () => {
  it("renders one row per role, each naming its workloads", () => {
    renderTab(fixtures.ready)
    const rows = screen.getAllByTestId("identity-graph-row")
    expect(rows.length).toBe(1)
    expect(rows[0]).toHaveAttribute("data-role-id", "AROAEXAMPLEPAYMENTS1")
    const workloads = within(rows[0])
      .getAllByTestId("identity-workload")
      .map(node => node.textContent)
    expect(workloads.some(text => text!.includes("i-0aa11bb22cc33dd44"))).toBe(true)
    expect(workloads.some(text => text!.includes("payments-settlement"))).toBe(true)
  })

  it("shows configured and observed counts under separate plane labels", () => {
    renderTab(fixtures.ready)
    expect(screen.getByTestId("identity-configured-count").textContent).toMatch(/3/)
    const observed = screen.getByTestId("identity-observed-counts").textContent!
    expect(observed).toMatch(/1\s*used/)
    expect(observed).toMatch(/1\s*denied-only/)
    expect(observed).toMatch(/1\s*not observed/)
  })

  it("a withheld decision shows no counts and says zero is not what it means", () => {
    renderTab(fixtures.partial)
    const rows = screen.getAllByTestId("identity-graph-row")
    const withheld = rows.find(
      row => row.getAttribute("data-role-id") === "AROAEXAMPLELEDGER002",
    )!
    const decision = within(withheld).getByTestId("identity-decision")
    expect(decision).toHaveAttribute("data-decision-state", "unavailable")
    expect(decision.textContent).toMatch(/That is not zero/i)
    expect(within(withheld).queryByTestId("identity-configured-count")).toBeNull()
    expect(within(withheld).queryByTestId("identity-observed-counts")).toBeNull()
    expect(
      within(withheld)
        .getAllByTestId("identity-gap")
        .map(node => node.getAttribute("data-gap-code")),
    ).toEqual(["ROLE_DECISION_UNIVERSE_INCOMPLETE"])
  })

  it("labels the decision hop observed only where observed evidence was read", () => {
    renderTab(fixtures.partial)
    const rows = screen.getAllByTestId("identity-graph-row")
    const planeOf = (roleId: string) =>
      within(rows.find(row => row.getAttribute("data-role-id") === roleId)!)
        .getByTestId("identity-decision-plane")
        .textContent!.trim()
    expect(planeOf("AROAEXAMPLEPAYMENTS1")).toBe("observed")
    expect(planeOf("AROAEXAMPLELEDGER002")).toBe("configured")
  })

  it("never renders an effective allow or deny", () => {
    renderTab(fixtures.ready)
    const text = screen.getByTestId("identity-effective-authorization").textContent!
    expect(text).toMatch(/Effective authorization: unavailable/)
    expect(text).toMatch(/does not compute whether a call would be allowed/i)
    expect(panel().textContent).not.toMatch(/effective allow/i)
  })

  it("surfaces truncation and unresolved omissions instead of hiding them", () => {
    renderTab({
      ...fixtures.ready,
      roles_total: 140,
      roles_truncated: true,
      roles_omitted_unresolved: 4,
    })
    expect(screen.getByTestId("identity-roles-counts").textContent).toMatch(/1 shown of 140/)
    expect(screen.getByTestId("identity-roles-truncated")).toBeInTheDocument()
    expect(screen.getByTestId("identity-roles-omitted").textContent).toMatch(/4 omitted/)
  })
})

describe("the capability matrix is on screen in every state", () => {
  it("renders all fifteen families with a status each", () => {
    renderTab(fixtures.ready)
    const rows = screen.getAllByTestId("identity-capability-row")
    expect(rows.length).toBe(15)
    const available = rows.filter(row => row.getAttribute("data-status") === "available")
    expect(available.map(row => row.getAttribute("data-family")).sort()).toEqual([
      "ROLE_ACTION_DECISION",
      "WORKLOAD_USES_ROLE",
    ])
  })

  it("shows no plane chip for an unavailable family", () => {
    renderTab(fixtures.ready)
    const dataAccess = screen
      .getAllByTestId("identity-capability-row")
      .find(row => row.getAttribute("data-family") === "DATA_ACCESS")!
    expect(dataAccess).toHaveAttribute("data-status", "unavailable")
    expect(within(dataAccess).getByTestId("identity-plane-none")).toBeInTheDocument()
    expect(within(dataAccess).queryByTestId("identity-plane")).toBeNull()
    expect(
      within(dataAccess)
        .getAllByTestId("identity-capability-reason")
        .map(node => node.textContent),
    ).toContain("ASSET_ANCHORED_AUTHORITY_ONLY")
  })

  it("survives the unavailable state, where a reader most needs it", () => {
    renderTab(fixtures.unavailable)
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(15)
  })

  it("a payload with no matrix says why, and renders no family rows", () => {
    const { relationship_capabilities, ...withoutMatrix } = fixtures.ready as any
    renderTab(withoutMatrix)
    expect(screen.queryAllByTestId("identity-capability-row").length).toBe(0)
    expect(screen.getByTestId("identity-capability-unavailable").textContent).toMatch(
      /not empty/i,
    )
  })
})

describe("scope, tenant and receipt binding", () => {
  it("marks the cross-checked fields verified and customer_id echoed-only", () => {
    renderTab(fixtures.ready)
    const verified = screen
      .getAllByTestId("identity-scope-verified")
      .map(node => node.textContent!)
    expect(verified.some(text => text.includes("account_id ✓ 111122223333"))).toBe(true)
    expect(verified.some(text => text.includes("system_name ✓ payments-core"))).toBe(true)
    const echoed = screen.getAllByTestId("identity-scope-echoed").map(node => node.textContent!)
    expect(echoed.some(text => text.includes("customer_id") && text.includes("not checked"))).toBe(
      true,
    )
  })

  it("withholds tenant data when the block was built for a different account", () => {
    renderTab({
      ...fixtures.ready,
      scope: { ...fixtures.ready.scope, account_id: "999988887777" },
    })
    expect(panel()).toHaveAttribute("data-state", "scope_mismatch")
    expect(screen.queryByTestId("identity-graph")).toBeNull()
    expect(screen.getByTestId("identity-scope-mismatch").textContent).toMatch(/999988887777/)
    // The matrix describes the data path, not the tenant, so it stays.
    expect(screen.getAllByTestId("identity-capability-row").length).toBe(15)
  })

  it("shows the generation and receipt hash for both authorities", () => {
    renderTab(fixtures.ready)
    const receipts = screen.getAllByTestId("identity-receipt")
    expect(receipts.length).toBe(2)
    for (const receipt of receipts) {
      expect(within(receipt).getByTestId("identity-receipt-generation").textContent).toBe("41")
      expect(
        within(receipt).getByTestId("identity-receipt-hash").textContent!.length,
      ).toBe(64)
    }
    // Read from the fixture, not retyped: these scope names are backend
    // constants, and a test that hardcodes them stops tracking them.
    expect(
      receipts.map(node => node.getAttribute("data-receipt-scope")).sort(),
    ).toEqual(
      [
        fixtures.ready.inventory_authority.projection_scope,
        fixtures.ready.decision_authority.projection_scope,
      ].sort(),
    )
  })

  it("says plainly when no authority was read at all", () => {
    renderTab({ ...fixtures.unavailable, inventory_authority: null, decision_authority: null })
    expect(screen.getByTestId("identity-receipts-none").textContent).toMatch(
      /no generation or receipt to show/i,
    )
  })
})
