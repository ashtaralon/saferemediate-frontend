import {getBackendBaseUrl} from "@/lib/server/backend-url"

const INSTALL_MARKER = Symbol.for("cyntro.customerBackendAuthFetch")

type MarkedGlobal = typeof globalThis & {
  [INSTALL_MARKER]?: boolean
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL | null {
  try {
    const raw = typeof input === "string" || input instanceof URL ? input.toString() : input.url
    return new URL(raw)
  } catch {
    return null
  }
}

/** Origin of the backend this deployment talks to, or null if unresolvable.
 *
 * Resolution failing must never stop the server booting: no origin means no
 * header, which is exactly the behaviour before this function existed.
 */
function hostedBackendOrigin(): string | null {
  try {
    return new URL(getBackendBaseUrl()).origin
  } catch {
    return null
  }
}

/** Attach the service token to every backend call this server makes.
 *
 * The backend's global auth boundary (unified/auth_boundary.py) has three
 * modes and ships in `observe`: it records whether a caller presented
 * `X-Cyntro-Service-Token` but blocks nothing. `enforce` is what actually
 * protects the API — including the ~45 mutating `/api/admin/*` handlers, none
 * of which carries a per-endpoint token check — and it cannot be switched on
 * while the only caller that authenticates is the customer-resident UI. This
 * server is that missing caller.
 *
 * Sending the header while the backend is still in `observe` changes no
 * behaviour; it makes the boundary's own telemetry show authenticated traffic,
 * which is the measurement the rollout is waiting on.
 *
 * Two shapes, one rule — only ever the backend's exact origin:
 *
 *   CUSTOMER_RESIDENT   token and BACKEND_URL_OVERRIDE are mandatory, and a
 *                       missing secret fails startup rather than silently
 *                       running unauthenticated.
 *   hosted (C1 / SaaS)  attaches the token when CYNTRO_SERVICE_TOKEN is set,
 *                       and is a no-op when it is not, so setting the variable
 *                       is what turns this on and nothing breaks before then.
 */
export function installCustomerBackendAuthFetch(): void {
  const markedGlobal = globalThis as MarkedGlobal
  if (markedGlobal[INSTALL_MARKER]) return

  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  let backendOrigin: string | null

  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    const backend = process.env.BACKEND_URL_OVERRIDE?.trim()
    if (!token || !backend) {
      throw new Error(
        "Customer-resident UI requires CYNTRO_SERVICE_TOKEN and BACKEND_URL_OVERRIDE",
      )
    }
    backendOrigin = new URL(backend).origin
  } else {
    // No token configured is the pre-rollout state, not a misconfiguration:
    // leave fetch untouched so the hosted deployment behaves exactly as before.
    if (!token) return
    backendOrigin = hostedBackendOrigin()
    if (!backendOrigin) return
  }

  const originalFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = (input, init = {}) => {
    const url = requestUrl(input)
    if (!url || url.origin !== backendOrigin) return originalFetch(input, init)

    const inherited = input instanceof Request ? input.headers : undefined
    const headers = new Headers(init.headers ?? inherited)
    headers.set("X-Cyntro-Service-Token", token)
    return originalFetch(input, {...init, headers})
  }
  markedGlobal[INSTALL_MARKER] = true
}
