/// <reference types="vitest/globals" />
/**
 * End-to-end behavioral proof that every blast-radius consumer routes the
 * live Estate scope onto the wire — and that no request fires while the
 * scope is incomplete. The prior regression (P0.3, 2026-09-15) passed
 * unit-level tests of the helper because no source-text check proved the
 * ZoomMinus1 path actually reached the helper. Here each component is
 * mounted, the global `fetch` is stubbed, and the URL is inspected
 * directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import * as React from "react"

import { BlastRadiusMap } from "@/components/attack-paths-v2/blast-radius-map"
import { BlastRadiusKpiStrip } from "@/components/attack-paths-v2/blast-radius-kpi-strip"
import { BlastRadiusPlaneCuts } from "@/components/attack-paths-v2/blast-radius-plane-cuts"
import { ZoomMinus1Landing } from "@/components/attack-paths-v2/zoom-minus1-landing"

const FULL_SCOPE = {
  customerId: "testbed-webshop",
  accountId: "416651950952",
  region: "eu-west-1",
}
const EXPECTED_QS = "customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function collectFetchUrls(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map((call) => String(call[0] ?? ""))
}

describe("blast-radius consumers forward the live Estate scope", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        verdict: {
          attack_paths: 0,
          reachable_crown_jewels: 0,
          source_workloads: 0,
        },
        zones: [],
        dependency_plane: [],
        top_paths: [],
        recommended_cuts: [],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    // useCachedFetch reads/writes localStorage — reset so a prior test's
    // cache can't paint before this test's fetch resolves.
    try {
      window.localStorage.clear()
    } catch {
      // happy-dom sometimes throws on clear() before first use; ignore.
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("BlastRadiusMap sends customer_id, account_id, and region as query params", async () => {
    render(<BlastRadiusMap systemName="testbed-webshop" scope={FULL_SCOPE} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    for (const url of collectFetchUrls(fetchMock)) {
      expect(url).toContain("/api/proxy/business-system/testbed-webshop/blast-radius?")
      expect(url).toContain(EXPECTED_QS)
    }
  })

  it("BlastRadiusKpiStrip sends scope on the wire, not the raw base URL", async () => {
    render(<BlastRadiusKpiStrip systemName="testbed-webshop" scope={FULL_SCOPE} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(collectFetchUrls(fetchMock)[0]).toContain(EXPECTED_QS)
  })

  it("BlastRadiusPlaneCuts sends scope on the wire", async () => {
    render(<BlastRadiusPlaneCuts systemName="testbed-webshop" scope={FULL_SCOPE} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(collectFetchUrls(fetchMock)[0]).toContain(EXPECTED_QS)
  })

  it("ZoomMinus1Landing threads scope through to every child fetch", async () => {
    render(<ZoomMinus1Landing systemName="testbed-webshop" scope={FULL_SCOPE} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // Every child (map + kpi + plane cuts) must carry the same scope, and
    // must not fall back to a raw / partial URL.
    for (const url of collectFetchUrls(fetchMock)) {
      expect(url).toContain("/api/proxy/business-system/testbed-webshop/blast-radius?")
      expect(url).toContain(EXPECTED_QS)
    }
  })
})

describe("blast-radius consumers do not fire when scope is incomplete", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ zones: [] }))
    vi.stubGlobal("fetch", fetchMock)
    try {
      window.localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const PARTIAL_SCOPES: Array<[string, Record<string, unknown>]> = [
    ["empty scope", {}],
    ["customer only", { customerId: "acme" }],
    ["customer + account, no region", { customerId: "acme", accountId: "111111111111" }],
    ["all sentinel account", { customerId: "acme", accountId: "all", region: "eu-west-1" }],
    ["malformed region", { customerId: "acme", accountId: "111111111111", region: "us_wat" }],
  ]

  it.each(PARTIAL_SCOPES)("BlastRadiusMap makes no request under %s", async (_label, scope) => {
    render(<BlastRadiusMap systemName="payments" scope={scope} />)
    // Give the effect a tick to run; nothing must fire.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(PARTIAL_SCOPES)("ZoomMinus1Landing makes no request under %s", async (_label, scope) => {
    render(<ZoomMinus1Landing systemName="payments" scope={scope} />)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
