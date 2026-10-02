/**
 * C2 (Codex H1-F1 review of 1f9df88f): the remediation-timeline proxy's cached list is REVOKED by any refusal
 * of this caller/scope (401/403/422, a typed hold) -- on the first read AND on the empty-answer retry -- so
 * no later HIT, stale replay or stale-over-empty serves it, and no request already in flight can store its
 * older list after the refusal.
 *
 * The proxy cache and the revocation count are module-level, so each test uses its own system_name.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/remediation-history/timeline/route"
import { setCached } from "@/lib/server/proxy-cache"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const LIST = (id: string) => ({ events: [{ event_id: id, timestamp: "2026-10-01T00:00:00Z" }], chart_data: [] })
const EMPTY = { events: [], chart_data: [] }
const HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }
const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are connected" } }

type Settle = { promise: Promise<Response>; resolve: (r: Response) => void }
function deferred(): Settle {
  let resolve!: (r: Response) => void
  const promise = new Promise<Response>((res) => { resolve = res })
  return { promise, resolve }
}

let answers: Array<Response | Settle> = []
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  answers = []
  vi.stubGlobal("fetch", vi.fn(async () => {
    const next = answers.shift()
    if (!next) throw new Error("no backend answer queued")
    return next instanceof Response ? next : next.promise
  }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const key = (system: string) => `remediation-timeline:system_name=${system}&limit=1`
const req = (system: string, force = false) =>
  new NextRequest(`https://example.test/api/proxy/remediation-history/timeline?system_name=${system}&limit=1${force ? "&force_refresh=true" : ""}`)
const body = async (system: string, force = false) => (await GET(req(system, force))).json()

describe("timeline: a refusal revokes the cached list", () => {
  it("Codex probe: a forced 403 then an ordinary GET never serves the still-fresh cached event", async () => {
    setCached(key("c2-probe"), LIST("old-revoked"), 60_000)
    answers = [json(403, { detail: "forbidden" }), json(502, {})]
    expect((await body("c2-probe", true)).events).toEqual([])
    const after = await body("c2-probe")
    expect(after.events).toEqual([])
    expect(after.degraded).toBe(true)
  })

  it.each([
    ["401", () => json(401, { detail: "session" })],
    ["422 scope required", () => json(422, SCOPE_REQUIRED)],
    ["503 typed hold", () => json(503, HELD)],
  ])("a %s refusal revokes it -- a later 5xx or network error replays nothing", async (name, refusal) => {
    const system = `c2-${name.replace(/\W+/g, "-")}`
    answers = [json(200, LIST("before")), refusal(), json(502, {})]
    expect((await body(system)).events).toHaveLength(1)
    expect((await body(system, true)).events).toEqual([])
    expect((await body(system, true)).events).toEqual([])        // 502: no replay
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down") }))
    expect((await body(system, true)).events).toEqual([])        // network error: no replay
  })

  it("a refused EMPTY-ANSWER RETRY revokes too: older events are never put over it", async () => {
    setCached(key("c2-retry"), LIST("older"), -1)                 // expired: only stale paths could use it
    answers = [json(200, EMPTY), json(403, { detail: "forbidden" }), json(502, {})]
    const out = await body("c2-retry")
    expect(out.events).toEqual([])
    expect(out.degraded).toBe(true)
    expect(out.stale).toBeUndefined()
    expect((await body("c2-retry")).events).toEqual([])           // and nothing left to replay
  })
})

describe("timeline: no in-flight request undoes a revocation", () => {
  it("an older request answering events after a newer refusal is returned to its caller but not stored", async () => {
    const older = deferred()
    answers = [older, json(403, { detail: "forbidden" }), json(502, {})]
    const pending = GET(req("c2-late"))
    expect((await body("c2-late", true)).events).toEqual([])
    older.resolve(json(200, LIST("late")))
    expect((await (await pending).json()).events).toHaveLength(1)
    const after = await body("c2-late")
    expect(after.events).toEqual([])
    expect(after.degraded).toBe(true)
  })
})

describe("timeline: an older EMPTY answer after a refusal is not stored either", () => {
  it("the next request asks the backend again instead of a cached 'idle' HIT over the refusal", async () => {
    const older = deferred()
    const olderRetry = deferred()
    answers = [older, json(403, { detail: "forbidden" }), olderRetry, json(502, {})]
    const pending = GET(req("c2-late-empty"))
    expect((await body("c2-late-empty", true)).events).toEqual([])
    older.resolve(json(200, EMPTY))
    await new Promise((r) => setTimeout(r, 300))                  // the proxy's 250ms empty-answer pause
    olderRetry.resolve(json(200, EMPTY))
    await pending
    const next = await GET(req("c2-late-empty"))
    expect(next.headers.get("X-Cache")).not.toBe("HIT")
    expect((await next.json()).degraded).toBe(true)
  })
})

describe("controls", () => {
  it("transport alone replays the older list, stamped stale (Codex control's counterpart)", async () => {
    answers = [json(200, LIST("kept")), json(500, {})]
    await body("c2-transport")
    const out = await body("c2-transport", true)
    expect(out.events).toHaveLength(1)
    expect(out.stale).toBe(true)
  })

  it("an empty answer with an empty retry still prefers the older events, stamped stale", async () => {
    setCached(key("c2-over-empty"), LIST("warm"), -1)
    answers = [json(200, EMPTY), json(200, EMPTY)]
    const out = await body("c2-over-empty")
    expect(out.events).toHaveLength(1)
    expect(out.stale).toBe(true)
  })

  it("a list after an EARLIER refusal is cached again (revocation is not permanent)", async () => {
    answers = [json(403, { detail: "forbidden" }), json(200, LIST("again"))]
    await body("c2-recover")
    await body("c2-recover")
    const hit = await GET(req("c2-recover"))                               // no backend answer queued
    expect(hit.headers.get("X-Cache")).toBe("HIT")
    expect((await hit.json()).events[0].event_id).toBe("again")
  })
})
