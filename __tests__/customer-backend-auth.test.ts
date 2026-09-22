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

// ─── Redirect handling ────────────────────────────────────────────────────
//
// The wrapper above decides WHERE the token is attached. It cannot decide
// where a redirect then carries it: the platform replays every header except a
// small credential set across a redirect, and this token lives in a custom
// header. Verified against Node 20 undici rather than assumed — a custom
// header survives a cross-origin redirect where `Authorization` does not — so
// a 302 from the backend hands the service token to whatever answered.

const BACKEND = "http://127.0.0.1:8000"
const OFF_ORIGIN = "https://collector.attacker.example"
const TOKEN_HEADER = "X-Cyntro-Service-Token"

function redirectTo(status: number, location: string): Response {
  return new Response(null, {status, headers: {location}})
}

function headersOf(call: unknown[]): Headers {
  return new Headers((call[1] as RequestInit | undefined)?.headers ?? undefined)
}

function urlOf(call: unknown[]): string {
  const input = call[0]
  return typeof input === "string" ? input : (input as Request | URL).toString()
}

/** Install the wrapper on the hosted path with a mocked upstream. */
async function installWithUpstream(upstream: ReturnType<typeof vi.fn>) {
  process.env.CYNTRO_SERVICE_TOKEN = "hosted-secret"
  process.env.BACKEND_URL_OVERRIDE = BACKEND
  globalThis.fetch = upstream as unknown as typeof fetch
  const {installCustomerBackendAuthFetch} = await import("@/lib/server/customer-backend-auth")
  installCustomerBackendAuthFetch()
}

describe("redirect handling for the credentialed backend call", () => {
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

  it("does not carry the service token across a redirect that leaves the backend origin", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(redirectTo(302, `${OFF_ORIGIN}/collect`))
      .mockResolvedValueOnce(new Response("collected"))
    await installWithUpstream(upstream)

    const response = await fetch(`${BACKEND}/api/systems`)

    // Precondition, asserted: the first hop really does carry the credential.
    // Without this, "the token did not leak" is trivially true.
    expect(headersOf(upstream.mock.calls[0]).get(TOKEN_HEADER)).toBe("hosted-secret")

    expect(upstream.mock.calls).toHaveLength(2)
    expect(urlOf(upstream.mock.calls[1])).toBe(`${OFF_ORIGIN}/collect`)
    expect(headersOf(upstream.mock.calls[1]).has(TOKEN_HEADER)).toBe(false)
    // The call still completes — dropping the credential must not break it.
    expect(await response.text()).toBe("collected")
  })

  it("drops the platform's own cross-origin credential headers on that hop too", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(redirectTo(302, `${OFF_ORIGIN}/collect`))
      .mockResolvedValueOnce(new Response("collected"))
    await installWithUpstream(upstream)

    await fetch(`${BACKEND}/api/systems`, {
      headers: {authorization: "Bearer caller-token", cookie: "session=abc"},
    })

    const first = headersOf(upstream.mock.calls[0])
    expect(first.get("authorization")).toBe("Bearer caller-token")

    const offOrigin = headersOf(upstream.mock.calls[1])
    expect(offOrigin.has("authorization")).toBe(false)
    expect(offOrigin.has("cookie")).toBe(false)
  })

  it("still follows a same-origin redirect, still credentialed", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(redirectTo(307, `${BACKEND}/api/systems/`))
      .mockResolvedValueOnce(new Response("ok"))
    await installWithUpstream(upstream)

    const response = await fetch(`${BACKEND}/api/systems`)

    expect(upstream.mock.calls).toHaveLength(2)
    expect(urlOf(upstream.mock.calls[1])).toBe(`${BACKEND}/api/systems/`)
    expect(headersOf(upstream.mock.calls[1]).get(TOKEN_HEADER)).toBe("hosted-secret")
    expect(await response.text()).toBe("ok")
  })

  it("follows a relative same-origin Location without losing the token", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(redirectTo(302, "/api/other"))
      .mockResolvedValueOnce(new Response("ok"))
    await installWithUpstream(upstream)

    await fetch(`${BACKEND}/api/systems`)

    expect(urlOf(upstream.mock.calls[1])).toBe(`${BACKEND}/api/other`)
    expect(headersOf(upstream.mock.calls[1]).get(TOKEN_HEADER)).toBe("hosted-secret")
  })

  it("preserves method and body across a same-origin 307", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(redirectTo(307, `${BACKEND}/api/moved`))
      .mockResolvedValueOnce(new Response("ok"))
    await installWithUpstream(upstream)

    await fetch(`${BACKEND}/api/admin/thing`, {
      method: "POST",
      body: '{"a":1}',
      headers: {"content-type": "application/json"},
    })

    const replay = upstream.mock.calls[1][1] as RequestInit
    expect(replay.method).toBe("POST")
    expect(replay.body).toBe('{"a":1}')
    expect(new Headers(replay.headers).get("content-type")).toBe("application/json")
  })

  it("applies the platform's 302-on-POST rewrite instead of replaying the body", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(redirectTo(302, `${BACKEND}/api/moved`))
      .mockResolvedValueOnce(new Response("ok"))
    await installWithUpstream(upstream)

    await fetch(`${BACKEND}/api/admin/thing`, {
      method: "POST",
      body: '{"a":1}',
      headers: {"content-type": "application/json"},
    })

    const replay = upstream.mock.calls[1][1] as RequestInit
    expect(replay.method).toBe("GET")
    expect(replay.body ?? null).toBeNull()
    expect(new Headers(replay.headers).has("content-type")).toBe(false)
  })

  it("forwards the caller's AbortSignal on every hop", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(redirectTo(307, `${BACKEND}/api/moved`))
      .mockResolvedValueOnce(new Response("ok"))
    await installWithUpstream(upstream)

    const controller = new AbortController()
    await fetch(`${BACKEND}/api/systems`, {signal: controller.signal})

    // Both hops, not just the first — cancellation has to survive the hop we
    // re-issue ourselves, which is the one that could lose it.
    expect(upstream.mock.calls).toHaveLength(2)
    for (const call of upstream.mock.calls) {
      expect((call[1] as RequestInit).signal).toBe(controller.signal)
    }
  })

  it("fails closed rather than replaying a body it cannot safely replay", async () => {
    const upstream = vi.fn().mockResolvedValue(redirectTo(307, `${BACKEND}/api/moved`))
    await installWithUpstream(upstream)

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk"))
        controller.close()
      },
    })

    await expect(
      fetch(`${BACKEND}/api/admin/thing`, {
        method: "POST",
        body: stream as unknown as BodyInit,
      }),
    ).rejects.toThrow(/cannot be safely replayed/)

    // Neither silently dropped nor re-sent: the hop never went out.
    expect(upstream.mock.calls).toHaveLength(1)
  })

  it("fails closed on a Location it cannot resolve", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(new Response(null, {status: 302, headers: {location: "http://"}}))
    await installWithUpstream(upstream)

    await expect(fetch(`${BACKEND}/api/systems`)).rejects.toThrow(/refusing to guess/)
    expect(upstream.mock.calls).toHaveLength(1)
  })

  it("bounds the redirect chain instead of following it forever", async () => {
    const upstream = vi.fn().mockImplementation(async (input: unknown) => {
      const url = typeof input === "string" ? input : (input as Request).url
      const n = Number(new URL(url).searchParams.get("n") ?? "0")
      return redirectTo(302, `${BACKEND}/api/loop?n=${n + 1}`)
    })
    await installWithUpstream(upstream)

    await expect(fetch(`${BACKEND}/api/loop?n=0`)).rejects.toThrow(/too many redirects/)
    // Bounded, and bounded at the platform's own limit.
    expect(upstream.mock.calls.length).toBeLessThanOrEqual(21)
  })

  it("hands a redirect status with no Location straight back to the caller", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, {status: 302}))
    await installWithUpstream(upstream)

    const response = await fetch(`${BACKEND}/api/systems`)

    expect(response.status).toBe(302)
    expect(upstream.mock.calls).toHaveLength(1)
  })

  // ─── Preservation: expected to pass before AND after this change ─────────

  it("PRESERVATION: leaves a caller-chosen redirect mode alone", async () => {
    const upstream = vi.fn().mockResolvedValue(redirectTo(302, `${OFF_ORIGIN}/collect`))
    await installWithUpstream(upstream)

    const response = await fetch(`${BACKEND}/api/systems`, {redirect: "manual"})

    // The caller inspects redirects themselves, so nothing is followed and the
    // credential cannot be replayed. One call, their mode intact.
    expect(upstream.mock.calls).toHaveLength(1)
    expect((upstream.mock.calls[0][1] as RequestInit).redirect).toBe("manual")
    expect(headersOf(upstream.mock.calls[0]).get(TOKEN_HEADER)).toBe("hosted-secret")
    expect(response.status).toBe(302)
  })

  it("PRESERVATION: a non-redirect response passes through unchanged", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response("body", {status: 200}))
    await installWithUpstream(upstream)

    const response = await fetch(`${BACKEND}/api/systems`)

    expect(upstream.mock.calls).toHaveLength(1)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("body")
  })

  it.each([
    ["scheme differs", "https://127.0.0.1:8000/api/x"],
    ["port differs", "http://127.0.0.1:8001/api/x"],
    ["suffix look-alike", "http://127.0.0.1.attacker.example:8000/api/x"],
    ["host differs", "http://localhost:8000/api/x"],
  ])(
    "PRESERVATION: the exact-origin predicate stays strict (%s)",
    async (_label, target) => {
      const upstream = vi.fn().mockResolvedValue(new Response("ok"))
      await installWithUpstream(upstream)

      await fetch(target)

      expect(headersOf(upstream.mock.calls[0]).has(TOKEN_HEADER)).toBe(false)
    },
  )
})
