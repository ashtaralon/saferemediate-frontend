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
  /** The backend's own body when it was JSON, else its text. Never truncated
   *  when it parsed: a refusal's `code` is the only thing that lets the UI say
   *  WHICH fault this is, and slicing the JSON destroyed it. */
  detail?: string | Record<string, unknown>
  backendStatus?: number
  origin: "proxy"
}

/**
 * Backend returned a non-2xx status. Mirror 4xx straight through; collapse
 * 5xx to 502 Bad Gateway so callers can treat all server-side faults
 * uniformly. Never returns 200.
 *
 * `preserveStatus` opts one route out of that collapse. It exists because the
 * collapse is not free: a deliberately disabled capability answers a typed
 * 503, and flattening it to 502 tells the operator "the gateway is broken"
 * about a deployment that is working exactly as configured. Routes whose
 * backend emits typed refusals pass `preserveStatus: true`; the other 23
 * callers keep the uniform behaviour they were written against, so this
 * changes no existing contract.
 */
export function backendError(opts: {
  status: number
  message: string
  detail?: string | Record<string, unknown>
  preserveStatus?: boolean
}): NextResponse {
  const responseStatus =
    opts.preserveStatus || opts.status < 500 ? opts.status : 502
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
