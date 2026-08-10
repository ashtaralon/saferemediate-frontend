import {readFileSync} from "node:fs"
import {describe, expect, it} from "vitest"

describe("customer-resident frontend image", () => {
  it("builds offline and exposes only same-origin browser access", () => {
    const dockerfile = readFileSync("Dockerfile.customer-pilot", "utf8")
    const client = readFileSync("lib/api-client.ts", "utf8")
    const middleware = readFileSync("middleware.ts", "utf8")
    const layout = readFileSync("app/layout.tsx", "utf8")
    const prepare = readFileSync("scripts/prepare-customer-image.mjs", "utf8")

    expect(dockerfile).toContain("node scripts/prepare-customer-image.mjs")
    expect(dockerfile).toContain("npm run build -- --webpack")
    expect(dockerfile).toContain("USER cyntro")
    expect(client).toContain('const BACKEND_URL = "/api/backend"')
    expect(middleware).toContain('CYNTRO_DEPLOYMENT_MODE !== "CUSTOMER_RESIDENT"')
    expect(layout).toContain("Read-only evidence and analysis")
    expect(prepare).toContain("geist-latin.woff2")
    expect(prepare).toContain("saferemediate-backend-f.onrender.com")
  })

  it("keeps the backend service token server-only", () => {
    const auth = readFileSync("lib/server/customer-backend-auth.ts", "utf8")
    const route = readFileSync("app/api/backend/[...path]/route.ts", "utf8")

    expect(auth).toContain('headers.set("X-Cyntro-Service-Token", token)')
    expect(auth).toContain("url.origin !== backendOrigin")
    expect(route).toContain('headers.delete("x-cyntro-service-token")')
    expect(route).toContain('headers.delete("authorization")')
  })
})
