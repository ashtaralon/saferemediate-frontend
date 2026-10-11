/**
 * Declaring from the account inventory (components/system-boundary/declare-from-inventory.tsx): the selection hook it
 * hands the inventory view (Settings' I3 interface, sent 2026-10-06), the picks it owns, and the save, over the PRODUCER
 * goldens of the authoring routes (__tests__/fixtures/system-boundary, backend 61c2cd9d).
 *
 * The inventory view is Settings' and not here: ``renderInventory`` records what it is handed. The picked row carries the
 * golden request's own root values (identity, type, Region, observed incarnation) and the name its uid encodes; the
 * wrapper reads nothing else. Once I3's view and AccountOnboarding's v3 inventory golden land, a mounted test of the two
 * together replaces this stand-in row.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeclareFromInventory } from "@/components/system-boundary/declare-from-inventory"
import { rowKey, type InventoryRow, type InventorySelection, type PublicationIdentity } from "@/lib/account-inventory"
import type { CreateEnvelope, DeclarationsView, OwnGrant, ReadResult } from "@/lib/system-boundary-authoring"
import type { RootSelection } from "@/lib/system-boundary-authoring"   // deep fixtures (wizard on discovery widened DeclaredRoot)
import { pendingStore } from "@/lib/system-boundary-pending"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function golden(name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary", `${name}.json`), "utf8"))
}

const CREATE: CreateEnvelope = golden("requests").create
const VIEW0: DeclarationsView = golden("view_initial").body
const ROOT = CREATE.declaration.roots[0]
const ROW = {
  resource_uid: ROOT.resource_uid, resource_type: ROOT.selection.resource_type, region: ROOT.region,
  observed_incarnation: ROOT.selection.observed_incarnation, name: ROOT.resource_uid.split("/").pop(),
  native_id: ROOT.resource_uid.split("/").pop(),
} as unknown as InventoryRow
const PUBLICATION: PublicationIdentity = {
  ...(ROOT.selection as RootSelection).publication,
  registration_id: (golden("view_after_save").body.roots[0].body.provenance as { registration_id: string }).registration_id,
}

// The person's own grant, as the real /authoring-grants/self answered (producer golden). Nothing here reaches a network:
// the resume store is the no-storage one (resume is the resume suite's), and any fetch not stubbed by a test fails it.
const readGrant = async (): Promise<ReadResult<OwnGrant>> => ({ kind: "OK", value: golden("grant_self").body })
// The wizard capability the toolbar reads on mount, as the real GET /api/system-boundary/wizard/capability answered
// (backend capture, wizard off): injected, so it reaches no network either.
const CAPABILITY = JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary-captures/capability.json"), "utf8"))
const readCapability = async (): Promise<{ status: number; body: unknown }> => ({ status: CAPABILITY.status, body: CAPABILITY.body })

function mount(readDeclarations: () => Promise<ReadResult<DeclarationsView>>, accountId = "111122223333") {
  const handed: (InventorySelection | undefined)[] = []
  const renderInventory = (selection: InventorySelection | undefined) => {
    handed.push(selection)
    return <div data-testid="inventory" />
  }
  const store = pendingStore(null)
  const utils = render(<DeclareFromInventory accountId={accountId} customerId="acme" renderInventory={renderInventory}
    readDeclarations={readDeclarations} readGrant={readGrant} readCapability={readCapability} store={store} />)
  return { handed, latest: () => handed[handed.length - 1], utils, renderInventory, store }
}

const ok = (view: DeclarationsView) => vi.fn(async (): Promise<ReadResult<DeclarationsView>> => ({ kind: "OK", value: view }))

async function settle() {
  await act(async () => {})
}

let unstubbed: string[] = []

beforeEach(() => {
  unstubbed = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    unstubbed.push(String(input instanceof Request ? input.url : input))
    throw new TypeError("unstubbed fetch")
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  expect(unstubbed).toEqual([])
})

describe("declaring from the inventory", () => {
  it("hands the view no selection -- browse only, nothing added -- when the declarations cannot be read", async () => {
    const { latest } = mount(async () => ({ kind: "REFUSED", status: 403, code: "PERSON_NOT_AUTHORIZED", detail: {} }))
    await settle()
    expect(latest()).toBeUndefined()
    expect(screen.queryByTestId("declare-toolbar")).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says declaring is not enabled when saving is not active (the producer's view, explicitly MUTATED to another phase)", async () => {
    const { latest } = mount(ok({ ...VIEW0, protocol_phase: "INITIALIZED" }))
    await settle()
    expect(latest()).toBeUndefined()
    expect(screen.getByRole("status").textContent).toBe("Declaring systems from this inventory is not enabled on this installation yet.")
  })

  it("picks a row with the publication it was read from, and declares it as one Saved request", async () => {
    const read = ok(VIEW0)
    const { latest } = mount(read)
    await settle()
    expect(latest()).toBeDefined()
    await act(async () => latest()!.onToggle(ROW, PUBLICATION))
    expect(screen.getByTestId("declare-toolbar").textContent).toContain("1 picked as roots")
    expect(latest()!.selected).toEqual(new Map([[rowKey(ROW), PUBLICATION]]))
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(CREATE.request_id as `${string}-${string}-${string}-${string}-${string}`)
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(golden("save_saved").body, { status: 201 }))
    fireEvent.click(screen.getByRole("button", { name: "Declare a system" }))
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Payments" } })
    fireEvent.change(screen.getByLabelText("Criticality"), { target: { value: "LOW" } })
    fireEvent.change(screen.getByLabelText("Deployment key"), { target: { value: "prod" } })
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "PRODUCTION" } })
    fireEvent.change(screen.getByLabelText("Your own environment word"), { target: { value: "prd" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual(CREATE)   // the request the real route saved
    expect(screen.getByTestId("declare-toolbar").textContent).toContain("0 picked as roots")
    expect(screen.getByTestId("declare-toolbar").textContent).toContain(
      "Saved as revision 2. Cyntro is preparing this system's membership; nothing is applied yet.")
    expect(read).toHaveBeenCalledTimes(2)                                 // the declarations are read again after a save
  })

  it("marks a pick made in an earlier publication than the one shown, and clears such picks on request", async () => {
    const { latest } = mount(ok(VIEW0))
    await settle()
    await act(async () => latest()!.onToggle(ROW, PUBLICATION))
    await act(async () => latest()!.onPublication!(PUBLICATION))
    expect(screen.queryByText(/earlier publication/)).toBeNull()
    await act(async () => latest()!.onPublication!({ ...PUBLICATION, generation: PUBLICATION.generation + 1 }))
    expect(screen.getByText(/1 pick was made in an earlier publication of this inventory; it will be checked again/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Clear earlier picks" })))
    expect(screen.getByTestId("declare-toolbar").textContent).toContain("0 picked as roots")
  })

  it("keys picks by the producer's row identity (type and uid), never the uid alone, and toggles them off", async () => {
    const { latest } = mount(ok(VIEW0))
    await settle()
    const twin = { ...ROW, resource_type: "iam:policy" } as InventoryRow
    await act(async () => latest()!.onToggle(ROW, PUBLICATION))
    await act(async () => latest()!.onToggle(twin, PUBLICATION))
    expect([...latest()!.selected.keys()]).toEqual([rowKey(ROW), rowKey(twin)])
    await act(async () => latest()!.onToggle(ROW, PUBLICATION))
    expect([...latest()!.selected.keys()]).toEqual([rowKey(twin)])
  })

  it("another account mounts a fresh picker: no pick crosses accounts", async () => {
    const read = ok(VIEW0)
    const { latest, utils, renderInventory, store } = mount(read)
    await settle()
    await act(async () => latest()!.onToggle(ROW, PUBLICATION))
    utils.rerender(<DeclareFromInventory accountId="444455556666" customerId="acme" renderInventory={renderInventory} readDeclarations={read}
      readGrant={readGrant} readCapability={readCapability} store={store} />)
    await settle()
    expect(latest()!.selected.size).toBe(0)
  })
})

// D2/D4/D17: Systems > Add System opens the account's inventory with ?declare=1 (lib/system-boundary-entry.ts), which the
// page hands the picker as ``openDeclareFlow``. The flag opens nothing the picker's own checks do not allow.
describe("opened to declare a system (Systems > Add System)", () => {
  const capture = (name: string) =>
    JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary-captures", `${name}.json`), "utf8"))
  const ENABLED = capture("capability_enabled")
  const STACKS = capture("stacks")
  const enabled = async () => ({ status: ENABLED.status, body: ENABLED.body })

  function mountFlow(readDeclarations: () => Promise<ReadResult<DeclarationsView>>,
    { capability = readCapability, openDeclareFlow = true }: {
      capability?: () => Promise<{ status: number; body: unknown }>; openDeclareFlow?: boolean } = {}) {
    return render(<DeclareFromInventory accountId={STACKS.body.account_id} customerId="acme" renderInventory={() => <div />}
      readDeclarations={readDeclarations} readGrant={readGrant} readCapability={capability} store={pendingStore(null)}
      openDeclareFlow={openDeclareFlow} />)
  }

  function serveStacks() {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url === `/api/proxy/accounts/${STACKS.body.account_id}/census/stacks`) return Response.json(STACKS.body, { status: STACKS.status })
      unstubbed.push(url)
      throw new TypeError("unstubbed fetch")
    })
  }

  it("opens the stack wizard once on load where saving is active and the capability read enables it", async () => {
    serveStacks()
    mountFlow(ok(VIEW0), { capability: enabled })
    await settle()
    expect(screen.getByTestId("stack-binding-wizard")).toBeTruthy()
    expect(screen.getByTestId("declare-flow-guide").textContent).toBe(
      "To add a system, bind its CloudFormation stacks, or pick its root resources in the inventory below and choose Declare a system.")
  })

  it("control: without the flag the same page opens nothing", async () => {
    mountFlow(ok(VIEW0), { capability: enabled, openDeclareFlow: false })
    await settle()
    expect(screen.queryByTestId("stack-binding-wizard")).toBeNull()
    expect(screen.queryByTestId("declare-flow-guide")).toBeNull()
  })

  it("with the wizard off, opens nothing and says how a system is declared, beside the capability's own reason", async () => {
    mountFlow(ok(VIEW0))
    await settle()
    expect(screen.queryByTestId("stack-binding-wizard")).toBeNull()
    expect(screen.getByTestId("declare-flow-guide").textContent).toBe(
      "To add a system, pick its root resources in the inventory below, then choose Declare a system.")
    expect(screen.getByTestId("wizard-capability").textContent).toBe(
      "Binding stacks and per-resource decisions are not turned on for this install.")
  })

  it("where saving is not active, says only what it says without the flag", async () => {
    mountFlow(ok({ ...VIEW0, protocol_phase: "INITIALIZED" }), { capability: enabled })
    await settle()
    expect(screen.getByRole("status").textContent).toBe("Declaring systems from this inventory is not enabled on this installation yet.")
    expect(screen.queryByTestId("stack-binding-wizard")).toBeNull()
    expect(screen.queryByTestId("declare-flow-guide")).toBeNull()
  })

  it("where the declarations cannot be read, says why instead of a silent browse-only page", async () => {
    mountFlow(async () => ({ kind: "REFUSED", status: 403, code: "PERSON_NOT_AUTHORIZED", detail: {} }), { capability: enabled })
    await settle()
    expect(screen.getByTestId("declare-flow-unavailable").textContent).toBe(
      "You are not authorized to declare systems on this installation (PERSON_NOT_AUTHORIZED).")
    expect(screen.queryByTestId("declare-toolbar")).toBeNull()
  })
})
