/**
 * How the LP tab reads a failed /api/proxy/least-privilege/issues response.
 *
 * The proxy forwards the backend's typed refusal (code, message) with
 * `X-Cyntro-Error-Origin: backend`, and marks its own failures `proxy`. The tab
 * shows the typed code/message, never "[object Object]", and retries only what
 * can change on its own: the proxy's own timeout (504) and its own unreachable
 * answer (503 from the proxy). A typed backend 503 (e.g. the analysis is
 * incomplete, the runtime is unavailable) and every denial are shown at once.
 */
export type LpIssuesFailure = { message: string; code?: string; retryable: boolean }

export function lpIssuesFailure(status: number, origin: string | null, body: unknown): LpIssuesFailure {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const detail = b.detail
  const d = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {}
  const code = typeof d.code === "string" && d.code ? d.code : undefined
  const message =
    (typeof d.message === "string" && d.message) ||
    code ||
    (typeof detail === "string" && detail) ||
    (typeof b.error === "string" && b.error) ||
    `HTTP ${status}`
  const retryable = status === 504 ? origin !== "backend" : status === 503 && origin === "proxy"
  return { message, code, retryable }
}
