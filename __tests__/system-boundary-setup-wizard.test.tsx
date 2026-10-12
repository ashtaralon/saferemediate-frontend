/**
 * Onboarding G2: the eight-step setup wizard (components/system-boundary/setup-wizard.tsx) over the REAL backend answers
 * (__tests__/fixtures/system-boundary-setup-captures/) and the REAL declarations view golden. The client is injected so each
 * test sees exactly the requests the wizard sends; every answer it gets back is a capture.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SetupWizard, type SetupClient } from "@/components/system-boundary/setup-wizard"
import type { DeclarationsView, DeclaredRoot, RootSelection } from "@/lib/system-boundary-authoring"
import type { PickedRoot } from "@/lib/system-boundary-declaration"
import type { SetupIntent, SetupView, SetupWrite } from "@/lib/system-boundary-setup"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function json(file: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"))
}
const capture = (name: string) => json(`__tests__/fixtures/system-boundary-setup-captures/${name}.json`)
const VIEW: DeclarationsView = json("__tests__/fixtures/system-boundary/view_after_save.json").body
const DRAFT: SetupView = capture("read_draft").body
const FINISHED: SetupView = capture("finish").body
const SID = DRAFT.setup_id
const AUTHORED = ["subject", "scope", "choice", "reason_code", "reason_text", "ref"]

async function settle() {
  await act(async () => {})
}

function client(overrides: Partial<SetupClient> = {}): SetupClient & { updates: [string, string, number, SetupIntent][] } {
  const updates: [string, string, number, SetupIntent][] = []
  return {
    updates,
    readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(DRAFT) })),
    readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: capture("status").body })),
    updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      updates.push([id, rid, base, steps])
      return { kind: "SAVED", status: 200, view: { ...structuredClone(DRAFT), state_version: base + 1, intent: steps } }
    }),
    finishSetup: vi.fn(async (): Promise<SetupWrite> => ({ kind: "SAVED", status: 201, view: structuredClone(FINISHED) })),
    ...overrides,
  }
}

function mount(c: SetupClient, picks: PickedRoot[] = []) {
  return render(<SetupWizard setupId={SID} accountId="111111111111" view={VIEW} picks={picks} onClose={() => undefined}
    client={c} stacks={{ state: "unavailable", reason: "The account census is not published yet." }}
    readApplied={async () => ({ status: 503, body: { state: "unavailable" } })}
    readResult={async () => ({ status: 503, body: {} })} />)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the setup wizard", () => {
  it("resumes at the step the setup was saved at and shows the server's own reading of each choice", async () => {
    mount(client())
    await settle()
    expect(screen.getByTestId("setup-step-review_and_start")).toBeTruthy()
    expect(screen.getByTestId("setup-state").textContent).toContain("Setup draft · revision 3")
    expect(screen.getByTestId("setup-review").textContent).toContain("Payments · LOW")
    expect(screen.getByTestId("setup-review").textContent).toContain("Not available in this release (RESOLVER_NOT_AVAILABLE)")
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toContain("1. System details")
  })

  it("saves the WHOLE intent at the version read, with authored fields only, and moves to the next step", async () => {
    const c = client()
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    expect((screen.getByLabelText("System name") as HTMLInputElement).value).toBe("Payments")
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Payments API" } })
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(c.updates).toHaveLength(1)
    const [id, rid, base, steps] = c.updates[0]
    expect([id, base, steps.resume_step]).toEqual([SID, 3, "deployments"])
    expect(rid).toMatch(/^[0-9a-f-]{36}$/)
    expect(steps.declaration).toMatchObject({ system: { mode: "new", display_name: "Payments API", criticality: "LOW" } })
    for (const d of steps.dispositions) expect(Object.keys(d).every((k) => AUTHORED.includes(k))).toBe(true)
    expect(screen.getByTestId("setup-step-deployments")).toBeTruthy()
  })

  it("an unconfirmed save is resent with the SAME request id; a definite answer releases it", async () => {
    let first = true
    const c = client({
      updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
        c.updates.push([id, rid, base, steps])
        if (first) {
          first = false
          return { kind: "RESEND_SAME", status: null, code: "NETWORK_ERROR", detail: {} }
        }
        return { kind: "SAVED", status: 200, view: { ...structuredClone(DRAFT), state_version: 4, intent: steps } }
      }),
    })
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(screen.getByRole("alert").textContent).toContain("Not confirmed yet (NETWORK_ERROR)")
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(c.updates.map((u) => u[1])).toHaveLength(2)
    expect(c.updates[1][1]).toBe(c.updates[0][1])
  })

  it("a version conflict reloads the setup and keeps what the person typed", async () => {
    const c = client({
      updateSetup: vi.fn(async (): Promise<SetupWrite> => ({ kind: "REFUSED", status: 409, code: "VERSION_CONFLICT",
                                                             detail: capture("version_conflict").body.detail })),
    })
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Typed" } })
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(c.readSetup).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("alert").textContent).toContain("changed elsewhere")
    expect((screen.getByLabelText("System name") as HTMLInputElement).value).toBe("Typed")
  })

  it("names the step a Finish refusal points at, from the server's answer", async () => {
    const incomplete = capture("incomplete").body.detail
    const c = client({ finishSetup: vi.fn(async (): Promise<SetupWrite> => ({ kind: "REFUSED", status: 409, code: "SETUP_INCOMPLETE",
                                                                               detail: incomplete })) })
    mount(c)
    await settle()
    fireEvent.click(screen.getByTestId("setup-finish"))
    await settle()
    expect(screen.getByRole("alert").textContent).toContain("System details is not complete (CRITICALITY_REQUIRED")
  })

  it("Finish lands on Progress and results with the saved revision and the association read now", async () => {
    const c = client()
    mount(c)
    await settle()
    fireEvent.click(screen.getByTestId("setup-finish"))
    await settle()
    await settle()
    expect(c.finishSetup).toHaveBeenCalledWith(SID, expect.stringMatching(/^[0-9a-f-]{36}$/), 3)
    expect(screen.getByTestId("setup-progress").textContent).toContain("Setup finished · saved as revision 2 · association current")
  })

  it("Resource boundaries takes the person's inventory picks as roots, each with the selection it was picked under", async () => {
    const root: DeclaredRoot = structuredClone(DRAFT.intent.declaration!.roots as DeclaredRoot[])[0]
    const pick: PickedRoot = { root, label: "web-1", publication: { ...(root.selection as RootSelection).publication, registration_id: "r" } }
    const c = client()
    mount(c, [pick])
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "4. Resource boundaries" }))
    fireEvent.click(screen.getByRole("button", { name: "Use my 1 pick(s) from the inventory below" }))
    expect(screen.getByTestId("setup-roots").textContent).toBe("web-1")
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect((c.updates[0][3].declaration as { roots: DeclaredRoot[] }).roots).toEqual([root])
  })
})
