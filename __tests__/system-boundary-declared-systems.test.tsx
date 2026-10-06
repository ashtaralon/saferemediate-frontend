/**
 * The mounted "Declared on this account" panel (components/system-boundary/declared-systems.tsx) over the PRODUCER goldens
 * (__tests__/fixtures/system-boundary, backend 472d4105). A person's clicks must send EXACTLY the corrections the real
 * route answered (only the request id the client mints is pinned, to the captured one, for its FIRST mint), and the real
 * answers decide what is shown.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DeclaredSystems } from "@/components/system-boundary/declared-systems"
import type { DeclarationsView, DeclaredRoot } from "@/lib/system-boundary-authoring"
import type { PickedRoot } from "@/lib/system-boundary-declaration"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function golden(name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary", `${name}.json`), "utf8"))
}

const REQUESTS = golden("requests")
const ACCOUNT: string = REQUESTS.create.declaration.roots[0].account_id
const view = (name: string): DeclarationsView => golden(name).body
type Id = `${string}-${string}-${string}-${string}-${string}`

function picked(root: DeclaredRoot): PickedRoot {
  return { root, label: root.resource_uid.split("/").pop()!, publication: { ...root.selection.publication, registration_id: "r" } }
}

function mount(current: DeclarationsView, ids: string[], answers: string[], picks: PickedRoot[] = []) {
  const uuid = vi.spyOn(globalThis.crypto, "randomUUID")
  for (const id of ids) uuid.mockReturnValueOnce(id as Id)
  uuid.mockReturnValue("00000000-0000-4000-8000-0000000000ee")
  const spy = vi.spyOn(globalThis, "fetch")
  for (const name of answers) spy.mockResolvedValueOnce(Response.json(golden(name).body, { status: golden(name).status }))
  const onSaved = vi.fn()
  const onEnvelope = vi.fn()
  render(<DeclaredSystems view={current} accountId={ACCOUNT} picks={picks} onSaved={onSaved} onEnvelope={onEnvelope} />)
  return { spy, onSaved, onEnvelope }
}

function body(spy: { mock: { calls: unknown[][] } }, n = 0): unknown {
  return JSON.parse((spy.mock.calls[n][1] as RequestInit).body as string)
}

async function click(name: string | RegExp, scope: HTMLElement = document.body) {
  await act(async () => {
    fireEvent.click(within(scope).getByRole("button", { name }))
  })
}

function deploymentRow(key: string): HTMLElement {
  return screen.getByText(key, { selector: "span" }).closest("div") as HTMLElement
}

afterEach(() => vi.restoreAllMocks())

describe("correcting what is declared on this account", () => {
  it("lists each System, its Deployments here and this account's roots", () => {
    mount(view("view_after_replace"), [], [])
    const panel = screen.getByTestId("declared-systems").textContent ?? ""
    expect(panel).toContain("Payments")
    expect(panel).toContain("criticality CRITICAL")
    expect(panel).toContain('PRODUCTION ("prd")')
    expect(panel).toContain("web-role")
    expect(panel).toContain("batch-role")
    expect(panel).not.toContain("api-role")                               // replaced: A+C, never A+B+C
  })

  it("a replacement is ONE correction -- remove B, add the picked C -- sent exactly as the real route saved it", async () => {
    const before = view("view_before_replace")
    const { spy, onSaved, onEnvelope } = mount(before, [REQUESTS.replace.request_id], ["correction_replace_saved"],
                                               [picked(REQUESTS.replace.correction.roots.add[0])])
    await click("Change roots", deploymentRow("prod"))
    fireEvent.change(screen.getByLabelText("Change api-role"), { target: { value: "remove" } })
    fireEvent.click(screen.getByLabelText(/Add the 1 picked resource here/))
    await click("Review change")
    const review = screen.getByTestId("correction-review").textContent ?? ""
    expect(review).toContain("Remove: api-role (their declarations, not the AWS resources).")
    expect(review).toContain("Add: batch-role.")
    expect(review).toContain("This is ONE revision: until it is saved, the declared roots stay as they are.")
    await click("Save change")
    expect(body(spy)).toEqual(REQUESTS.replace)
    expect(onEnvelope.mock.calls[0][0]).toEqual(REQUESTS.replace)        // kept before its first send (T18)
    expect(screen.getByTestId("correction-outcome").textContent).toContain("Saved as revision 5.")
    expect(onSaved).toHaveBeenCalledWith(5, true)
  })

  it("an environment edit shows the KEPT word, is refused by name, and the corrected edit is a NEW request", async () => {
    const before = view("view_before_environment")
    const { spy, onSaved } = mount(before, [REQUESTS.env_conflict.request_id, REQUESTS.env.request_id],
                                   ["correction_environment_conflict", "correction_environment_saved"])
    await click("Change environment", deploymentRow("prod"))
    fireEvent.change(screen.getByLabelText("New environment"), { target: { value: "STAGING" } })
    await click("Review change")
    expect(screen.getByTestId("correction-review").textContent).toContain('Your own word "production" is KEPT and must still fit the environment.')
    await click("Save change")
    expect(body(spy)).toEqual(REQUESTS.env_conflict)
    const refused = screen.getByTestId("correction-outcome").textContent ?? ""
    expect(refused).toContain("Your own environment word names a different environment.")
    expect(refused).toContain("Code: ENVIRONMENT_RAW_CONFLICT")
    await click("Back to edit")
    fireEvent.click(screen.getByLabelText(/Clear my word/))
    await click("Review change")
    expect(screen.getByTestId("correction-review").textContent).toContain('Your own word "production" is cleared.')
    await click("Save change")
    expect(body(spy, 1)).toEqual(REQUESTS.env)
    expect(onSaved).toHaveBeenCalledWith(7, false)
  })

  it("a move names the destination at the versions read; a criticality edit is tenant-wide", async () => {
    const { spy } = mount(view("view_before_move"), [REQUESTS.move.request_id], ["correction_move_saved"])
    await click("Change roots", deploymentRow("prod"))
    fireEvent.change(screen.getByLabelText("Change web-role"), { target: { value: view("view_before_move").deployments.find(
      (d) => d.body.deployment_key === "dr")!.key } })
    await click("Review change")
    expect(screen.getByTestId("correction-review").textContent).toContain("Move: web-role to dr.")
    await click("Save change")
    expect(body(spy)).toEqual(REQUESTS.move)
  })

  it("criticality: the tiers are the server's; the System is edited tenant-wide at the version read", async () => {
    const { spy, onSaved } = mount(view("view_after_save"), [REQUESTS.correction.request_id], ["correction_saved"])
    await click("Change criticality")
    fireEvent.change(screen.getByLabelText("New criticality"), { target: { value: "CRITICAL" } })
    await click("Review change")
    expect(screen.getByTestId("correction-review").textContent).toContain("Criticality becomes CRITICAL (tenant-wide).")
    await click("Save change")
    expect(body(spy)).toEqual(REQUESTS.correction)
    expect(onSaved).toHaveBeenCalledWith(3, false)
  })

  it("nothing declared on the account says so", () => {
    mount(view("view_initial"), [], [])
    expect(screen.getByTestId("declared-systems").textContent).toBe("Nothing is declared on this account yet.")
  })
})
