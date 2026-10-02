/**
 * C3: the LiveNowStrip never keeps an event on screen over a REFUSAL of this caller/scope -- silent poll or
 * not. Two shapes reach it: the proxy answering 401/403 itself (an expired session), and a backend refusal the
 * timeline proxy relays inside its 200 envelope as ``refused`` (status + typed code/reason). A transport
 * failure still keeps the shown event (the strip's own no-downgrade rule).
 */
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/remediation-history/timeline/route"
import { LiveNowStrip } from "@/components/live-now-strip"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const EVENT = { events: [{ event_id: "ev-1", timestamp: new Date().toISOString(), resource_id: "role/shown-before",
                           action_type: "PERMISSION_REMOVAL", status: "completed" }] }
const envelope = (refused?: object) => ({ events: [], chart_data: [], degraded: true, ...(refused ? { refused } : {}) })

let answers: Response[] = []
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  answers = []
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
  vi.stubGlobal("fetch", vi.fn(async () => {
    const next = answers.shift()
    if (!next) throw new Error("no answer queued")
    return next
  }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const poll = () => act(async () => { vi.advanceTimersByTime(60_000) })
const shown = () => document.body.textContent ?? ""

async function showEventThenPoll(answer: Response) {
  answers = [json(200, EVENT), answer]
  render(<LiveNowStrip />)
  await flush()
  expect(shown()).toContain("role/shown-before")
  await poll()
  await flush()
}

describe("LiveNowStrip: a refusal drops the shown event, even on a silent poll", () => {
  it.each([
    [401, "Your session is no longer valid — sign in again"],
    [403, "Not permitted for this account or scope"],
  ])("the proxy answering %i itself", async (status, words) => {
    await showEventThenPoll(json(status, {}))
    expect(shown()).not.toContain("role/shown-before")
    expect(shown()).toContain(words)
  })

  it.each([
    [{ status: 403, code: null, reason: null }, "Not permitted for this account or scope"],
    [{ status: 401, code: null, reason: null }, "Your session is no longer valid — sign in again"],
    [{ status: 422, code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered" },
     "this view does not read one selected account"],
    [{ status: 503, code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" },
     "Route held by the server — SERVING_ROUTE_HELD: HELD_CUSTOMER_READ"],
  ])("a backend refusal relayed in the proxy's envelope (%o)", async (refused, words) => {
    await showEventThenPoll(json(200, envelope(refused)))
    expect(shown()).not.toContain("role/shown-before")
    expect(shown()).toContain(words)
  })

  it("an initial load refused says so in words, not as a bare status", async () => {
    answers = [json(403, {})]
    render(<LiveNowStrip />)
    await flush()
    expect(shown()).toContain("Not permitted for this account or scope")
    expect(shown()).not.toContain("HTTP 403")
  })
})

describe("controls: a transport failure on a silent poll keeps the shown event", () => {
  it.each([
    ["the proxy's degraded envelope (no refusal)", () => json(200, envelope())],
    ["an HTTP 500", () => json(500, {})],
  ])("%s", async (_name, answer) => {
    await showEventThenPoll(answer())
    expect(shown()).toContain("role/shown-before")
  })
})

describe("timeline proxy: its refusal envelope says it is a refusal, and nothing else of the body", () => {
  const req = (system: string) =>
    new NextRequest(`https://example.test/api/proxy/remediation-history/timeline?system_name=${system}&limit=1`)

  it("a first-read refusal carries status + typed code/reason only", async () => {
    vi.useRealTimers()
    answers = [json(503, { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ", internal: "not-for-the-browser" } })]
    const out = await (await GET(req("c3-typed"))).json()
    expect(out.degraded).toBe(true)
    expect(out.refused).toEqual({ status: 503, code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" })
    answers = [json(403, { detail: "forbidden" })]
    expect((await (await GET(req("c3-plain"))).json()).refused).toEqual({ status: 403, code: null, reason: null })
  })

  it("a refused empty-answer retry carries it too", async () => {
    vi.useRealTimers()
    answers = [json(200, { events: [], chart_data: [] }), json(401, {})]
    expect((await (await GET(req("c3-retry"))).json()).refused).toEqual({ status: 401, code: null, reason: null })
  })

  it("control: a transport failure's degraded envelope carries no refusal", async () => {
    vi.useRealTimers()
    answers = [json(502, {})]
    const out = await (await GET(req("c3-transport"))).json()
    expect(out.degraded).toBe(true)
    expect(out.refused).toBeUndefined()
  })
})
