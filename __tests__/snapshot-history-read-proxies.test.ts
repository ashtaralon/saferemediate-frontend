// @vitest-environment node
/// <reference types="vitest/globals" />
/**
 * The four History/recovery READ proxies under the final contract (Root185, H-P1), driven through the REAL route
 * handlers with the backend stubbed: the page's claims travel to the backend; a typed backend answer keeps its status
 * and body; a 404 is not an empty collection; a transport failure is a named unavailability, never an empty success;
 * no proxy cache, stale fallback or empty retry answers instead of the backend; the canonical snapshot listing is the
 * ONLY snapshot source and the retired legacy readers are named, not silently dropped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

import { GET as timelineGET } from "@/app/api/proxy/remediation-history/timeline/route"
import { GET as snapshotsGET } from "@/app/api/proxy/snapshots/route"
import { GET as iamSnapshotsGET } from "@/app/api/proxy/iam-snapshots/route"
import { GET as detailGET } from "@/app/api/proxy/snapshots/[snapshotId]/route"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
let upstream: string[]
let upstreamInit: Array<RequestInit | undefined>
function stubBackend(responder: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  upstream = []
  upstreamInit = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    upstream.push(url)
    upstreamInit.push(init)
    return responder(url, init)
  }))
}
const request = (path: string) => new NextRequest(`https://cyntro.example${path}`)
const query = (url: string) => new URL(url).searchParams

// CAPTURED shapes: the reader's positive echo (backend 4acad91a, pa185/timeline_bodies.raw.json) and the supplier's
// envelope (backend afa99c98, pa178/listing_bodies_178.raw.json).
const TIMELINE_OK = {
  events: [{ id: "operation:op-1", event_id: "operation:op-1", operation_id: "op-1", source: "operation_ledger", action_type: "IAM_PERMISSION_NARROWING", resource_type: "IAMRole", resource_id: "arn:aws:iam::111111111111:role/fixture-web-role", timestamp: "2026-09-17T08:11:31+00:00", status: "completed", metadata: { event_kind: "operation" } }],
  summary: { total_events: 1 }, chart_data: [],
  operation_ledger: { complete: true, unavailable_reason: null, count: 1, unattributed_to_system: 0, reader_binding: { state: "bound", table: "cyntro-remediation-state-fixture-webshop", region: "eu-west-1", role_arn: "arn:aws:iam::111111111111:role/CyntroLifecycleRead-fixture-webshop" } },
  scope: { tenant_id: "fixture-webshop", account_id: "111111111111", resolved_by: "server", requested_region: null, applied_dimensions: ["tenant_id", "account_id"], region_filter: "NOT_APPLIED", applied_to: ["operation_ledger"], not_filtered_by_claim: ["graph_events", "canonical_operations"] },
}
const LISTING_OK = {
  scope: { tenant_id: "fixture-webshop", account_id: "111111111111", region: null, resolved_by: "server" },
  selectors: { system_name: "fixture-shop", resource_arn: null, limit: 50 }, complete: true, incomplete_reason: null,
  sources: [{ source: "operation_ledger", state: "read", rows: 1, examined: 2, withheld: 0, withheld_reasons: {}, unsettled: 0, unsettled_operations: [] },
            { source: "graph_iam_snapshots", state: "refused", reason: "SNAPSHOT_SCOPE_UNPROVEN" }],
  snapshots: [{ snapshot_id: "IAMRole-fixture-web-role-aa82a276", operation_id: "op-1", resource_arn: "arn:aws:iam::111111111111:role/fixture-web-role", current: { code: "CURRENT", operationId: "op-1" }, rollback_available: true, scope_proof: "PROVEN_TENANT_ACCOUNT" }],
  count: 1, total_rows: 1,
}
const GROUP_REFUSED = { detail: { code: "REVIEW_SCOPE_GROUP_UNSUPPORTED", message: "An account group is not a single account; select one account. No history was read.", claimed_group: "grp-1" } }

beforeEach(() => { upstream = [] })
afterEach(() => { vi.unstubAllGlobals() })

describe("the timeline proxy: one bounded fresh read, typed answers, no substitute", () => {
  it("forwards the page's claims, the system and the selectors, and the reader's body verbatim", async () => {
    stubBackend(() => json(TIMELINE_OK))
    const response = await timelineGET(request("/api/proxy/remediation-history/timeline?system_name=fixture-shop&customer_id=fixture-webshop&account_id=111111111111&region=us-east-1&start_date=a&end_date=b&force_refresh=true&envelope=true"))
    expect(response.status).toBe(200)
    expect(upstream).toHaveLength(1)
    const q = query(upstream[0])
    expect(upstream[0].startsWith("https://backend.example/api/remediation-history/timeline?")).toBe(true)
    expect([q.get("customer_id"), q.get("account_id"), q.get("region"), q.get("system_name"), q.get("limit"), q.get("envelope"), q.get("force_refresh")])
      .toEqual(["fixture-webshop", "111111111111", "us-east-1", "fixture-shop", "200", "true", "true"])
    expect(await response.json()).toEqual(TIMELINE_OK)
    expect(response.headers.get("X-Cache")).toBe("BYPASS")
  })

  it("forwards a specific group claim and the reader's typed 422 with its body", async () => {
    stubBackend(url => query(url).get("account_group") === "grp-1" ? json(GROUP_REFUSED, 422) : json(TIMELINE_OK))
    const response = await timelineGET(request("/api/proxy/remediation-history/timeline?account_group=grp-1&limit=1"))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(GROUP_REFUSED)
  })

  it.each([
    [403, { detail: { code: "REVIEW_SCOPE_MISMATCH", message: "foreign" } }],
    [503, { detail: { code: "REVIEW_SCOPE_UNAVAILABLE", message: "unconfigured" } }],
    [404, { detail: "Not Found" }],
  ])("a backend %s keeps its status and body: never an empty timeline, never a last-good body", async (status, body) => {
    stubBackend(() => json(body, status))
    const response = await timelineGET(request("/api/proxy/remediation-history/timeline?limit=1"))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
  })

  it("a transport failure is a named 503, not an empty success", async () => {
    stubBackend(() => { throw Object.assign(new Error("boom"), { name: "TypeError" }) })
    const response = await timelineGET(request("/api/proxy/remediation-history/timeline?limit=1"))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.detail.code).toBe("HISTORY_UPSTREAM_UNAVAILABLE")
    expect(body.events).toBeUndefined()
  })

  it("a warm success is not reused: the same request's later refusal is what the caller gets", async () => {
    let n = 0
    stubBackend(() => { n += 1; return n === 1 ? json(TIMELINE_OK) : json({ detail: { code: "HISTORY_STORAGE_UNCONFIGURED", message: "removed" } }, 503) })
    const path = "/api/proxy/remediation-history/timeline?system_name=fixture-shop&customer_id=fixture-webshop&limit=200"
    expect((await timelineGET(request(path))).status).toBe(200)
    const second = await timelineGET(request(path))
    expect(second.status).toBe(503)
    expect((await second.json()).detail.code).toBe("HISTORY_STORAGE_UNCONFIGURED")
    expect(upstream).toHaveLength(2)
  })

  it("a quiet answer is returned as the backend gave it, with one upstream read and no retry", async () => {
    stubBackend(() => json({ ...TIMELINE_OK, events: [], summary: { total_events: 0 } }))
    const response = await timelineGET(request("/api/proxy/remediation-history/timeline?limit=1"))
    expect(response.status).toBe(200)
    expect((await response.json()).events).toEqual([])
    expect(upstream).toHaveLength(1)
  })
})

describe("the snapshot listing proxies: the canonical scoped listing only", () => {
  it("/api/proxy/snapshots asks the canonical listing once with the claims and forwards its envelope, naming the retired readers", async () => {
    stubBackend(() => json(LISTING_OK))
    const response = await snapshotsGET(request("/api/proxy/snapshots?system_name=fixture-shop&customer_id=fixture-webshop&account_id=111111111111&limit=200&force_refresh=true"))
    expect(response.status).toBe(200)
    expect(upstream).toHaveLength(1)
    expect(upstream[0].startsWith("https://backend.example/api/snapshots?")).toBe(true)
    const q = query(upstream[0])
    expect([q.get("system_name"), q.get("customer_id"), q.get("account_id"), q.get("limit"), q.get("force_refresh")]).toEqual(["fixture-shop", "fixture-webshop", "111111111111", "200", "true"])
    const body = await response.json()
    expect(body.scope).toEqual(LISTING_OK.scope)
    expect(body.snapshots).toEqual(LISTING_OK.snapshots)
    expect(body.sources).toEqual(LISTING_OK.sources)
    expect(body.proxy_retired_sources.map((s: { source: string; state: string; reason: string }) => [s.source, s.state, s.reason])).toEqual([
      ["remediation_snapshots_legacy", "not_requested", "SNAPSHOT_SCOPE_UNPROVEN"],
      ["s3_remediation_checkpoints", "not_requested", "SNAPSHOT_SCOPE_UNPROVEN"],
      ["sg_least_privilege_snapshots", "not_requested", "SNAPSHOT_SCOPE_UNPROVEN"],
    ])
    expect(upstream.some(u => u.includes("/api/remediation/snapshots") || u.includes("/api/s3-remediation/") || u.includes("/api/sg-least-privilege/"))).toBe(false)
  })

  it.each([
    [403, { detail: { code: "REVIEW_SCOPE_MISMATCH", message: "foreign" } }],
    [422, { detail: { code: "SNAPSHOT_SELECTOR_NAME_REFUSED", message: "names recur" } }],
    [503, { detail: { code: "SNAPSHOT_LISTING_UNAVAILABLE", reason: "HISTORY_STORAGE_UNCONFIGURED", scope: LISTING_OK.scope, sources: [] } }],
  ])("/api/proxy/snapshots forwards a typed %s with its body, never an empty collection", async (status, body) => {
    stubBackend(() => json(body, status))
    const response = await snapshotsGET(request("/api/proxy/snapshots?limit=50"))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
  })

  it("/api/proxy/snapshots turns a transport failure into a named 503, not {snapshots: []}", async () => {
    stubBackend(() => { throw Object.assign(new Error("boom"), { name: "TypeError" }) })
    const response = await snapshotsGET(request("/api/proxy/snapshots?limit=50"))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.detail.code).toBe("SNAPSHOT_LISTING_PROXY_UNAVAILABLE")
    expect(body.snapshots).toBeUndefined()
  })

  it("/api/proxy/iam-snapshots forwards the same envelope as an object, never an array, and never turns a 404 or failure into []", async () => {
    stubBackend(() => json(LISTING_OK))
    const ok = await iamSnapshotsGET(request("/api/proxy/iam-snapshots?force_refresh=true&customer_id=fixture-webshop&account_id=111111111111"))
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(Array.isArray(body)).toBe(false)
    expect(body.snapshots).toEqual(LISTING_OK.snapshots)
    expect(query(upstream[0]).get("account_id")).toBe("111111111111")

    stubBackend(() => json({ detail: "Not Found" }, 404))
    const missing = await iamSnapshotsGET(request("/api/proxy/iam-snapshots"))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ detail: "Not Found" })

    stubBackend(() => { throw new Error("boom") })
    const failed = await iamSnapshotsGET(request("/api/proxy/iam-snapshots"))
    expect(failed.status).toBe(503)
    expect((await failed.json()).detail.code).toBe("SNAPSHOT_LISTING_PROXY_UNAVAILABLE")
  })

  it("/api/proxy/snapshots/[id] reads the canonical detail with the claims and forwards typed answers", async () => {
    const detail = { snapshot_id: "IAMRole-fixture-web-role-aa82a276", source: "lifecycle_checkpoint", operation_id: "op-1", current: { code: "CURRENT", operationId: "op-1" }, rollback_available: true, scope_proof: "PROVEN_TENANT_ACCOUNT" }
    stubBackend(() => json(detail))
    const ok = await detailGET(request("/api/proxy/snapshots/IAMRole-fixture-web-role-aa82a276?customer_id=fixture-webshop&account_id=111111111111"), { params: Promise.resolve({ snapshotId: "IAMRole-fixture-web-role-aa82a276" }) })
    expect(ok.status).toBe(200)
    expect(upstream[0].startsWith("https://backend.example/api/snapshots/IAMRole-fixture-web-role-aa82a276?")).toBe(true)
    expect(query(upstream[0]).get("account_id")).toBe("111111111111")
    expect(await ok.json()).toEqual(detail)

    const notFound = { detail: { code: "SNAPSHOT_NOT_FOUND", message: "No IAM boundary checkpoint with this id exists in this tenant's lifecycle storage.", snapshot_id: "nope" } }
    stubBackend(() => json(notFound, 404))
    const missing = await detailGET(request("/api/proxy/snapshots/nope"), { params: Promise.resolve({ snapshotId: "nope" }) })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual(notFound)
    expect(upstream.some(u => u.includes("/api/remediation/snapshots/"))).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Root187: an unreadable upstream SUCCESS is a named non-success, never {} or {snapshots: []}; every read is bounded
// through body consumption (the raw loopback control pa187-undici-abort-body-control-1 shows Node's fetch rejects a
// body read only while the request's own signal is still armed), and the timer is cleared on every outcome.
// ---------------------------------------------------------------------------------------------------------------

type Handler = () => Promise<Response>
const DETAIL_ID = "IAMRole-fixture-web-role-aa82a276"
const READERS: Array<[string, Handler, string, number]> = [
  ["timeline", () => timelineGET(request("/api/proxy/remediation-history/timeline?limit=1")), "HISTORY_UPSTREAM_UNAVAILABLE", 20_000],
  ["snapshots", () => snapshotsGET(request("/api/proxy/snapshots?limit=50")), "SNAPSHOT_LISTING_PROXY_UNAVAILABLE", 30_000],
  ["iam-snapshots", () => iamSnapshotsGET(request("/api/proxy/iam-snapshots")), "SNAPSHOT_LISTING_PROXY_UNAVAILABLE", 30_000],
  ["snapshots/[id]", () => detailGET(request(`/api/proxy/snapshots/${DETAIL_ID}`), { params: Promise.resolve({ snapshotId: DETAIL_ID }) }), "SNAPSHOT_DETAIL_PROXY_UNAVAILABLE", 30_000],
]
const text200 = (text: string) => new Response(text, { status: 200, headers: { "content-type": "application/json" } })

describe.each(READERS)("%s: an unreadable HTTP 200 is a named unavailability, never an empty collection", (_name, handler, code) => {
  it.each([
    ["invalid JSON", "<html>proxy error page</html>", "BODY_UNREADABLE"],
    ["an empty body", "", "BODY_EMPTY"],
    ["a JSON array", "[]", "BODY_NOT_OBJECT"],
    ["JSON null", "null", "BODY_NOT_OBJECT"],
  ])("HTTP 200 with %s", async (_label, text, reason) => {
    stubBackend(() => text200(text))
    const response = await handler()
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.detail.code).toBe(code)
    expect(body.detail.reason).toBe(reason)
    expect(body.snapshots).toBeUndefined()
    expect(body.events).toBeUndefined()
    expect(upstream).toHaveLength(1)
  })
})

describe("bounds: every read is bounded through body consumption and leaves no timer armed", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }) })
  afterEach(() => { vi.useRealTimers() })
  const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise<void>(resolve => setImmediate(resolve)) }

  // A stalled upstream as Node's fetch delivers it: headers now, a body that only ends when the request's own signal
  // aborts. Without a signal the body never ends.
  function stalled(init?: RequestInit): Response {
    const signal = init?.signal
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"))
        signal?.addEventListener("abort", () => controller.error(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })), { once: true })
      },
    })
    return new Response(stream, { status: 200, headers: { "content-type": "application/json" } })
  }

  it.each(READERS)("%s: a body that never completes is aborted at exactly the route's bound and answered as a named TIMEOUT", async (_name, handler, code, bound) => {
    stubBackend((_url, init) => stalled(init))
    const got: { response: Response | null } = { response: null }
    void handler().then(response => { got.response = response })
    await vi.advanceTimersByTimeAsync(bound - 1)
    await flush()
    expect(upstreamInit[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(got.response).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(got.response).not.toBeNull()
    expect(got.response!.status).toBe(503)
    const body = await got.response!.json()
    expect(body.detail.code).toBe(code)
    expect(body.detail.reason).toBe("TIMEOUT")
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(READERS)("%s: a thrown fetch, a typed refusal, a success and an unreadable success each leave no timer armed", async (_name, handler) => {
    stubBackend(() => { throw Object.assign(new Error("boom"), { name: "TypeError" }) })
    expect((await handler()).status).toBe(503)
    expect(vi.getTimerCount()).toBe(0)
    stubBackend(() => json({ detail: { code: "REVIEW_SCOPE_MISMATCH", message: "foreign" } }, 403))
    expect((await handler()).status).toBe(403)
    expect(vi.getTimerCount()).toBe(0)
    stubBackend(() => json({ ok: true }))
    expect((await handler()).status).toBe(200)
    expect(vi.getTimerCount()).toBe(0)
    stubBackend(() => text200("<html>"))
    expect((await handler()).status).toBe(502)
    expect(vi.getTimerCount()).toBe(0)
  })
})
