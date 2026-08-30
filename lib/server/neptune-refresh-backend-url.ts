const DEFAULT_NEPTUNE_REFRESH_BACKEND = "https://saferemediate-backend-f.onrender.com"

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
  const resolved = (configured || DEFAULT_NEPTUNE_REFRESH_BACKEND).replace(/\/+$/, "")

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

