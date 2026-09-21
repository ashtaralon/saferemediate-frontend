import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EnvelopeFetchError } from "@/components/trust/use-trust-envelope"
import {
  IAMPermissionAnalysisModal,
  REVIEW_REFUSALS,
} from "@/components/iam-permission-analysis-modal"

/** The exact role from the reproduced Permissions-tab defect. */
const ROLE = "cyntro-tb-prod-web-role"

/** One proxy response, shaped exactly as the route now returns it. */
function proxyRefusal(status: number, code: string, message?: string) {
  return new Response(
    JSON.stringify({
      error: `IAM gap-analysis backend returned ${status}`,
      backendStatus: status,
      origin: "proxy",
      detail: { code, message },
    }),
    { status, headers: { "content-type": "application/json" } },
  )
}

/** Testbed Webshop, the system this role belongs to. */
const SYSTEM = "tb-prod-webshop"

/**
 * The modal refuses to render without `systemName` -- a deliberate fail-loud
 * safety prerequisite ("Safety check unavailable ... Execution is blocked").
 * The first version of these tests omitted it and every case asserted against
 * that alert instead of the refusal state.
 *
 * The gate is satisfied the way production satisfies it (see
 * components/crown-jewel-protection.tsx:739), by passing the real prop. It is
 * not weakened, not bypassed, and the component under test is not mocked.
 */
function renderModal() {
  return render(
    <IAMPermissionAnalysisModal
      isOpen
      roleName={ROLE}
      systemName={SYSTEM}
      onClose={() => {}}
      onApplyFix={() => {}}
    />,
  )
}

/**
 * The modal fetches more than gap-analysis on mount (approval requests, the
 * Terraform ownership probe). Route by URL so those answer honestly instead of
 * rejecting and muddying the state under test; only the gap-analysis call
 * carries the refusal.
 */
function routedFetch(gapResponse: () => Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("/gap-analysis")) return gapResponse()
    if (url.includes("/approval-requests")) {
      return new Response(JSON.stringify({ requests: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      })
    }
    return new Response(JSON.stringify({}), {
      status: 200, headers: { "content-type": "application/json" },
    })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Permissions modal renders the refusal, not a bare status", () => {
  it("names a disabled Decision runtime and offers no Retry", async () => {
    vi.stubGlobal("fetch", routedFetch(() => proxyRefusal(503, "REVIEW_RUNTIME_UNAVAILABLE")))

    renderModal()

    await waitFor(() =>
      expect(
        screen.getByText(REVIEW_REFUSALS.REVIEW_RUNTIME_UNAVAILABLE.title),
      ).toBeTruthy(),
    )
    // The defect: this used to read "Request failed (502)".
    expect(screen.queryByText(/Request failed \(50\d\)/)).toBeNull()
    expect(screen.queryByText(/^Failed to Load Data$/)).toBeNull()
    // Retrying a switched-off capability can never succeed.
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
    // The code stays visible for an operator reporting the problem.
    expect(screen.getByTestId("review-refusal-code").textContent).toContain(
      "REVIEW_RUNTIME_UNAVAILABLE",
    )
  })

  it("names a scope mismatch and offers no Retry", async () => {
    vi.stubGlobal("fetch", routedFetch(() => proxyRefusal(403, "REVIEW_SCOPE_MISMATCH")))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(REVIEW_REFUSALS.REVIEW_SCOPE_MISMATCH.title)).toBeTruthy(),
    )
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
  })

  it("names a role outside scope and offers no Retry", async () => {
    vi.stubGlobal("fetch", routedFetch(() => proxyRefusal(404, "ROLE_NOT_FOUND_IN_SCOPE")))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(REVIEW_REFUSALS.ROLE_NOT_FOUND_IN_SCOPE.title)).toBeTruthy(),
    )
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
  })

  it("DOES offer Retry for a transient tenant-not-serving refusal", async () => {
    vi.stubGlobal("fetch", routedFetch(() => proxyRefusal(503, "REVIEW_TENANT_NOT_SERVING")))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(REVIEW_REFUSALS.REVIEW_TENANT_NOT_SERVING.title)).toBeTruthy(),
    )
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
  })

  it("falls back to the generic failure for an unrecognised code, keeping Retry", async () => {
    vi.stubGlobal("fetch", routedFetch(() => proxyRefusal(500, "SOMETHING_NEW_WE_DO_NOT_KNOW")))
    renderModal()
    await waitFor(() => expect(screen.getByText("Failed to Load Data")).toBeTruthy())
    // Nothing invented: an unknown refusal is not dressed up as understood.
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
    expect(screen.getByTestId("review-refusal-code").textContent).toContain(
      "SOMETHING_NEW_WE_DO_NOT_KNOW",
    )
  })

  it("keeps the generic failure and Retry on a proxy network failure", async () => {
    vi.stubGlobal("fetch", routedFetch(() =>
      new Response(JSON.stringify({ error: "Backend request timed out", origin: "proxy" }), {
        status: 504,
        headers: { "content-type": "application/json" },
      }),
    ))
    renderModal()
    await waitFor(() => expect(screen.getByText("Failed to Load Data")).toBeTruthy())
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
  })
})

describe("EnvelopeFetchError carries what the proxy said", () => {
  it("reads the code and the pre-collapse backend status", () => {
    const err = new EnvelopeFetchError(
      `/api/proxy/iam-roles/${ROLE}/gap-analysis?days=365`,
      new Response(null, { status: 503 }),
      { backendStatus: 503, detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } },
    )
    expect(err.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
    expect(err.backendStatus).toBe(503)
    // The message is byte-identical, so existing catch blocks are unchanged.
    expect(err.message).toBe(
      `Request failed (503) for /api/proxy/iam-roles/${ROLE}/gap-analysis?days=365`,
    )
  })

  it("invents nothing when the body carries no code", () => {
    const err = new EnvelopeFetchError("/x", new Response(null, { status: 502 }), { error: "boom" })
    expect(err.code).toBeNull()
    expect(err.backendStatus).toBeNull()
  })
})
