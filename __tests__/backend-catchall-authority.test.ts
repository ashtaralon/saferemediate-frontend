// @vitest-environment node
import {afterEach, describe, expect, it, vi} from "vitest"

// /api/backend/[...path] used to relay any method to any backend path. The
// only gate in front of it on hosted is the shared SITE_PASSWORD session, and
// instrumentation's fetch patch stamps X-Cyntro-Service-Token on every call to
// the backend origin. So once the backend's auth boundary enforces, anyone with
// the site password would reach every route (/api/admin/* included) as the
// deployment's own service identity. No rendered component calls this route,
// so it refuses everything and never contacts the backend.

const BACKEND = "http://127.0.0.1:8000"
const TOKEN = "deployment-service-token"

function context(path: string[]) {
  return {params: Promise.resolve({path})}
}

async function installPatchedFetch(mode?: "CUSTOMER_RESIDENT") {
  if (mode) process.env.CYNTRO_DEPLOYMENT_MODE = mode
  process.env.CYNTRO_SERVICE_TOKEN = TOKEN
  process.env.BACKEND_URL_OVERRIDE = BACKEND
  const upstream = vi.fn().mockResolvedValue(new Response("{}", {status: 200}))
  globalThis.fetch = upstream
  const {installCustomerBackendAuthFetch} = await import("@/lib/server/customer-backend-auth")
  installCustomerBackendAuthFetch()
  return upstream
}

function tokenCalls(upstream: ReturnType<typeof vi.fn>) {
  return upstream.mock.calls.filter(([, init]) =>
    new Headers((init as RequestInit | undefined)?.headers).has("X-Cyntro-Service-Token"),
  )
}

describe("backend catch-all relay authority", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.CYNTRO_DEPLOYMENT_MODE
    delete process.env.CYNTRO_SERVICE_TOKEN
    delete process.env.BACKEND_URL_OVERRIDE
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
    vi.restoreAllMocks()
    vi.resetModules()
  })

  // Positive control: the instrument can see the credential. Without this, a
  // "no token reached the backend" result could just mean the patch was absent.
  it("control: the installed patch stamps the service token on a backend call", async () => {
    const upstream = await installPatchedFetch()
    await fetch(`${BACKEND}/api/systems`)
    expect(tokenCalls(upstream)).toHaveLength(1)
  })

  const cases: Array<[string, string[]]> = [
    ["POST", ["api", "admin", "reconcile-resources"]],
    ["POST", ["api", "safe-remediate", "execute"]],
    ["POST", ["api", "safe-remediate", "rollback"]],
    ["DELETE", ["api", "systems", "alpha"]],
    ["PUT", ["api", "customer-config", "x"]],
    ["PATCH", ["api", "iam-roles", "r"]],
    ["GET", ["api", "k8s", "identities"]],
    ["GET", ["api", "cve-strategy", "plan"]],
    ["GET", ["health"]],
  ]

  for (const mode of [undefined, "CUSTOMER_RESIDENT"] as const) {
    for (const [method, path] of cases) {
      it(`${mode ?? "hosted"}: ${method} /api/backend/${path.join("/")} is refused without contacting the backend`, async () => {
        const upstream = await installPatchedFetch(mode)
        const route = await import("@/app/api/backend/[...path]/route")
        const handler = (route as unknown as Record<string, (r: Request, c: ReturnType<typeof context>) => Promise<Response>>)[method]
        const request = new Request(`http://ui.local/api/backend/${path.join("/")}`, {
          method,
          headers: {
            cookie: "cyntro_site_session=valid-looking",
            "x-amzn-oidc-data": "forged.claim.value",
            "content-type": "application/json",
          },
          body: method === "GET" ? undefined : "{}",
        })

        const response = await handler(request, context(path))

        expect(upstream).not.toHaveBeenCalled()
        expect(tokenCalls(upstream)).toHaveLength(0)
        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.code).toBe("BACKEND_RELAY_DISABLED")
        expect(body.origin).toBe("proxy")
        expect(response.headers.get("cache-control")).toBe("no-store")
      })
    }
  }
})
