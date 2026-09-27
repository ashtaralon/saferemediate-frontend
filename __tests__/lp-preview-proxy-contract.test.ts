import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/proxy/least-privilege/simulate-fix/route"

const TOKEN = "fixture-service-token-0123456789abcdef"

function request(body: unknown = {
  resource_type: "IAMRole",
  resource_id: "web-role",
  system_name: "payments",
}) {
  return new Request("http://localhost/api/proxy/least-privilege/simulate-fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

describe("simulate-fix proxy auth contract", () => {
  it("refuses locally when the service token is absent and does not call the backend", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error_code).toBe("DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED")
    expect(body.origin).toBe("proxy")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("preserves a backend 401 for a wrong token, including the detail code", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "https://backend.example"
    const payload = {
      detail: {
        code: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE",
        message: "The request's identity could not be verified.",
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(backend(401, payload))
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual(payload)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get("X-Cyntro-Service-Token")).toBe(TOKEN)
  })

  it("preserves a backend 503 when the review runtime is unavailable", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "https://backend.example"
    const payload = {
      detail: {
        code: "ANALYST_RUNTIME_UNAVAILABLE",
        message: "The request's identity cannot be verified right now.",
      },
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(backend(503, payload)))

    const res = await POST(request())

    expect(res.status).toBe(503)
    expect(res.status).not.toBe(502)
    expect(await res.json()).toEqual(payload)
  })

  it("passes a populated measured preview through unchanged", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "https://backend.example"
    const payload = populatedPreview()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(backend(200, payload)))

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(payload)
  })

  it("passes a legitimately empty preview through, including null counts", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "https://backend.example"
    const payload = emptyPreview()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(backend(200, payload)))

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(payload)
    expect(body.problem.gap_percent).toBeNull()
    expect(body.problem.unused_count).toBeNull()
    expect(body.problem.used_count).toBeNull()
    expect(body.simulation.removed_permissions).toBe(0)
    expect(body.plan).toBeNull()
  })
})

function populatedPreview() {
  return {
    resource: { id: "web-role", type: "IAMRole", system: "payments", severity: "unknown", shared: false, shared_confidence: "unknown", consumers: [] },
    problem: {
      summary: "Scoped review found 4 unused of 16 permissions. This preview does not authorize removal.",
      gap_percent: 25,
      unused_count: 4,
      used_count: 12,
      top_risk_reasons: ["preview_does_not_authorize_removal"],
    },
    evidence: {
      observation_window_days: 90,
      evidence_sources: [],
      confidence: "high",
      completeness: "partial",
      caveats: [],
      visibility_signals: { data_confidence: "OBSERVED", usage_state: "observed" },
    },
    simulation: {
      action_type: "none",
      summary: "No removal is authorized by this preview.",
      kept_permissions: 12,
      removed_permissions: 0,
      kept_examples: ["s3:GetObject"],
      removed_examples: [],
    },
    projected_effect: { projection_available: false, current_state_available: false },
    safety: { decision: "blocked", decision_canonical: "BLOCK", rollback_available: false, snapshot_required: true, preflight_required: true, unsafe_reasons: ["preview_does_not_authorize_removal"] },
    removal_safety: null,
    plan: null,
    decision_persistence: { persisted: false, decision_key: "", evaluated_at: "2026-09-23T00:00:00Z", expires_at: "2026-09-23T00:00:00Z" },
  }
}

function emptyPreview() {
  return {
    ...populatedPreview(),
    problem: {
      summary: "Usage was not measured for this role. Unknown coverage is not a clean-role or effective-access verdict, and this preview does not authorize removal.",
      gap_percent: null,
      unused_count: null,
      used_count: null,
      top_risk_reasons: ["preview_does_not_authorize_removal"],
    },
    evidence: {
      ...populatedPreview().evidence,
      confidence: "unknown",
      completeness: "unknown",
      visibility_signals: { data_confidence: "UNKNOWN", usage_state: "unknown", lp_score: null },
    },
    simulation: {
      action_type: "none",
      summary: "No removal is authorized by this preview.",
      kept_permissions: 0,
      removed_permissions: 0,
      kept_examples: [],
      removed_examples: [],
    },
  }
}
