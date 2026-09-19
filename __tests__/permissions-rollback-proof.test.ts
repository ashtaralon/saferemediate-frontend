// @vitest-environment node
/**
 * The three rollback proxies: in a customer-resident deployment the request's signed operator proof is selected by
 * the shared helper BEFORE any backend call -- including the iam-roles snapshot lookup -- and a refusal makes no call.
 * Hosted behaviour is unchanged: the process-wide writer attaches the service token and no client identity header is
 * forwarded. The real routes, helper and writer run; only the backend socket is a recorder.
 */
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://customer-backend.example" }))

import { POST as iamSnapshotsRollback } from "@/app/api/proxy/iam-snapshots/[snapshotId]/rollback/route"
import { POST as snapshotsRollback } from "@/app/api/proxy/snapshots/[snapshotId]/rollback/route"
import { POST as iamRolesRollback } from "@/app/api/proxy/iam-roles/rollback/route"
import { installCustomerBackendAuthFetch } from "@/lib/server/customer-backend-auth"

const BACKEND = "https://customer-backend.example"
const MARKER = Symbol.for("cyntro.customerBackendAuthFetch")
const SERVICE_TOKEN = "fixture-hosted-service-token"          // fixture value, never a real credential
const originalFetch = globalThis.fetch
const RESIDENT_HEADERS = { "x-amzn-oidc-identity": "operator-1", "x-amzn-oidc-data": " signed-claims " }

type Sent = { url: string; headers: Headers; body: string | null }

function recorder(reply: (url: string) => Response = () => Response.json({ success: true, code: "RESTORE_VERIFIED" })) {
  const sent: Sent[] = []
  const fn = vi.fn(async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url
    if (!url.startsWith(BACKEND)) throw new TypeError(`unexpected upstream ${url}`)
    sent.push({ url, headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : null })
    return reply(url)
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return { fn, sent }
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`https://app.example${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } })

const ROUTES = [
  ["iam-snapshots rollback", () => iamSnapshotsRollback(
    post("/api/proxy/iam-snapshots/SNAP-1/rollback", { selected_items: ["s3:GetObject"] }, RESIDENT_HEADERS),
    { params: Promise.resolve({ snapshotId: "SNAP-1" }) })],
  ["snapshots rollback", () => snapshotsRollback(
    post("/api/proxy/snapshots/SNAP-1/rollback", {}, RESIDENT_HEADERS),
    { params: Promise.resolve({ snapshotId: "SNAP-1" }) })],
  ["iam-roles rollback by role lookup", () => iamRolesRollback(
    post("/api/proxy/iam-roles/rollback", { role_name: "fixture-web-role" }, RESIDENT_HEADERS))],
] as const

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[MARKER]
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<symbol, unknown>)[MARKER]
  for (const name of ["CYNTRO_DEPLOYMENT_MODE", "CYNTRO_SERVICE_TOKEN", "BACKEND_URL_OVERRIDE"]) delete process.env[name]
  vi.restoreAllMocks()
})

describe("customer-resident: proof before any backend call", () => {
  it.each(ROUTES)("%s forwards only the signed OIDC data on every call", async (_label, call) => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const net = recorder((url) => url.includes("/api/snapshots?role_name=")
      ? Response.json({ snapshots: [{ snapshot_id: "SNAP-9", rollback_available: true, original_role: "fixture-web-role" }] })
      : Response.json({ success: true, code: "RESTORE_VERIFIED" }))
    const response = await call()
    expect(response.status).toBe(200)
    expect(net.sent.length).toBeGreaterThanOrEqual(1)
    for (const request of net.sent) {
      expect(request.headers.get("X-Amzn-Oidc-Data")).toBe("signed-claims")
      expect(request.headers.has("X-Amzn-Oidc-Identity")).toBe(false)
    }
  })

  it("resident: the iam-roles route calls the lookup, then the rollback it found (order control)", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const net = recorder((url) => url.includes("/api/snapshots?role_name=")
      ? Response.json({ snapshots: [{ snapshot_id: "SNAP-9", rollback_available: true, original_role: "fixture-web-role" }] })
      : Response.json({ success: true }))
    await iamRolesRollback(post("/api/proxy/iam-roles/rollback", { role_name: "fixture-web-role" }, RESIDENT_HEADERS))
    expect(net.sent.map((s) => new URL(s.url).pathname)).toEqual(["/api/snapshots", "/api/snapshots/SNAP-9/rollback"])
  })

  it.each([
    ["no identity header", { "x-amzn-oidc-data": "signed-claims" }],
    ["no signed data", { "x-amzn-oidc-identity": "operator-1" }],
  ])("refuses with %s by name, no-store, with zero backend calls on all three routes", async (_label, headers) => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const net = recorder()
    const responses = [
      await iamSnapshotsRollback(post("/api/proxy/iam-snapshots/SNAP-1/rollback", {}, headers), { params: Promise.resolve({ snapshotId: "SNAP-1" }) }),
      await snapshotsRollback(post("/api/proxy/snapshots/SNAP-1/rollback", {}, headers), { params: Promise.resolve({ snapshotId: "SNAP-1" }) }),
      await iamRolesRollback(post("/api/proxy/iam-roles/rollback", { role_name: "fixture-web-role" }, headers)),
    ]
    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(JSON.stringify(await response.json())).toContain("ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE")
    }
    expect(net.fn).not.toHaveBeenCalled()
  })
})

describe("hosted: unchanged gate and writer, no client identity header", () => {
  it.each(ROUTES)("%s sends the service token through the writer and never the client's ALB headers", async (_label, call) => {
    process.env.CYNTRO_SERVICE_TOKEN = SERVICE_TOKEN
    const net = recorder((url) => url.includes("/api/snapshots?role_name=")
      ? Response.json({ snapshots: [{ snapshot_id: "SNAP-9", rollback_available: true, original_role: "fixture-web-role" }] })
      : Response.json({ success: true }))
    installCustomerBackendAuthFetch()
    const response = await call()
    expect(response.status).toBe(200)
    for (const request of net.sent) {
      expect(request.headers.get("X-Cyntro-Service-Token")).toBe(SERVICE_TOKEN)
      expect(request.headers.has("X-Amzn-Oidc-Data")).toBe(false)
    }
  })

  it("keeps the selected-items body and the typed refusal detail of the iam-snapshots proxy", async () => {
    const net = recorder(() => Response.json(
      { detail: { code: "LIFECYCLE_CREDENTIALS_REFUSED", message: "This process may not hold the tenant lifecycle credentials", aws_writes: 0 } },
      { status: 403 }))
    const response = await iamSnapshotsRollback(
      post("/api/proxy/iam-snapshots/SNAP-1/rollback", { selected_items: ["s3:GetObject"] }),
      { params: Promise.resolve({ snapshotId: "SNAP-1" }) })
    expect(JSON.parse(net.sent[0].body ?? "{}")).toEqual({ selected_items: ["s3:GetObject"] })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toEqual({
      code: "LIFECYCLE_CREDENTIALS_REFUSED", message: "This process may not hold the tenant lifecycle credentials", aws_writes: 0 })
  })
})
