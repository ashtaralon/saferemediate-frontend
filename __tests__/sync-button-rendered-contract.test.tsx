/**
 * What the OPERATOR sees, rendered, for the CVE surface control.
 *
 * An import chain never proves what reaches the screen, so these drive the
 * real component through the real hooks against a stubbed fetch and assert on
 * rendered text and on which requests were actually issued.
 *
 * Four claims are under test:
 *   1. the control names the lane it runs, not the estate,
 *   2. it fails CLOSED — an unconnected or unknown lane does not enqueue,
 *   3. success renders only for a run carrying its activation receipt,
 *   4. no fabricated number reaches the screen.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RefreshInspectorFindingsButton } from "@/components/RefreshInspectorFindingsButton"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Click the control and let the work the click starts settle INSIDE act().
 *
 * `element.click()` dispatches outside React's act scope, so every state
 * update the real polling hook makes afterwards is reported as "An update to
 * ... was not wrapped in act(...)". Those warnings are not cosmetic here:
 * each one marks state that settled AFTER the assertion ran, which is exactly
 * the unfinished async work the negative cases below must not race.
 *
 * `@testing-library/user-event` is not a dependency of this repo, so the
 * repo-native form is `fireEvent` inside an async `act`, as
 * __tests__/system-change-queue.test.tsx already does for the same reason.
 *
 * On a DISABLED control this is also the stricter interaction: `fireEvent`
 * genuinely dispatches the event, so it is React's own dispatcher refusing to
 * run `onClick` for a disabled button that the assertion observes. A bare
 * `element.click()` is dropped by the DOM before React ever sees it.
 */
async function clickAndSettle(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element)
  })
}

const RECEIPT = {
  activated: true,
  projection_generation: 7,
  staging_run_id: "inspector-run-7",
  source_vector_hash: "svh",
  projected_through: "2026-09-20T12:00:00+00:00",
  projection_receipt_hash: "v1:abc",
}

function lanes(vulnState: string) {
  return {
    lanes: [
      { lane: "vulnerability_findings", label: "Amazon Inspector findings", state: vulnState },
      { lane: "inventory_reconcile", label: "AWS inventory", state: "NOT_CONNECTED" },
    ],
  }
}

/** Stub capabilities + start + status, and record every request. */
function stub({ capabilities, status }: { capabilities: unknown; status?: Record<string, unknown> }) {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      if (url.includes("/api/proxy/sync/capabilities")) return json(capabilities)
      if (url.includes("/api/proxy/sync/start"))
        return json({ success: true, job_id: "job-1", accepted: true, activated: false })
      return json(status ?? {})
    }),
  )
  return calls
}

const enqueued = (calls: string[]) => calls.filter((u) => u.includes("/sync/start"))

describe("the control names the lane it runs", () => {
  it("offers the Inspector-findings action, never an estate-wide sync", async () => {
    stub({ capabilities: lanes("CONNECTED") })
    render(<RefreshInspectorFindingsButton />)

    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain("Refresh Inspector findings"),
    )
    expect(screen.getByRole("button").textContent).not.toMatch(/sync from aws/i)
  })

  it("asks for its own lane by name, not a bare round", async () => {
    const calls = stub({ capabilities: lanes("CONNECTED") })
    render(<RefreshInspectorFindingsButton />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))

    await waitFor(() => expect(enqueued(calls)).toHaveLength(1))
    expect(enqueued(calls)[0]).toContain("sources=vulnerability_findings")
  })
})

describe("it fails closed", () => {
  it("does NOT enqueue when its lane is not connected", async () => {
    const calls = stub({ capabilities: lanes("NOT_CONNECTED") })
    render(<RefreshInspectorFindingsButton />)

    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))
    // Spending a real AWS collection round to discover what /capabilities
    // already said is exactly what the disabled state prevents.
    expect(enqueued(calls)).toEqual([])
  })

  it("does NOT enqueue while capabilities are UNKNOWN", async () => {
    // The lane is absent from the map entirely -> UNKNOWN -> disabled.
    const calls = stub({ capabilities: { lanes: [] } })
    render(<RefreshInspectorFindingsButton />)

    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))
    expect(enqueued(calls)).toEqual([])
  })

  it("does NOT enqueue when the capabilities call itself failed", async () => {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        return new Response("nope", { status: 500 })
      }),
    )
    render(<RefreshInspectorFindingsButton />)

    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))
    expect(enqueued(calls)).toEqual([])
  })
})

describe("success requires an activation receipt for THIS run", () => {
  it("renders success naming the generation when the receipt is present", async () => {
    stub({
      capabilities: lanes("CONNECTED"),
      status: {
        job_id: "job-1",
        status: "completed",
        state: "neptune_generation_active",
        message: "",
        activation: RECEIPT,
        results: {
          vulnerability_findings: { active_findings: 32, active_coverage: 17 },
          refreshed_sources: ["vulnerability_findings"],
        },
      },
    })
    render(<RefreshInspectorFindingsButton />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))

    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "Vulnerability findings generation 7 is active in Neptune.",
      ),
    )
    expect(document.body.textContent).not.toMatch(/NaN/)
  })

  it("does NOT render success for a completed run with no receipt", async () => {
    stub({
      capabilities: lanes("CONNECTED"),
      status: {
        job_id: "job-1",
        status: "completed",
        state: "completed_without_activation_receipt",
        message: "",
        results: { vulnerability_findings: { active_findings: 32, active_coverage: 17 } },
      },
    })
    render(<RefreshInspectorFindingsButton />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))

    await waitFor(() => expect(document.body.textContent).toMatch(/no proof/i))
    expect(document.body.textContent).not.toContain("is active in Neptune")
    expect(document.body.textContent).not.toContain("32 active findings")
  })

  it("does NOT render success when the status belongs to another run", async () => {
    stub({
      capabilities: lanes("CONNECTED"),
      status: {
        job_id: "a-different-run",
        status: "completed",
        state: "neptune_generation_active",
        message: "",
        activation: RECEIPT,
      },
    })
    render(<RefreshInspectorFindingsButton />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))

    await waitFor(() => expect(document.body.textContent).not.toContain("is active in Neptune"))
  })

  it("renders no percentage while the backend reports none", async () => {
    stub({
      capabilities: lanes("CONNECTED"),
      status: {
        job_id: "job-1",
        status: "running",
        state: "inspector_collection_and_projection",
        message: "Refreshing",
      },
    })
    render(<RefreshInspectorFindingsButton />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    await clickAndSettle(screen.getByRole("button"))

    await waitFor(() =>
      expect(document.body.textContent).toContain("Refreshing Inspector evidence in Neptune"),
    )
    expect(document.body.textContent).not.toMatch(/NaN/)
    expect(document.body.textContent).not.toMatch(/\d+%/)
    expect(document.body.textContent).not.toMatch(/Step \d+\//)
  })
})
