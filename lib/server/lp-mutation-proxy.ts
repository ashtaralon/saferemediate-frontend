import { NextResponse } from "next/server"

import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  OPERATOR_SESSION_COOKIE,
  discoverOidc,
  operatorOidcConfig,
  readOperatorSession,
  serverDerivedOperatorHeaders,
  verifyIdToken,
} from "@/lib/server/operator-session"

const APPLY_ROLES = new Set(["OPERATOR", "EMERGENCY"])

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"
const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"
const LIFECYCLE_REQUIRED = "LIFECYCLE_PROCESS_NOT_DEPLOYED"
const OPERATOR_PROOF_MISSING = "OPERATOR_PROOF_NOT_FORWARDABLE"
function brokerEnabled(): boolean {
  return process.env.CYNTRO_LP_BROKER_ENABLED === "true"
}

function serverToken(): string | null {
  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  return token || null
}

function serverScope(): { tenantId: string; accountId: string } | null {
  const tenantId = process.env.CYNTRO_TENANT_ID?.trim()
  const accountId = process.env.AWS_ACCOUNT_ID?.trim()
  if (!tenantId || !accountId) return null
  return { tenantId, accountId }
}

function rolesForGroups(groups: string[]): string[] {
  let map: Record<string, string> = {}
  try {
    map = JSON.parse(process.env.CYNTRO_OPERATOR_ROLE_MAP || "{}") as Record<string, string>
  } catch {
    return []
  }
  return groups.map((group) => map[group]).filter((role): role is string => Boolean(role))
}

const replays = new Set<string>()

export function resetLpOperatorReplays(): void {
  replays.clear()
}

async function admitOperator(request: Request, body: Record<string, unknown>, action: "execute" | "rollback") {
  const config = operatorOidcConfig()
  if (!config) return { status: 401, code: "OPERATOR_SESSION_REQUIRED" }
  const cookieApi = (request as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies
  const header = request.headers.get("cookie") || ""
  const sealed = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OPERATOR_SESSION_COOKIE}=`))?.slice(OPERATOR_SESSION_COOKIE.length + 1)
  const sessionRequest = typeof cookieApi?.get === "function"
    ? request
    : { cookies: { get: (name: string) => (name === OPERATOR_SESSION_COOKIE && sealed ? { name, value: decodeURIComponent(sealed) } : undefined) } }
  const session = await readOperatorSession(sessionRequest as never, config)
  if (!session) return { status: 401, code: "OPERATOR_SESSION_REQUIRED" }
  let claims: Record<string, unknown>
  try {
    const discovery = await discoverOidc(config.issuer)
    claims = await verifyIdToken(session.idToken, {
      issuer: config.issuer,
      clientId: config.clientId,
      nonce: session.nonce,
      jwksUri: discovery.jwks_uri,
    })
  } catch {
    return { status: 401, code: "OPERATOR_SESSION_REQUIRED" }
  }
  if (String(claims.sub || "") !== session.subject) return { status: 401, code: "OPERATOR_SESSION_REQUIRED" }
  const scope = serverScope()
  if (!scope) return { status: 503, code: "SERVER_SCOPE_UNAVAILABLE" }
  const groups = Array.isArray(claims.groups) ? claims.groups.filter((item): item is string => typeof item === "string") : []
  const roles = rolesForGroups(groups)
  const allowed = action === "rollback" ? new Set([...APPLY_ROLES, "APPROVER"]) : APPLY_ROLES
  if (!roles.some((role) => allowed.has(role))) return { status: 403, code: "OPERATOR_APPLY_FORBIDDEN" }
  for (const key of ["tenant_id", "customer_id", "account_id", "actor", "role"]) {
    if (key in body && String(body[key] || "") !== (key === "account_id" ? scope.accountId : key === "actor" ? session.subject : key === "role" ? "" : scope.tenantId)) {
      return { status: 403, code: "FORGED_SCOPE_REFUSED" }
    }
  }
  if (request.headers.get("x-cyntro-role") || request.headers.get("x-forwarded-url")) {
    return { status: 403, code: "FORGED_SCOPE_REFUSED" }
  }
  // Apply is admitted on its plan head, once per operator. Restore names the
  // operation it undoes, carries no plan and must stay retryable: its
  // idempotency is the backend ledger's, not this process's memory.
  if (action === "rollback") {
    const operationId = body.operation_id
    if (typeof operationId !== "string" || !operationId) return { status: 422, code: "RESTORE_TRANSACTION_MISSING" }
    return { status: 200, code: "ADMITTED", subject: session.subject, ...scope }
  }
  const planHead = body.plan_head
  if (typeof planHead !== "string" || !planHead) return { status: 422, code: "PLAN_EMPTY" }
  const replay = `${session.subject}:${planHead}`
  if (replays.has(replay)) return { status: 409, code: "PLAN_REPLAY_REFUSED" }
  replays.add(replay)
  return { status: 200, code: "ADMITTED", subject: session.subject, ...scope }
}

function hasOperatorProof(headers: Record<string, string>): boolean {
  const bearer = headers.Authorization || headers.authorization
  const oidc = headers["X-Amzn-Oidc-Data"] || headers["x-amzn-oidc-data"]
  if (typeof bearer === "string" && bearer.toLowerCase().startsWith("bearer ") && bearer.slice(7).trim()) return true
  if (typeof oidc === "string" && oidc.trim()) return true
  return false
}

export async function forwardLpMutation(request: Request, path: "/api/least-privilege/apply" | "/api/least-privilege/restore") {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { code: "PLAN_EMPTY", cloud_writes: 0, attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0, origin: "proxy" },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    )
  }
  const action = path.endsWith("/restore") ? "rollback" : "execute"
  const admission = await admitOperator(request, body as Record<string, unknown>, action)
  if (!("tenantId" in admission)) {
    return NextResponse.json(
      {
        code: admission.code,
        cloud_writes: 0,
        attempted_writes: 0,
        confirmed_writes: 0,
        unknown_writes: 0,
        origin: "proxy",
      },
      { status: admission.status, headers: { "Cache-Control": "no-store" } },
    )
  }
  const token = serverToken()
  if (!token) {
    return NextResponse.json(
      {
        error_code: NOT_CONFIGURED,
        code: NOT_CONFIGURED,
        cloud_writes: 0,
        attempted_writes: 0,
        confirmed_writes: 0,
        unknown_writes: 0,
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  if (!brokerEnabled()) {
    return NextResponse.json(
      {
        code: LIFECYCLE_REQUIRED,
        cloud_writes: 0,
        attempted_writes: 0,
        confirmed_writes: 0,
        unknown_writes: 0,
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  // Re-prove the same sealed session for the private broker. Body actor is not
  // authority — the broker verifies Bearer / ALB OIDC independently.
  const operatorHeaders = await serverDerivedOperatorHeaders(request as never)
  if (!hasOperatorProof(operatorHeaders)) {
    return NextResponse.json(
      {
        code: OPERATOR_PROOF_MISSING,
        cloud_writes: 0,
        attempted_writes: 0,
        confirmed_writes: 0,
        unknown_writes: 0,
        origin: "proxy",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }
  const forwarded = { ...(body as Record<string, unknown>) }
  delete forwarded.lifecycle_url
  delete forwarded.lifecycleUrl
  delete forwarded.role
  forwarded.tenant_id = admission.tenantId
  forwarded.account_id = admission.accountId
  forwarded.actor = admission.subject
  const brokerPath = path.endsWith("/restore") ? "/api/lp-lifecycle/restore" : "/api/lp-lifecycle/apply"
  const response = await fetch(`${getBackendBaseUrl().replace(/\/+$/, "")}${brokerPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SERVICE_TOKEN_HEADER]: token,
      ...operatorHeaders,
    },
    cache: "no-store",
    body: JSON.stringify(forwarded),
  })
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const payload: Record<string, unknown> = parsed && typeof parsed === "object" ? { ...(parsed as Record<string, unknown>) } : {
    code: "UNREADABLE", cloud_writes: null, attempted_writes: null, confirmed_writes: null, unknown_writes: null,
  }
  if (payload.code === "APPLY_OUTCOME_UNKNOWN" && payload.unknown_writes === 0) payload.unknown_writes = null
  return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } })
}
