/**
 * S2 intake I2c: the setup wizard's iac row uses an uploaded Terraform state -- ``use_existing`` with a ``terraform_state``
 * reference to the binding the upload returned (contract S2-INTAKE-CONTRACT-2026-10-16; C3a/C4a judge it on the server).
 *
 * The setup is the REAL level-4 draft capture (__tests__/fixtures/system-boundary-setup-captures-v4/read_draft.json: one iac row,
 * requested, eu-west-1); the state is the backend's Terraform 1.7.1 AWS import; the upload's answer is the binding route's
 * producer capture, through the REAL client. An edit of a capture is said.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SetupWizard, type SetupClient } from "@/components/system-boundary/setup-wizard"
import type { DeclarationsView } from "@/lib/system-boundary-authoring"
import { derivedSentence, type SetupIntent, type SetupView, type SetupWrite } from "@/lib/system-boundary-setup"
import { setupPendingStore, type PendingSetupOp } from "@/lib/system-boundary-setup-pending"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (file: string): any => JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", file), "utf8"))
const VIEW: DeclarationsView = json("system-boundary/view_after_save.json").body
const DRAFT: SetupView = json("system-boundary-setup-captures-v4/read_draft.json").body
const ACCOUNT = DRAFT.dispositions_derived[0].scope.account_id
const IAC = DRAFT.intent.dispositions.find((d) => d.subject === "iac")!
const ROW = `Infrastructure as code, ${ACCOUNT} / ${IAC.scope.region}`
const CREATED = json("terraform-binding-captures/create.json")
const STATE = readFileSync(resolve(process.cwd(), "__tests__/fixtures/terraform-state/aws_import.tfstate"), "utf8")

function client(view: SetupView = DRAFT) {
  const updates: SetupIntent[] = []
  const c: SetupClient = {
    readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(view) })),
    readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: json("system-boundary-setup-captures-v4/status.json").body })),
    updateSetup: vi.fn(async (_id: string, _rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      updates.push(steps)
      return { kind: "SAVED", status: 200, view: { ...structuredClone(view), state_version: base + 1, intent: steps } }
    }),
    finishSetup: vi.fn(),
  }
  return { c, updates }
}

async function open(c: SetupClient) {
  render(<SetupWizard setupId={DRAFT.setup_id} accountId={ACCOUNT} view={VIEW} picks={[]} onClose={() => undefined} client={c}
    pendingStore={setupPendingStore(null, new Map<string, PendingSetupOp>())} actor="https://idp#alice"
    stacks={{ state: "unavailable", reason: "The account census is not published yet." }}
    readApplied={async () => ({ status: 503, body: {} })} readResult={async () => ({ status: 503, body: {} })} />)
  await act(async () => {})
}
const step = (name: string) => fireEvent.click(screen.getByRole("button", { name }))
const iac = () => within(screen.getByTestId("setup-subject-iac"))
const useTerraform = () => fireEvent.change(iac().getByLabelText(ROW), { target: { value: "use_existing:terraform_state" } })

/** The wizard's own reads (its draft preview) answer the proxy's named 502 -- no backend here; the binding route answers
 *  ``created`` (a producer capture), and only it is counted. */
function backend(created?: { status: number; content_type: string; body: unknown }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("/terraform-bindings")) {
      if (!created) throw new Error("no upload was expected")
      return new Response(JSON.stringify(created.body), { status: created.status, headers: { "content-type": created.content_type } })
    }
    return new Response(JSON.stringify({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } }),
                        { status: 502, headers: { "content-type": "application/json" } })
  })
}
const uploads = (spy: ReturnType<typeof backend>) => spy.mock.calls.filter((c) => String(c[0]).includes("/terraform-bindings"))

async function upload() {
  fireEvent.change(iac().getByLabelText("Workspace label"), { target: { value: "s3://platform-tfstate/platform.tfstate#default" } })
  fireEvent.change(iac().getByLabelText("Terraform state file"), { target: { files: [new File([STATE], "aws_import.tfstate")] } })
  fireEvent.click(await iac().findByLabelText("I confirm this upload"))          // the local reduction finishes asynchronously
  fireEvent.click(iac().getByRole("button", { name: "Upload" }))
  await act(async () => {})
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("the iac row can use an uploaded Terraform state", () => {
  it("offers it for this account's row, and holds Save until a state is uploaded (nothing sent)", async () => {
    const fetch = backend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    expect(iac().getByTestId("terraform-disclosure")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await act(async () => {})
    expect(screen.getAllByRole("alert").map((a) => a.textContent))
      .toContain(`Upload the Terraform state for ${ACCOUNT} / ${IAC.scope.region} first, or choose another option for it.`)
    expect(updates).toHaveLength(0)
    expect(uploads(fetch)).toHaveLength(0)
  })

  it("an upload names its binding on the row, and Save sends use_existing -> terraform_state, scope as authored", async () => {
    const fetch = backend(CREATED)
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    expect(uploads(fetch)).toHaveLength(1)
    expect(JSON.parse((uploads(fetch)[0][1] as RequestInit).body as string).account_id).toBe(ACCOUNT)
    expect(iac().getByTestId("setup-terraform-bound").textContent).toContain(CREATED.body.binding_id)
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await act(async () => {})
    expect(updates).toHaveLength(1)
    expect(updates[0].dispositions.find((d) => d.subject === "iac")).toEqual({
      subject: "iac", scope: IAC.scope, choice: "use_existing", reason_code: "USE_EXISTING",
      ref: { kind: "terraform_state", key: CREATED.body.binding_id } })
    expect(uploads(fetch)).toHaveLength(1)                     // the setup save goes through its own client, never re-uploads
  })

  it("a row of another account is not offered a Terraform state (a binding is of one account)", async () => {
    const view = structuredClone(DRAFT)                         // the draft capture with its iac row moved to another account
    const index = view.intent.dispositions.findIndex((d) => d.subject === "iac")
    view.intent.dispositions[index] = { ...view.intent.dispositions[index], scope: { account_id: "222222222222", region: "eu-west-1" } }
    const { c } = client(view)
    await open(c)
    step("3. Code and infrastructure")
    const row = iac().getByLabelText("Infrastructure as code, 222222222222 / eu-west-1")
    expect(within(row).queryByRole("option", { name: "Use an uploaded Terraform state" })).toBeNull()
  })

  it("a saved Terraform row of ANOTHER account shows its binding and offers nothing to upload", async () => {
    const view = structuredClone(DRAFT)                         // the draft capture's iac row: another account, using a binding
    const index = view.intent.dispositions.findIndex((d) => d.subject === "iac")
    view.intent.dispositions[index] = { subject: "iac", scope: { account_id: "222222222222", region: "eu-west-1" }, choice: "use_existing",
                                        reason_code: "USE_EXISTING", ref: { kind: "terraform_state", key: CREATED.body.binding_id } }
    const { c } = client(view)
    await open(c)
    step("3. Code and infrastructure")
    expect(iac().getByTestId("setup-terraform-bound").textContent).toContain(CREATED.body.binding_id)
    expect(iac().queryByRole("button", { name: "Upload a different state" })).toBeNull()
    expect(iac().queryByLabelText("Terraform state file")).toBeNull()
  })

  it("a saved Terraform row resumes as such, with its binding, and a different state can replace it", async () => {
    const view = structuredClone(DRAFT)                         // the draft capture with its iac row using a binding (an edit)
    const index = view.intent.dispositions.findIndex((d) => d.subject === "iac")
    view.intent.dispositions[index] = { ...view.intent.dispositions[index], choice: "use_existing", reason_code: "USE_EXISTING",
                                        ref: { kind: "terraform_state", key: CREATED.body.binding_id } }
    const { c } = client(view)
    await open(c)
    step("3. Code and infrastructure")
    expect((iac().getByLabelText(ROW) as HTMLSelectElement).value).toBe("use_existing:terraform_state")
    expect(iac().getByTestId("setup-terraform-bound").textContent).toContain(CREATED.body.binding_id)
    fireEvent.click(iac().getByRole("button", { name: "Upload a different state" }))
    expect(iac().getByTestId("terraform-disclosure")).toBeTruthy()
  })
})

/** (SW114 R1) The binding route answers only when ``answer()`` is called: the person keeps working meanwhile. */
function deferredBackend() {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("/terraform-bindings")) {
      await gate
      return new Response(JSON.stringify(CREATED.body), { status: CREATED.status, headers: { "content-type": CREATED.content_type } })
    }
    return new Response(JSON.stringify({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } }),
                        { status: 502, headers: { "content-type": "application/json" } })
  })
  const answer = async () => {
    release()
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    await act(async () => {})
  }
  return { spy, answer }
}
const CODE_ROW = `Application code (GitHub), ${ACCOUNT} / all Regions`
async function saveSent(updates: SetupIntent[]) {
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
  await act(async () => {})
  return updates
}

describe("SW114 R1: an upload's late answer applies to ITS row as the row is now, or to nothing", () => {
  it("an unchanged row takes the late answer", async () => {
    const { answer } = deferredBackend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    expect(iac().queryByTestId("setup-terraform-bound")).toBeNull()                 // still in flight
    await answer()
    expect(iac().getByTestId("setup-terraform-bound").textContent).toContain(CREATED.body.binding_id)
    expect((await saveSent(updates))[0].dispositions.find((d) => d.subject === "iac")?.ref)
      .toEqual({ kind: "terraform_state", key: CREATED.body.binding_id })
  })

  it("an EARLIER row removed meanwhile: the binding lands on the iac row, the removal stands", async () => {
    const { answer } = deferredBackend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    fireEvent.change(screen.getByLabelText(CODE_ROW), { target: { value: "" } })     // the row before it: every index shifts
    await answer()
    const sent = (await saveSent(updates))[0].dispositions
    expect(sent.find((d) => d.subject === "code")).toBeUndefined()
    expect(sent.find((d) => d.subject === "iac")).toEqual({ subject: "iac", scope: IAC.scope, choice: "use_existing",
      reason_code: "USE_EXISTING", ref: { kind: "terraform_state", key: CREATED.body.binding_id } })
    expect(sent.map((d) => d.subject).sort()).toEqual(["history:cloudtrail", "iac"])
  })

  it("an earlier row CHANGED meanwhile: that change stands, the binding lands on the iac row", async () => {
    const { answer } = deferredBackend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    fireEvent.change(screen.getByLabelText(CODE_ROW), { target: { value: "connect_later" } })
    await answer()
    const sent = (await saveSent(updates))[0].dispositions
    expect(sent.find((d) => d.subject === "code")?.choice).toBe("connect_later")
    expect(sent.find((d) => d.subject === "iac")?.ref).toEqual({ kind: "terraform_state", key: CREATED.body.binding_id })
  })

  it("the row's choice changed meanwhile: the late answer changes nothing", async () => {
    const { answer } = deferredBackend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    fireEvent.change(iac().getByLabelText(ROW), { target: { value: "not_used" } })
    await answer()
    const row = (await saveSent(updates))[0].dispositions.find((d) => d.subject === "iac")!
    expect([row.choice, row.ref]).toEqual(["not_used", undefined])
  })

  it("changed away and back to a Terraform state meanwhile: the OLD upload's answer is not this row's", async () => {
    const { answer } = deferredBackend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    fireEvent.change(iac().getByLabelText(ROW), { target: { value: "not_used" } })
    useTerraform()                                                                   // the same choice again: a new upload
    await answer()
    expect(iac().queryByTestId("setup-terraform-bound")).toBeNull()
    expect(await saveSent(updates)).toHaveLength(0)                                 // still unuploaded: Save is held
  })

  it("the step left meanwhile: the answer is not applied, the row waits for an upload", async () => {
    const { answer } = deferredBackend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    step("6. Historical data")
    await answer()
    step("3. Code and infrastructure")
    expect(iac().queryByTestId("setup-terraform-bound")).toBeNull()
    expect(await saveSent(updates)).toHaveLength(0)
  })

  it("ANOTHER setup opened in the same wizard meanwhile: the answer is not that setup's", async () => {
    // Two setups whose iac rows share an identity: the draft capture, and a copy with another setup id whose iac row already
    // waits for a Terraform state (an edit). The wizard instance survives the switch (Your setups renders it unkeyed).
    const other = structuredClone(DRAFT)
    other.setup_id = "5e7a0000-0000-4000-8000-0000000000b2"
    const at = other.intent.dispositions.findIndex((d) => d.subject === "iac")
    other.intent.dispositions[at] = { ...other.intent.dispositions[at], choice: "use_existing", reason_code: "USE_EXISTING",
                                      ref: { kind: "terraform_state", key: "" } }
    const { answer } = deferredBackend()
    const { c, updates } = client()
    c.readSetup = vi.fn(async (id: string) => ({ kind: "OK" as const, value: structuredClone(id === other.setup_id ? other : DRAFT) }))
    const props = { accountId: ACCOUNT, view: VIEW, picks: [], onClose: () => undefined, client: c, actor: "https://idp#alice",
                    pendingStore: setupPendingStore(null, new Map<string, PendingSetupOp>()),
                    stacks: { state: "unavailable" as const, reason: "The account census is not published yet." },
                    readApplied: async () => ({ status: 503, body: {} }), readResult: async () => ({ status: 503, body: {} }) }
    const { rerender } = render(<SetupWizard setupId={DRAFT.setup_id} {...props} />)
    await act(async () => {})
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    rerender(<SetupWizard setupId={other.setup_id} {...props} />)
    await act(async () => {})
    await answer()
    expect(screen.queryByTestId("setup-terraform-bound")).toBeNull()               // the other setup's row is not bound
    expect(updates).toHaveLength(0)
  })

  it("the wizard closed meanwhile: the answer writes nothing", async () => {
    const { answer, spy } = deferredBackend()
    const { c, updates } = client()
    await open(c)
    step("3. Code and infrastructure")
    useTerraform()
    await upload()
    cleanup()
    await answer()
    expect(spy.mock.calls.filter((call) => String(call[0]).includes("/terraform-bindings"))).toHaveLength(1)
    expect(updates).toHaveLength(0)
  })
})

describe("the server's reading of the binding, in words beside its code", () => {
  it.each([
    ["assessed", "SNAPSHOT_UPLOADED", "Assessed only, not connected (SNAPSHOT_UPLOADED: an uploaded Terraform state"],
    ["held", "BINDING_REVOKED", "Held (BINDING_REVOKED: this Terraform state binding was revoked)"],
    ["held", "WORKSPACE_REGION_MISMATCH", "Held (WORKSPACE_REGION_MISMATCH: no resource of the uploaded state is in this Region)"],
  ] as const)("%s %s", (state, reason, words) => {
    const derived = structuredClone(DRAFT.dispositions_derived.find((d) => d.subject === "iac")!)   // its resolution edited
    derived.resolution = { state, reason }
    expect(derivedSentence(derived)).toContain(words)
  })

  it("another code is said as before", () => {
    const derived = DRAFT.dispositions_derived.find((d) => d.subject === "iac")!
    expect(derivedSentence(derived)).toMatch(/^Not available in this release \(RESOLVER_NOT_AVAILABLE\)/)
  })
})
