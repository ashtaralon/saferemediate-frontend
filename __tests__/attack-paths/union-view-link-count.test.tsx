/**
 * AP188 · CrownJewelUnionViewLink's separately fetched count ("Advanced: N paths to this jewel — view all").
 *
 * Real: the component, fetchConvergenceSummary and the reader it now consults (convergence-readiness). Stubbed: `fetch`
 * only; every summary body is CONSTRUCTED and labelled. PARTIAL is what an install's capped IAP publication always
 * serves (api/attack_paths.py _convergence_summary_from_iap_payload). Before AP188 the link printed any 200's count as
 * the whole, and a hold body (no path list) threw inside its effect.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { CrownJewelUnionViewLink } from "@/components/attack-paths-v2/crown-jewel-union-view-link"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const JEWEL = {
  id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
  severity: "HIGH", path_count: 3, highest_risk_score: 80, is_internet_exposed: false, data_classification: null,
} as CrownJewelSummary
const real = (i: number) => ({ path_id: `p${i}`, workload_arn: `arn:aws:lambda:eu-west-1:111122223333:function:f${i}`,
  damage: [], score: 1, confidence: "observed", hop_count: 0 })
const PATHS = [real(1), real(2), real(3)]
const CARD = { generation_total: 3, eligible_total: 3, returned_count: 3, drawn_count: null, excluded_count_by_reason: {},
  truncated: false }

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

async function settled(fetchMock: ReturnType<typeof vi.fn>) {
  render(<CrownJewelUnionViewLink systemName="Orders" jewel={JEWEL} />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 30))              // let the effect's promise settle
}

describe("the union-view link's count claim", () => {
  it("a whole READY answer: the established count, no partial marker", async () => {
    await settled(answer(200, { serve_state: "ACTIVE", coverage_state: "READY", paths: PATHS, cardinality: CARD }))
    const link = await screen.findByRole("link")
    expect(link).toHaveTextContent(/^Advanced: 3 paths to this jewel — view all$/)
    expect(link).not.toHaveAttribute("data-count-partial")
  })

  it.each([
    ["PARTIAL (an install's capped publication)", { serve_state: "ACTIVE", coverage_state: "PARTIAL", paths: PATHS }, "coverage partial"],
    ["a withheld reason", { coverage_state: "PARTIAL", coverage_withheld_reason: "lifecycle_held", paths: PATHS }, "coverage withheld (lifecycle_held)"],
    ["a truncated cardinality", { coverage_state: "READY", paths: PATHS, cardinality: { ...CARD, eligible_total: 9, truncated: true } }, "more paths than returned"],
    ["a malformed cardinality", { coverage_state: "READY", paths: PATHS, cardinality: { eligible_total: "bad", returned_count: 3 } }, "path cardinality unreadable"],
    ["an unknown serve state", { serve_state: "ERROR", paths: PATHS }, "serve state ERROR not recognised"],
  ])("incomplete — %s: 'listed … more may exist', the reason in the title", async (_label, body, reason) => {
    await settled(answer(200, body))
    const link = await screen.findByRole("link")
    expect(link).toHaveTextContent(/^Advanced: 3 listed paths to this jewel \(more may exist\) — view all$/)
    expect(link).toHaveAttribute("data-count-partial", reason)
    expect(link.getAttribute("title")).toContain(reason)
  })

  it.each([
    ["a 200 not_recorded hold (no path list)", 200, { semantic_status: "not_recorded", hold_reason: "JEWEL_NOT_IN_IAP_PUBLICATION" }],
    ["a typed refusal", 503, { detail: { code: "SERVING_READ_REFUSED", reason: "scope" } }],
    ["an untyped 502", 502, { detail: "bad gateway" }],
    ["NOT_READY (pathless)", 200, { serve_state: "NOT_READY" }],
    ["NOT_READY (empty list)", 200, { serve_state: "NOT_READY", paths: [] }],
    ["coverage ERROR", 200, { coverage_state: "ERROR", paths: PATHS }],
  ])("failed / held / not ready — %s: no link, no count, no thrown effect", async (_label, status, body) => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      await settled(answer(status, body))
      expect(screen.queryByRole("link")).toBeNull()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("a rejected fetch (network failure): no link and no unhandled rejection", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const fetchMock = vi.fn(async () => { throw new TypeError("network down") })
      vi.stubGlobal("fetch", fetchMock)
      await settled(fetchMock)
      expect(screen.queryByRole("link")).toBeNull()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("CONTROL: one real path (or none) keeps the established rule — no union link", async () => {
    await settled(answer(200, { coverage_state: "READY", paths: [real(1), { ...real(2), workload_arn: "" }] }))
    expect(screen.queryByRole("link")).toBeNull()
  })
})
