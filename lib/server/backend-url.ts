// Canonical C1 backend. Keep the environment override for customer-resident
// deployments, but never fall back to the retired/suspended legacy service.
const RENDER_PROD = "https://cyntro-c1.onrender.com"
const RETIRED_RENDER_HOST = "saferemediate-backend-f.onrender.com"

let _logged = false
let _validated = false

function isVercelDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
}

function pointsAtLocalhost(url: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
}

function pointsAtRetiredBackend(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === RETIRED_RENDER_HOST
  } catch {
    return false
  }
}

export function getBackendBaseUrl(): string {
  const override = process.env.BACKEND_URL_OVERRIDE?.trim()
  // A stale Vercel variable must not resurrect the suspended legacy service.
  // Customer-resident and local overrides remain supported; only this retired
  // C1 hostname is rejected and replaced with the canonical backend.
  const rejectedRetiredOverride = Boolean(override && pointsAtRetiredBackend(override))
  const resolved = rejectedRetiredOverride ? RENDER_PROD : override || RENDER_PROD

  if (!_validated) {
    _validated = true
    if (isVercelDeploy() && pointsAtLocalhost(resolved)) {
      throw new Error(
        `[backend-url] FATAL: VERCEL_ENV=${process.env.VERCEL_ENV} but resolved backend URL ` +
          `is "${resolved}". This deploy cannot function. Unset BACKEND_URL_OVERRIDE in Vercel.`,
      )
    }
  }

  if (!_logged) {
    _logged = true
    const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown"
    console.log(
      `[backend-url] env=${env} override=${override ? "set" : "unset"} resolved=${resolved}`,
    )
  }

  return resolved
}

export function getBackendUrlDiagnostics() {
  const override = process.env.BACKEND_URL_OVERRIDE
  const rejectedRetiredOverride = Boolean(override && pointsAtRetiredBackend(override))
  return {
    resolved: getBackendBaseUrl(),
    overrideSet: Boolean(override),
    rejectedRetiredOverride,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    pointsAtLocalhost: pointsAtLocalhost(override || RENDER_PROD),
  }
}

if (typeof process !== "undefined" && process.env.VERCEL_ENV) {
  getBackendBaseUrl()
}
