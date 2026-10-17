/**
 * Onboarding S1a (setup contract level 4): the guided setup (components/system-boundary/setup-wizard.tsx) over a REAL
 * CloudFormation-bound draft -- its binding, the person's exclusion, the preview the backend computed for exactly that saved
 * version, the Finish that pins it, the refusals, and the census page the bound stack's resources are decided on
 * (__tests__/fixtures/system-boundary-setup-preview-captures/, pinned in its README; the stacks answer is the census's real
 * system-boundary-captures/stacks.json). The client, preview and census reads are injected so each test sees exactly the
 * requests the wizard sends; every answer it gets back is a capture, or an edit of one that is said where it is made.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SetupWizard, type SetupClient } from "@/components/system-boundary/setup-wizard"
import { stackOptionsOf } from "@/components/system-boundary/guided-setups"
import { contentHash } from "@/lib/content-hash"
import type { DeclarationsView, ResourceDecision, StackBinding } from "@/lib/system-boundary-authoring"
import { writeAnswer, type SetupIntent, type SetupView, type SetupWrite } from "@/lib/system-boundary-setup"
import { stackBinding } from "@/lib/system-boundary-setup-intent"
import { setupPendingStore, type PendingSetupOp, type SetupPendingStore } from "@/lib/system-boundary-setup-pending"
import { parsePreview, type PreviewFetcher } from "@/lib/system-boundary-setup-preview"
import { parseStacksResponse } from "@/lib/system-boundary-stacks"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (file: string): any => JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", file), "utf8"))
const cap = (name: string) => json(`system-boundary-setup-preview-captures/${name}.json`)
const VIEW: DeclarationsView = json("system-boundary/view_after_save.json").body
const DRAFT: SetupView = cap("read_draft").body
const FINISHED: SetupView = cap("finish").body
const SID = DRAFT.setup_id
const ACCOUNT = DRAFT.accounts_seen[0]
const ACTOR = "idp#alice"
const SAVED_BINDING = (DRAFT.intent.declaration as { bindings: StackBinding[] }).bindings[0]
const SAVED_DECISIONS = (DRAFT.intent.declaration as { resource_decisions: ResourceDecision[] }).resource_decisions
const STACKS = (() => {
  const parsed = parseStacksResponse(200, json("system-boundary-captures/stacks.json").body, ACCOUNT)
  if (parsed.kind !== "data") throw new Error("the stacks capture must parse")
  return stackOptionsOf(parsed)
})()

async function settle() {
  await act(async () => {})
}

function storage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v) },
    removeItem: (k: string) => { items.delete(k) },
    clear: () => items.clear(),
  }
}

const freshStore = (s: Storage | null = storage()): SetupPendingStore => setupPendingStore(s, new Map<string, PendingSetupOp>())

const previewOf = (body: unknown): PreviewFetcher => vi.fn(async () => parsePreview(200, structuredClone(body)))

function client(view: SetupView = DRAFT, overrides: Partial<SetupClient> = {}) {
  const updates: SetupIntent[] = []
  const c: SetupClient = {
    readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(view) })),
    readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: cap("status").body })),
    updateSetup: vi.fn(async (_id: string, _rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      updates.push(steps)
      return { kind: "SAVED", status: 200, view: { ...structuredClone(view), state_version: base + 1, intent: steps } }
    }),
    finishSetup: vi.fn(async (): Promise<SetupWrite> => ({ kind: "SAVED", status: 201, view: structuredClone(FINISHED) })),
    ...overrides,
  }
  return { c, updates }
}

function mount(c: SetupClient, { store = freshStore(), readPreview = previewOf(cap("preview").body),
  readCensus = vi.fn(async () => ({ status: 200, body: cap("census_collected").body })) }:
  { store?: SetupPendingStore; readPreview?: PreviewFetcher; readCensus?: ReturnType<typeof vi.fn> } = {}) {
  return render(<SetupWizard setupId={SID} accountId={ACCOUNT} view={VIEW} picks={[]} onClose={() => undefined} client={c}
    pendingStore={store} actor={ACTOR} stacks={{ state: "served", stacks: STACKS }} readPreview={readPreview}
    readCensus={readCensus} readApplied={async () => ({ status: 503, body: { state: "unavailable" } })}
    readResult={async () => ({ status: 503, body: {} })} />)
}

const finishButton = () => screen.getByTestId("setup-finish") as HTMLButtonElement
const step = (name: string) => fireEvent.click(screen.getByRole("button", { name }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("a CloudFormation-bound draft resumes losslessly and finishes on the preview the person reviewed", () => {
  it("not dirty on resume; Review shows the computed preview of the saved version; Finish keeps a version-2 op, then sends it", async () => {
    const store = freshStore()
    const kept: PendingSetupOp[][] = []
    const { c } = client(DRAFT, { finishSetup: vi.fn(async (): Promise<SetupWrite> => {
      kept.push(store.read())
      return { kind: "SAVED", status: 201, view: structuredClone(FINISHED) }
    }) })
    mount(c, { store })
    await settle()
    expect(screen.queryByTestId("setup-review-unsaved")).toBeNull()                 // the binding and exclusion came back exactly
    // (PC1 S0-F) the plan's words; this capture predates the server's class count, so shared is said not reported
    expect(screen.getByTestId("setup-preview-summary").textContent).toContain(
      `If you finish saved revision ${DRAFT.intent_revision}, this system would have 2 owned, 1 used, 0 unresolved, `
      + "2 not part of this system (shared not reported). Nothing is applied yet.")
    expect(screen.getByTestId(`setup-preview-account-${ACCOUNT}`).textContent).toContain("EXCLUDED_BY_DECISION")
    expect(finishButton().disabled).toBe(false)
    fireEvent.click(finishButton())
    await settle()
    const digest = cap("preview").body.preview_digest
    expect(c.finishSetup).toHaveBeenCalledTimes(1)
    const [sid, rid, base, sent] = (c.finishSetup as ReturnType<typeof vi.fn>).mock.calls[0]
    expect([sid, base, sent]).toEqual([SID, DRAFT.state_version, digest])
    expect(kept[0]).toEqual([{ version: 2, kind: "finish", actor: ACTOR, accountId: ACCOUNT, setupId: SID, requestId: rid,
                               base: DRAFT.state_version, startedAt: expect.any(String), previewDigest: digest }])
    expect(store.read()).toEqual([])                                                // settled by its answer
    expect(screen.getByTestId("setup-progress-proposed").textContent).toContain(   // (PC1 S0-F) the plan's words
      "2 owned, 1 used, 0 unresolved, 2 not part of this system")
    expect(screen.getByTestId("setup-progress-proposed").textContent).toContain("not what is applied now")
  })

  it("Finish waits: no preview yet, a preview of another version, a HELD preview, or unsaved changes on screen", async () => {
    const pending = mount(client().c, { readPreview: vi.fn(() => new Promise(() => undefined)) as unknown as PreviewFetcher })
    await settle()
    expect(finishButton().disabled).toBe(true)
    expect(finishButton().title).toContain("rests on its computed preview")
    pending.unmount()

    const other = structuredClone(cap("preview").body)
    other.setup.state_version = DRAFT.state_version - 1                    // an edit: the answer names another saved version
    const stale = mount(client().c, { readPreview: previewOf(other) })
    await settle()
    expect(screen.getByTestId("setup-preview-summary").textContent).toContain("PREVIEW_OF_ANOTHER_VERSION")
    expect(finishButton().disabled).toBe(true)
    stale.unmount()

    const heldDraft: SetupView = cap("draft_held").body
    render(<SetupWizard setupId={heldDraft.setup_id} accountId={ACCOUNT} view={VIEW} picks={[]} onClose={() => undefined}
      client={client(heldDraft).c} pendingStore={freshStore()} actor={ACTOR} stacks={{ state: "served", stacks: STACKS }}
      readPreview={previewOf(cap("preview_held").body)} />)
    await settle()
    expect(screen.getByTestId("setup-preview-summary").textContent).toContain("cannot be finished")
    expect(screen.getByTestId(`setup-preview-account-${ACCOUNT}`).textContent).toContain("census could not be read whole")
    expect(finishButton().disabled).toBe(true)
    cleanup()

    mount(client().c)
    await settle()
    step("1. System details")
    fireEvent.change(screen.getByDisplayValue("Payments"), { target: { value: "Payments 2" } })
    step("7. Review and start")
    await settle()
    expect(finishButton().disabled).toBe(true)
    expect(finishButton().title).toContain("Save your changes first")
  })

  it("PREVIEW_CHANGED: nothing is finished, the draft stays, its request is settled and the preview is read again", async () => {
    const changed = cap("finish_preview_changed")
    const { c } = client(DRAFT, { finishSetup: vi.fn(async () => writeAnswer({ status: changed.status, json: changed.body })) })
    const store = freshStore()
    const readPreview = previewOf(cap("preview").body)
    mount(c, { store, readPreview })
    await settle()
    fireEvent.click(finishButton())
    await settle()
    expect(screen.getByRole("alert").textContent).toContain("changed since you reviewed it")
    expect(screen.getByRole("alert").textContent).toContain("PREVIEW_CHANGED")
    expect(store.read()).toEqual([])
    expect((readPreview as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId("setup-state").textContent).toContain("Setup draft")
  })

  it("an unconfirmed version-2 Finish is resent EXACTLY -- same request, same digest -- even after the preview moved", async () => {
    const answers: SetupWrite[] = [{ kind: "RESEND_SAME", status: null, code: "NETWORK_ERROR", detail: {} },
                                   { kind: "SAVED", status: 201, view: structuredClone(FINISHED) }]
    const { c } = client(DRAFT, { finishSetup: vi.fn(async () => answers.shift()!) })
    const moved = structuredClone(cap("preview").body)              // an edit: the next preview names another result identity
    moved.result_digest = moved.basis_digest
    moved.preview_digest = contentHash({ basis_digest: moved.basis_digest, result_digest: moved.result_digest })
    const reads = [cap("preview").body, moved]
    const readPreview: PreviewFetcher = vi.fn(async () => parsePreview(200, structuredClone(reads.length > 1 ? reads.shift() : reads[0])))
    mount(c, { readPreview })
    await settle()
    fireEvent.click(finishButton())
    await settle()
    expect(screen.getByTestId("setup-pending").textContent).toContain("A Finish of this setup is not confirmed yet")
    fireEvent.click(screen.getByRole("button", { name: "Preview again" }))
    await settle()
    expect(screen.getByTestId("setup-preview-identity").textContent).toContain(moved.preview_digest.slice(0, 15))
    fireEvent.click(finishButton())
    await settle()
    const calls = (c.finishSetup as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(calls[0][3]).toBe(cap("preview").body.preview_digest)
  })

  it("an outstanding version-1 Finish of an earlier release is resent as version 1 -- no digest, never upgraded", async () => {
    const store = freshStore()
    const v1: PendingSetupOp = { version: 1, kind: "finish", actor: ACTOR, accountId: ACCOUNT, setupId: SID,
                                 requestId: "00000000-0000-4000-8000-000000000301", base: DRAFT.state_version,
                                 startedAt: "2026-10-13T00:00:00.000Z" }
    expect(store.put(v1)).toBe("storage")
    const { c } = client()
    mount(c, { store })
    await settle()
    fireEvent.click(finishButton())
    await settle()
    expect((c.finishSetup as ReturnType<typeof vi.fn>).mock.calls).toEqual([[SID, v1.requestId, v1.base]])
  })
})

describe("the stack binding and the person's decisions are authored in the guided steps, through the setup's own save", () => {
  it("the IaC stack choice is the setup's binding: removing it unbinds, choosing a stack binds it as listed; decisions stay", async () => {
    const { c, updates } = client()
    mount(c)
    await settle()
    step("3. Code and infrastructure")
    const iac = screen.getByLabelText(`Infrastructure as code, ${ACCOUNT} / ${SAVED_BINDING.region}`)
    fireEvent.change(iac, { target: { value: "not_used" } })
    fireEvent.change(screen.getByLabelText(`Infrastructure as code, ${ACCOUNT} / ${SAVED_BINDING.region}`),
                     { target: { value: "use_existing" } })
    fireEvent.change(screen.getByLabelText("CloudFormation stack"), { target: { value: STACKS[0].stack_id } })
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    const declaration = updates[0].declaration as Record<string, unknown>
    expect(declaration.bindings).toEqual([stackBinding(ACCOUNT, STACKS[0])])
    expect(declaration.resource_decisions).toEqual(SAVED_DECISIONS)
    expect((declaration.deployment as { scopes: unknown }).scopes).toEqual([{ account_id: ACCOUNT, region: STACKS[0].region }])
    expect("roots" in declaration).toBe(false)                          // saved without roots: still none
  })

  it("one stack per setup: a binding saved without a row stays, and a second stack is refused by name", async () => {
    const unpaired = structuredClone(DRAFT)
    unpaired.intent.dispositions = []                                     // an edit: the binding with no IaC row beside it
    const { c } = client(unpaired)
    mount(c)
    await settle()
    step("3. Code and infrastructure")
    const add = within(screen.getByTestId("setup-subject-iac")).getAllByRole("combobox").at(-1)!
    fireEvent.change(add, { target: { value: "use_existing" } })
    fireEvent.change(screen.getByLabelText("CloudFormation stack"), { target: { value: STACKS[0].stack_id } })
    expect(within(screen.getByTestId("setup-subject-iac")).getByRole("alert").textContent).toContain("binds one stack per setup")
  })

  it("the bound stack's REAL census rows: the saved exclusion shows as chosen, another is added, one removed; scopes follow", async () => {
    const { c, updates } = client()
    const readCensus = vi.fn(async () => ({ status: 200, body: cap("census_collected").body }))
    mount(c, { readCensus })
    await settle()
    step("4. Resource boundaries")
    expect(screen.getAllByTestId("setup-decision").map((li) => li.textContent)).toEqual(
      [expect.stringContaining(`Excluded: ${SAVED_DECISIONS[0].resource_uid}`)])
    fireEvent.click(screen.getByRole("button", { name: "Show its resources" }))
    await settle()
    expect(readCensus).toHaveBeenCalledWith(ACCOUNT, { depth: "collected", cursor: null })
    const selects = within(screen.getByTestId("setup-decisions")).getAllByRole("combobox") as HTMLSelectElement[]
    expect(selects).toHaveLength(3)                                       // exactly the three resources the bound stack lists
    const rows = cap("census_collected").body.rows.filter((r: { cfn?: { stack_id?: string } }) =>
      r.cfn?.stack_id === SAVED_BINDING.stack_id)
    const role = rows.find((r: { region: string }) => r.region === "global")
    expect(selects.map((s) => s.value)).toEqual(rows.map((r: { row_key: string }) =>
      (r.row_key === SAVED_DECISIONS[0].resource_uid ? "exclude" : "")))
    fireEvent.change(selects[rows.indexOf(role)], { target: { value: "exclude" } })
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
    await settle()
    const first = updates[0].declaration as { resource_decisions: ResourceDecision[]; deployment: { scopes: unknown } }
    expect(first.resource_decisions).toEqual([...SAVED_DECISIONS, {
      account_id: ACCOUNT, region: "global", resource_uid: role.row_key, verdict: "exclude",
      selection: { row_key: role.row_key, stack_id: SAVED_BINDING.stack_id, census: { generation: SAVED_BINDING.selection.census.generation } },
    }])
    expect(first.deployment.scopes).toEqual([{ account_id: ACCOUNT, region: SAVED_BINDING.region }, { account_id: ACCOUNT, region: "global" }]
      .sort((a, b) => a.region.localeCompare(b.region)))
  })
})

describe("what this release cannot carry back, and the rest of a long list", () => {
  it("a setup saved with a key this release does not know is shown read-only: never edited, saved or finished here", async () => {
    const newer = structuredClone(DRAFT)
    ;(newer.intent.declaration as Record<string, unknown>).deployments = []      // an edit: S1b's plural deployments
    mount(client(newer).c)
    await settle()
    expect(screen.getByTestId("setup-contract-unknown").textContent).toContain("SETUP_CONTRACT_UNKNOWN: declaration.deployments")
    expect(screen.queryByTestId("setup-finish")).toBeNull()
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull()
  })

  it("a list the summary cuts is read page by page from THIS preview, and a page of another preview is never added", async () => {
    const cut = structuredClone(cap("preview").body)                  // an edit: the summary lists one member, omits the other
    const account = cut.accounts[0]
    account.display.omitted = { members: account.display.members.length - 1 }
    account.display.members = account.display.members.slice(0, 1)
    const pages = [cap("preview_page").body, cap("preview_page_next").body]
    const readPreview: PreviewFetcher = vi.fn(async (_sid, _v, pageOf) =>
      parsePreview(200, structuredClone(pageOf ? pages.shift() : cut)))
    mount(client().c, { readPreview })
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Show all (1 more)" }))
    await settle()
    expect((readPreview as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual(
      [SID, DRAFT.state_version, { accountId: ACCOUNT, bucket: "members", cursor: null }])
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await settle()
    expect((readPreview as ReturnType<typeof vi.fn>).mock.calls[2][2].cursor).toBe(cap("preview_page").body.page.next)
    const members = within(screen.getByTestId("setup-preview-members")).getAllByRole("listitem")
    expect(members.map((li) => li.textContent?.split(" -- ")[0])).toEqual(
      [cap("preview_page").body.page.entries[0].resource_uid, cap("preview_page_next").body.page.entries[0].resource_uid])
  })

  it("a page answered under ANOTHER preview identity is refused as changed, and nothing of it is shown", async () => {
    const cut = structuredClone(cap("preview").body)                  // the same edit as above
    cut.accounts[0].display.omitted = { members: cut.accounts[0].display.members.length - 1 }
    cut.accounts[0].display.members = cut.accounts[0].display.members.slice(0, 1)
    const foreign = structuredClone(cap("preview_page").body)         // an edit: a whole, self-consistent answer of another preview
    foreign.result_digest = foreign.basis_digest
    foreign.preview_digest = contentHash({ basis_digest: foreign.basis_digest, result_digest: foreign.result_digest })
    foreign.page.preview_digest = foreign.preview_digest
    const readPreview: PreviewFetcher = vi.fn(async (_sid, _v, pageOf) => parsePreview(200, structuredClone(pageOf ? foreign : cut)))
    mount(client().c, { readPreview })
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Show all (1 more)" }))
    await settle()
    const list = screen.getByTestId("setup-preview-members")
    expect(list.textContent).toContain("PREVIEW_CHANGED")
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent?.split(" -- ")[0])).toEqual(
      [cut.accounts[0].display.members[0].resource_uid])
  })
})

describe("SW-S1A-20261013-09 corrections", () => {
  it("S1A-UI-LIFECYCLE-01: a refusal the backend did NOT record keeps the exact v2 request -- persisted, read-only, resent exactly", async () => {
    const draft: SetupView = cap("draft_unrecorded").body
    const finishing: SetupView = cap("read_finishing_unrecorded").body
    const unrecorded = cap("finish_input_changed_unrecorded")
    const reads = [draft, finishing]
    const s = storage()
    const store = freshStore(s)
    const c: SetupClient = {
      readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(reads.length > 1 ? reads.shift()! : reads[0]) })),
      readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: cap("status").body })),
      updateSetup: vi.fn(),
      finishSetup: vi.fn(async () => writeAnswer({ status: unrecorded.status, json: unrecorded.body })),
    }
    render(<SetupWizard setupId={draft.setup_id} accountId={ACCOUNT} view={VIEW} picks={[]} onClose={() => undefined} client={c}
      pendingStore={store} actor={ACTOR} stacks={{ state: "served", stacks: STACKS }} readPreview={previewOf(cap("preview_unrecorded").body)} />)
    await settle()
    fireEvent.click(finishButton())
    await settle()
    const [first] = (c.finishSetup as ReturnType<typeof vi.fn>).mock.calls
    const kept = freshStore(s).read()                                     // a reload: the same browser storage, a new page
    expect(kept).toEqual([{ version: 2, kind: "finish", actor: ACTOR, accountId: ACCOUNT, setupId: draft.setup_id, requestId: first[1],
                            base: draft.state_version, startedAt: expect.any(String), previewDigest: cap("preview_unrecorded").body.preview_digest }])
    const alert = screen.getByRole("alert").textContent ?? ""
    expect(alert).toContain("could not be recorded (GRANT_REVOKED)")
    expect(alert).not.toContain("draft again")
    expect(screen.getByTestId("setup-state").textContent).toContain("Setup finishing")
    expect(screen.queryByTestId("setup-finish")).toBeNull()                // read-only: no new Finish, no edits
    fireEvent.click(screen.getByRole("button", { name: "Check the save again" }))
    await settle()
    const calls = (c.finishSetup as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])                                    // the SAME request id, base and digest
  })

  it("S1A-UI-LIFECYCLE-01 control: a RECORDED refusal is definitive -- settled, and the setup is a draft again", async () => {
    const recorded = cap("finish_input_changed")
    const store = freshStore()
    const { c } = client(DRAFT, { finishSetup: vi.fn(async () => writeAnswer({ status: recorded.status, json: recorded.body })) })
    mount(c, { store })
    await settle()
    fireEvent.click(finishButton())
    await settle()
    expect(store.read()).toEqual([])
    expect(screen.getByRole("alert").textContent).toContain("draft again")
  })

  function cutPreview() {                                               // an edit: the summary lists one member, omits the other
    const cut = structuredClone(cap("preview").body)
    cut.accounts[0].display.omitted = { members: cut.accounts[0].display.members.length - 1 }
    cut.accounts[0].display.members = cut.accounts[0].display.members.slice(0, 1)
    return cut
  }

  /** The first page of the members list, delayed until released; any later page answers the second. */
  function delayedPages() {
    const resolvers: (() => void)[] = []
    const pageCalls: { cursor: string | null }[] = []
    const readPreview: PreviewFetcher = vi.fn(async (_sid, _v, pageOf) => {
      if (!pageOf) return parsePreview(200, cutPreview())
      pageCalls.push({ cursor: pageOf.cursor ?? null })
      const body = pageOf.cursor ? cap("preview_page_next").body : cap("preview_page").body
      if (!pageOf.cursor) await new Promise<void>((resolve) => { resolvers.push(resolve) })
      return parsePreview(200, structuredClone(body))
    })
    return { readPreview, resolvers, pageCalls }
  }
  const memberRows = () => within(screen.getByTestId("setup-preview-members")).getAllByRole("listitem")
    .map((li) => li.textContent?.split(" -- ")[0])

  it("S1A-UI-PREVIEW-01: a double click while the first page is out sends ONE request (the in-flight fence)", async () => {
    const { readPreview, resolvers, pageCalls } = delayedPages()
    mount(client().c, { readPreview })
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Show all (1 more)" }))
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Reading…" }))
    await settle()
    expect(pageCalls).toEqual([{ cursor: null }])
    await act(async () => { resolvers.forEach((resolve) => resolve()) })
    await settle()
    expect(memberRows()).toEqual([cap("preview_page").body.page.entries[0].resource_uid])
  })

  it("S1A-UI-PREVIEW-01: whatever reaches the list, answered in either order, each page is shown once and the rest stays reachable", async () => {
    const { readPreview, resolvers } = delayedPages()
    mount(client().c, { readPreview })
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Show all (1 more)" }))
    await settle()
    fireEvent.click(screen.getByRole("button", { name: /Reading…|Show all/ }))
    await settle()
    await act(async () => { [...resolvers].reverse().forEach((resolve) => resolve()) })     // any second answer first
    await settle()
    expect(memberRows()).toEqual([cap("preview_page").body.page.entries[0].resource_uid])
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await settle()
    expect(memberRows()).toEqual([cap("preview_page").body.page.entries[0].resource_uid, cap("preview_page_next").body.page.entries[0].resource_uid])
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })

  it.each([
    ["another list", (b: any) => { b.page.bucket = "dependencies" }, "PAGE_OF_ANOTHER_LIST"],              // eslint-disable-line @typescript-eslint/no-explicit-any
    ["another saved version", (b: any) => { b.setup.state_version += 1 }, "PREVIEW_OF_ANOTHER_VERSION"],   // eslint-disable-line @typescript-eslint/no-explicit-any
  ])("S1A-UI-PREVIEW-02: a same-preview page of %s is refused; rows and cursor unchanged", async (_label, edit, code) => {
    const wrong = structuredClone(cap("preview_page").body)            // an edit: the response names something else
    edit(wrong)
    const answers = [wrong, cap("preview_page").body]
    const readPreview: PreviewFetcher = vi.fn(async (_sid, _v, pageOf) =>
      parsePreview(200, structuredClone(pageOf ? answers.shift() : cutPreview())))
    mount(client().c, { readPreview })
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Show all (1 more)" }))
    await settle()
    const list = screen.getByTestId("setup-preview-members")
    expect(list.textContent).toContain(code)
    expect(within(list).getAllByRole("listitem")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Show all (1 more)" }))  // the same first cursor again: the right page
    await settle()
    expect((readPreview as ReturnType<typeof vi.fn>).mock.calls[2][2]).toEqual({ accountId: ACCOUNT, bucket: "members", cursor: null })
    expect(within(screen.getByTestId("setup-preview-members")).getAllByRole("listitem").map((li) => li.textContent?.split(" -- ")[0]))
      .toEqual([cap("preview_page").body.page.entries[0].resource_uid])
  })

  it("S1A-UI-PREVIEW-03: a COMPUTED preview with coverage limits says so; a complete one shows none", async () => {
    const partial = structuredClone(cap("preview").body)             // an edit: the documented coverage shape, limits supplied
    Object.assign(partial.accounts[0].coverage, { complete: false, incomplete_reason: "WORK_BUDGET_EXHAUSTED", frontier_count: 3 })
    partial.counts.unlisted = 2
    const view = mount(client().c, { readPreview: previewOf(partial) })
    await settle()
    expect(screen.getByTestId("setup-preview-summary").textContent).toContain("but this preview is limited")
    expect(screen.getByTestId(`setup-preview-limits-${ACCOUNT}`).textContent).toContain("not completely planned (WORK_BUDGET_EXHAUSTED)")
    expect(screen.getByTestId("setup-preview-unlisted").textContent).toContain("2 row(s)")
    view.unmount()
    mount(client().c)
    await settle()
    expect(screen.queryByTestId(`setup-preview-limits-${ACCOUNT}`)).toBeNull()
    expect(screen.queryByTestId("setup-preview-unlisted")).toBeNull()
  })
})

describe("S1a R7: the finished setup's result accounts and THIS Finish's applied result", () => {
  const FIN: SetupView = cap("read_finished").body
  const SYSTEM_ID = FIN.receipt!.association.system.key.slice("SYSTEM#".length)
  /** The real Applied / result answers (system-boundary-captures), moved to this setup's account and System -- an edit. */
  const appliedAt = (generation: number) => ({ status: 200, body: { ...json("system-boundary-captures/applied.json").body,
    account_id: FIN.result_scope!.state === "SERVED" ? FIN.result_scope!.accounts[0] : "", generation,
    applied_revision: FIN.receipt!.association.completed_revision, saved_revision: FIN.receipt!.association.completed_revision } })
  const resultAt = (generation: number) => ({ status: 200, body: { ...json("system-boundary-captures/result.json").body,
    account_id: (FIN.result_scope as { accounts: string[] }).accounts[0], system_key: SYSTEM_ID, generation } })

  function mountFinished(view: SetupView, readApplied: ReturnType<typeof vi.fn>, readResult: ReturnType<typeof vi.fn>,
                         screenAccount = "999988887777") {
    return render(<SetupWizard setupId={view.setup_id} accountId={screenAccount} view={VIEW} picks={[]} onClose={() => undefined}
      client={client(view).c} pendingStore={freshStore()} actor={ACTOR} readApplied={readApplied} readResult={readResult} />)
  }

  it("reads exactly the pinned scope's accounts (never this screen's) and pairs the same generation as applied", async () => {
    expect(FIN.result_scope).toEqual({ v: 1, state: "SERVED", accounts: [ACCOUNT], from: FIN.receipt!.association.deployments[0] })
    const readApplied = vi.fn(async () => appliedAt(41))
    const readResult = vi.fn(async () => resultAt(41))
    mountFinished(FIN, readApplied, readResult)
    await settle()
    expect(readApplied.mock.calls).toEqual([[ACCOUNT]])
    expect(readResult.mock.calls).toEqual([[ACCOUNT, SYSTEM_ID]])
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).toBe("This Finish's applied result -- membership generation 41.")
    expect(screen.getByTestId("setup-progress-proposed").textContent).toContain("not what is applied now")
  })

  it("an older result beside a newer Applied is 'updating, as of generation G' -- never this Finish's applied result", async () => {
    mountFinished(FIN, vi.fn(async () => appliedAt(41)), vi.fn(async () => resultAt(40)))
    await settle()
    const said = screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent ?? ""
    expect(said).toContain("Updating")
    expect(said).toContain("as of generation 40")
    expect(said).not.toContain("This Finish's applied result")
  })

  it("a race: the first read's answer (old result) arriving after Check again's (paired) changes nothing", async () => {
    let releaseFirst: (() => void) | null = null
    let reads = 0
    const readApplied = vi.fn(async () => appliedAt(41))
    const readResult = vi.fn(async () => {
      reads += 1
      if (reads === 1) {                                                  // the first read is slow and answers an OLD result
        await new Promise<void>((resolve) => { releaseFirst = resolve })
        return resultAt(40)
      }
      return resultAt(41)
    })
    mountFinished(FIN, readApplied, readResult)
    await settle()
    fireEvent.click(within(screen.getByTestId("finish-result")).getByRole("button", { name: "Check again" }))
    await settle()
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).toBe("This Finish's applied result -- membership generation 41.")
    await act(async () => { releaseFirst!() })
    await settle()
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).toBe("This Finish's applied result -- membership generation 41.")
  })

  it("S1A-R7-PAIR-01: Applied 41 beside an older same-System result: no 'membership shown' claim; its rows stay, as updating", async () => {
    mountFinished(FIN, vi.fn(async () => appliedAt(41)), vi.fn(async () => resultAt(40)))
    await settle()
    const applied = screen.getByTestId(`finish-result-applied-${ACCOUNT}`).textContent ?? ""
    expect(applied).not.toContain("membership shown")
    expect(applied).toContain("this save is applied in membership generation 41")
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).toContain("as of generation 40")
    expect(within(screen.getByTestId(`finish-result-${ACCOUNT}`)).getAllByRole("listitem").length).toBeGreaterThan(0)
  })

  it("S1A-R7-CORR-PAIR-01: an Applied answer naming another account puts no claim under this account", async () => {
    const foreign = appliedAt(41)                                      // an edit: right shape and generation, another account
    foreign.body = { ...foreign.body, account_id: "999988887777" }
    mountFinished(FIN, vi.fn(async () => foreign), vi.fn(async () => resultAt(41)))
    await settle()
    const applied = screen.getByTestId(`finish-result-applied-${ACCOUNT}`).textContent ?? ""
    expect(applied).toContain("APPLIED_IDENTITY_MISMATCH")
    expect(applied).not.toMatch(/applied in membership generation|includes this save/)
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).not.toContain("This Finish's applied result")
  })

  it("S1A-R7-CORR-PAIR-01: another account's Applied beside an unavailable result names no 'as of' generation", async () => {
    const foreign = appliedAt(41)                                      // an edit: right shape and generation, another account
    foreign.body = { ...foreign.body, account_id: "999988887777" }
    mountFinished(FIN, vi.fn(async () => foreign), vi.fn(async () => ({ status: 503, body: { detail: { code: "RESULT_STORE_UNAVAILABLE" } } })))
    await settle()
    expect(screen.getByTestId(`finish-result-applied-${ACCOUNT}`).textContent).toContain("APPLIED_IDENTITY_MISMATCH")
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).not.toContain("as of generation")
  })

  it("S1A-APPLIED-UNKNOWN-01: Applied and result both unreadable (the installed observation) -- unknown, never 'not applied'", async () => {
    // Constructed: the installed observation recorded no status or body; these are two shapes the parsers read as
    // RESPONSE_NOT_CONTRACT -- a read that threw, and the authoring proxy's own backend-unavailable refusal.
    for (const unreadable of [{ status: 0, body: null }, { status: 502, body: { detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } } }]) {
      const view = mountFinished(FIN, vi.fn(async () => unreadable), vi.fn(async () => unreadable))
      await settle()
      const pairingSaid = screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent ?? ""
      expect(pairingSaid).toBe("Unknown -- whether this Finish is applied in this account could not be read; it is not shown as "
        + "this Finish's applied result.")
      expect(screen.getByTestId(`finish-result-applied-${ACCOUNT}`).textContent)
        .toContain("Whether the save is applied could not be read (RESPONSE_NOT_CONTRACT).")
      expect(screen.getByTestId(`finish-result-${ACCOUNT}`).textContent).not.toMatch(/not applied|This Finish's applied result/)
      expect(within(screen.getByTestId(`finish-result-${ACCOUNT}`)).queryAllByRole("listitem")).toHaveLength(0)
      view.unmount()
    }
  })

  it("S1A-R7-PAIR-02: a served result naming another System shows none of its rows; it is refused by name", async () => {
    const foreign = resultAt(41)                                        // an edit: right account and generation, another System
    foreign.body = { ...foreign.body, system_key: `${SYSTEM_ID}x` }
    mountFinished(FIN, vi.fn(async () => appliedAt(41)), vi.fn(async () => foreign))
    await settle()
    const block = screen.getByTestId(`finish-result-${ACCOUNT}`)
    expect(screen.getByTestId(`finish-result-foreign-${ACCOUNT}`).textContent).toContain("RESULT_IDENTITY_MISMATCH")
    expect(within(block).queryAllByRole("listitem")).toHaveLength(0)
    expect(screen.getByTestId(`finish-result-pairing-${ACCOUNT}`).textContent).not.toContain("This Finish's applied result")
  })

  it("S1A-R7-PAIR-03: the person changes while a pair is out -- the earlier person's answer never installs", async () => {
    let releaseAlice: (() => void) | null = null
    const calls: string[] = []
    const readApplied = vi.fn(async () => appliedAt(41))
    const readResult = vi.fn(async () => {
      calls.push(calls.length ? "bob" : "alice")
      if (calls.length === 1) await new Promise<void>((resolve) => { releaseAlice = resolve })
      else await new Promise<void>(() => undefined)                  // Bob's reads stay pending: nothing authorized yet
      return resultAt(41)
    })
    const alice = client(FIN).c
    const view = render(<SetupWizard setupId={FIN.setup_id} accountId={ACCOUNT} view={VIEW} picks={[]} onClose={() => undefined}
      client={alice} pendingStore={freshStore()} actor="idp#alice" readApplied={readApplied} readResult={readResult} />)
    await settle()
    const bob: SetupClient = { ...client(FIN).c, readSetup: vi.fn(() => new Promise(() => undefined)) as SetupClient["readSetup"] }
    view.rerender(<SetupWizard setupId={FIN.setup_id} accountId={ACCOUNT} view={VIEW} picks={[]} onClose={() => undefined}
      client={bob} pendingStore={freshStore()} actor="idp#bob" readApplied={readApplied} readResult={readResult} />)
    await settle()
    await act(async () => { releaseAlice!() })
    await settle()
    expect(calls).toEqual(["alice", "bob"])                              // a fresh read for the current person, nothing reused
    expect(screen.queryByTestId(`finish-result-pairing-${ACCOUNT}`)).toBeNull()
    expect(screen.getByTestId("finish-result").textContent).toContain("reading…")
  })

  it("an UNAVAILABLE result scope names its reason and reads nothing -- never today's or this screen's accounts", async () => {
    const missing = structuredClone(FIN)                                // an edit: the pinned Deployment history is gone
    missing.result_scope = { v: 1, state: "UNAVAILABLE", reason: "DEPLOYMENT_HISTORY_MISSING", from: FIN.receipt!.association.deployments[0] }
    const readApplied = vi.fn(async () => appliedAt(41))
    const readResult = vi.fn(async () => resultAt(41))
    mountFinished(missing, readApplied, readResult, ACCOUNT)
    await settle()
    expect(screen.getByTestId("setup-progress-scope-unavailable").textContent).toContain("DEPLOYMENT_HISTORY_MISSING")
    expect(readApplied).not.toHaveBeenCalled()
    expect(readResult).not.toHaveBeenCalled()
  })
})
