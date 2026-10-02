/**
 * Settings > Accounts proxy (lib/server/account-admin-proxy.ts).
 *
 * Two behaviours the member-account onboarding flow depends on:
 *  - customer-resident: the ALB-signed x-amzn-oidc-data reaches the backend, which
 *    verifies it and records who asked for a registration or a connection check;
 *  - the connection-stack template is a YAML attachment: its bytes and its
 *    Content-Disposition must arrive unchanged or the browser does not save a file.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://customer-backend.example",
}))

import { GET as listGET, POST as listPOST } from "@/app/api/proxy/admin/accounts/route"
import {
  DELETE as pathDELETE,
  GET as pathGET,
  PATCH as pathPATCH,
  POST as pathPOST,
  PUT as pathPUT,
} from "@/app/api/proxy/admin/accounts/[...path]/route"
import { serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

const context = (path: string[]) => ({ params: Promise.resolve({ path }) })

/** jsdom's Request drops forbidden headers (Origin, Sec-Fetch-Site, Cookie) passed
 * to the constructor; setting them afterwards keeps them, as a browser's request has. */
function browserRequest(url: string, { headers = {}, ...init }: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const request = new NextRequest(url, init)
  for (const [name, value] of Object.entries(headers)) request.headers.set(name, value)
  return request
}

function sentHeaders(upstream: { mock: { calls: unknown[][] } }, call = 0): Record<string, string> {
  const init = upstream.mock.calls[call][1] as RequestInit
  return init.headers as Record<string, string>
}

afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  delete process.env.CYNTRO_ALLOWED_ORIGINS
  vi.restoreAllMocks()
})

describe("account admin proxy — operator attribution", () => {
  it("forwards the ALB-signed x-amzn-oidc-data on a customer-resident install", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ customer_id: "acme-prod", account_id: "444455556666", action: "register" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    )
    const response = await listPOST(browserRequest("https://app.example/api/proxy/admin/accounts", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-amzn-oidc-data": "  signed-alb-claims  " },
      body: JSON.stringify({ customer_id: "acme-prod", account_id: "444455556666" }),
    }))

    expect(response.status).toBe(202)
    expect(String(upstream.mock.calls[0][0])).toBe("https://customer-backend.example/api/admin/accounts")
    expect(sentHeaders(upstream)["X-Amzn-Oidc-Data"]).toBe("signed-alb-claims")
  })

  it("forwards it on sub-paths too (Check connection)", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ action: "validate" }), { status: 202, headers: { "content-type": "application/json" } }),
    )
    const response = await pathPOST(
      browserRequest("https://app.example/api/proxy/admin/accounts/444455556666/validate?customer_id=acme-prod", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin", "x-amzn-oidc-data": "signed-alb-claims" },
      }),
      context(["444455556666", "validate"]),
    )

    expect(response.status).toBe(202)
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://customer-backend.example/api/admin/accounts/444455556666/validate?customer_id=acme-prod",
    )
    expect(sentHeaders(upstream)["X-Amzn-Oidc-Data"]).toBe("signed-alb-claims")
  })

  it("sends no OIDC header when the request carries none", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ accounts: [] }))
    await listGET(new NextRequest("https://app.example/api/proxy/admin/accounts?customer_id=acme-prod"))

    const headers = sentHeaders(upstream)
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("x-amzn-oidc-data")
    expect(String(upstream.mock.calls[0][0])).toBe("https://customer-backend.example/api/admin/accounts?customer_id=acme-prod")
  })

  it("does not relay a browser-supplied x-amzn-oidc-data on the hosted plane, and keeps Authorization as before", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ accounts: [] }))
    await listGET(new NextRequest("https://app.example/api/proxy/admin/accounts?customer_id=acme-prod", {
      headers: { "x-amzn-oidc-data": "browser-forged", authorization: "Bearer operator-token" },
    }))

    const headers = sentHeaders(upstream)
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("x-amzn-oidc-data")
    expect(headers.Authorization).toBe("Bearer operator-token")
  })
})

describe("account admin proxy — response pass-through", () => {
  it("relays the template attachment's bytes, content type and Content-Disposition unchanged", async () => {
    const yaml = "AWSTemplateFormatVersion: '2010-09-09'\nDescription: Cyntro account connection — read roles\nParameters:\n  CustomerId:\n    Type: String\n"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(yaml, {
        status: 200,
        headers: {
          "content-type": "application/x-yaml",
          "content-disposition": 'attachment; filename="cyntro-account-connection.yaml"',
        },
      }),
    )
    const response = await pathGET(
      new NextRequest("https://app.example/api/proxy/admin/accounts/connect/template"),
      context(["connect", "template"]),
    )

    expect(String(upstream.mock.calls[0][0])).toBe("https://customer-backend.example/api/admin/accounts/connect/template")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/x-yaml")
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="cyntro-account-connection.yaml"')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode(yaml))
  })

  it("adds no Content-Disposition when the backend sent none, and keeps the error status and body", async () => {
    const detail = { detail: { error: "member_trust_not_ready", message: "The account connector has not established this install's member trust yet." } }
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(detail), { status: 409, headers: { "content-type": "application/json" } }),
    )
    const response = await pathGET(
      new NextRequest("https://app.example/api/proxy/admin/accounts/444455556666/connect?customer_id=acme-prod"),
      context(["444455556666", "connect"]),
    )

    expect(response.status).toBe(409)
    expect(response.headers.get("content-disposition")).toBeNull()
    expect(await response.json()).toEqual(detail)
  })
})

// H5: registering or re-validating a workload account needs BOTH proofs of one
// person, and the backend verifies both (verify_person, require_alb). This proxy
// only relays the ALB's two headers; these tests pin what it relays and what it
// refuses to relay. Upstream statuses below are the backend's typed refusals,
// relayed unchanged -- the proxy never decides who someone is.
const ALB_DATA = "alb-signed-claims"
const ALB_TOKEN = "alb-obtained-access-token"
const REGISTER_URL = "https://app.example/api/proxy/admin/accounts"
const VALIDATE_URL = "https://app.example/api/proxy/admin/accounts/444455556666/validate?customer_id=acme-prod"

function lowerKeys(headers: Record<string, string>): string[] {
  return Object.keys(headers).map((key) => key.toLowerCase()).sort()
}

function register(headers: Record<string, string>) {
  return listPOST(browserRequest(REGISTER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ customer_id: "acme-prod", account_id: "444455556666" }),
  }))
}

describe("account admin proxy — person identity on a customer-resident install (H5)", () => {
  it("forwards exactly the ALB's two headers: the signed identity and its access token as the bearer", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ action: "register" }), { status: 202, headers: { "content-type": "application/json" } }),
    )
    const response = await register({
      "sec-fetch-site": "same-origin",
      "x-amzn-oidc-data": ALB_DATA,
      "x-amzn-oidc-accesstoken": ` ${ALB_TOKEN} `,
      "x-amzn-oidc-identity": "alb-subject",
      cookie: "AWSELBAuthSessionCookie-0=opaque",
    })

    expect(response.status).toBe(202)
    const headers = sentHeaders(upstream)
    expect(lowerKeys(headers)).toEqual(["accept", "authorization", "content-type", "x-amzn-oidc-data"])
    expect(headers["X-Amzn-Oidc-Data"]).toBe(ALB_DATA)
    expect(headers.Authorization).toBe(`Bearer ${ALB_TOKEN}`)
  })

  it("never forwards a browser-supplied Authorization: the ALB's token replaces it", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({}, { status: 202 }))
    await register({
      "sec-fetch-site": "same-origin",
      authorization: "Bearer forged-by-the-page",
      "x-amzn-oidc-data": ALB_DATA,
      "x-amzn-oidc-accesstoken": ALB_TOKEN,
    })

    expect(sentHeaders(upstream).Authorization).toBe(`Bearer ${ALB_TOKEN}`)
  })

  it("a spoofed Authorization with no ALB token reaches the backend as no bearer at all", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const refusal = { detail: { code: "PERSON_TOKEN_REQUIRED" } }
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(refusal, { status: 401 }))
    const response = await register({
      "sec-fetch-site": "same-origin",
      authorization: "Bearer forged-by-the-page",
      "x-amzn-oidc-data": ALB_DATA,
    })

    expect(lowerKeys(sentHeaders(upstream))).toEqual(["accept", "content-type", "x-amzn-oidc-data"])
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(refusal)
  })

  it("missing identity: nothing is synthesized and the backend's refusal is relayed unchanged", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const refusal = { detail: { code: "PERSON_TOKEN_REQUIRED" } }
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(refusal, { status: 401 }))
    const response = await register({ "sec-fetch-site": "same-origin", "x-amzn-oidc-accesstoken": "   " })

    expect(lowerKeys(sentHeaders(upstream))).toEqual(["accept", "content-type"])
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(refusal)
  })

  it.each([
    ["only the signed identity", { "x-amzn-oidc-data": ALB_DATA }, ["accept", "content-type", "x-amzn-oidc-data"], "PERSON_TOKEN_REQUIRED"],
    ["only the access token", { "x-amzn-oidc-accesstoken": ALB_TOKEN }, ["accept", "authorization", "content-type"], "ALB_IDENTITY_REQUIRED"],
  ])("half an identity (%s): only that half is relayed, and the backend refuses", async (_label, alb, expected, code) => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ detail: { code } }, { status: 401 }))
    const response = await register({ "sec-fetch-site": "same-origin", ...alb })

    expect(lowerKeys(sentHeaders(upstream))).toEqual(expected)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: { code } })
  })

  it("relays the backend's verdict on a well-formed but wrong person (subject mismatch) unchanged", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ detail: { code: "PERSON_SUBJECT_MISMATCH" } }, { status: 401 }),
    )
    const response = await pathPOST(
      browserRequest(VALIDATE_URL, {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin", "x-amzn-oidc-data": ALB_DATA, "x-amzn-oidc-accesstoken": "another-persons-token" },
      }),
      context(["444455556666", "validate"]),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: { code: "PERSON_SUBJECT_MISMATCH" } })
  })
})

describe("account admin proxy — a customer-resident write must come from this origin (H5)", () => {
  const ORIGIN_REFUSED = { detail: { code: "ACCOUNT_ADMIN_ORIGIN_REFUSED" }, success: false }

  it.each([
    ["Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site same-site (a sibling subdomain)", { "sec-fetch-site": "same-site" }],
    ["Sec-Fetch-Site none", { "sec-fetch-site": "none" }],
    ["Sec-Fetch-Site cross-site with a matching Origin", { "sec-fetch-site": "cross-site", origin: "https://app.example" }],
    ["a foreign Origin and no Sec-Fetch-Site", { origin: "https://attacker.example" }],
    ["Origin null", { origin: "null" }],
    ["an unparseable Origin", { origin: "not a url" }],
    ["neither header", {}],
  ])("refuses a register POST with %s, before forwarding anything", async (_label, provenance) => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await register({ ...provenance, "x-amzn-oidc-data": ALB_DATA, "x-amzn-oidc-accesstoken": ALB_TOKEN })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(ORIGIN_REFUSED)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([
    ["POST", pathPOST],
    ["PATCH", pathPATCH],
    ["PUT", pathPUT],
    ["DELETE", pathDELETE],
  ])("refuses a cross-site %s on a sub-path too", async (method, handler) => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await handler(
      browserRequest(VALIDATE_URL, {
        method,
        headers: { "sec-fetch-site": "cross-site", "x-amzn-oidc-data": ALB_DATA, "x-amzn-oidc-accesstoken": ALB_TOKEN },
      }),
      context(["444455556666", "validate"]),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(ORIGIN_REFUSED)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("forwards when the Origin is one of this console's own origins (no Sec-Fetch-Site)", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ALLOWED_ORIGINS = "https://other-console.example, https://cyntro.customer.example/"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({}, { status: 202 }))
    const response = await register({
      origin: "https://cyntro.customer.example",
      "x-amzn-oidc-data": ALB_DATA,
      "x-amzn-oidc-accesstoken": ALB_TOKEN,
    })

    expect(response.status).toBe(202)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it("compares the normalized origin: case of the host and an explicit default port do not matter", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ALLOWED_ORIGINS = "https://APP.example:443"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({}, { status: 202 }))
    const response = await register({ origin: "https://app.example", "x-amzn-oidc-data": ALB_DATA, "x-amzn-oidc-accesstoken": ALB_TOKEN })

    expect(response.status).toBe(202)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it.each([
    // Codex H5b-F1: same host, other scheme. The host-only fallback forwarded this.
    ["another scheme on the same host", "https://app.example", { origin: "http://app.example", host: "app.example" }],
    ["another port on the same host", "https://app.example", { origin: "https://app.example:8443", host: "app.example" }],
    ["a foreign Origin that the forwarded host agrees with", "https://app.example",
      { origin: "https://attacker.example", "x-forwarded-host": "attacker.example", host: "attacker.example" }],
    ["an Origin that equals the addressed host but no configured origin", "",
      { origin: "https://app.example", host: "app.example" }],
    ["only unusable configured entries", "*, not a url", { origin: "https://app.example", host: "app.example" }],
    ["Origin null although an opaque origin is configured", "file:///console", { origin: "null" }],
    ["an Origin that is not a serialized origin (trailing slash)", "https://app.example", { origin: "https://app.example/" }],
    ["an Origin that is not a serialized origin (upper-case host)", "https://app.example", { origin: "https://APP.example" }],
  ])("without Sec-Fetch-Site, refuses %s", async (_label, configured, provenance) => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    if (configured) process.env.CYNTRO_ALLOWED_ORIGINS = configured
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await register({ ...provenance, "x-amzn-oidc-data": ALB_DATA, "x-amzn-oidc-accesstoken": ALB_TOKEN })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(ORIGIN_REFUSED)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("does not gate reads: a cross-site GET of the stack template is still relayed", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("AWSTemplateFormatVersion: '2010-09-09'\n", { status: 200, headers: { "content-type": "application/x-yaml" } }),
    )
    const response = await pathGET(
      browserRequest("https://app.example/api/proxy/admin/accounts/connect/template", { headers: { "sec-fetch-site": "cross-site" } }),
      context(["connect", "template"]),
    )

    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

describe("account admin proxy — everything outside the opt-in is unchanged (H5)", () => {
  it("hosted plane: the browser's own bearer is relayed as before, and no ALB header is read or converted", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({}, { status: 202 }))
    await register({
      "sec-fetch-site": "cross-site",
      authorization: "Bearer operator-token",
      "x-amzn-oidc-data": "browser-forged",
      "x-amzn-oidc-accesstoken": "browser-forged-token",
    })

    // No origin rule is added on the hosted plane: its account writes carry the
    // browser's own bearer, never an ambient session this proxy derives.
    const headers = sentHeaders(upstream)
    expect(lowerKeys(headers)).toEqual(["accept", "authorization", "content-type"])
    expect(headers.Authorization).toBe("Bearer operator-token")
  })

  it("serverDerivedOperatorHeaders (LP mutations, remediation, rollback) still forwards only the signed identity", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const request = browserRequest(REGISTER_URL, {
      method: "POST",
      headers: { "x-amzn-oidc-data": ALB_DATA, "x-amzn-oidc-accesstoken": ALB_TOKEN, authorization: "Bearer page" },
    })

    expect(await serverDerivedOperatorHeaders(request)).toEqual({ "X-Amzn-Oidc-Data": ALB_DATA })
  })
})
