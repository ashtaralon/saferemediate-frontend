/**
 * Refused legacy mutations are VISIBLE: a backend 409 (or the legacy hold's 423) on a snapshot delete or a quarantine
 * transition renders the refusal's code and message on screen and keeps it there, never reads as success, never removes
 * the row, and never leaves a spinner running. The proxies relay the backend's status and typed body unchanged.
 *
 * The 409 bodies are the backend's literal construction (not a paraphrase):
 *   api/iam_gap_analysis.py delete_iam_snapshot (claude/cf01-lp-iam-snapshot-delete-hold, e00eb66b) and
 *   api/_off_boundary_http.py refuse_off_boundary_http (#2269):
 *     raise HTTPException(status_code=409, detail={"error": refusal.code.value, "reason_code": refusal.code.value,
 *                                                  "message": refusal.message, **refusal.details})
 *   where refusal = refuse_off_boundary_execution(path): message f"{path}: {CONTAINED_PATHS[path]}", details
 *   {"path": path, "contained": True, "still_available": ["analysis", "plan", "simulate", "rollback"], "detail": None}.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// "real": the compiled holds as shipped. "handler": the component's hold helpers released, the request function's own
// hold REAL (it answers the local 423). "all": everything released, so the request reaches the (stubbed) network.
const holdMode = { client: "real" as "real" | "handler" | "all", proxyReleased: false }
vi.mock("@/lib/legacy-mutation-hold", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/legacy-mutation-hold")>()
  return {
    ...actual,
    legacyMutationHold: (family: Parameters<typeof actual.legacyMutationHold>[0]) =>
      holdMode.client === "real" ? actual.legacyMutationHold(family) : null,
    legacyControlHeld: (family: Parameters<typeof actual.legacyControlHeld>[0], hostDisabled?: boolean) =>
      holdMode.client === "real" ? actual.legacyControlHeld(family, hostDisabled) : hostDisabled === true,
    fetchLegacyMutation: (...args: Parameters<typeof actual.fetchLegacyMutation>) =>
      holdMode.client === "all" ? fetch(args[1], args[2]) : actual.fetchLegacyMutation(...args),
  }
})
vi.mock("@/lib/server/legacy-mutation-proxy-hold", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/legacy-mutation-proxy-hold")>()
  return {
    ...actual,
    refuseHeldLegacyMutation: (family: Parameters<typeof actual.refuseHeldLegacyMutation>[0]) =>
      holdMode.proxyReleased ? null : actual.refuseHeldLegacyMutation(family),
  }
})

import RecoveryTab from "@/components/snapshots-recovery-tab"
import { OrphanServicesTab } from "@/components/orphan-services-tab"
import { DELETE as iamSnapshotDelete } from "@/app/api/proxy/iam-roles/snapshots/[snapshotId]/route"
import { DELETE as snapshotDelete } from "@/app/api/proxy/snapshots/[snapshotId]/route"
import { POST as quarantineStartMonitor } from "@/app/api/proxy/quarantine/start-monitor/route"
import { POST as quarantineExecute } from "@/app/api/proxy/quarantine/execute/route"

// CONTAINED_PATHS reasons, verbatim from the backend registry (e00eb66b and #2269).
const REASONS = {
  iam_role_snapshot_delete:
    "DELETE /api/iam-roles/snapshots/{snapshot_id} destroys IAM rollback " +
    "state: the checkpoint (DynamoDB item + S3 object) through " +
    "CheckpointManager.delete_checkpoint, and on fallback the " +
    "RemediationSnapshot graph node, with no operator guard, tier or flag. " +
    "Deleting recovery state is not a recovery action. Listing, reading " +
    "and rollback stay available.",
  snapshot_delete:
    "DELETE /api/snapshots/{snapshot_id} destroys rollback state: the " +
    "checkpoint (DynamoDB item + S3 object), the graph snapshot node and the " +
    "S3 backup, with no operator guard, tier or flag. Deleting recovery state " +
    "is not a recovery action. Listing, reading and rollback stay available.",
  quarantine_start_monitor:
    "POST /api/quarantine/start-monitor tags the customer resource " +
    "(ec2:CreateTags, iam:TagRole, lambda:TagResource) through ambient, unfenced SDK " +
    "clients built in services/quarantine_engine.py, off any fence, pipeline " +
    "or boundary. Pre-check, status, list and activity reads, and " +
    "POST /api/quarantine/restore, stay available.",
  quarantine_execute:
    "POST /api/quarantine/execute stops EC2 instances, puts a deny-all IAM " +
    "inline policy, sets Lambda concurrency to 0, revokes every SG rule, or " +
    "puts a deny S3 bucket policy, through ambient, unfenced SDK clients built in " +
    "services/quarantine_engine.py. Its only gate is the record's phase. " +
    "POST /api/quarantine/restore stays available.",
} as const
type ContainedPath = keyof typeof REASONS

/** The FastAPI 409 body: HTTPException(detail=...) serializes as {"detail": {...}}. */
function offBoundary409Body(path: ContainedPath) {
  return {
    detail: {
      error: "off_boundary_mutation_refused",
      reason_code: "off_boundary_mutation_refused",
      message: `${path}: ${REASONS[path]}`,
      path,
      contained: true,
      still_available: ["analysis", "plan", "simulate", "rollback"],
      detail: null,
    },
  }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const IAM_SNAPSHOT_ID = "IAMRole-payments-api-3f9c2a1b"
const SG_SNAPSHOT_ID = "snap-sg-0a1b2c3d4e5f60718-20260928141502"
const SUCCESS_PREFIX = "✅" // the screen's success alert prefix

let alertSpy: ReturnType<typeof vi.fn>
beforeEach(() => {
  holdMode.client = "real"
  holdMode.proxyReleased = false
  alertSpy = vi.fn()
  vi.stubGlobal("alert", alertSpy)
  vi.stubGlobal("confirm", vi.fn(() => true))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------------------------------------------------
describe("proxies relay the backend refusal unchanged", () => {
  const params = (snapshotId: string) => ({ params: Promise.resolve({ snapshotId }) })

  it.each([
    ["iam-roles/snapshots", iamSnapshotDelete, IAM_SNAPSHOT_ID, "iam_role_snapshot_delete", `/api/iam-roles/snapshots/${IAM_SNAPSHOT_ID}`],
    ["snapshots", snapshotDelete, SG_SNAPSHOT_ID, "snapshot_delete", `/api/snapshots/${SG_SNAPSHOT_ID}`],
  ] as const)("DELETE /api/proxy/%s/{id}: 409 status and typed body pass through", async (_label, handler, id, path, backendPath) => {
    const backend = vi.fn(async () => json(offBoundary409Body(path), 409))
    vi.stubGlobal("fetch", backend)
    const response = await handler(new NextRequest(`http://localhost/api/proxy/x/${id}`, { method: "DELETE" }), params(id))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(offBoundary409Body(path))
    expect(String((backend.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`${backendPath.replace(/[/.]/g, "\\$&")}$`))
  })

  it.each([
    ["iam-roles/snapshots", iamSnapshotDelete],
    ["snapshots", snapshotDelete],
  ] as const)("DELETE /api/proxy/%s/{id}: a non-JSON error keeps its status and is not echoed", async (_label, handler) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>upstream stack trace</html>", { status: 502 })))
    const response = await handler(new NextRequest("http://localhost/x", { method: "DELETE" }), params("snap-x"))
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body).toMatchObject({ code: "UNREADABLE", backendStatus: 502, origin: "proxy" })
    expect(JSON.stringify(body)).not.toContain("stack trace")
  })

  it("DELETE success still answers 200 with the backend's receipt (positive control for the relay branch)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ success: true, deleted: IAM_SNAPSHOT_ID, timestamp: "2026-09-29T08:00:00+00:00" })))
    const response = await iamSnapshotDelete(new NextRequest("http://localhost/x", { method: "DELETE" }), params(IAM_SNAPSHOT_ID))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, deleted: IAM_SNAPSHOT_ID })
  })

  const post = (url: string) =>
    new NextRequest(`http://localhost${url}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordId: "qr-7d1e", actor: "user" }),
    })

  it.each([
    ["start-monitor", quarantineStartMonitor, "quarantine_start_monitor"],
    ["execute", quarantineExecute, "quarantine_execute"],
  ] as const)("POST /api/proxy/quarantine/%s: backend 409 passes through once the FE hold is released", async (name, handler, path) => {
    holdMode.proxyReleased = true
    vi.stubGlobal("fetch", vi.fn(async () => json(offBoundary409Body(path), 409)))
    const response = await handler(post(`/api/proxy/quarantine/${name}`))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(offBoundary409Body(path))
  })

  it("POST /api/proxy/quarantine/start-monitor with the FE hold in force answers its own 423 and sends nothing", async () => {
    const backend = vi.fn()
    vi.stubGlobal("fetch", backend)
    const response = await quarantineStartMonitor(post("/api/proxy/quarantine/start-monitor"))
    expect(response.status).toBe(423)
    expect(await response.json()).toMatchObject({ code: "QUARANTINE_HELD", origin: "proxy" })
    expect(backend).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe("Recovery tab: a refused snapshot delete is shown and the row stays", () => {
  const sgRow = {
    snapshot_id: SG_SNAPSHOT_ID, sg_id: "sg-0a1b2c3d4e5f60718", sg_name: "payments-api-sg", vpc_id: "vpc-0c1d2e3f4a5b6c7d8",
    region: "eu-west-1", timestamp: "2026-09-28T14:15:02Z", reason: "Pre-remediation snapshot", triggered_by: "remediation",
    status: "AVAILABLE", rules_count: { inbound: 3, outbound: 1 },
  }
  const iamRow = {
    snapshot_id: IAM_SNAPSHOT_ID, role_name: "payments-api", resource_type: "IAMRole", region: "eu-west-1",
    timestamp: "2026-09-27T09:41:10Z", reason: "Pre-remediation checkpoint", triggered_by: "remediation", status: "AVAILABLE",
  }

  /** A stateful fake of the two proxies: GET lists what exists; DELETE refuses (409) or removes the row. */
  function fakeBackend(opts: { refuse: boolean; pendingDelete?: Promise<void> }) {
    const rows = new Map<string, Record<string, unknown>>([[sgRow.snapshot_id, sgRow], [iamRow.snapshot_id, iamRow]])
    const calls: Array<{ url: string; method: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method ?? "GET").toUpperCase()
      calls.push({ url, method })
      if (method === "DELETE") {
        if (opts.pendingDelete) await opts.pendingDelete
        const id = decodeURIComponent(url.split("/").pop() || "")
        const path: ContainedPath = url.startsWith("/api/proxy/iam-roles/snapshots/") ? "iam_role_snapshot_delete" : "snapshot_delete"
        if (opts.refuse) return json(offBoundary409Body(path), 409)
        rows.delete(id)
        return json({ success: true, deleted: id })
      }
      if (url.startsWith("/api/proxy/iam-snapshots")) {
        return json({ snapshots: [...rows.values()].filter((r) => r.resource_type === "IAMRole") })
      }
      if (url.startsWith("/api/proxy/snapshots")) {
        return json({ snapshots: [...rows.values()].filter((r) => r.resource_type !== "IAMRole") })
      }
      return json({ detail: { code: "SPY_UNROUTED" } }, 599)
    }))
    return calls
  }

  const deleteButtonOf = (id: string) => within(screen.getByText(id).parentElement as HTMLElement).getByTitle("Delete snapshot") as HTMLButtonElement

  it("single delete of an IAM snapshot: 409 reason_code and message shown, row kept, spinner cleared, no success", async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const calls = fakeBackend({ refuse: true, pendingDelete: pending })
    render(<RecoveryTab />)
    await screen.findByText(IAM_SNAPSHOT_ID)
    expect(screen.queryByTestId("snapshot-delete-refused")).toBeNull()

    await act(async () => {
      fireEvent.click(deleteButtonOf(IAM_SNAPSHOT_ID))
    })
    // Positive control for the spinner assertion: while the request is in flight it spins.
    expect(deleteButtonOf(IAM_SNAPSHOT_ID).querySelector(".animate-spin")).not.toBeNull()
    await act(async () => {
      release()
    })

    const banner = await screen.findByTestId("snapshot-delete-refused")
    expect(banner.textContent).toContain(IAM_SNAPSHOT_ID)
    expect(banner.textContent).toContain("HTTP 409")
    expect(banner.textContent).toContain("off_boundary_mutation_refused")
    expect(banner.textContent).toContain(`iam_role_snapshot_delete: ${REASONS.iam_role_snapshot_delete}`)
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([`/api/proxy/iam-roles/snapshots/${IAM_SNAPSHOT_ID}`])
    // Row kept, spinner gone, button usable again, and nothing reads as success.
    expect(screen.getByText(IAM_SNAPSHOT_ID)).toBeTruthy()
    expect(deleteButtonOf(IAM_SNAPSHOT_ID).querySelector(".animate-spin")).toBeNull()
    expect(deleteButtonOf(IAM_SNAPSHOT_ID).disabled).toBe(false)
    expect(alertSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith(SUCCESS_PREFIX))).toEqual([])
    // Persistent: still there after a refresh of the list.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))
    })
    await screen.findByText(IAM_SNAPSHOT_ID)
    expect(screen.getByTestId("snapshot-delete-refused").textContent).toContain("off_boundary_mutation_refused")
  })

  it("single delete control: an accepted delete removes the row and shows no refusal", async () => {
    fakeBackend({ refuse: false })
    render(<RecoveryTab />)
    await screen.findByText(IAM_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(deleteButtonOf(IAM_SNAPSHOT_ID))
    })
    await waitFor(() => expect(screen.queryByText(IAM_SNAPSHOT_ID)).toBeNull())
    expect(screen.queryByTestId("snapshot-delete-refused")).toBeNull()
    expect(screen.getByText(SG_SNAPSHOT_ID)).toBeTruthy()
  })

  it("Delete All: every refusal listed with its code, both rows kept, no success alert", async () => {
    const calls = fakeBackend({ refuse: true })
    render(<RecoveryTab />)
    await screen.findByText(IAM_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete All$/ }))
    })
    const banner = await screen.findByTestId("snapshot-delete-refused")
    expect(banner.textContent).toContain(`${SG_SNAPSHOT_ID}: refused (HTTP 409, off_boundary_mutation_refused)`)
    expect(banner.textContent).toContain(`snapshot_delete: ${REASONS.snapshot_delete}`)
    expect(banner.textContent).toContain(`${IAM_SNAPSHOT_ID}: refused (HTTP 409, off_boundary_mutation_refused)`)
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(2)
    expect(screen.getByText(SG_SNAPSHOT_ID)).toBeTruthy()
    expect(screen.getByText(IAM_SNAPSHOT_ID)).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Delete All$/ })).toBeTruthy() // not stuck on "Deleting..."
    const alerts = alertSpy.mock.calls.map((c) => String(c[0]))
    expect(alerts.filter((m) => m.startsWith(SUCCESS_PREFIX))).toEqual([])
    expect(alerts).toEqual(["❌ 2 of 2 snapshot deletes refused (0 deleted)"])
  })

  it("Delete All control: when every delete succeeds the success alert is shown and no refusal", async () => {
    fakeBackend({ refuse: false })
    render(<RecoveryTab />)
    await screen.findByText(IAM_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete All$/ }))
    })
    await waitFor(() => expect(alertSpy).toHaveBeenCalled())
    expect(alertSpy.mock.calls.map((c) => String(c[0]))).toEqual([`${SUCCESS_PREFIX} Deleted 2 of 2 snapshots`])
    expect(screen.queryByTestId("snapshot-delete-refused")).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe("Orphan services tab: a refused quarantine transition is shown and the record keeps its phase", () => {
  const SYSTEM = "payments-prod"
  const RECORD_ID = "qr-7d1e"
  const RESOURCE = "payments-reconcile-fn"
  const record = {
    id: RECORD_ID, resourceName: RESOURCE, resourceType: "LambdaFunction", systemName: SYSTEM, phase: "PRE_CHECK",
    safetyScore: 82, safetyBreakdown: null, configBackup: null, initiatedBy: "user", createdAt: "2026-09-28T10:02:11Z",
    updatedAt: "2026-09-28T10:02:11Z", monitorStartedAt: "", quarantinedAt: "", deletedAt: "", restoredAt: "", history: [],
  }

  function fakeBackend(opts: { execute: "refuse" | "accept" }) {
    const calls: Array<{ url: string; method: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method ?? "GET").toUpperCase()
      calls.push({ url, method })
      if (url === `/api/proxy/orphan-services/${SYSTEM}`) {
        return json({ orphans: [], seasonal: [], newResources: [], summary: null })
      }
      if (url === `/api/proxy/quarantine/list/${SYSTEM}`) return json({ records: [record] })
      if (url === "/api/proxy/quarantine/execute") {
        return opts.execute === "refuse"
          ? json(offBoundary409Body("quarantine_execute"), 409)
          : json({ success: true, record: { ...record, phase: "QUARANTINE" } })
      }
      return json({ detail: { code: "SPY_UNROUTED" } }, 599)
    }))
    return calls
  }

  async function openRecord() {
    render(<OrphanServicesTab systemName={SYSTEM} />)
    const row = await screen.findByText(RESOURCE)
    await act(async () => {
      fireEvent.click(row)
    })
  }

  async function callOnClick(button: HTMLElement) {
    const props = Object.entries(button).find(([key]) => key.startsWith("__reactProps"))?.[1] as { onClick: (e?: unknown) => unknown }
    await act(async () => {
      await props.onClick({ stopPropagation() {}, preventDefault() {} })
    })
  }

  const listReads = (calls: Array<{ url: string }>) => calls.filter((c) => c.url === `/api/proxy/quarantine/list/${SYSTEM}`).length
  const quarantineButton = () => screen.getByRole("button", { name: /^Quarantine$/ }) as HTMLButtonElement

  it("backend 409 (hold released): reason_code and message shown, record kept in PRE_CHECK, no spinner, no re-read", async () => {
    holdMode.client = "all"
    const calls = fakeBackend({ execute: "refuse" })
    await openRecord()
    expect(screen.queryByTestId("quarantine-action-refused")).toBeNull()
    const readsBefore = listReads(calls)
    expect(quarantineButton().disabled).toBe(false)
    await act(async () => {
      fireEvent.click(quarantineButton())
    })
    const banner = await screen.findByTestId("quarantine-action-refused")
    expect(banner.textContent).toContain(`Quarantine refused for ${RECORD_ID} (HTTP 409, off_boundary_mutation_refused)`)
    expect(banner.textContent).toContain(`quarantine_execute: ${REASONS.quarantine_execute}`)
    expect(calls.filter((c) => c.url === "/api/proxy/quarantine/execute")).toHaveLength(1)
    // PRE_CHECK controls still rendered for the record, nothing spinning, and the list was not re-read as if it moved.
    expect(screen.getByRole("button", { name: /^Delete Now$/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeTruthy()
    expect(quarantineButton().querySelector(".animate-spin")).toBeNull()
    expect(quarantineButton().disabled).toBe(false)
    expect(listReads(calls)).toBe(readsBefore)
  })

  it("backend control: an accepted transition re-reads the list and shows no refusal", async () => {
    holdMode.client = "all"
    const calls = fakeBackend({ execute: "accept" })
    await openRecord()
    const readsBefore = listReads(calls)
    await act(async () => {
      fireEvent.click(quarantineButton())
    })
    await waitFor(() => expect(listReads(calls)).toBe(readsBefore + 1))
    expect(screen.queryByTestId("quarantine-action-refused")).toBeNull()
  })

  it("client-side hold (the request function's local 423): the hold's code and message are shown, nothing is sent", async () => {
    holdMode.client = "handler"
    const calls = fakeBackend({ execute: "accept" })
    await openRecord()
    expect(screen.queryByTestId("quarantine-action-refused")).toBeNull()
    await act(async () => {
      fireEvent.click(quarantineButton())
    })
    const banner = await screen.findByTestId("quarantine-action-refused")
    expect(banner.textContent).toContain(`Quarantine refused for ${RECORD_ID} (HTTP 423, QUARANTINE_HELD)`)
    expect(banner.textContent).toContain("Held: backend safety/recovery contract not yet proven for quarantine, restore or delete.")
    expect(calls.some((c) => c.url.startsWith("/api/proxy/quarantine/execute"))).toBe(false)
    expect(screen.getByRole("button", { name: /^Delete Now$/ })).toBeTruthy()
    expect(quarantineButton().querySelector(".animate-spin")).toBeNull()
  })

  it("compiled hold as shipped: the disabled control's handler shows the hold's code and message, nothing is sent", async () => {
    const calls = fakeBackend({ execute: "accept" })
    await openRecord()
    expect(quarantineButton().disabled).toBe(true)
    expect(screen.queryByTestId("quarantine-action-refused")).toBeNull()
    await callOnClick(quarantineButton())
    const banner = screen.getByTestId("quarantine-action-refused")
    expect(banner.textContent).toContain(`Quarantine refused for ${RECORD_ID} (QUARANTINE_HELD)`)
    expect(banner.textContent).toContain("Held: backend safety/recovery contract not yet proven for quarantine, restore or delete.")
    expect(calls.some((c) => c.method !== "GET")).toBe(false)
  })
})
