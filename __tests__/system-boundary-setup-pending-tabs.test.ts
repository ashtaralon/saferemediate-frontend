/**
 * S0 DR05 (Codex deep review 2026-10-13; SW-20261013-01): two tabs never lose each other's unresolved setup writes.
 *
 * Each tab is its own lib/system-boundary-setup-pending.ts store -- its own page memory -- over ONE browser storage. Storage has
 * no cross-tab lock, so another tab can write between this tab's read and its write: the storage double runs the other tab's
 * step at exactly that moment (the first storage write this tab makes). A "reload" is a new store over the same storage with an
 * empty page memory. Every operation is a frozen v1 operation as the wizard makes it.
 */
import { describe, expect, it } from "vitest"
import {
  freezeOp,
  pendingForSetup,
  SETUP_PENDING_KEY,
  SETUP_PENDING_RECORD_PREFIX,
  setupPendingStore,
  type PendingSetupOp,
} from "@/lib/system-boundary-setup-pending"

const ACCOUNT = "111111111111"
const SETUP = "3f1c2a9e-5b7d-4c11-8e2f-0a9b8c7d6e5f"
const ALICE = "https://idp#alice"
const BOB = "https://idp#bob"

function op(n: number, actor: string, kind: "update" | "finish" = "finish", base = 3): PendingSetupOp {
  const requestId = `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
  const common = { version: 1 as const, actor, accountId: ACCOUNT, setupId: SETUP, requestId, base, startedAt: `2026-10-13T00:0${n}:00.000Z` }
  return freezeOp(kind === "finish" ? { ...common, kind }
    : { ...common, kind, steps: { declaration: { system: { mode: "new" } }, dispositions: [], resume_step: "review_and_start" } })
}

/** One browser storage; ``between`` runs once, at the first write or removal made through the tab view it is set on. */
function sharedStorage() {
  const data = new Map<string, string>()
  const view = () => {
    const tab = {
      between: null as null | (() => void),
      /** Every key this tab wrote or removed, in order. */
      mutated: [] as string[],
      storage: {
        get length() { return data.size },
        clear: () => data.clear(),
        getItem: (k: string) => data.get(k) ?? null,
        key: (i: number) => [...data.keys()][i] ?? null,
        removeItem: (k: string) => { tab.interleave(); tab.mutated.push(k); data.delete(k) },
        setItem: (k: string, v: string) => { tab.interleave(); tab.mutated.push(k); data.set(k, v) },
      } as Storage,
      interleave() {
        const step = tab.between
        tab.between = null
        if (step) step()
      },
    }
    return tab
  }
  return { data, view }
}

const tab = (storage: Storage) => setupPendingStore(storage, new Map<string, PendingSetupOp>())
const ids = (ops: PendingSetupOp[]) => ops.map((o) => o.requestId).sort()

describe("DR05: one storage record per unresolved write", () => {
  it("two tabs keeping writes at the same moment both survive a reload, each tuple exact", () => {
    const shared = sharedStorage()
    const a = shared.view(), b = shared.view()
    const tabA = tab(a.storage), tabB = tab(b.storage)
    const opA = op(1, ALICE, "update"), opB = op(2, ALICE)
    a.between = () => expect(tabB.put(opB)).toBe("storage")            // tab B keeps its write between A's read and A's write
    expect(tabA.put(opA)).toBe("storage")
    const reloaded = tab(shared.view().storage).read()
    expect(ids(reloaded)).toEqual(ids([opA, opB]))
    expect(reloaded.find((o) => o.requestId === opA.requestId)).toEqual(opA)
    expect(reloaded.find((o) => o.requestId === opB.requestId)).toEqual(opB)
  })

  it("settling one write while another tab keeps a new one loses neither the new one nor anything else", () => {
    const shared = sharedStorage()
    const a = shared.view(), b = shared.view()
    const tabA = tab(a.storage), tabB = tab(b.storage)
    const settled = op(1, ALICE), kept = op(2, BOB), fresh = op(3, ALICE, "update", 4)
    tabA.put(settled)
    tabB.put(kept)
    a.between = () => tabB.put(fresh)                                    // tab B keeps a write while tab A settles its own
    tabA.remove(settled.requestId)
    expect(ids(tab(shared.view().storage).read())).toEqual(ids([kept, fresh]))
  })

  it("a write kept by an earlier release in the shared list is read, offered to its person, and retired alone", () => {
    const shared = sharedStorage()
    const earlier = op(1, ALICE), others = op(2, BOB)
    const unreadable = { version: 2, kind: "finish", requestId: "not-a-v1-operation" }
    shared.data.set(SETUP_PENDING_KEY, JSON.stringify([earlier, unreadable, others]))   // the earlier release's list, as it wrote it
    const store = tab(shared.view().storage)
    expect(pendingForSetup(store.read(), ALICE, ACCOUNT, SETUP)).toEqual(earlier)
    expect(store.where(earlier.requestId)).toBe("storage")
    store.remove(earlier.requestId)
    expect(JSON.parse(shared.data.get(SETUP_PENDING_KEY)!)).toEqual([unreadable, others])
    expect(ids(tab(shared.view().storage).read())).toEqual(ids([others]))
  })

  it("settling a write of this release never writes the earlier release's list -- a still-open earlier tab may be adding to it", () => {
    const shared = sharedStorage()
    const a = shared.view()
    const tabA = tab(a.storage)
    const mine = op(1, ALICE), earlier = op(2, BOB)
    shared.data.set(SETUP_PENDING_KEY, JSON.stringify([earlier]))
    tabA.put(mine)
    a.mutated.length = 0
    tabA.remove(mine.requestId)
    expect(a.mutated).toEqual([`${SETUP_PENDING_RECORD_PREFIX}${mine.requestId}`])   // its own record, and nothing else
    expect(ids(tab(shared.view().storage).read())).toEqual(ids([earlier]))
  })

  it("a record this version cannot read, or one whose key names another request, is never offered and never removed", () => {
    const shared = sharedStorage()
    const misfiled = op(1, ALICE)
    const future = JSON.stringify({ version: 2, kind: "finish", actor: ALICE })
    shared.data.set(`${SETUP_PENDING_RECORD_PREFIX}${op(2, ALICE).requestId}`, JSON.stringify(misfiled))
    shared.data.set(`${SETUP_PENDING_RECORD_PREFIX}${op(3, ALICE).requestId}`, future)
    const store = tab(shared.view().storage)
    expect(store.read()).toEqual([])
    store.remove(misfiled.requestId)
    expect(shared.data.size).toBe(2)
  })

  it("storage that will not keep a write leaves it in this page's memory, and says so", () => {
    const shared = sharedStorage()
    const full = shared.view()
    full.storage.setItem = () => { throw new DOMException("quota", "QuotaExceededError") }
    const store = tab(full.storage)
    const write = op(1, ALICE)
    expect(store.put(write)).toBe("memory")
    expect(store.where(write.requestId)).toBe("memory")
    expect(store.read()).toEqual([write])
    expect(tab(null as unknown as Storage).put(op(2, ALICE))).toBe("memory")
  })
})
