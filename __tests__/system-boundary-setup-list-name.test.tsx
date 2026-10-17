/**
 * (PC1 S0-H) "Your setups" names the System each setup is about -- from the backend's ``system`` on each list row (the
 * setup's own records) and, for a ``ref``, ONLY from the Systems this page already reads for the person.
 *
 * Inputs: the backend's own captures (system-boundary-setup-captures-v5, regenerated at saferemediate-backend H on e593baec):
 * list.json (a draft naming its typed new System) and read_finished.json (a finished setup naming the System it applied); the
 * declarations view capture system-boundary/view_after_save.json. Cases no capture contains are labelled TEST_ONLY variants
 * of those captures: an unreadable row, a field from before H, a System renamed since Finish.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GuidedSetups } from "@/components/system-boundary/guided-setups"
import type { DeclarationsView } from "@/lib/system-boundary-authoring"
import { readListedSystem, scopedSystemName, systemPhrase, unavailableNote } from "@/lib/system-boundary-setup-name"
import { isSummary, type SetupSummary } from "@/lib/system-boundary-setup"
import { setupPendingStore, type PendingSetupOp } from "@/lib/system-boundary-setup-pending"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (file: string): any => JSON.parse(readFileSync(resolve(__dirname, "..", file), "utf8"))
const V5 = (name: string) => json(`__tests__/fixtures/system-boundary-setup-captures-v5/${name}.json`)
const VIEW: DeclarationsView = json("__tests__/fixtures/system-boundary/view_after_save.json").body
const LIST = () => V5("list")
const DRAFT = (): SetupSummary => LIST().body.setups[0]
const FINISHED = (): SetupSummary => V5("read_finished").body
const APPLIED_KEY = () => (FINISHED().association as { system: { key: string } }).system.key

/** TEST_ONLY: the captured view with one more System -- the finished capture's applied System, under ``name``. */
function viewWith(name: string): DeclarationsView {
  const record = { ...VIEW.systems[0], key: APPLIED_KEY(), body: { ...VIEW.systems[0]?.body, display_name: name } }
  return { ...VIEW, systems: [...VIEW.systems, record] }
}

async function listed(setups: SetupSummary[], view: DeclarationsView = VIEW) {
  const owner = DRAFT().owner
  render(<GuidedSetups accountId="111111111111" view={view} picks={[]} actor={owner}
    listSetups={vi.fn(async () => ({ kind: "OK" as const, value: { setups, next_cursor: null } }))}
    pendingStore={setupPendingStore(null, new Map<string, PendingSetupOp>())}
    readStacks={async () => ({ status: 503, body: {} })} />)
  fireEvent.click(screen.getByTestId("setup-mine"))
  await act(async () => {})
}

afterEach(cleanup)

describe("the row's system, read into one state", () => {
  it("the backend's own answers: a draft's typed new System and the System a finished setup applied", () => {
    expect(LIST().body.unreadable_rows).toBe(0)
    expect(readListedSystem(DRAFT() as never)).toEqual({ state: "new", displayName: "Payments" })
    const finished = readListedSystem(FINISHED() as never)
    expect(finished).toEqual({ state: "ref", systemId: APPLIED_KEY().split("#", 2)[1], declaredName: "Payments" })
  })

  it("absent (before H) and null keep today's words; unreadable and an unknown shape are marked, never thrown", () => {
    const { system: _drop, ...before } = DRAFT() as never as Record<string, unknown>
    expect(readListedSystem(before)).toEqual({ state: "absent" })
    expect(readListedSystem({ ...DRAFT(), system: null } as never)).toEqual({ state: "none" })
    expect(readListedSystem({ ...DRAFT(), system: null, system_unreadable: "SETUPREV_MISSING" } as never))
      .toEqual({ state: "unreadable", code: "SETUPREV_MISSING" })
    expect(readListedSystem({ ...DRAFT(), system: null, system_unreadable: 7 } as never))
      .toEqual({ state: "unreadable", code: "SYSTEM_FIELD_INVALID" })            // a mark this reader cannot read is still a mark
    for (const bad of [{ mode: "new" }, { mode: "ref", system_id: "" , declared_name: null }, { mode: "x" }, "Payments", []]) {
      const read = readListedSystem({ ...DRAFT(), system: bad } as never)
      expect(read, JSON.stringify(bad)).toEqual({ state: "unreadable", code: "SYSTEM_FIELD_INVALID" })
      expect(unavailableNote(read)).toBe("name unavailable (SYSTEM_FIELD_INVALID)")
    }
  })

  it("an unknown or absent field never makes a row unreadable to the list guard", () => {
    const row = DRAFT() as never as Record<string, unknown>
    const { system: _drop, ...before } = row
    for (const value of [{ ...row, system: { mode: "something-new" } }, before, { ...row, system: null, system_unreadable: 7 }]) {
      expect(isSummary(value), JSON.stringify(value.system)).toBe(true)
    }
  })

  it("a ref is named only from the page's Systems; out of them it is 'an existing System' and never its id", () => {
    const ref = readListedSystem(FINISHED() as never)
    if (ref.state !== "ref") throw new Error("ref expected")
    expect(scopedSystemName(ref.systemId, VIEW.systems)).toBeNull()
    expect(systemPhrase(ref, viewWith("Payments Platform").systems)).toBe(" of Payments Platform")
    expect(systemPhrase(ref, VIEW.systems)).toBe(" of Payments (as declared)")
    const draftRef = { ...ref, declaredName: null }
    expect(systemPhrase(draftRef, VIEW.systems)).toBe(" of an existing System")
    expect(systemPhrase(draftRef, VIEW.systems)).not.toContain(ref.systemId)
    const tombstoned = viewWith("Payments Platform")
    tombstoned.systems[tombstoned.systems.length - 1].tombstoned = true
    expect(scopedSystemName(ref.systemId, tombstoned.systems)).toBeNull()
  })
})

describe("Your setups, rendered", () => {
  it("names a draft's typed System and a finished setup's APPLIED System -- its current name, not the typed one", async () => {
    await listed([DRAFT(), FINISHED()], viewWith("Payments Platform"))         // TEST_ONLY: the System renamed since Finish
    expect(screen.getByTestId("setup-resume-list").textContent).toMatch(/^Resume setup of Payments from .+ \(draft\)$/)
    const finished = screen.getByTestId("setup-finished-list").textContent ?? ""
    expect(finished).toMatch(/^Progress and results of the setup of Payments Platform finished /)
    expect(finished).not.toContain("as declared")
    expect(screen.queryByTestId("setup-names-unavailable")).toBeNull()
  })

  it("a finished System outside the page's Systems falls back to its typed name, marked as declared", async () => {
    await listed([FINISHED()])
    expect(screen.getByTestId("setup-finished-list").textContent)
      .toMatch(/^Progress and results of the setup of Payments \(as declared\) finished /)
  })

  it("an existing System outside the page's Systems reads 'an existing System', without its id", async () => {
    const ref = FINISHED().system as { system_id: string }
    const draft = { ...DRAFT(), system: { mode: "ref", system_id: ref.system_id, declared_name: null } }   // TEST_ONLY
    await listed([draft])
    const text = screen.getByTestId("setup-resume-list").textContent ?? ""
    expect(text).toMatch(/^Resume setup of an existing System from /)
    expect(text).not.toContain(ref.system_id)
  })

  it("an unreadable row is marked and counted while the list is still shown", async () => {
    const unreadable = { ...DRAFT(), setup_id: crypto.randomUUID(), system: null, system_unreadable: "SETUPREV_MISSING" }  // TEST_ONLY
    await listed([DRAFT(), unreadable])
    const rows = screen.getByTestId("setup-resume-list").querySelectorAll("li")
    expect(rows).toHaveLength(2)
    expect(screen.getAllByTestId("setup-name-unavailable").map((n) => n.textContent)).toEqual([" -- name unavailable (SETUPREV_MISSING)"])
    expect(screen.getByTestId("setup-names-unavailable").textContent).toContain("1 of the setups below could not be named")
  })

  it("a row from a backend before H keeps today's words exactly", async () => {
    const { system: _drop, ...before } = DRAFT() as never as Record<string, unknown>          // TEST_ONLY: field absent
    await listed([before as never])
    expect(screen.getByTestId("setup-resume-list").textContent).toMatch(/^Resume setup from .+ \(draft\)$/)
    expect(screen.queryByTestId("setup-name-unavailable")).toBeNull()
  })
})
