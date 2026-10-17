/**
 * S0 NSW-01 / NSW-02 (Codex second review 2026-10-12; SW-20261013-01): a read is shown only while it answers the LATEST read.
 *
 * Progress's Applied and Result checks (components/system-boundary/applied-status.tsx, system-result.tsx) and the wizard's own
 * setup reads (setup-wizard.tsx), over REAL captures: __tests__/fixtures/system-boundary-captures/ and
 * system-boundary-setup-captures-v4/. The refusal is the one the backend routes answer for an account outside the person's
 * scope (api/system_boundary.py: 403 {code: PERSON_NOT_AUTHORIZED, account_id}); the setup refusal is the setup's own
 * SETUP_WITHHELD. FINISHING has no capture: it is the draft capture moved to FINISHING, as the wizard tests already do.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppliedStatus } from "@/components/system-boundary/applied-status"
import { SetupWizard, type SetupClient } from "@/components/system-boundary/setup-wizard"
import { SystemResult } from "@/components/system-boundary/system-result"
import type { DeclarationsView } from "@/lib/system-boundary-authoring"
import type { SetupRead, SetupView, SetupWrite } from "@/lib/system-boundary-setup"
import { freezeOp, setupPendingStore, type PendingSetupOp } from "@/lib/system-boundary-setup-pending"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function json(file: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"))
}
const progress = (name: string) => {
  const { status, body } = json(`__tests__/fixtures/system-boundary-captures/${name}.json`)
  return { status: status as number, body: body as unknown }
}
const setupCapture = (name: string) => json(`__tests__/fixtures/system-boundary-setup-captures-v4/${name}.json`).body
const ACCOUNT = "111111111111"
const APPLIED = progress("applied")
const NOT_YET = progress("applied_not_applied_yet")
const RESULT = progress("result")
const HELD = progress("result_v1_held")
const SYSTEM = (RESULT.body as { system_key: string }).system_key
const OUT_OF_SCOPE = { status: 403, body: { detail: { code: "PERSON_NOT_AUTHORIZED", account_id: ACCOUNT } } }
const VIEW: DeclarationsView = json("__tests__/fixtures/system-boundary/view_after_save.json").body
const DRAFT: SetupView = setupCapture("read_draft")
const FINISHED: SetupView = setupCapture("finish")
const FINISHING: SetupView = { ...structuredClone(DRAFT), status: "FINISHING", state_version: 4, current_attempt: 1 }
const ALICE = "https://idp#alice"
const BOB = "https://idp#bob"

type Reply = { status: number; body: unknown }

function deferred<T>() {
  let resolveIt!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolveIt = r
  })
  return { promise, resolve: resolveIt }
}

async function answer<T>(d: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => {
    d.resolve(value)
    await d.promise
  })
}

function readsInOrder<T>(...replies: Promise<T>[]) {
  const fn = vi.fn()
  for (const reply of replies) fn.mockReturnValueOnce(reply)
  return fn
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("NSW-01: Progress's Applied and Result checks show only the latest read", () => {
  it("Applied: an earlier check's success answering after a later refusal changes nothing", async () => {
    const first = deferred<Reply>(), older = deferred<Reply>(), newer = deferred<Reply>()
    render(<AppliedStatus revision={1} accountIds={[ACCOUNT]} fetcher={readsInOrder(first.promise, older.promise, newer.promise)} />)
    await answer(first, NOT_YET)
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    await answer(newer, OUT_OF_SCOPE)
    expect(screen.getByText(/not authorized/)).toBeTruthy()
    await answer(older, APPLIED)
    expect(screen.getByText(/not authorized/)).toBeTruthy()
    expect(screen.queryByText("Revision 1 is applied")).toBeNull()
  })

  it("Applied: the latest check is shown even when an earlier one answers first", async () => {
    const first = deferred<Reply>(), older = deferred<Reply>(), newer = deferred<Reply>()
    render(<AppliedStatus revision={1} accountIds={[ACCOUNT]} fetcher={readsInOrder(first.promise, older.promise, newer.promise)} />)
    await answer(first, NOT_YET)
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    await answer(older, OUT_OF_SCOPE)
    expect(screen.queryByText(/not authorized/)).toBeNull()
    await answer(newer, APPLIED)
    expect(screen.getByText("Revision 1 is applied")).toBeTruthy()
  })

  it("Result: an earlier check's members answering after a later refusal are never shown", async () => {
    const first = deferred<Reply>(), older = deferred<Reply>(), newer = deferred<Reply>()
    render(<SystemResult systemKey={SYSTEM} accountIds={[ACCOUNT]} fetcher={readsInOrder(first.promise, older.promise, newer.promise)} />)
    await answer(first, HELD)
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    await answer(newer, OUT_OF_SCOPE)
    expect(screen.getByText(/not authorized/)).toBeTruthy()
    await answer(older, RESULT)
    expect(screen.getByText(/not authorized/)).toBeTruthy()
    expect(screen.queryByText("uid:old")).toBeNull()
  })

  it("Result: the latest check's members are shown even when an earlier refusal answers last", async () => {
    const first = deferred<Reply>(), older = deferred<Reply>(), newer = deferred<Reply>()
    render(<SystemResult systemKey={SYSTEM} accountIds={[ACCOUNT]} fetcher={readsInOrder(first.promise, older.promise, newer.promise)} />)
    await answer(first, HELD)
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    fireEvent.click(screen.getByRole("button", { name: "Check again" }))
    await answer(newer, RESULT)
    await answer(older, OUT_OF_SCOPE)
    expect(screen.getByText("uid:old")).toBeTruthy()
    expect(screen.queryByText(/not authorized/)).toBeNull()
  })
})

function client(readSetup: SetupClient["readSetup"], overrides: Partial<SetupClient> = {}): SetupClient {
  return {
    readSetup,
    readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: setupCapture("status") })),
    updateSetup: vi.fn(),
    finishSetup: vi.fn(),
    ...overrides,
  }
}

function wizard(c: SetupClient, actor: string | null, ops: PendingSetupOp[] = []) {
  const store = setupPendingStore(null, new Map<string, PendingSetupOp>())
  for (const op of ops) store.put(op)
  const props = {
    setupId: DRAFT.setup_id, accountId: ACCOUNT, view: VIEW, picks: [], onClose: () => undefined, client: c, pendingStore: store,
    stacks: { state: "unavailable" as const, reason: "The account census is not published yet." },
    readApplied: async () => ({ status: 503, body: {} }), readResult: async () => ({ status: 503, body: {} }),
  }
  const ui = render(<SetupWizard {...props} actor={actor} />)
  return { ui, props, store }
}

const ok = (value: SetupView): SetupRead<SetupView> => ({ kind: "OK", value: structuredClone(value) })

describe("NSW-02: the wizard shows a setup read only while it answers the latest read", () => {
  it("an earlier FINISHING read answering after a later FINISHED one changes nothing (Codex's control)", async () => {
    const older = deferred<SetupRead<SetupView>>(), newer = deferred<SetupRead<SetupView>>()
    const readSetup = vi.fn().mockResolvedValueOnce(ok(FINISHING)).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    wizard(client(readSetup), ALICE)
    await act(async () => {})
    expect(screen.getByTestId("setup-state").textContent).toContain("finishing")
    fireEvent.click(screen.getByRole("button", { name: "Check the save again" }))
    fireEvent.click(screen.getByRole("button", { name: "Check the save again" }))
    expect(readSetup).toHaveBeenCalledTimes(3)
    await answer(newer, ok(FINISHED))
    expect(screen.getByTestId("setup-state").textContent).toContain("finished")
    await answer(older, ok(FINISHING))
    expect(screen.getByTestId("setup-state").textContent).toContain("finished")
    expect(screen.queryByRole("button", { name: "Check the save again" })).toBeNull()
  })

  it("a read sent for the earlier person changes nothing once the person changed; the setup is read again for them", async () => {
    const forNobody = deferred<SetupRead<SetupView>>()
    const readSetup = vi.fn().mockReturnValueOnce(forNobody.promise).mockResolvedValueOnce(ok(DRAFT))
    const { ui, props } = wizard(client(readSetup), null)
    ui.rerender(<SetupWizard {...props} actor={ALICE} />)
    await act(async () => {})
    expect(readSetup).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId("setup-state").textContent).toContain("draft")
    await answer(forNobody, ok(FINISHED))
    expect(screen.getByTestId("setup-state").textContent).toContain("draft")
    expect(screen.queryByTestId("setup-step-progress_and_results")).toBeNull()
  })

  it("a save answered SAVED makes every read sent before it older than it", async () => {
    const reread = deferred<SetupRead<SetupView>>()
    const saved: SetupView = { ...structuredClone(DRAFT), state_version: DRAFT.state_version + 1,
                               intent_revision: DRAFT.intent_revision + 1 }
    const readSetup = vi.fn().mockResolvedValueOnce(ok(DRAFT)).mockReturnValueOnce(reread.promise)
    const updateSetup = vi.fn(async (): Promise<SetupWrite> => ({ kind: "SAVED", status: 200, view: structuredClone(saved) }))
    const { ui, props } = wizard(client(readSetup, { updateSetup }), null)
    await act(async () => {})
    ui.rerender(<SetupWizard {...props} actor={ALICE} />)                 // the setup is read again for the verified person
    await act(async () => {})
    expect(readSetup).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await act(async () => {})
    expect(screen.getByTestId("setup-state").textContent).toContain(`revision ${saved.intent_revision}`)
    await answer(reread, ok(DRAFT))                                     // sent before the save was answered
    expect(screen.getByTestId("setup-state").textContent).toContain(`revision ${saved.intent_revision}`)
  })

  it("a refusal NOW withholds the earlier snapshot, and an unresolved write stays kept for whoever started it", async () => {
    const bobs = freezeOp({ version: 1, kind: "finish", actor: BOB, accountId: ACCOUNT, setupId: DRAFT.setup_id,
                            requestId: "8a8a8a8a-8a8a-4a8a-8a8a-8a8a8a8a8a8a", base: 3, startedAt: "2026-10-13T00:00:00.000Z" })
    const refused: SetupRead<SetupView> = { kind: "REFUSED", status: 403, code: "SETUP_WITHHELD", detail: {} }
    const readSetup = vi.fn().mockResolvedValueOnce(ok(FINISHING)).mockResolvedValueOnce(refused)
    const { store } = wizard(client(readSetup), ALICE, [bobs])
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: "Check the save again" }))
    await act(async () => {})
    expect(screen.getByRole("alert").textContent).toContain("This setup cannot be opened (SETUP_WITHHELD)")
    expect(screen.queryByTestId("setup-state")).toBeNull()
    expect(store.read()).toEqual([bobs])
  })
})
