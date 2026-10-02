/**
 * C1 (Codex H1-F1 review of 1f9df88f): the issues-summary proxy's last-complete store is REVOKED by any
 * refusal of this caller/scope (401/403/422, a typed hold) or a held/partial answer -- a later transport
 * failure must not replay what the backend took away. And no in-flight request may undo a revocation:
 * neither an older request that lands READY after it, nor a replay copied before it.
 *
 * The proxy's store is module-level and survives between tests, so each test uses its own systemName.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/issues-summary/route"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const READY = (total: number) => ({ serve_state: "READY", analysis_complete: true, total, success: true })
const HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }
const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are connected" } }

type Settle = { promise: Promise<Response>; resolve: (r: Response) => void; reject: (e: unknown) => void }
function deferred(): Settle {
  let resolve!: (r: Response) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let answers: Array<Response | Settle | (() => never)> = []
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  answers = []
  vi.stubGlobal("fetch", vi.fn(async () => {
    const next = answers.shift()
    if (!next) throw new Error("no backend answer queued")
    if (typeof next === "function") return next()
    return next instanceof Response ? next : next.promise
  }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const req = (system: string) => new NextRequest(`https://example.test/api/proxy/issues-summary?systemName=${system}`)
const abort = (): never => {
  const e = new Error("aborted")
  e.name = "AbortError"
  throw e
}

describe("issues-summary: a refusal revokes the last complete summary", () => {
  it("Codex probe: 200 READY -> 403 -> 502 never replays the READY counts", async () => {
    answers = [json(200, READY(739)), json(403, { detail: "forbidden" }), json(502, {})]
    expect((await GET(req("c1-probe"))).status).toBe(200)
    expect((await GET(req("c1-probe"))).status).toBe(403)
    const final = await GET(req("c1-probe"))
    expect(final.status).toBe(502)
    expect((await final.json()).total).toBeUndefined()
  })

  it.each([
    ["401", () => json(401, { detail: "session" })],
    ["422 scope required", () => json(422, SCOPE_REQUIRED)],
    ["503 typed hold", () => json(503, HELD)],
  ])("a %s refusal revokes it too -- a later transport failure or timeout replays nothing", async (name, refusal) => {
    const system = `c1-${name.replace(/\W+/g, "-")}`
    answers = [json(200, READY(10)), refusal(), json(502, {}), abort]
    await GET(req(system))
    await GET(req(system))
    expect((await (await GET(req(system))).json()).total).toBeUndefined()
    const timedOut = await GET(req(system))
    expect((await timedOut.json()).total).toBeUndefined()
  })

  it("a held 200 answer revokes it as well", async () => {
    answers = [json(200, READY(20)), json(200, { serve_state: "NOT_READY", analysis_complete: false, total: 3 }), json(502, {})]
    await GET(req("c1-held-200"))
    await GET(req("c1-held-200"))
    expect((await (await GET(req("c1-held-200"))).json()).fromStaleCache).toBeUndefined()
  })
})

describe("issues-summary: no in-flight request undoes a revocation", () => {
  it("an older request answering READY after a newer refusal is returned to its caller but not stored", async () => {
    const older = deferred()
    answers = [older, json(403, { detail: "forbidden" }), json(502, {})]
    const pendingOlder = GET(req("c1-late-refill"))
    expect((await GET(req("c1-late-refill"))).status).toBe(403)
    older.resolve(json(200, READY(739)))
    expect((await (await pendingOlder).json()).total).toBe(739)   // its own live answer
    const later = await GET(req("c1-late-refill"))
    expect((await later.json()).total).toBeUndefined()           // ...never the next replay
  })

  it("an older READY landing after a newer HELD 200 answer is not stored either", async () => {
    const older = deferred()
    answers = [older, json(200, { serve_state: "NOT_READY", analysis_complete: false, total: 3 }), json(502, {})]
    const pendingOlder = GET(req("c1-late-after-held"))
    await GET(req("c1-late-after-held"))
    older.resolve(json(200, READY(700)))
    await pendingOlder
    expect((await (await GET(req("c1-late-after-held"))).json()).total).toBeUndefined()
  })

  it.each([
    ["backend 502", (d: Settle) => d.resolve(json(502, {}))],
    ["timeout", (d: Settle) => { const e = new Error("aborted"); e.name = "AbortError"; d.reject(e) }],
  ])("a request started before a refusal never replays the summary it could have copied (%s)", async (_name, fail) => {
    const system = `c1-replay-${_name.replace(/\W+/g, "-")}`
    const inFlight = deferred()
    answers = [json(200, READY(55)), inFlight, json(403, { detail: "forbidden" })]
    await GET(req(system))                                      // stores READY 55
    const pending = GET(req(system))                            // started while 55 was stored
    expect((await GET(req(system))).status).toBe(403)           // revoked meanwhile
    fail(inFlight)
    const body = await (await pending).json()
    expect(body.total).toBeUndefined()
    expect(body.fromStaleCache).toBeUndefined()
  })
})

describe("controls: transport alone still replays, marked stale", () => {
  it("200 READY -> 502 replays the counts as stale, scores withheld (Codex control)", async () => {
    answers = [json(200, READY(741)), json(502, {})]
    await GET(req("c1-transport"))
    const final = await (await GET(req("c1-transport"))).json()
    expect(final.total).toBe(741)
    expect(final.fromStaleCache).toBe(true)
    expect(final.serve_state).toBe("NOT_READY")
  })

  it("200 READY -> timeout replays the counts as stale", async () => {
    answers = [json(200, READY(742)), abort]
    await GET(req("c1-timeout"))
    const final = await (await GET(req("c1-timeout"))).json()
    expect(final.total).toBe(742)
    expect(final.staleReason).toBe("timeout")
  })

  it("a READY answer after an EARLIER refusal is stored again (revocation is not permanent)", async () => {
    answers = [json(403, { detail: "forbidden" }), json(200, READY(9)), json(502, {})]
    await GET(req("c1-recover"))
    await GET(req("c1-recover"))
    const final = await (await GET(req("c1-recover"))).json()
    expect(final.total).toBe(9)
    expect(final.fromStaleCache).toBe(true)
  })
})
