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

export function installCustomerBackendAuthFetch(): void {
  if (process.env.CYNTRO_DEPLOYMENT_MODE !== "CUSTOMER_RESIDENT") return

  const markedGlobal = globalThis as MarkedGlobal
  if (markedGlobal[INSTALL_MARKER]) return

  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  const backend = process.env.BACKEND_URL_OVERRIDE?.trim()
  if (!token || !backend) {
    throw new Error(
      "Customer-resident UI requires CYNTRO_SERVICE_TOKEN and BACKEND_URL_OVERRIDE",
    )
  }

  const backendOrigin = new URL(backend).origin
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
