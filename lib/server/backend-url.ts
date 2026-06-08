const RENDER_PROD = "https://saferemediate-backend-f.onrender.com"

let _logged = false
let _validated = false

function isVercelDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
}

function pointsAtLocalhost(url: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
}

export function getBackendBaseUrl(): string {
  const override = process.env.BACKEND_URL_OVERRIDE
  const resolved = override || RENDER_PROD

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
  return {
    resolved: getBackendBaseUrl(),
    overrideSet: Boolean(override),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    pointsAtLocalhost: pointsAtLocalhost(override || RENDER_PROD),
  }
}

if (typeof process !== "undefined" && process.env.VERCEL_ENV) {
  getBackendBaseUrl()
}
