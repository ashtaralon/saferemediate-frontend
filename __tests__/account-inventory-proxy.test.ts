/**
 * T11b: the inventory proxy route itself (app/api/proxy/accounts/[accountId]/inventory/route.ts), called directly with
 * a recording fetch. It proves the SERVER forwarding: the exact backend target, the allowlisted query, the identity it
 * relays (the existing accountAdminIdentityHeaders on a resident install, reused unchanged), status relay, no-store,
 * and a closed, sanitized answer for every refusal and failure. The relayed body is a producer golden (backend commit
 * 92b2c54f7ea6fbf09b50ae06cec98f9c268bedd0).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const identity = vi.fn(async () => ({ Authorization: "Bearer alb-access-token", "x-amzn-oidc-data": "alb-signed" }))
let backend = "https://backend.example"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => backend }))
vi.mock("@/lib/server/account-admin-proxy", () => ({ accountAdminIdentityHeaders: identity }))

function golden(name: string): { status: number; body: unknown } {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-inventory", `${name}.json`), "utf8"))
}

const ACCOUNT = "111122223333"

async function call(path: string, init: { headers?: Record<string, string> } = {}, account = ACCOUNT) {
  const { GET } = await import("@/app/api/proxy/accounts/[accountId]/inventory/route")
  return GET(new NextRequest(`https://console.example${path}`, { headers: init.headers }), {
    params: Promise.resolve({ accountId: account }),
  })
}

type FetchImpl = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>

function backendAnswers(response: Response | (() => Promise<Response>)) {
  const impl: FetchImpl = typeof response === "function" ? response : async () => response
  const fetchMock = vi.fn<FetchImpl>(impl)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("the account inventory proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backend = "https://backend.example"
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("forwards exactly the account and the allowlisted query, with the resident identity, and relays no-store", async () => {
    const page = golden("populated_page1")
    const fetchMock = backendAnswers(new Response(JSON.stringify(page.body), { status: 200 }))
    const response = await call(`/api/proxy/accounts/${ACCOUNT}/inventory?resource_type=s3%3Abucket&limit=20&cursor=abc`)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual(page.body)
    const [target, init] = fetchMock.mock.calls[0]
    expect(String(target)).toBe(
      `https://backend.example/api/accounts/${ACCOUNT}/inventory?resource_type=s3%3Abucket&limit=20&cursor=abc`)
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "manual" })
    expect(init?.headers).toEqual({ Accept: "application/json", Authorization: "Bearer alb-access-token",
                                   "x-amzn-oidc-data": "alb-signed" })
    expect(identity).toHaveBeenCalledTimes(1)
  })

  it("outside a resident install forwards the browser's own Authorization and does not call the resident relay", async () => {
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "")
    const fetchMock = backendAnswers(new Response(JSON.stringify(golden("not_published").body), { status: 200 }))
    await call(`/api/proxy/accounts/${ACCOUNT}/inventory`, { headers: { authorization: "Bearer browser-token" } })
    const init = fetchMock.mock.calls[0][1]
    expect(init?.headers).toEqual({ Accept: "application/json", Authorization: "Bearer browser-token" })
    expect(identity).not.toHaveBeenCalled()
  })

  it("relays the backend's own refusal and unavailable answers with their status, no-store", async () => {
    for (const name of ["refused_not_authorized_403", "refused_cursor_restart_publication_moved",
                        "unavailable_registry_unreadable"]) {
      const g = golden(name)
      backendAnswers(new Response(JSON.stringify(g.body), { status: g.status }))
      const response = await call(`/api/proxy/accounts/${ACCOUNT}/inventory`)
      expect(response.status).toBe(g.status)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toEqual(g.body)
    }
  })

  it.each([
    ["a short account", "/api/proxy/accounts/12345/inventory", "12345", 400, "PROXY_ACCOUNT_ID_INVALID"],
    ["a non-digit account", "/api/proxy/accounts/1111x2223333/inventory", "1111x2223333", 400, "PROXY_ACCOUNT_ID_INVALID"],
    ["an unknown query key", `/api/proxy/accounts/${ACCOUNT}/inventory?account_id=999988887777`, ACCOUNT, 400,
     "PROXY_QUERY_INVALID"],
    ["a duplicate query key", `/api/proxy/accounts/${ACCOUNT}/inventory?cursor=a&cursor=b`, ACCOUNT, 400,
     "PROXY_QUERY_INVALID"],
  ])("refuses %s without calling the backend", async (_why, path, account, status, code) => {
    const fetchMock = backendAnswers(new Response("{}", { status: 200 }))
    const response = await call(path, {}, account)
    expect([response.status, response.headers.get("cache-control"), await response.json()]).toEqual(
      [status, "no-store", { error: code }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ["an unsupported protocol", "ftp://backend.example"],
    ["credentials in the backend URL", "https://user:secret@backend.example"],
    ["an unusable backend URL", "not a url"],
  ])("refuses %s as unconfigured, never echoing it", async (_why, configured) => {
    backend = configured
    const fetchMock = backendAnswers(new Response("{}", { status: 200 }))
    const response = await call(`/api/proxy/accounts/${ACCOUNT}/inventory`)
    const text = await response.text()
    expect([response.status, JSON.parse(text)]).toEqual([503, { error: "PROXY_BACKEND_UNCONFIGURED" }])
    expect(text).not.toContain("secret")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("never follows a redirect with the person's credentials", async () => {
    backendAnswers(new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }))
    const response = await call(`/api/proxy/accounts/${ACCOUNT}/inventory`)
    expect([response.status, await response.json()]).toEqual([502, { error: "PROXY_BACKEND_REDIRECT" }])
  })

  it("a network failure or a non-JSON answer is a sanitized 502, never the upstream message", async () => {
    backendAnswers(async () => { throw new Error("connect ECONNREFUSED 10.0.0.7:8000 secret-host") })
    const failed = await call(`/api/proxy/accounts/${ACCOUNT}/inventory`)
    const text = await failed.text()
    expect([failed.status, JSON.parse(text), failed.headers.get("cache-control")]).toEqual(
      [502, { error: "PROXY_BACKEND_UNREACHABLE" }, "no-store"])
    expect(text).not.toContain("secret-host")
    backendAnswers(new Response("<html>gateway</html>", { status: 502 }))
    const html = await call(`/api/proxy/accounts/${ACCOUNT}/inventory`)
    expect([html.status, await html.json()]).toEqual([502, { error: "PROXY_RESPONSE_NOT_JSON" }])
  })
})
