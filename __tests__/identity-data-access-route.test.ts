// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const BACKEND = "https://backend.test.invalid"
vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => BACKEND }))

// Canary database coordinates, set BEFORE the route modules load: if either route still read
// them, a request would reach this host (or the value would appear in a request).
const CANARY = {
  NEO4J_URI: "neo4j+s://canary-graph.invalid",
  NEO4J_USERNAME: "canary-user",
  NEO4J_PASSWORD: "canary-password-VALUE",
  NEXT_PUBLIC_NEO4J_URI: "neo4j+s://canary-graph.invalid",
  NEXT_PUBLIC_NEO4J_PASSWORD: "canary-password-VALUE",
}

type Scripted = (url: string) => Response | Promise<Response>
const calls: string[] = []
const sent: string[] = []
function stubFetch(answer: Scripted) {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    calls.push(url)
    sent.push(JSON.stringify(init ?? {}))
    return answer(url)
  }))
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

async function loadRoutes() {
  vi.resetModules()
  const dataAccess = await import("@/app/api/proxy/identities/data-access/[name]/route")
  const orphans = await import("@/app/api/proxy/orphan-services/[systemName]/route")
  return { dataAccess, orphans }
}
async function getDataAccess(name = "role-x") {
  const { dataAccess } = await loadRoutes()
  const res = await dataAccess.GET(
    new NextRequest(`https://app.example/api/proxy/identities/data-access/${name}`),
    { params: Promise.resolve({ name }) },
  )
  return { res, body: await res.json() }
}

const saved = { ...process.env }
beforeEach(() => {
  calls.length = 0
  sent.length = 0
  Object.assign(process.env, CANARY)
})
afterEach(() => {
  process.env = { ...saved }
  vi.unstubAllGlobals()
})

function assertBackendOnly() {
  expect(calls.length).toBeGreaterThan(0)
  for (const url of calls) {
    expect(url.startsWith(`${BACKEND}/`), url).toBe(true)
    expect(url).not.toMatch(/canary-graph|neo4j|:7474|:7687|\/tx\/commit|neptune/i)
  }
  for (const init of sent) expect(init).not.toContain("canary-password-VALUE")
}

describe("identity data-access route: backend-sourced only", () => {
  it("builds service-level data stores from a populated backend permission analysis", async () => {
    stubFetch(() => json({
      permission_analysis: {
        allowed_actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "dynamodb:Query", "iam:PassRole"],
        used_actions: ["s3:GetObject"],
        observation_days: 90,
        data_sources: ["cloudtrail"],
      },
    }))
    const { res, body } = await getDataAccess()
    expect(res.status).toBe(200)
    expect(calls).toEqual([`${BACKEND}/api/identities/detail/role-x`])
    assertBackendOnly()

    // Schema: every pre-existing key is still present; the new keys are additive.
    for (const key of ["dataStores", "tableAccess", "summary", "servicePermissions"]) expect(body).toHaveProperty(key)
    expect(body.dataStoresStatus).toEqual({ available: true, granularity: "service", source: "backend:/api/identities/detail" })

    const s3 = body.dataStores.find((s: any) => s.type === "S3")
    expect(s3).toMatchObject({
      name: "S3 resources (from permissions)", granularity: "service", resourceName: null,
      allowedOperations: ["READ", "WRITE", "DELETE"], observedOperations: ["READ"],
      unusedOperations: ["WRITE", "DELETE"], accessLevel: "FULL",
    })
    expect(body.dataStores.find((s: any) => s.type === "DynamoDB")).toMatchObject({ observedOperations: [] })
    expect(body.dataStores.some((s: any) => s.type === "IAM")).toBe(false)
    expect(body.summary).toMatchObject({ totalDataStores: 2, totalObservedOps: 1, hasDestructiveAccess: true })
    expect(body.permissionEvidence).toEqual({ observationDays: 90, dataSources: ["cloudtrail"] })
  })

  it("never returns table access as an empty finding: it is explicitly not served", async () => {
    stubFetch(() => json({ permission_analysis: { allowed_actions: ["rds-data:ExecuteStatement"], used_actions: [] } }))
    const { body } = await getDataAccess()
    expect(body.tableAccess).toEqual([])
    expect(body.tableAccessStatus).toEqual({ available: false, reason: "TABLE_ACCESS_NOT_SERVED_BY_BACKEND" })
  })

  it("does not invent evidence the backend did not send", async () => {
    stubFetch(() => json({ permission_analysis: { allowed_actions: [], used_actions: [] } }))
    const { body } = await getDataAccess()
    expect(body.permissionEvidence).toEqual({ observationDays: null, dataSources: null })
    expect(body.dataStoresStatus.available).toBe(true)
    expect(body.dataStores).toEqual([])
  })

  it("reports permissions that were not computed as unavailable, not as no access", async () => {
    stubFetch(() => json({ permission_analysis: {} }))
    const { res, body } = await getDataAccess()
    expect(res.status).toBe(200)
    expect(body.dataStoresStatus).toEqual({ available: false, reason: "PERMISSIONS_NOT_COMPUTED" })
  })

  it.each([
    ["an unknown identity (404)", () => json({ detail: "not found" }, 404), 404, 404],
    ["a failing backend (503)", () => json({ detail: "down" }, 503), 502, 503],
    ["an unreachable backend", () => { throw new TypeError("fetch failed") }, 502, null],
  ])("answers %s explicitly, never as an empty profile", async (_label, answer, status, backendStatus) => {
    stubFetch(answer as Scripted)
    const { res, body } = await getDataAccess()
    expect(res.status).toBe(status)
    expect(body.error).toBe("IDENTITY_DETAIL_UNAVAILABLE")
    expect(body.backendStatus).toBe(backendStatus)
    expect(body.dataStoresStatus).toEqual({ available: false, reason: "IDENTITY_DETAIL_UNAVAILABLE" })
    expect(body.tableAccessStatus.available).toBe(false)
    assertBackendOnly()
  })

  it("treats a backend body that is not JSON as unavailable", async () => {
    stubFetch(() => new Response("<html>gateway</html>", { status: 200 }))
    const { res, body } = await getDataAccess()
    expect(res.status).toBe(500)
    expect(body.dataStoresStatus.available).toBe(false)
  })
})

describe("orphan-services route: backend-sourced only", () => {
  it("contacts only the backend even with database coordinates in the environment", async () => {
    stubFetch(() => json({ resources: [] }))
    const { orphans } = await loadRoutes()
    const res = await orphans.GET(
      new NextRequest("https://app.example/api/proxy/orphan-services/payments"),
      { params: Promise.resolve({ systemName: "payments" }) },
    )
    expect(res.status).toBe(200)
    assertBackendOnly()
  })
})
