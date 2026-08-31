import { describe, expect, it } from "vitest"
import {
  backendFailureMessage,
  shouldRetryBackendStatus,
} from "@/lib/server/backend-response"

describe("backend response normalization", () => {
  it.each([502, 503, 504])("retries transient status %s", (status) => {
    expect(shouldRetryBackendStatus(status)).toBe(true)
  })

  it("does not expose a Render 502 HTML page to operators", () => {
    const html = '<!DOCTYPE html><html><head><title>502</title></head><body><h1>Bad Gateway</h1></body></html>'

    expect(backendFailureMessage("Readiness", 502, html)).toBe(
      "Readiness backend temporarily unavailable",
    )
  })

  it("preserves a useful JSON backend detail", () => {
    expect(
      backendFailureMessage("Inspector", 404, JSON.stringify({ detail: "Resource not found" })),
    ).toBe("Resource not found")
  })

  it("identifies a suspended provider service without returning its HTML", () => {
    const html = "<html><body>This service has been suspended by its owner.</body></html>"

    expect(backendFailureMessage("Inspector", 503, html)).toBe(
      "Inspector service suspended or unavailable",
    )
  })
})
