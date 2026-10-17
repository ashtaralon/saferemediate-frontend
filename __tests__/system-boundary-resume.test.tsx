/**
 * T18: a save survives closing the tab, a reload, a second tab, an account switch and a lost response -- never lost, never
 * duplicated (lib/system-boundary-pending.ts, components/system-boundary/pending-saves.tsx, the wrapper's persistence).
 * Every backend answer is a PRODUCER golden (__tests__/fixtures/system-boundary, backend 2ac7753a), read through the real
 * client; the browser storage is an in-memory Storage.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DeclareFromInventory } from "@/components/system-boundary/declare-from-inventory"
import { PendingSaves } from "@/components/system-boundary/pending-saves"
import type { InventoryRow, PublicationIdentity } from "@/lib/account-inventory"
import type { CreateEnvelope, DeclarationsView, OwnGrant, ReadResult } from "@/lib/system-boundary-authoring"
import type { RootSelection } from "@/lib/system-boundary-authoring"   // deep fixtures (wizard on discovery widened DeclaredRoot)
import type { InventorySelection } from "@/lib/account-inventory"
import { PENDING_KEY, PENDING_RECORD_PREFIX, pendingFor, pendingStore, type PendingSave } from "@/lib/system-boundary-pending"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function golden(name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary", `${name}.json`), "utf8"))
}

class MemoryStorage implements Storage {
  private items = new Map<string, string>()
  get length() { return this.items.size }
  clear() { this.items.clear() }
  getItem(key: string) { return this.items.has(key) ? this.items.get(key)! : null }
  key(index: number) { return [...this.items.keys()][index] ?? null }
  removeItem(key: string) { this.items.delete(key) }
  setItem(key: string, value: string) { this.items.set(key, String(value)) }
}

const REQUESTS = golden("requests")
const CREATE: CreateEnvelope = REQUESTS.create
const TAKEN: CreateEnvelope = REQUESTS.taken
const ACTOR: string = golden("grant_self").body.subject
const ACCOUNT = CREATE.declaration.roots[0].account_id
const OTHER_ACCOUNT = "444455556666"

function entry(envelope: CreateEnvelope, over: Partial<PendingSave> = {}): PendingSave {
  return { version: 1, actor: ACTOR, accountId: ACCOUNT, kind: "CREATE", envelope, startedAt: "2026-10-06T12:00:00.000Z", ...over }
}

function answers(...names: (string | Error)[]) {
  const spy = vi.spyOn(globalThis, "fetch")
  for (const name of names) {
    if (name instanceof Error) spy.mockRejectedValueOnce(name)
    else spy.mockResolvedValueOnce(Response.json(golden(name).body, { status: golden(name).status }))
  }
  return spy
}

function urls(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((call) => String(call[0]))
}

async function settle() {
  await act(async () => {})
}

afterEach(() => vi.restoreAllMocks())

describe("the pending-save store", () => {
  it("keeps exactly the envelopes put, by request id, and forgets one on remove", () => {
    const storage = new MemoryStorage()
    const store = pendingStore(storage)
    store.put(entry(CREATE))
    store.put(entry(CREATE))                                             // the same request id is kept once
    store.put(entry(TAKEN))
    expect(store.read().entries.map((e) => e.envelope.request_id)).toEqual([CREATE.request_id, TAKEN.request_id])
    store.remove(entry(CREATE))
    expect(store.read()).toEqual({ entries: [entry(TAKEN)], unreadable: 0 })
    store.remove(entry(TAKEN))
    expect(storage.length).toBe(0)                                       // (PC1 S0-E) every record gone; the old list never written
  })

  it("never returns what this version cannot read exactly, counts it, and clears it on request", () => {
    const storage = new MemoryStorage()
    storage.setItem(PENDING_KEY, JSON.stringify([{ version: 0, envelope: CREATE }, entry(CREATE), { ...entry(TAKEN), kind: "APPLY" }]))
    const store = pendingStore(storage)
    expect(store.read()).toEqual({ entries: [entry(CREATE)], unreadable: 2 })
    store.clearUnreadable()
    expect(store.read()).toEqual({ entries: [entry(CREATE)], unreadable: 0 })
    storage.setItem(PENDING_KEY, "{not json")
    expect(store.read()).toEqual({ entries: [], unreadable: 0 })
  })

  it("blocked storage keeps nothing and never throws", () => {
    const blocked = { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") },
                      removeItem: () => { throw new Error("blocked") } } as unknown as Storage
    const store = pendingStore(blocked)
    expect(() => store.put(entry(CREATE))).not.toThrow()
    expect(store.read()).toEqual({ entries: [], unreadable: 0 })
    expect(pendingStore(null).read()).toEqual({ entries: [], unreadable: 0 })
  })

  it("shows a person only their own saves from this account", () => {
    const store = pendingStore(new MemoryStorage())
    store.put(entry(CREATE))
    store.put(entry(TAKEN, { actor: "https://idp.example/pool#00u-bob" }))
    store.put(entry({ ...CREATE, request_id: "00000000-0000-4000-8000-0000000000c1" }, { accountId: OTHER_ACCOUNT }))
    expect(pendingFor(store.read(), ACTOR, ACCOUNT).map((e) => e.envelope.request_id)).toEqual([CREATE.request_id])
  })
})

describe("resuming a save", () => {
  it("a lost response after the commit: the save is found by its request id, shown as Saved, and dropped", async () => {
    const store = pendingStore(new MemoryStorage())
    store.put(entry(CREATE))
    const spy = answers("request_receipt")
    render(<PendingSaves accountId={ACCOUNT} actor={ACTOR} store={store} />)
    await settle()
    expect(urls(spy)).toEqual([`/api/proxy/system-boundary/declarations/requests/${CREATE.request_id}`])
    expect(screen.getByTestId(`pending-${CREATE.request_id}`).textContent).toContain(
      "Saved as revision 2. Cyntro is preparing this system's membership; nothing is applied yet.")
    expect(store.read().entries).toEqual([])
  })

  it("a reload before the commit: not saved yet -- the SAME request is resent, unchanged, and then it is Saved", async () => {
    const store = pendingStore(new MemoryStorage())
    store.put(entry(CREATE))
    const spy = answers("request_not_found", "save_saved")
    render(<PendingSaves accountId={ACCOUNT} actor={ACTOR} store={store} />)
    await settle()
    expect(screen.getByTestId(`pending-${CREATE.request_id}`).textContent).toContain("not saved yet.")
    expect(store.read().entries).toHaveLength(1)                         // not found is not "nothing will ever commit"
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resend the same request" })))
    expect(JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string)).toEqual(CREATE)
    expect(screen.getByTestId(`pending-${CREATE.request_id}`).textContent).toContain("Saved as revision 2.")
    expect(store.read().entries).toEqual([])
  })

  it("stale permissions: a save the person's current scope no longer shows is reported saved, never resent", async () => {
    const store = pendingStore(new MemoryStorage())
    store.put(entry(CREATE))
    const spy = answers("request_receipt_withheld")
    render(<PendingSaves accountId={ACCOUNT} actor={ACTOR} store={store} />)
    await settle()
    expect(screen.getByTestId(`pending-${CREATE.request_id}`).textContent).toContain(
      "saved as revision 2; your current access no longer shows its details.")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(store.read().entries).toEqual([])
  })

  it("a resend the backend refuses is definite -- nothing was saved -- and is dropped with its reason", async () => {
    const store = pendingStore(new MemoryStorage())
    store.put(entry(TAKEN))
    answers("request_not_found", "save_display_name_taken")
    render(<PendingSaves accountId={ACCOUNT} actor={ACTOR} store={store} />)
    await settle()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resend the same request" })))
    expect(screen.getByTestId(`pending-${TAKEN.request_id}`).textContent).toContain("already exists")
    expect(store.read().entries).toEqual([])
  })

  it("two tabs over one browser: each confirms the same committed save; nothing is sent twice", async () => {
    const store = pendingStore(new MemoryStorage())
    store.put(entry(CREATE))
    const spy = answers("request_receipt", "request_receipt")
    render(<><PendingSaves accountId={ACCOUNT} actor={ACTOR} store={store} /><PendingSaves accountId={ACCOUNT} actor={ACTOR} store={store} /></>)
    await settle()
    expect(screen.getAllByText(/Saved as revision 2\./)).toHaveLength(2)
    expect(urls(spy).every((u) => u.endsWith(`/declarations/requests/${CREATE.request_id}`))).toBe(true)
    expect(spy.mock.calls.every((call) => (call[1] as RequestInit | undefined)?.method !== "POST")).toBe(true)
    expect(store.read().entries).toEqual([])
  })

  it("an account switch or another person shows nothing, and an earlier console's entries are named, never resent", async () => {
    const storage = new MemoryStorage()
    storage.setItem(PENDING_KEY, JSON.stringify([entry(CREATE), { version: 0, envelope: TAKEN }]))
    const store = pendingStore(storage)
    const spy = answers()
    const { unmount } = render(<PendingSaves accountId={OTHER_ACCOUNT} actor={ACTOR} store={store} />)
    await settle()
    expect(screen.getByTestId("pending-saves").textContent).toContain(
      "1 save was started by an earlier version of this console and could not be read; it was not resent.")
    expect(screen.queryByTestId(`pending-${CREATE.request_id}`)).toBeNull()
    unmount()
    render(<PendingSaves accountId={ACCOUNT} actor="https://idp.example/pool#00u-bob" store={store} />)
    await settle()
    expect(screen.queryByTestId(`pending-${CREATE.request_id}`)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Discard" })))
    expect(store.read()).toEqual({ entries: [entry(CREATE)], unreadable: 0 })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("the wrapper keeps every envelope until its outcome is definite", () => {
  const VIEW0: DeclarationsView = golden("view_initial").body
  const ROOT = CREATE.declaration.roots[0]
  const ROW = { resource_uid: ROOT.resource_uid, resource_type: ROOT.selection.resource_type, region: ROOT.region,
                observed_incarnation: ROOT.selection.observed_incarnation, name: "web-role", native_id: "web-role" } as unknown as InventoryRow
  const PUBLICATION = { ...(ROOT.selection as RootSelection).publication, registration_id: "r" } as PublicationIdentity

  async function declare(storage: MemoryStorage, grant: ReadResult<OwnGrant>, saveAnswer: string | Error) {
    let latest: InventorySelection | undefined
    render(<DeclareFromInventory accountId={ACCOUNT} customerId="acme" store={pendingStore(storage)}
      readDeclarations={async () => ({ kind: "OK", value: VIEW0 })} readGrant={async () => grant}
      renderInventory={(selection) => { latest = selection; return null }} />)
    await settle()
    await act(async () => latest!.onToggle(ROW, PUBLICATION))
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(CREATE.request_id as `${string}-${string}-${string}-${string}-${string}`)
    let atSend: string | null = null
    const spy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
      atSend = storage.getItem(PENDING_RECORD_PREFIX + CREATE.request_id)  // what the browser held when the request left
      if (saveAnswer instanceof Error) throw saveAnswer
      return Response.json(golden(saveAnswer).body, { status: golden(saveAnswer).status })
    })
    fireEvent.click(screen.getByRole("button", { name: "Declare a system" }))
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Payments" } })
    fireEvent.change(screen.getByLabelText("Criticality"), { target: { value: "LOW" } })
    fireEvent.change(screen.getByLabelText("Deployment key"), { target: { value: "prod" } })
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "PRODUCTION" } })
    fireEvent.change(screen.getByLabelText("Your own environment word"), { target: { value: "prd" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    return { atSend: atSend as string | null, spy }
  }

  it("kept BEFORE the request leaves, under the verified person and this account; dropped once Saved", async () => {
    const storage = new MemoryStorage()
    const { atSend } = await declare(storage, { kind: "OK", value: golden("grant_self").body }, "save_saved")
    expect(JSON.parse(atSend!)).toEqual({ version: 1, actor: ACTOR, accountId: ACCOUNT, kind: "CREATE", envelope: CREATE,
                                          startedAt: expect.any(String) })
    expect(storage.length).toBe(0)                                       // settled: its record removed, no list written
  })

  it("kept after an unconfirmed send -- the next visit resumes it", async () => {
    const storage = new MemoryStorage()
    await declare(storage, { kind: "OK", value: golden("grant_self").body }, new TypeError("Failed to fetch"))
    expect(pendingStore(storage).read().entries.map((e) => e.envelope)).toEqual([CREATE])
  })

  it("without a verified subject nothing is kept: the save still goes, only its resume is unavailable", async () => {
    const storage = new MemoryStorage()
    const { spy } = await declare(storage, { kind: "UNAVAILABLE", status: 503, code: "AUTHORING_BACKEND_UNAVAILABLE" }, "save_saved")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(storage.length).toBe(0)
  })
})

// (PC1 S0-E) Two tabs never lose each other's unresolved saves -- the setup store's S0 DR05 / S0-R02 / S0-R03 / S0-R06 design,
// tested the same way: each tab is its own store over ONE browser storage, and the storage double runs the other tab's step
// exactly between this tab's read and its first write (storage has no cross-tab lock). A "reload" is a new store.
describe("(PC1 S0-E) one storage record per unresolved save", () => {
  function sharedStorage() {
    const data = new Map<string, string>()
    const view = () => {
      const tab = {
        between: null as null | (() => void),
        storage: {
          get length() { return data.size },
          clear: () => data.clear(),
          getItem: (k: string) => data.get(k) ?? null,
          key: (i: number) => [...data.keys()][i] ?? null,
          removeItem: (k: string) => { tab.interleave(); data.delete(k) },
          setItem: (k: string, v: string) => { tab.interleave(); data.set(k, v) },
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
  const third = entry({ ...CREATE, request_id: "00000000-0000-4000-8000-0000000000e3" })
  const ids = (entries: PendingSave[]) => entries.map((e) => e.envelope.request_id).sort()

  it("two tabs keeping saves at the same moment both survive a reload, each tuple exact", () => {
    const shared = sharedStorage()
    const a = shared.view(), b = shared.view()
    const tabA = pendingStore(a.storage), tabB = pendingStore(b.storage)
    a.between = () => tabB.put(entry(TAKEN))                              // tab B keeps its save between A's read and A's write
    tabA.put(entry(CREATE))
    const reloaded = pendingStore(shared.view().storage).read()
    expect(ids(reloaded.entries)).toEqual(ids([entry(CREATE), entry(TAKEN)]))
    expect(reloaded.entries.find((e) => e.envelope.request_id === CREATE.request_id)).toEqual(entry(CREATE))
    expect(shared.data.has(PENDING_KEY)).toBe(false)                      // the old shared list is never written
  })

  it("settling one save while another tab keeps a new one loses neither", () => {
    const shared = sharedStorage()
    const a = shared.view(), b = shared.view()
    const tabA = pendingStore(a.storage), tabB = pendingStore(b.storage)
    tabA.put(entry(CREATE))
    tabB.put(entry(TAKEN))
    a.between = () => tabB.put(third)
    tabA.remove(entry(CREATE))
    expect(ids(pendingStore(shared.view().storage).read().entries)).toEqual(ids([entry(TAKEN), third]))
  })

  it("a save kept by an earlier release in the shared list is offered, and settled by a marker alone -- the list untouched", () => {
    const shared = sharedStorage()
    const list = JSON.stringify([entry(CREATE), { version: 0, envelope: TAKEN }, third])
    shared.data.set(PENDING_KEY, list)
    const store = pendingStore(shared.view().storage)
    expect(pendingFor(store.read(), ACTOR, ACCOUNT).map((e) => e.envelope.request_id)).toEqual([CREATE.request_id, third.envelope.request_id])
    store.remove(entry(CREATE))
    expect(shared.data.get(PENDING_KEY)).toBe(list)                       // byte for byte
    expect(pendingStore(shared.view().storage).read()).toEqual({ entries: [third], unreadable: 1 })
  })

  it("an earlier-release tab appending to its list while this one settles loses nothing", () => {
    const shared = sharedStorage()
    const current = shared.view()
    shared.data.set(PENDING_KEY, JSON.stringify([entry(CREATE), entry(TAKEN)]))
    const store = pendingStore(current.storage)
    expect(ids(store.read().entries)).toEqual(ids([entry(CREATE), entry(TAKEN)]))
    current.between = () => {
      shared.data.set(PENDING_KEY, JSON.stringify([...JSON.parse(shared.data.get(PENDING_KEY)!), third]))
    }
    store.remove(entry(CREATE))
    expect(ids(pendingStore(shared.view().storage).read().entries)).toEqual(ids([entry(TAKEN), third]))
    expect(JSON.parse(shared.data.get(PENDING_KEY)!)).toEqual([entry(CREATE), entry(TAKEN), third])
  })

  it("a settlement names the EXACT tuple: another tuple under the same request id stays, and put never writes over it", () => {
    const storage = new MemoryStorage()
    const store = pendingStore(storage)
    const original = entry(CREATE)
    const other = entry(CREATE, { startedAt: "2026-10-06T13:00:00.000Z" })     // same request id, another tuple
    store.put(original)
    store.put(other)                                                       // never over the record already at this id
    expect(store.read().entries).toEqual([original])
    store.remove(other)                                                    // not the tuple kept: nothing is settled
    expect(store.read().entries).toEqual([original])
    store.remove(original)
    expect(store.read()).toEqual({ entries: [], unreadable: 0 })
  })

  it("discarding unreadable saves removes this release's unreadable record and hides the old list's by marker only", () => {
    const shared = sharedStorage()
    const list = JSON.stringify([{ version: 0, envelope: TAKEN }, entry(CREATE)])
    shared.data.set(PENDING_KEY, list)
    shared.data.set(PENDING_RECORD_PREFIX + TAKEN.request_id, JSON.stringify({ ...entry(TAKEN), kind: "APPLY" }))
    shared.data.set(PENDING_RECORD_PREFIX + "00000000-0000-4000-8000-0000000000aa", JSON.stringify(entry(TAKEN)))   // key names another id
    const store = pendingStore(shared.view().storage)
    expect(store.read()).toEqual({ entries: [entry(CREATE)], unreadable: 3 })
    store.clearUnreadable()
    expect(pendingStore(shared.view().storage).read()).toEqual({ entries: [entry(CREATE)], unreadable: 0 })
    expect(shared.data.get(PENDING_KEY)).toBe(list)
    expect([...shared.data.keys()].filter((k) => k.startsWith(PENDING_RECORD_PREFIX))).toEqual([])
  })
})

// (PC1 S0-E2, review E-1) An entry whose envelope carries an undefined-valued optional key: storage drops the key (JSON), so the
// stored record and the in-memory entry the caller kept must still be ONE tuple -- else the save is never settled.
describe("(PC1 S0-E2) an undefined-valued key is not part of a save's identity", () => {
  it("a save kept with an undefined-valued key is settled by the very entry the caller kept", () => {
    const storage = new MemoryStorage()
    const store = pendingStore(storage)
    const kept = entry({ ...CREATE, declaration: { ...CREATE.declaration, optional_note: undefined } as typeof CREATE.declaration })
    store.put(kept)
    expect(store.read().entries).toHaveLength(1)
    store.remove(kept)                                                      // the in-memory object, not a read() copy
    expect(store.read()).toEqual({ entries: [], unreadable: 0 })
    expect(storage.length).toBe(0)
  })
})
