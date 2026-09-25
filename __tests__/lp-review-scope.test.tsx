import { render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ROLE_ACCOUNT_UNKNOWN, reviewClaimsQuery, reviewScopeFor } from "@/lib/lp-review-scope"

const scopeState = vi.hoisted(() => ({ customerId: null as string | null, mounted: true }))

vi.mock("@/lib/account-scope-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account-scope-context")>()
  return {
    ...actual,
    useOptionalAccountScope: () => (scopeState.mounted ? { customerId: scopeState.customerId } : null),
  }
})

import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"

const ACCOUNT_A = "111111111111"
const ACCOUNT_B = "222222222222"

function params(query: string): URLSearchParams {
  expect(query.startsWith("&")).toBe(true)
  return new URLSearchParams(query.slice(1))
}

describe("reviewScopeFor (LP tab row)", () => {
  it("sends the selected customer and the row's own account_id", () => {
    const scope = reviewScopeFor({ account_id: ACCOUNT_A }, " cust-a ", "web-role")
    expect(scope.ok).toBe(true)
    if (!scope.ok) return
    const sent = params(scope.query)
    expect(sent.get("customer_id")).toBe("cust-a")
    expect(sent.get("account_id")).toBe(ACCOUNT_A)
    expect(scope.cacheKey).toBe(`cust-a|${ACCOUNT_A}|web-role`)
  })

  it("takes the account from the row's ARN when no account field is present", () => {
    const scope = reviewScopeFor({ resourceArn: `arn:aws:iam::${ACCOUNT_B}:role/web-role` }, "cust-a", "web-role")
    expect(scope.ok && params(scope.query).get("account_id")).toBe(ACCOUNT_B)
  })

  it("never substitutes an account for a row that carries none; refuses typed instead", () => {
    for (const row of [null, {}, { account_id: "all" }, { arn: "web-role" }]) {
      const scope = reviewScopeFor(row as Record<string, unknown> | null, "cust-a", "web-role")
      expect(scope.ok).toBe(false)
      if (!scope.ok) expect(scope.code).toBe(ROLE_ACCOUNT_UNKNOWN)
    }
  })

  it("omits customer_id when none is selected, but still binds the account", () => {
    const scope = reviewScopeFor({ account_id: ACCOUNT_A }, "  ", "web-role")
    expect(scope.ok).toBe(true)
    if (!scope.ok) return
    expect(params(scope.query).has("customer_id")).toBe(false)
    expect(params(scope.query).get("account_id")).toBe(ACCOUNT_A)
  })

  it("keys the Review cache so two tenants or accounts sharing a role name never share an entry", () => {
    const keys = new Set(
      [
        reviewScopeFor({ account_id: ACCOUNT_A }, "cust-a", "shared-role"),
        reviewScopeFor({ account_id: ACCOUNT_A }, "cust-b", "shared-role"),
        reviewScopeFor({ account_id: ACCOUNT_B }, "cust-a", "shared-role"),
      ].map((scope) => (scope.ok ? scope.cacheKey : "refused")),
    )
    expect(keys.size).toBe(3)
  })
})

describe("reviewClaimsQuery (shared Review modal)", () => {
  it("sends customer and the ARN's account", () => {
    const sent = params(reviewClaimsQuery(`arn:aws:iam::${ACCOUNT_A}:role/web-role`, "cust-b"))
    expect(sent.get("customer_id")).toBe("cust-b")
    expect(sent.get("account_id")).toBe(ACCOUNT_A)
  })

  it("sends only what it can prove: no account without an ARN, nothing without either", () => {
    expect(params(reviewClaimsQuery(null, "cust-b")).has("account_id")).toBe(false)
    expect(reviewClaimsQuery("web-role", null)).toBe("")
    expect(reviewClaimsQuery(undefined, "  ")).toBe("")
  })
})

describe("IAM Permissions modal Review request carries the scope claims", () => {
  afterEach(() => {
    scopeState.customerId = null
    scopeState.mounted = true
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function gapCalls(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams[] {
    return fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/gap-analysis"))
      .map((url) => new URL(url, "http://localhost").searchParams)
  }

  function stubFetch() {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ detail: { code: "REVIEW_SCOPE_MISMATCH" } }),
      json: async () => ({ detail: { code: "REVIEW_SCOPE_MISMATCH" } }),
    }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("sends the selected customer and the role ARN's account", async () => {
    scopeState.customerId = "cust-b"
    const fetchMock = stubFetch()
    render(
      <IAMPermissionAnalysisModal
        isOpen
        onClose={() => {}}
        roleName="shared-role"
        roleArn={`arn:aws:iam::${ACCOUNT_B}:role/shared-role`}
        systemName="payments"
        applyDisabled
      />,
    )
    await waitFor(() => expect(gapCalls(fetchMock).length).toBeGreaterThan(0))
    for (const sent of gapCalls(fetchMock)) {
      expect(sent.get("customer_id")).toBe("cust-b")
      expect(sent.get("account_id")).toBe(ACCOUNT_B)
    }
  })

  it("renders without an account-scope provider and sends no invented claim", async () => {
    scopeState.mounted = false
    const fetchMock = stubFetch()
    render(<IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="web-role" systemName="payments" applyDisabled />)
    await waitFor(() => expect(gapCalls(fetchMock).length).toBeGreaterThan(0))
    for (const sent of gapCalls(fetchMock)) {
      expect(sent.has("customer_id")).toBe(false)
      expect(sent.has("account_id")).toBe(false)
    }
  })
})
