import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://serving-backend.example",
}))

import { GET, POST } from "@/app/api/proxy/copilot/ask/route"
import { resolveIntent } from "@/components/copilot/intent-router"

const OIDC_HEADERS = {
  "content-type": "application/json",
  "x-amzn-oidc-identity": "user-123",
  "x-amzn-oidc-data": "signed-alb-claims",
}

function post(body: unknown, headers: Record<string, string> = OIDC_HEADERS) {
  return new NextRequest("https://app.example/api/proxy/copilot/ask", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  delete process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS
  vi.restoreAllMocks()
})

describe("Copilot authenticated system scope boundary", () => {
  it("carries the immutable system through every admitted downstream route", () => {
    const admittedTools = [
      "top-unused-iam",
      "broad-s3",
      "blast-radius",
      "paths-to-jewels",
      "recent-changes",
      "safe-to-apply",
      "highest-risk",
      "inventory-count",
      "inventory-list",
    ]

    for (const tool of admittedTools) {
      const route = resolveIntent(tool, { systemName: "payments", resourceType: "s3" })
      expect(route, tool).not.toBeNull()
      const url = new URL(route!.url, "https://app.example")
      expect(
        url.searchParams.get("system") ?? url.searchParams.get("systemName"),
        tool,
      ).toBe("payments")
    }
  })

  it("disables hosted free-form routing even when the shared auth cookie is present", async () => {
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    const upstream = vi.spyOn(globalThis, "fetch")
    const req = post(
      { question: "count S3 buckets", systemName: "payments" },
      { ...OIDC_HEADERS, cookie: "cyntro_auth=authenticated" },
    )

    const response = await POST(req)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      code: "COPILOT_DEPLOYMENT_MODE_UNSUPPORTED",
    })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("disables routing when the customer-resident request has no ALB OIDC identity", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    const upstream = vi.spyOn(globalThis, "fetch")

    const response = await POST(
      post(
        { question: "count S3 buckets", systemName: "payments" },
        { "content-type": "application/json" },
      ),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      code: "COPILOT_AUTHENTICATED_PRINCIPAL_UNAVAILABLE",
    })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("returns a typed disabled capability when the server allowlist is missing", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const request = new NextRequest(
      "https://app.example/api/proxy/copilot/ask?systemName=payments",
      { headers: OIDC_HEADERS },
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      enabled: false,
      code: "COPILOT_SCOPE_CONFIGURATION_UNAVAILABLE",
      reason: "Free-form questions are disabled until an authorized system scope is configured.",
      systemName: null,
    })
  })

  it("rejects wildcard configuration instead of creating an unscoped route", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "*"

    const response = await POST(post({ question: "count S3 buckets", systemName: "payments" }))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      code: "COPILOT_SCOPE_CONFIGURATION_INVALID",
    })
  })

  it("rejects a missing or ambiguous selected system", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments,shared-services"
    const upstream = vi.spyOn(globalThis, "fetch")

    const missing = await POST(post({ question: "count S3 buckets" }))
    const ambiguous = await POST(
      post({ question: "count S3 buckets", systemName: ["payments", "shared-services"] }),
    )

    expect(missing.status).toBe(400)
    expect(await missing.json()).toMatchObject({ code: "COPILOT_SYSTEM_SCOPE_REQUIRED" })
    expect(ambiguous.status).toBe(400)
    expect(await ambiguous.json()).toMatchObject({ code: "COPILOT_SYSTEM_SCOPE_REQUIRED" })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("rejects direct-request tampering outside the server-owned allowlist", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments,shared-services"
    const upstream = vi.spyOn(globalThis, "fetch")

    const response = await POST(
      post({
        question: "show critical issues",
        systemName: "executive-secret-system",
        authorizedSystems: ["executive-secret-system"],
        scope: { systemName: "executive-secret-system" },
      }),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: "COPILOT_SYSTEM_SCOPE_FORBIDDEN" })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("rejects a model-selected cross-system scope before the browser can execute it", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        status: "routed",
        chosen_tool: "inventory-count",
        tool_args: { resourceType: "s3", systemName: "other-system" },
        explanation: "count buckets",
        source: "llm",
      }),
    )

    const response = await POST(post({ question: "count S3 buckets", systemName: "payments" }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "COPILOT_SCOPE_CONFLICT" })
  })

  it("canonicalizes an authorized request and strips caller-supplied trust fields", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments,shared-services"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        status: "routed",
        chosen_tool: "inventory-count",
        tool_args: { resourceType: "s3" },
        explanation: "count buckets",
        source: "llm",
      }),
    )

    const response = await POST(
      post({
        question: "  count S3 buckets  ",
        systemName: "payments",
        resourceType: "s3",
        principal: "admin",
        authorizedSystems: ["*"],
        scope: { systemName: "other-system" },
      }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      tool_args: { resourceType: "s3", systemName: "payments" },
      request_scope: { systemName: "payments", source: "server_policy" },
    })
    expect(upstream).toHaveBeenCalledTimes(1)
    const upstreamRequest = upstream.mock.calls[0]
    expect(upstreamRequest[0]).toBe("https://serving-backend.example/api/copilot/ask")
    expect(JSON.parse(String(upstreamRequest[1]?.body))).toEqual({
      question: "count S3 buckets",
      systemName: "payments",
      resourceType: "s3",
    })
  })

  it("rejects tools whose downstream endpoint cannot enforce system scope", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        status: "routed",
        chosen_tool: "unused-on-role",
        tool_args: { roleName: "SharedAdminRole", systemName: "payments" },
        explanation: "inspect role",
        source: "llm",
      }),
    )

    const response = await POST(
      post({ question: "unused permissions on SharedAdminRole", systemName: "payments" }),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: "COPILOT_TOOL_SCOPE_UNSUPPORTED" })
  })

  it("preserves a valid fail-closed abstention without executing a tool", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        status: "abstained",
        chosen_tool: null,
        tool_args: {},
        explanation: "This question is outside the supported read-only operations.",
        source: "keyword",
        reason_code: "unsupported_question",
      }),
    )

    const response = await POST(
      post({ question: "frobnicate the moon lattice", systemName: "payments" }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "abstained",
      chosen_tool: null,
      tool_args: {},
      explanation: "This question is outside the supported read-only operations.",
      source: "keyword",
      reason_code: "unsupported_question",
      request_scope: { systemName: "payments", source: "server_policy" },
    })
  })

  it("rejects a routed-looking payload without the routed state", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        chosen_tool: "inventory-count",
        tool_args: { resourceType: "s3" },
        explanation: "count buckets",
        source: "llm",
      }),
    )

    const response = await POST(
      post({ question: "count S3 buckets", systemName: "payments" }),
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      code: "COPILOT_INVALID_ROUTER_RESPONSE",
    })
  })
})
