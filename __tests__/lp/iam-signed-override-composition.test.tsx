/// <reference types="vitest/globals" />
/**
 * MOUNTED composition: the real LeastPrivilegeTab, the real
 * IAMPermissionAnalysisModal and the real (frozen) OverrideModalShared, driven
 * through the actual DOM.
 *
 * WHAT IS REAL. Every component, every guard, the real canonical-readiness
 * classifier, the real signed-plan parser and the real selection comparison.
 * The payloads are the PRODUCER'S OWN serialization, captured verbatim from the
 * isolated local fixture preview (see __fixtures__/lp-issues-readiness.json
 * `_provenance`).
 *
 * WHAT IS FAKED. Physical HTTP only: one `fetch` router returns those captured
 * bodies and records every request. Nothing announces a verdict on the
 * product's behalf -- no mocked guard, classifier, parser or supplier. The
 * forward request the positive must reach is
 * `POST /api/proxy/cyntro/remediate`, and it is asserted by its REQUEST BODY
 * and call count, not by a callback.
 *
 * WHY THE CLOCK MOVES. The canonical package carries a 30-second TTL, so the
 * package a render holds cannot be what a confirmation relies on. The >30s case
 * advances the system clock past it, proves confirm is refused, proves the
 * explicit read renews it, and proves a SEPARATE click is required.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as React from "react"

import LeastPrivilegeTab from "@/components/LeastPrivilegeTab"
import { AccountScopeProvider } from "@/lib/account-scope-context"
import bundle from "./__fixtures__/lp-issues-readiness.json"

// Framework plumbing only: the App Router hooks the real scope provider reads.
// No product logic is mocked here.
vi.mock("next/navigation", () => ({
  usePathname: () => "/least-privilege",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(
    "customer_id=fixture-webshop&account_id=111111111111&system=fixture-shop",
  ),
}))

/** The mounted tree, so a test can really unmount it mid-read. */
let mounted: ReturnType<typeof render> | null = null

/** Mount the real parent inside the real scope provider. */
function mountTab() {
  mounted = render(
    <AccountScopeProvider>
      <LeastPrivilegeTab systemName={SYSTEM} />
    </AccountScopeProvider>,
  )
  return mounted
}

const ROLE = "fixture-web-role"
const SYSTEM = "fixture-shop"
const REMEDIATE = "/api/proxy/cyntro/remediate"
const THE_FIVE = [
  "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query",
  "sqs:ReceiveMessage", "sqs:SendMessage",
]
const USED_AND_PROTECTED = [
  "s3:DeleteObject", "s3:GetObject", "s3:ListBucket", "s3:PutObject",
  "iam:PassRole", "kms:Decrypt", "kms:Encrypt",
]

type Recorded = { url: string; method: string; body: any }

/** Requests the mounted tree actually made. */
let recorded: Recorded[] = []
/** Set by a test to make the next /issues read fail, hang, or change scope. */
let issuesBehaviour: "ok" | "fail" | "defer" | "defer-once" = "ok"
let deferredIssues: Array<() => void> = []
/** Applied to the /issues body a test is about to be served (re-probes included). */
let issuesMutator: ((payload: any) => void) | null = null
/** Applied to the signed plan body, to drive the parser's own refusals. */
let planMutator: ((plan: any) => void) | null = null

const TTL_MS = 30_000

/** The captured producer payload, re-stamped to the CURRENT fake clock. */
function issuesPayloadNow() {
  const payload = structuredClone(bundle.issues) as any
  const probed = new Date(Date.now())
  payload.readiness.probed_at = probed.toISOString()
  payload.readiness.expires_at = new Date(probed.getTime() + TTL_MS).toISOString()
  if (issuesMutator) issuesMutator(payload)
  return payload
}

/** The captured signed plan, with only its `expires_at` moved into the future. */
function planPayloadNow(expiresInMs = 15 * 60_000) {
  const payload = structuredClone(bundle.breakGlassPlan) as any
  payload.plan.issued_at = new Date(Date.now()).toISOString()
  payload.plan.expires_at = new Date(Date.now() + expiresInMs).toISOString()
  if (planMutator) planMutator(payload.plan)
  return payload
}

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function installFetch() {
  const router = vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input)
    const method = (init?.method ?? "GET").toUpperCase()
    let body: any
    if (init?.body) {
      try { body = JSON.parse(init.body) } catch { body = init.body }
    }
    recorded.push({ url, method, body })

    if (url.includes("/least-privilege/issues")) {
      if (issuesBehaviour === "fail") return json({ detail: "boom" }, 503)
      if (issuesBehaviour === "defer" || issuesBehaviour === "defer-once") {
        // "defer-once" holds only the NEXT read; anything the apply path reads
        // afterwards answers normally, so a hang is a product finding rather
        // than the harness deadlocking itself.
        if (issuesBehaviour === "defer-once") issuesBehaviour = "ok"
        return new Promise<Response>(resolve => {
          deferredIssues.push(() => resolve(json(issuesPayloadNow())))
        })
      }
      return json(issuesPayloadNow())
    }
    if (url.includes("/gap-analysis")) return json(bundle.gapAnalysis)
    if (url.includes("/least-privilege/simulate-fix")) return json(bundle.simulateFix)
    if (url.includes("/least-privilege/break-glass-plan")) return json(planPayloadNow())
    if (url.includes(REMEDIATE)) {
      // The PROXY's envelope, matching app/api/proxy/cyntro/remediate/route.ts:
      // the dialog's `verifiedApplyOutcome` reads `raw_response.{success,
      // blocked, mutation_boundary.allowed}`, so a bare backend body would be
      // an APPLY_OUTCOME_UNCONFIRMED -- which is what the mounted run showed
      // before this was corrected.
      const backend = {
        success: true, blocked: false, role_name: ROLE, system_name: SYSTEM, aws_writes: 1,
        aws_calls: ["put_role_policy:fixture-web-app"],
        snapshot_id: "IAMRole-fixture-web-role-mounted01",
        journal_event_id: "mj_mounted0001",
        operation_id: "mounted-op-0001", operation_recorded: true,
        operation_state: "VERIFIED", recovery_required: [],
        mutation_boundary: {
          gate: "iam_mutation_boundary", code: "PERMIT", allowed: true, failures: [],
          message: "mutation applied via operator override and canonical boundary",
        },
        message: "mutation applied via operator override and canonical boundary",
        permissions_removed: THE_FIVE.length,
        rollback_available: true,
      }
      return json({
        success: true,
        rollback_available: true,
        snapshot_id: backend.snapshot_id,
        permissions_removed: THE_FIVE.length,
        steps: [],
        summary: {
          before_total: 12, after_total: 7, reduction: THE_FIVE.length,
          unused_removed: THE_FIVE.length, reduction_percentage: 41.7,
        },
        raw_response: backend,
      })
    }
    // Everything else this page touches: answer empty rather than 404-noise.
    return json({})
  })
  vi.stubGlobal("fetch", router)
  return router
}

function remediateCalls() {
  return recorded.filter(r => r.url.includes(REMEDIATE))
}

/** Open the role's Preview, then prepare the exact signed override plan. */
async function openPreviewAndPreparePlan() {
  mountTab()
  const previews = await waitFor(() => {
    const found = screen.getAllByRole("button", { name: /^Preview$/ })
    expect(found.length).toBeGreaterThan(0)
    return found
  }, { timeout: 5000 })
  await act(async () => { fireEvent.click(previews[0]) })
  const remediateAnyway = await waitFor(
    () => screen.getByRole("button", { name: "Remediate Anyway" }),
    { timeout: 5000 },
  )
  await act(async () => { fireEvent.click(remediateAnyway) })
  // The signed plan panel is the dialog's own details slot.
  await waitFor(() => expect(screen.getByTestId("refresh-current-readiness")).toBeInTheDocument(),
    { timeout: 5000 })
}

/** Fill the confirmation form the shared modal owns. */
async function completeForm() {
  const name = screen.getByPlaceholderText("e.g. Alice Operator")
  const rationale = screen.getByPlaceholderText(/Confirmed with @platform-team/i)
  const ack = screen.getByRole("checkbox") as HTMLInputElement
  await act(async () => { fireEvent.change(name, { target: { value: "Claude Permissions Mounted QA" } }) })
  await act(async () => { fireEvent.change(rationale, { target: { value: "Root130 mounted composition control" } }) })
  // The acknowledgement is a CONTROLLED checkbox: under happy-dom a synthetic
  // click does not drive its onChange (measured), so change is fired directly.
  await act(async () => { fireEvent.change(ack, { target: { checked: true } }) })
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true)
}

/** The dialog's own published readiness state, verbatim. */
function readingState() {
  return screen.getByTestId("current-readiness-state").textContent ?? ""
}

/** The read control's label, which carries the spinner. */
function readControl() {
  return screen.getByTestId("refresh-current-readiness") as HTMLButtonElement
}

const NO_READING_HELD = "The readiness facts shown above are from when this view loaded."
const READING_IN_FLIGHT = "Reading current readiness\u2026"

/**
 * The REAL onClick React attached to a control, so a control can reach the
 * product's caller boundary without the DOM's own `disabled` short-circuit.
 *
 * WHY THIS IS NECESSARY, and what it is NOT. A disabled button drops its
 * click, so `fireEvent.click` on a refused confirmation proves only that the
 * BUTTON was disabled -- never that the submit path would have refused. A
 * mutant removing every caller-side reading gate left this suite fully green
 * until this existed. Nothing is stubbed here: the callback is the frozen
 * shared modal's own `handleSubmit`, which builds the real lineage and calls
 * the real `onSharedSubmit`.
 */
function reactOnClick(el: Element): (ev: any) => any {
  const key = Object.keys(el).find(k => k.startsWith("__reactProps$"))
  if (!key) throw new Error("no React props on this element")
  const onClick = (el as any)[key].onClick
  if (typeof onClick !== "function") throw new Error("this element has no onClick")
  return onClick
}

function confirmButton() {
  // Distinct from the dialog's "Remediate Anyway" ENTRY point, which differs
  // only in case; an /i regex matches both.
  return screen.getByRole("button", { name: "Remediate anyway" })
}

beforeEach(() => {
  mounted = null
  recorded = []
  deferredIssues = []
  issuesBehaviour = "ok"
  issuesMutator = null
  planMutator = null
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date("2026-09-18T08:00:00.000Z"))
  installFetch()
})

afterEach(() => {
  // Release anything a control left in flight, so a failure here cannot cascade
  // into the next control as a timeout.
  for (const release of deferredIssues) { try { release() } catch { /* already settled */ } }
  deferredIssues = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("mounted signed-override confirmation", () => {
  it("refuses confirmation on an expired opening package, and the read control is still reachable", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // Past the producer's 30-second window: the package this render opened with
    // is stale. This is the deadlock case -- the read control must NOT be gated
    // by that expiry.
    await act(async () => { vi.setSystemTime(Date.now() + TTL_MS + 1_000) })

    expect(screen.getByTestId("refresh-current-readiness")).toBeEnabled()
    expect(confirmButton()).toBeDisabled()
    expect(remediateCalls()).toHaveLength(0)
  })

  it("an explicit read then a SEPARATE confirmation reaches exactly one forward request", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()
    await act(async () => { vi.setSystemTime(Date.now() + TTL_MS + 1_000) })
    expect(confirmButton()).toBeDisabled()

    // PHASE ONE: the explicit read. It must not submit anything by itself.
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })
    await waitFor(() => expect(screen.getByTestId("current-readiness-state"))
      .toHaveTextContent(/Current facts read/i))
    expect(remediateCalls()).toHaveLength(0)

    // PHASE TWO: a separate click.
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    await act(async () => { fireEvent.click(confirmButton()) })

    await waitFor(() => expect(remediateCalls()).toHaveLength(1), { timeout: 5000 })
    const call = remediateCalls()[0]
    expect(call.method).toBe("POST")
    expect(call.body.role_name).toBe(ROLE)
    expect(call.body.dry_run).toBe(false)
    expect(call.body.force).toBe(true)
    expect(call.body.plan_token).toBe(bundle.breakGlassPlan.plan.plan_token)
    expect([...call.body.permissions_to_remove].sort()).toEqual([...THE_FIVE].sort())
    // The used and held-by-policy actions are never in the forward body.
    for (const kept of USED_AND_PROTECTED) {
      expect(call.body.permissions_to_remove).not.toContain(kept)
    }
    expect(call.body.override_lineage?.rationale).toContain("Root130")
    expect(call.body.override_lineage?.rollback_plan_acknowledged).toBe(true)
    // Terminal UI, in the product's OWN verified wording (it builds this text
    // itself from the operation record; it is not the backend's message).
    await waitFor(() => expect(
      screen.getAllByText(/Operation mounted-op-0001: VERIFIED at AWS \(1 write\)/i).length,
    ).toBeGreaterThan(0))
    expect(screen.getAllByText(/Removed 5 unused permissions from fixture-web-role/i).length)
      .toBeGreaterThan(0)
    expect(screen.getAllByText(/Snapshot: IAMRole-fixture-web-role-mounted01/i).length)
      .toBeGreaterThan(0)
  })

  it("duplicate confirmation clicks cannot become two forward requests", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())

    const button = confirmButton()
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(remediateCalls().length).toBeGreaterThan(0))
    expect(remediateCalls()).toHaveLength(1)
  })

  it("a failed read leaves the confirmation refused and sends nothing", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()
    issuesBehaviour = "fail"
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })
    await waitFor(() => expect(screen.getByTestId("current-readiness-state"))
      .toHaveTextContent(/READINESS_REPROBE_FAILED/))
    expect(confirmButton()).toBeDisabled()
    expect(remediateCalls()).toHaveLength(0)
  })

  it("a read that resolves after the override dialog was cancelled arms nothing", async () => {
    // NARROW AND LABELLED AS SUCH: Cancel dismisses the OVERRIDE DIALOG only --
    // the review behind it stays open, still offering "Remediate Anyway".
    // Actual review close and reopen is the control below.
    await openPreviewAndPreparePlan()
    await completeForm()
    issuesBehaviour = "defer"
    await act(async () => { fireEvent.click(readControl()) })
    expect(deferredIssues).toHaveLength(1)

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ })) })
    expect(screen.queryByTestId("refresh-current-readiness")).toBeNull()
    issuesBehaviour = "ok"
    await act(async () => { deferredIssues[0]() })

    // Nothing was submitted. What the reopened dialog then shows is MEASURED,
    // not assumed: the review behind the dialog never closed, so that read is
    // still owned by it and DOES publish. The reading is therefore standing --
    // and the confirmation is nevertheless refused, because reopening clears
    // the operator identity the audit lineage requires. That is a form
    // refusal, not a readiness one, and this control claims only that.
    expect(remediateCalls()).toHaveLength(0)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remediate Anyway" }))
    })
    await waitFor(() => expect(screen.getByTestId("refresh-current-readiness")).toBeInTheDocument())
    expect(readingState()).toContain("Current facts read")
    expect((screen.getByPlaceholderText("e.g. Alice Operator") as HTMLInputElement).value).toBe("")
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  it("a read resolving after the REVIEW was closed and reopened arms nothing", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()
    issuesBehaviour = "defer"
    await act(async () => { fireEvent.click(readControl()) })
    expect(deferredIssues).toHaveLength(1)

    // Close the REVIEW itself, not the override dialog: this is the analysis
    // modal's own Close, which clears the open-review identity.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Close$/ })) })
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remediate Anyway" })).toBeNull())

    // Reopen the same role and arm a fresh signed plan.
    issuesBehaviour = "ok"
    const previews = screen.getAllByRole("button", { name: /^Preview$/ })
    await act(async () => { fireEvent.click(previews[0]) })
    const entry = await waitFor(() => screen.getByRole("button", { name: "Remediate Anyway" }),
      { timeout: 5000 })
    await act(async () => { fireEvent.click(entry) })
    await waitFor(() => expect(screen.getByTestId("refresh-current-readiness")).toBeInTheDocument(),
      { timeout: 5000 })
    await completeForm()

    // NOW the old read completes, into a review that is not the one it was
    // taken for.
    await act(async () => { deferredIssues[0]() })

    expect(readingState()).toContain(NO_READING_HELD)
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  it("an expired signed plan refuses even with current readiness read", async () => {
    mountTab()
    const previews = await waitFor(() => screen.getAllByRole("button", { name: /^Preview$/ }),
      { timeout: 5000 })
    await act(async () => { fireEvent.click(previews[0]) })
    const remediateAnyway = await waitFor(
      () => screen.getByRole("button", { name: "Remediate Anyway" }), { timeout: 5000 })
    await act(async () => { fireEvent.click(remediateAnyway) })
    await waitFor(() => expect(screen.getByTestId("refresh-current-readiness")).toBeInTheDocument(),
      { timeout: 5000 })
    await completeForm()
    await act(async () => { fireEvent.click(readControl()) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    // Captured while the plan is still live, so the submit path can be reached
    // after it expires: the DOM's own `disabled` would otherwise drop the click
    // and prove only that the button was disabled.
    const submit = reactOnClick(confirmButton())

    // The plan's own 15-minute window elapses while the readiness stays fresh.
    // The dialog re-evaluates on its 1s plan clock, so that tick is advanced
    // EXPLICITLY -- a waitFor here passes or fails on whether an interval
    // happened to land inside the poll window.
    await act(async () => {
      vi.setSystemTime(Date.now() + 16 * 60_000)
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(confirmButton()).toBeDisabled()
    expect(document.body.textContent).toContain("PLAN_EXPIRED")

    // And the submit path refuses it too, by name.
    await act(async () => { await submit({ preventDefault() {}, stopPropagation() {} }) })
    expect(remediateCalls()).toHaveLength(0)
    expect(document.body.textContent).toContain("PLAN_EXPIRED")
  })

  it("ordinary Apply stays held on the same payload", async () => {
    mountTab()
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Preview$/ }).length)
      .toBeGreaterThan(0), { timeout: 5000 })
    // The readiness veto is presented, and no Apply/Remediate control is offered
    // beside it on the rows.
    expect(screen.getAllByText(/Remediation is not ready/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /^Apply$/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Remediate$/ })).toBeNull()
    expect(remediateCalls()).toHaveLength(0)
  })
  // ── Root134 ownership controls ─────────────────────────────────────────────

  it("no forward request while a replacement read is still unresolved", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()
    // A first read grants authority.
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())

    // A SECOND read is started and left pending: the prior authority must be
    // withdrawn, not retained, and confirm must refuse while it is in flight.
    issuesBehaviour = "defer"
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)

    // Resolving it does NOT submit by itself.
    issuesBehaviour = "ok"
    await act(async () => { deferredIssues[0]() })
    expect(remediateCalls()).toHaveLength(0)
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(remediateCalls()).toHaveLength(0)
  })

  it("a read resolving after the SAME preview installed a new plan arms nothing", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    issuesBehaviour = "defer"
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })
    expect(deferredIssues).toHaveLength(1)

    // Prepare the plan again on the SAME preview: a new signed token is
    // installed while the read is in flight. The evidence version need not
    // change, which is why a captured-token comparison could not see this.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remediate Anyway" }))
    })
    issuesBehaviour = "ok"
    await act(async () => { deferredIssues[0]() })

    // The old completion must not install authority for the new plan -- and
    // must not DISPLAY one either. Confirm is defended a second time at click
    // time, so asserting only the button would not reach the publish site.
    expect(readingState()).toContain(NO_READING_HELD)
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  it("with two attempts in flight, the stale completion owns neither the spinner nor the authority", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // The button carries disabled={overrideReadingInFlight}, but that is STATE:
    // two clicks dispatched in the same tick both reach the handler before
    // React re-renders the attribute. This is the only mounted way to start two
    // reads, and it is why the attempt identity must be a synchronous ref.
    issuesBehaviour = "defer"
    await act(async () => {
      const button = readControl()
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(deferredIssues).toHaveLength(2)
    expect(readControl().textContent).toBe(READING_IN_FLIGHT)

    // Resolve the STALE attempt first, while the latest is still unresolved.
    issuesBehaviour = "ok"
    await act(async () => { deferredIssues[0]() })

    // It must publish nothing and clear nothing: the spinner belongs to the
    // attempt still in flight, and no authority has been established.
    expect(readControl().textContent).toBe(READING_IN_FLIGHT)
    expect(readingState()).toContain(NO_READING_HELD)
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)

    // The latest attempt owns both.
    await act(async () => { deferredIssues[1]() })
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(readControl().textContent).not.toBe(READING_IN_FLIGHT)
    expect(readingState()).toContain("Current facts read")
    await act(async () => { fireEvent.click(confirmButton()) })
    await waitFor(() => expect(remediateCalls()).toHaveLength(1))
  })

  it("starting a re-read withdraws the standing authority even when the re-read is disowned", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // Establish real authority first.
    await act(async () => { fireEvent.click(readControl()) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(readingState()).toContain("Current facts read")

    // Ask for a replacement, and while it is in flight install a NEW signed
    // plan on the same preview, so the replacement resolves DISOWNED and
    // publishes nothing.
    issuesBehaviour = "defer"
    await act(async () => { fireEvent.click(readControl()) })
    expect(deferredIssues).toHaveLength(1)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remediate Anyway" }))
    })
    issuesBehaviour = "ok"
    await act(async () => { deferredIssues[0]() })

    // The FIRST read's authority must be gone: the operator replaced it, and
    // nothing replaced it back. Retaining it would leave the dialog displaying
    // authority for a plan those facts were never read against.
    expect(readingState()).not.toContain("Current facts read")
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  it("the submit path itself refuses an expired reading, not merely the button", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // Real authority, and the confirmation really is enabled.
    await act(async () => { fireEvent.click(readControl()) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    // Captured while enabled: this is the frozen shared modal's handleSubmit.
    const submit = reactOnClick(confirmButton())

    // The reading expires on its OWN 30s package expiry. No re-read, no
    // withdrawal -- exactly the state a slow operator reaches. The dialog
    // re-evaluates on its own 1s plan clock, so that tick is let through:
    // without it the button would still look enabled on expired facts.
    await act(async () => {
      vi.setSystemTime(Date.now() + TTL_MS + 1_000)
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(confirmButton()).toBeDisabled()

    // Reach the submit path anyway. The product must refuse here, by name.
    await act(async () => { await submit({ preventDefault() {}, stopPropagation() {} }) })

    expect(remediateCalls()).toHaveLength(0)
    await waitFor(() => expect(document.body.textContent).toContain("READINESS_EXPIRED"))
  })

  it("a submit captured while permitted cannot fire in the same tick a replacement read starts", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // A real permitted reading, and a genuinely enabled confirmation.
    await act(async () => { fireEvent.click(readControl()) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(readingState()).toContain("Current facts read")

    // Capture BOTH real callbacks while that render is current. Driving them
    // directly is what makes this the same-tick case: RTL wraps each fireEvent
    // in its own act, so a click would commit the withdrawal before the submit
    // ever ran, and the race would be invisible.
    const submit = reactOnClick(confirmButton())
    const startRead = reactOnClick(readControl())

    // ONE tick: the replacement read starts (the read epoch moves) and the
    // previously captured submit fires BEFORE React commits anything. A
    // withdrawal that only exists as state has not reached this caller yet.
    issuesBehaviour = "defer-once"
    await act(async () => {
      startRead({ preventDefault() {}, stopPropagation() {} })
      await submit({ preventDefault() {}, stopPropagation() {} })
    })

    expect(deferredIssues).toHaveLength(1)
    expect(remediateCalls()).toHaveLength(0)
    expect(document.body.textContent).toContain("READINESS_READ_SUPERSEDED")

    // Resolving the replacement must not submit by itself.
    await act(async () => { deferredIssues[0]() })
    expect(remediateCalls()).toHaveLength(0)

    // The refusal left the dialog on its error panel, which is the frozen
    // shared modal's own behaviour. "Try again" returns to the form WITHOUT
    // closing, so the signed plan and the filled fields survive -- the operator
    // does not have to prepare a second plan to recover from this refusal.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })) })

    // A SEPARATE explicit confirmation then reaches exactly one correctly
    // scoped signed request.
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    await act(async () => { fireEvent.click(confirmButton()) })
    await waitFor(() => expect(remediateCalls()).toHaveLength(1))
    const body = remediateCalls()[0].body
    expect(body.role_name).toBe(ROLE)
    expect(body.dry_run).toBe(false)
    expect(body.force).toBe(true)
    expect(body.permissions_to_remove.slice().sort()).toEqual(THE_FIVE.slice().sort())
    for (const kept of USED_AND_PROTECTED) {
      expect(body.permissions_to_remove).not.toContain(kept)
    }
  })

  it("a failed re-read withdraws the authority an earlier read established", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // First read: real authority.
    await act(async () => { fireEvent.click(readControl()) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(readingState()).toContain("Current facts read")

    // Re-read, and it FAILS. The old reading must not survive as authority:
    // the operator asked to replace it, and the replacement did not arrive.
    issuesBehaviour = "fail"
    await act(async () => { fireEvent.click(readControl()) })

    // Measured: the product does better than withdrawing silently -- it
    // publishes the NAMED failure in place of the old reading.
    await waitFor(() => expect(readControl().textContent).not.toBe(READING_IN_FLIGHT))
    expect(readingState()).toContain("READINESS_REPROBE_FAILED")
    expect(readingState()).not.toContain("Current facts read")
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  // ── Root199: the finding travels on BOTH real simulate-fix requests ────────

  it("sends the same finding_id on the initial safety read and the Preview", async () => {
    // Captured at the external fetch boundary, from the ACTUAL requests the
    // mounted modal makes through `buildSimulateFixBody`
    // (lib/iam-review-scope.ts, which emits `body.finding_id` when findingId is
    // populated). No helper response is faked and no source text is asserted.
    await openPreviewAndPreparePlan()

    const simulateCalls = recorded.filter(
      r => r.url.includes("/least-privilege/simulate-fix") && r.method === "POST",
    )
    // the initial safety read on open, and the user-triggered Preview
    expect(simulateCalls.length).toBeGreaterThanOrEqual(1)
    const findingIds = simulateCalls.map(r => r.body?.finding_id)
    // every one of them carries a finding, and they all name the SAME finding
    expect(findingIds.every(id => typeof id === "string" && id.length > 0)).toBe(true)
    expect(new Set(findingIds).size).toBe(1)
    // and the scope the request carries is the review's own, not a default
    for (const call of simulateCalls) {
      expect(call.body.resource_id).toBe(ROLE)
      expect(call.body.system_name).toBe(SYSTEM)
    }
  })

  // ── Root161/178 opening-page package propagation ───────────────────────────

  it("the OPENING dialog reflects the real package, without any read", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // BEFORE any explicit read. The opening classification comes from the
    // parent's stored `data.readiness`, which reaches it only if
    // normalizeLPResponse preserved the wire field.
    const guard = screen.getByTestId("override-confirm-guard").textContent ?? ""

    // It must NOT claim the package is missing: the fixture really carries a
    // well-formed canonical-readiness/v1 package.
    expect(guard).not.toContain("No canonical readiness package")
    expect(guard).not.toContain("READINESS_PACKAGE_ABSENT")
    // What it says instead, measured: the honest LP integrity reason, because
    // a healthy opening package yields no refusal of its own and the guard
    // then falls back to the parent's authority-hold reason.
    expect(guard).toContain(
      "Analysis complete; remediation is not ready because the active generation is unknown "
      + "on the IAM usage lane (READINESS_CACHE_EMPTY).",
    )
    expect(readingState()).toContain(NO_READING_HELD)

    // And the fresh-read requirement is unchanged: a healthy opening package
    // is NOT authority to confirm.
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)

    // Only the explicit read establishes authority.
    await act(async () => { fireEvent.click(readControl()) })
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(readingState()).toContain("Current facts read")
  })

  it("an opening body with NO package does say so, at the dialog", async () => {
    // The LP proxy's own stale-fallback branch answers NOT_READY with no
    // readiness at all. Absent must stay distinguishable from present.
    issuesMutator = payload => { delete payload.readiness }
    await openPreviewAndPreparePlan()
    await completeForm()

    expect(screen.getByTestId("override-confirm-guard").textContent)
      .toContain("No canonical readiness package")
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  it.each([
    ["null", null],
    ["a foreign schema", "FOREIGN"],
  ])("an opening package that is %s refuses at the dialog and sends nothing", async (_label, kind) => {
    issuesMutator = payload => {
      payload.readiness = kind === null
        ? null
        : { ...payload.readiness, schema: "canonical-readiness/v2" }
    }
    await openPreviewAndPreparePlan()
    await completeForm()

    const guard = screen.getByTestId("override-confirm-guard").textContent ?? ""
    expect(guard.length).toBeGreaterThan(0)
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  // ── Root130 scope / tamper / unmount / malformed-outer controls ────────────

  it("a plan signed for another system is refused by the parser and arms nothing", async () => {
    // SCOPE. Same role, same account, same tenant; only `system_name` differs.
    planMutator = plan => { plan.system_name = "fixture-other-shop" }
    mountTab()
    const previews = await waitFor(() => screen.getAllByRole("button", { name: /^Preview$/ }), { timeout: 5000 })
    await act(async () => { fireEvent.click(previews[0]) })
    const entry = await waitFor(() => screen.getByRole("button", { name: "Remediate Anyway" }), { timeout: 5000 })
    await act(async () => { fireEvent.click(entry) })

    await waitFor(() => expect(document.body.textContent).toContain("PLAN_TARGET_MISMATCH"))
    // No signed plan was armed, so the read control does not exist and there is
    // nothing to confirm.
    expect(screen.queryByTestId("refresh-current-readiness")).toBeNull()
    expect(remediateCalls()).toHaveLength(0)
  })

  it("a plan naming a used permission its documents do not remove is refused", async () => {
    // TAMPER. `permissions_to_remove` gains a PROTECTED action while the signed
    // documents are untouched, so the documents do not remove what the plan
    // names. The parser's own PLAN_DISPLAY_MISMATCH is what must catch it.
    planMutator = plan => { plan.permissions_to_remove = [...plan.permissions_to_remove, "s3:GetObject"] }
    mountTab()
    const previews = await waitFor(() => screen.getAllByRole("button", { name: /^Preview$/ }), { timeout: 5000 })
    await act(async () => { fireEvent.click(previews[0]) })
    const entry = await waitFor(() => screen.getByRole("button", { name: "Remediate Anyway" }), { timeout: 5000 })
    await act(async () => { fireEvent.click(entry) })

    await waitFor(() => expect(document.body.textContent).toContain("PLAN_DISPLAY_MISMATCH"))
    expect(screen.queryByTestId("refresh-current-readiness")).toBeNull()
    expect(remediateCalls()).toHaveLength(0)
  })

  it("a read that resolves after the tree unmounted arms nothing", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    issuesBehaviour = "defer"
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })
    expect(deferredIssues).toHaveLength(1)

    await act(async () => { mounted!.unmount() })
    issuesBehaviour = "ok"
    await act(async () => { deferredIssues[0]() })

    expect(remediateCalls()).toHaveLength(0)
    expect(screen.queryByTestId("refresh-current-readiness")).toBeNull()
  })

  it("a re-probe whose canonical block is missing refuses the confirmation", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    issuesMutator = payload => { delete payload.readiness }
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })

    await waitFor(() => {
      expect(screen.getByTestId("current-readiness-state").textContent)
        .toContain("READINESS_PACKAGE_ABSENT")
    })
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })

  it("a re-probe claiming READY with analysis incomplete refuses the confirmation", async () => {
    await openPreviewAndPreparePlan()
    await completeForm()

    // CONTRADICTORY OUTER FIELDS: the outer report says READY while its own
    // analysis is unfinished. A classifier reading only the derived state would
    // see the most permissive answer here.
    issuesMutator = payload => {
      payload.serve_state = "READY"
      payload.readiness.serve_state = "READY"
      payload.analysis_complete = false
      payload.readiness.analysis_complete = false
    }
    await act(async () => { fireEvent.click(screen.getByTestId("refresh-current-readiness")) })

    // The refusal is the RAW OUTER completion field, not the derived state:
    // `serve_state` says READY above and is not what answered.
    await waitFor(() => {
      expect(screen.getByTestId("current-readiness-state").textContent)
        .toContain("OUTER_ANALYSIS_NOT_COMPLETE")
    })
    expect(confirmButton()).toBeDisabled()
    await act(async () => { fireEvent.click(confirmButton()) })
    expect(remediateCalls()).toHaveLength(0)
  })
})
