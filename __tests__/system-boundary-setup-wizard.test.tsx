/**
 * Onboarding G2: the eight-step setup wizard (components/system-boundary/setup-wizard.tsx) over the REAL backend answers
 * (__tests__/fixtures/system-boundary-setup-captures-v3/, setup contract level 3) and the REAL declarations view golden. The client is injected so each
 * test sees exactly the requests the wizard sends; every answer it gets back is a capture.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SetupWizard, type SetupClient } from "@/components/system-boundary/setup-wizard"
import type { DeclarationsView, DeclaredRoot, RootSelection } from "@/lib/system-boundary-authoring"
import type { PickedRoot } from "@/lib/system-boundary-declaration"
import { isStatus, readAnswer } from "@/lib/system-boundary-setup"
import type { SetupIntent, SetupRead, SetupStatus, SetupView, SetupWrite } from "@/lib/system-boundary-setup"
import { freezeOp, setupPendingStore, type PendingSetupOp, type SetupPendingStore } from "@/lib/system-boundary-setup-pending"
import { GuidedSetups } from "@/components/system-boundary/guided-setups"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function json(file: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"))
}
const capture = (name: string) => json(`__tests__/fixtures/system-boundary-setup-captures-v3/${name}.json`)
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

/** A store of this test's own: page memory that no other test shares, and no browser storage unless given. */
function freshStore(storage: Storage | null = null): SetupPendingStore {
  return setupPendingStore(storage, new Map<string, PendingSetupOp>())
}

function mount(c: SetupClient, picks: PickedRoot[] = [], store: SetupPendingStore = freshStore(), actor: string | null = null) {
  return render(<SetupWizard setupId={SID} accountId="111111111111" view={VIEW} picks={picks} onClose={() => undefined}
    client={c} pendingStore={store} actor={actor} stacks={{ state: "unavailable", reason: "The account census is not published yet." }}
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
    // (G3-G) beside each choice, what its subject requires -- from the profile the server served, never a claim it is met
    expect(screen.getAllByTestId("setup-required-facts").map((n) => n.textContent)).toEqual([
      "Not supported -- Cyntro cannot acquire source code in this version (CODE_ACQUISITION_NOT_AVAILABLE)",
      `Requires committed cloudtrail_iam_usage evidence for ${DRAFT.dispositions_derived[1].scope.account_id} / `
        + `${DRAFT.dispositions_derived[1].scope.region}, read through the member stack's EvidenceReadRole (OwnCloudTrailObjectsOnly)`,
      "Not supported -- Cyntro cannot acquire infrastructure as code in this version (IAC_ACQUISITION_NOT_AVAILABLE)"])
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
    expect(screen.getAllByTestId("setup-required-facts").map((n) => n.textContent)).toEqual(
      FINISHED.dispositions_derived.map((d) => d.required_facts.support === "SUPPORTED" ? expect.stringContaining("Requires committed")
        : expect.stringContaining(`(${d.required_facts.reason})`)))
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


// ── Codex FE review 90b4ce21: G2-F16 (a frozen request until its outcome is known), G2-F17 (Finish the saved intent) ──

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return { get length() { return data.size }, clear: () => data.clear(), getItem: (k: string) => data.get(k) ?? null,
           key: (i: number) => [...data.keys()][i] ?? null, removeItem: (k: string) => void data.delete(k),
           setItem: (k: string, v: string) => void data.set(k, v) } as Storage
}

const UNKNOWN: SetupWrite = { kind: "RESEND_SAME", status: null, code: "NETWORK_ERROR", detail: {} }

describe("G2-F16: an unconfirmed write is frozen and resent exactly until it is answered", () => {
  it("an edit after an unknown save does not change the request: the same id, base and body are resent", async () => {
    const c = client({ updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      c.updates.push([id, rid, base, steps])
      return UNKNOWN
    }) })
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Edited after unknown" } })
    expect(screen.getByTestId("setup-pending").textContent).toContain("A save of this setup is not confirmed yet")
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(c.updates).toHaveLength(2)
    expect(c.updates[1]).toEqual(c.updates[0])
    expect((screen.getByLabelText("System name") as HTMLInputElement).value).toBe("Edited after unknown")   // typing kept apart
  })

  it("after the frozen save is answered, the later typing is saved as a NEW request on the new version", async () => {
    let calls = 0
    const c = client({ updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      c.updates.push([id, rid, base, steps])
      calls += 1
      return calls === 1 ? UNKNOWN : { kind: "SAVED", status: 200, view: { ...structuredClone(DRAFT), state_version: base + 1, intent: steps } }
    }) })
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Later" } })
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))   // answered: the ORIGINAL body
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))             // the later typing, new request
    await settle()
    expect(c.updates.map((u) => [u[2], (u[3].declaration?.system as { display_name?: string })?.display_name])).toEqual(
      [[3, "Payments"], [3, "Payments"], [4, "Later"]])
    expect(c.updates[2][1]).not.toBe(c.updates[0][1])
  })

  it("an unknown Finish survives Close: reopened FINISHING, the ORIGINAL request is resent", async () => {
    const store = freshStore()
    const c = client({ finishSetup: vi.fn(async (): Promise<SetupWrite> => ({ kind: "RESEND_SAME", status: 202, code: "OUTCOME_UNKNOWN", detail: {} })) })
    const first = mount(c, [], store)
    await settle()
    fireEvent.click(screen.getByTestId("setup-finish"))
    await settle()
    const original = vi.mocked(c.finishSetup).mock.calls[0]
    first.unmount()
    c.readSetup = vi.fn(async () => ({ kind: "OK" as const, value: { ...structuredClone(DRAFT), status: "FINISHING" as const, state_version: 4, current_attempt: 1 } }))
    mount(c, [], store)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Check the save again" }))
    await settle()
    expect(vi.mocked(c.finishSetup).mock.calls[1]).toEqual(original)
  })

  it("without the original Finish in this browser, checking again only reads -- never a new Finish request", async () => {
    const c = client()
    c.readSetup = vi.fn(async () => ({ kind: "OK" as const, value: { ...structuredClone(DRAFT), status: "FINISHING" as const, state_version: 4, current_attempt: 1 } }))
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Check the save again" }))
    await settle()
    expect(c.finishSetup).not.toHaveBeenCalled()
    expect(c.readSetup).toHaveBeenCalledTimes(2)
  })

  it("a verified person's unknown save survives a reload; another person is never offered it", async () => {
    const storage = memoryStorage()
    const alice = "https://idp#alice"
    const c = client({ updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      c.updates.push([id, rid, base, steps])
      return UNKNOWN
    }) })
    const first = mount(c, [], freshStore(storage), alice)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    first.unmount()
    const reloaded = mount(c, [], freshStore(storage), alice)        // a reload: new page memory, the same browser storage
    await settle()
    expect(screen.getByTestId("setup-pending").textContent).not.toContain("only until this page is reloaded")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))                // reopened at Review: its Save resends it
    await settle()
    expect(c.updates[1]).toEqual(c.updates[0])
    reloaded.unmount()
    mount(c, [], freshStore(storage), "https://idp#bob")
    await settle()
    expect(screen.queryByTestId("setup-pending")).toBeNull()
  })

  it("without a verified person or with storage blocked, it says the unconfirmed request is kept only until a reload", async () => {
    const c = client({ updateSetup: vi.fn(async (): Promise<SetupWrite> => UNKNOWN) })
    const blocked = { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") },
                      removeItem: () => { throw new Error("blocked") } } as unknown as Storage
    mount(c, [], freshStore(blocked), "https://idp#alice")
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(screen.getByTestId("setup-pending").textContent).toContain("only until this page is reloaded")
  })

  it("the frozen body cannot be changed after it was sent: a resend carries the original even if something tried", async () => {
    let calls = 0
    const c = client({ updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      c.updates.push([id, rid, base, structuredClone(steps)])
      calls += 1
      if (calls === 1) {
        try {
          (steps.declaration as { system: { display_name: string } }).system.display_name = "mutated in flight"
        } catch {
          // frozen: the attempt to change it throws, and the stored request stays as sent
        }
        return UNKNOWN
      }
      return UNKNOWN
    }) })
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect((c.updates[1][3].declaration?.system as { display_name?: string }).display_name).toBe("Payments")
  })

  it("an unknown person's unconfirmed save is kept in this page only, even where storage works -- and it says so", async () => {
    const storage = memoryStorage()
    const c = client({ updateSetup: vi.fn(async (): Promise<SetupWrite> => UNKNOWN) })
    mount(c, [], freshStore(storage), null)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(screen.getByTestId("setup-pending").textContent).toContain("only until this page is reloaded")
    expect(storage.length).toBe(0)                                   // nothing of an unverified person reaches storage
  })

  it("a start whose answer was lost is retried with the same request id after Close", async () => {
    const store = freshStore()
    const ids: string[] = []
    const createSetup = vi.fn(async (rid: string): Promise<SetupWrite> => {
      ids.push(rid)
      return ids.length === 1 ? UNKNOWN : { kind: "SAVED", status: 201, view: structuredClone(DRAFT) }
    })
    const props = { accountId: "111111111111", view: VIEW, picks: [], actor: null, createSetup, pendingStore: store,
                    readStacks: async () => ({ status: 503, body: {} }), client: client() }
    const first = render(<GuidedSetups {...props} />)
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    first.unmount()
    render(<GuidedSetups {...props} />)
    expect(screen.getByTestId("setup-start").textContent).toBe("Retry the unconfirmed start")
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    expect(ids).toHaveLength(2)
    expect(ids[1]).toBe(ids[0])
  })
})

describe("G2-F17: Finish commits exactly the saved intent that Review shows as saved", () => {
  it("unsaved edits are shown apart and Finish waits for a confirmed Save; then it finishes on the saved version", async () => {
    const c = client()
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Review name not yet saved" } })
    fireEvent.click(screen.getByRole("button", { name: "7. Review and start" }))
    expect(screen.getByTestId("setup-review").textContent).toContain("Saved revision 3: Payments")
    expect(screen.getByTestId("setup-review-unsaved").textContent).toContain("Review name not yet saved")
    expect((screen.getByTestId("setup-finish") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId("setup-finish"))
    await settle()
    expect(c.finishSetup).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    expect(c.updates).toHaveLength(1)
    expect(screen.queryByTestId("setup-review-unsaved")).toBeNull()
    expect((screen.getByTestId("setup-finish") as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId("setup-finish"))
    await settle()
    expect(c.finishSetup).toHaveBeenCalledWith(SID, expect.stringMatching(/^[0-9a-f-]{36}$/), 4)
  })

  it("an unconfirmed save blocks Finish until it is answered", async () => {
    const c = client({ updateSetup: vi.fn(async (): Promise<SetupWrite> => UNKNOWN) })
    mount(c)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    expect((screen.getByTestId("setup-finish") as HTMLButtonElement).disabled).toBe(true)
    expect(c.finishSetup).not.toHaveBeenCalled()
  })
})

// ── Codex FE review 6d7c5205: G2-F18 (the CURRENT person, account and setup), G2-F19 (where the operation is ACTUALLY kept) ──

const ALICE = "https://idp#alice"
const BOB = "https://idp#bob"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

/** Storage that takes small values but throws QuotaExceeded for anything the size of a real operation. */
function smallStorage(limit = 64): Storage {
  const data = memoryStorage()
  return { ...data, getItem: (k: string) => data.getItem(k), removeItem: (k: string) => data.removeItem(k),
           setItem: (k: string, v: string) => {
             if (v.length > limit) throw new DOMException("quota", "QuotaExceededError")
             data.setItem(k, v)
           } } as Storage
}

function wizardProps(c: SetupClient, store: SetupPendingStore) {
  return { setupId: SID, accountId: "111111111111", view: VIEW, picks: [] as PickedRoot[], onClose: () => undefined, client: c,
           pendingStore: store, stacks: { state: "unavailable" as const, reason: "The account census is not published yet." },
           readApplied: async () => ({ status: 503, body: { state: "unavailable" } }), readResult: async () => ({ status: 503, body: {} }) }
}

describe("G2-F18: every send and every answer is judged against the CURRENT person, account and setup", () => {
  it("the person changes from Alice to Bob: Alice's unconfirmed save is held for her, never resent by Bob", async () => {
    const c = client({ updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      c.updates.push([id, rid, base, steps])
      return UNKNOWN
    }) })
    const store = freshStore(memoryStorage())
    const props = wizardProps(c, store)
    const ui = render(<SetupWizard {...props} actor={ALICE} />)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    const alices = c.updates[0][1]
    ui.rerender(<SetupWizard {...props} actor={BOB} />)
    await settle()
    expect(screen.queryByTestId("setup-pending")).toBeNull()                         // not offered to Bob as his
    expect(screen.getByTestId("setup-pending-others").textContent).toContain("1 unconfirmed request(s)")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    expect(c.updates).toHaveLength(2)
    expect(c.updates[1][1]).not.toBe(alices)                                         // Bob's own NEW request
    expect(store.read().filter((op) => op.requestId === alices).map((op) => op.actor)).toEqual([ALICE])
    ui.rerender(<SetupWizard {...props} actor={ALICE} />)                             // Alice is back: hers is offered again
    await settle()
    expect(screen.getByTestId("setup-pending").textContent).toContain("A save of this setup is not confirmed yet")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    expect(c.updates[2]).toEqual(c.updates[0])
  })

  it("the person is verified after the page opened: a save made before that is held, not resent as theirs", async () => {
    const c = client({ updateSetup: vi.fn(async (id: string, rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      c.updates.push([id, rid, base, steps])
      return UNKNOWN
    }) })
    const props = wizardProps(c, freshStore(memoryStorage()))
    const ui = render(<SetupWizard {...props} actor={null} />)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    ui.rerender(<SetupWizard {...props} actor={ALICE} />)
    await settle()
    expect(screen.queryByTestId("setup-pending")).toBeNull()
    expect(screen.getByTestId("setup-pending-others").textContent).toContain("before you were verified")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    expect(c.updates[1][1]).not.toBe(c.updates[0][1])
  })

  it("an answer that arrives after the person changed resolves the request but does not drive the new person's screen", async () => {
    const answer = deferred<SetupWrite>()
    const c = client({ updateSetup: vi.fn(async (): Promise<SetupWrite> => answer.promise) })
    const store = freshStore(memoryStorage())
    const props = wizardProps(c, store)
    const ui = render(<SetupWizard {...props} actor={ALICE} />)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "1. System details" }))
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    expect(store.read()).toHaveLength(1)
    ui.rerender(<SetupWizard {...props} actor={BOB} />)
    await settle()
    await act(async () => {
      answer.resolve({ kind: "SAVED", status: 200, view: { ...structuredClone(DRAFT), state_version: 4 } })
    })
    await settle()
    expect(store.read()).toHaveLength(0)                                            // definite: Alice's request is resolved
    expect(screen.getByTestId("setup-step-system_details")).toBeTruthy()           // ...but Bob's screen did not move
    expect(screen.getByTestId("setup-state").textContent).toContain("revision 3")
  })
})

describe("G2-F19: the wizard says where an unconfirmed operation is ACTUALLY kept", () => {
  it("storage that takes a small probe but not the operation: kept in page memory, and the banner says so", async () => {
    const storage = smallStorage()
    storage.setItem("probe", "1")                                                    // a tiny write works
    const store = freshStore(storage)
    const c = client({ updateSetup: vi.fn(async (): Promise<SetupWrite> => UNKNOWN) })
    render(<SetupWizard {...wizardProps(c, store)} actor={ALICE} />)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await settle()
    expect(screen.getByTestId("setup-pending").textContent).toContain("only until this page is reloaded")
    expect(freshStore(storage).read()).toHaveLength(0)                              // a reload would find nothing
  })

  it("put answers where the exact operation was kept: storage only when it reads back", () => {
    const op = freezeOp({ version: 1, kind: "finish", actor: ALICE, accountId: "111111111111", setupId: SID,
                          requestId: "6f1c2c1e-9d7b-4a51-9f7e-0c1a2b3c4d5e", base: 3, startedAt: "2026-10-12T00:00:00Z" })
    const working = freshStore(memoryStorage())
    expect(working.put(op)).toBe("storage")
    expect(working.where(op.requestId)).toBe("storage")
    const silent = { ...memoryStorage(), getItem: () => null, setItem: () => undefined, removeItem: () => undefined } as Storage
    const dropped = freshStore(silent)                                               // a write that "succeeds" but keeps nothing
    expect(dropped.put(op)).toBe("memory")
    expect(dropped.where(op.requestId)).toBe("memory")
    expect(freshStore(null).put(op)).toBe("memory")
    expect(freshStore(memoryStorage()).put({ ...op, actor: null })).toBe("memory")
  })
})

describe("G2-F18/F19: the start of a setup", () => {
  function startProps(createSetup: (rid: string) => Promise<SetupWrite>, store: SetupPendingStore) {
    return { accountId: "111111111111", view: VIEW, picks: [] as PickedRoot[], createSetup, pendingStore: store,
             readStacks: async () => ({ status: 503, body: {} }), client: client() }
  }

  it("an unconfirmed start that storage cannot keep warns it is lost on reload; one kept in storage does not", async () => {
    const lost = render(<GuidedSetups {...startProps(async () => UNKNOWN, freshStore(null))} actor={ALICE} />)
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    expect(screen.getByTestId("setup-start-memory").textContent).toContain("only until this page is reloaded")
    lost.unmount()
    render(<GuidedSetups {...startProps(async () => UNKNOWN, freshStore(memoryStorage()))} actor={ALICE} />)
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    expect(screen.queryByTestId("setup-start-memory")).toBeNull()
  })

  it("the person changes from Alice to Bob: Alice's unconfirmed start is held for her, never resent by Bob", async () => {
    const ids: string[] = []
    const props = startProps(async (rid) => { ids.push(rid); return UNKNOWN }, freshStore(memoryStorage()))
    const ui = render(<GuidedSetups {...props} actor={ALICE} />)
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    ui.rerender(<GuidedSetups {...props} actor={BOB} />)
    await settle()
    expect(screen.getByTestId("setup-start").textContent).toBe("Set up a system")
    expect(screen.getByTestId("setup-start-others").textContent).toContain("1 unconfirmed start(s)")
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    expect(ids[1]).not.toBe(ids[0])
    ui.rerender(<GuidedSetups {...props} actor={ALICE} />)
    await settle()
    expect(screen.getByTestId("setup-start").textContent).toBe("Retry the unconfirmed start")
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    expect(ids[2]).toBe(ids[0])
  })

  it("a start answered after the person changed does not open a setup for the new person", async () => {
    const answer = deferred<SetupWrite>()
    const store = freshStore(memoryStorage())
    const props = startProps(async () => answer.promise, store)
    const ui = render(<GuidedSetups {...props} actor={ALICE} />)
    fireEvent.click(screen.getByTestId("setup-start"))
    await settle()
    ui.rerender(<GuidedSetups {...props} actor={BOB} />)
    await settle()
    await act(async () => {
      answer.resolve({ kind: "SAVED", status: 201, view: structuredClone(DRAFT) })
    })
    await settle()
    expect(store.read()).toHaveLength(0)
    expect(screen.getByTestId("guided-setups")).toBeTruthy()                        // still the start panel, no wizard
    expect(screen.getByTestId("setup-start").hasAttribute("disabled")).toBe(false)
  })
})

// ── onboarding G3-A: owner requests, as the backend derives them (captured at setup contract level 3) ──────────────────────────────

const V3 = (name: string) => json(`__tests__/fixtures/system-boundary-setup-captures-v3/${name}.json`)

describe("G3-A: owner requests on Review and on Progress", () => {
  it("Review lists what finishing the SAVED revision will request -- the server's planned requests, nothing asked yet", async () => {
    const status = V3("status").body as SetupStatus
    const planned: SetupStatus = { ...status, setup: { ...status.setup, status: "DRAFT" }, operations: status.operations.map((o) => (
      { op_id: o.op_id, kind: o.kind, subject: o.subject, scope: o.scope, required_authority: o.required_authority,
        state: "PLANNED" as const, reason: null })) }
    const readSetupStatus = vi.fn(async () => ({ kind: "OK" as const, value: planned }))
    const c = client({ readSetupStatus })
    mount(c)
    await settle()
    expect(screen.getByTestId("setup-step-review_and_start")).toBeTruthy()
    expect(readSetupStatus).toHaveBeenCalledWith(SID)
    const requests = screen.getByTestId("setup-review-requests").textContent ?? ""
    expect(requests).toContain("Finishing the saved revision will ask an account administrator for:")
    expect(requests).toContain("Infrastructure as code · 111111111111 / eu-west-1: Will be requested from an account administrator when you finish")
    expect(screen.getByTestId("setup-review").textContent).toContain("nothing is sent to AWS")
  })

  it("Progress lists each request as the server reads it NOW (pending, and how many current requests the demand has)", async () => {
    const status = V3("status").body as SetupStatus
    const c = client({ readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(FINISHED) })),
                       readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: status })) })
    mount(c)
    await settle()
    await settle()
    const requests = screen.getByTestId("setup-progress-requests").textContent ?? ""
    expect(requests).toContain("Requested from an account administrator:")
    expect(requests).toContain("Infrastructure as code · 111111111111 / eu-west-1: Requested from an account administrator -- waiting")
  })

  it("a request the server holds or withdrew is shown with its reason, never as pending", async () => {
    const status = V3("status").body as SetupStatus
    const held: SetupStatus = { ...status, operations: status.operations.map((o) => (
      { ...o, state: "WITHDRAWN" as const, reason: "ACCOUNT_REMOVED", demand: { state: "NO_CURRENT_REQUEST" as const, current_requests: 0 },
        observation: { state: "UNKNOWN" as const, limitation: "REQUEST_NOT_CURRENT" } })) }
    const c = client({ readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(FINISHED) })),
                       readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: held })) })
    mount(c)
    await settle()
    await settle()
    const requests = screen.getByTestId("setup-progress-requests").textContent ?? ""
    expect(requests).toContain("Withdrawn -- the account was removed from Cyntro (ACCOUNT_REMOVED)")
    expect(requests).not.toContain("waiting")
  })

  it("after Finish, Review's planned list is dropped -- never shown as the finished setup's requests while they are read", async () => {
    const status = V3("status").body as SetupStatus
    const planned: SetupStatus = { ...status, setup: { ...status.setup, status: "DRAFT" }, operations: status.operations.map((o) => (
      { op_id: o.op_id, kind: o.kind, subject: o.subject, scope: o.scope, required_authority: o.required_authority,
        state: "PLANNED" as const, reason: null })) }
    const readSetupStatus = vi.fn()
      .mockImplementationOnce(async () => ({ kind: "OK" as const, value: planned }))
      .mockImplementation(() => new Promise(() => undefined))                    // the finished setup's read has not answered
    const c = client({ readSetupStatus })
    mount(c)
    await settle()
    expect(screen.getByTestId("setup-review-requests").textContent).toContain("Will be requested")
    fireEvent.click(screen.getByTestId("setup-finish"))
    await settle()
    await settle()
    expect(screen.getByTestId("setup-progress")).toBeTruthy()
    expect(readSetupStatus).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId("setup-progress-requests")).toBeNull()
    expect(screen.getByTestId("setup-progress").textContent).not.toContain("Will be requested")
  })

  it("a FINISHED setup's Review lists nothing as still to be requested -- its made requests are not re-announced there", async () => {
    const status = V3("status").body as SetupStatus
    const c = client({ readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(FINISHED) })),
                       readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: status })) })
    mount(c)
    await settle()
    await settle()
    expect(screen.getByTestId("setup-progress-requests").textContent).toContain("waiting")
    fireEvent.click(screen.getByRole("button", { name: /Review and start/ }))       // the step list lets a finished setup look back
    await settle()
    await settle()
    expect(screen.getByTestId("setup-review")).toBeTruthy()
    expect(screen.queryByTestId("setup-review-requests")).toBeNull()
  })

  it("(G3-C.5) Progress shows what collected evidence shows for each made request -- in the server's words, never fulfilment", async () => {
    const status = V3("status").body as SetupStatus
    const fact = { source: "cloudtrail_iam_usage", region: "eu-west-1", source_scope: "all-active-trails",
                   earliest_verified_at: "2026-09-30T23:17:26Z", earliest_verified_basis: "first_verified_digest",
                   first_verified_collection_at: null, verified_through: "2026-10-01T05:17:26Z", committed_generation: 1,
                   head_manifest_hash: `v1:${"a".repeat(64)}` }
    const observed: SetupStatus = { ...status, operations: status.operations.map((o) => (
      { ...o, subject: "history:cloudtrail", observation: { state: "OBSERVED" as const, as_of: "2026-10-12T08:00:00Z", registration_id: "5".repeat(32),
                             facts: [fact], not_started: [] } })) }
    for (const [answer, words] of [[status, "Collected evidence cannot be read for this account now (COVERAGE_NOT_ADMITTED"],
                                   [observed, "not a fulfilment of this request"]] as const) {
      const c = client({ readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(FINISHED) })),
                         readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: answer })) })
      const { unmount } = mount(c)
      await settle()
      await settle()
      expect(screen.getByTestId("setup-request-observation").textContent).toContain(words)
      if (answer === observed) {                                            // the details carry every pinned fact
        expect(screen.getByTestId("setup-request-evidence").textContent).toContain("eu-west-1 · all-active-trails: verified 2026-09-30T23:17:26Z")
      } else {
        expect(screen.queryByTestId("setup-request-evidence")).toBeNull()   // an answer with no detail shows none
      }
      expect(screen.getByTestId("setup-progress-requests").textContent).toContain("Requested from an account administrator -- waiting")
      unmount()
    }
  })

  it("(F26) an unrenderable publication time is refused by the client's own parser -- Progress names it, never throws", async () => {
    const body = V3("status").body as SetupStatus & { contract: string }
    const bad = { ...body, operations: body.operations.map((o) => ({ ...o, subject: "history:cloudtrail", observation: {
      state: "OBSERVED", as_of: "2026-10-12T08:00:00Z", registration_id: "5".repeat(32), not_started: [],
      facts: [{ source: "cloudtrail_iam_usage", region: "eu-west-1", source_scope: "all-active-trails",
                earliest_verified_at: "2026-09-30T23:17:26Z", earliest_verified_basis: "first_verified_digest",
                first_verified_collection_at: null, verified_through: "2026-10-01T05:17:26Z", committed_generation: 1,
                head_manifest_hash: `v1:${"a".repeat(64)}` }],
      publication: { read_model_generation: "source_coverage:v1:v1:x", published_at_epoch: 8_640_000_000_001 } } })) }
    const readSetupStatus = vi.fn(async () => readAnswer({ status: 200, json: bad }, isStatus))   // the real client path
    const c = client({ readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(FINISHED) })), readSetupStatus })
    mount(c)
    await settle()
    await settle()
    expect(screen.getByTestId("setup-progress").textContent).toContain("The requests could not be read (MALFORMED_RESPONSE).")
    expect(screen.queryByTestId("setup-request-evidence")).toBeNull()
  })

  it("when the requests cannot be read, Review says so instead of showing none", async () => {
    const c = client({ readSetupStatus: vi.fn(async () => ({ kind: "UNAVAILABLE" as const, status: 200, code: "SETUP_CONTRACT_UNKNOWN" })) })
    mount(c)
    await settle()
    expect(screen.queryByTestId("setup-review-requests")).toBeNull()
    expect(screen.getByTestId("setup-review").textContent).toContain("The requests could not be read (SETUP_CONTRACT_UNKNOWN).")
  })
})

// ── installed QA 0.10.10 (Codex Chrome E2E): after a reload a person returns to a FINISHED setup's Progress and results ──

describe("installed QA 0.10.10: a finished setup is returned to from Your setups", () => {
  const summary = (over: Partial<SetupView>): SetupView => ({ ...structuredClone(DRAFT), ...over })
  const mixed = (owner: string) => [
    summary({ setup_id: "5e7a0000-0000-4000-8000-0000000000a1", status: "DRAFT", owner }),
    summary({ setup_id: FINISHED.setup_id, status: "FINISHED", owner }),
    summary({ setup_id: "5e7a0000-0000-4000-8000-0000000000a2", status: "SUPERSEDED", owner }),
    summary({ setup_id: "5e7a0000-0000-4000-8000-0000000000a3", status: "CANCELLED", owner }),
    summary({ setup_id: "5e7a0000-0000-4000-8000-0000000000a4", status: "FINISHED", mode: "correct", owner }),
    summary({ setup_id: "5e7a0000-0000-4000-8000-0000000000a5", status: "FINISHED", owner: BOB }),
  ]

  const reads = () => ({ readApplied: vi.fn(async () => ({ status: 503, body: { state: "unavailable" } })),
                         readResult: vi.fn(async () => ({ status: 503, body: {} })) })

  function panel(actor: string, listSetups: () => Promise<SetupRead<{ setups: SetupView[]; next_cursor: string | null }>>,
                 c: SetupClient, fetchers = reads()) {
    return render(<GuidedSetups accountId="111111111111" view={VIEW} picks={[]} actor={actor} listSetups={listSetups} client={c}
      pendingStore={freshStore()} readStacks={async () => ({ status: 503, body: {} })} {...fetchers} />)
  }

  it("lists this person's finished setups apart and opens one on Progress and results; nothing else is offered", async () => {
    const listSetups = vi.fn(async () => ({ kind: "OK" as const, value: { setups: mixed(ALICE), next_cursor: null } }))
    const c = client({ readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(FINISHED) })) })
    const fetchers = reads()
    panel(ALICE, listSetups, c, fetchers)
    expect(listSetups).not.toHaveBeenCalled()                                  // nothing is read until the person asks
    fireEvent.click(screen.getByTestId("setup-mine"))
    await settle()
    expect(screen.getByTestId("setup-resume-list").querySelectorAll("li")).toHaveLength(1)      // the draft only
    const finishedList = screen.getByTestId("setup-finished-list")
    expect(finishedList.querySelectorAll("li")).toHaveLength(1)               // not superseded / cancelled / correct / Bob's
    expect(finishedList.textContent).toContain("Progress and results of the setup finished")
    fireEvent.click(finishedList.querySelector("button")!)
    await settle()
    await settle()
    expect(c.readSetup).toHaveBeenCalledWith(FINISHED.setup_id)
    expect(screen.getByTestId("setup-progress").textContent).toContain("Setup finished")
    // Progress read the applied state and the system's result through what this panel was given -- never a live backend
    expect(fetchers.readApplied).toHaveBeenCalledWith("111111111111")
    expect(fetchers.readResult).toHaveBeenCalledWith("111111111111", expect.any(String))
  })

  it("another person is offered none of them, and a finished setup alone is not called in progress", async () => {
    const c = client()
    panel(BOB, vi.fn(async () => ({ kind: "OK" as const, value: { setups: mixed(ALICE).slice(0, 5), next_cursor: null } })), c)
    fireEvent.click(screen.getByTestId("setup-mine"))
    await settle()
    expect(screen.queryByTestId("setup-resume-list")).toBeNull()
    expect(screen.queryByTestId("setup-finished-list")).toBeNull()
    cleanup()
    panel(ALICE, vi.fn(async () => ({ kind: "OK" as const, value: { setups: [mixed(ALICE)[1]], next_cursor: null } })), c)
    fireEvent.click(screen.getByTestId("setup-mine"))
    await settle()
    expect(screen.getByText("You have no setup in progress.")).toBeTruthy()
    expect(screen.getByTestId("setup-finished-list").querySelectorAll("li")).toHaveLength(1)
  })

  it("when the person changes, the previous person's finished setups are gone at once -- nothing is shown for someone else", async () => {
    const listSetups = vi.fn(async () => ({ kind: "OK" as const, value: { setups: mixed(ALICE), next_cursor: null } }))
    const c = client()
    const props = { accountId: "111111111111", view: VIEW, picks: [] as PickedRoot[], listSetups, client: c,
                    pendingStore: freshStore(), readStacks: async () => ({ status: 503, body: {} }) }
    const ui = render(<GuidedSetups {...props} actor={ALICE} />)
    fireEvent.click(screen.getByTestId("setup-mine"))
    await settle()
    expect(screen.getByTestId("setup-finished-list")).toBeTruthy()
    ui.rerender(<GuidedSetups {...props} actor={BOB} />)
    await settle()
    expect(screen.queryByTestId("setup-finished-list")).toBeNull()
    expect(screen.queryByTestId("setup-resume-list")).toBeNull()
  })
})
