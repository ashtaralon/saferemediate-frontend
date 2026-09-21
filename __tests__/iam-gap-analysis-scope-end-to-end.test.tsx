/**
 * The operator's selected tenant/account/region must reach the backend.
 *
 * The route-level tests inject scope straight into a mocked NextRequest, which
 * proves the ROUTE forwards what it is given and nothing about whether the UI
 * ever gives it anything. It did not: the modal requested
 * `gap-analysis?days=365` and dropped the selection on the floor, so the
 * backend was asked to resolve the role without being told which account --
 * and a role id is not unique across accounts.
 *
 * So this file composes the two halves. The URL asserted against the backend
 * is the one the REAL modal produced, not one written here: it is captured
 * from the component's own fetch and handed to the REAL route.
 */
import { render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://customer-backend.example",
}))

/**
 * The operator's selection. Mocking the scope SOURCE is mocking the input --
 * the thing under test is whether the selection survives the trip. Every field
 * the provider guarantees is supplied, because a partial scope makes
 * `withAccountScope` emit `account_group=undefined`, and a test that skipped a
 * field would hide that.
 */
// vi.hoisted, not a bare const: vitest hoists vi.mock above every import, so a
// factory closing over a plain top-level const can read it before it exists.
const SELECTED = vi.hoisted(() => ({
  customerId: "cust-testbed",
  groupId: "prod",
  accountId: "416651950952",
  region: "eu-west-1",
}))
vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => SELECTED,
}))

import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { GET } from "@/app/api/proxy/iam-roles/[roleName]/gap-analysis/route"

/** The exact role from the reproduced Permissions-tab defect. */
const ROLE = "cyntro-tb-prod-web-role"
/** Testbed Webshop, the system this role belongs to. */
const SYSTEM = "tb-prod-webshop"

const OIDC_HEADERS = {
  "x-amzn-oidc-identity": "operator-1",
  "x-amzn-oidc-data": "signed-alb-claims",
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})

/** Mount the real modal and return the gap-analysis URL it actually requested. */
async function urlTheModalRequested(): Promise<string> {
  const seen: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      seen.push(url)
      if (url.includes("/approval-requests")) {
        return new Response(JSON.stringify({ requests: [] }), {
          status: 200, headers: { "content-type": "application/json" },
        })
      }
      return new Response(JSON.stringify({}), {
        status: 200, headers: { "content-type": "application/json" },
      })
    }),
  )

  render(
    <IAMPermissionAnalysisModal
      isOpen
      roleName={ROLE}
      systemName={SYSTEM}
      onClose={() => {}}
      onApplyFix={() => {}}
    />,
  )

  await waitFor(() => expect(seen.some(u => u.includes("/gap-analysis"))).toBe(true))
  return seen.find(u => u.includes("/gap-analysis"))!
}

describe("IAM Review scope travels from the operator's selection to the backend", () => {
  it("the modal's own request carries customer, account and region", async () => {
    const requested = await urlTheModalRequested()
    const params = new URL(requested, "https://app.example").searchParams

    expect(params.get("customer_id")).toBe(SELECTED.customerId)
    expect(params.get("account_id")).toBe(SELECTED.accountId)
    expect(params.get("region")).toBe(SELECTED.region)
    expect(params.get("days")).toBe("365")
    // The role is still encoded once, by the component, before scope was added.
    expect(requested).toContain(`/iam-roles/${encodeURIComponent(ROLE)}/gap-analysis`)
    // No placeholder ever stands in for a value the operator did not pick.
    expect(requested).not.toContain("undefined")
    expect(requested).not.toContain("null")
  })

  it("that exact URL, driven through the real route, reaches the backend with the same scope", async () => {
    const requested = await urlTheModalRequested()

    // Second leg: the captured URL is what the route now receives. Nothing is
    // re-typed here -- a value that never left the modal cannot appear.
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const backendUrls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        backendUrls.push(String(input))
        return new Response(JSON.stringify({ role_name: ROLE }), {
          status: 200, headers: { "content-type": "application/json" },
        })
      }),
    )

    const roleFromPath = decodeURIComponent(
      new URL(requested, "https://app.example").pathname.split("/iam-roles/")[1].split("/")[0],
    )
    expect(roleFromPath).toBe(ROLE)

    const res = await GET(
      new NextRequest(`https://app.example${requested}`, { headers: OIDC_HEADERS }),
      { params: Promise.resolve({ roleName: roleFromPath }) },
    )

    expect(res.status).toBe(200)
    // The modal mounted in the first leg may still have effects in flight, and
    // they share this spy. Select the backend call by origin rather than
    // asserting a call count that another component's fetch can change.
    const toBackend = backendUrls.filter(u => u.startsWith("https://customer-backend.example"))
    expect(toBackend).toHaveLength(1)
    const sent = new URL(toBackend[0])
    expect(sent.origin).toBe("https://customer-backend.example")
    expect(sent.pathname).toBe(`/api/iam-roles/${encodeURIComponent(ROLE)}/gap-analysis`)
    expect(sent.searchParams.get("customer_id")).toBe(SELECTED.customerId)
    expect(sent.searchParams.get("account_id")).toBe(SELECTED.accountId)
    expect(sent.searchParams.get("region")).toBe(SELECTED.region)
    expect(sent.searchParams.get("days")).toBe("365")
    expect(toBackend[0]).not.toContain("undefined")
  })

  it("an unnarrowed selection sends no account or region rather than a placeholder", async () => {
    // "all" is the provider's word for "not narrowed". It must not travel: the
    // backend would have to interpret it, and interpreting it as a wildcard is
    // how one tenant's answer reaches another's screen.
    const seen: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        seen.push(String(input))
        return new Response(JSON.stringify({}), {
          status: 200, headers: { "content-type": "application/json" },
        })
      }),
    )
    SELECTED.groupId = "all"
    SELECTED.accountId = "all"
    SELECTED.region = "all"
    try {
      render(
        <IAMPermissionAnalysisModal
          isOpen roleName={ROLE} systemName={SYSTEM}
          onClose={() => {}} onApplyFix={() => {}}
        />,
      )
      await waitFor(() => expect(seen.some(u => u.includes("/gap-analysis"))).toBe(true))
      const params = new URL(seen.find(u => u.includes("/gap-analysis"))!, "https://app.example").searchParams
      expect(params.get("customer_id")).toBe("cust-testbed")
      expect(params.has("account_id")).toBe(false)
      expect(params.has("region")).toBe(false)
      expect(params.has("account_group")).toBe(false)
    } finally {
      SELECTED.groupId = "prod"
      SELECTED.accountId = "416651950952"
      SELECTED.region = "eu-west-1"
    }
  })
})
