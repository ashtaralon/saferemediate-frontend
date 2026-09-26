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

/**
 * Apply reservations in THIS server instance: canonical key -> state. One in-flight owner per key, taken synchronously
 * (no await between the check and the set) immediately before the broker call, and settled on the broker's answer:
 * a 2xx keeps it; a typed refusal with every count present and zero (and not an outcome-unknown code) releases it so a
 * valid retry proceeds; anything else stays held until a resolution proves the operation not applied. Per-instance:
 * the broker's own reservation and the ledger's create-only operation row are the guards behind it.
 */
type Reservation = { state: "IN_FLIGHT" | "ADMITTED" | "UNKNOWN"; operationId: string | null }
const reservations = new Map<string, Reservation>()
const OUTCOME_UNKNOWN_CODES = new Set([
  "APPLY_OUTCOME_UNKNOWN", "READBACK_FAILED", "VERIFY_RECEIPT_MISSING", "OPERATION_RECORD_UNCONFIRMED",
  "EXECUTOR_UNAVAILABLE", "CLOUD_WRITE_UNCONFIRMED", "PARTIALLY_APPLIED", "APPLIED_UNVERIFIED",
  "LIFECYCLE_UNREACHABLE", "UNREADABLE",
])

export function resetLpOperatorReplays(): void {
  reservations.clear()
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]))
  }
  return value
}

/** Canonical JSON, types preserved: a binding of "7" is not the binding 7. */
function replayKey(subject: string, planHead: string, binding: unknown): string {
  return JSON.stringify(canonical({ actor: subject, plan_head: planHead, decision_binding: binding ?? null }))
}

function provenPreWrite(status: number, detail: Record<string, unknown>): boolean {
  const code = typeof detail.code === "string" ? detail.code : ""
  return status >= 400 && status < 600 && code !== "" && !OUTCOME_UNKNOWN_CODES.has(code)
    && detail.cloud_writes === 0 && detail.attempted_writes === 0 && detail.confirmed_writes === 0
    && detail.unknown_writes === 0
}

/** JSON exactly as the backend's ``json.dumps(value, separators=(",", ":"))`` writes it: ``ensure_ascii`` escapes every
 * UTF-16 unit outside printable ASCII (U+007F DEL included) as a lowercase ``\uXXXX`` (an astral character becomes its
 * surrogate pair). Below U+0020 JSON.stringify already writes Python's forms. */
function pythonAsciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`)
}

/**
 * The backend's stable operation id for an Apply (api/lp_remediation_route.py::_stable_operation_id): sha256 of the
 * compact JSON array [tenant, account, role ARN, plan head, "apply"], first 32 hex. Stamped on the reservation before
 * the broker call, so a resolution releases it even when the broker's answer never arrives. Pinned to the Python
 * helper by a golden vector in __tests__/lp-proxy-replay-reservation.test.ts.
 */
export async function stableApplyOperationId(tenantId: string, accountId: string, roleArn: string, planHead: string): Promise<string> {
  const payload = pythonAsciiJson([tenantId, accountId, roleArn, planHead, "apply"])
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32)
}

function settle(key: string, status: number, payload: Record<string, unknown>): void {
  const detail = payload.detail && typeof payload.detail === "object" ? (payload.detail as Record<string, unknown>) : payload
  const named = typeof detail.operation_id === "string" ? detail.operation_id
    : typeof payload.operation_id === "string" ? payload.operation_id : null
  const operationId = named ?? reservations.get(key)?.operationId ?? null   // the stamped stable id when none is named
  if (status >= 200 && status < 300) {
    reservations.set(key, { state: "ADMITTED", operationId })
  } else if (provenPreWrite(status, detail)) {
    reservations.delete(key)
  } else {
    reservations.set(key, { state: "UNKNOWN", operationId })
  }
}

function releaseResolved(operationId: string): void {
  for (const [key, reservation] of reservations) {
    if (reservation.operationId === operationId) reservations.delete(key)
  }
}

async function admitOperator(request: Request, body: Record<string, unknown>, action: "execute" | "rollback" | "lookup" | "resolve") {
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
  const allowed = action === "execute" || action === "resolve" ? APPLY_ROLES : new Set([...APPLY_ROLES, "APPROVER"])
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
  // A receipt lookup reads; it needs the Restore role and nothing more.
  if (action === "lookup") return { status: 200, code: "ADMITTED", subject: session.subject, ...scope }
  // Resolution names the outstanding operation the backend reported; the
  // backend re-checks it is the role's holder. Its idempotency is the ledger's fence.
  if (action === "resolve") {
    const operationId = body.operation_id
    if (typeof operationId !== "string" || !operationId) return { status: 422, code: "RESOLUTION_OPERATION_MISSING" }
    return { status: 200, code: "ADMITTED", subject: session.subject, ...scope }
  }
  if (action === "rollback") {
    const operationId = body.operation_id
    if (typeof operationId !== "string" || !operationId) return { status: 422, code: "RESTORE_TRANSACTION_MISSING" }
    return { status: 200, code: "ADMITTED", subject: session.subject, ...scope }
  }
  const planHead = body.plan_head
  if (typeof planHead !== "string" || !planHead) return { status: 422, code: "PLAN_EMPTY" }
  // One plan per receipted activation: the replay key includes the Review's decision_binding (generation, receipt
  // hash, publication attempt). A plan re-made after DECISION_GENERATION_MOVED carries a new binding and is not a
  // replay; the same plan against the same activation still is.
  // Reserved just before the broker call (forwardLpMutation), after every local refusal; refused early if held.
  const replay = replayKey(session.subject, planHead, body.decision_binding)
  if (reservations.has(replay)) return { status: 409, code: "PLAN_REPLAY_REFUSED" }
  return { status: 200, code: "ADMITTED", subject: session.subject, replayKey: replay, ...scope }
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
  const key = "replayKey" in admission && typeof admission.replayKey === "string" ? admission.replayKey : null
  // Computed BEFORE the check-and-set (it awaits), so nothing is awaited between the check and the set.
  const stamped = key !== null && typeof forwarded.plan_head === "string"
    ? await stableApplyOperationId(admission.tenantId, admission.accountId, String(forwarded.role_arn ?? ""), forwarded.plan_head)
    : null
  if (key !== null) {
    // Synchronous check-and-set: no await in between, so two concurrent requests cannot both take it.
    if (reservations.has(key)) {
      return NextResponse.json({ code: "PLAN_REPLAY_REFUSED", ...ZERO_WRITES, origin: "proxy" },
        { status: 409, headers: { "Cache-Control": "no-store" } })
    }
    reservations.set(key, { state: "IN_FLIGHT", operationId: stamped })
  }
  let response: Response
  try {
    response = await fetch(`${getBackendBaseUrl().replace(/\/+$/, "")}${brokerPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SERVICE_TOKEN_HEADER]: token,
        ...operatorHeaders,
      },
      cache: "no-store",
      body: JSON.stringify(forwarded),
    })
  } catch {
    // The request may have reached the writer: the reservation stays held, the outcome is unknown.
    if (key !== null) reservations.set(key, { state: "UNKNOWN", operationId: stamped })
    return NextResponse.json({ code: "LIFECYCLE_UNREACHABLE", cloud_writes: null, attempted_writes: null,
      confirmed_writes: null, unknown_writes: null, origin: "proxy" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
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
  if (key !== null) settle(key, response.status, payload)
  return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } })
}


/**
 * Read-only: the backend ledger's restorable Apply receipt for one role, so a
 * reloaded page can offer Restore for exactly that operation. The ledger is the
 * authority; this proxy adds only the operator's verified session and the
 * deployment's service token, and never widens scope from the query.
 */
export async function forwardLpReceiptLookup(request: Request) {
  const url = new URL(request.url)
  const roleArn = url.searchParams.get("role_arn") || ""
  const roleId = url.searchParams.get("role_id") || ""
  const claims: Record<string, unknown> = {}
  url.searchParams.forEach((value, key) => {
    if (key !== "role_arn" && key !== "role_id") claims[key] = value
  })
  const refuse = (status: number, code: string) =>
    NextResponse.json({ code, origin: "proxy" }, { status, headers: { "Cache-Control": "no-store" } })
  if (!roleArn || !roleId) return refuse(422, "ROLE_REFERENCE_REQUIRED")
  const admission = await admitOperator(request, claims, "lookup")
  if (!("tenantId" in admission)) return refuse(admission.status, admission.code)
  const token = serverToken()
  if (!token) return refuse(503, NOT_CONFIGURED)
  if (!brokerEnabled()) return refuse(503, LIFECYCLE_REQUIRED)
  const operatorHeaders = await serverDerivedOperatorHeaders(request as never)
  if (!hasOperatorProof(operatorHeaders)) return refuse(401, OPERATOR_PROOF_MISSING)
  const query = new URLSearchParams({ role_arn: roleArn, role_id: roleId })
  const response = await fetch(`${getBackendBaseUrl().replace(/\/+$/, "")}/api/lp-lifecycle/receipt?${query}`, {
    method: "GET",
    headers: { [SERVICE_TOKEN_HEADER]: token, ...operatorHeaders },
    cache: "no-store",
  })
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const payload = parsed && typeof parsed === "object" ? parsed : { code: "UNREADABLE" }
  return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } })
}


/** Read-only: the operation holding a role and the backend's live reconciliation of it. */
export async function forwardLpOutstanding(request: Request) {
  return forwardRoleRead(request, "/api/lp-lifecycle/outstanding")
}

async function forwardRoleRead(request: Request, brokerPath: string) {
  const url = new URL(request.url)
  const roleArn = url.searchParams.get("role_arn") || ""
  const roleId = url.searchParams.get("role_id") || ""
  const claims: Record<string, unknown> = {}
  url.searchParams.forEach((value, key) => {
    if (key !== "role_arn" && key !== "role_id") claims[key] = value
  })
  const refuse = (status: number, code: string) =>
    NextResponse.json({ code, origin: "proxy" }, { status, headers: { "Cache-Control": "no-store" } })
  if (!roleArn || !roleId) return refuse(422, "ROLE_REFERENCE_REQUIRED")
  const admission = await admitOperator(request, claims, "lookup")
  if (!("tenantId" in admission)) return refuse(admission.status, admission.code)
  const token = serverToken()
  if (!token) return refuse(503, NOT_CONFIGURED)
  if (!brokerEnabled()) return refuse(503, LIFECYCLE_REQUIRED)
  const operatorHeaders = await serverDerivedOperatorHeaders(request as never)
  if (!hasOperatorProof(operatorHeaders)) return refuse(401, OPERATOR_PROOF_MISSING)
  const query = new URLSearchParams({ role_arn: roleArn, role_id: roleId })
  const response = await fetch(`${getBackendBaseUrl().replace(/\/+$/, "")}${brokerPath}?${query}`, {
    method: "GET",
    headers: { [SERVICE_TOKEN_HEADER]: token, ...operatorHeaders },
    cache: "no-store",
  })
  return passBrokerAnswer(response)
}

async function passBrokerAnswer(response: Response) {
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const payload = parsed && typeof parsed === "object" ? parsed : { code: "UNREADABLE" }
  return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } })
}

/**
 * An operator's explicit resolution of a held Apply. Apply-level authority only.
 * The body names the operation and role; tenant, account and actor come from
 * the server session, never from the browser.
 */
export async function forwardLpResolve(request: Request) {
  const body = await request.json().catch(() => null)
  const refuse = (status: number, code: string) =>
    NextResponse.json({ code, ...ZERO_WRITES, origin: "proxy" }, { status, headers: { "Cache-Control": "no-store" } })
  if (!body || typeof body !== "object" || Array.isArray(body)) return refuse(422, "RESOLUTION_EMPTY")
  const admission = await admitOperator(request, body as Record<string, unknown>, "resolve")
  if (!("tenantId" in admission)) return refuse(admission.status, admission.code)
  const token = serverToken()
  if (!token) return refuse(503, NOT_CONFIGURED)
  if (!brokerEnabled()) return refuse(503, LIFECYCLE_REQUIRED)
  const operatorHeaders = await serverDerivedOperatorHeaders(request as never)
  if (!hasOperatorProof(operatorHeaders)) return refuse(401, OPERATOR_PROOF_MISSING)
  const record = body as Record<string, unknown>
  const forwarded = {
    operation_id: record.operation_id,
    role_arn: record.role_arn,
    role_id: record.role_id,
    resource_family: "iam-role",
    tenant_id: admission.tenantId,
    account_id: admission.accountId,
    actor: admission.subject,
  }
  const response = await fetch(`${getBackendBaseUrl().replace(/\/+$/, "")}/api/lp-lifecycle/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [SERVICE_TOKEN_HEADER]: token, ...operatorHeaders },
    cache: "no-store",
    body: JSON.stringify(forwarded),
  })
  const answer = await response.clone().json().catch(() => null)
  if (response.ok && answer && typeof answer === "object" && (answer as Record<string, unknown>).state === "RESOLVED_NOT_APPLIED"
    && typeof (answer as Record<string, unknown>).operation_id === "string") {
    releaseResolved((answer as Record<string, unknown>).operation_id as string)   // proven not applied: release
  }
  return passBrokerAnswer(response)
}

const ZERO_WRITES = { cloud_writes: 0, attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0 }
