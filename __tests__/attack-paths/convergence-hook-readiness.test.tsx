/**
 * AP188 / AP189 · the MOUNTED useCrownJewelConvergence hook over by-crown-jewel summary answers that are not a plain
 * list: a pathless NOT_READY (serve or coverage state), a valid NOT_READY with an empty list (control), a 200 hold,
 * and a READY list (control).
 *
 * Real: the hook, its summary-to-convergence merge (mergeSummaryWithPathDetails) and the reader it consults
 * (convergence-readiness). Stubbed: `fetch` only; every body is CONSTRUCTED and labelled. Before AP189 a pathless
 * NOT_READY answer was stored and the merge threw "Cannot read properties of undefined (reading 'map')".
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { readConvergencePaths } from "@/lib/attack-paths/convergence-readiness"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const JEWEL = {
  id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
  severity: "HIGH", path_count: 2, highest_risk_score: 80, is_internet_exposed: false, data_classification: null,
  target_state: "observed",
} as CrownJewelSummary
const PATH = { path_id: "p1", workload_arn: "arn:aws:lambda:eu-west-1:111122223333:function:f", damage: [], score: 1,
  confidence: "observed", hop_count: 0 }

function serveSummary(body: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    const json = url.includes("/by-crown-jewel/summary") ? body : { detail: "not stubbed" }
    return new Response(JSON.stringify(json), {
      status: url.includes("/by-crown-jewel/summary") ? 200 : 502, headers: { "content-type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("useCrownJewelConvergence keeps NOT_READY as NOT_READY and never maps a missing list (AP189)", () => {
  it.each([
    ["serve_state NOT_READY, pathless", { system: "Orders", serve_state: "NOT_READY" }],
    ["coverage_state NOT_READY, pathless", { system: "Orders", coverage_state: "NOT_READY" }],
    ["CONTROL: a valid NOT_READY with an empty list", { system: "Orders", serve_state: "NOT_READY", coverage_state: "NOT_READY", paths: [] }],
  ])("%s: stored with an empty list, read as not ready, no throw", async (_label, body) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
    serveSummary(body)
    const { result } = renderHook(() => useCrownJewelConvergence("Orders", JEWEL))
    await waitFor(() => expect(result.current.data).not.toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.data?.paths).toEqual([])
    expect(readConvergencePaths(result.current.data)).toEqual({ kind: "not_ready" })   // never a zero
    expect(errors.mock.calls.map((c) => String(c[0])).join("\n")).not.toMatch(/reading 'map'/)
  })

  it("a 200 hold is not a summary: no data, the hold named, and (AP201 M4) not retried as a cold backend", async () => {
    serveSummary({ semantic_status: "not_recorded", hold_reason: "JEWEL_NOT_IN_IAP_PUBLICATION" })
    const { result } = renderHook(() => useCrownJewelConvergence("Orders", JEWEL))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.data).toBeNull()
    expect(result.current.error).toMatch(/Not recorded yet — JEWEL_NOT_IN_IAP_PUBLICATION/)
    // AP188 asserted the failure path's retrying=true here. A typed hold is the backend's answer about right now
    // (the rule use-cached-fetch already applies: "a typed refusal is an answer, not a blip"), so it is final.
    expect(result.current.retrying).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it("CONTROL: a READY list is stored and merged as before", async () => {
    serveSummary({ system: "Orders", serve_state: "ACTIVE", coverage_state: "READY", paths_total: 1, observed_paths: 1,
      choke_points: {}, paths: [PATH] })
    const { result } = renderHook(() => useCrownJewelConvergence("Orders", JEWEL))
    await waitFor(() => expect(result.current.data?.paths?.length).toBe(1))
    expect(result.current.error).toBeNull()
    expect(readConvergencePaths(result.current.data)).toMatchObject({ kind: "paths", partial: null })
  })
})
