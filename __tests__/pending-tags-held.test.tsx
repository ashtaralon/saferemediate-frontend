/**
 * B2 (frontend): the v1 Pending Tags queue, held by name on an install, reads as that state -- never "No pending
 * tags" and never a count. End to end in one process: PendingApprovals -> the REAL proxy
 * (app/api/proxy/auto-tagger/pending) -> the backend answer. The backend bodies are the ones the install answers
 * (backend 88963d2e, tests/test_pending_tags_install_hold.py): 503 SERVING_ROUTE_HELD / HELD_CUSTOMER_READ for a
 * workload account, 422 ACCOUNT_SCOPE_REQUIRED with several accounts and none named.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/auto-tagger/pending/route"
import { PendingApprovals } from "@/components/pending-approvals"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }
const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered; name one with account_id" } }

let backend: () => Response | Promise<Response>
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.includes("/api/auto-tagger/pending") && !url.startsWith("/api/proxy")) return backend()
    if (url.startsWith("/api/proxy/auto-tagger/pending")) return GET(new NextRequest(`http://localhost${url}`))
    throw new Error(`unexpected fetch ${url}`)
  }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const proxied = async () => (await GET(new NextRequest("http://localhost/api/proxy/auto-tagger/pending?status=pending"))).json()

describe("the proxy: nothing read is never a list or a count", () => {
  it("relays a typed hold -- allowlisted fields only -- with pending and count null", async () => {
    backend = () => json(503, { detail: { ...HELD.detail, internal: "not-for-the-browser" } })
    const out = await proxied()
    expect(out).toMatchObject({ pending: null, count: null, unavailable: true, backend_status: 503 })
    expect(out.hold).toEqual({ code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ", read_model: null })
    expect(JSON.stringify(out)).not.toContain("not-for-the-browser")
  })

  it("an untyped failure or a network error carries no hold, and still no list or count", async () => {
    backend = () => json(500, { detail: "boom" })
    const failed = await proxied()
    expect(failed).toMatchObject({ pending: null, count: null, unavailable: true })
    expect(failed.hold).toBeUndefined()
    backend = () => { throw new TypeError("network down") }
    expect(await proxied()).toMatchObject({ pending: null, count: null, unavailable: true })
  })
})

describe("the page says which state it is", () => {
  it("held on an install: the hold, never 'No pending tags'", async () => {
    backend = () => json(503, HELD)
    render(<PendingApprovals />)
    await waitFor(() => expect(document.body.textContent).toContain(
      "Pending approvals: Route held by the server — SERVING_ROUTE_HELD: HELD_CUSTOMER_READ"))
    expect(screen.queryByText("No pending tags")).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain("HTTP 503")
  })

  it("several accounts and none named: the neutral scope words", async () => {
    backend = () => json(422, SCOPE_REQUIRED)
    render(<PendingApprovals />)
    await waitFor(() => expect(document.body.textContent).toContain("this view does not read one selected account"))
    expect(screen.queryByText("No pending tags")).not.toBeInTheDocument()
  })

  it("control: an untyped backend failure keeps the proxy's own message", async () => {
    backend = () => json(500, {})
    render(<PendingApprovals />)
    await waitFor(() => expect(document.body.textContent).toContain("Approvals backend returned HTTP 500"))
  })

  it("control: a queue that was READ and is empty still says No pending tags", async () => {
    backend = () => json(200, { count: 0, pending: [] })
    render(<PendingApprovals />)
    expect(await screen.findByText("No pending tags")).toBeInTheDocument()
  })
})
