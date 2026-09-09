import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { authorizeCopilotSystem } from "@/lib/server/copilot-scope"

export const maxDuration = 60
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

const OPTIONAL_STRING_FIELDS = [
  "roleName",
  "resourceType",
  "region",
  "nameContains",
  "createdBefore",
  "createdAfter",
  "sort",
] as const

// Every tool admitted through interim free-form routing must carry the locked
// system into its downstream product query. `unused-on-role` is intentionally
// absent: the current role endpoint cannot prove system membership.
const SYSTEM_SCOPED_TOOLS = new Set([
  "top-unused-iam",
  "broad-s3",
  "blast-radius",
  "paths-to-jewels",
  "recent-changes",
  "safe-to-apply",
  "highest-risk",
  "inventory-count",
  "inventory-list",
])

const ABSTENTION_REASON_CODES = new Set([
  "unsupported_question",
  "ambiguous_question",
  "write_not_supported",
  "invalid_model_output",
  "model_unavailable",
])

function capabilityResponse(req: NextRequest, requestedSystemName: unknown) {
  const scope = authorizeCopilotSystem(req, requestedSystemName)
  return NextResponse.json(
    {
      enabled: scope.enabled,
      code: scope.code,
      reason: scope.reason,
      systemName: scope.systemName,
    },
    {
      // Capability discovery is a typed state response. POST still uses the
      // decision's fail-closed HTTP status for enforcement.
      status: 200,
      headers: NO_STORE_HEADERS,
    },
  )
}

export async function GET(req: NextRequest) {
  return capabilityResponse(req, req.nextUrl.searchParams.get("systemName"))
}

function upstreamBody(body: Record<string, unknown>, systemName: string) {
  const result: Record<string, unknown> = {
    question: typeof body.question === "string" ? body.question.trim() : body.question,
    systemName,
  }

  for (const field of OPTIONAL_STRING_FIELDS) {
    if (typeof body[field] === "string" && body[field].trim()) {
      result[field] = body[field].trim()
    }
  }
  if (Number.isInteger(body.windowDays)) result.windowDays = body.windowDays

  return result
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "COPILOT_INVALID_REQUEST" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "JSON body must be an object", code: "COPILOT_INVALID_REQUEST" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const scope = authorizeCopilotSystem(req, body.systemName)
  if (!scope.enabled) {
    return NextResponse.json(
      { error: scope.reason, code: scope.code },
      { status: scope.status, headers: NO_STORE_HEADERS },
    )
  }

  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json(
      { error: "Question is required", code: "COPILOT_INVALID_REQUEST" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const backendBase = getBackendBaseUrl()
  const target = `${backendBase}/api/copilot/ask`
  const signedOidcClaims = req.headers.get("x-amzn-oidc-data")

  try {
    const response = await fetch(target, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // The backend independently verifies this ALB-signed JWS and derives
        // policy-backed RequestScope. Never forward the unsigned identity or
        // caller-supplied authorization fields.
        "X-Amzn-Oidc-Data": signedOidcClaims!,
      },
      // Rebuild instead of spreading the caller's object. In particular,
      // caller-supplied scope/principal/authorizedSystems fields never cross
      // the BFF boundary, and systemName is replaced with server-authorized
      // canonical scope.
      body: JSON.stringify(upstreamBody(body, scope.systemName)),
    })

    const text = await response.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.detail || data?.error || `Backend returned ${response.status}`,
          code: data?.error_code || data?.code || "COPILOT_ROUTER_UNAVAILABLE",
          status: data?.status,
          reason_code: data?.reason_code,
        },
        { status: response.status, headers: NO_STORE_HEADERS },
      )
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json(
        { error: "Copilot router returned an invalid response", code: "COPILOT_INVALID_ROUTER_RESPONSE" },
        { status: 502, headers: NO_STORE_HEADERS },
      )
    }

    if (data.status === "abstained") {
      const validAbstention =
        data.chosen_tool === null &&
        data.tool_args &&
        typeof data.tool_args === "object" &&
        !Array.isArray(data.tool_args) &&
        Object.keys(data.tool_args).length === 0 &&
        typeof data.explanation === "string" &&
        typeof data.reason_code === "string" &&
        ABSTENTION_REASON_CODES.has(data.reason_code) &&
        ["llm", "keyword", "policy"].includes(data.source)
      if (!validAbstention) {
        return NextResponse.json(
          {
            error: "Copilot router returned an invalid abstention.",
            code: "COPILOT_INVALID_ROUTER_RESPONSE",
          },
          { status: 502, headers: NO_STORE_HEADERS },
        )
      }

      return NextResponse.json(
        {
          status: "abstained",
          chosen_tool: null,
          tool_args: {},
          explanation: data.explanation,
          source: data.source,
          reason_code: data.reason_code,
          request_scope: { systemName: scope.systemName, source: "server_policy" },
        },
        { headers: NO_STORE_HEADERS },
      )
    }

    if (data.status !== "routed") {
      return NextResponse.json(
        {
          error: "Copilot router returned an invalid decision state.",
          code: "COPILOT_INVALID_ROUTER_RESPONSE",
        },
        { status: 502, headers: NO_STORE_HEADERS },
      )
    }

    const toolArgs =
      data.tool_args && typeof data.tool_args === "object" && !Array.isArray(data.tool_args)
        ? data.tool_args
        : {}
    if (typeof data.chosen_tool !== "string" || !SYSTEM_SCOPED_TOOLS.has(data.chosen_tool)) {
      return NextResponse.json(
        {
          error: "The selected Copilot tool cannot enforce the immutable system scope.",
          code: "COPILOT_TOOL_SCOPE_UNSUPPORTED",
        },
        { status: 422, headers: NO_STORE_HEADERS },
      )
    }
    const modelSystem = toolArgs.systemName
    if (
      modelSystem !== undefined &&
      (typeof modelSystem !== "string" || modelSystem.trim() !== scope.systemName)
    ) {
      return NextResponse.json(
        {
          error: "Copilot router returned a system outside the immutable request scope.",
          code: "COPILOT_SCOPE_CONFLICT",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      )
    }

    return NextResponse.json(
      {
        ...data,
        tool_args: { ...toolArgs, systemName: scope.systemName },
        request_scope: { systemName: scope.systemName, source: "server_policy" },
      },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Failed to reach copilot router",
        code: "COPILOT_ROUTER_UNAVAILABLE",
      },
      { status: 502, headers: NO_STORE_HEADERS }
    )
  }
}
