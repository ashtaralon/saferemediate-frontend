import fs from "node:fs"
import path from "node:path"
import { NextRequest } from "next/server"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://customer-backend.example",
}))

import { GET as countRoute } from "@/app/api/proxy/resource-inventory/count/route"
import { GET as listRoute } from "@/app/api/proxy/resource-inventory/list/route"
import { EnvelopeRequestError, fetchWithEnvelope } from "@/components/trust/use-trust-envelope"
import { classifyInventoryResult } from "@/components/copilot/inventory-answer"
import { InventoryAnswerView } from "@/components/copilot/inventory-answer-view"

const OIDC_HEADERS = { "x-amzn-oidc-identity": "user-123", "x-amzn-oidc-data": "  signed-alb-claims  " }
const BACKEND = "https://customer-backend.example"
const FIXTURES = path.join(__dirname, "fixtures", "copilot-inventory")

function enableCustomerScope() {
  process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
  process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
}

function request(route: "count" | "list", query: string, headers: Record<string, string> = OIDC_HEADERS) {
  return new NextRequest(`https://app.example/api/proxy/resource-inventory/${route}?${query}`, { headers })
}

afterEach(() => {
  cleanup()
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  delete process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS
  vi.restoreAllMocks()
})

describe("F1: envelope=true inventory calls carry the verified identity, or refuse by name", () => {
  it("fails closed in the hosted deployment without contacting the backend", async () => {
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await countRoute(request("count", "resource_type=s3&system=payments&envelope=true"))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ status: "unavailable", reason_code: "ANALYST_DEPLOYMENT_MODE_UNSUPPORTED" })
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([
    ["no ALB headers", {}, 403, "ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE", "system=payments"],
    ["identity without signed data", { "x-amzn-oidc-identity": "user-123" }, 403, "ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE", "system=payments"],
    ["no system", OIDC_HEADERS, 400, "ANALYST_SYSTEM_SCOPE_REQUIRED", ""],
    ["a system outside the allowlist", OIDC_HEADERS, 403, "ANALYST_SYSTEM_SCOPE_FORBIDDEN", "system=other"],
  ])("refuses %s before any backend call", async (_label, headers, status, code, system) => {
    enableCustomerScope()
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await listRoute(request("list", `resource_type=s3&${system}&envelope=true`, headers as Record<string, string>))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ status: "unavailable", reason_code: code })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("forwards only the signed identity and the canonical system, and passes a 200 body through unchanged", async () => {
    enableCustomerScope()
    const body = { result: { status: "refused", serve_state: "NOT_READY", reason_code: "TENANT_LIFECYCLE_OFFBOARDED" }, provenance: null }
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body))
    const response = await countRoute(request("count", "resource_type=s3&system=payments&account_id=111122223333&envelope=true"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(body)
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    const target = new URL(url)
    expect(`${target.origin}${target.pathname}`).toBe(`${BACKEND}/api/resource-inventory/count`)
    expect(Object.fromEntries(target.searchParams)).toEqual({
      resource_type: "s3", system: "payments", envelope: "true", account_id: "111122223333",
    })
    expect(init.headers).toEqual({ Accept: "application/json", "X-Amzn-Oidc-Data": "signed-alb-claims" })
  })

  it("forwards the canonical allowlisted system, never the client's spelling of it", async () => {
    enableCustomerScope()
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ result: {}, provenance: null }))
    await listRoute(request("list", "resource_type=s3&system=%20payments%20&envelope=true"))
    expect(new URL((upstream.mock.calls[0] as [string])[0]).searchParams.get("system")).toBe("payments")
  })

  it.each([
    ["top-level error_code (system_resources' body)", 401, { error_code: "ANALYST_IDENTITY_INVALID", detail: "invalid" }, "ANALYST_IDENTITY_INVALID"],
    ["nested detail.error_code", 403, { detail: { error_code: "DECISION_CONTEXT_SCOPE_MISMATCH" } }, "DECISION_CONTEXT_SCOPE_MISMATCH"],
    ["no typed code", 500, { detail: "boom" }, "ANALYST_BACKEND_UNAVAILABLE"],
    ["an untyped value where a code belongs", 503, { error_code: "runtime not installed <b>" }, "ANALYST_BACKEND_UNAVAILABLE"],
  ])("keeps the registered code of a non-2xx: %s", async (_label, status, body, code) => {
    enableCustomerScope()
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body, { status }))
    const response = await listRoute(request("list", "resource_type=s3&system=payments&envelope=true"))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ status: "unavailable", reason_code: code })
  })

  it.each([
    ["a transport failure", () => Promise.reject(new TypeError("fetch failed")), 502, "ANALYST_BACKEND_UNAVAILABLE"],
    ["a non-JSON 200", () => Promise.resolve(new Response("<html>")), 502, "ANALYST_INVALID_RESPONSE"],
    ["an array 200", () => Promise.resolve(Response.json([0])), 502, "ANALYST_INVALID_RESPONSE"],
  ])("never turns %s into an answer", async (_label, reply, status, code) => {
    enableCustomerScope()
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(reply as any)
    const response = await countRoute(request("count", "resource_type=s3&system=payments&envelope=true"))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ status: "unavailable", reason_code: code })
  })
})

describe("the raw envelope=false path (All Services) is unchanged", () => {
  it("needs no customer-resident scope and forwards no identity", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ items: [], columns: [] }))
    const response = await listRoute(request("list", "resource_type=subnet&system=payments&limit=100"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], columns: [] })
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).searchParams.get("envelope")).toBeNull()
    expect(init.headers).toEqual({ Accept: "application/json" })
  })

  it("keeps today's error body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ detail: "boom" }, { status: 500 }))
    const response = await countRoute(request("count", "resource_type=s3"))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "boom", detail: "boom" })
  })
})

describe("F2: fetchWithEnvelope keeps a typed refusal's code and its old message", () => {
  it.each([
    ["the proxy's refusal body", { status: "unavailable", reason_code: "ANALYST_IDENTITY_INVALID" }, "ANALYST_IDENTITY_INVALID"],
    ["a top-level error_code", { error_code: "ANALYST_RUNTIME_UNAVAILABLE" }, "ANALYST_RUNTIME_UNAVAILABLE"],
    ["a nested detail", { detail: { error_code: "DECISION_CONTEXT_SCOPE_MISMATCH" } }, "DECISION_CONTEXT_SCOPE_MISMATCH"],
    ["an untyped body", { detail: "boom" }, null],
  ])("%s", async (_label, body, code) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body, { status: 401 }))
    const error = await fetchWithEnvelope("/api/proxy/resource-inventory/count?resource_type=s3").catch((e) => e)
    expect(error).toBeInstanceOf(EnvelopeRequestError)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("Request failed (401) for /api/proxy/resource-inventory/count?resource_type=s3")
    expect(error.status).toBe(401)
    expect(error.reasonCode).toBe(code)
  })

  it("keeps the message for a non-JSON error body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
    const error = await fetchWithEnvelope("/x").catch((e) => e)
    expect(error.message).toBe("Request failed (502) for /x")
    expect(error.reasonCode).toBeNull()
  })
})

describe("mounted chain: real proxy → fetchWithEnvelope → classifier → view", () => {
  function routeThroughProxy(backendReply: () => Promise<Response>) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.url
      if (url.startsWith(BACKEND)) return backendReply()
      const target = new URL(url, "https://app.example")
      const handler = target.pathname.endsWith("/count") ? countRoute : listRoute
      return handler(new NextRequest(target, { headers: OIDC_HEADERS }))
    })
  }

  async function mount(url: string) {
    try {
      const env = await fetchWithEnvelope<any>(url)
      return { container: render(<InventoryAnswerView answer={classifyInventoryResult(env.result)} />).container, error: null }
    } catch (error) {
      return { container: null, error: error as EnvelopeRequestError }
    }
  }

  it("a lifecycle refusal from the runtime reaches the view as a named refusal with no number", async () => {
    enableCustomerScope()
    const runtime = JSON.parse(fs.readFileSync(path.join(FIXTURES, "runtime-bfe10ed9", "count-refused-OFFBOARDED.json"), "utf8")).result
    routeThroughProxy(async () => Response.json({ result: runtime, provenance: null }))
    const { container } = await mount("/api/proxy/resource-inventory/count?resource_type=s3&system=payments&envelope=true")
    expect(container?.querySelector("[data-copilot-inventory-not-answered]")?.getAttribute("data-reason-code")).toBe(
      "TENANT_LIFECYCLE_OFFBOARDED",
    )
    expect(container?.querySelector("[data-copilot-inventory-count], [data-copilot-inventory-list]")).toBeNull()
  })

  it("a missing identity reaches the caller as a typed refusal, not a generic failure", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    const backend = vi.fn()
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.url
      if (url.startsWith(BACKEND)) return backend()
      return countRoute(new NextRequest(new URL(url, "https://app.example"), { headers: {} }))
    })
    const { error } = await mount("/api/proxy/resource-inventory/count?resource_type=s3&system=payments&envelope=true")
    expect(error?.status).toBe(403)
    expect(error?.reasonCode).toBe("ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE")
    expect(backend).not.toHaveBeenCalled()
  })

  it("an invalid identity rejected by the backend keeps its registered code", async () => {
    enableCustomerScope()
    routeThroughProxy(async () => Response.json({ error_code: "ANALYST_IDENTITY_INVALID", detail: "bad signature" }, { status: 401 }))
    const { error } = await mount("/api/proxy/resource-inventory/list?resource_type=s3&system=payments&envelope=true")
    expect(error?.reasonCode).toBe("ANALYST_IDENTITY_INVALID")
  })
})
