/**
 * The auto-tag proxy reports the backend's outcome, never one it derived from the request.
 *
 * Executed against the proxy with a stubbed backend (no network). The backend shapes are the ones
 * services/auto_tag_aws.py builds (results.success / failed / skipped + *_count) and the contained
 * write's typed 409 (api/auto_tag.py -> off_boundary_mutation_refused, path aws_system_tag_write).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function backend(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  })))
}

const post = (body: unknown) => new Request("https://app.example/api/proxy/auto-tag", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("auto-tag proxy", () => {
  it("relays the contained write's typed refusal instead of a generic failure", async () => {
    backend(409, { detail: { error: "off_boundary_mutation_refused", reason_code: "off_boundary_mutation_refused",
      message: "aws_system_tag_write: POST /api/auto-tag with dry_run=false writes ...", path: "aws_system_tag_write", contained: true } })
    const { POST } = await import("@/app/api/proxy/auto-tag/route")
    const res = await POST(post({ systemName: "orders", tags: { Environment: "Production" } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.detail.reason_code).toBe("off_boundary_mutation_refused")
    expect(body.detail.message).toMatch(/^aws_system_tag_write/)
    expect(body).not.toHaveProperty("success")
  })

  it("a backend tagged_count 0 with one failed resource is a failure, with that resource failed", async () => {
    backend(200, { tagged_count: 0, failed_count: 1, skipped_count: 0, dry_run: false,
      results: { success: [], failed: [{ resource_id: "i-1", error: "AccessDenied" }], skipped: [] } })
    const { POST } = await import("@/app/api/proxy/auto-tag/route")
    const body = await (await POST(post({ systemName: "orders", resourceIds: ["i-1"] }))).json()
    expect(body.success).toBe(false)
    expect(body.taggedCount).toBe(0)
    expect(body.failedCount).toBe(1)
    expect(body.results).toEqual([{ resourceId: "i-1", success: false, error: "AccessDenied" }])
  })

  it("control: a real success is reported as one", async () => {
    backend(200, { tagged_count: 1, failed_count: 0, skipped_count: 0, dry_run: false,
      results: { success: [{ resource_id: "i-1", proposed_system: "orders" }], failed: [], skipped: [] } })
    const { POST } = await import("@/app/api/proxy/auto-tag/route")
    const body = await (await POST(post({ systemName: "orders", resourceIds: ["i-1"] }))).json()
    expect(body.success).toBe(true)
    expect(body.taggedCount).toBe(1)
    expect(body.results).toEqual([{ resourceId: "i-1", success: true, systemName: "orders" }])
  })

  it("a backend answer without counts reports no count (null), never the request size", async () => {
    backend(200, { results: {} })
    const { POST } = await import("@/app/api/proxy/auto-tag/route")
    const body = await (await POST(post({ systemName: "orders", resourceIds: ["i-1", "i-2"] }))).json()
    expect(body.success).toBe(false)
    expect(body.taggedCount).toBeNull()
    expect(body.results).toEqual([])
  })
})
