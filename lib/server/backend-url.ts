// The old shared backend is suspended. C1 is the tenant-scoped serving
// surface that owns the durable Attack Path snapshots used by this UI.
import {HOSTED_DEFAULTS} from "./hosted-defaults"

let _logged = false
let _validated = false

function isVercelDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
}

function isCustomerResident(): boolean {
  return process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT"
}

function pointsAtLocalhost(url: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
}

/** A host Cyntro operates. A customer-resident install must never resolve to one. */
export function pointsAtHostedCyntro(url: string): boolean {
  return /(^|\/\/|\.)(onrender\.com|vercel\.app|cyntro\.(?:io|ai|com))(:|\/|$)/i.test(url)
}

function deploymentDefaultBackend(): string | null {
  if (HOSTED_DEFAULTS === null) return null
  const deploymentHosts = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean)

  // C1 is a separate production project.  It must never silently fall back to
  // the legacy SaaS service: that service can be paused independently, which
  // previously turned healthy C1 endpoints into proxy-level 502s.
  if (deploymentHosts.some((host) => host === "cyntro-c1.vercel.app")) {
    return HOSTED_DEFAULTS.c1Backend
  }
  return HOSTED_DEFAULTS.legacyBackend
}

/**
 * The backend this server proxies to.
 *
 * Customer-resident: BACKEND_URL_OVERRIDE, and nothing else. There is no default to fall back
 * to -- the hosted addresses are not in that image at all -- and an override that names a host
 * Cyntro operates is refused: the whole point of that install is that nothing leaves the account.
 */
export function getBackendBaseUrl(): string {
  const override = process.env.BACKEND_URL_OVERRIDE?.trim() || ""
  if (isCustomerResident()) {
    if (!override) {
      throw new Error(
        "[backend-url] FATAL: CYNTRO_DEPLOYMENT_MODE=CUSTOMER_RESIDENT and BACKEND_URL_OVERRIDE is unset. " +
          "A customer-resident install has no hosted backend to fall back to; set it to this install's own backend.",
      )
    }
    if (pointsAtHostedCyntro(override)) {
      throw new Error(
        `[backend-url] FATAL: CYNTRO_DEPLOYMENT_MODE=CUSTOMER_RESIDENT but BACKEND_URL_OVERRIDE is "${override}", ` +
          "a host Cyntro operates. A customer-resident install reaches only its own account.",
      )
    }
    return override
  }
  const resolved = override || deploymentDefaultBackend()
  if (resolved === null) {
    throw new Error("[backend-url] FATAL: this image carries no hosted backend address and BACKEND_URL_OVERRIDE is unset.")
  }

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
  const resolved = getBackendBaseUrl()
  return {
    resolved,
    overrideSet: Boolean(override),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    pointsAtLocalhost: pointsAtLocalhost(resolved),
  }
}

if (typeof process !== "undefined" && process.env.VERCEL_ENV) {
  getBackendBaseUrl()
}
