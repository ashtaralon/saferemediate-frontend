/**
 * LiveNowStrip (components/live-now-strip.tsx, mounted by the Operations view and system detail):
 * only the NEWEST request settles the strip. Its requests overlap -- the initial load, the 60s
 * poll, a scope change -- and an older answer that lands last must never overwrite a newer one,
 * nor show another system's event.
 */
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LiveNowStrip } from "@/components/live-now-strip"

type Settle<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Settle<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A timeline answer whose BODY can also be held back (res.json() pending). */
function answer(status: number, body: unknown, bodyGate?: Promise<void>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (bodyGate) await bodyGate
      return body
    },
  } as unknown as Response
}

const event = (resource_id: string) => ({
  events: [{ event_id: `ev-${resource_id}`, timestamp: new Date().toISOString(), resource_id,
             action_type: "PERMISSION_REMOVAL", status: "completed" }],
})

let calls: { url: string; reply: Settle<Response> }[] = []

beforeEach(() => {
  calls = []
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const reply = deferred<Response>()
    calls.push({ url: String(url), reply })
    return reply.promise
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const poll = () => act(async () => { vi.advanceTimersByTime(60_000) })
const shown = () => document.body.textContent ?? ""

describe("LiveNowStrip: only the newest request settles it", () => {
  it("a superseded system's answer never lands under the new system", async () => {
    const view = render(<LiveNowStrip systemName="alpha" />)
    view.rerender(<LiveNowStrip systemName="beta" />)
    expect(calls.map((c) => new URL(c.url, "http://x").searchParams.get("system_name"))).toEqual(["alpha", "beta"])
    await act(async () => calls[1].reply.resolve(answer(200, event("role/beta-app"))))
    await flush()
    expect(shown()).toContain("role/beta-app")
    await act(async () => calls[0].reply.resolve(answer(200, event("role/alpha-app"))))
    await flush()
    expect(shown()).toContain("role/beta-app")
    expect(shown()).not.toContain("role/alpha-app")
  })

  it("an older load answering empty after a newer poll found an event never overwrites it", async () => {
    render(<LiveNowStrip />)
    await poll()
    expect(calls).toHaveLength(2)
    await act(async () => calls[1].reply.resolve(answer(200, event("role/newest"))))
    await flush()
    expect(shown()).toContain("role/newest")
    await act(async () => calls[0].reply.resolve(answer(200, { events: [] })))
    await flush()
    expect(shown()).toContain("role/newest")
    expect(shown()).not.toContain("Engine idle")
  })

  // The older request is the initial load (NOT silent): a silent poll's failure is already kept off
  // a shown event by the strip's own downgrade rule, which would hide a missing ordering guard.
  it.each([
    ["an HTTP failure", (r: Settle<Response>) => r.resolve(answer(503, {}))],
    ["a network error", (r: Settle<Response>) => r.reject(new TypeError("network down"))],
  ])("an older load's %s after a newer success never overwrites it", async (_name, fail) => {
    render(<LiveNowStrip />)
    await poll()
    expect(calls).toHaveLength(2)
    await act(async () => calls[1].reply.resolve(answer(200, event("role/newest"))))
    await flush()
    expect(shown()).toContain("role/newest")
    await act(async () => fail(calls[0].reply))
    await flush()
    expect(shown()).toContain("role/newest")
    expect(shown()).not.toContain("Couldn't refresh activity")
  })

  it("an older answer whose body arrives after a newer request settled never overwrites it", async () => {
    render(<LiveNowStrip />)
    const body = deferred<void>()
    await act(async () => calls[0].reply.resolve(answer(200, { events: [] }, body.promise)))   // headers in, body held
    await poll()
    await act(async () => calls[1].reply.resolve(answer(200, event("role/newest"))))
    await flush()
    expect(shown()).toContain("role/newest")
    await act(async () => body.resolve())
    await flush()
    expect(shown()).toContain("role/newest")
    expect(shown()).not.toContain("Engine idle")
  })

  it("control: answers in order settle as before -- a newer poll's event replaces the older one", async () => {
    render(<LiveNowStrip />)
    await act(async () => calls[0].reply.resolve(answer(200, event("role/first"))))
    await flush()
    expect(shown()).toContain("role/first")
    await poll()
    await act(async () => calls[1].reply.resolve(answer(200, event("role/second"))))
    await flush()
    expect(shown()).toContain("role/second")
    expect(shown()).not.toContain("role/first")
  })

  it("control: a single empty answer still reads idle", async () => {
    render(<LiveNowStrip />)
    await act(async () => calls[0].reply.resolve(answer(200, { events: [] })))
    await flush()
    expect(screen.getByText(/Engine idle/)).toBeTruthy()
  })
})
