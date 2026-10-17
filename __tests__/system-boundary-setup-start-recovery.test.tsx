/**
 * S0-R06 (Codex review of 7b6717ac): "Set up a system" keeps only a NEW start before sending it; a recovered unconfirmed start
 * is resent EXACTLY as it is kept and never kept again -- so it cannot write over another record under its request id.
 *
 * GuidedSetups (components/system-boundary/guided-setups.tsx) over one browser storage double; the declarations view is the
 * real golden (__tests__/fixtures/system-boundary/view_after_save.json). The mixed-version fixture -- a readable start kept by
 * an earlier release's list beside an unreadable newer record at its request id -- is explicit: this release writes no such
 * newer record. The first case is Codex's control (create-retry-opaque-record.test.tsx) on this harness.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GuidedSetups } from "@/components/system-boundary/guided-setups"
import type { DeclarationsView } from "@/lib/system-boundary-authoring"
import type { SetupWrite } from "@/lib/system-boundary-setup"
import {
  freezeOp,
  SETUP_PENDING_KEY,
  SETUP_PENDING_RECORD_PREFIX,
  setupPendingStore,
  type PendingSetupOp,
} from "@/lib/system-boundary-setup-pending"

const VIEW: DeclarationsView = JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary/view_after_save.json"), "utf8")).body
const ACCOUNT = "111111111111"
const ALICE = "https://idp#alice"
const UNKNOWN: SetupWrite = { kind: "RESEND_SAME", status: null, code: "NETWORK_ERROR", detail: {} }
const REFUSED: SetupWrite = { kind: "REFUSED", status: 403, code: "PERSON_NOT_AUTHORIZED", detail: {} }

const original = freezeOp({ version: 1, kind: "create", actor: ALICE, accountId: ACCOUNT, requestId: "11111111-1111-4111-8111-111111111111",
                            startedAt: "2026-10-13T00:01:00.000Z" })
const KEY = SETUP_PENDING_RECORD_PREFIX + original.requestId

/** One browser storage; every write is recorded with what the record held when the start was sent. */
function storageOf(entries: [string, string][]) {
  const data = new Map(entries)
  const writes: string[] = []
  const storage = {
    get length() { return data.size }, clear: () => data.clear(), getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null, removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => { writes.push(k); data.set(k, v) },
  } as Storage
  return { data, writes, storage }
}

function start(store: ReturnType<typeof setupPendingStore>, createSetup: (rid: string) => Promise<SetupWrite>) {
  render(<GuidedSetups accountId={ACCOUNT} actor={ALICE} view={VIEW} picks={[]} pendingStore={store} createSetup={createSetup}
    readStacks={async () => ({ status: 503, body: {} })} />)
  fireEvent.click(screen.getByTestId("setup-start"))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("S0-R06: a recovered start is resent as kept; only a new one is kept", () => {
  it("retrying a start the earlier release kept never writes over an unreadable newer record at its request id", async () => {
    const opaque = JSON.stringify({ ...original, version: 2, futureRecoveryToken: "must-preserve-opaque" })
    const shared = storageOf([[SETUP_PENDING_KEY, JSON.stringify([original])], [KEY, opaque]])
    const store = setupPendingStore(shared.storage, new Map<string, PendingSetupOp>())
    expect(store.read()).toEqual([original])
    let atSend: string | null = null
    const create = vi.fn(async () => { atSend = shared.data.get(KEY) ?? null; return UNKNOWN })
    start(store, create)
    await act(async () => {})
    expect(create).toHaveBeenCalledExactlyOnceWith(original.requestId)
    expect([atSend, shared.data.get(KEY), shared.writes]).toEqual([opaque, opaque, []])
    expect(shared.data.get(SETUP_PENDING_KEY)).toBe(JSON.stringify([original]))
  })

  it("a start only the earlier release's list keeps is resent from there, never copied into a record of this release", async () => {
    const list = JSON.stringify([original])
    const shared = storageOf([[SETUP_PENDING_KEY, list]])
    const store = setupPendingStore(shared.storage, new Map<string, PendingSetupOp>())
    const create = vi.fn(async () => UNKNOWN)
    start(store, create)
    await act(async () => {})
    expect(create).toHaveBeenCalledExactlyOnceWith(original.requestId)
    expect([shared.writes, shared.data.get(SETUP_PENDING_KEY)]).toEqual([[], list])
    expect(store.read()).toEqual([original])                              // unknown outcome: still offered, exactly
  })

  it("a start kept in its own record is resent exactly, and a definite answer settles exactly it", async () => {
    const shared = storageOf([[KEY, JSON.stringify(original)]])
    const store = setupPendingStore(shared.storage, new Map<string, PendingSetupOp>())
    const create = vi.fn(async () => REFUSED)
    start(store, create)
    await act(async () => {})
    expect(create).toHaveBeenCalledExactlyOnceWith(original.requestId)
    expect(shared.writes).toEqual([])                                     // resent as kept, never kept again
    expect(store.read()).toEqual([])                                      // refused by name: definite, settled
  })

  it("a NEW start is kept in its own record BEFORE it is sent, and stays kept while its answer is unknown", async () => {
    const shared = storageOf([])
    const store = setupPendingStore(shared.storage, new Map<string, PendingSetupOp>())
    let atSend: string | null = null
    const create = vi.fn(async (rid: string) => { atSend = shared.data.get(SETUP_PENDING_RECORD_PREFIX + rid) ?? null; return UNKNOWN })
    start(store, create)
    await act(async () => {})
    const [rid] = create.mock.calls[0]
    expect(JSON.parse(atSend!)).toMatchObject({ kind: "create", actor: ALICE, accountId: ACCOUNT, requestId: rid })
    expect(store.read().map((op) => op.requestId)).toEqual([rid])
    expect(store.where(rid)).toBe("storage")
  })
})

describe("S0-R06: keeping an operation never writes over another record at its request id", () => {
  it("an unreadable record, or another tuple, at that key stays; the operation is kept in this page's memory and says so", () => {
    const opaque = JSON.stringify({ ...original, version: 2, futureRecoveryToken: "must-preserve-opaque" })
    for (const present of [opaque, JSON.stringify(freezeOp({ ...original, startedAt: "2026-10-13T00:09:00.000Z" } as PendingSetupOp))]) {
      const shared = storageOf([[KEY, present]])
      const store = setupPendingStore(shared.storage, new Map<string, PendingSetupOp>())
      expect(store.put(original)).toBe("memory")
      expect([shared.data.get(KEY), shared.writes]).toEqual([present, []])
      expect(store.where(original.requestId)).toBe(present === opaque ? "memory" : "storage")
    }
  })

  it("keeping the exact operation already at its key is a no-op that answers storage", () => {
    const shared = storageOf([[KEY, JSON.stringify(original)]])
    const store = setupPendingStore(shared.storage, new Map<string, PendingSetupOp>())
    expect(store.put(original)).toBe("storage")
    expect(shared.writes).toEqual([])
  })
})
