/**
 * The standalone /blast-radius-map/[system] page rendered the map with NO scope, so the URL
 * builder returned null and the page never fetched (integration matrix, 2026-09-30). The page now
 * binds the operator's active Estate scope the way the attacker shell and the business-system
 * view do. Proven on the wire: with a complete scope the page fetches with all three params; with
 * an incomplete scope ("all") it fetches nothing, honestly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import * as React from "react"

const scopeState = { customerId: "testbed-webshop", accountId: "416651950952", region: "eu-west-1" }

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => scopeState,
}))

import { ScopedBlastRadiusMap } from "@/components/attack-paths-v2/scoped-blast-radius-map"

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}

describe("the standalone blast-radius page", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      verdict: { attack_paths: 0, reachable_crown_jewels: 0, source_workloads: 0 },
      zones: [], dependency_plane: [], top_paths: [], recommended_cuts: [],
    }))
    vi.stubGlobal("fetch", fetchMock)
    try { window.localStorage.clear() } catch { /* storage may be unavailable */ }
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it("fetches with the operator's full Estate scope on the wire", async () => {
    scopeState.accountId = "416651950952"
    render(<ScopedBlastRadiusMap systemName="testbed-webshop" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const urls = fetchMock.mock.calls.map((c) => String(c[0] ?? ""))
    expect(urls.some((u) => u.includes("/api/proxy/business-system/testbed-webshop/blast-radius?")
      && u.includes("customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1"))).toBe(true)
  })

  it("fetches nothing while the scope is incomplete, instead of a 503 round trip", async () => {
    scopeState.accountId = "all"
    render(<ScopedBlastRadiusMap systemName="testbed-webshop" />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const blastRadiusCalls = fetchMock.mock.calls.filter((c) => String(c[0] ?? "").includes("blast-radius"))
    expect(blastRadiusCalls).toHaveLength(0)
  })
})
