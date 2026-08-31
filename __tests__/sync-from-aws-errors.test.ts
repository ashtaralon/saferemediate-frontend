import { describe, expect, it } from "vitest"
import { syncStartErrorMessage } from "@/lib/sync-from-aws"

describe("AWS sync error presentation", () => {
  it("explains the Neptune projector boundary without exposing nested JSON", () => {
    const raw = JSON.stringify({
      success: false,
      error: "Backend returned 503",
      detail: JSON.stringify({
        detail: {
          error: "sync_all_unavailable_on_serving_tier",
          reason: "internal boundary detail",
        },
      }),
    })

    const message = syncStartErrorMessage(raw, 503)
    expect(message).toContain("managed by the Neptune projector")
    expect(message).not.toContain("{")
    expect(message).not.toContain("internal boundary detail")
  })

  it("does not expose an HTML outage page", () => {
    expect(syncStartErrorMessage("<!DOCTYPE html><html>Service Suspended</html>", 503)).toBe(
      "AWS sync could not start (HTTP 503). Retry after the data plane recovers.",
    )
  })
})
