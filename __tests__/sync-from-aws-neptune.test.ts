import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildSyncAllStartUrl,
  fetchSyncJobStatus,
  formatSyncSuccessMessage,
  startSyncAllJob,
} from "@/lib/sync-from-aws"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Sync from AWS uses the managed Neptune refresh plane", () => {
  it("never builds the legacy in-process sync-all URL", () => {
    expect(buildSyncAllStartUrl({ days: 90, skipFlowLogs: true })).toBe(
      "/api/proxy/sync/start",
    )
  })

  it("starts and polls the v2 projector-backed job", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            job_id: "11111111-1111-1111-1111-111111111111",
            sources: ["vulnerability_findings"],
            serving_store: "neptune",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: "11111111-1111-1111-1111-111111111111",
            status: "completed",
            current_step: 2,
            current_step_name: "neptune_projection_activated",
            total_steps: 2,
            progress_percent: 100,
            message: "Activated in Neptune",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    const started = await startSyncAllJob()
    const status = await fetchSyncJobStatus(started.job_id!)

    expect(fetchMock.mock.calls[0][0]).toBe("/api/proxy/sync/start")
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/proxy/sync/status/11111111-1111-1111-1111-111111111111",
    )
    expect(status?.current_step_name).toBe("neptune_projection_activated")
  })

  it("shows the backend sentence instead of proxy JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: "The managed Neptune projector queue is unavailable.",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )

    await expect(startSyncAllJob()).rejects.toThrow(
      "The managed Neptune projector queue is unavailable.",
    )
  })

  it("reports the activated generation, the counts, and what was NOT refreshed", () => {
    // The whole status, not just `results`: the claim depends on the
    // activation receipt, and the counters only describe rows.
    expect(
      formatSyncSuccessMessage({
        job_id: "job-1",
        status: "completed",
        message: "",
        activation: {
          activated: true,
          projection_generation: 4,
          projection_receipt_hash: "v1:abc",
        },
        results: {
          vulnerability_findings: { active_findings: 32, active_coverage: 17 },
        },
        deferred_sources: [
          { source: "inventory_reconcile", label: "AWS inventory", state: "NOT_CONNECTED" },
          { source: "api_activity", label: "CloudTrail API activity", state: "NOT_CONNECTED" },
        ],
      }),
    ).toBe(
      "Vulnerability findings generation 4 is active in Neptune. 32 active " +
        "findings across 17 covered resources. 2 other data sources were not " +
        "refreshed by this run.",
    )
  })

  it("never claims an estate-wide sync", () => {
    const text = formatSyncSuccessMessage({
      job_id: "job-1",
      status: "completed",
      message: "",
      activation: { activated: true, projection_generation: 9, projection_receipt_hash: "v1:x" },
    })
    // Only vulnerability_findings is provable. A control that says the estate
    // was synced, on a vulnerability-only round, is the claim this removes.
    expect(text).not.toMatch(/sync/i)
    expect(text).not.toMatch(/AWS evidence refreshed/i)
    expect(text).toContain("Vulnerability findings generation 9")
  })

  it("omits counters that were never measured rather than printing zero", () => {
    const text = formatSyncSuccessMessage({
      job_id: "job-1",
      status: "completed",
      message: "",
      activation: { activated: true, projection_generation: 2, projection_receipt_hash: "v1:y" },
      results: { vulnerability_findings: {} },
    })
    // `Number(undefined || 0)` would render "0 active findings", which reads
    // as a measured zero -- a clean bill of health nothing established.
    expect(text).not.toContain("0 active findings")
    expect(text).toBe("Vulnerability findings generation 2 is active in Neptune.")
  })
})
