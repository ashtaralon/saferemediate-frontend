// @vitest-environment node
// The routes declare runtime = "nodejs": run them on Node's own fetch (undici), not happy-dom's.
/**
 * LOCAL CHAIN TEST (skipped unless a chain backend is named). The frontend half of
 * the Preview-401 audit: the REAL FE proxy routes, over REAL HTTP, against the
 * backend fixture chain (saferemediate-backend
 * tests/e2e_permissions_review/preview_chain.py): the real Review and LP-list
 * routers behind the real ENFORCE service boundary, the Decision runtime, and the
 * production Neptune driver to a loopback fixture graph.
 *
 * Run from the backend checkout:
 *   python3 tests/e2e_permissions_review/run_preview_chain.py --frontend-root <this checkout>
 * which starts the chain, sets LP_PREVIEW_CHAIN_BACKEND_URL / LP_PREVIEW_CHAIN_TOKEN,
 * and runs this file. Nothing here reaches a deployment; the live Preview 401 is
 * not verified by it.
 *
 * The LP list proxy authenticates through the process-wide writer that
 * instrumentation.ts installs (installCustomerBackendAuthFetch), so each case
 * installs it exactly as the server does at boot, with that case's token.
 */
import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { GET as reviewGET } from "@/app/api/proxy/iam-roles/[roleName]/gap-analysis/route"
import { GET as issuesGET } from "@/app/api/proxy/least-privilege/issues/route"
import { installCustomerBackendAuthFetch } from "@/lib/server/customer-backend-auth"
import { reviewClaimsQuery } from "@/lib/lp-review-scope"

const BASE = process.env.LP_PREVIEW_CHAIN_BACKEND_URL ?? ""
const TOKEN = process.env.LP_PREVIEW_CHAIN_TOKEN ?? ""
const run = BASE && TOKEN ? describe : describe.skip
const originalFetch = globalThis.fetch

type Answer = { status: number; body: any; origin: string | null }

function useToken(token: string | undefined) {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
  process.env.BACKEND_URL_OVERRIDE = BASE
  if (token === undefined) delete process.env.CYNTRO_SERVICE_TOKEN
  else process.env.CYNTRO_SERVICE_TOKEN = token
  installCustomerBackendAuthFetch()
}

async function read(res: Response): Promise<Answer> {
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { _text: text.slice(0, 300) }
  }
  return { status: res.status, body, origin: res.headers.get("X-Cyntro-Error-Origin") }
}

async function review(role: string, query = ""): Promise<Answer> {
  const req = new NextRequest(`http://localhost/api/proxy/iam-roles/${role}/gap-analysis?days=365${query}`)
  return read(await reviewGET(req, { params: Promise.resolve({ roleName: role }) }))
}

async function issues(): Promise<Answer> {
  const req = new NextRequest("http://localhost/api/proxy/least-privilege/issues?systemName=fixture-shop&force_refresh=true")
  return read(await issuesGET(req))
}

afterEach(() => {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
})

run("LP Preview through the FE proxy against the backend chain (real HTTP)", () => {
  it("a correct server token is served the populated Review", async () => {
    useToken(TOKEN)
    const a = await review("fixture-web-role")
    expect(a.status).toBe(200)
    expect(a.body.role_arn).toBe("arn:aws:iam::111111111111:role/fixture-web-role")
    expect(a.body.summary.unused_count).toBe(8)
  })

  it("no server token refuses locally (503, not a 401) and never calls the backend", async () => {
    useToken(undefined)
    const a = await review("fixture-web-role")
    expect(a.status).toBe(503)
    expect(a.body.code).toBe("DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED")
    expect(a.body.origin).toBe("proxy")
  })

  it("a wrong server token is the backend's 401, marked as the backend's, never a timeout", async () => {
    useToken(`wrong-${TOKEN}`)
    const a = await review("fixture-web-role")
    expect(a.status).toBe(401)
    expect(a.origin).toBe("backend")
    expect(a.body.summary).toBeUndefined()
  })

  it("a role name another registered tenant shares resolves only this tenant's ARN", async () => {
    useToken(TOKEN)
    const a = await review("fixture-shared-name-role")
    expect(a.status).toBe(200)
    expect(a.body.role_arn).toBe("arn:aws:iam::111111111111:role/fixture-shared-name-role")
    expect(JSON.stringify(a.body)).not.toContain("333333333333")
  })

  it("a matching selected customer and the row's own account are served", async () => {
    useToken(TOKEN)
    const a = await review("fixture-shared-name-role", "&customer_id=fixture-webshop&account_id=111111111111")
    expect(a.status).toBe(200)
    expect(a.body.role_arn).toBe("arn:aws:iam::111111111111:role/fixture-shared-name-role")
  })

  it("a mismatched selected account is a 403 scope refusal, never the pinned account's Review", async () => {
    useToken(TOKEN)
    const a = await review("fixture-shared-name-role", "&customer_id=fixture-webshop&account_id=333333333333")
    expect(a.status).toBe(403)
    expect(a.body.detail.code).toBe("REVIEW_SCOPE_MISMATCH")
    expect(a.body.summary).toBeUndefined()
  })

  it("the LP list honours the selected customer/account: matching served, mismatched 403", async () => {
    useToken(TOKEN)
    const ok = await read(await issuesGET(new NextRequest(
      "http://localhost/api/proxy/least-privilege/issues?systemName=fixture-shop&force_refresh=true&customer_id=fixture-webshop&account_id=111111111111")))
    expect(ok.status).toBe(200)
    for (const claim of ["customer_id=fixture-neighbour-co", "account_id=333333333333"]) {
      const refused = await read(await issuesGET(new NextRequest(
        `http://localhost/api/proxy/least-privilege/issues?systemName=fixture-shop&force_refresh=true&${claim}`)))
      expect(refused.status).toBe(403)
      expect(refused.body.detail.code).toBe("REVIEW_SCOPE_MISMATCH")
      expect(refused.body.resources).toBeUndefined()
    }
  })

  it("the other tenant's claim is a 403 scope refusal with its code", async () => {
    useToken(TOKEN)
    const a = await review("fixture-shared-name-role", "&customer_id=fixture-neighbour-co")
    expect(a.status).toBe(403)
    expect(a.body.detail.code).toBe("REVIEW_SCOPE_MISMATCH")
  })

  it("a role with no permissions is served as zero with unknown coverage", async () => {
    useToken(TOKEN)
    const a = await review("fixture-empty-role")
    expect(a.status).toBe(200)
    expect(a.body.summary.total_permissions).toBe(0)
    expect(a.body.summary.data_confidence).not.toBe("OBSERVED")
  })

  it("the LP list is served complete with a correct token, and 401 with a missing or wrong one", async () => {
    useToken(TOKEN)
    const served = await issues()
    expect(served.status).toBe(200)
    expect(served.body.analysis_complete).toBe(true)

    useToken(undefined)
    const missing = await issues()
    expect(missing.status).toBe(401)
    expect(missing.origin).toBe("backend")
    useToken(`wrong-${TOKEN}`)
    const wrong = await issues()
    expect(wrong.status).toBe(401)
    expect(wrong.body.resources).toBeUndefined()
  })

  // The IAM Permissions modal's own assembly: `?days=365${refreshParam}${reviewClaimsQuery(roleArn, customer)}`.
  // The role ARN is client data; it only becomes an account CLAIM, and the backend's binding decides.
  it("the modal's assembled Review URL: own ARN served, foreign ARN refused, absent claims get only this tenant", async () => {
    useToken(TOKEN)
    const own = "arn:aws:iam::111111111111:role/fixture-shared-name-role"
    const foreign = "arn:aws:iam::333333333333:role/fixture-shared-name-role"
    const cases: [string | null, string | null, number][] = [
      [own, "fixture-webshop", 200],
      [foreign, "fixture-webshop", 403],
      [foreign, null, 403],
      [null, "fixture-neighbour-co", 403],
      [null, null, 200],
      ["not-an-arn", null, 200],
    ]
    for (const [arn, customer, status] of cases) {
      for (const refreshParam of ["", "&refresh=true"]) {
        const query = `${refreshParam}${reviewClaimsQuery(arn, customer)}`
        const a = await review("fixture-shared-name-role", query)
        expect(a.status, JSON.stringify({ arn, customer, refreshParam, body: a.body })).toBe(status)
        if (status === 200) expect(a.body.role_arn).toBe(own)
        else {
          expect(a.body.detail.code).toBe("REVIEW_SCOPE_MISMATCH")
          expect(a.body.summary).toBeUndefined()
        }
        expect(JSON.stringify(a.body)).not.toContain("333333333333:role")
      }
    }
  })

  it("server-owned scope unavailable or contradictory: typed backend refusal through both proxies, never a default tenant", async () => {
    useToken(TOKEN)
    const cases: [string, number, string][] = [
      ["drop-tenant-pin", 503, "REVIEW_SCOPE_UNAVAILABLE"],
      ["drop-account-pin", 503, "REVIEW_SCOPE_UNAVAILABLE"],
      ["tenant-pins-disagree", 403, "REVIEW_SCOPE_MISMATCH"],
    ]
    try {
      for (const [change, status, code] of cases) {
        const switched = await originalFetch(`${BASE}/api/__fixture/scope/${change}`, { method: "POST", headers: { "X-Cyntro-Service-Token": TOKEN } })
        expect(switched.status).toBe(200)
        for (const claims of ["", reviewClaimsQuery("arn:aws:iam::111111111111:role/fixture-shared-name-role", "fixture-webshop")]) {
          const a = await review("fixture-shared-name-role", claims)
          expect(a.status, `${change} ${claims}`).toBe(status)
          expect(a.origin).toBe("backend")
          expect(a.body.detail.code).toBe(code)
          expect(a.body.summary).toBeUndefined()
          const list = await read(await issuesGET(new NextRequest(
            `http://localhost/api/proxy/least-privilege/issues?systemName=fixture-shop&force_refresh=true${claims}`)))
          expect(list.status, `${change} list ${claims}`).toBe(status)
          expect(list.body.resources).toBeUndefined()
          expect(JSON.stringify(list.body)).not.toContain("fixture-neighbour-co")
        }
      }
    } finally {
      await originalFetch(`${BASE}/api/__fixture/scope/restore`, { method: "POST", headers: { "X-Cyntro-Service-Token": TOKEN } })
    }
    const restored = await review("fixture-shared-name-role")
    expect(restored.status).toBe(200)
  })

  it("zz: an unavailable graph: the LP list keeps the backend's 503 and its typed code", async () => {
    await originalFetch(`${BASE}/api/__fixture/graph/stop`, { method: "POST", headers: { "X-Cyntro-Service-Token": TOKEN } })
    useToken(TOKEN)
    const a = await issues()
    expect(a.status).toBe(503)
    expect(a.origin).toBe("backend")
    expect(a.body.detail.code).toBe("DECISION_LP_ISSUES_ANALYSIS_INCOMPLETE")
    expect(a.body.detail.failed_analyzers).toContain("iam_role")
    expect(a.body.resources).toBeUndefined()
  })

  it("zz: an unavailable graph: the Review serves no counts", async () => {
    useToken(TOKEN)
    const a = await review("fixture-web-role")
    expect(a.status).toBeGreaterThanOrEqual(500)
    expect(a.body.summary).toBeUndefined()
    expect(a.origin).toBe("backend")
  })
})
