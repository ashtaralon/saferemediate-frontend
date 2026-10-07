/**
 * A7 S1c: the census proxy route (app/api/proxy/accounts/[accountId]/census/route.ts) on the shared per-account read rules
 * (lib/server/account-read-proxy.ts), called directly with a recording fetch: the exact backend target, the route's own
 * query keys only, the relayed identity, status relay, no-store, and a closed answer for every refusal and failure. The
 * relayed body is a REAL census route answer (backend 7de67d81afd0c9c85e190af78e182043252bb7b4,
 * tests/cyntro_data/test_account_census_captures.py).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const identity = vi.fn(async () => ({ Authorization: "Bearer alb-access-token", "x-amzn-oidc-data": "alb-signed" }))
let backend = "https://backend.example"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => backend }))
vi.mock("@/lib/server/account-admin-proxy", () => ({ accountAdminIdentityHeaders: identity }))

function capture(name: string): { status: number; body: unknown } {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-census-captures", `${name}.json`), "utf8"))
}

const ACCOUNT = "111122223333"

async function call(path: string, init: { headers?: Record<string, string> } = {}, account: unknown = ACCOUNT) {
  const { GET } = await import("@/app/api/proxy/accounts/[accountId]/census/route")
  return GET(new NextRequest(`https://console.example${path}`, { headers: init.headers }), {
    params: Promise.resolve({ accountId: account as string }),
  })
}

type FetchImpl = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>

function backendAnswers(response: Response | (() => Promise<Response>)) {
  const impl: FetchImpl = typeof response === "function" ? response : async () => response
  const fetchMock = vi.fn<FetchImpl>(impl)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("the account census proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backend = "https://backend.example"
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("forwards exactly the account and the route's query keys, with the resident identity, and relays no-store", async () => {
    const page = capture("depth_listed_only_page1")
    const fetchMock = backendAnswers(new Response(JSON.stringify(page.body), { status: 200 }))
    const response = await call(`/api/proxy/accounts/${ACCOUNT}/census?depth=listed_only&limit=200&cursor=abc%3D`
      + "&service=dynamodb&source=tagging&region=eu-west-1&resource_type=dynamodb%3Atable")
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual(page.body)
    const [target, init] = fetchMock.mock.calls[0]
    const url = new URL(String(target))
    expect(url.origin + url.pathname).toBe(`https://backend.example/api/accounts/${ACCOUNT}/census`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ depth: "listed_only", limit: "200", cursor: "abc=",
      service: "dynamodb", source: "tagging", region: "eu-west-1", resource_type: "dynamodb:table" })
    expect(init?.redirect).toBe("manual")
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer alb-access-token")
  })

  it("keeps a configured path prefix and relays a refusal's status and body", async () => {
    backend = "https://backend.example/prefix/"
    const refused = capture("refused_not_authorized_403")
    const fetchMock = backendAnswers(new Response(JSON.stringify(refused.body), { status: 403 }))
    const response = await call(`/api/proxy/accounts/${ACCOUNT}/census?depth=listed_only`)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://backend.example/prefix/api/accounts/${ACCOUNT}/census?depth=listed_only`)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(refused.body)
  })

  it.each([
    ["an account id that is not 12 digits", "/census", "11112222333", 400, "PROXY_ACCOUNT_ID_INVALID"],
    ["a query key the route does not take", "/census?customer_id=acme", ACCOUNT, 400, "PROXY_QUERY_INVALID"],
    ["a key given twice", "/census?depth=listed_only&depth=collected", ACCOUNT, 400, "PROXY_QUERY_INVALID"],
  ])("refuses %s before any backend call", async (_why, suffix, account, status, code) => {
    const fetchMock = backendAnswers(new Response("{}", { status: 200 }))
    const response = await call(`/api/proxy/accounts/${account}${suffix}`, {}, account)
    expect([response.status, await response.json()]).toEqual([status, { error: code }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ["a base with a query", "https://backend.example?x=1", 503, "PROXY_BACKEND_UNCONFIGURED"],
    ["a base with credentials", "https://user:pw@backend.example", 503, "PROXY_BACKEND_UNCONFIGURED"],
  ])("refuses %s", async (_why, base, status, code) => {
    backend = base
    backendAnswers(new Response("{}", { status: 200 }))
    const response = await call(`/api/proxy/accounts/${ACCOUNT}/census`)
    expect([response.status, await response.json()]).toEqual([status, { error: code }])
  })

  it("never follows a redirect, and names an unreachable backend and a non-JSON answer", async () => {
    backendAnswers(new Response(null, { status: 302, headers: { Location: "https://elsewhere.example" } }))
    expect(await (await call(`/api/proxy/accounts/${ACCOUNT}/census`)).json()).toEqual({ error: "PROXY_BACKEND_REDIRECT" })
    backendAnswers(async () => { throw new Error("connect ECONNREFUSED") })
    expect(await (await call(`/api/proxy/accounts/${ACCOUNT}/census`)).json()).toEqual({ error: "PROXY_BACKEND_UNREACHABLE" })
    backendAnswers(new Response("<html>", { status: 200 }))
    expect(await (await call(`/api/proxy/accounts/${ACCOUNT}/census`)).json()).toEqual({ error: "PROXY_RESPONSE_NOT_JSON" })
  })

  it("relays the browser's own Authorization outside a resident install", async () => {
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "HOSTED")
    const fetchMock = backendAnswers(new Response(JSON.stringify(capture("not_published_census_disabled").body), { status: 200 }))
    await call(`/api/proxy/accounts/${ACCOUNT}/census`, { headers: { authorization: "Bearer browser" } })
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer browser")
    expect(identity).not.toHaveBeenCalled()
  })
})
