import {HOSTED_DEFAULTS} from "./hosted-defaults"

function pointsAtLocalhost(url: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
}

/**
 * Backend that owns the certified Inspector -> projector -> Neptune refresh lane.
 *
 * This is deliberately separate from BACKEND_URL_OVERRIDE. That override points
 * at the customer-scoped read API used by the rest of the UI and must not steer
 * mutation/collection requests to a serving tier that lacks the projector queue.
 */
export function isNeptuneRefreshBackendConfigured(): boolean {
  return Boolean(process.env.CYNTRO_SYNC_BACKEND_URL?.trim())
}

export function getNeptuneRefreshBackendBaseUrl(): string {
  const configured = process.env.CYNTRO_SYNC_BACKEND_URL?.trim()
  // Customer-resident: the configured lane or nothing. The hosted address is not in that image,
  // and the callers ask isNeptuneRefreshBackendConfigured() first and hold when it is false.
  const fallback = process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT" ? null : HOSTED_DEFAULTS?.neptuneRefreshBackend ?? null
  if (!configured && fallback === null) {
    throw new Error("[neptune-refresh-backend] CYNTRO_SYNC_BACKEND_URL is unset and this install has no hosted refresh backend")
  }
  const resolved = (configured || fallback || "").replace(/\/+$/, "")

  if (
    (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") &&
    pointsAtLocalhost(resolved)
  ) {
    throw new Error(
      `[neptune-refresh-backend] VERCEL_ENV=${process.env.VERCEL_ENV} cannot use ${resolved}`,
    )
  }

  return resolved
}

