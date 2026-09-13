import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BusinessSystemsRanking } from "@/components/business-system/business-systems-ranking"

/**
 * Inventory completeness must be VISIBLE, not just present in the payload.
 *
 * The ranking shows only systems whose ownership the graph can verify. A
 * system whose node claims no owner and whose members are all unattributed is
 * excluded, so a shorter list is not evidence of a smaller estate. Backend
 * metadata alone does not inform anyone: if the banner is not rendered, the
 * user sees a confident-looking list and no reason to doubt it.
 *
 * The empty case is the one that matters most. "No rankable business systems"
 * reads as "this estate has none", when it can equally mean every system's
 * ownership was unverifiable.
 */

afterEach(cleanup)

const MESSAGE =
  "Only systems with verified ownership are shown. " +
  "Inventory completeness is not yet verified."

const COMPLETENESS = {
  state: "unverified",
  message: MESSAGE,
  systems_excluded_unverified_ownership: null,
  excluded_count_reason:
    "Counting systems excluded for unverified ownership would require reading " +
    "resources outside this tenant's authorized account.",
}

function mockRanked(payload: Record<string, unknown>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  }) as unknown as typeof fetch
}

const ONE_SYSTEM = {
  name: "payment-production",
  kind: "BUSINESS_SYSTEM",
  rankable: true,
  member_count: 97,
  business_tier: "MISSION_CRITICAL",
  brss_score: 71.2,
  system_rank_score: 35.6,
  top_drivers: [],
  shared_resource_drivers: [],
  href: "/business-systems?systemName=payment-production",
}

describe("ranked inventory completeness", () => {
  it("renders the banner when the list is EMPTY", async () => {
    mockRanked({
      systems: [],
      count: 0,
      positioning: "logical_blast_radius",
      inventory_completeness: COMPLETENESS,
    })

    render(<BusinessSystemsRanking />)

    await waitFor(() =>
      expect(screen.getByTestId("bsm-inventory-completeness")).toBeTruthy(),
    )
    expect(screen.getByText(MESSAGE)).toBeTruthy()
  })

  it("renders the banner when the list is POPULATED", async () => {
    mockRanked({
      systems: [ONE_SYSTEM],
      count: 1,
      positioning: "logical_blast_radius",
      inventory_completeness: COMPLETENESS,
    })

    render(<BusinessSystemsRanking />)

    await waitFor(() =>
      expect(screen.getByTestId("bsm-inventory-completeness")).toBeTruthy(),
    )
    expect(screen.getByText(MESSAGE)).toBeTruthy()
  })

  it("shows the excluded count as unknown, never as zero", async () => {
    // null is the backend's deliberate "cannot be counted without reading
    // outside the tenant boundary". Rendering it as 0 would assert that
    // nothing was excluded, which is the false reassurance this replaces.
    mockRanked({
      systems: [],
      count: 0,
      inventory_completeness: COMPLETENESS,
    })

    render(<BusinessSystemsRanking />)

    const count = await waitFor(() => screen.getByTestId("bsm-excluded-count"))
    expect(count.textContent).toContain("unknown")
    expect(count.textContent).not.toContain("0")
  })

  it("renders a real count when the backend supplies one", async () => {
    // The 'unknown' fallback must be a fallback, not a hardcoded label — if a
    // later backend can count safely, the UI has to show that number.
    mockRanked({
      systems: [],
      count: 0,
      inventory_completeness: {
        ...COMPLETENESS,
        systems_excluded_unverified_ownership: 3,
      },
    })

    render(<BusinessSystemsRanking />)

    const count = await waitFor(() => screen.getByTestId("bsm-excluded-count"))
    expect(count.textContent).toContain("3")
    expect(count.textContent).not.toContain("unknown")
  })

  it("shows NO completeness claim when the backend sends none", async () => {
    // An older backend, or the proxy's transport-failure envelope, carries no
    // completeness block. Inventing the banner there would be a claim the API
    // never made — the mock-data failure this repo forbids.
    mockRanked({ systems: [], count: 0, positioning: "logical_blast_radius" })

    render(<BusinessSystemsRanking />)

    await waitFor(() => expect(screen.getByTestId("bsm-ranking")).toBeTruthy())
    expect(screen.queryByTestId("bsm-inventory-completeness")).toBeNull()
  })
})
