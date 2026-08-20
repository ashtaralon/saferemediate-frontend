import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalBackend = process.env.BACKEND_URL
const originalSecret = process.env.CYNTRO_APPROVAL_PROXY_SECRET
const originalIdentity = process.env.CYNTRO_OPERATOR_IDENTITY

beforeEach(() => {
  process.env.BACKEND_URL = "https://backend.test"
  process.env.CYNTRO_APPROVAL_PROXY_SECRET = "server-secret"
  process.env.CYNTRO_OPERATOR_IDENTITY = "c1-operator"
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const [key, value] of [
    ["BACKEND_URL", originalBackend],
    ["CYNTRO_APPROVAL_PROXY_SECRET", originalSecret],
    ["CYNTRO_OPERATOR_IDENTITY", originalIdentity],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("configuration Change Case proxy", () => {
  it("sends only finding identity to the canonical simulation adapter", async () => {
    const backendPayload = {
      success: true,
      decision: { action: "BLOCK", reasons: ["analysis only"] },
      change_case: { approval: { required: false }, resource: { type: "IAMRole" } },
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(backendPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/proxy/simulate/route")
    const response = await POST(new Request("http://ui.test/api/proxy/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finding_id: "finding-1",
        resource_id: "browser-forgery",
        resource_type: "browser-forgery",
      }),
    }) as never)

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Proxy")).toBe("configuration-fix-simulate")
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://backend.test/api/configuration-fixes/simulate",
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ finding_id: "finding-1" })
  })

  it("uses server-owned approval identity and secret, never browser actor fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        approval_request: { request_id: "approval-1" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/proxy/simulate/approval/route")
    const response = await POST(new Request("http://ui.test/api/proxy/simulate/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finding_id: "finding-1", requested_by: "browser-attacker" }),
    }) as never)

    expect(response.status).toBe(200)
    const options = fetchMock.mock.calls[0][1]
    expect(options.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Cyntro-Approval-Secret": "server-secret",
    })
    expect(JSON.parse(options.body)).toMatchObject({
      finding_id: "finding-1",
      requested_by: "c1-operator",
    })
  })
})
