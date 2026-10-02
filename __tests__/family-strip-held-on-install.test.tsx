/**
 * FamilyStrip on a control-plane install: the family aggregate is HELD there, and the strip must say so --
 * never empty or zero family scores, never a replayed older reading.
 *
 * End to end in-process: FamilyStrip -> the REAL proxy (app/api/proxy/family-aggregate) -> the backend
 * answer. The backend bodies are the ones /api/service-risk-scores/all-systems answered on an ENFORCED
 * control-plane install with two connected workload accounts, routes held at registration as
 * router_registry does (serving_read_guard.hold_customer_routes; module on ALLOWED_UNGATED_CUSTOMER_FACING
 * -> HELD_CUSTOMER_READ): unnamed 422, a workload account 503 held, a foreign claim 403.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/family-aggregate/route"
import { FamilyStrip } from "@/components/dashboard/v3/family-strip"
import { clearCached } from "@/lib/server/proxy-cache"

const HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }
const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are connected; name one with account_id" } }
const MISMATCH = { detail: { code: "INVENTORY_SCOPE_MISMATCH", reason: "CLAIM_OUTSIDE_SERVER_SCOPE" } }
const SERVED = {
  systems: [{ name: "payments" }], total: 1, errors: [],
  aggregate_layers: { privilege: { score: 62, weight: 40, contributing_systems: 1 },
                      network: { score: 71, weight: 12, contributing_systems: 1 },
                      data: { score: 88, weight: 5, contributing_systems: 1 } },
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

let backend: () => Response
let backendCalls = 0

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  window.localStorage.clear()
  clearCached("family-aggregate")
  backendCalls = 0
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.includes("/api/service-risk-scores/all-systems")) {
      backendCalls += 1
      return backend()
    }
    if (url.startsWith("/api/proxy/family-aggregate")) {
      return GET(new NextRequest(`http://localhost${url}`))
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  clearCached("family-aggregate")
})

const shown = () => document.body.textContent ?? ""
const noScores = () => {
  expect(shown()).not.toMatch(/\/100/)
  expect(shown()).not.toMatch(/No systems contribute scores/)
}

describe("FamilyStrip: the install's held family aggregate", () => {
  it("a workload account's held answer reads as held -- no scores, no empty families", async () => {
    backend = () => json(503, HELD)
    render(<FamilyStrip families={["data", "privilege", "network"]} />)
    await waitFor(() => expect(shown()).toContain("Route held by the server — SERVING_ROUTE_HELD: HELD_CUSTOMER_READ"))
    noScores()
  })

  it("an older cached reading is dropped, not shown, once the answer is held", async () => {
    window.localStorage.setItem("cyntro:swr:family-aggregate", JSON.stringify({
      data: { families: SERVED.aggregate_layers, contributing_systems: 1, total_systems: 1, errors: [] }, ts: Date.now() }))
    backend = () => json(503, HELD)
    render(<FamilyStrip families={["data", "privilege", "network"]} />)
    await waitFor(() => expect(shown()).toContain("SERVING_ROUTE_HELD: HELD_CUSTOMER_READ"))
    noScores()
    expect(window.localStorage.getItem("cyntro:swr:family-aggregate")).toBeNull()
  })

  it("several accounts and none named: the neutral words (this strip does not send a selected account)", async () => {
    backend = () => json(422, SCOPE_REQUIRED)
    render(<FamilyStrip families={["data", "privilege", "network"]} />)
    await waitFor(() => expect(shown()).toContain("this view does not read one selected account"))
    expect(shown()).not.toMatch(/scope bar/)
    noScores()
  })

  it("a claim outside the server scope reads as that, not as a fault or a zero", async () => {
    backend = () => json(403, MISMATCH)
    render(<FamilyStrip families={["data", "privilege", "network"]} />)
    await waitFor(() => expect(shown()).toContain("The selected account is not in this install's scope"))
    noScores()
  })

  it("the proxy never caches a held answer: the next request asks the backend again", async () => {
    backend = () => json(503, HELD)
    const first = await GET(new NextRequest("http://localhost/api/proxy/family-aggregate"))
    expect(first.status).toBe(503)
    expect((await first.json()).detail).toEqual(HELD.detail)
    const second = await GET(new NextRequest("http://localhost/api/proxy/family-aggregate"))
    expect(second.status).toBe(503)
    expect(backendCalls).toBe(2)
  })

  it("control: a served aggregate still shows its family scores", async () => {
    backend = () => json(200, SERVED)
    render(<FamilyStrip families={["data", "privilege", "network"]} />)
    await waitFor(() => expect(shown()).toContain("62"))
    expect(shown()).toMatch(/\/100/)
    expect(shown()).not.toMatch(/held/i)
  })
})
