const TRANSIENT_BACKEND_STATUSES = new Set([502, 503, 504])

export function shouldRetryBackendStatus(status: number): boolean {
  return TRANSIENT_BACKEND_STATUSES.has(status)
}

export async function fetchBackendWithRetry(
  url: string,
  init: RequestInit,
  retryDelayMs = 600,
): Promise<Response> {
  const first = await fetch(url, init)
  if (!shouldRetryBackendStatus(first.status)) return first

  // Drain the provider error page before retrying so the connection can be
  // reused. Estate reads are idempotent, so one bounded retry is safe.
  await first.arrayBuffer().catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
  return fetch(url, init)
}

export function backendFailureMessage(
  service: "Inspector" | "Readiness",
  status: number,
  rawBody: string,
): string {
  try {
    const parsed = JSON.parse(rawBody) as { detail?: unknown; error?: unknown }
    const message = parsed.detail ?? parsed.error
    if (typeof message === "string" && message.trim()) return message.trim()
  } catch {
    // Provider error pages are HTML and are normalized below.
  }

  if (status >= 500) {
    if (/service (?:has been )?suspended/i.test(rawBody)) {
      return `${service} service suspended or unavailable`
    }
    return `${service} backend temporarily unavailable`
  }

  const plainText = rawBody
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return plainText.slice(0, 300) || `${service} backend returned ${status}`
}
