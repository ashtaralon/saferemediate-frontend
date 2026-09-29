// @vitest-environment node
/**
 * The LP roles proxy never turns a withheld usage count into a score.
 *
 * Backend RoleSummary (api/least_privilege.py) sends `unusedPermissionsCount: null` and `bloatPercentage: null`
 * with their `*_withheld_reason` while the IAM usage generation is unverified. The proxy used to read that as
 * 0 unused: used = allowed and score = 100. Real HTTP backend on 127.0.0.1; nothing stubbed.
 */
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const UNVERIFIED = "IAM_USAGE_GENERATION_UNVERIFIED"
let body: unknown = []
let server: Server
let base = ""

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  delete process.env.BACKEND_URL_OVERRIDE
  vi.restoreAllMocks()
})

async function roles(rows: unknown[]) {
  body = rows
  process.env.BACKEND_URL_OVERRIDE = base
  vi.resetModules()
  vi.spyOn(console, "log").mockImplementation(() => {})
  const { GET } = await import("@/app/api/proxy/least-privilege/roles/route")
  const res = await GET(new NextRequest("http://localhost/api/proxy/least-privilege/roles?system_name=test-system"))
  return (await res.json()).roles as Array<Record<string, unknown>>
}

function roleSummary(unused: number | null) {
  return {
    roleArn: "arn:aws:iam::000000000000:role/test-role",
    roleName: "test-role",
    permissionsCount: 20,
    unusedPermissionsCount: unused,
    bloatPercentage: unused === null ? null : (unused / 20) * 100,
    ...(unused === null
      ? {
          unusedPermissionsCount_withheld_reason: UNVERIFIED,
          bloatPercentage_withheld_reason: UNVERIFIED,
        }
      : {}),
    dataQuality: "medium",
  }
}

describe("LP roles proxy — a withheld count is never a score", () => {
  it("null unused → used, unused and score null, reasons passed through", async () => {
    const [role] = await roles([roleSummary(null)])
    expect(role.score).toBeNull()
    expect(role.usedCount).toBeNull()
    expect(role.unusedCount).toBeNull()
    expect(role.allowedCount).toBe(20)
    expect(role.unusedPermissionsCount_withheld_reason).toBe(UNVERIFIED)
    expect(role.bloatPercentage_withheld_reason).toBe(UNVERIFIED)
  })

  it("control: real counts map exactly as before", async () => {
    const [role] = await roles([roleSummary(5)])
    expect(role).toMatchObject({ usedCount: 15, allowedCount: 20, unusedCount: 5, score: 75 })
    expect("unusedPermissionsCount_withheld_reason" in role).toBe(false)
    const [clean] = await roles([roleSummary(0)])
    expect(clean).toMatchObject({ usedCount: 20, unusedCount: 0, score: 100 })
  })
})
