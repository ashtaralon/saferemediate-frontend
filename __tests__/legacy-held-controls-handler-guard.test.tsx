/**
 * The held controls' OWN guards, isolated: the request function (fetchLegacyMutation) is a spy here, so its internal
 * hold check cannot catch anything -- only each click handler's refusal stands between the click and the request.
 * The hold state itself stays REAL. Its partners: legacy-held-controls-send-nothing.test.tsx (the whole path against
 * a network spy), legacy-held-library-guard-at-call-sites.test.tsx (each call site's request function with the
 * handler guards released) and legacy-mutation-hold-library-and-proxy.test.ts (the library and the proxies). The
 * handler guard and the call-site library guard are each tested without the other.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const request = vi.fn()
vi.mock("@/lib/legacy-mutation-hold", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/legacy-mutation-hold")>()
  return { ...actual, fetchLegacyMutation: (...args: unknown[]) => request(...args) }
})

import { SGRemediationCard } from "@/components/sg-remediation-card"
import { S3RemediationCard } from "@/components/s3-remediation-card"
import { OrphanServicesTab } from "@/components/orphan-services-tab"
import { SimulateFixModal } from "@/components/SimulateFixModal"
import { useMitigationExecution } from "@/hooks/use-mitigation-execution"
import type { DataLeakMitigation } from "@/lib/types"

const SG_ID = "sg-0fixture00000000"
const BUCKET = "fixture-bucket"

function reads(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const hit = Object.keys(routes).find((prefix) => url.startsWith(prefix))
    const body = hit ? routes[hit] : { detail: { code: "SPY_UNROUTED" } }
    return new Response(JSON.stringify(body), { status: hit ? 200 : 599, headers: { "Content-Type": "application/json" } })
  }))
}

async function callOnClick(button: HTMLElement) {
  const props = Object.entries(button).find(([key]) => key.startsWith("__reactProps"))?.[1] as { onClick: (e?: unknown) => unknown }
  await act(async () => {
    await props.onClick({ stopPropagation() {}, preventDefault() {} })
  })
}

afterEach(() => {
  cleanup()
  request.mockReset()
  vi.unstubAllGlobals()
})

describe("held handlers never reach the request function", () => {
  it.each([undefined, false])("SG Apply (applyDisabled=%s) with a rule selected", async (applyDisabled) => {
    reads({
      [`/api/proxy/security-groups/${SG_ID}/rule-analysis`]: {
        sg_id: SG_ID, observation_days: 30,
        rules_analysis: [{ rule_id: "fixture-rule-1", direction: "inbound", protocol: "tcp", port_range: "22",
          source: "0.0.0.0/0", destination: "", description: "fixture", is_public: true, traffic: { connection_count: 0 },
          recommendation: { action: "delete", reason: "fixture", confidence: 90 } }],
      },
      [`/api/proxy/security-groups/${SG_ID}/simulate`]: { is_safe: true, potential_impact: [] },
    })
    render(<SGRemediationCard sgId={SG_ID} applyDisabled={applyDisabled} />)
    fireEvent.click(await screen.findByText(/INBOUND · tcp\s+22/))
    expect(screen.getByText("1 rule selected")).toBeTruthy()
    await callOnClick(screen.getByTestId("sg-apply-disabled"))
    expect(request).not.toHaveBeenCalled()
  })

  it.each([undefined, false])("S3 Apply (applyDisabled=%s) with a statement selected", async (applyDisabled) => {
    reads({
      [`/api/proxy/s3-buckets/${BUCKET}/gap-analysis`]: {
        bucket_name: BUCKET, observation_days: 30,
        policies_analysis: [{ policy_name: "FixtureStatement", policy_type: "unused", risk_level: "HIGH",
          recommendation: "remove", access_count: 0, is_public: true, actions: ["s3:GetObject"], effect: "Allow" }],
      },
    })
    render(<S3RemediationCard bucketName={BUCKET} applyDisabled={applyDisabled} />)
    fireEvent.click(await screen.findByText("FixtureStatement"))
    expect(screen.getByText("1 statement selected")).toBeTruthy()
    await callOnClick(screen.getByTestId("s3-apply-disabled"))
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    ["PRE_CHECK", ["Quarantine", "Delete Now", "Cancel"]],
    ["QUARANTINE", ["Restore", "Delete Now"]],
  ])("Orphan tab %s actions", async (phase, labels) => {
    reads({
      "/api/proxy/orphan-services/fixture-sys": { orphans: [], seasonal: [], newResources: [], summary: null },
      "/api/proxy/quarantine/list/fixture-sys": { records: [{
        id: "q-1", resourceName: "fixture-fn", resourceType: "LambdaFunction", systemName: "fixture-sys", phase,
        safetyScore: 80, safetyBreakdown: null, configBackup: null, initiatedBy: "user", createdAt: "", updatedAt: "",
        monitorStartedAt: "", quarantinedAt: "", deletedAt: "", restoredAt: "", history: [],
      }] },
    })
    render(<OrphanServicesTab systemName="fixture-sys" />)
    fireEvent.click(await screen.findByText("fixture-fn"))
    for (const label of labels) {
      await callOnClick(screen.getByRole("button", { name: new RegExp(`^${label}$`) }))
    }
    expect(request).not.toHaveBeenCalled()
  })

  it("SimulateFixModal Approve & Apply refuses with the reason", async () => {
    reads({ "/api/proxy/simulate": { simulation: null, decision: { action: "REQUIRE_APPROVAL", confidence: 0.9, safety: 0.9 } } })
    render(<SimulateFixModal isOpen onClose={() => {}} finding={{ id: "fixture-finding", title: "fixture" }} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run Simulation" }))
    })
    await callOnClick(await screen.findByRole("button", { name: "Approve & Apply" }))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByText(/Held: backend safety\/recovery contract not yet proven for finding remediation/)).toBeTruthy()
  })

  it("SimulateFixModal Execute Remediation (role) refuses with the reason", async () => {
    reads({})
    render(<SimulateFixModal isOpen onClose={() => {}} role={{ id: "AROAFIXTURE", name: "fixture-role" }} />)
    await callOnClick(screen.getByRole("button", { name: "Execute Remediation" }))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByText(/Held: backend safety\/recovery contract not yet proven for finding remediation/)).toBeTruthy()
  })

  it("data-leak executor run({stage: 'full'}) on a held endpoint", async () => {
    reads({})
    const mitigation: DataLeakMitigation = {
      type: "tighten_sg_egress", title: "fixture", explanation: "fixture", applicable: true,
      execution: {
        simulate: { method: "POST", path: `/api/security-groups/${SG_ID}/simulate`, body: { dry_run: true } },
        full: { method: "POST", path: `/api/security-groups/${SG_ID}/remediate`, body: { rules_to_remove: [] } },
      },
    }
    const { result } = renderHook(() => useMitigationExecution(mitigation))
    expect(result.current.holdFor("full")).toMatchObject({ code: "SG_REMEDIATE_HELD" })
    await act(async () => {
      await result.current.run({ stage: "full" })
    })
    expect(request).not.toHaveBeenCalled()
  })
})
