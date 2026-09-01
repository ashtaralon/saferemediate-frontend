import {afterEach, describe, expect, it, vi} from "vitest"

describe("customer backend service authentication", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.CYNTRO_DEPLOYMENT_MODE
    delete process.env.CYNTRO_SERVICE_TOKEN
    delete process.env.BACKEND_URL_OVERRIDE
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("injects the token only for the exact customer backend origin", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_SERVICE_TOKEN = "customer-secret"
    process.env.BACKEND_URL_OVERRIDE = "http://127.0.0.1:8000"
    const upstream = vi.fn().mockResolvedValue(new Response("ok"))
    globalThis.fetch = upstream

    const {installCustomerBackendAuthFetch} = await import("@/lib/server/customer-backend-auth")
    installCustomerBackendAuthFetch()
    await fetch("http://127.0.0.1:8000/api/accounts")
    await fetch("https://example.com/api/accounts")

    expect(new Headers(upstream.mock.calls[0][1].headers).get("X-Cyntro-Service-Token")).toBe("customer-secret")
    expect(new Headers(upstream.mock.calls[1][1]?.headers).has("X-Cyntro-Service-Token")).toBe(false)
  })

  // The hosted (C1 / SaaS) path, added 2026-09-01. The backend's global auth
  // boundary ships in `observe` mode and cannot move to `enforce` — the mode
  // that actually protects the ~45 mutating /api/admin/* handlers, none of
  // which has a per-endpoint token check — while this server is the one caller
  // that never authenticates.
  it("attaches the token on the hosted path when one is configured", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = "hosted-secret"
    process.env.BACKEND_URL_OVERRIDE = "http://127.0.0.1:8000"
    const upstream = vi.fn().mockResolvedValue(new Response("ok"))
    globalThis.fetch = upstream

    const {installCustomerBackendAuthFetch} = await import("@/lib/server/customer-backend-auth")
    installCustomerBackendAuthFetch()
    await fetch("http://127.0.0.1:8000/api/admin/graph-node-capacity/maintain", {method: "POST"})
    await fetch("https://example.com/api/admin/graph-node-capacity/maintain", {method: "POST"})

    expect(new Headers(upstream.mock.calls[0][1].headers).get("X-Cyntro-Service-Token")).toBe("hosted-secret")
    // Never leak the token to any origin but the backend's.
    expect(new Headers(upstream.mock.calls[1][1]?.headers).has("X-Cyntro-Service-Token")).toBe(false)
  })

  // Setting the variable is what turns this on. Before it is set the hosted
  // deployment must behave exactly as it did, so an unset secret is the
  // pre-rollout state and not a misconfiguration to fail on.
  it("is a no-op on the hosted path when no token is configured", async () => {
    process.env.BACKEND_URL_OVERRIDE = "http://127.0.0.1:8000"
    const upstream = vi.fn().mockResolvedValue(new Response("ok"))
    globalThis.fetch = upstream

    const {installCustomerBackendAuthFetch} = await import("@/lib/server/customer-backend-auth")
    expect(() => installCustomerBackendAuthFetch()).not.toThrow()
    await fetch("http://127.0.0.1:8000/api/systems")

    expect(globalThis.fetch).toBe(upstream)
    expect(new Headers(upstream.mock.calls[0][1]?.headers).has("X-Cyntro-Service-Token")).toBe(false)
  })

  it("fails startup when a customer-resident secret is missing", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.BACKEND_URL_OVERRIDE = "http://127.0.0.1:8000"
    const {installCustomerBackendAuthFetch} = await import("@/lib/server/customer-backend-auth")
    expect(() => installCustomerBackendAuthFetch()).toThrow("requires CYNTRO_SERVICE_TOKEN")
  })
})
