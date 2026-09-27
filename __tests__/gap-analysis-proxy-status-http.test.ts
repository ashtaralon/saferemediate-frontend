// @vitest-environment node
// The route declares runtime = "nodejs": run it on Node's own fetch (undici), not happy-dom's browser fetch.
/**
 * The role gap-analysis (Review) proxy keeps a denial, an unavailable backend and a timeout apart, over real HTTP.
 *
 * Reconciles FE #903 into the LP integration: its status rule (401/403 and 503
 * kept, other backend 5xx to 502, 504 only for this proxy's own abort) with the
 * integration's rule that the backend's typed body is never replaced. The
 * backend here is a real HTTP server on 127.0.0.1 and the route's real fetch
 * crosses a real socket; nothing is stubbed but the 55s abort delay, shortened so
 * the local timeout is observable.
 *
 * Observed 2026-09-23: the authenticated Review answered 401
 * DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE in 129ms while an earlier screen
 * showed 504 for the same path, so the two must stay distinguishable.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/iam-roles/[roleName]/gap-analysis/route"
import { refusalFromPreviewBody } from "@/lib/lp-preview-refusal"

const TOKEN = "fixture-service-token-0123456789abcdef"
const ROLE = "cyntro-tb-prod-consumer-monthly"

type Handler = (req: IncomingMessage, res: ServerResponse) => void
let handler: Handler = (_req, res) => res.end()
const seen: { url?: string; token?: string | string[] }[] = []
let server: Server
let base = ""

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url, token: req.headers["x-cyntro-service-token"] })
    handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  seen.length = 0
  vi.restoreAllMocks()
})

function answer(status: number, body: string, contentType = "application/json"): Handler {
  return (_req, res) => {
    res.writeHead(status, { "Content-Type": contentType })
    res.end(body)
  }
}

async function call() {
  process.env.CYNTRO_SERVICE_TOKEN = TOKEN
  process.env.BACKEND_URL_OVERRIDE = base
  const request = new NextRequest(`http://localhost/api/proxy/iam-roles/${ROLE}/gap-analysis?days=365`)
  const res = await GET(request, { params: Promise.resolve({ roleName: ROLE }) })
  const text = await res.text()
  return { status: res.status, origin: res.headers.get("X-Cyntro-Error-Origin"), body: text ? JSON.parse(text) : null }
}

describe("role gap-analysis proxy statuses over real HTTP", () => {
  it("really reaches the backend with the server proof", async () => {
    handler = answer(200, JSON.stringify({ summary: { used_count: 6, unused_count: 4 } }))

    const { status, body, origin } = await call()

    expect(status).toBe(200)
    expect(body.summary.unused_count).toBe(4)
    expect(origin).toBeNull()
    expect(seen).toEqual([{ url: `/api/iam-roles/${ROLE}/gap-analysis?days=365`, token: TOKEN }])
  })

  it("keeps a downstream authentication failure as 401 with the backend's code", async () => {
    handler = answer(401, JSON.stringify({ detail: { code: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE", message: "no principal" } }))

    const { status, body, origin } = await call()

    expect(status).toBe(401)
    expect(origin).toBe("backend")
    expect(refusalFromPreviewBody(status, body).code).toBe("DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE")
  })

  it("keeps a scope refusal as 403", async () => {
    handler = answer(403, JSON.stringify({ detail: { code: "REVIEW_SCOPE_MISMATCH" } }))

    const { status, body } = await call()

    expect(status).toBe(403)
    expect(body.detail.code).toBe("REVIEW_SCOPE_MISMATCH")
  })

  it("keeps a backend-unavailable 503 with its code, distinct from an unreachable backend", async () => {
    handler = answer(503, JSON.stringify({ detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } }))

    const { status, body, origin } = await call()

    expect(status).toBe(503)
    expect(origin).toBe("backend")
    expect(body.detail.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
  })

  it("does not present a backend 504 as this proxy's timeout", async () => {
    handler = answer(504, JSON.stringify({ detail: { code: "UPSTREAM_TIMEOUT" } }))

    const { status, body, origin } = await call()

    expect(status).toBe(502)
    expect(status).not.toBe(504)
    expect(origin).toBe("backend")
    expect(body.backendStatus).toBe(504)
    expect(body.detail.code).toBe("UPSTREAM_TIMEOUT")
  })

  it("maps a non-JSON load-balancer 504 to 502 naming the backend status", async () => {
    handler = answer(504, "<html>504 Gateway Time-out</html>", "text/html")

    const { status, body, origin } = await call()

    expect(status).toBe(502)
    expect(origin).toBe("backend")
    expect(body).toMatchObject({ backendStatus: 504, origin: "backend" })
  })

  it("maps a backend 500 to 502 and keeps its typed body", async () => {
    handler = answer(500, JSON.stringify({ detail: { code: "GAP_ANALYSIS_FAILED" } }))

    const { status, body } = await call()

    expect(status).toBe(502)
    expect(body.backendStatus).toBe(500)
    expect(body.detail.code).toBe("GAP_ANALYSIS_FAILED")
  })

  it("passes a 404 through unchanged", async () => {
    handler = answer(404, JSON.stringify({ detail: { code: "ROLE_NOT_FOUND" } }))

    const { status, body } = await call()

    expect(status).toBe(404)
    expect(body).toEqual({ detail: { code: "ROLE_NOT_FOUND" } })
  })

  it("answers 504 only for its own abort, marked as the proxy's", async () => {
    handler = () => {}  // the backend accepts the request and never answers
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) =>
      realSetTimeout(fn, ms === 55000 ? 50 : ms)) as typeof setTimeout)

    const { status, body, origin } = await call()

    expect(status).toBe(504)
    expect(origin).toBe("proxy")
    expect(body.origin).toBe("proxy")
    expect(body.backendStatus).toBeUndefined()
    expect(seen).toHaveLength(1)
  })

  it("answers 503 for an unreachable backend, marked as the proxy's", async () => {
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((resolve) => closed.close(() => resolve()))
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = `http://127.0.0.1:${port}`
    const request = new NextRequest(`http://localhost/api/proxy/iam-roles/${ROLE}/gap-analysis?days=365`)

    const res = await GET(request, { params: Promise.resolve({ roleName: ROLE }) })

    expect(res.status).toBe(503)
    expect(res.headers.get("X-Cyntro-Error-Origin")).toBe("proxy")
    expect((await res.json()).origin).toBe("proxy")
  })
})
