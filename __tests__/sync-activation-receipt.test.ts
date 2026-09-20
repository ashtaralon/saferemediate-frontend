/**
 * Success is an activation receipt, and nothing else.
 *
 * Every other signal this client can observe is weaker than it looks:
 *   - a 200 from the proxy says the transport worked,
 *   - `accepted: true` says the request was queued,
 *   - `status: "completed"` says a worker exited.
 * None of them says a validated generation is ACTIVE for this scope. Only
 * `activation.projection_receipt_hash` says that.
 *
 * These are the negative controls. Each asserts a thing the UI must NOT do.
 */

import { describe, expect, it } from "vitest"

import {
  isActivated,
  isForRun,
  toSyncProgress,
  formatUnprovenCompletionMessage,
  type SyncJobStatus,
} from "@/lib/sync-from-aws"

const base: SyncJobStatus = {
  job_id: "job-1",
  status: "completed",
  message: "",
}

const receipt = {
  activated: true,
  projection_generation: 4,
  staging_run_id: "inspector-run-1",
  source_vector_hash: "svh",
  projected_through: "2026-09-20T12:00:00+00:00",
  projection_receipt_hash: "v1:abc",
}

describe("only an activation receipt is success", () => {
  it("accepts a completed run that carries its receipt", () => {
    expect(isActivated({ ...base, activation: receipt })).toBe(true)
  })

  it("REFUSES a completed run with no receipt", () => {
    // The pre-receipt row shape, and the shape of a run that activated and
    // then lost the pointer to a concurrent projector.
    expect(isActivated(base)).toBe(false)
    expect(isActivated({ ...base, activation: {} })).toBe(false)
    expect(isActivated({ ...base, activation: { activated: true } })).toBe(false)
  })

  it("REFUSES a receipt that claims activation without proving it", () => {
    expect(
      isActivated({
        ...base,
        activation: { activated: true, projection_generation: 4 },
      }),
    ).toBe(false)
  })

  it("REFUSES every non-completed status, receipt or not", () => {
    for (const status of ["queued", "running", "failed", "stale"] as const) {
      expect(isActivated({ ...base, status, activation: receipt })).toBe(false)
    }
  })

  it("REFUSES null/undefined rather than throwing", () => {
    expect(isActivated(null)).toBe(false)
    expect(isActivated(undefined)).toBe(false)
  })

  it("explains an unproven completion instead of rendering it green", () => {
    const text = formatUnprovenCompletionMessage({
      ...base,
      state: "completed_without_activation_receipt",
    })
    expect(text).toMatch(/no proof/i)
    expect(text).toMatch(/re-run/i)
  })
})

describe("a status must be about the run we asked for", () => {
  it("binds on the run id", () => {
    expect(isForRun({ ...base, job_id: "job-1" }, "job-1")).toBe(true)
  })

  it("REFUSES another run's terminal state", () => {
    // A poll in flight across a restart, or a job id reused by another
    // surface, must not deliver someone else's activation into this run.
    expect(isForRun({ ...base, job_id: "someone-else" }, "job-1")).toBe(false)
    expect(isForRun({ ...base, job_id: "" }, "job-1")).toBe(false)
    expect(isForRun(null, "job-1")).toBe(false)
  })
})

describe("no numeric field unless the producer sent one", () => {
  it("reports percent as null when the backend sends none", () => {
    const p = toSyncProgress({ ...base, status: "running", state: "inspector_collection_and_projection" })
    expect(p.percent).toBeNull()
    expect(Number.isNaN(p.percent as unknown as number)).toBe(false)
  })

  it("never derives a percent from an absent step", () => {
    // The exact regression: percent = progress_percent ?? (current_step/total)
    // with both absent evaluated Math.round(undefined / 2 * 100) = NaN.
    const p = toSyncProgress({ ...base, status: "running", total_steps: 2 })
    expect(p.percent).toBeNull()
  })

  it("passes through an authoritative percent unchanged", () => {
    const p = toSyncProgress({ ...base, status: "running", progress_percent: 42 })
    expect(p.percent).toBe(42)
  })

  it("rejects a non-finite percent rather than rendering it", () => {
    const p = toSyncProgress({ ...base, status: "running", progress_percent: NaN })
    expect(p.percent).toBeNull()
  })

  it("prefers the named state over the retired step name", () => {
    expect(
      toSyncProgress({ ...base, state: "neptune_generation_active", current_step_name: "starting" })
        .stepName,
    ).toBe("neptune_generation_active")
  })

  it("still reads the legacy step name while both backends are in flight", () => {
    expect(
      toSyncProgress({ ...base, current_step_name: "collection_queued" }).stepName,
    ).toBe("collection_queued")
  })
})
