import { readFileSync } from "node:fs"
import path from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { IAMSimulateFixModal } from "@/components/IAMSimulateFixModal"
import type { SimulateFixResponse } from "@/lib/types"
import { refusalFromPreviewBody, reviewRefusalCopy } from "@/lib/lp-preview-refusal"

describe("LeastPrivilegeTab refusal copy", () => {
  it("renders the structured copy for an absent token, a wrong token, and an unavailable runtime", () => {
    const absent = reviewRefusalCopy(refusalFromPreviewBody(503, {
      error_code: "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED",
      origin: "proxy",
      error: "raw proxy string that must not be the toast",
    }))
    const wrong = reviewRefusalCopy(refusalFromPreviewBody(401, {
      detail: {
        code: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE",
        message: "The request's identity could not be verified.",
      },
    }))
    const unavailable = reviewRefusalCopy(refusalFromPreviewBody(503, {
      detail: {
        code: "ANALYST_RUNTIME_UNAVAILABLE",
        message: "The request's identity cannot be verified right now.",
      },
    }))

    expect(absent.title).toBe("The frontend has no service proof for the backend")
    expect(wrong.title).toBe("The deployment's service identity was not accepted")
    expect(unavailable.title).toBe("Your identity could not be verified")
    expect(unavailable.body).not.toContain("raw")
    expect(JSON.stringify(absent)).not.toContain("raw proxy string")

    const tab = readFileSync(
      path.join(__dirname, "../components/LeastPrivilegeTab.tsx"),
      "utf8",
    )
    const simulateFix = tab.slice(tab.indexOf("/api/proxy/least-privilege/simulate-fix"))
    expect(simulateFix).toContain("reviewRefusalCopy(refusalFromPreviewBody(response.status, errorData))")
    expect(simulateFix.slice(0, 800)).not.toContain("Simulation failed:")
  })
})

describe("IAM simulate-fix preview", () => {
  it("shows measured counts for a populated preview", () => {
    render(
      <IAMSimulateFixModal
        isOpen
        onClose={() => {}}
        result={populated() as SimulateFixResponse}
        resourceName="web-role"
        applyDisabled
      />,
    )
    expect(screen.getByText("25%")).toBeTruthy()
    expect(screen.getByText("4")).toBeTruthy()
    expect(screen.getByText("12")).toBeTruthy()
    expect(screen.queryByText("Unknown")).toBeNull()
  })

  it("shows Unknown for a legitimately unmeasured preview and does not treat a null gap as zero", () => {
    render(
      <IAMSimulateFixModal
        isOpen
        onClose={() => {}}
        result={empty() as SimulateFixResponse}
        resourceName="web-role"
        applyDisabled
      />,
    )
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0)
    expect(screen.queryByText("0%")).toBeNull()
    expect(screen.queryByText("null%")).toBeNull()
    expect(screen.getByText("No removal plan was issued.")).toBeTruthy()
  })
})

function populated(): Record<string, unknown> {
  return {
    resource: { id: "web-role", type: "IAMRole", system: "payments", severity: "INFO", shared: false, shared_confidence: "unknown", consumers: [] },
    problem: {
      summary: "Scoped review found 4 unused of 16 permissions.",
      gap_percent: 25,
      unused_count: 4,
      used_count: 12,
      top_risk_reasons: ["preview_does_not_authorize_removal"],
    },
    evidence: {
      observation_window_days: 90,
      evidence_sources: [],
      last_sync: null,
      confidence: "high",
      completeness: "partial",
      caveats: [],
      visibility_signals: { data_confidence: "OBSERVED" },
    },
    simulation: {
      action_type: "none",
      summary: "No removal is authorized by this preview.",
      kept_permissions: 12,
      removed_permissions: 0,
      kept_examples: [],
      removed_examples: [],
    },
    projected_effect: {
      blast_radius_score_before: null,
      blast_radius_score_after: null,
      blast_radius_score_delta: null,
      family_scores_before: null,
      family_scores_after: null,
      resource_risk_contribution_before: null,
      resource_risk_contribution_after: null,
      projection_available: false,
      current_state_available: false,
    },
    safety: {
      decision: "blocked",
      decision_canonical: "BLOCK",
      rollback_available: false,
      snapshot_required: true,
      preflight_required: true,
      unsafe_reasons: ["preview_does_not_authorize_removal"],
    },
    decision_persistence: {
      persisted: false,
      decision_key: "",
      evaluated_at: "2026-09-23T00:00:00Z",
      expires_at: "2026-09-23T00:00:00Z",
    },
  }
}

function empty(): Record<string, unknown> {
  return {
    ...populated(),
    problem: {
      summary: "Usage was not measured for this role.",
      gap_percent: null,
      unused_count: null,
      used_count: null,
      top_risk_reasons: ["preview_does_not_authorize_removal"],
    },
    evidence: {
      ...(populated().evidence as object),
      confidence: "unknown",
      completeness: "unknown",
      visibility_signals: { data_confidence: "UNKNOWN" },
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
