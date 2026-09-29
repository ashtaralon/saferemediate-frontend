/**
 * Refused legacy mutations are VISIBLE: a backend 409 (or the legacy hold's 423) on a snapshot delete or a quarantine
 * transition renders the refusal's code and message on screen and keeps it there, never reads as success, never removes
 * the row, and never leaves a spinner running. A 5xx, a timeout or a network failure is NOT a refusal: the write may have
 * committed, so the screen says "outcome unknown — re-checking" and re-reads the server's list.
 *
 * The proxies relay through the existing error contract (lib/server/proxy-error.ts): a 4xx forwards only the allowlisted
 * typed fields, a 5xx becomes backendError's 502 without the backend's exception text.
 *
 * The 409 bodies are the backend's literal construction (not a paraphrase):
 *   api/iam_gap_analysis.py delete_iam_snapshot (claude/cf01-lp-iam-snapshot-delete-hold, e00eb66b) and
 *   api/_off_boundary_http.py refuse_off_boundary_http (#2269):
 *     raise HTTPException(status_code=409, detail={"error": refusal.code.value, "reason_code": refusal.code.value,
 *                                                  "message": refusal.message, **refusal.details})
 *   where refusal = refuse_off_boundary_execution(path): message f"{path}: {CONTAINED_PATHS[path]}", details
 *   {"path": path, "contained": True, "still_available": ["analysis", "plan", "simulate", "rollback"], "detail": None}.
 * The 500 is api/iam_gap_analysis.py:670 `HTTPException(status_code=500, detail=f"Failed to delete snapshot: {str(e)}")`;
 * the 400 is api/quarantine.py's `HTTPException(status_code=400, detail=str(e))` over services/quarantine_engine.py's
 * `ValueError("Cannot restore a deleted resource")`.
 *
 * UI tests route the component's proxy calls through the REAL proxy route handlers, so what the screen parses is what
 * the proxy actually emits for each backend answer.
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import RecoveryTab from "@/components/snapshots-recovery-tab"
import { OrphanServicesTab } from "@/components/orphan-services-tab"
import { QuarantineCandidatesSection } from "@/components/iam-shared-roles-detail-view"
import { DELETE as iamSnapshotDelete } from "@/app/api/proxy/iam-roles/snapshots/[snapshotId]/route"
import { DELETE as snapshotDelete } from "@/app/api/proxy/snapshots/[snapshotId]/route"
import { POST as quarantineStartMonitor } from "@/app/api/proxy/quarantine/start-monitor/route"
import { POST as quarantineExecute } from "@/app/api/proxy/quarantine/execute/route"
import { POST as quarantineRestore } from "@/app/api/proxy/quarantine/restore/route"
import { DELETE as quarantineDelete } from "@/app/api/proxy/quarantine/delete/route"
import { ERROR_ORIGIN_HEADER } from "@/lib/server/proxy-error"
import type { ConsumerEvidence } from "@/lib/types"

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
  quarantine_delete:
    "DELETE /api/quarantine/delete terminates EC2 instances and permanently " +
    "deletes IAM roles/policies, Lambda functions, security groups and S3 " +
    "buckets (objects first) through ambient, unfenced SDK clients. The 30-day hold " +
    "is checked only once a record was quarantined, so a PRE_CHECK record " +
    "reaches the delete with no hold at all. Irreversible; no rollback.",
} as const
type ContainedPath = keyof typeof REASONS

/** The FastAPI 409 body as the backend sends it: HTTPException(detail=...) serializes as {"detail": {...}}. */
function backend409(path: ContainedPath) {
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
/** What the proxy forwards for that 409: only the allowlisted typed fields. */
function relayed409(path: ContainedPath) {
  return {
    detail: {
      error: "off_boundary_mutation_refused",
      reason_code: "off_boundary_mutation_refused",
      message: `${path}: ${REASONS[path]}`,
    },
    backendStatus: 409,
    origin: "backend",
  }
}
// botocore's str(e) as it lands in `detail=f"Failed to delete snapshot: {str(e)}"`.
const EXCEPTION_TEXT =
  "An error occurred (AccessDeniedException) when calling the DeleteItem operation: User: " +
  "arn:aws:sts::123456789012:assumed-role/cyntro-c1-web/i-0c4f9e2a7b1d3e5f6 is not authorized to perform: " +
  "dynamodb:DeleteItem on resource: arn:aws:dynamodb:eu-west-1:123456789012:table/cyntro-checkpoints"
const backend500 = { detail: `Failed to delete snapshot: ${EXCEPTION_TEXT}` }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" })

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
const alerts = () => alertSpy.mock.calls.map((c) => String(c[0]))
const successAlerts = () => alerts().filter((m) => m.startsWith(SUCCESS_PREFIX))

// ---------------------------------------------------------------------------------------------------------------------
describe("proxies relay through the typed error contract", () => {
  const params = (snapshotId: string) => ({ params: Promise.resolve({ snapshotId }) })
  const del = (id: string) => new NextRequest(`http://localhost/api/proxy/x/${id}`, { method: "DELETE" })
  const DELETES = [
    ["iam-roles/snapshots", iamSnapshotDelete, IAM_SNAPSHOT_ID, "iam_role_snapshot_delete", `/api/iam-roles/snapshots/${IAM_SNAPSHOT_ID}`],
    ["snapshots", snapshotDelete, SG_SNAPSHOT_ID, "snapshot_delete", `/api/snapshots/${SG_SNAPSHOT_ID}`],
  ] as const

  it.each(DELETES)("DELETE /api/proxy/%s/{id}: the 409 keeps its status, reason_code and message", async (_l, handler, id, path, backendPath) => {
    const backend = vi.fn(async () => json(backend409(path), 409))
    vi.stubGlobal("fetch", backend)
    const response = await handler(del(id), params(id))
    expect(response.status).toBe(409)
    expect(response.headers.get(ERROR_ORIGIN_HEADER)).toBe("backend")
    expect(await response.json()).toEqual(relayed409(path))
    expect(String((backend.mock.calls[0] as unknown[])[0]).endsWith(backendPath)).toBe(true)
  })

  it.each(DELETES)("DELETE /api/proxy/%s/{id}: a 500 with exception text becomes a generic 502 and leaks nothing", async (_l, handler, id) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(backend500, 500)))
    const response = await handler(del(id), params(id))
    const text = await response.text()
    expect(response.status).toBe(502)
    expect(JSON.parse(text)).toEqual({ error: "Backend answered HTTP 500", backendStatus: 500, origin: "proxy" })
    expect(response.headers.get(ERROR_ORIGIN_HEADER)).toBe("proxy")
    for (const leaked of ["AccessDenied", "arn:aws", "cyntro-checkpoints", "Failed to delete snapshot"]) {
      expect(text).not.toContain(leaked)
    }
  })

  it.each(DELETES)("DELETE /api/proxy/%s/{id}: an untyped 4xx is UNREADABLE, body and header both 'proxy'", async (_l, handler, id) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>404 Not Found</html>", { status: 404 })))
    const response = await handler(del(id), params(id))
    expect(response.status).toBe(404)
    const text = await response.text()
    expect(JSON.parse(text)).toMatchObject({ code: "UNREADABLE", backendStatus: 404, origin: "proxy" })
    expect(response.headers.get(ERROR_ORIGIN_HEADER)).toBe("proxy")
    expect(text).not.toContain("<html>")
  })

  it.each(DELETES)("DELETE /api/proxy/%s/{id}: a timeout is 504, never a 409-looking refusal", async (_l, handler, id) => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw abortError() }))
    const response = await handler(del(id), params(id))
    expect(response.status).toBe(504)
  })

  it("DELETE success still answers 200 with the backend's receipt (positive control for the error branch)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ success: true, deleted: IAM_SNAPSHOT_ID, timestamp: "2026-09-29T08:00:00+00:00" })))
    const response = await iamSnapshotDelete(del(IAM_SNAPSHOT_ID), params(IAM_SNAPSHOT_ID))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, deleted: IAM_SNAPSHOT_ID })
  })

  const body = (method: string, url: string) =>
    new NextRequest(`http://localhost${url}`, {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify({ recordId: "qr-7d1e", actor: "user" }),
    })

  it.each([
    ["start-monitor", "POST", quarantineStartMonitor, "quarantine_start_monitor"],
    ["execute", "POST", quarantineExecute, "quarantine_execute"],
    ["delete", "DELETE", quarantineDelete, "quarantine_delete"],
  ] as const)("/api/proxy/quarantine/%s: the backend 409 passes through once the FE hold is released", async (name, method, handler, path) => {
    holdMode.proxyReleased = true
    vi.stubGlobal("fetch", vi.fn(async () => json(backend409(path), 409)))
    const response = await handler(body(method, `/api/proxy/quarantine/${name}`))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(relayed409(path))
  })

  it("/api/proxy/quarantine/restore: a typed 400 keeps its status and message (restore is not held by the backend)", async () => {
    holdMode.proxyReleased = true
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "Cannot restore a deleted resource" }, 400)))
    const response = await quarantineRestore(body("POST", "/api/proxy/quarantine/restore"))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ detail: { message: "Cannot restore a deleted resource" }, backendStatus: 400, origin: "backend" })
  })

  it.each([
    ["restore", "POST", quarantineRestore],
    ["delete", "DELETE", quarantineDelete],
  ] as const)("/api/proxy/quarantine/%s: a 500 with exception text becomes a generic 502", async (name, method, handler) => {
    holdMode.proxyReleased = true
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: EXCEPTION_TEXT }, 500)))
    const response = await handler(body(method, `/api/proxy/quarantine/${name}`))
    const text = await response.text()
    expect(response.status).toBe(502)
    expect(text).not.toContain("arn:aws")
  })

  it("/api/proxy/quarantine/start-monitor with the FE hold in force answers its own 423 and sends nothing", async () => {
    const backend = vi.fn()
    vi.stubGlobal("fetch", backend)
    const response = await quarantineStartMonitor(body("POST", "/api/proxy/quarantine/start-monitor"))
    expect(response.status).toBe(423)
    expect(await response.json()).toMatchObject({ code: "QUARANTINE_HELD", origin: "proxy" })
    expect(backend).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe("Recovery tab: refused, unknown and partial deletes", () => {
  const sgRow = {
    snapshot_id: SG_SNAPSHOT_ID, sg_id: "sg-0a1b2c3d4e5f60718", sg_name: "payments-api-sg", vpc_id: "vpc-0c1d2e3f4a5b6c7d8",
    region: "eu-west-1", timestamp: "2026-09-28T14:15:02Z", reason: "Pre-remediation snapshot", triggered_by: "remediation",
    status: "AVAILABLE", rules_count: { inbound: 3, outbound: 1 },
  }
  const iamRow = {
    snapshot_id: IAM_SNAPSHOT_ID, role_name: "payments-api", resource_type: "IAMRole", region: "eu-west-1",
    timestamp: "2026-09-27T09:41:10Z", reason: "Pre-remediation checkpoint", triggered_by: "remediation", status: "AVAILABLE",
  }

  // How the backend answers a DELETE for each snapshot id. "*-committed" deletes the row AND fails the answer.
  type Behaviour = "accept" | "refuse" | "500-committed" | "500-not-committed" | "timeout-committed" | "network"

  /**
   * A stateful backend behind the REAL proxy routes. GET lists what exists (the IAM row appears in both source lists,
   * as the aggregate listing and the IAM listing both carry IAM snapshots); the component's DELETE goes through the
   * proxy handler, whose fetch reaches the backend branch below.
   */
  function fakeBackend(behaviour: Record<string, Behaviour>, opts: { pendingDelete?: Promise<void> } = {}) {
    const rows = new Map<string, Record<string, unknown>>([[sgRow.snapshot_id, sgRow], [iamRow.snapshot_id, iamRow]])
    const calls: Array<{ url: string; method: string }> = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      const method = String(init?.method ?? "GET").toUpperCase()
      calls.push({ url, method })
      if (/^https?:\/\//.test(url)) {
        // Backend (reached only from inside a proxy handler).
        const id = decodeURIComponent(url.split("/").pop() || "")
        const path: ContainedPath = url.includes("/api/iam-roles/snapshots/") ? "iam_role_snapshot_delete" : "snapshot_delete"
        const b = behaviour[id] ?? "accept"
        if (b === "refuse") return json(backend409(path), 409)
        if (b === "500-not-committed") return json(backend500, 500)
        rows.delete(id)
        if (b === "500-committed") return json(backend500, 500)
        if (b === "timeout-committed") throw abortError()
        return json({ success: true, deleted: id, timestamp: "2026-09-29T08:00:00+00:00" })
      }
      if (method === "DELETE") {
        if (opts.pendingDelete) await opts.pendingDelete
        const id = decodeURIComponent(url.split("/").pop() || "")
        if (behaviour[id] === "network") throw new TypeError("Failed to fetch")
        const req = new NextRequest(`http://localhost${url}`, { method: "DELETE" })
        const params = { params: Promise.resolve({ snapshotId: id }) }
        return url.startsWith("/api/proxy/iam-roles/snapshots/") ? iamSnapshotDelete(req, params) : snapshotDelete(req, params)
      }
      if (url.startsWith("/api/proxy/iam-snapshots")) {
        return json({ snapshots: [...rows.values()].filter((r) => r.resource_type === "IAMRole") })
      }
      if (url.startsWith("/api/proxy/snapshots")) return json({ snapshots: [...rows.values()] })
      return json({ detail: { code: "SPY_UNROUTED" } }, 599)
    }
    vi.stubGlobal("fetch", vi.fn(fetchImpl))
    return { calls, rows }
  }

  const deleteButtonOf = (id: string) =>
    within(screen.getAllByText(id)[0].parentElement as HTMLElement).getByTitle("Delete snapshot") as HTMLButtonElement
  const componentDeletes = (calls: Array<{ url: string; method: string }>) =>
    calls.filter((c) => c.method === "DELETE" && c.url.startsWith("/api/proxy/")).map((c) => c.url)

  it("single delete of an IAM snapshot: typed 409 shown as 'not deleted', row kept, spinner cleared, no success", async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const { calls } = fakeBackend({ [IAM_SNAPSHOT_ID]: "refuse" }, { pendingDelete: pending })
    render(<RecoveryTab />)
    await screen.findAllByText(IAM_SNAPSHOT_ID)
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
    expect(banner.textContent).toContain("These snapshots were not deleted")
    expect(banner.textContent).toContain(`${IAM_SNAPSHOT_ID}: refused (HTTP 409, off_boundary_mutation_refused)`)
    expect(banner.textContent).toContain(`iam_role_snapshot_delete: ${REASONS.iam_role_snapshot_delete}`)
    expect(screen.queryByTestId("snapshot-delete-unknown")).toBeNull()
    expect(componentDeletes(calls)).toEqual([`/api/proxy/iam-roles/snapshots/${IAM_SNAPSHOT_ID}`])
    expect(screen.getAllByText(IAM_SNAPSHOT_ID).length).toBeGreaterThan(0)
    expect(deleteButtonOf(IAM_SNAPSHOT_ID).querySelector(".animate-spin")).toBeNull()
    expect(deleteButtonOf(IAM_SNAPSHOT_ID).disabled).toBe(false)
    expect(successAlerts()).toEqual([])
    // Persistent: still there after a refresh of the list.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))
    })
    await screen.findAllByText(IAM_SNAPSHOT_ID)
    expect(screen.getByTestId("snapshot-delete-refused").textContent).toContain("off_boundary_mutation_refused")
  })

  it("single delete control: an accepted delete removes the row and shows neither banner", async () => {
    fakeBackend({})
    render(<RecoveryTab />)
    await screen.findByText(SG_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(deleteButtonOf(SG_SNAPSHOT_ID))
    })
    await waitFor(() => expect(screen.queryByText(SG_SNAPSHOT_ID)).toBeNull())
    expect(screen.queryByTestId("snapshot-delete-refused")).toBeNull()
    expect(screen.queryByTestId("snapshot-delete-unknown")).toBeNull()
  })

  it.each([
    ["a backend 500 after the delete committed", "500-committed", "HTTP 502", true],
    ["a backend 500 that did not commit", "500-not-committed", "HTTP 502", false],
    ["a proxy timeout after the delete committed", "timeout-committed", "HTTP 504", true],
    ["a browser network failure", "network", "request failed: Failed to fetch", false],
  ] as const)("single delete, %s: 'outcome unknown — re-checking', the list is re-read, never 'not deleted'", async (_l, b, detail, committed) => {
    const { calls } = fakeBackend({ [SG_SNAPSHOT_ID]: b })
    render(<RecoveryTab />)
    await screen.findByText(SG_SNAPSHOT_ID)
    const listReadsBefore = calls.filter((c) => c.method === "GET" && c.url.startsWith("/api/proxy/snapshots")).length
    await act(async () => {
      fireEvent.click(deleteButtonOf(SG_SNAPSHOT_ID))
    })
    const banner = await screen.findByTestId("snapshot-delete-unknown")
    expect(banner.textContent).toContain("outcome unknown — re-checking")
    expect(banner.textContent).toContain(`${SG_SNAPSHOT_ID}: outcome unknown`)
    expect(banner.textContent).toContain(detail)
    expect(screen.queryByTestId("snapshot-delete-refused")).toBeNull()
    expect(screen.queryByText(/were not deleted/)).toBeNull()
    expect(banner.textContent).not.toContain("AccessDenied")
    // Re-read: the list reflects what the server now holds.
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET" && c.url.startsWith("/api/proxy/snapshots")).length).toBe(listReadsBefore + 1),
    )
    if (committed) await waitFor(() => expect(screen.queryByText(SG_SNAPSHOT_ID)).toBeNull())
    else expect(await screen.findByText(SG_SNAPSHOT_ID)).toBeTruthy()
    expect(successAlerts()).toEqual([])
  })

  it("Delete All, one refused and one accepted: no success, the r-of-N text, refused row stays, accepted row gone", async () => {
    const { calls } = fakeBackend({ [IAM_SNAPSHOT_ID]: "refuse", [SG_SNAPSHOT_ID]: "accept" })
    render(<RecoveryTab />)
    await screen.findByText(SG_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete All$/ }))
    })
    const banner = await screen.findByTestId("snapshot-delete-refused")
    expect(banner.textContent).toContain(`${IAM_SNAPSHOT_ID}: refused (HTTP 409, off_boundary_mutation_refused)`)
    expect(banner.textContent).not.toContain(SG_SNAPSHOT_ID)
    // The IAM row came from both source lists; it is listed, deleted and reported once.
    expect(componentDeletes(calls).sort()).toEqual([`/api/proxy/iam-roles/snapshots/${IAM_SNAPSHOT_ID}`, `/api/proxy/snapshots/${SG_SNAPSHOT_ID}`])
    expect(banner.querySelectorAll("p").length).toBe(2) // header + one line
    expect(alerts()).toEqual(["❌ 1 of 2 snapshot deletes refused (1 deleted)"])
    expect(successAlerts()).toEqual([])
    await waitFor(() => expect(screen.queryByText(SG_SNAPSHOT_ID)).toBeNull())
    expect(screen.getAllByText(IAM_SNAPSHOT_ID).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /^Delete All$/ })).toBeTruthy() // not stuck on "Deleting..."
  })

  it("Delete All, every delete refused: both listed, both rows kept, no success alert", async () => {
    fakeBackend({ [IAM_SNAPSHOT_ID]: "refuse", [SG_SNAPSHOT_ID]: "refuse" })
    render(<RecoveryTab />)
    await screen.findByText(SG_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete All$/ }))
    })
    const banner = await screen.findByTestId("snapshot-delete-refused")
    expect(banner.textContent).toContain(`${SG_SNAPSHOT_ID}: refused (HTTP 409, off_boundary_mutation_refused)`)
    expect(banner.textContent).toContain(`snapshot_delete: ${REASONS.snapshot_delete}`)
    expect(banner.textContent).toContain(`${IAM_SNAPSHOT_ID}: refused (HTTP 409, off_boundary_mutation_refused)`)
    expect(screen.getByText(SG_SNAPSHOT_ID)).toBeTruthy()
    expect(alerts()).toEqual(["❌ 2 of 2 snapshot deletes refused (0 deleted)"])
  })

  it("Delete All, one outcome unknown: listed as unknown (not refused), re-read shows the committed row gone", async () => {
    fakeBackend({ [IAM_SNAPSHOT_ID]: "accept", [SG_SNAPSHOT_ID]: "500-committed" })
    render(<RecoveryTab />)
    await screen.findByText(SG_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete All$/ }))
    })
    const banner = await screen.findByTestId("snapshot-delete-unknown")
    expect(banner.textContent).toContain(`${SG_SNAPSHOT_ID}: outcome unknown (HTTP 502`)
    expect(screen.queryByTestId("snapshot-delete-refused")).toBeNull()
    expect(alerts()).toEqual(["❌ 0 of 2 snapshot deletes refused (1 deleted); 1 outcome unknown — re-checked"])
    await waitFor(() => expect(screen.queryByText(SG_SNAPSHOT_ID)).toBeNull())
  })

  it("Delete All control: when every delete succeeds the rows are gone after the re-read and the success alert shows", async () => {
    fakeBackend({})
    render(<RecoveryTab />)
    await screen.findByText(SG_SNAPSHOT_ID)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete All$/ }))
    })
    await waitFor(() => expect(alertSpy).toHaveBeenCalled())
    expect(alerts()).toEqual([`${SUCCESS_PREFIX} Deleted 2 of 2 snapshots`])
    await waitFor(() => expect(screen.queryByText(SG_SNAPSHOT_ID)).toBeNull())
    expect(screen.queryByText(IAM_SNAPSHOT_ID)).toBeNull()
    expect(screen.getByText("No snapshots yet")).toBeTruthy()
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

  /** The execute call goes through the REAL proxy route; `execute` is what the backend behind it answers. */
  function fakeBackend(opts: { execute: "refuse" | "accept" | "500" }) {
    holdMode.proxyReleased = true
    const calls: Array<{ url: string; method: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method ?? "GET").toUpperCase()
      calls.push({ url, method })
      if (/^https?:\/\/.*\/api\/quarantine\/execute$/.test(url)) {
        if (opts.execute === "refuse") return json(backend409("quarantine_execute"), 409)
        if (opts.execute === "500") return json({ detail: EXCEPTION_TEXT }, 500)
        return json({ success: true, record: { ...record, phase: "QUARANTINE" } })
      }
      if (url === `/api/proxy/orphan-services/${SYSTEM}`) {
        return json({ orphans: [], seasonal: [], newResources: [], summary: null })
      }
      if (url === `/api/proxy/quarantine/list/${SYSTEM}`) return json({ records: [record] })
      if (url === "/api/proxy/quarantine/execute") {
        return quarantineExecute(new NextRequest(`http://localhost${url}`, { method, body: init?.body as string, headers: { "content-type": "application/json" } }))
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
    expect(screen.getByRole("button", { name: /^Delete Now$/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeTruthy()
    expect(quarantineButton().querySelector(".animate-spin")).toBeNull()
    expect(quarantineButton().disabled).toBe(false)
    expect(listReads(calls)).toBe(readsBefore)
  })

  it("backend 500 (hold released): outcome unknown — re-checking, the records are re-read, no exception text", async () => {
    holdMode.client = "all"
    const calls = fakeBackend({ execute: "500" })
    await openRecord()
    const readsBefore = listReads(calls)
    await act(async () => {
      fireEvent.click(quarantineButton())
    })
    const banner = await screen.findByTestId("quarantine-action-refused")
    expect(banner.textContent).toContain(`Quarantine outcome unknown for ${RECORD_ID} — re-checking: (HTTP 502, HTTP_502)`)
    expect(banner.textContent).not.toContain("refused")
    expect(banner.textContent).not.toContain("arn:aws")
    await waitFor(() => expect(listReads(calls)).toBe(readsBefore + 1))
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
    expect(calls.some((c) => c.url.includes("/quarantine/execute"))).toBe(false)
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

// ---------------------------------------------------------------------------------------------------------------------
describe("IAM shared-roles quarantine candidates: a refused delete shows its reason_code and message", () => {
  const candidate = {
    consumer_id: "arn:aws:lambda:eu-west-1:123456789012:function:payments-reconcile-fn", consumer_type: "LambdaFunction",
    consumer_name: "payments-reconcile-fn", system_name: "payments-prod", observed_actions: [], allowed_intersection: [],
    blockers: [], evidence_state: "OBSERVED", last_observed_at: "2026-05-02T11:20:00Z",
  } as unknown as ConsumerEvidence

  /** Pre-check answers a record; the delete goes through the REAL proxy route to a backend answering `del`. */
  function fakeBackend(del: "refuse" | "accept") {
    holdMode.client = "all"
    holdMode.proxyReleased = true
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)
      if (/^https?:\/\/.*\/api\/quarantine\/delete$/.test(url)) {
        return del === "refuse" ? json(backend409("quarantine_delete"), 409) : json({ success: true, record: { id: "qr-7d1e", phase: "DELETED" } })
      }
      if (url === "/api/proxy/quarantine/pre-check") return json({ recordId: "qr-7d1e", safetyScore: { score: 82 }, phase: "PRE_CHECK" })
      if (url === "/api/proxy/quarantine/delete") {
        return quarantineDelete(new NextRequest(`http://localhost${url}`, { method: "DELETE", body: init?.body as string, headers: { "content-type": "application/json" } }))
      }
      if (url.startsWith("/api/proxy/quarantine/list/")) return json({ records: [] })
      return json({ detail: { code: "SPY_UNROUTED" } }, 599)
    }))
    return calls
  }

  async function confirmIn(trigger: HTMLElement, name: RegExp) {
    await act(async () => {
      fireEvent.click(trigger)
    })
    const dialog = await screen.findByRole("alertdialog")
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name }))
    })
  }

  const EXPECTED = `Delete refused (HTTP 409, off_boundary_mutation_refused): quarantine_delete: ${REASONS.quarantine_delete}`

  it("row Delete: the refusal text replaces the bare status, and the row is not marked Deleted", async () => {
    const calls = fakeBackend("refuse")
    render(<QuarantineCandidatesSection candidates={[candidate]} thresholdDays={90} />)
    await confirmIn((await screen.findAllByRole("button", { name: /^Delete$/, hidden: true }))[0], /^Delete$/)
    expect(await screen.findByText(EXPECTED)).toBeTruthy()
    expect(calls).toContain("/api/proxy/quarantine/delete")
    expect(screen.queryByText(/^Deleted$/)).toBeNull()
    expect(screen.queryByText("Delete failed (409)")).toBeNull()
  })

  it("row Delete control: an accepted delete marks the row Deleted with no error", async () => {
    fakeBackend("accept")
    render(<QuarantineCandidatesSection candidates={[candidate]} thresholdDays={90} />)
    await confirmIn((await screen.findAllByRole("button", { name: /^Delete$/, hidden: true }))[0], /^Delete$/)
    expect(await screen.findByText(/^Deleted$/)).toBeTruthy()
    expect(screen.queryByText(/Delete refused/)).toBeNull()
  })

  it("bulk Delete: the failure line carries the reason_code and message", async () => {
    fakeBackend("refuse")
    render(<QuarantineCandidatesSection candidates={[candidate]} thresholdDays={90} />)
    await act(async () => {
      fireEvent.click(await screen.findByRole("checkbox", { name: /Select payments-reconcile-fn/, hidden: true }))
    })
    await confirmIn(screen.getByRole("button", { name: /^Delete 1$/, hidden: true }), /^Delete 1$/)
    expect(await screen.findByText(`1 of 1 failed: payments-reconcile-fn: ${EXPECTED}`)).toBeTruthy()
    expect(screen.queryByText("1 of 1 failed: payments-reconcile-fn: delete 409")).toBeNull()
  })
})
