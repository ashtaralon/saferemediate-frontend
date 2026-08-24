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

  it("reports exactly what was refreshed and what was deferred", () => {
    expect(
      formatSyncSuccessMessage({
        vulnerability_findings: { active_findings: 32, active_coverage: 17 },
        deferred_sources: [
          { source: "inventory_reconcile", label: "AWS inventory" },
          { source: "api_activity", label: "CloudTrail API activity" },
        ],
      }),
    ).toBe(
      "Inspector refreshed in Neptune: 32 active findings across 17 covered resources. 2 additional data sources are not connected yet.",
    )
  })
})
