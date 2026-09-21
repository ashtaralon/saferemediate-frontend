import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://customer-backend.example",
}))

import { GET } from "@/app/api/proxy/iam-roles/[roleName]/gap-analysis/route"
import {
  MAX_DIAGNOSTIC_KEYS,
  MAX_FIELD_CHARS,
  MAX_REFUSAL_BYTES,
  MAX_TEXT_CHARS,
} from "@/lib/server/typed-refusal"
import { installCustomerBackendAuthFetch } from "@/lib/server/customer-backend-auth"

/** The exact role from the reproduced Permissions-tab defect. */
const ROLE = "cyntro-tb-prod-web-role"
/** Testbed Webshop. */
const ACCOUNT = "416651950952"

const OIDC_HEADERS = {
  "x-amzn-oidc-identity": "operator-1",
  "x-amzn-oidc-data": "signed-alb-claims",
}

function req(query = `days=365`, headers: Record<string, string> = OIDC_HEADERS) {
  return new NextRequest(
    `https://app.example/api/proxy/iam-roles/${ROLE}/gap-analysis?${query}`,
    { headers },
  )
}
const params = Promise.resolve({ roleName: ROLE })

/** Customer-resident is the shape whose proof comes from the request itself. */
function customerResident() {
  process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
}

function backendResponds(status: number, body: unknown, asJson = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(asJson ? JSON.stringify(body) : String(body), {
      status,
      headers: { "content-type": asJson ? "application/json" : "text/html" },
    }) as never,
  )
}

beforeEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})
afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  vi.restoreAllMocks()
})

describe("IAM gap-analysis proxy — typed refusals reach the operator", () => {
  it("returns the role's analysis on 200 and forwards exact scope", async () => {
    customerResident()
    const upstream = backendResponds(200, {
      role_name: ROLE,
      summary: { used_count: 12, unused_count: 30, lp_score: 28 },
    })

    const res = await GET(
      req(`days=365&account_id=${ACCOUNT}&customer_id=tb&region=eu-west-1`),
      { params },
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ role_name: ROLE })

    const calledWith = new URL(upstream.mock.calls[0][0] as string)
    expect(calledWith.pathname).toBe(`/api/iam-roles/${ROLE}/gap-analysis`)
    expect(calledWith.searchParams.get("days")).toBe("365")
    expect(calledWith.searchParams.get("account_id")).toBe(ACCOUNT)
    expect(calledWith.searchParams.get("customer_id")).toBe("tb")
    expect(calledWith.searchParams.get("region")).toBe("eu-west-1")
  })

  it("never forwards a malformed account or region rather than guessing one", async () => {
    customerResident()
    const upstream = backendResponds(200, { role_name: ROLE })

    await GET(req(`days=365&account_id=not-an-account&region=Mars`), { params })

    const calledWith = new URL(upstream.mock.calls[0][0] as string)
    expect(calledWith.searchParams.has("account_id")).toBe(false)
    expect(calledWith.searchParams.has("region")).toBe(false)
  })

  it("preserves the disabled-seam 503 and its code instead of collapsing to 502", async () => {
    // This is the reproduced production defect: CYNTRO_DECISION_SEAM_ENABLED
    // is false, the backend answers a typed 503 before any graph read, and the
    // operator saw "Request failed (502)".
    customerResident()
    backendResponds(503, {
      detail: {
        code: "REVIEW_RUNTIME_UNAVAILABLE",
        upstream_code: "DECISION_RUNTIME_DISABLED",
        message: "Permission detail is not served by this deployment's Decision runtime.",
      },
    })

    const res = await GET(req(), { params })

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.backendStatus).toBe(503)
    expect(body.detail.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
    expect(body.detail.upstream_code).toBe("DECISION_RUNTIME_DISABLED")
  })

  it("keeps the code when the body is long — truncation used to destroy it", async () => {
    customerResident()
    backendResponds(503, {
      detail: {
        code: "REVIEW_RUNTIME_UNAVAILABLE",
        // >500 chars, so the old slice(0,500) left unparseable JSON.
        diagnostics: { note: "x".repeat(900) },
      },
    })

    const res = await GET(req(), { params })
    const body = await res.json()

    expect(body.detail.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
    // ...and the long field is clipped rather than relayed at its own size.
    expect(body.detail.diagnostics.note.length).toBeLessThanOrEqual(MAX_FIELD_CHARS)
  })

  it("is BOUNDED: an adversarial upstream body cannot be relayed at its size", async () => {
    // The other half of the truncation fix. Forwarding the parsed object whole
    // preserves the code and also everything else the backend attached, at
    // whatever size -- an amplification surface. The allowlist drops unknown
    // keys entirely rather than truncating them, because a truncated unknown
    // key is still unbounded in shape.
    customerResident()
    const hostile: Record<string, unknown> = {
      code: "REVIEW_RUNTIME_UNAVAILABLE",
      upstream_code: "DECISION_RUNTIME_DISABLED",
      message: "m".repeat(50_000),
      ...Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`junk_${i}`, "z".repeat(5_000)]),
      ),
      nested: { a: { b: { c: Array.from({ length: 5_000 }, () => "deep") } } },
      diagnostics: {
        ...Object.fromEntries(
          Array.from({ length: 300 }, (_, i) => [`d_${i}`, "q".repeat(4_000)]),
        ),
        nested_obj: { should: "be dropped" },
      },
    }
    backendResponds(503, { detail: hostile })

    const res = await GET(req(), { params })
    const body = await res.json()
    const serialized = JSON.stringify(body.detail)

    expect(body.detail.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
    expect(body.detail.upstream_code).toBe("DECISION_RUNTIME_DISABLED")
    expect(serialized.length).toBeLessThanOrEqual(MAX_REFUSAL_BYTES)
    expect(body.detail.junk_0).toBeUndefined()
    expect(body.detail.nested).toBeUndefined()
    expect(body.detail.message.length).toBeLessThanOrEqual(MAX_FIELD_CHARS)
    expect(Object.keys(body.detail.diagnostics ?? {}).length).toBeLessThanOrEqual(
      MAX_DIAGNOSTIC_KEYS,
    )
    expect(body.detail.diagnostics?.nested_obj).toBeUndefined()
  })

  it("does not manufacture a refusal from a body that carries no code", async () => {
    customerResident()
    backendResponds(500, { detail: { message: "something went wrong", trace: "x".repeat(2000) } })

    const res = await GET(req(), { params })
    const body = await res.json()

    expect(typeof body.detail).toBe("string")
    expect(body.detail.length).toBeLessThanOrEqual(MAX_TEXT_CHARS)
  })

  it("mirrors a 403 scope mismatch with its code", async () => {
    customerResident()
    backendResponds(403, { detail: { code: "REVIEW_SCOPE_MISMATCH", message: "different account" } })

    const res = await GET(req(`days=365&account_id=${ACCOUNT}`), { params })

    expect(res.status).toBe(403)
    expect((await res.json()).detail.code).toBe("REVIEW_SCOPE_MISMATCH")
  })

  it("mirrors a 404 role-not-found with its code", async () => {
    customerResident()
    backendResponds(404, { detail: { code: "ROLE_NOT_FOUND_IN_SCOPE", message: "no such role" } })

    const res = await GET(req(), { params })

    expect(res.status).toBe(404)
    expect((await res.json()).detail.code).toBe("ROLE_NOT_FOUND_IN_SCOPE")
  })

  it("refuses with a name, and sends nothing, when no operator identity is attached", async () => {
    customerResident()
    const upstream = vi.spyOn(globalThis, "fetch")

    const res = await GET(req("days=365", {}), { params })

    expect(res.status).toBe(403)
    expect((await res.json()).detail.code).toBe("ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE")
    expect(upstream).not.toHaveBeenCalled()
  })

  it("refuses by name when the hosted deployment installed no service credential", async () => {
    // Hosted shape, writer never installed: the request must not go out
    // unauthenticated and be read back as an operator identity failure.
    const upstream = vi.spyOn(globalThis, "fetch")

    const res = await GET(req(), { params })

    expect(res.status).toBe(503)
    expect((await res.json()).detail.code).toBe("DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE")
    expect(upstream).not.toHaveBeenCalled()
  })

  it("names an untyped 401 as the deployment credential being refused", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = "t"
    installCustomerBackendAuthFetch()
    backendResponds(401, "Unauthorized", false)

    const res = await GET(req(), { params })
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.detail.code).toBe("DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE")
    delete process.env.CYNTRO_SERVICE_TOKEN
  })

  it("maps a network failure to 503 and an abort to 504, never 200", async () => {
    customerResident()
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"))
    const res = await GET(req(), { params })
    expect(res.status).toBe(503)

    const abort = new Error("aborted")
    abort.name = "AbortError"
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abort)
    const aborted = await GET(req(), { params })
    expect(aborted.status).toBe(504)
  })

  it("truncates a non-JSON error body but still reports the real status", async () => {
    customerResident()
    backendResponds(500, "<html>" + "y".repeat(2000) + "</html>", false)

    const res = await GET(req(), { params })
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(typeof body.detail).toBe("string")
    expect(body.detail.length).toBeLessThanOrEqual(500)
  })
})
