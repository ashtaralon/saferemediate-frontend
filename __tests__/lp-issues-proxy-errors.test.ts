// @vitest-environment node
// The route runs on Node's fetch through the process-wide writer, as instrumentation.ts installs it.
/**
 * The LP issues proxy keeps a denial, an unavailable backend, an unexpected
 * backend fault and its own timeout apart, and forwards only typed fields.
 *
 * Same status rule as the Review proxy (#916): 401/403 stay denials, 503 stays
 * "unavailable", every other backend 5xx (a backend or load-balancer 504
 * included) is 502 with backendStatus, and 504 means only this proxy's own
 * abort. Bodies are an allowlist of the backend refusal's typed fields
 * (code, message, upstream_code, failing_axes, failed_analyzers); raw upstream
 * text is never echoed. Real HTTP backend on 127.0.0.1; nothing stubbed but the
 * 55s abort delay.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { installCustomerBackendAuthFetch } from "@/lib/server/customer-backend-auth"
import { lpIssuesFailure } from "@/lib/lp-issues-error"

const TOKEN = "fixture-issues-proxy-service-token-0123456789"
const originalFetch = globalThis.fetch
type Handler = (req: IncomingMessage, res: ServerResponse) => void
let handler: Handler = (_req, res) => res.end()
let server: Server
let base = ""

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  vi.restoreAllMocks()
})

function answer(status: number, body: string, type = "application/json"): Handler {
  return (_req, res) => {
    res.writeHead(status, { "Content-Type": type })
    res.end(body)
  }
}

async function call(target = base) {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
  process.env.BACKEND_URL_OVERRIDE = target
  process.env.CYNTRO_SERVICE_TOKEN = TOKEN
  installCustomerBackendAuthFetch()
  vi.resetModules()
  const { GET } = await import("@/app/api/proxy/least-privilege/issues/route")
  const res = await GET(new NextRequest("http://localhost/api/proxy/least-privilege/issues?systemName=fixture-shop"))
  const text = await res.text()
  return {
    status: res.status,
    origin: res.headers.get("X-Cyntro-Error-Origin"),
    cache: res.headers.get("Cache-Control"),
    text,
    body: text ? JSON.parse(text) : null,
  }
}

describe("LP issues proxy error contract over real HTTP", () => {
  it("keeps a 401 denial with the boundary's message", async () => {
    handler = answer(401, JSON.stringify({ detail: "service authentication required" }))
    const a = await call()
    expect(a.status).toBe(401)
    expect(a.origin).toBe("backend")
    expect(a.body.detail).toEqual({ message: "service authentication required" })
    expect(a.cache).toMatch(/no-store/)
  })

  it("keeps a 403 scope refusal with its code", async () => {
    handler = answer(403, JSON.stringify({ detail: { code: "ANALYST_SYSTEM_SCOPE_FORBIDDEN", message: "outside scope" } }))
    const a = await call()
    expect(a.status).toBe(403)
    expect(a.body.detail.code).toBe("ANALYST_SYSTEM_SCOPE_FORBIDDEN")
  })

  it("keeps a typed 503 unavailable and forwards only its allowlisted fields", async () => {
    handler = answer(503, JSON.stringify({
      detail: {
        code: "DECISION_LP_ISSUES_ANALYSIS_INCOMPLETE",
        message: "The Least Privilege list is unavailable right now; nothing was inferred.",
        failing_axes: ["availability", "integrity"],
        failed_analyzers: ["iam_role", "s3_bucket"],
        diagnostics: { internal_host: "neptune-writer.internal", trace: "Traceback (most recent call last)" },
      },
      debug: "arn:aws:iam::111111111111:role/secret-role",
    }))
    const a = await call()
    expect(a.status).toBe(503)
    expect(a.origin).toBe("backend")
    expect(a.body.detail).toEqual({
      code: "DECISION_LP_ISSUES_ANALYSIS_INCOMPLETE",
      message: "The Least Privilege list is unavailable right now; nothing was inferred.",
      failing_axes: ["availability", "integrity"],
      failed_analyzers: ["iam_role", "s3_bucket"],
    })
    for (const leaked of ["neptune-writer.internal", "Traceback", "secret-role", "diagnostics", "debug"]) {
      expect(a.text).not.toContain(leaked)
    }
    expect(a.body.resources).toBeUndefined()
  })

  it("maps an unexpected backend 500 to 502 with backendStatus and its typed code", async () => {
    handler = answer(500, JSON.stringify({ detail: { code: "GAP_ANALYSIS_FAILED", message: "could not be computed" } }))
    const a = await call()
    expect(a.status).toBe(502)
    expect(a.body.backendStatus).toBe(500)
    expect(a.body.detail.code).toBe("GAP_ANALYSIS_FAILED")
  })

  it("never presents a backend 504 as this proxy's timeout", async () => {
    handler = answer(504, JSON.stringify({ detail: { code: "UPSTREAM_TIMEOUT" } }))
    const a = await call()
    expect(a.status).toBe(502)
    expect(a.body.backendStatus).toBe(504)
    expect(a.origin).toBe("backend")
  })

  it("echoes no raw upstream text for a non-JSON error page", async () => {
    handler = answer(502, "<html><body>Bad gateway at lb-internal-7 stack: at Object.handler</body></html>", "text/html")
    const a = await call()
    expect(a.status).toBe(502)
    expect(a.body.backendStatus).toBe(502)
    expect(a.body.detail).toBeUndefined()
    expect(a.text).not.toMatch(/lb-internal-7|stack|<html>/)
  })

  it("answers 504 only for its own abort, marked as the proxy's", async () => {
    handler = () => {}
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) =>
      realSetTimeout(fn, ms === 55_000 ? 50 : ms)) as typeof setTimeout)
    const a = await call()
    expect(a.status).toBe(504)
    expect(a.origin).toBe("proxy")
    expect(a.body.origin).toBe("proxy")
  })

  it("answers 503 for an unreachable backend, marked as the proxy's", async () => {
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((resolve) => closed.close(() => resolve()))
    const a = await call(`http://127.0.0.1:${port}`)
    expect(a.status).toBe(503)
    expect(a.origin).toBe("proxy")
  })
})

describe("how the LP tab reads a failed issues response", () => {
  it.each([
    ["the proxy's own timeout", 504, "proxy", { origin: "proxy", error: "Backend request timed out" }, true],
    ["the proxy's own unreachable answer", 503, "proxy", { origin: "proxy", error: "connect ECONNREFUSED" }, true],
    ["a typed backend 503", 503, "backend", { detail: { code: "DECISION_LP_ISSUES_ANALYSIS_INCOMPLETE", message: "unavailable" } }, false],
    ["a denial", 401, "backend", { detail: { message: "service authentication required" } }, false],
    ["a scope refusal", 403, "backend", { detail: { code: "ANALYST_SYSTEM_SCOPE_FORBIDDEN" } }, false],
    ["an unexpected backend fault", 502, "backend", { backendStatus: 500, detail: { code: "GAP_ANALYSIS_FAILED" } }, false],
  ])("%s", (_label, status, origin, body, retryable) => {
    expect(lpIssuesFailure(status, origin, body).retryable).toBe(retryable)
  })

  it("shows the typed message or code, never [object Object]", () => {
    const typed = lpIssuesFailure(503, "backend", { detail: { code: "DECISION_LP_ISSUES_ANALYSIS_INCOMPLETE", message: "unavailable" } })
    expect(typed).toMatchObject({ message: "unavailable", code: "DECISION_LP_ISSUES_ANALYSIS_INCOMPLETE" })
    expect(lpIssuesFailure(403, "backend", { detail: { code: "ANALYST_SYSTEM_SCOPE_FORBIDDEN" } }).message).toBe("ANALYST_SYSTEM_SCOPE_FORBIDDEN")
    expect(lpIssuesFailure(401, "backend", { detail: { message: "service authentication required" } }).message).toBe("service authentication required")
    expect(lpIssuesFailure(504, "proxy", { error: "Backend request timed out" }).message).toBe("Backend request timed out")
    expect(String(lpIssuesFailure(500, "backend", { detail: {} }).message)).not.toContain("[object")
  })

  it("the tab uses it for both the message and the retry decision", async () => {
    const { readFileSync } = await import("node:fs")
    const tab = readFileSync(`${process.cwd()}/components/LeastPrivilegeTab.tsx`, "utf8")
    expect(tab).toContain("lpIssuesFailure(response.status, response.headers.get('X-Cyntro-Error-Origin'), body)")
    expect(tab).toContain("const retryable = failure.retryable")
    expect(tab).not.toContain("response.status === 503 || response.status === 504")
  })
})
