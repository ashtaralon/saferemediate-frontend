/**
 * Rendered legacy mutation controls, reached directly, are held and send NOTHING -- with the REAL hold library, a spy
 * on every network request, a user click, and React's own onClick called directly (a disabled button drops the DOM
 * click, so that alone would prove only the attribute). The read-only calls on the same surfaces keep firing.
 *
 * Hosts: SG/S3 cards are mounted through SGRemediationModal / S3RemediationModal exactly as crown-jewel-protection,
 * nhi-profile network/data planes and the attack-path panels mount them (no applyDisabled -> the wrapper passes
 * `false`), and the card directly with the prop omitted, false and true. Responses are labelled test input shaped
 * like the proxies' bodies; nothing here is product data.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SGRemediationCard } from "@/components/sg-remediation-card"
import { SGRemediationModal } from "@/components/sg-remediation-modal"
import { S3RemediationCard } from "@/components/s3-remediation-card"
import { S3RemediationModal } from "@/components/s3-remediation-modal"
import { OrphanServicesTab } from "@/components/orphan-services-tab"
import { SimulateFixModal } from "@/components/SimulateFixModal"
import { ApprovedIamChangeExecuteControl } from "@/components/iam-permission-analysis-modal"
import { QuarantineCandidatesSection } from "@/components/iam-shared-roles-detail-view"
import { useMitigationExecution } from "@/hooks/use-mitigation-execution"
import type { ConsumerEvidence, DataLeakMitigation } from "@/lib/types"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const MUTATION_PATHS = [
  /\/api\/proxy\/simulate\/execute/,
  /\/api\/proxy\/remediate$/,
  /\/api\/proxy\/safe-remediate\/execute/,
  /\/api\/proxy\/iam-roles\/remediate/,
  /\/api\/proxy\/security-groups\/[^/]+\/remediate/,
  /\/api\/proxy\/sg-least-privilege\/[^/]+\/remediate/,
  /\/api\/proxy\/s3-buckets\/remediate/,
  /\/api\/proxy\/quarantine\/(execute|restore|delete|start-monitor)/,
  /\/api\/proxy\/iam-roles\/approval-requests\/[^/]+\/execute/,
]

type Call = { url: string; method: string; body: unknown }

const SG_ID = "sg-0fixture00000000"
const BUCKET = "fixture-bucket"

// Test input shaped like /api/proxy/security-groups/{sg}/rule-analysis.
const SG_REVIEW = {
  sg_id: SG_ID,
  sg_name: "fixture-sg",
  observation_days: 30,
  rules_analysis: [
    {
      rule_id: "fixture-rule-1", direction: "inbound", protocol: "tcp", port_range: "22", source: "0.0.0.0/0",
      destination: "", description: "fixture", is_public: true, traffic: { connection_count: 0 },
      recommendation: { action: "delete", reason: "no traffic observed (fixture)", confidence: 90 },
    },
  ],
}
// Test input shaped like /api/proxy/s3-buckets/{bucket}/gap-analysis.
const S3_REVIEW = {
  bucket_name: BUCKET,
  observation_days: 30,
  policies_analysis: [
    {
      policy_name: "FixtureStatement", policy_type: "unused", risk_level: "HIGH", recommendation: "remove",
      access_count: 0, is_public: true, actions: ["s3:GetObject"], effect: "Allow",
    },
  ],
}

function spyNetwork(routes: Record<string, unknown> = {}): Call[] {
  const calls: Call[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? "GET").toUpperCase(), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const hit = Object.keys(routes).find((prefix) => url.startsWith(prefix))
    if (hit) return new Response(JSON.stringify(routes[hit]), { status: 200, headers: { "Content-Type": "application/json" } })
    return new Response(JSON.stringify({ detail: { code: "SPY_UNROUTED" } }), { status: 599, headers: { "Content-Type": "application/json" } })
  }))
  return calls
}

const mutations = (calls: Call[]) => calls.filter((call) => MUTATION_PATHS.some((pattern) => pattern.test(call.url.split("?")[0])))

async function clickEveryWay(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button)
  })
  const props = Object.entries(button).find(([key]) => key.startsWith("__reactProps"))?.[1] as { onClick?: (e?: unknown) => unknown }
  await act(async () => {
    await props.onClick?.({ stopPropagation() {}, preventDefault() {} })
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("SG remediation card: held on every host", () => {
  const mounts: Array<[string, () => ReactElement]> = [
    ["SGRemediationModal as crown-jewel / nhi-profile / attack-path hosts mount it", () => (
      <SGRemediationModal isOpen onClose={() => {}} sgId={SG_ID} sgName="fixture-sg" systemName="fixture-sys" onRemediate={() => {}} />
    )],
    ["card, applyDisabled omitted", () => <SGRemediationCard sgId={SG_ID} />],
    ["card, applyDisabled={false}", () => <SGRemediationCard sgId={SG_ID} applyDisabled={false} />],
    ["card, applyDisabled={true}", () => <SGRemediationCard sgId={SG_ID} applyDisabled />],
  ]

  it.each(mounts)("%s: Apply disabled with the reason, the preflight simulate still fires, Apply sends nothing", async (_name, mount) => {
    const calls = spyNetwork({
      [`/api/proxy/security-groups/${SG_ID}/rule-analysis`]: SG_REVIEW,
      [`/api/proxy/security-groups/${SG_ID}/simulate`]: { is_safe: true, potential_impact: [], safety_warnings: [] },
    })
    render(mount())
    // Select the rule by its row (the row's onClick toggles it; the checkbox's own click bubbles into a second toggle).
    const ruleLabel = await screen.findByText(/INBOUND · tcp\s+22/)
    await act(async () => {
      fireEvent.click(ruleLabel)
    })
    expect(screen.getByText("1 rule selected")).toBeTruthy()
    // Read-only: the debounced preflight dry run still reaches the simulate proxy.
    await waitFor(() => expect(calls.some((call) => call.url.startsWith(`/api/proxy/security-groups/${SG_ID}/simulate`))).toBe(true), { timeout: 2000 })
    const preflight = calls.find((call) => call.url.startsWith(`/api/proxy/security-groups/${SG_ID}/simulate`))!
    expect((preflight.body as { dry_run: boolean }).dry_run).toBe(true)

    const apply = screen.getByTestId("sg-apply-disabled") as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    expect(apply.title).toContain("Held: backend safety/recovery contract not yet proven")
    expect(screen.getByTestId("legacy-mutation-held-sg_remediate").getAttribute("data-hold-code")).toBe("SG_REMEDIATE_HELD")
    await clickEveryWay(apply)
    expect(mutations(calls)).toEqual([])
  })
})

describe("S3 remediation card: held on every host", () => {
  const mounts: Array<[string, () => ReactElement]> = [
    ["S3RemediationModal as nhi-profile data plane / attack-path hosts mount it", () => (
      <S3RemediationModal isOpen onClose={() => {}} bucketName={BUCKET} systemName="fixture-sys" />
    )],
    ["card, applyDisabled omitted", () => <S3RemediationCard bucketName={BUCKET} />],
    ["card, applyDisabled={false}", () => <S3RemediationCard bucketName={BUCKET} applyDisabled={false} />],
    ["card, applyDisabled={true}", () => <S3RemediationCard bucketName={BUCKET} applyDisabled />],
  ]

  it.each(mounts)("%s: the review loads, Apply is disabled with the reason and sends nothing", async (_name, mount) => {
    const calls = spyNetwork({ [`/api/proxy/s3-buckets/${BUCKET}/gap-analysis`]: S3_REVIEW })
    render(mount())
    const statement = await screen.findByText("FixtureStatement")
    await act(async () => {
      fireEvent.click(statement)
    })
    expect(screen.getByText("1 statement selected")).toBeTruthy()
    expect(calls.some((call) => call.url === `/api/proxy/s3-buckets/${BUCKET}/gap-analysis`)).toBe(true)
    const apply = screen.getByTestId("s3-apply-disabled") as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    expect(apply.title).toContain("Held: backend safety/recovery contract not yet proven")
    expect(screen.getByTestId("legacy-mutation-held-s3_remediate").getAttribute("data-hold-code")).toBe("S3_REMEDIATE_HELD")
    await clickEveryWay(apply)
    expect(mutations(calls)).toEqual([])
  })
})

// Test input shaped like /api/proxy/quarantine/list/{system}: one record per phase that renders actions.
function quarantineRecord(id: string, resourceName: string, phase: string) {
  return {
    id, resourceName, resourceType: "LambdaFunction", systemName: "fixture-sys", phase, safetyScore: 80,
    safetyBreakdown: null, configBackup: null, initiatedBy: "user", createdAt: "", updatedAt: "",
    monitorStartedAt: "", quarantinedAt: "", deletedAt: "", restoredAt: "", history: [],
  }
}

describe("Orphan services tab (system-detail and /orphan-resources): quarantine actions held", () => {
  it.each([
    ["PRE_CHECK", ["Quarantine", "Delete Now", "Cancel"]],
    ["QUARANTINE", ["Restore", "Delete Now"]],
  ])("%s record: every mutating action is disabled with the reason and a click sends nothing", async (phase, labels) => {
    const calls = spyNetwork({
      "/api/proxy/orphan-services/fixture-sys": { orphans: [], seasonal: [], newResources: [], summary: null },
      "/api/proxy/quarantine/list/fixture-sys": { records: [quarantineRecord("q-1", "fixture-fn", phase)] },
    })
    render(<OrphanServicesTab systemName="fixture-sys" />)
    const row = await screen.findByText("fixture-fn")
    await act(async () => {
      fireEvent.click(row)
    })
    expect((await screen.findAllByTestId("legacy-mutation-held-quarantine"))[0].getAttribute("data-hold-code")).toBe("QUARANTINE_HELD")
    for (const label of labels) {
      const button = screen.getByRole("button", { name: new RegExp(`^${label}$`) }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      await clickEveryWay(button)
    }
    expect(mutations(calls)).toEqual([])
    // Read-only: the list and orphan reads still happen.
    expect(calls.some((call) => call.url === "/api/proxy/quarantine/list/fixture-sys")).toBe(true)
  })
})

describe("IAM shared-roles plan page (/iam/shared-roles/by-plan/[plan_id]): quarantine candidate Delete", () => {
  it("row and bulk Delete are disabled with the reason; clicks send nothing, not even the pre-check", async () => {
    const calls = spyNetwork({ "/api/proxy/quarantine/list/fixture-sys": { records: [] } })
    const candidate = {
      consumer_id: "fixture-consumer-1", consumer_type: "LambdaFunction", consumer_name: "fixture-fn",
      system_name: "fixture-sys", observed_actions: [], allowed_intersection: [], blockers: [],
      evidence_state: "OBSERVED", last_observed_at: null,
    } as unknown as ConsumerEvidence
    render(<QuarantineCandidatesSection candidates={[candidate]} thresholdDays={90} />)
    const rowDelete = (await screen.findAllByRole("button", { name: /^Delete$/, hidden: true }))[0] as HTMLButtonElement
    expect(rowDelete.disabled).toBe(true)
    expect(screen.getAllByTestId("legacy-mutation-held-quarantine")[0].getAttribute("data-hold-code")).toBe("QUARANTINE_HELD")
    await clickEveryWay(rowDelete)
    // React's onClick opens the confirm dialog even though the trigger is disabled; its enabled Delete action then
    // runs the handler, which must refuse before the pre-check.
    const dialog = await screen.findByRole("alertdialog")
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/ }))
    })
    expect(screen.getAllByText(/Held: backend safety\/recovery contract not yet proven for quarantine/).length).toBeGreaterThan(0)
    // Bulk: select the row, then the "Delete 1" trigger is held the same way.
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Select fixture-fn/, hidden: true }))
    })
    const bulkDelete = screen.getByRole("button", { name: /^Delete 1$/, hidden: true }) as HTMLButtonElement
    expect(bulkDelete.disabled).toBe(true)
    await clickEveryWay(bulkDelete)
    const bulkDialog = await screen.findByRole("alertdialog")
    await act(async () => {
      fireEvent.click(within(bulkDialog).getByRole("button", { name: /^Delete 1$/ }))
    })
    expect(calls.map((call) => call.url)).toEqual(["/api/proxy/quarantine/list/fixture-sys"])
  })
})

describe("SimulateFixModal (issues list, FindingCard, pending decisions, home-v2 queue)", () => {
  it("at SIMULATED the simulation request fired, Approve & Apply is held and sends nothing", async () => {
    const calls = spyNetwork({
      "/api/proxy/simulate": { simulation: { before_state: "fixture-before" }, decision: { action: "REQUIRE_APPROVAL", confidence: 0.9, safety: 0.9, reasons: [] } },
    })
    render(<SimulateFixModal isOpen onClose={() => {}} finding={{ id: "fixture-finding", title: "fixture", severity: "HIGH" }} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run Simulation" }))
    })
    const apply = (await screen.findByRole("button", { name: "Approve & Apply" })) as HTMLButtonElement
    expect(calls.filter((call) => call.url === "/api/proxy/simulate")).toHaveLength(1)
    expect(apply.disabled).toBe(true)
    expect(screen.getByTestId("legacy-mutation-held-finding_remediate").getAttribute("data-hold-code")).toBe("FINDING_REMEDIATE_HELD")
    await clickEveryWay(apply)
    expect(mutations(calls)).toEqual([])
  })

  it("the role-based Execute Remediation is held and sends nothing", async () => {
    const calls = spyNetwork()
    render(<SimulateFixModal isOpen onClose={() => {}} role={{ id: "AROAFIXTURE", name: "fixture-role", arn: "arn:aws:iam::111111111111:role/fixture-role" }} />)
    const execute = screen.getByRole("button", { name: "Execute Remediation" }) as HTMLButtonElement
    expect(execute.disabled).toBe(true)
    expect(screen.getByTestId("legacy-mutation-held-finding_remediate")).toBeTruthy()
    await clickEveryWay(execute)
    expect(calls).toEqual([])
  })
})

describe("IAM modal: the APPROVED approval's Execute control", () => {
  it.each([
    ["applyDisabled omitted (nhi-profile, attack-paths-v2 hosts)", undefined],
    ["applyDisabled={false}", false],
    ["applyDisabled={true}", true],
  ])("%s: disabled with the reason and never reaches onExecute", async (_name, applyDisabled) => {
    const calls = spyNetwork()
    const onExecute = vi.fn(async () => {})
    render(
      <ApprovedIamChangeExecuteControl requestId="req-fixture-1" sharedHref="/iam/shared-roles" busy={false}
        applyDisabled={applyDisabled} onExecute={onExecute} />,
    )
    const button = screen.getByTestId("iam-execute-approved") as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId("legacy-mutation-held-iam_approval_execute").getAttribute("data-hold-code")).toBe("IAM_APPROVAL_EXECUTE_HELD")
    await clickEveryWay(button)
    expect(onExecute).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
})

describe("Data-leak mitigation executor (backend-authored endpoints)", () => {
  // Shape of api/data_leak_paths.py remove_iam_permission entry (labelled test input).
  const mitigation: DataLeakMitigation = {
    type: "remove_iam_permission",
    title: "fixture",
    explanation: "fixture",
    applicable: true,
    requiresOverrideLineage: true,
    execution: {
      simulate: { method: "POST", path: "/api/iam-roles/remediate", body: { role_name: "fixture-role", permissions_to_remove: ["s3:GetObject"], dry_run: true, create_snapshot: true } },
      full: { method: "POST", path: "/api/iam-roles/remediate", body: { role_name: "fixture-role", permissions_to_remove: ["s3:GetObject"], dry_run: false, create_snapshot: true } },
    },
  }

  it("the dry-run Simulate still runs; the live Full is held and sends nothing", async () => {
    const calls = spyNetwork({ "/api/proxy/iam-roles/remediate": { success: true, message: "fixture dry run" } })
    const { result } = renderHook(() => useMitigationExecution(mitigation))
    expect(result.current.holdFor("simulate")).toBeNull()
    expect(result.current.holdFor("full")).toMatchObject({ code: "FINDING_REMEDIATE_HELD" })
    await act(async () => {
      await result.current.run({ stage: "simulate" })
    })
    expect(calls).toHaveLength(1)
    expect((calls[0].body as { dry_run: boolean }).dry_run).toBe(true)
    expect(result.current.canRun("full")).toBe(false)
    await act(async () => {
      expect(await result.current.run({ stage: "full" })).toBeNull()
    })
    expect(calls).toHaveLength(1)
  })
})
