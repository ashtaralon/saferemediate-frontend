/**
 * The mounted declaration form (components/system-boundary/declaration-form.tsx) over the PRODUCER goldens of the
 * authoring routes (__tests__/fixtures/system-boundary, backend 61c2cd9d). The form posts through the REAL client; fetch
 * answers with the golden. The only thing pinned on this side is the request id the client mints (crypto.randomUUID),
 * set to the golden request's, so a person's clicks must produce exactly the request the real backend answered.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DeclarationForm } from "@/components/system-boundary/declaration-form"
import type { CreateEnvelope, DeclarationsView, DeclaredRoot } from "@/lib/system-boundary-authoring"
import type { PickedRoot } from "@/lib/system-boundary-declaration"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function golden(name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary", `${name}.json`), "utf8"))
}

const REQUESTS = golden("requests")
const CREATE: CreateEnvelope = REQUESTS.create
const REFUSED: CreateEnvelope = REQUESTS.refused
const VIEW0: DeclarationsView = golden("view_initial").body
const VIEW1: DeclarationsView = golden("view_after_save").body

function picked(root: DeclaredRoot): PickedRoot {
  return { root: structuredClone(root) as DeclaredRoot, label: root.resource_uid.split("/").pop() ?? root.resource_uid,
           publication: { ...root.selection.publication, registration_id: "r" } }
}

function answers(...names: (string | Error)[]) {
  const spy = vi.spyOn(globalThis, "fetch")
  for (const name of names) {
    if (name instanceof Error) spy.mockRejectedValueOnce(name)
    else spy.mockResolvedValueOnce(Response.json(golden(name).body, { status: golden(name).status }))
  }
  return spy
}

function sent(spy: { mock: { calls: unknown[][] } }, n = 0): unknown {
  return JSON.parse((spy.mock.calls[n][1] as RequestInit).body as string)
}

function form(view: DeclarationsView, roots: PickedRoot[], requestId: string) {
  // The FIRST id the client mints is the golden request's; any later mint is another id, so a re-minted request is visible.
  vi.spyOn(globalThis.crypto, "randomUUID")
    .mockReturnValueOnce(requestId as `${string}-${string}-${string}-${string}-${string}`)
    .mockReturnValue("00000000-0000-4000-8000-0000000000ee")
  const onSaved = vi.fn()
  const onEnvelope = vi.fn()
  const onCancel = vi.fn()
  render(<DeclarationForm view={view} roots={roots} onSaved={onSaved} onEnvelope={onEnvelope} onCancel={onCancel} />)
  return { onSaved, onEnvelope, onCancel }
}

function fillNew(name: string, { criticality = "LOW", key = "prod", environment = "PRODUCTION", raw = "prd" } = {}) {
  fireEvent.change(screen.getByLabelText("System name"), { target: { value: name } })
  fireEvent.change(screen.getByLabelText("Criticality"), { target: { value: criticality } })
  fireEvent.change(screen.getByLabelText("Deployment key"), { target: { value: key } })
  fireEvent.change(screen.getByLabelText("Environment"), { target: { value: environment } })
  fireEvent.change(screen.getByLabelText("Your own environment word"), { target: { value: raw } })
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
  })
}

afterEach(() => vi.restoreAllMocks())

describe("the declaration form", () => {
  it("a person's clicks send exactly the create the real backend saved, and the answer reads Saved, never Applied", async () => {
    const spy = answers("save_saved")
    const { onSaved, onEnvelope } = form(VIEW0, CREATE.declaration.roots.map((r) => picked(r as DeclaredRoot)), CREATE.request_id)
    expect(screen.getByTestId("deployment-cells").textContent).toBe("Covers: 111122223333 / global")
    fillNew("Payments")
    await click("Review")
    expect(screen.getByTestId("declaration-review").textContent).toContain("Payments (new; criticality LOW)")
    await click("Save")
    expect(sent(spy)).toEqual(CREATE)                                   // the very request the real route answered 201
    expect(onEnvelope.mock.calls[0][0]).toEqual(CREATE)                // handed over before its first send (T18)
    expect(screen.getByTestId("declaration-outcome").textContent).toContain(
      "Saved as revision 2. Cyntro is preparing this system's membership; nothing is applied yet.")
    expect(screen.queryByText(/applied\./)).toBeNull()
    expect(onSaved).toHaveBeenCalledWith(2)
  })

  it("an unconfirmed save is resent unchanged -- the same request id and body -- and its replay is believed", async () => {
    const spy = answers(new TypeError("Failed to fetch"), "save_replayed")
    const { onSaved } = form(VIEW0, CREATE.declaration.roots.map((r) => picked(r as DeclaredRoot)), CREATE.request_id)
    fillNew("Payments")
    await click("Review")
    await click("Save")
    expect(screen.getByTestId("declaration-outcome").textContent).toContain("could not be confirmed")
    await click("Resend the same request")
    expect(spy).toHaveBeenCalledTimes(2)
    expect(sent(spy, 1)).toEqual(sent(spy, 0))
    expect(onSaved).toHaveBeenCalledWith(2)
  })

  it("the resolver's refusal names the root it did not admit, in words; editing makes a NEW request", async () => {
    const spy = answers("save_root_not_admitted", "save_saved")
    form(VIEW0, REFUSED.declaration.roots.map((r) => picked(r as DeclaredRoot)), REFUSED.request_id)
    fillNew("Refused")
    await click("Review")
    await click("Save")
    expect(sent(spy)).toEqual(REFUSED)
    const outcome = screen.getByTestId("declaration-outcome").textContent ?? ""
    expect(outcome).toContain("Some picked resources cannot be roots right now. Nothing was saved.")
    expect(outcome).toContain(`${golden("save_root_not_admitted").body.detail.roots[0].resource_uid}: it has no verified identity yet`)
    expect(outcome).toContain("Code: ROOT_NOT_ADMITTED")
    await click("Back to edit")
    expect(screen.getByLabelText("System name")).toBeTruthy()
  })

  it("reusing the saved System shows its criticality as kept and sends references at the versions read", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ detail: { code: "STORE_THROTTLED" } }, { status: 503 }))
    form(VIEW1, CREATE.declaration.roots.map((r) => picked(r as DeclaredRoot)), "00000000-0000-4000-8000-0000000000ff")
    fireEvent.click(screen.getByLabelText(/Existing system/))
    expect(screen.getByTestId("existing-criticality").textContent).toContain("Criticality: LOW (kept;")
    fireEvent.click(screen.getByLabelText(/Existing deployment of this system/))
    await click("Review")
    expect(screen.getByTestId("declaration-review").textContent).toContain("Payments (existing, version 1)")
    expect(screen.getByTestId("declaration-review").textContent).toContain("existing, version 1")
  })

  it("refuses locally only what the served limits rule out, and says what to fix", async () => {
    answers()
    form(VIEW0, CREATE.declaration.roots.map((r) => picked(r as DeclaredRoot)), CREATE.request_id)
    await click("Review")
    const alert = screen.getByRole("alert").textContent ?? ""
    expect(alert).toContain("Name the system.")
    expect(alert).toContain("A deployment key is 1-64 letters")
    expect(alert).toContain("Choose the deployment's environment.")
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
