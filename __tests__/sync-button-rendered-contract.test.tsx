/**
 * What the OPERATOR sees, rendered.
 *
 * An import chain never proves what reaches the screen, so these drive the
 * real component through the real hook against a stubbed fetch, and assert
 * on rendered text.
 *
 * Two claims are under test:
 *   1. the action is scoped to vulnerability findings, not the estate, and
 *   2. success is rendered only for a run that carries its activation receipt.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SyncFromAWSButton } from "@/components/SyncFromAWSButton"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const RECEIPT = {
  activated: true,
  projection_generation: 7,
  staging_run_id: "inspector-run-7",
  source_vector_hash: "svh",
  projected_through: "2026-09-20T12:00:00+00:00",
  projection_receipt_hash: "v1:abc",
}

/** Start returns a job; every status poll returns `status`. */
function stubSync(status: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/proxy/sync/start")) {
        return new Response(
          JSON.stringify({ success: true, job_id: "job-1", accepted: true, activated: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }),
  )
}

describe("the rendered action is scoped to what is provable", () => {
  it("does not offer an estate-wide Sync from AWS", () => {
    render(<SyncFromAWSButton />)
    const button = screen.getByRole("button")

    // Only vulnerability_findings has a receipt store. A control labelled for
    // the estate, completing on a vulnerability-only round, tells an operator
    // their whole estate was refreshed on the strength of one lane.
    expect(button.textContent).toContain("Refresh vulnerability findings")
    expect(button.textContent).not.toMatch(/sync from aws/i)
  })
})

describe("the rendered result is gated on the activation receipt", () => {
  it("renders success naming the generation when the receipt is present", async () => {
    stubSync({
      job_id: "job-1",
      status: "completed",
      state: "neptune_generation_active",
      message: "",
      activation: RECEIPT,
      results: { vulnerability_findings: { active_findings: 32, active_coverage: 17 } },
    })
    render(<SyncFromAWSButton />)
    screen.getByRole("button").click()

    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "Vulnerability findings generation 7 is active in Neptune.",
      ),
    )
    expect(document.body.textContent).not.toMatch(/NaN/)
  })

  it("does NOT render success for a completed run with no receipt", async () => {
    // The pre-receipt row, and the run that lost the pointer to a concurrent
    // projector. Both say "completed"; neither proves anything is served.
    stubSync({
      job_id: "job-1",
      status: "completed",
      state: "completed_without_activation_receipt",
      message: "",
      results: { vulnerability_findings: { active_findings: 32, active_coverage: 17 } },
    })
    render(<SyncFromAWSButton />)
    screen.getByRole("button").click()

    await waitFor(() => expect(document.body.textContent).toMatch(/no proof/i))
    expect(document.body.textContent).not.toContain("is active in Neptune")
    expect(document.body.textContent).not.toContain("32 active findings")
  })

  it("renders no percentage while the backend reports none", async () => {
    stubSync({
      job_id: "job-1",
      status: "running",
      state: "inspector_collection_and_projection",
      message: "Refreshing",
    })
    render(<SyncFromAWSButton />)
    screen.getByRole("button").click()

    await waitFor(() =>
      expect(document.body.textContent).toContain("Refreshing Inspector evidence in Neptune"),
    )
    // The regression: Math.round(undefined / 2 * 100) reached the screen.
    expect(document.body.textContent).not.toMatch(/NaN/)
    expect(document.body.textContent).not.toMatch(/\d+%/)
    expect(document.body.textContent).not.toMatch(/Step \d+\//)
  })

  it("does NOT render success when the status belongs to another run", async () => {
    stubSync({
      job_id: "a-different-run",
      status: "completed",
      state: "neptune_generation_active",
      message: "",
      activation: RECEIPT,
    })
    render(<SyncFromAWSButton />)
    screen.getByRole("button").click()

    // Binding on the run id is what stops one surface reporting another's
    // activation as its own. It reads as a transport failure, not success.
    await waitFor(() => expect(document.body.textContent).not.toContain("is active in Neptune"))
  })
})
