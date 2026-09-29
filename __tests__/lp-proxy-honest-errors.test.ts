// @vitest-environment node
/**
 * LP proxies never answer a failure with analysis values or an empty success.
 *
 * Each of these routes used to turn a backend error, a timeout, or an unreachable backend into a
 * fabricated reading: zeroed counts (SG / S3 gap analysis, the system LP summary, IAM gaps), or an
 * empty list with status 200 (LP roles, shared roles / SGs, SGs by system, a role's permissions).
 * On screen that reads as "no findings". A failure is now the house error shape
 * (lib/server/proxy-error, as the LP issues and metrics proxies answer it): non-2xx, a string
 * `error`, allowlisted typed detail only, and none of the route's value keys.
 *
 * Real HTTP backend on 127.0.0.1; nothing stubbed but the length of the proxy's own abort timer.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

type Handler = (req: IncomingMessage, res: ServerResponse) => void
let handler: Handler = (_req, res) => res.end()
let server: Server
let base = ""
const hung: ServerResponse[] = []

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  for (const res of hung.splice(0)) res.destroy()
  delete process.env.BACKEND_URL_OVERRIDE
  vi.restoreAllMocks()
})

function answer(status: number, body: string, type = "application/json"): Handler {
  return (_req, res) => {
    res.writeHead(status, { "Content-Type": type })
    res.end(body)
  }
}

/** Accept the request and never answer: only the proxy's own abort can end it. */
const hang: Handler = (_req, res) => {
  hung.push(res)
}

type Route = {
  name: string
  module: string
  url: string
  params?: Record<string, string>
  /** Every value key the route used to fabricate. None may appear in an error body. */
  valueKeys: string[]
  /** Routes with their own AbortController timer. */
  aborts: boolean
}

const ROUTES: Route[] = [
  {
    name: "security-groups/[sgId]/gap-analysis",
    module: "@/app/api/proxy/security-groups/[sgId]/gap-analysis/route",
    url: "http://localhost/api/proxy/security-groups/sg-0abc/gap-analysis?days=365",
    params: { sgId: "sg-0abc" },
    valueKeys: ["sg_id", "sg_name", "rules_analysis", "used_rules", "unused_rules", "total_rules", "eni_count", "timeout"],
    aborts: true,
  },
  {
    name: "s3-buckets/[bucketName]/gap-analysis",
    module: "@/app/api/proxy/s3-buckets/[bucketName]/gap-analysis/route",
    url: "http://localhost/api/proxy/s3-buckets/test-bucket/gap-analysis",
    params: { bucketName: "test-bucket" },
    valueKeys: [
      "bucket_name",
      "allowed_actions",
      "used_actions",
      "unused_actions",
      "allowed_count",
      "used_count",
      "unused_count",
      "not_found",
    ],
    aborts: false,
  },
  {
    name: "system-least-privilege/[systemName]/summary",
    module: "@/app/api/proxy/system-least-privilege/[systemName]/summary/route",
    url: "http://localhost/api/proxy/system-least-privilege/test-system/summary",
    params: { systemName: "test-system" },
    valueKeys: ["total_roles", "avg_lp_score", "total_unused_permissions", "timeout"],
    aborts: true,
  },
  {
    name: "iam-analysis/gaps/[systemName]",
    module: "@/app/api/proxy/iam-analysis/gaps/[systemName]/route",
    url: "http://localhost/api/proxy/iam-analysis/gaps/test-system",
    params: { systemName: "test-system" },
    valueKeys: ["gaps", "total_roles", "overall_usage_percent"],
    aborts: false,
  },
  {
    name: "least-privilege",
    module: "@/app/api/proxy/least-privilege/route",
    url: "http://localhost/api/proxy/least-privilege?systemName=test-system",
    valueKeys: ["roles", "total", "timeout"],
    aborts: true,
  },
  {
    name: "least-privilege/roles",
    module: "@/app/api/proxy/least-privilege/roles/route",
    url: "http://localhost/api/proxy/least-privilege/roles?systemName=test-system",
    valueKeys: ["roles"],
    aborts: true,
  },
  {
    name: "iam/shared-roles",
    module: "@/app/api/proxy/iam/shared-roles/route",
    url: "http://localhost/api/proxy/iam/shared-roles?system_name=test-system",
    valueKeys: ["shared_roles", "count", "filters", "as_of", "timeout"],
    aborts: true,
  },
  {
    name: "sg/shared-sgs",
    module: "@/app/api/proxy/sg/shared-sgs/route",
    url: "http://localhost/api/proxy/sg/shared-sgs?system_name=test-system",
    valueKeys: ["shared_sgs", "sg0_pending_items", "evidence_completeness", "discovered_at", "timeout"],
    aborts: true,
  },
  {
    name: "security-groups/by-system",
    module: "@/app/api/proxy/security-groups/by-system/route",
    url: "http://localhost/api/proxy/security-groups/by-system?system_name=test-system",
    valueKeys: ["security_groups"],
    aborts: true,
  },
  {
    name: "iam-roles/[roleName]/permissions",
    module: "@/app/api/proxy/iam-roles/[roleName]/permissions/route",
    url: "http://localhost/api/proxy/iam-roles/test-role/permissions",
    params: { roleName: "test-role" },
    valueKeys: ["permissions", "policies", "role_arn"],
    aborts: true,
  },
]

async function call(route: Route, target = base) {
  process.env.BACKEND_URL_OVERRIDE = target
  vi.resetModules()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
  const mod = (await import(/* @vite-ignore */ route.module)) as {
    GET: (req: NextRequest, ctx?: unknown) => Promise<Response>
  }
  const req = new NextRequest(route.url)
  const res = route.params
    ? await mod.GET(req, { params: Promise.resolve(route.params) })
    : await mod.GET(req)
  return {
    status: res.status,
    origin: res.headers.get("X-Cyntro-Error-Origin"),
    cache: res.headers.get("Cache-Control"),
    body: (await res.json()) as Record<string, unknown>,
  }
}

function expectNoValues(route: Route, body: Record<string, unknown>) {
  const present = route.valueKeys.filter((key) => key in body)
  expect(present).toEqual([])
  expect(typeof body.error).toBe("string")
}

/** Shrink only the proxy's own 25-30s abort timer, so a hung backend reaches it in this test. */
function fastProxyAbort() {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) =>
    realSetTimeout(fn, ms !== undefined && ms >= 20_000 && ms <= 60_000 ? 30 : ms, ...rest)) as typeof setTimeout)
}

async function deadBackend() {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve))
  const dead = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return dead
}

describe.each(ROUTES)("$name — a failure carries no values", (route) => {
  it("a backend 500 is a 502 error, no values", async () => {
    handler = answer(500, '{"detail":"Internal error: boom"}')
    const out = await call(route)
    expect(out.status).toBe(502)
    expect(out.origin).toBe("backend")
    expect(out.body.backendStatus).toBe(500)
    expect(out.cache).toContain("no-store")
    expectNoValues(route, out.body)
  })

  it("a backend 404 stays a 404 error, never an empty 200", async () => {
    handler = answer(404, '{"detail":"not found in graph"}')
    const out = await call(route)
    expect(out.status).toBe(404)
    expect(out.body.detail).toEqual({ message: "not found in graph" })
    expectNoValues(route, out.body)
  })

  it("a typed 503 refusal keeps its status and code, no values", async () => {
    handler = answer(503, '{"detail":{"code":"SERVING_READ_REFUSED","message":"serving tier refused the read"}}')
    const out = await call(route)
    expect(out.status).toBe(503)
    expect(out.body.detail).toEqual({ code: "SERVING_READ_REFUSED", message: "serving tier refused the read" })
    expectNoValues(route, out.body)
  })

  it("a non-JSON upstream page forwards nothing from it", async () => {
    handler = answer(502, "<html>bad gateway</html>", "text/html")
    const out = await call(route)
    expect(out.status).toBe(502)
    expect(out.body.detail).toBeUndefined()
    expect(JSON.stringify(out.body)).not.toContain("<html>")
    expectNoValues(route, out.body)
  })

  it("an unreachable backend is a 503 proxy error, no values", async () => {
    const out = await call(route, await deadBackend())
    expect(out.status).toBe(503)
    expect(out.origin).toBe("proxy")
    expectNoValues(route, out.body)
  })

  it.runIf(route.aborts)("the proxy's own timeout is a 504 proxy error, no values", async () => {
    handler = hang
    fastProxyAbort()
    const out = await call(route)
    expect(out.status).toBe(504)
    expect(out.origin).toBe("proxy")
    expectNoValues(route, out.body)
  })
})

describe("controls: real value paths are unchanged", () => {
  const byName = (name: string) => ROUTES.find((r) => r.name === name)!

  it.each([
    ["s3-buckets/[bucketName]/gap-analysis", { bucket_name: "test-bucket", allowed_count: 7, used_count: 2 }],
    ["system-least-privilege/[systemName]/summary", { total_roles: 4, avg_lp_score: 61, total_unused_permissions: 90 }],
    ["iam-analysis/gaps/[systemName]", { gaps: [{ role_name: "r1" }], total_roles: 1, overall_usage_percent: 40 }],
    ["least-privilege", { roles: [{ roleName: "r1" }], total: 1 }],
    ["iam/shared-roles", { shared_roles: [{ role_name: "r1" }], count: 1 }],
    ["sg/shared-sgs", { shared_sgs: [{ sg_id: "sg-1" }] }],
    ["security-groups/by-system", { security_groups: [{ id: "sg-1", name: "web" }] }],
  ])("%s passes a success through as sent", async (name, sent) => {
    handler = answer(200, JSON.stringify(sent))
    const out = await call(byName(name))
    expect(out.status).toBe(200)
    expect(out.body).toEqual(sent)
  })

  it("an empty success is still passed through as an empty success", async () => {
    handler = answer(200, JSON.stringify({ shared_roles: [], count: 0 }))
    const out = await call(byName("iam/shared-roles"))
    expect(out.status).toBe(200)
    expect(out.body).toEqual({ shared_roles: [], count: 0 })
  })

  it("SG gap analysis still transforms the inspector response", async () => {
    handler = answer(
      200,
      JSON.stringify({
        sg_id: "sg-0abc",
        sg_name: "web",
        configured_rules: [{ source_cidr: "10.0.0.0/8", port_display: "443", protocol: "tcp", status: "used", flow_count: 12 }],
        summary: { used_rules: 1, unused_rules: 0, total_rules: 1 },
      }),
    )
    const out = await call(byName("security-groups/[sgId]/gap-analysis"))
    expect(out.status).toBe(200)
    expect(out.body).toEqual({
      sg_id: "sg-0abc",
      sg_name: "web",
      rules_analysis: [
        { source: "10.0.0.0/8", port_range: "443", protocol: "TCP", status: "USED", hits: 12, is_public: false, description: "" },
      ],
      used_rules: 1,
      unused_rules: 0,
      total_rules: 1,
      eni_count: 1,
    })
  })

  it("LP roles still transforms the backend list", async () => {
    handler = answer(200, JSON.stringify([{ roleArn: "arn:aws:iam::000000000000:role/r1", roleName: "r1", permissionsCount: 10, unusedPermissionsCount: 4 }]))
    const out = await call(byName("least-privilege/roles"))
    expect(out.status).toBe(200)
    const roles = out.body.roles as Array<Record<string, unknown>>
    expect(roles).toHaveLength(1)
    expect(roles[0]).toMatchObject({ name: "r1", allowedCount: 10, unusedCount: 4, usedCount: 6, score: 60 })
  })

  it("role permissions still collects the policy and top-level actions", async () => {
    handler = answer(
      200,
      JSON.stringify({
        role_arn: "arn:aws:iam::000000000000:role/test-role",
        policy_analysis: [{ policy_name: "p1", all_permissions: ["s3:GetObject"] }],
        allowed_actions_list: ["s3:PutObject"],
      }),
    )
    const out = await call(byName("iam-roles/[roleName]/permissions"))
    expect(out.status).toBe(200)
    expect(out.body.role_arn).toBe("arn:aws:iam::000000000000:role/test-role")
    expect(out.body.permissions).toEqual(["s3:GetObject", "s3:PutObject"])
  })
})
