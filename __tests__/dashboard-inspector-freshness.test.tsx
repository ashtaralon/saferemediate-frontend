/**
 * A vulnerability-only refresh may not claim the system dashboard is fresh.
 *
 * This is the transitive defect a direct-hook census cannot see. The CVE
 * control is correctly single-lane; the bug was its CALL SITE — a broad
 * system dashboard that took the completion and wrote
 * `setLastSyncedAt(new Date().toISOString())`, rendered as a generic
 * "Last sync". Rule 1 of lib/sync-surfaces.ts, verbatim:
 *
 *   "Identities used to call setLastSync(new Date()) — the BROWSER's clock —
 *    whenever a round completed, painting a green 'Synced' for IAM evidence
 *    an Inspector-only round never collected."
 *
 * The dashboard renders inventory, behavioral, dependency, least-privilege
 * and attack-path sections. Only vulnerability_findings is CONNECTED, so no
 * truthful aggregate freshness exists for it — and none is invented here.
 *
 * These drive the real control with the real hook and assert on rendered
 * text, because the previous guards were structural and missed exactly this.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RefreshInspectorFindingsButton } from "@/components/RefreshInspectorFindingsButton"
import {
  InspectorFreshnessNote,
  useInspectorFreshness,
} from "@/components/system-detail/inspector-freshness"

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

const CAPS = {
  lanes: [
    { lane: "vulnerability_findings", label: "Amazon Inspector findings", state: "CONNECTED" },
    { lane: "inventory_reconcile", label: "AWS inventory", state: "NOT_CONNECTED" },
    { lane: "api_activity", label: "CloudTrail API activity", state: "NOT_CONNECTED" },
    { lane: "network_flow", label: "VPC network flow", state: "NOT_CONNECTED" },
  ],
}

function stub(status: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const json = (b: unknown) =>
        new Response(JSON.stringify(b), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      if (url.includes("/sync/capabilities")) return json(CAPS)
      if (url.includes("/sync/start"))
        return json({ success: true, job_id: "job-1", accepted: true, activated: false })
      return json(status)
    }),
  )
}

/**
 * The REAL production owner, not a copy of it.
 *
 * `useInspectorFreshness` and `InspectorFreshnessNote` are the exact modules
 * components/system-detail-dashboard.tsx imports and renders; this harness
 * only supplies the surrounding markup the dashboard cannot be asked to
 * render here. An earlier version of this file declared its own state and
 * its own label and wired them the way the dashboard does -- a double
 * proving itself, which would have stayed green while the dashboard
 * regressed. The structural guard additionally pins that the dashboard uses
 * these exports and nothing else.
 */
function DashboardHeader() {
  const { inspectorRefreshedAt, refreshKey, onRefreshed } = useInspectorFreshness()
  return (
    <div>
      <p>
        AWS eu-west-1
        <InspectorFreshnessNote at={inspectorRefreshedAt} />
      </p>
      {/* The tab remount key, exposed so a test can assert it does not churn
          after a round the cve surface cannot prove refreshed anything. */}
      <span data-testid="refresh-key">{refreshKey}</span>
      <RefreshInspectorFindingsButton onRefreshed={onRefreshed} />
    </div>
  )
}


/**
 * Wait for a TERMINAL outcome from the real hook before asserting absence.
 *
 * Every negative case below previously waited for the static "AWS eu-west-1"
 * header text, which is present before the click. `waitFor` resolved
 * immediately, so "no timestamp" and "refresh key is 0" were asserted while
 * polling was still in flight -- they would have passed even if `onRefreshed`
 * mutated state a tick later. Asserting an absence is only meaningful once
 * the thing that could have produced it has finished.
 *
 * The button renders one of two terminal strings for a completed run: the
 * success message (activated, receipt accepted) or the "no proof" refusal.
 * Both come from the real component, not from this test.
 */
async function terminalOutcome(): Promise<"success" | "refused"> {
  await waitFor(
    () => {
      const text = document.body.textContent ?? ""
      expect(/is active in Neptune|no proof/i.test(text)).toBe(true)
    },
    { timeout: 3000 },
  )
  return /is active in Neptune/.test(document.body.textContent ?? "")
    ? "success"
    : "refused"
}

const COMPLETED_WITH_RECEIPT = {
  job_id: "job-1",
  status: "completed",
  state: "neptune_generation_active",
  message: "",
  completed_at: "2026-09-20T07:01:00+00:00",
  activation: RECEIPT,
  results: {
    vulnerability_findings: { active_findings: 32, active_coverage: 17 },
    refreshed_sources: ["vulnerability_findings"],
  },
}

describe("a vulnerability refresh never claims whole-dashboard freshness", () => {
  it("renders NO generic 'Last sync' after a successful Inspector round", async () => {
    stub(COMPLETED_WITH_RECEIPT)
    render(<DashboardHeader />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    await waitFor(() =>
      expect(document.body.textContent).toContain("Inspector findings refreshed:"),
    )
    // The exact wording that made a one-lane round look like a whole-system one.
    expect(document.body.textContent).not.toMatch(/Last sync/i)
  })

  it("names the evidence in the timestamp it does show", async () => {
    stub(COMPLETED_WITH_RECEIPT)
    render(<DashboardHeader />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Inspector findings refreshed: \d/),
    )
  })

  it("shows NO timestamp when the round refreshed nothing it can prove", async () => {
    // Completed, but `refreshed_sources` does not list the lane. The browser
    // clock would have stamped this anyway; the receipt refuses to.
    stub({
      ...COMPLETED_WITH_RECEIPT,
      results: { vulnerability_findings: {}, refreshed_sources: [] },
    })
    render(<DashboardHeader />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    // The run DID activate, so the control reaches its success message. Only
    // then is "no timestamp" a statement about the receipt rather than about
    // polling not having finished.
    expect(await terminalOutcome()).toBe("success")
    expect(document.body.textContent).not.toMatch(/refreshed:/)
    expect(document.body.textContent).not.toMatch(/Last sync/i)
  })

  it("shows NO timestamp when the backend sent no completion time", async () => {
    // refreshed_sources lists the lane, but there is no completed_at /
    // activated_at. laneRefreshedAt requires BOTH; the clock is never a
    // fallback.
    const { completed_at: _dropped, ...noStamp } = COMPLETED_WITH_RECEIPT
    stub(noStamp)
    render(<DashboardHeader />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    expect(await terminalOutcome()).toBe("success")
    expect(document.body.textContent).not.toMatch(/refreshed: \d/)
  })

  it("shows NO timestamp for a completed run with no activation receipt", async () => {
    stub({
      job_id: "job-1",
      status: "completed",
      state: "completed_without_activation_receipt",
      message: "",
      completed_at: "2026-09-20T07:01:00+00:00",
    })
    render(<DashboardHeader />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    await waitFor(() => expect(document.body.textContent).toMatch(/no proof/i))
    expect(document.body.textContent).not.toMatch(/refreshed: \d/)
    expect(document.body.textContent).not.toMatch(/Last sync/i)
  })

  it("uses the BACKEND stamp, not the browser clock", async () => {
    // A backend time far from now. If the clock ever came back, the rendered
    // time would be the test's wall clock instead of this one.
    stub({
      ...COMPLETED_WITH_RECEIPT,
      completed_at: "2026-09-20T03:04:00+00:00",
    })
    render(<DashboardHeader />)
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    const expected = new Date("2026-09-20T03:04:00+00:00").toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
    await waitFor(() =>
      expect(document.body.textContent).toContain(`Inspector findings refreshed: ${expected}`),
    )
  })
})


describe("the tab remount key follows the same receipt", () => {
  it("bumps once when the round proved the lane refreshed", async () => {
    stub(COMPLETED_WITH_RECEIPT)
    render(<DashboardHeader />)
    expect(screen.getByTestId("refresh-key").textContent).toBe("0")
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    await waitFor(() => expect(screen.getByTestId("refresh-key").textContent).toBe("1"))
  })

  it("does NOT remount every lane when nothing was proved refreshed", async () => {
    // refreshKey is the React key on ~15 dashboard tabs. Churning them after
    // a round this surface cannot prove is the refetch-and-look-synced
    // pattern RefreshEvidenceButton exists to prevent.
    stub({
      ...COMPLETED_WITH_RECEIPT,
      results: { vulnerability_findings: {}, refreshed_sources: [] },
    })
    render(<DashboardHeader />)
    expect(screen.getByTestId("refresh-key").textContent).toBe("0")
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
    screen.getByRole("button").click()

    // Wait for the callback to have RUN before claiming it did not bump the
    // key. Asserting "still 0" mid-poll proves nothing.
    expect(await terminalOutcome()).toBe("success")
    expect(screen.getByTestId("refresh-key").textContent).toBe("0")
    expect(document.body.textContent).not.toMatch(/refreshed:/)
  })
})
