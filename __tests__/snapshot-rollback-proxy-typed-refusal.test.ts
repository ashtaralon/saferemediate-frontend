// @vitest-environment node
/**
 * Root191 F4 controls for the snapshot rollback proxy at
 * ``app/api/proxy/snapshots/[snapshotId]/rollback/route.ts``.
 *
 * Every control drives the REAL route handler; ``fetch`` is the only recorder. The upstream STATUS, the SUCCESS body
 * and the legacy ``error``/``message`` selection are byte-preserved; the change is additive.
 *
 * F4-Ref1: the upstream ``detail`` becomes a typed refusal on the proxy response ONLY when it is a non-array object
 * with a nonempty string ``code``. Every other readable shape (string / null / array / object without ``code``) and
 * every unreadable body becomes a NAMED ``PROXY_UPSTREAM_REFUSAL_UNREADABLE`` detail that preserves the ORIGINAL
 * upstream status and states plainly that the upstream did not provide a readable typed refusal. No invented backend
 * code, no implied restore outcome.
 *
 * F4-Ref2: the previous message selection (``errorData.detail`` -> ``errorData.message`` -> ``Backend returned N``)
 * is preserved; local proof-refusal legacy fields and the ``no-store`` header are preserved; a fetch failure carries
 * a canonical ``detail`` that expresses OUTCOME UNCERTAINTY ("no verified restoration result"), never "no AWS change
 * occurred". The success body is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

const BACKEND = "https://backend.example"
const originalFetch = globalThis.fetch
const SNAP = "IAMRole-fixture-web-role-1a2b3c4d"

type Sent = { url: string; method: string; headers: Headers; body: string | null }

function recorder(reply: () => Response) {
  const sent: Sent[] = []
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as { url: string }).url
    if (!url.startsWith(BACKEND)) throw new TypeError(`unexpected upstream ${url}`)
    sent.push({
      url, method: (init?.method ?? "GET"),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
    })
    return reply()
  }) as unknown as typeof fetch
  return sent
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function textResponse(body: string, status = 200, contentType = "text/html"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } })
}

async function callRoute(): Promise<{ status: number; body: any; headers: Headers; sent: Sent[] }> {
  // Import lazily so the env stub for CUSTOMER_RESIDENT is set before the module reads it (the module reads
  // process.env at call time inside residentRollbackProof, not at import, so import order is not load-bearing --
  // but re-importing per test keeps the pattern the sibling proxy tests use.)
  const { POST } = await import("@/app/api/proxy/snapshots/[snapshotId]/rollback/route")
  const request = new NextRequest(`https://app.example/api/proxy/snapshots/${SNAP}/rollback`, {
    method: "POST", body: "{}", headers: { "content-type": "application/json" },
  })
  const response = await POST(request, { params: Promise.resolve({ snapshotId: SNAP }) })
  const body = await response.json()
  return { status: response.status, body, headers: response.headers, sent: (globalThis.fetch as any).mock ? [] : [] }
}

// A version that returns the recorder's sent list too.
async function drive(reply: () => Response): Promise<{ status: number; body: any; headers: Headers; sent: Sent[] }> {
  const sent = recorder(reply)
  const { POST } = await import("@/app/api/proxy/snapshots/[snapshotId]/rollback/route")
  const request = new NextRequest(`https://app.example/api/proxy/snapshots/${SNAP}/rollback`, {
    method: "POST", body: "{}", headers: { "content-type": "application/json" },
  })
  const response = await POST(request, { params: Promise.resolve({ snapshotId: SNAP }) })
  const body = await response.json()
  return { status: response.status, body, headers: response.headers, sent }
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})

describe("Root191 F4: snapshot rollback proxy carries a canonical typed detail additively", () => {
  it("a success body is unchanged and no proxy-added envelope appears", async () => {
    const { status, body, sent } = await drive(() =>
      jsonResponse({ success: true, code: "RESTORE_VERIFIED", operation_id: "op-123", snapshot_id: SNAP, aws_writes: 1 }),
    )
    expect(status).toBe(200)
    expect(body).toEqual({ success: true, code: "RESTORE_VERIFIED", operation_id: "op-123", snapshot_id: SNAP, aws_writes: 1 })
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe(`${BACKEND}/api/snapshots/${encodeURIComponent(SNAP)}/rollback`)
    expect(sent[0].method).toBe("POST")
  })

  it("an upstream typed refusal (non-array object with nonempty string code) is carried verbatim in `detail`; legacy `message` = detail object", async () => {
    const typed = { code: "LIFECYCLE_CREDENTIALS_REFUSED", message: "This process may not hold the tenant lifecycle credentials this needs.", snapshot_id: SNAP, aws_writes: 0 }
    const { status, body, headers } = await drive(() => jsonResponse({ detail: typed }, 403))
    expect(status).toBe(403)                                          // ORIGINAL upstream status preserved
    expect(body.error).toBe("Failed to rollback snapshot")
    expect(body.message).toEqual(typed)                                // legacy selection: detail wins over message
    expect(body.detail).toEqual(typed)                                 // typed refusal carried verbatim
    expect(headers.get("cache-control")).toBe("no-store")
  })

  it("a readable string `detail` is NOT typed: named PROXY_UPSTREAM_REFUSAL_UNREADABLE with upstream status; legacy message is the string", async () => {
    const { status, body, headers } = await drive(() => jsonResponse({ detail: "Snapshot expired" }, 409))
    expect(status).toBe(409)
    expect(body.message).toBe("Snapshot expired")                      // previous selection preserved (string wins)
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE")
    expect(body.detail.upstream_status).toBe(409)
    expect(body.detail.upstream_body_shape).toBe("readable_string_detail")
    expect(body.detail.message).toMatch(/not a claim that no AWS state changed/)
    expect(headers.get("cache-control")).toBe("no-store")
  })

  it("a `detail: null` is NOT typed: named PROXY_UPSTREAM_REFUSAL_UNREADABLE; legacy message is the fallback string", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: null, message: null }, 502))
    expect(status).toBe(502)
    expect(body.message).toBe("Backend returned 502")                   // null detail + null message → fallback
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE")
    expect(body.detail.upstream_status).toBe(502)
    expect(body.detail.upstream_body_shape).toBe("readable_null_detail")
  })

  it("an ARRAY `detail` is NOT typed: named refusal; legacy message = the array itself (previous selection)", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: [{ code: "LOOKS_TYPED" }] }, 500))
    expect(status).toBe(500)
    expect(body.message).toEqual([{ code: "LOOKS_TYPED" }])            // previous selection: array is truthy
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE") // NOT the LOOKS_TYPED code (no invented codes)
    expect(body.detail.upstream_body_shape).toBe("readable_array_detail")
  })

  it("an OBJECT `detail` MISSING a `code` is NOT typed: named refusal; legacy message = the object", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: { message: "wrong shape", note: "no code" } }, 500))
    expect(status).toBe(500)
    expect(body.message).toEqual({ message: "wrong shape", note: "no code" })
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE")
    expect(body.detail.upstream_body_shape).toBe("readable_object_detail_missing_code")
  })

  it("an OBJECT `detail` with an EMPTY-STRING `code` is NOT typed either", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: { code: "", message: "empty code" } }, 500))
    expect(status).toBe(500)
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE")
    expect(body.detail.upstream_body_shape).toBe("readable_object_detail_missing_code")
  })

  it("HTML / unreadable JSON becomes upstream_body_shape=unreadable; legacy message is the fallback string", async () => {
    const { status, body } = await drive(() => textResponse("<html><body>503 Bad Gateway</body></html>", 503, "text/html"))
    expect(status).toBe(503)
    expect(body.message).toBe("Backend returned 503")
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE")
    expect(body.detail.upstream_body_shape).toBe("unreadable")
    expect(body.detail.upstream_status).toBe(503)
    expect(body.detail.message).toMatch(/restoration result is not verified/)
  })

  // ---- Root191 F4 correction 1: legacy `message` selection is plain TRUTHINESS ----------------------------------
  // The pre-F4 route was `errorData.detail || errorData.message || `Backend returned N``. `||` skips `false` and `0`
  // and falls through; an earlier version of legacyMessage() tested only undefined/null/"" and so RETURNED them.
  // These controls pin the original precedence on the real handler.

  it("a FALSE `detail` falls through to `message`, as the original || did", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: false, message: "the real message" }, 500))
    expect(status).toBe(500)
    expect(body.message).toBe("the real message")                      // NOT false
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE")
  })

  it("a ZERO `detail` falls through to `message`, as the original || did", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: 0, message: "zero detail" }, 500))
    expect(status).toBe(500)
    expect(body.message).toBe("zero detail")                           // NOT 0
  })

  it("a message-only upstream response is carried in `message` with no detail to type", async () => {
    const { status, body } = await drive(() => jsonResponse({ message: "only a message, no detail key" }, 500))
    expect(status).toBe(500)
    expect(body.message).toBe("only a message, no detail key")
    expect(body.detail.code).toBe("PROXY_UPSTREAM_REFUSAL_UNREADABLE")
    expect(body.detail.upstream_body_shape).toBe("readable_object_no_detail")
  })

  it("a FALSE detail AND a falsy message both fall through to the fallback string", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: false, message: 0 }, 504))
    expect(status).toBe(504)
    expect(body.message).toBe("Backend returned 504")                  // both candidates falsy
  })

  it("an empty-string detail falls through to `message` (unchanged from the original)", async () => {
    const { status, body } = await drive(() => jsonResponse({ detail: "", message: "after empty detail" }, 500))
    expect(body.message).toBe("after empty detail")
  })

  // ---- Root191 F4 correction 2: the catch also covers a 2xx body that cannot be parsed -------------------------

  it("a SUCCESSFUL upstream response with an unreadable body does NOT claim the backend was unreachable", async () => {
    // 200 OK, but the body is not JSON. `await response.json()` on the success path throws INSIDE the try, so this
    // lands in the same catch as a transport failure. The backend was reached and answered success; a restore may
    // well have been performed. The text must say the result could not be VERIFIED, not that nothing was reached.
    const { status, body, headers } = await drive(() => textResponse("<html>gateway scrubbed the body</html>", 200, "text/html"))
    expect(status).toBe(500)
    expect(body.detail.code).toBe("PROXY_FETCH_FAILED")
    expect(body.detail.upstream_responded).toBe(true)
    expect(body.detail.message).toMatch(/backend answered/i)
    expect(body.detail.message).toMatch(/could not be verified/i)
    expect(body.detail.message).toMatch(/outcome is uncertain/i)
    expect(body.detail.message).not.toMatch(/did not obtain a response/i)
    expect(body.detail.message).toMatch(/not a claim that no AWS state changed/)
    expect(headers.get("cache-control")).toBe("no-store")
  })

  it("a fetch failure carries PROXY_FETCH_FAILED with outcome-uncertainty language and 500 + no-store", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("connect ECONNREFUSED 127.0.0.1:8000") }) as unknown as typeof fetch
    const { POST } = await import("@/app/api/proxy/snapshots/[snapshotId]/rollback/route")
    const response = await POST(
      new NextRequest(`https://app.example/api/proxy/snapshots/${SNAP}/rollback`, {
        method: "POST", body: "{}", headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ snapshotId: SNAP }) },
    )
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.error).toBe("Failed to rollback snapshot")
    expect(body.message).toBe("connect ECONNREFUSED 127.0.0.1:8000")   // legacy: error.message preserved
    expect(body.detail.code).toBe("PROXY_FETCH_FAILED")
    expect(body.detail.origin).toBe("proxy_fetch_failure")
    expect(body.detail.error_name).toBe("TypeError")
    expect(body.detail.upstream_responded).toBe(false)                 // genuinely no response here
    expect(body.detail.message).toMatch(/not a claim that no AWS state changed/)
    expect(body.detail.message).toMatch(/could not be verified/i)
    expect(body.detail.message).toMatch(/outcome is uncertain/i)
    expect(body.detail.message).toMatch(/did not obtain a response/i)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("a local proof refusal (customer-resident) carries typed detail alongside the preserved legacy message object", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    vi.resetModules()                                                  // drop the module cache so doMock takes effect on the fresh import
    vi.doMock("@/lib/server/backend-proof", () => ({
      selectBackendProof: async () => ({ ok: false as const, status: 401, code: "SITE_SESSION_INVALID" }),
    }))
    // fetch must NOT be reached
    const failIfCalled = vi.fn(async () => { throw new Error("proxy must not call backend when the local proof is refused") })
    globalThis.fetch = failIfCalled as unknown as typeof fetch
    const { POST } = await import("@/app/api/proxy/snapshots/[snapshotId]/rollback/route")
    const response = await POST(
      new NextRequest(`https://app.example/api/proxy/snapshots/${SNAP}/rollback`, {
        method: "POST", body: "{}", headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ snapshotId: SNAP }) },
    )
    const body = await response.json()
    expect(response.status).toBe(401)
    expect(body.error).toBe("Failed to rollback snapshot")
    expect(body.origin).toBe("proxy")                                  // legacy origin preserved
    expect(body.message).toEqual({ code: "SITE_SESSION_INVALID", message: expect.stringMatching(/site session/i) })
    expect(body.detail.code).toBe("SITE_SESSION_INVALID")
    expect(body.detail.origin).toBe("proxy_local_proof_refusal")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(failIfCalled.mock.calls).toHaveLength(0)
    vi.doUnmock("@/lib/server/backend-proof")
    vi.resetModules()                                                  // restore for later tests / files
  })
})
