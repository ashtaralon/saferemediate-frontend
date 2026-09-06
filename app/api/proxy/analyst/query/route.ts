import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { authorizeCopilotSystem } from "@/lib/server/copilot-scope"

export const maxDuration = 60
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }
const ANSWER_STATES = new Set(["answered", "partial", "clarify", "abstain", "unavailable"])

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

function safeObject(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null
}

async function readUpstream(response: Response): Promise<Record<string, any> | null> {
  const text = await response.text()
  if (!text) return null
  try {
    return safeObject(JSON.parse(text))
  } catch {
    return null
  }
}

function oidcData(req: NextRequest): string {
  // The backend verifies this ALB-signed JWS. Never forward the unsigned
  // identity header as authority and never accept identity/scope in the body.
  return req.headers.get("x-amzn-oidc-data")!.trim()
}

function scopeConflict(data: Record<string, any>, systemName: string): boolean {
  const effectiveScope = safeObject(data.effective_scope)
  return effectiveScope !== null && effectiveScope.system_id !== systemName
}

function upstreamError(response: Response, data: Record<string, any> | null) {
  return json(response.status, {
    status: data?.status || "unavailable",
    reason_code:
      data?.reason_code || data?.error_code || data?.code || "ANALYST_BACKEND_UNAVAILABLE",
  })
}

export async function GET(req: NextRequest) {
  const requestedSystem = req.nextUrl.searchParams.get("systemName")
  const scope = authorizeCopilotSystem(req, requestedSystem)
  if (!scope.enabled) {
    return json(scope.status, {
      enabled: false,
      status: "unavailable",
      reason_code: scope.code.replace(/^COPILOT_/, "ANALYST_"),
    })
  }

  const target = new URL("/api/analyst/capability", getBackendBaseUrl())
  target.searchParams.set("systemName", scope.systemName)
  try {
    const response = await fetch(target, {
      cache: "no-store",
      headers: { Accept: "application/json", "X-Amzn-Oidc-Data": oidcData(req) },
    })
    const data = await readUpstream(response)
    if (!response.ok) return upstreamError(response, data)
    if (
      !data ||
      data.enabled !== true ||
      data.status !== "ready" ||
      data.systemName !== scope.systemName ||
      typeof data.release_fingerprint !== "string" ||
      !data.release_fingerprint
    ) {
      return json(502, {
        enabled: false,
        status: "unavailable",
        reason_code: "ANALYST_INVALID_CAPABILITY_RESPONSE",
      })
    }
    return json(200, {
      enabled: true,
      status: "ready",
      systemName: scope.systemName,
      release_fingerprint: data.release_fingerprint,
    })
  } catch {
    return json(502, {
      enabled: false,
      status: "unavailable",
      reason_code: "ANALYST_BACKEND_UNAVAILABLE",
    })
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> | null = null
  try {
    body = safeObject(await req.json())
  } catch {
    // Handled by the common invalid-request response below.
  }
  if (!body) {
    return json(400, { status: "unavailable", reason_code: "ANALYST_INVALID_REQUEST" })
  }

  const scope = authorizeCopilotSystem(req, body.systemName)
  if (!scope.enabled) {
    return json(scope.status, {
      status: "unavailable",
      reason_code: scope.code.replace(/^COPILOT_/, "ANALYST_"),
    })
  }

  const question = typeof body.question === "string" ? body.question.trim() : ""
  const locale = typeof body.locale === "string" ? body.locale.trim() : "en"
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "UTC"
  if (
    !question ||
    question.length > 2_000 ||
    locale.length < 2 ||
    locale.length > 32 ||
    !timezone ||
    timezone.length > 64
  ) {
    return json(400, { status: "unavailable", reason_code: "ANALYST_INVALID_REQUEST" })
  }

  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/analyst/query`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Amzn-Oidc-Data": oidcData(req),
      },
      body: JSON.stringify({ question, systemName: scope.systemName, locale, timezone }),
    })
    const data = await readUpstream(response)
    if (!data) {
      return json(502, { status: "unavailable", reason_code: "ANALYST_INVALID_RESPONSE" })
    }
    if (scopeConflict(data, scope.systemName)) {
      return json(409, { status: "unavailable", reason_code: "ANALYST_SCOPE_CONFLICT" })
    }
    if (!response.ok) return upstreamError(response, data)
    if (!ANSWER_STATES.has(data.status)) {
      return json(502, { status: "unavailable", reason_code: "ANALYST_INVALID_RESPONSE" })
    }
    // Every successful runtime response, including abstain and clarify, is
    // bound to the effective server-owned scope. Absence is also a conflict.
    if (safeObject(data.effective_scope)?.system_id !== scope.systemName) {
      return json(409, { status: "unavailable", reason_code: "ANALYST_SCOPE_CONFLICT" })
    }
    return json(200, data)
  } catch {
    return json(502, { status: "unavailable", reason_code: "ANALYST_BACKEND_UNAVAILABLE" })
  }
}
