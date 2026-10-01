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
import { GET as pathGET, POST as pathPOST } from "@/app/api/proxy/admin/accounts/[...path]/route"

const context = (path: string[]) => ({ params: Promise.resolve({ path }) })

function sentHeaders(upstream: { mock: { calls: unknown[][] } }, call = 0): Record<string, string> {
  const init = upstream.mock.calls[call][1] as RequestInit
  return init.headers as Record<string, string>
}

afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
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
    const response = await listPOST(new NextRequest("https://app.example/api/proxy/admin/accounts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-amzn-oidc-data": "  signed-alb-claims  " },
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
      new NextRequest("https://app.example/api/proxy/admin/accounts/444455556666/validate?customer_id=acme-prod", {
        method: "POST",
        headers: { "x-amzn-oidc-data": "signed-alb-claims" },
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
