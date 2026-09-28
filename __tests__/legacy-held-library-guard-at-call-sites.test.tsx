/**
 * The library guard AT EACH CALL SITE, isolated: the hold helpers a component reads (legacyMutationHold,
 * legacyControlHeld) are mocked to "released", so every control renders enabled and every click handler proceeds --
 * only fetchLegacyMutation's own hold check (the REAL module, which reads the real compiled constants internally) stands
 * between the click and the network. A call site that used bare `fetch` for its mutation would send it here.
 *
 * The third guard of the set: legacy-held-controls-send-nothing.test.tsx proves the whole path and the disabled
 * controls; legacy-held-controls-handler-guard.test.tsx proves the handlers with the request function spied. Response
 * bodies are labelled test input.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/legacy-mutation-hold", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/legacy-mutation-hold")>()
  return { ...actual, legacyMutationHold: () => null, legacyControlHeld: () => false }
})
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { SGRemediationCard } from "@/components/sg-remediation-card"
import { S3RemediationCard } from "@/components/s3-remediation-card"
import { OrphanServicesTab } from "@/components/orphan-services-tab"
import { SimulateFixModal } from "@/components/SimulateFixModal"
import { QuarantineCandidatesSection } from "@/components/iam-shared-roles-detail-view"
import { useMitigationExecution } from "@/hooks/use-mitigation-execution"
import type { ConsumerEvidence, DataLeakMitigation } from "@/lib/types"

const MUTATION = /\/api\/proxy\/(simulate\/execute|remediate$|safe-remediate\/execute|iam-roles\/remediate|security-groups\/[^/]+\/remediate|sg-least-privilege\/[^/]+\/remediate|s3-buckets\/remediate|quarantine\/(execute|restore|delete|start-monitor)|iam-roles\/approval-requests\/[^/]+\/execute|remediation\/execute|remediate\/execute|cyntro\/remediate|attack-path-remediate)/

const SG_ID = "sg-0fixture00000000"
const BUCKET = "fixture-bucket"

type Call = { url: string; method: string }

function spyNetwork(routes: Record<string, unknown>): Call[] {
  const calls: Call[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? "GET").toUpperCase() })
    const hit = Object.keys(routes).find((prefix) => url.startsWith(prefix))
    return new Response(JSON.stringify(hit ? routes[hit] : { detail: { code: "SPY_UNROUTED" } }), {
      status: hit ? 200 : 599, headers: { "Content-Type": "application/json" },
    })
  }))
  return calls
}

const mutations = (calls: Call[]) => calls.filter((call) => MUTATION.test(call.url.split("?")[0]))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("controls released by the mocked helpers still send no mutation (fetchLegacyMutation refuses)", () => {
  it("SG Apply", async () => {
    const calls = spyNetwork({
      [`/api/proxy/security-groups/${SG_ID}/rule-analysis`]: {
        sg_id: SG_ID, observation_days: 30,
        rules_analysis: [{ rule_id: "fixture-rule-1", direction: "inbound", protocol: "tcp", port_range: "22",
          source: "0.0.0.0/0", destination: "", description: "fixture", is_public: true, traffic: { connection_count: 0 },
          recommendation: { action: "delete", reason: "fixture", confidence: 90 } }],
      },
      [`/api/proxy/security-groups/${SG_ID}/simulate`]: { is_safe: true, potential_impact: [] },
    })
    render(<SGRemediationCard sgId={SG_ID} />)
    fireEvent.click(await screen.findByText(/INBOUND · tcp\s+22/))
    const apply = screen.getByTestId("sg-apply-disabled") as HTMLButtonElement
    await waitFor(() => expect(apply.disabled).toBe(false), { timeout: 2000 })
    await act(async () => {
      fireEvent.click(apply)
    })
    expect(mutations(calls)).toEqual([])
  })

  it("S3 Apply", async () => {
    const calls = spyNetwork({
      [`/api/proxy/s3-buckets/${BUCKET}/gap-analysis`]: {
        bucket_name: BUCKET, observation_days: 30,
        policies_analysis: [{ policy_name: "FixtureStatement", policy_type: "unused", risk_level: "HIGH",
          recommendation: "remove", access_count: 0, is_public: true, actions: ["s3:GetObject"], effect: "Allow" }],
      },
    })
    render(<S3RemediationCard bucketName={BUCKET} />)
    fireEvent.click(await screen.findByText("FixtureStatement"))
    const apply = screen.getByTestId("s3-apply-disabled") as HTMLButtonElement
    expect(apply.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(apply)
    })
    expect(mutations(calls)).toEqual([])
  })

  it.each([
    ["PRE_CHECK", ["Quarantine", "Delete Now", "Cancel"]],
    ["QUARANTINE", ["Restore", "Delete Now"]],
  ])("Orphan tab %s actions", async (phase, labels) => {
    const calls = spyNetwork({
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
      const button = screen.getByRole("button", { name: new RegExp(`^${label}$`) }) as HTMLButtonElement
      expect(button.disabled).toBe(false)
      await act(async () => {
        fireEvent.click(button)
      })
    }
    expect(mutations(calls)).toEqual([])
  })

  it("SimulateFixModal Approve & Apply and role Execute Remediation", async () => {
    const calls = spyNetwork({ "/api/proxy/simulate": { simulation: null, decision: { action: "REQUIRE_APPROVAL", confidence: 0.9, safety: 0.9 } } })
    const { unmount } = render(<SimulateFixModal isOpen onClose={() => {}} finding={{ id: "fixture-finding", title: "fixture" }} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run Simulation" }))
    })
    const apply = (await screen.findByRole("button", { name: "Approve & Apply" })) as HTMLButtonElement
    expect(apply.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(apply)
    })
    unmount()
    render(<SimulateFixModal isOpen onClose={() => {}} role={{ id: "AROAFIXTURE", name: "fixture-role" }} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Execute Remediation" }))
    })
    expect(calls.filter((call) => call.url === "/api/proxy/simulate")).toHaveLength(1)
    expect(mutations(calls)).toEqual([])
  })

  it("IAM shared-roles quarantine candidate: row Delete and bulk Delete (pre-check reads, delete refused)", async () => {
    const calls = spyNetwork({
      "/api/proxy/quarantine/list/fixture-sys": { records: [] },
      "/api/proxy/quarantine/pre-check": { recordId: "q-1", safetyScore: { score: 80 }, phase: "PRE_CHECK" },
    })
    const candidate = {
      consumer_id: "fixture-consumer-1", consumer_type: "LambdaFunction", consumer_name: "fixture-fn",
      system_name: "fixture-sys", observed_actions: [], allowed_intersection: [], blockers: [],
      evidence_state: "OBSERVED", last_observed_at: null,
    } as unknown as ConsumerEvidence
    render(<QuarantineCandidatesSection candidates={[candidate]} thresholdDays={90} />)
    const trigger = (await screen.findAllByRole("button", { name: /^Delete$/, hidden: true }))[0] as HTMLButtonElement
    expect(trigger.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(trigger)
    })
    const dialog = await screen.findByRole("alertdialog")
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/ }))
    })
    await waitFor(() => expect(calls.some((call) => call.url === "/api/proxy/quarantine/pre-check")).toBe(true))
    expect(mutations(calls)).toEqual([])

    // Bulk: select the row, confirm "Delete 1"; the pre-check reads again, the delete is refused locally.
    const preChecks = calls.filter((call) => call.url === "/api/proxy/quarantine/pre-check").length
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Select fixture-fn/, hidden: true }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete 1$/, hidden: true }))
    })
    const bulkDialog = await screen.findByRole("alertdialog")
    await act(async () => {
      fireEvent.click(within(bulkDialog).getByRole("button", { name: /^Delete 1$/ }))
    })
    await waitFor(() => expect(calls.filter((call) => call.url === "/api/proxy/quarantine/pre-check").length).toBe(preChecks + 1))
    expect(mutations(calls)).toEqual([])
  })

  it("data-leak executor Full on an SG remediate endpoint", async () => {
    const calls = spyNetwork({})
    const mitigation: DataLeakMitigation = {
      type: "tighten_sg_egress", title: "fixture", explanation: "fixture", applicable: true,
      execution: { full: { method: "POST", path: `/api/security-groups/${SG_ID}/remediate`, body: { rules_to_remove: [] } } },
    }
    const { result } = renderHook(() => useMitigationExecution(mitigation))
    await act(async () => {
      await result.current.run({ stage: "full" })
    })
    expect(result.current.state.full?.status).toBe(423)
    expect(calls).toEqual([])
  })
})
