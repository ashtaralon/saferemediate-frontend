import { readFileSync } from "node:fs"
import path from "node:path"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/proxy/least-privilege/simulate-fix/route"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { EnvelopeRequestError, fetchWithEnvelope } from "@/components/trust/use-trust-envelope"
import { refusalFromPreviewBody, reviewRefusalCopy } from "@/lib/lp-preview-refusal"

const TOKEN = "fixture-service-token-0123456789abcdef"
const OIDC = "eyJhbGciOiJSUzI1NiJ9.e30.sig"

function simulateFixRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/proxy/least-privilege/simulate-fix", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ resource_type: "IAMRole", resource_id: "web-role", system_name: "payments" }),
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

function sentHeaders(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
  const init = (fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1]
  return init.headers as Record<string, string>
}

afterEach(() => {
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("simulate-fix proxy proof matches gap-analysis", () => {
  it("on hosted SaaS ignores browser OIDC so a forged claim cannot starve the service channel", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const fetchMock = vi.fn(async () => backend(200, { problem: { used_count: 2, unused_count: 1 } }))
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(simulateFixRequest({ "x-amzn-oidc-data": OIDC }))

    expect(res.status).toBe(200)
    expect(sentHeaders(fetchMock)["X-Cyntro-Service-Token"]).toBe(TOKEN)
    expect(sentHeaders(fetchMock)["X-Amzn-Oidc-Data"]).toBeUndefined()
  })

  it("on hosted SaaS with browser OIDC but no token refuses locally instead of forwarding the claim", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(simulateFixRequest({ "x-amzn-oidc-data": OIDC }))

    expect(res.status).toBe(503)
    expect((await res.json()).error_code).toBe("DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("on customer-resident forwards ALB OIDC with the service token", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const fetchMock = vi.fn(async () => backend(200, { problem: { used_count: 2, unused_count: 1 } }))
    vi.stubGlobal("fetch", fetchMock)

    await POST(simulateFixRequest({ "x-amzn-oidc-data": OIDC }))

    expect(sentHeaders(fetchMock)["X-Amzn-Oidc-Data"]).toBe(OIDC)
    expect(sentHeaders(fetchMock)["X-Cyntro-Service-Token"]).toBe(TOKEN)
  })
})

describe("Preview refusal copy for the codes the backend returns", () => {
  it("names a missing Decision runtime as a deployment prerequisite", () => {
    const copy = reviewRefusalCopy(refusalFromPreviewBody(503, {
      detail: {
        code: "REVIEW_RUNTIME_UNAVAILABLE",
        upstream_code: "DECISION_RUNTIME_DISABLED",
        message: "Permission detail is not served by this deployment's Decision runtime.",
      },
    }))
    expect(copy.title).toBe("Permission review is not served by this deployment yet")
    expect(copy.body).toContain("deployment prerequisite")
  })

  it("keeps the backend's specific reason for a scope mismatch", () => {
    const copy = reviewRefusalCopy(refusalFromPreviewBody(403, {
      detail: {
        code: "REVIEW_SCOPE_MISMATCH",
        message: "The selected organization or account does not belong to this deployment.",
      },
    }))
    expect(copy.title).toBe("This role is outside the scope this deployment may review")
    expect(copy.body).toBe("The selected organization or account does not belong to this deployment.")
  })

  it("recognises the auth boundary's code-less 401 as an unpaired service token", () => {
    const refusal = refusalFromPreviewBody(401, { detail: "service authentication required" })
    expect(refusal.code).toBe("SERVICE_AUTHENTICATION_REQUIRED")
    expect(reviewRefusalCopy(refusal).title).toBe("The backend did not accept this deployment's service token")
  })

  it("does not call an unconfigured verifier the user's identity", () => {
    const copy = reviewRefusalCopy(refusalFromPreviewBody(503, {
      detail: { code: "ANALYST_RUNTIME_UNAVAILABLE", message: "The request's identity cannot be verified right now." },
    }))
    expect(copy.title).not.toMatch(/your identity/i)
  })
})

describe("fetchWithEnvelope keeps the refusal", () => {
  it("throws the status and parsed body, with the old message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => backend(503, { detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } })))

    const error = await fetchWithEnvelope("/api/proxy/x").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EnvelopeRequestError)
    expect((error as EnvelopeRequestError).status).toBe(503)
    expect((error as EnvelopeRequestError).body).toEqual({ detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } })
    expect((error as Error).message).toBe("Request failed (503) for /api/proxy/x")
  })
})

describe("IAM Permissions modal shows the Preview refusal", () => {
  function modalFetch(routes: { gap: Response; simulate: Response }) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/gap-analysis")) return routes.gap
      if (url.includes("/least-privilege/simulate-fix")) return routes.simulate
      return backend(404, { detail: "not used by this test" })
    })
  }

  it("renders the gap-analysis refusal instead of a URL", async () => {
    vi.stubGlobal("fetch", modalFetch({
      gap: backend(503, {
        detail: {
          code: "REVIEW_RUNTIME_UNAVAILABLE",
          message: "Permission detail is not served by this deployment's Decision runtime.",
        },
      }),
      simulate: backend(503, { detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } }),
    }))

    render(<IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="web-role" systemName="payments" applyDisabled />)

    expect(await screen.findByText("Permission review is not served by this deployment yet")).toBeTruthy()
    expect(screen.queryByText("Failed to Load Data")).toBeNull()
    expect(screen.queryByText(/Request failed \(503\)/)).toBeNull()
  })

  it("renders the simulate-fix refusal instead of a retryable outage", async () => {
    vi.stubGlobal("fetch", modalFetch({
      gap: backend(200, {
        role_name: "web-role",
        summary: { total_permissions: 4, used_count: 3, unused_count: 1, lp_score: null, data_confidence: "OBSERVED" },
        used_permissions: ["s3:GetObject", "s3:PutObject", "sqs:SendMessage"],
        unused_permissions: ["iam:PassRole"],
      }),
      simulate: backend(401, { detail: "service authentication required" }),
    }))

    render(<IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="web-role" systemName="payments" applyDisabled />)

    await waitFor(() =>
      expect(screen.getByText("The backend did not accept this deployment's service token")).toBeTruthy(),
    )
    expect(screen.queryByText("Removal safety is temporarily unavailable")).toBeNull()
  })
})

describe("Permissions modal source contract", () => {
  const modal = readFileSync(path.join(__dirname, "../components/iam-permission-analysis-modal.tsx"), "utf8")

  it("never derives an LP score from counts", () => {
    expect(modal).not.toMatch(/Math\.round\(\(\w+ \/ \w+\) \* 100\) : 0\)/)
    expect(modal).toContain("rawData.summary?.lp_score ?? rawData.lp_score ?? null")
  })

  it("the Least Privilege tab shows an uncomputed LP score as unknown, not 0%", () => {
    const tab = readFileSync(path.join(__dirname, "../components/LeastPrivilegeTab.tsx"), "utf8")
    expect(tab).not.toContain("iamGapData?.summary?.lp_score ?? 0")
    expect(tab).toContain("lpScore === null ? 'Not computed'")
  })

  it("maps a failed Simulate fix through the refusal copy, never an Error built from the body", () => {
    expect(modal).not.toContain("throw new Error(result.error || result.detail")
    const button = modal.slice(modal.lastIndexOf("/api/proxy/least-privilege/simulate-fix"))
    expect(button.slice(0, 1500)).toContain("refusalFromPreviewBody(response.status, errorData)")
  })
})
