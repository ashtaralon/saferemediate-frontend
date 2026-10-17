/**
 * The System wizard on basic discovery (D47; agent-coordinator CONTRACT-WIZARD-ON-DISCOVERY.md rev 2.1): the real picker
 * (declare-from-inventory.tsx) over the real basic listing (basic-inventory-view.tsx), fed the PRODUCER's captures
 * (backend W1 7ec5880b, tests/cyntro_data/test_account_resources_api.py; byte-equal copies in
 * __tests__/fixtures/account-resources) and the authoring goldens. Pinned here: which rows are offered (the backend's
 * system_root, never the browse key), the exact root a save sends (the backend's basic resolver contract), that browsing
 * never waits on Systems, that ?declare=1 is never silent, and that a basic root's not-member reason is said in words.
 * Nothing reaches a network: any unstubbed fetch fails the test.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BasicInventoryView } from "@/components/accounts/basic-inventory-view"
import { DeclareFromInventory } from "@/components/system-boundary/declare-from-inventory"
import { eligibilityCopy, type InventorySelection } from "@/lib/account-inventory"
import {
  parseDiscoveryResponse,
  parseResourcesResponse,
  toInventoryRow,
  type DiscoveryStatus,
  type ResourcesFetcher,
} from "@/lib/account-resources"
import { rootFromBasic, type DeclarationsView, type OwnGrant, type ReadResult } from "@/lib/system-boundary-authoring"
import { pendingStore } from "@/lib/system-boundary-pending"
import { notMemberSentence } from "@/lib/system-boundary-result"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fixture(dir: string, name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", dir, `${name}.json`), "utf8"))
}
const capture = (name: string) => fixture("account-resources", name) as { status: number; body: Record<string, any> }
const golden = (name: string) => fixture("system-boundary", name)

const PAGE = capture("resources_discovering_page1")
const ACCOUNT: string = PAGE.body.account_id
type Bound = DiscoveryStatus & { registrationId: string; runId: string }
const STATUS = parseDiscoveryResponse(200, capture("discovery_complete_with_gaps").body, ACCOUNT) as Bound
const VIEW0: DeclarationsView = golden("view_initial").body
const readGrant = async (): Promise<ReadResult<OwnGrant>> => ({ kind: "OK", value: golden("grant_self").body })
const CAPABILITY = fixture("system-boundary-captures", "capability")
const readCapability = async () => ({ status: CAPABILITY.status, body: CAPABILITY.body })
/** The backend's basic resolver contract (api/account_resources.py _ROOT_KEYS / _BASIC_SELECTION): exactly these keys. */
const ROOT_KEYS = ["account_id", "region", "resource_uid", "selection"]
const SELECTION_KEYS = ["observed_incarnation", "registration_id", "resource_key", "resource_type", "run_id", "source"]

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

function pages(body = PAGE.body): ResourcesFetcher {
  return async () => ({ status: 200, body: structuredClone(body) })
}

function mount({ readDeclarations, fetchPage = pages(), openDeclareFlow = false }: {
  readDeclarations: () => Promise<ReadResult<DeclarationsView>>
  fetchPage?: ResourcesFetcher
  openDeclareFlow?: boolean
}) {
  const handed: (InventorySelection | undefined)[] = []
  render(<DeclareFromInventory accountId={ACCOUNT} customerId="acme" readDeclarations={readDeclarations} readGrant={readGrant}
    readCapability={readCapability} store={pendingStore(null)} openDeclareFlow={openDeclareFlow}
    renderInventory={(selection) => {
      handed.push(selection)
      return <BasicInventoryView accountId={ACCOUNT} accountLabel={ACCOUNT} status={STATUS} fetchPage={fetchPage} selection={selection} />
    }} />)
  return { latest: () => handed[handed.length - 1] }
}

async function listed(rows: number) {
  fireEvent.click(screen.getByRole("button", { name: "List" }))
  await waitFor(() => expect(screen.getAllByRole("row").length).toBe(rows + 1))
}

describe("the backend's system_root decides what may be picked", () => {
  it("reads the producer's root candidates, refuses a malformed one, and keeps decision eligibility BASIC_ONLY", () => {
    const page = parseResourcesResponse(200, PAGE.body, ACCOUNT, null)
    expect(page.kind).toBe("page")
    for (const item of PAGE.body.items) {
      expect(item.decision_eligibility).toEqual({ eligible: false, reason: "BASIC_ONLY" })
      expect(item.system_root.status).toBe("SELECTABLE")
    }
    const forged = structuredClone(PAGE.body)
    forged.items[0].system_root = { ...forged.items[0].system_root, resource_type: "ec2:security-group" }   // not this item's type
    expect(parseResourcesResponse(200, forged, ACCOUNT, null).kind).toBe("outcome")
    const unproven = structuredClone(PAGE.body)
    unproven.items[0].system_root = { ...unproven.items[0].system_root, observed_incarnation: { status: "not_provided" } }
    expect(parseResourcesResponse(200, unproven, ACCOUNT, null).kind).toBe("outcome")
    const refused = { ...PAGE.body.items[0], system_root: { status: "NOT_SELECTABLE", reason: "REGION_NOT_COLLECTED" } }
    expect(toInventoryRow(refused).eligibility).toEqual({ selectable: false, reason: "REGION_NOT_COLLECTED" })
    expect(eligibilityCopy(toInventoryRow(refused).eligibility)).toBe(
      "Its Region is not one Cyntro collects deep evidence in for this account")
  })

  it("offers a box only where a root was named, and says why elsewhere", async () => {
    const body = structuredClone(PAGE.body)
    body.items[1].system_root = { status: "NOT_SELECTABLE", reason: "REGION_NOT_COLLECTED" }
    mount({ readDeclarations: async () => ({ kind: "OK", value: VIEW0 }), fetchPage: pages(body) })
    await listed(5)
    expect(screen.getAllByRole("checkbox", { name: /as a root/ })).toHaveLength(4)
    expect(screen.getByTestId("inventory-not-selectable").textContent).toBe(
      "Its Region is not one Cyntro collects deep evidence in for this account")
  })
})

describe("a pick from a basic row is saved as the backend's basic root", () => {
  it("sends exactly the canonical root, the registration and run it was listed in, and its browse key", async () => {
    mount({ readDeclarations: async () => ({ kind: "OK", value: VIEW0 }) })
    await listed(5)
    const item = PAGE.body.items[0]
    await act(async () => fireEvent.click(screen.getByRole("checkbox", { name: `Pick ${item.name} (${item.resource_type}) as a root` })))
    expect(screen.getByTestId("declare-toolbar").textContent).toContain("1 picked as roots")
    const save = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(golden("save_saved").body, { status: 201 }))
    fireEvent.click(screen.getByRole("button", { name: "Declare a system" }))
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Checkout (basic)" } })
    fireEvent.change(screen.getByLabelText("Criticality"), { target: { value: "LOW" } })
    fireEvent.change(screen.getByLabelText("Deployment key"), { target: { value: "prod" } })
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "PRODUCTION" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    const sent = JSON.parse((save.mock.calls[0][1] as RequestInit).body as string)
    const [root] = sent.declaration.roots
    expect(Object.keys(root).sort()).toEqual(ROOT_KEYS)
    expect(Object.keys(root.selection).sort()).toEqual(SELECTION_KEYS)
    expect(root).toEqual({
      account_id: ACCOUNT, region: item.system_root.region, resource_uid: item.system_root.resource_uid,
      selection: { source: "basic_discovery", resource_type: item.system_root.resource_type, registration_id: PAGE.body.registration_id,
                   run_id: PAGE.body.run_id, resource_key: item.resource_key, observed_incarnation: item.system_root.observed_incarnation } })
    expect(root.resource_uid).not.toBe(item.resource_key)                 // the canonical uid, never the browse key
    expect(root).toEqual(rootFromBasic(ACCOUNT, { ...item.system_root, resource_key: item.resource_key },
                                       { attempt: PAGE.body.run_id, registration_id: PAGE.body.registration_id }))
    expect(sent.declaration.deployment.scopes).toEqual([{ account_id: ACCOUNT, region: item.system_root.region }])
  })
})

describe("browsing never waits on Systems, and ?declare=1 is never silent (D47)", () => {
  it("lists the basic rows browse-only while the declarations have not answered", async () => {
    mount({ readDeclarations: () => new Promise(() => {}) })
    await listed(5)
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
    expect(screen.queryByTestId("declare-toolbar")).toBeNull()
  })

  it("names why a system cannot be declared when asked to and the declarations are refused", async () => {
    mount({ readDeclarations: async () => ({ kind: "REFUSED", status: 403, code: "PERSON_NOT_AUTHORIZED", detail: {} }),
            openDeclareFlow: true })
    await waitFor(() => expect(screen.getByTestId("declare-flow-unavailable").textContent).toBe(
      "You are not authorized to declare systems on this installation (PERSON_NOT_AUTHORIZED)."))
    await listed(5)                                                          // the listing is shown regardless
  })

  it("the account's Inventory tab mounts the wizard around its basic listing", async () => {
    vi.resetModules()
    vi.doMock("@/components/system-boundary/declare-from-inventory", () => ({
      DeclareFromInventory: ({ renderInventory }: { renderInventory: (s: InventorySelection) => unknown }) =>
        renderInventory({ selected: new Map(), onToggle: () => {}, onPublication: () => {} }),
    }))
    vi.doMock("@/lib/account-resources", async (real) => ({
      ...(await real<typeof import("@/lib/account-resources")>()),
      fetchDiscovery: async () => capture("discovery_complete_with_gaps"),
      fetchResourcesPage: async () => PAGE,
    }))
    const { InventorySource } = await import("@/components/accounts/account-inventory-gate")
    await act(async () => { render(<InventorySource accountId={ACCOUNT} account={null} />) })
    await listed(5)
    expect(screen.getAllByRole("checkbox", { name: /as a root/ })).toHaveLength(5)
    vi.doUnmock("@/components/system-boundary/declare-from-inventory")
    vi.doUnmock("@/lib/account-resources")
  })
})

describe("a basic root that is not a member yet says why", () => {
  it("words each basic reason, never a bare code", () => {
    const row = (reason: string) => ({ resource_uid: "u", kind: "SEED_OUTCOME", state: "TARGET_UNAVAILABLE", reason })
    expect(notMemberSentence(row("BASIC_REGISTRATION_UNPROVEN:GENERATION_LINEAGE_NOT_RECORDED"))).toBe(
      "chosen from basic discovery; not a member yet: Cyntro's deep evidence for this account has not been proven to come "
      + "from its current connection (GENERATION_LINEAGE_NOT_RECORDED) [BASIC_REGISTRATION_UNPROVEN]")
    expect(notMemberSentence(row("BASIC_REGISTRATION_MISMATCH"))).toContain("under an earlier connection of this account")
    expect(notMemberSentence(row("BASIC_INCARNATION_UNPROVEN"))).toContain("does not prove this resource's identity")
    expect(notMemberSentence(row("BASIC_INCARNATION_MISMATCH"))).toContain("a different one (recreated)")
    expect(notMemberSentence(row("TARGET_UNAVAILABLE"))).toBe("TARGET_UNAVAILABLE")   // any other reason: unchanged
  })
})
