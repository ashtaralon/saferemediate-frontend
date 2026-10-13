/**
 * S1b FE-C2: the two-Deployment guided setup (components/system-boundary/setup-wizard.tsx), the intent model behind it
 * (lib/system-boundary-setup-intent.ts) and the Finish result's per-Deployment explanation (finish-result.tsx) -- over the
 * backend's REAL level-5 answers (__tests__/fixtures/system-boundary-setup-captures-v5/, -preview-captures-v5/,
 * -result-captures-v2/, pinned to saferemediate-backend fff8cdac) and the real Applied capture (system-boundary-captures/).
 * The client and reads are injected so each test sees exactly the requests the wizard sends; every answer is a capture.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FinishResult } from "@/components/system-boundary/finish-result"
import { SetupWizard, type SetupClient, type StackOption } from "@/components/system-boundary/setup-wizard"
import type { DeclarationsView, StackBinding } from "@/lib/system-boundary-authoring"
import { pairDeployments, type PairedDeployment } from "@/lib/system-boundary-deployment-context"
import type { SetupIntent, SetupView, SetupWrite } from "@/lib/system-boundary-setup"
import { addDeployment, draftDeclaration, keyOf, loadIntent, removeDeployment, type IntentLocal } from "@/lib/system-boundary-setup-intent"
import { setupPendingStore, type PendingSetupOp } from "@/lib/system-boundary-setup-pending"
import { parsePreview, type PreviewFetcher } from "@/lib/system-boundary-setup-preview"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (file: string): any => JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", file), "utf8"))
const SETUPS = (name: string) => json(`system-boundary-setup-captures-v5/${name}.json`)
const PREVIEWS = (name: string) => json(`system-boundary-setup-preview-captures-v5/${name}.json`)
const VIEW: DeclarationsView = json("system-boundary/view_after_save.json").body
const SINGLE_V5: SetupView = SETUPS("read_draft").body
const SINGLE_V4: SetupView = json("system-boundary-setup-captures-v4/read_draft.json").body
const PLURAL: SetupView = PREVIEWS("plural_read_draft").body
const PLURAL_HELD: SetupView = PREVIEWS("plural_draft_held").body
const ACTOR = "idp#alice"
// The plural harness's two stacks ("shop", "api") as the draft's own bindings recorded the census listing them (the census
// stacks capture in system-boundary-captures/ is another harness's account and stacks).
const PLURAL_STACKS: StackOption[] = (PLURAL.intent.declaration as { bindings: StackBinding[] }).bindings.map((b) => ({
  stack_id: b.stack_id, label: b.stack_id.split("/")[1], region: b.region, stack_status: b.selection.stack_status ?? null,
  census: { generation: b.selection.census.generation, source_identity: b.selection.census.source_identity } }))

async function settle() {
  await act(async () => {})
}

const previewOf = (body: unknown): PreviewFetcher => vi.fn(async () => parsePreview(200, structuredClone(body)))

function client(view: SetupView) {
  const updates: SetupIntent[] = []
  const c: SetupClient = {
    readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(view) })),
    readSetupStatus: vi.fn(async () => ({ kind: "UNAVAILABLE" as const, status: 503, code: "NOT_READ_IN_THIS_TEST" })),
    updateSetup: vi.fn(async (_id: string, _rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      updates.push(steps)
      return { kind: "SAVED", status: 200, view: { ...structuredClone(view), state_version: base + 1, intent: steps } }
    }),
    finishSetup: vi.fn(async (): Promise<SetupWrite> => ({ kind: "SAVED", status: 201, view: PREVIEWS("plural_finish").body })),
  }
  return { c, updates }
}

function mount(view: SetupView, c: SetupClient, { pluralOffered = false, readPreview = previewOf(PREVIEWS("plural_preview").body) }:
  { pluralOffered?: boolean; readPreview?: PreviewFetcher } = {}) {
  return render(<SetupWizard setupId={view.setup_id} accountId={view.accounts_seen[0]} view={VIEW} picks={[]}
    onClose={() => undefined} client={c} pendingStore={setupPendingStore(null, new Map<string, PendingSetupOp>())} actor={ACTOR}
    stacks={view.accounts_seen[0] === PLURAL.accounts_seen[0] ? { state: "served", stacks: PLURAL_STACKS }
      : { state: "unavailable", reason: "NOT_READ_IN_THIS_TEST" }} readPreview={readPreview} pluralOffered={pluralOffered}
    readApplied={async () => ({ status: 503, body: { state: "unavailable" } })} readResult={async () => ({ status: 503, body: {} })} />)
}

const goTo = (title: string) => fireEvent.click(within(screen.getByTestId("setup-steps")).getByRole("button", { name: new RegExp(title) }))
const loaded = (view: SetupView): IntentLocal => {
  const read = loadIntent(view.intent)
  if (read.kind !== "ok") throw new Error(JSON.stringify(read))
  return read.local
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("the intent model reads and writes the plural shape losslessly", () => {
  it("a saved plural draft comes back exactly as saved (both captures); the single one too", () => {
    for (const view of [PLURAL, SETUPS("plural_read_draft").body as SetupView, SINGLE_V5]) {
      expect(draftDeclaration(loaded(view))).toEqual(view.intent.declaration)
    }
  })

  it("adding a Deployment makes the first one plural with everything naming it; removing it gives back the single shape", () => {
    const single = loaded(SINGLE_V5)
    // the real single draft asks for infrastructure as code by owner request: refused by name until that choice changes (N2)
    expect(addDeployment(single, "staging")).toMatchObject({ kind: "refused" })
    expect((addDeployment(single, "staging") as { why: string }).why).toContain("OWNER_REQUEST_NOT_DEPLOYMENT_SCOPED")
    const asked = single.dispositions.findIndex((d) => d.subject === "iac")
    const changed = { ...single, dispositions: single.dispositions.map((d, i) => (i === asked ? { ...d, choice: "connect_later" as const,
                                                                                                   reason_code: "CONNECT_LATER" } : d)) }
    const added = addDeployment(changed, "staging")
    if (added.kind !== "ok") throw new Error(added.why)
    const plural = draftDeclaration(added.local)
    expect(plural.deployment).toBeUndefined()
    expect((plural.deployments as { deployment_key: string }[]).map((d) => d.deployment_key)).toEqual(["prod", "staging"])
    expect((plural.deployments as unknown[])[0]).toEqual((SINGLE_V5.intent.declaration as { deployment: unknown }).deployment)
    expect((plural.roots as object[]).every((r) => keyOf(r) === "prod")).toBe(true)
    expect(added.local.dispositions.filter((d) => d.subject === "code" || d.subject === "iac").every((d) => d.scope.deployment === "prod"))
      .toBe(true)
    expect(added.local.dispositions.filter((d) => d.subject.startsWith("history:")).every((d) => d.scope.deployment === undefined))
      .toBe(true)
    // nothing names staging: removing it gives back exactly the single declaration
    const removed = removeDeployment(added.local, "staging")
    if (removed.kind !== "ok") throw new Error(removed.why)
    expect(draftDeclaration(removed.local)).toEqual(SINGLE_V5.intent.declaration)
    // prod holds the roots: it is not removed
    expect(removeDeployment(added.local, "prod")).toMatchObject({ kind: "refused" })
    expect(addDeployment(added.local, "prod")).toMatchObject({ kind: "refused" })        // already a Deployment
    expect(addDeployment(added.local, "stag ing")).toMatchObject({ kind: "refused" })    // not a key the backend admits
  })
})

describe("a second Deployment is offered only per the capability AND on a level-5 setup", () => {
  it.each([
    ["level 5, offered", SINGLE_V5, true, true],
    ["level 5, not offered by the capability", SINGLE_V5, false, false],
    ["level 4, offered by the capability", SINGLE_V4, true, false],
  ] as const)("%s", async (_name, view, pluralOffered, shown) => {
    mount(view, client(view).c, { pluralOffered, readPreview: previewOf(json("system-boundary-setup-preview-captures/preview.json").body) })
    await settle()
    goTo("Deployments")
    expect(screen.queryByTestId("setup-add-deployment") !== null).toBe(shown)
  })

  it("adds staging after the request choice changes, and Save sends the plural shape with prod first", async () => {
    const { c, updates } = client(SINGLE_V5)
    mount(SINGLE_V5, c, { pluralOffered: true })
    await settle()
    goTo("Deployments")
    const add = () => {
      fireEvent.change(screen.getByLabelText("New Deployment key"), { target: { value: "staging" } })
      fireEvent.click(screen.getByRole("button", { name: "Add a Deployment" }))
    }
    add()
    expect(within(screen.getByTestId("setup-add-deployment")).getByRole("alert").textContent).toContain("OWNER_REQUEST_NOT_DEPLOYMENT_SCOPED")
    goTo("Code and infrastructure")
    fireEvent.change(screen.getByLabelText(/Infrastructure as code, /), { target: { value: "connect_later" } })
    goTo("Deployments")
    add()
    expect(screen.getByTestId("setup-deployments").querySelectorAll("[data-testid^='setup-deployment-']").length).toBe(2)
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(updates).toHaveLength(1)
    const declaration = updates[0].declaration as Record<string, unknown>
    expect(declaration.deployment).toBeUndefined()
    expect((declaration.deployments as { deployment_key: string }[]).map((d) => d.deployment_key)).toEqual(["prod", "staging"])
    expect((declaration.roots as object[]).every((r) => keyOf(r) === "prod")).toBe(true)
  })
})

describe("a plural draft: each Deployment's own choices, the union's sources once", () => {
  it("resumes not dirty; code / iac per Deployment, never an owner request; required data once", async () => {
    const { c, updates } = client(PLURAL)
    mount(PLURAL, c, { pluralOffered: true })
    await settle()
    expect(screen.queryByTestId("setup-review-unsaved")).toBeNull()
    goTo("Code and infrastructure")
    for (const key of ["prod", "staging"]) {
      const group = screen.getByTestId(`setup-deployment-subjects-${key}`)
      const options = [...within(group).getByTestId(`setup-subject-code-${key}`).querySelectorAll("option")].map((o) => o.textContent)
      expect(options).not.toContain("Request it (not available in this release)")
    }
    goTo("Required data")
    expect(screen.queryByTestId("setup-deployment-subjects-prod")).toBeNull()
    expect(screen.getByTestId("setup-subject-live_source:iam_usage")).toBeTruthy()
    goTo("Deployments")
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(updates[0].declaration).toEqual(PLURAL.intent.declaration)                       // lossless through the screen
    expect(updates[0].dispositions).toEqual(PLURAL.intent.dispositions)
  })

  it("refuses a stack another Deployment uses (DISPOSITION_REF_OTHER_DEPLOYMENT)", async () => {
    mount(PLURAL, client(PLURAL).c, { pluralOffered: true })
    await settle()
    goTo("Code and infrastructure")
    const staging = within(screen.getByTestId("setup-subject-iac-staging"))
    const prodStack = (PLURAL.intent.declaration as { bindings: { stack_id: string; deployment_key: string }[] }).bindings
      .find((b) => b.deployment_key === "prod")!.stack_id
    fireEvent.change(staging.getByLabelText("CloudFormation stack"), { target: { value: prodStack } })
    expect(staging.getByRole("alert").textContent).toContain("DISPOSITION_REF_OTHER_DEPLOYMENT")
  })
})

describe("Review: the consolidated account assessment, and the OUTER state governs Finish", () => {
  it("a computed plural preview names each Deployment's own members (shop -> prod, api -> staging) and allows Finish", async () => {
    const { c } = client(PLURAL)
    mount(PLURAL, c, { pluralOffered: true })
    await settle()
    const account = PLURAL.accounts_seen[0]
    expect(screen.getByTestId(`setup-assessment-deployments-${account}-prod`).textContent).toContain("prod: 3 member(s) of its own")
    expect(screen.getByTestId(`setup-assessment-deployments-${account}-staging`).textContent).toContain("staging: 1 member(s) of its own")
    expect(screen.getByTestId(`setup-assessment-${account}`).textContent).toContain("4 member(s), each counted once")
    const finish = screen.getByTestId("setup-finish") as HTMLButtonElement
    expect(finish.disabled).toBe(false)
    fireEvent.click(finish)
    await settle()
    expect(c.finishSetup).toHaveBeenCalledWith(PLURAL.setup_id, expect.any(String), PLURAL.state_version,
                                               PREVIEWS("plural_preview").body.preview_digest)
  })

  it("a late-held plural preview says nothing per Deployment and Finish waits, whatever its nested decoration says", async () => {
    const { c } = client(PLURAL_HELD)
    mount(PLURAL_HELD, c, { pluralOffered: true, readPreview: previewOf(PREVIEWS("plural_preview_held").body) })
    await settle()
    const account = PLURAL_HELD.accounts_seen[0]
    expect(screen.getByTestId("setup-assessment-held")).toBeTruthy()
    expect(screen.getByTestId(`setup-assessment-withheld-${account}`).textContent).toContain("ACCOUNT_NOT_ASSESSED")
    expect(screen.queryByTestId(`setup-assessment-deployments-${account}`)).toBeNull()
    expect((screen.getByTestId("setup-finish") as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("the Finish result explains per Deployment only what THIS receipt pins (N4a)", () => {
  const APPLIED = json("system-boundary-captures/applied.json")
  const result = (name: string) => json(`system-boundary-result-captures-v2/${name}.json`)
  const SERVED = result("served_context")
  const ACCOUNT = SERVED.body.account_id
  // tests/test_system_boundary_result_captures.py roots i-...1 and the role under prod and i-...3 under staging
  const pinned = (prodVersion = 1): PairedDeployment[] | null => {
    const refOf = (suffix: string): string => SERVED.body.members.find((m: { resource_uid: string }) => m.resource_uid.endsWith(suffix))
      .deployment_context.deployments[0].key
    return pairDeployments(["prod", "staging"], [{ key: refOf("i-00000000000000001"), version: prodVersion },
                                                 { key: refOf("i-00000000000000003"), version: 1 }])
  }
  const show = (body: unknown, p: PairedDeployment[] | null | undefined) =>
    render(<FinishResult systemKey={SERVED.body.system_key} completedRevision={APPLIED.body.applied_revision} accountIds={[ACCOUNT]}
      readApplied={async () => ({ status: APPLIED.status, body: structuredClone(APPLIED.body) })}
      readResult={async () => ({ status: 200, body: structuredClone(body) })} {...(p === undefined ? {} : { pinned: p })} />)

  it("this Finish's applied result, every context of this receipt: each Deployment's own members", async () => {
    show(SERVED.body, pinned())
    await settle()
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).toContain("This Finish's applied result")
    const prod = screen.getByTestId(`finish-result-deployments-${ACCOUNT}-prod`).textContent ?? ""
    expect(prod).toContain("i-00000000000000001")
    expect(prod).toContain("role/r2")
    expect(screen.getByTestId(`finish-result-deployments-${ACCOUNT}-staging`).textContent).toContain("i-00000000000000003")
  })

  const withheldCases: [string, unknown, () => PairedDeployment[] | null, string][] = [
    ["the receipt pinned prod at another version", SERVED.body, () => pinned(2), "CONTEXT_NOT_THIS_RECEIPT"],
    ["the same rows pinned at a later revision", result("served_context_withheld").body, () => pinned(), "DEPLOYMENT_VERSION_NOT_PLANNER_INPUT"],
    ["a version-1 publication", result("served_without_context").body, () => pinned(), "PUBLICATION_WITHOUT_CONTEXT"],
    ["the receipt's Deployments do not pair", SERVED.body, () => null, "RECEIPT_DEPLOYMENTS_NOT_PAIRED"],
  ]
  it.each(withheldCases)("withheld by name: %s", async (_name, body, p, why) => {
    show(body, p())
    await settle()
    expect(screen.getByTestId(`finish-result-deployments-withheld-${ACCOUNT}`).textContent).toContain(why)
    expect(screen.queryByTestId(`finish-result-deployments-${ACCOUNT}`)).toBeNull()
    expect(screen.getByTestId(`finish-result-${ACCOUNT}`).textContent).toContain("i-00000000000000003")   // every member still listed
  })

  it("a single setup's result is shown exactly as before: no explanation, none withheld", async () => {
    show(SERVED.body, undefined)
    await settle()
    expect(screen.queryByTestId(`finish-result-deployments-${ACCOUNT}`)).toBeNull()
    expect(screen.queryByTestId(`finish-result-deployments-withheld-${ACCOUNT}`)).toBeNull()
  })
})
