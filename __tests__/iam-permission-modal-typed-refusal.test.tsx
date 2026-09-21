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
      detail: { detail: { code, message } },
    }),
    { status, headers: { "content-type": "application/json" } },
  )
}

function renderModal() {
  return render(
    <IAMPermissionAnalysisModal isOpen roleName={ROLE} onClose={() => {}} />,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Permissions modal renders the refusal, not a bare status", () => {
  it("names a disabled Decision runtime and offers no Retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      proxyRefusal(503, "REVIEW_RUNTIME_UNAVAILABLE"),
    ))

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
    vi.stubGlobal("fetch", vi.fn(async () => proxyRefusal(403, "REVIEW_SCOPE_MISMATCH")))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(REVIEW_REFUSALS.REVIEW_SCOPE_MISMATCH.title)).toBeTruthy(),
    )
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
  })

  it("names a role outside scope and offers no Retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => proxyRefusal(404, "ROLE_NOT_FOUND_IN_SCOPE")))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(REVIEW_REFUSALS.ROLE_NOT_FOUND_IN_SCOPE.title)).toBeTruthy(),
    )
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
  })

  it("DOES offer Retry for a transient tenant-not-serving refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => proxyRefusal(503, "REVIEW_TENANT_NOT_SERVING")))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(REVIEW_REFUSALS.REVIEW_TENANT_NOT_SERVING.title)).toBeTruthy(),
    )
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
  })

  it("falls back to the generic failure for an unrecognised code, keeping Retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => proxyRefusal(500, "SOMETHING_NEW_WE_DO_NOT_KNOW")))
    renderModal()
    await waitFor(() => expect(screen.getByText("Failed to Load Data")).toBeTruthy())
    // Nothing invented: an unknown refusal is not dressed up as understood.
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
    expect(screen.getByTestId("review-refusal-code").textContent).toContain(
      "SOMETHING_NEW_WE_DO_NOT_KNOW",
    )
  })

  it("keeps the generic failure and Retry on a proxy network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
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
      { backendStatus: 503, detail: { detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } } },
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
