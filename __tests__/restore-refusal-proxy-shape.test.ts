/// <reference types="vitest/globals" />
/**
 * A typed restore refusal must reach the operator through the REAL proxy.
 *
 * 3429 QA: the backend answered 403 {detail: {code: LIFECYCLE_CREDENTIALS_REFUSED,
 * message}} and History alerted "HTTP_403: Request failed with HTTP 403". The
 * iam-snapshots rollback proxy rewrites errors to {error: <detail>, success:
 * false}, and the parser read only `detail`. The earlier mounted control stubbed
 * the backend's shape at the proxy URL, so it passed exactly when the browser
 * failed. These controls run the proxy's own route handler.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { approvalListFailure, mutationFailure, mutationFailureText } from "@/lib/iam-mutation-outcome"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

const REFUSAL = {
  code: "LIFECYCLE_CREDENTIALS_REFUSED",
  message: "This process may not hold the tenant lifecycle credentials this needs.",
  snapshot_id: "IAMRole-fixture-web-role-1a2b3c4d",
  aws_writes: 0,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function throughProxy(backend: Response) {
  const backendCalls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    backendCalls.push(String(url))
    return backend
  }))
  const { POST } = await import("@/app/api/proxy/iam-snapshots/[snapshotId]/rollback/route")
  const res = await POST(
    new NextRequest("https://cyntro.example/api/proxy/iam-snapshots/IAMRole-fixture-web-role-1a2b3c4d/rollback", {
      method: "POST", body: "{}", headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ snapshotId: "IAMRole-fixture-web-role-1a2b3c4d" }) },
  )
  return { status: res.status, body: await res.json(), backendCalls }
}

describe("typed restore refusals through the iam-snapshots proxy", () => {
  it("the proxy really rewrites the backend detail into `error`", async () => {
    const proxied = await throughProxy(json({ detail: REFUSAL }, 403))
    expect(proxied.backendCalls).toEqual(["https://backend.example/api/snapshots/IAMRole-fixture-web-role-1a2b3c4d/rollback"])
    expect(proxied.status).toBe(403)
    expect(proxied.body).toEqual({ error: REFUSAL, success: false })
  })

  it("keeps the typed code, message and write count from the proxied shape", async () => {
    const proxied = await throughProxy(json({ detail: REFUSAL }, 403))
    const failure = mutationFailure(proxied.status, proxied.body)
    expect(failure).toEqual({ status: 403, code: "LIFECYCLE_CREDENTIALS_REFUSED", message: REFUSAL.message, awsWrites: 0 })
    expect(mutationFailureText(failure)).toBe(`LIFECYCLE_CREDENTIALS_REFUSED: ${REFUSAL.message}`)
  })

  it("reads the backend's own shape the same way", () => {
    expect(mutationFailure(409, { detail: { code: "RESTORE_LIVE_DRIFT", message: "changed", aws_writes: 0 } }).code)
      .toBe("RESTORE_LIVE_DRIFT")
  })

  it("an untyped failure says what it can, never [object Object]", async () => {
    const proxied = await throughProxy(json({ detail: "Snapshot not found: x" }, 404))
    const text = mutationFailureText(mutationFailure(proxied.status, proxied.body))
    expect(text).toBe("Snapshot not found: x")
    expect(mutationFailureText(mutationFailure(502, null))).toBe("Request failed with HTTP 502")
  })

  it("a proxied code with no message still reads as text, not an object", () => {
    const failure = mutationFailure(403, { error: { code: "LIFECYCLE_CREDENTIALS_REFUSED" }, success: false })
    expect(mutationFailureText(failure)).toBe("LIFECYCLE_CREDENTIALS_REFUSED: Request failed with HTTP 403")
  })

  it("the approval-list reader also keeps a code forwarded under `error`", () => {
    expect(approvalListFailure(503, { error: { code: "APPROVAL_STORE_UNAVAILABLE", message: "down" }, success: false }))
      .toEqual({ status: 503, code: "APPROVAL_STORE_UNAVAILABLE", message: "down" })
  })
})
