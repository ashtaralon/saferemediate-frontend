const RENDER_PROD = "https://saferemediate-backend-f.onrender.com"
const C1_RENDER_PROD = "https://cyntro-c1.onrender.com"

let _logged = false
let _validated = false

function isVercelDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
}

function pointsAtLocalhost(url: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
}

function deploymentDefaultBackend(): string {
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
    return C1_RENDER_PROD
  }
  return RENDER_PROD
}

export function getBackendBaseUrl(): string {
  const override = process.env.BACKEND_URL_OVERRIDE
  const resolved = override || deploymentDefaultBackend()

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
  const resolved = override || deploymentDefaultBackend()
  return {
    resolved: getBackendBaseUrl(),
    overrideSet: Boolean(override),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    pointsAtLocalhost: pointsAtLocalhost(resolved),
  }
}

if (typeof process !== "undefined" && process.env.VERCEL_ENV) {
  getBackendBaseUrl()
}
