/**
 * Shared error responses for backend-proxy routes.
 *
 * Replaces the "200-with-empty-fallback" anti-pattern that several proxies
 * historically used. Returning 200 with an empty payload when the backend
 * is broken is dangerous in a security tool — the UI cannot distinguish
 * "fetched, system is genuinely clean" from "backend is down" and renders
 * the green-checkmark success state for both. Today's 5+ minute Render
 * outage exposed this on the system dashboard, where every Risk → Least
 * Privilege view said "No LP issues for system X" while the backend was
 * actually returning 12 resources with 40 excess permissions per system.
 *
 * Use these helpers from any `/api/proxy/...` route handler. The frontend
 * components already have `if (!response.ok) throw / setError(...)` paths
 * that render an honest "Error loading data" card; they only ever showed
 * the success-empty state because the proxy lied about the response.
 *
 * Cache-Control: 'no-store' on every error so neither browsers nor Vercel
 * Edge Network ever cache an error response. Stale-cache-on-error is the
 * same anti-pattern at proxy level — also forbidden here.
 */
import { NextResponse } from "next/server"

export type ProxyErrorBody = {
  error: string
  detail?: string
  backendStatus?: number
  origin: "proxy"
}

/** Header naming who produced an error response: this proxy, or the backend it relayed. */
export const ERROR_ORIGIN_HEADER = "X-Cyntro-Error-Origin"

/**
 * Status the role gap-analysis (Review) proxy answers for a backend error status.
 *
 * Three meanings a caller must never confuse:
 * - 401 / 403: the backend refused the identity or the scope (a denial, including
 *   a downstream authentication failure of the proxy's own proof). Kept.
 * - 503: the backend is up and says a dependency is unavailable. Kept.
 * - 504: reserved for THIS proxy's own 55s abort (``fromCaughtError``). A 504
 *   the backend (or its load balancer) answered is not a local timeout, so it
 *   and every other backend 5xx become 502, with ``backendStatus`` saying what
 *   the backend actually answered.
 * Other 4xx pass through.
 */
export function reviewProxyStatus(backendStatus: number): number {
  if (backendStatus === 401 || backendStatus === 403 || backendStatus === 503) return backendStatus
  if (backendStatus >= 500) return 502
  return backendStatus
}

/**
 * Backend returned a non-2xx status. Mirror 4xx straight through; collapse
 * 5xx to 502 Bad Gateway so callers can treat all server-side faults
 * uniformly. Never returns 200.
 */
/** The typed fields a backend refusal may carry through a proxy. Nothing else is forwarded. */
export type AllowlistedBackendDetail = {
  code?: string
  /** The off-boundary refusal's typed code (``{detail: {error, reason_code, message}}``, 409 off_boundary_mutation_refused). */
  reason_code?: string
  error?: string
  message?: string
  upstream_code?: string
  failing_axes?: string[]
  failed_analyzers?: string[]
}

const MAX_TYPED_TEXT = 200
/** A typed message is backend-authored prose; the off-boundary refusals run to ~450 characters. */
const MAX_TYPED_MESSAGE = 1000

function typedText(value: unknown, max = MAX_TYPED_TEXT): string | undefined {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : undefined
}

function typedNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const names = value.filter((v): v is string => typeof v === "string" && v.length <= 80).slice(0, 32)
  return names.length ? names : undefined
}

/**
 * The backend refusal reduced to its typed fields. A JSON ``detail`` object keeps
 * only code / reason_code / error / message / upstream_code / failing_axes / failed_analyzers; a string
 * ``detail`` (the auth boundary's "service authentication required") becomes the
 * message. A non-JSON body (a load balancer page, stack text) forwards NOTHING:
 * raw upstream text is never echoed to the browser.
 */
export function allowlistedBackendDetail(rawBody: string): AllowlistedBackendDetail | undefined {
  let parsed: unknown
  try {
    parsed = rawBody ? JSON.parse(rawBody) : undefined
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
  const detail = (parsed as Record<string, unknown>).detail
  if (typeof detail === "string") return typedText(detail) ? { message: typedText(detail, MAX_TYPED_MESSAGE) } : undefined
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return undefined
  const d = detail as Record<string, unknown>
  const out: AllowlistedBackendDetail = {
    code: typedText(d.code),
    reason_code: typedText(d.reason_code),
    error: typedText(d.error),
    message: typedText(d.message, MAX_TYPED_MESSAGE),
    upstream_code: typedText(d.upstream_code),
    failing_axes: typedNames(d.failing_axes),
    failed_analyzers: typedNames(d.failed_analyzers),
  }
  for (const key of Object.keys(out) as (keyof AllowlistedBackendDetail)[]) {
    if (out[key] === undefined) delete out[key]
  }
  return Object.keys(out).length ? out : undefined
}

export function backendError(opts: {
  status: number
  message: string
  detail?: string
}): NextResponse {
  const responseStatus = opts.status >= 500 ? 502 : opts.status
  const body: ProxyErrorBody = {
    error: opts.message,
    detail: opts.detail,
    backendStatus: opts.status,
    origin: "proxy",
  }
  return NextResponse.json(body, {
    status: responseStatus,
    headers: { "Cache-Control": "no-store" },
  })
}

/**
 * Relay a backend non-2xx answer through the existing error contract, so a typed refusal reaches the caller and nothing
 * else does. A 4xx keeps its status and forwards only the allowlisted typed fields as ``{detail}`` (e.g. the 409
 * ``off_boundary_mutation_refused`` on a held snapshot delete or quarantine transition: error / reason_code / message).
 * A 5xx is ``backendError``: 502 with a generic message and ``backendStatus``, because a 5xx body is exception text
 * (``detail=f"Failed to delete snapshot: {str(e)}"``) and the outcome of the call is unknown. A 4xx with no typed detail
 * is UNREADABLE, produced here, so body and header both say "proxy".
 */
export async function relayBackendError(response: Response): Promise<NextResponse> {
  if (response.status >= 500) {
    const failed = backendError({ status: response.status, message: `Backend answered HTTP ${response.status}` })
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
  const detail = allowlistedBackendDetail(await response.text().catch(() => ""))
  if (detail) {
    return NextResponse.json(
      { detail, backendStatus: response.status, origin: "backend" },
      { status: response.status, headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" } },
    )
  }
  return NextResponse.json(
    {
      error: `Backend answered HTTP ${response.status} without a typed detail`,
      code: "UNREADABLE",
      backendStatus: response.status,
      origin: "proxy",
    },
    { status: response.status, headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "proxy" } },
  )
}

/** Network/abort timeout reaching the backend. */
export function backendTimeout(message = "Backend request timed out"): NextResponse {
  const body: ProxyErrorBody = {
    error: message,
    origin: "proxy",
  }
  return NextResponse.json(body, {
    status: 504,
    headers: { "Cache-Control": "no-store" },
  })
}

/** Any other exception (DNS, TCP reset, JSON parse, etc.). */
export function backendUnreachable(message: string): NextResponse {
  const body: ProxyErrorBody = {
    error: message,
    origin: "proxy",
  }
  return NextResponse.json(body, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  })
}

/**
 * Translate a thrown error into the right proxy response.
 * AbortError → 504, anything else → 503.
 */
export function fromCaughtError(error: unknown): NextResponse {
  if (error instanceof Error && error.name === "AbortError") {
    return backendTimeout()
  }
  const message = error instanceof Error ? error.message : "Unknown proxy error"
  return backendUnreachable(message)
}
