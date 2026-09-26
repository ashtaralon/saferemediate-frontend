import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/gap-analysis/route"

const TOKEN = "fixture-service-token-0123456789abcdef"
const OTHER = "browser-supplied-token"

function request(query: string) {
  return new NextRequest(`http://localhost/api/proxy/gap-analysis?${query}`, {
    headers: { "x-cyntro-service-token": OTHER },
  })
}

function backend(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response
}

afterEach(() => {
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("system gap-analysis proxy", () => {
  it("refuses locally without a server token and does not call the backend", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const res = await GET(request("systemName=payments"))
    expect(res.status).toBe(503)
    expect((await res.json()).error_code).toBe("DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends only the server token and preserves 401, 403, and 503", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(backend(401, { detail: "service authentication required" }))
      .mockResolvedValueOnce(backend(403, { detail: { code: "REVIEW_SCOPE_MISMATCH" } }))
      .mockResolvedValueOnce(backend(503, { detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } }))
    vi.stubGlobal("fetch", fetchMock)

    const denied = await GET(request("systemName=payments&customer_id=other-shop&refresh=true"))
    const foreign = await GET(request("systemName=payments-b&refresh=true"))
    const unavailable = await GET(request("systemName=payments-c&refresh=true"))

    expect(denied.status).toBe(401)
    expect(foreign.status).toBe(403)
    expect((await foreign.json()).detail.code).toBe("REVIEW_SCOPE_MISMATCH")
    expect(unavailable.status).toBe(503)
    expect((await unavailable.json()).detail.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
    for (const call of fetchMock.mock.calls) {
      const [url, init] = call as unknown as [string, RequestInit]
      expect(url).not.toContain("other-shop")
      expect(url).not.toContain("customer_id")
      const headers = init.headers as Record<string, string>
      expect(headers["X-Cyntro-Service-Token"]).toBe(TOKEN)
      expect(JSON.stringify(headers)).not.toContain(OTHER)
    }
    expect(JSON.stringify(await denied.json())).not.toContain(TOKEN)
  })

  it("keeps populated, measured-empty, and unmeasured counts distinct", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(backend(200, { summary: { used_count: 6, unused_count: 4, allowed_count: 10 } }))
      .mockResolvedValueOnce(backend(200, { summary: { used_count: 0, unused_count: 0, allowed_count: 0 } }))
      .mockResolvedValueOnce(backend(200, { summary: { used_count: null, unused_count: null, allowed_count: null } }))
    vi.stubGlobal("fetch", fetchMock)

    const populated = await (await GET(request("systemName=populated&refresh=true"))).json()
    const empty = await (await GET(request("systemName=empty&refresh=true"))).json()
    const unknown = await (await GET(request("systemName=unknown&refresh=true"))).json()

    expect(populated.used_count).toBe(6)
    expect(populated.unused_count).toBe(4)
    expect(empty.used_count).toBe(0)
    expect(empty.unused_count).toBe(0)
    expect(unknown.used_count).toBeNull()
    expect(unknown.unused_count).toBeNull()
    expect(unknown.allowed_count).toBeNull()
  })

  it("traces Preview to the registered proxies and leaves Apply disabled", () => {
    const tab = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")
    expect(tab).toContain("/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=365")
    expect(tab).toContain("/api/proxy/least-privilege/simulate-fix")
    expect(tab).toContain("const LP_MUTATION_APPLY_DISABLED = true")
    expect(tab).toContain("/api/proxy/least-privilege/apply")
    expect(tab).toContain("plan_head: selectedResource.serverPlan?.planHead")
    expect(tab).not.toContain("coverage: 'UNKNOWN'")
    expect(tab).not.toContain("/api/proxy/cyntro/remediate")
    const card = readFileSync(join(process.cwd(), "components/systems-view.tsx"), "utf8")
    expect(card).toContain("/api/proxy/gap-analysis?systemName=")
  })
})
