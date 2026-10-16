/**
 * AP182 · the crown-jewel rail (CrownJewelListPanel) over the captured target catalog section.
 *
 * Real: the panel, the target-catalog adapter and the captured backend section (__tests__/fixtures/ap182-lifecycle).
 * Each row's held count and cause are the TARGET's own, as served. The non-install shape is derived by removing
 * every `held_path_count` (the live route's model drops it).
 */
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import capturedSection from "@/__tests__/fixtures/ap182-lifecycle/target-catalog-section.json"
import { CrownJewelListPanel } from "@/components/identity-attack-paths/crown-jewel-list-panel"
import { LIFECYCLE_HELD_EXPLANATION } from "@/lib/attack-paths/lifecycle-coverage"
import { targetCatalogToJewelSummaries, type TargetCatalog } from "@/lib/attack-paths/target-catalog"
import { TARGET_STATE_CONFIG } from "@/lib/types"

afterEach(() => cleanup())

const SECTION = capturedSection as unknown as TargetCatalog
const NON_INSTALL = {
  ...SECTION,
  targets: SECTION.targets.map(({ held_path_count: _drop, ...rest }) => rest),
} as TargetCatalog

function renderRail(catalog: TargetCatalog) {
  render(
    <CrownJewelListPanel
      jewels={targetCatalogToJewelSummaries(catalog)}
      serveState={catalog.serve_state}
      stateCounts={catalog.counts}
      selectedJewelId={null}
      onSelect={() => undefined}
    />,
  )
}

function row(name: string): HTMLElement {
  return screen.getByTitle(name).closest("button") as HTMLElement
}

describe("the rail names each target's own lifecycle / withheld cause", () => {
  it("mixed target: its listed count, its own held count beside it, and the lifecycle explanation", () => {
    renderRail(SECTION)
    const mixed = row("bucket-1")
    expect(mixed).toHaveTextContent("1 path")
    const note = within(mixed).getByTestId("target-coverage-note")
    expect(note).toHaveTextContent("+2 held, not counted")
    expect(note).toHaveAttribute("data-coverage-cause", "lifecycle")
    expect(note).toHaveAttribute("title", `Lifecycle coverage incomplete (2 paths held). ${LIFECYCLE_HELD_EXPLANATION}`)
    expect(within(mixed).getByText("observed")).toHaveAttribute(
      "title", `Lifecycle coverage incomplete (2 paths held). ${LIFECYCLE_HELD_EXPLANATION}`)
  })

  it("all-held target: PENDING, explained as lifecycle — not as a missing manifest", () => {
    renderRail(SECTION)
    const allHeld = row("empty-bucket")
    expect(within(allHeld).getByText("PENDING")).toHaveAttribute(
      "aria-label", `Lifecycle coverage incomplete (1 path held). ${LIFECYCLE_HELD_EXPLANATION}`)
    expect(within(allHeld).getByTestId("target-coverage-note")).toHaveTextContent("+1 held, not counted")
    expect(allHeld.innerHTML).not.toContain("no manifest entry")
  })

  it("withheld target: the receipt code, never called lifecycle", () => {
    renderRail(SECTION)
    const withheld = row("aurora-a")
    const note = within(withheld).getByTestId("target-coverage-note")
    expect(note).toHaveTextContent("coverage withheld")
    expect(note).toHaveAttribute("data-coverage-cause", "withheld")
    expect(note.getAttribute("title")).toContain("database_eni_binding_not_in_normalized_inventory")
    expect(note.getAttribute("title")).not.toMatch(/lifecycle/i)
  })

  it("nothing recorded: the established state description and no note", () => {
    renderRail(SECTION)
    const legacy = row("db-1")
    expect(within(legacy).queryByTestId("target-coverage-note")).toBeNull()
    expect(within(legacy).getByText("PENDING")).toHaveAttribute(
      "aria-label", TARGET_STATE_CONFIG.coverage_incomplete.description)
    expect(within(legacy).getByText("coverage incomplete")).toHaveAttribute(
      "title", TARGET_STATE_CONFIG.coverage_incomplete.description)
  })

  it("non-install shape: still held, and no count is invented", () => {
    renderRail(NON_INSTALL)
    const mixed = within(row("bucket-1")).getByTestId("target-coverage-note")
    expect(mixed).toHaveTextContent("more paths held, not counted")
    expect(mixed.textContent).not.toMatch(/\d+ held/)
    expect(mixed).toHaveAttribute("title", `Lifecycle coverage incomplete. ${LIFECYCLE_HELD_EXPLANATION}`)
  })

  it("AP183-R2 CONSTRUCTED unreadable evidence (one captured row's value replaced): visibly unknown, no count", () => {
    renderRail({
      ...SECTION,
      targets: SECTION.targets.map((t) =>
        t.name === "db-1" ? { ...t, held_path_count: 0 }
          : t.name === "db-stray" ? { ...t, coverage_withheld_reason: {} as never } : t),
    } as TargetCatalog)
    for (const name of ["db-1", "db-stray"]) {
      const r = row(name)
      const note = within(r).getByTestId("target-coverage-note")
      expect(note, name).toHaveTextContent("coverage evidence unreadable")
      expect(note, name).toHaveAttribute("data-coverage-cause", "unreadable")
      expect(note.textContent, name).not.toMatch(/\d+ held/)
      expect(within(r).getByText("PENDING").getAttribute("aria-label"), name).toMatch(/could not be read/)
      expect(within(r).getByText("coverage incomplete").getAttribute("title"), name).not.toBe(
        TARGET_STATE_CONFIG.coverage_incomplete.description)
    }
    // ... while a row with nothing recorded beside them keeps the established copy
    expect(within(row("db-us-only")).queryByTestId("target-coverage-note")).toBeNull()
  })

  it("AP184-1 CONSTRUCTED: a 'no modeled route' row with unreadable evidence never claims NO PATH / no modeled route", () => {
    // db-us-only turned into a no_modeled_route row carrying a malformed count; db-x1 the same state, nothing recorded
    renderRail({
      ...SECTION,
      targets: SECTION.targets.map((t) =>
        t.name === "db-us-only" ? { ...t, state: "no_modeled_route", held_path_count: "bad" as never }
          : t.name === "db-x1" ? { ...t, state: "no_modeled_route" } : t),
    } as TargetCatalog)
    const unreadable = row("db-us-only")
    expect(within(unreadable).queryByText("NO PATH")).toBeNull()                 // the false claim, rejected
    expect(within(unreadable).queryByText("no modeled route")).toBeNull()
    expect(within(unreadable).getByText("PENDING").getAttribute("aria-label")).toMatch(/could not be read/)
    const chip = within(unreadable).getByText("coverage incomplete")
    expect(chip).toHaveAttribute("data-target-state", "no_modeled_route")       // identity: the served state
    expect(chip).toHaveAttribute("data-displayed-state", "coverage_incomplete")
    expect(within(unreadable).getByTestId("target-coverage-note")).toHaveTextContent("coverage evidence unreadable")
    // control: the same served state with nothing recorded keeps the established display exactly
    const legacy = row("db-x1")
    expect(within(legacy).getByText("NO PATH")).toBeInTheDocument()
    const legacyChip = within(legacy).getByText("no modeled route")
    expect(legacyChip).toHaveAttribute("data-target-state", "no_modeled_route")
    expect(legacyChip).not.toHaveAttribute("data-displayed-state")
    expect(legacyChip).toHaveAttribute("title", TARGET_STATE_CONFIG.no_modeled_route.description)
    expect(within(legacy).queryByTestId("target-coverage-note")).toBeNull()
  })

  it("AP184-2 CONSTRUCTED: a receipt code beside a malformed count is withheld with unreadable held evidence, never held", () => {
    renderRail({
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "aurora-a" ? { ...t, held_path_count: 0 } : t)),
    } as TargetCatalog)
    const note = within(row("aurora-a")).getByTestId("target-coverage-note")
    expect(note).toHaveTextContent("coverage withheld · held-path evidence unreadable")
    expect(note.textContent).not.toMatch(/paths held|\+\d+ held/)
    expect(note).toHaveAttribute("data-coverage-cause", "withheld")
  })

  it("the per-state counts line is the catalog's own, unchanged", () => {
    renderRail(SECTION)
    const line = screen.getByTestId("target-zero-states")
    expect(line).toHaveTextContent("8 coverage incomplete")
    expect(line).toHaveAttribute("data-served-zero-states", "8 coverage incomplete")
    expect(line).not.toHaveAttribute("title")                                    // shown = served
  })

  // AP187-F2. A constructed catalog that changes a state recounts `counts` the way the captured one is counted.
  const recounted = (targets: TargetCatalog["targets"]): TargetCatalog => {
    const counts: Record<string, number> = Object.fromEntries(Object.keys(SECTION.counts).map((k) => [k, 0]))
    for (const t of targets) counts[t.state] = (counts[t.state] ?? 0) + 1
    return { ...SECTION, targets, counts } as TargetCatalog
  }

  it("precondition: the captured catalog's counts are exactly the tally of its target states", () => {
    expect(recounted(SECTION.targets).counts).toEqual(SECTION.counts)
  })

  it("AP187-F2 CONSTRUCTED: the summary counts rows as SHOWN; the served counts stay on the element", () => {
    renderRail(recounted(SECTION.targets.map((t) =>
      t.name === "db-us-only" ? { ...t, state: "no_modeled_route" as const, held_path_count: "bad" as never }
        : t.name === "db-x1" ? { ...t, state: "no_modeled_route" as const } : t)))
    const line = screen.getByTestId("target-zero-states")
    // db-us-only's row says coverage incomplete (AP184), so the summary does too; db-x1 still has no route
    expect(line).toHaveTextContent(/^1 no modeled route · 7 coverage incomplete$/)
    expect(line).toHaveAttribute("data-served-zero-states", "2 no modeled route · 6 coverage incomplete")
    expect(line.getAttribute("title")).toMatch(/^Served: 2 no modeled route · 6 coverage incomplete\./)
    // ... and it agrees with the rows themselves
    const shownNoRoute = screen.getAllByText("no modeled route").filter((el) => el.hasAttribute("data-target-state"))
    expect(shownNoRoute).toHaveLength(1)
  })

  it("AP187-F2 CONSTRUCTED control: a legacy no-route row with nothing recorded is counted as served", () => {
    renderRail(recounted(SECTION.targets.map((t) => (t.name === "db-x1" ? { ...t, state: "no_modeled_route" as const } : t))))
    const line = screen.getByTestId("target-zero-states")
    expect(line).toHaveTextContent(/^1 no modeled route · 7 coverage incomplete$/)
    expect(line).toHaveAttribute("data-served-zero-states", "1 no modeled route · 7 coverage incomplete")
    expect(line).not.toHaveAttribute("title")
  })

  it("AP187-F2 CONSTRUCTED: served counts that cannot account for a re-shown row show no summary at all", () => {
    // the state changed WITHOUT a recount: the served counts hold no no-route target for the row to move from
    renderRail({
      ...SECTION,
      targets: SECTION.targets.map((t) => (t.name === "db-us-only" ? { ...t, state: "no_modeled_route", held_path_count: "bad" as never } : t)),
    } as TargetCatalog)
    expect(screen.queryByTestId("target-zero-states")).toBeNull()
    expect(screen.queryAllByText(/no modeled route/).filter((el) => !el.hasAttribute("data-target-state"))).toEqual([])
  })

  // AP188: the counts arrive from the catalog response unvalidated; malformed present evidence is never coerced.
  const UNREADABLE_DB_US_ONLY = SECTION.targets.map((t) =>
    t.name === "db-us-only" ? { ...t, state: "no_modeled_route" as const, held_path_count: "bad" as never } : t)
  const withCounts = (counts: unknown): TargetCatalog =>
    ({ ...SECTION, targets: UNREADABLE_DB_US_ONLY, counts } as unknown as TargetCatalog)

  it.each([
    ["a string destination", { no_modeled_route: 1, coverage_incomplete: "7", observed: 2 }],
    ["a negative destination", { no_modeled_route: 1, coverage_incomplete: -2, observed: 2 }],
    ["a fractional source", { no_modeled_route: 1.5, coverage_incomplete: 7, observed: 2 }],
    ["an explicit null destination", { no_modeled_route: 1, coverage_incomplete: null, observed: 2 }],
    ["a malformed untouched bucket", { no_modeled_route: 1, coverage_incomplete: 7, observed: "2" }],
    ["a non-object counts body", [1, 7]],
  ])("AP188 CONSTRUCTED %s: no summary line at all, so no coerced count", (_label, counts) => {
    renderRail(withCounts(counts))
    expect(screen.queryByTestId("target-zero-states")).toBeNull()
    // the rows themselves still say what they are
    expect(within(row("db-us-only")).getByText("coverage incomplete")).toHaveAttribute("data-displayed-state", "coverage_incomplete")
  })

  it("AP188 controls: the same rows over VALID counts, and over counts with an ABSENT bucket", () => {
    renderRail(withCounts({ no_modeled_route: 1, coverage_incomplete: 7, observed: 2 }))
    expect(screen.getByTestId("target-zero-states")).toHaveTextContent(/^8 coverage incomplete$/)
    cleanup()
    // coverage_incomplete absent: the documented "no target", so the moved row is its only one
    renderRail(withCounts({ no_modeled_route: 1, observed: 2 }))
    expect(screen.getByTestId("target-zero-states")).toHaveTextContent(/^1 coverage incomplete$/)
  })

  // AP193: a row says its served path_count could not be read; the coerced value read "NaN path", or nothing at all.
  it.each([["bad"], [-1], [null], [undefined]])("AP193 CONSTRUCTED bucket-1 path_count %j: 'path count unreadable'", (raw) => {
    const targets = SECTION.targets.map((t) => {
      if (t.name !== "bucket-1") return t
      if (raw === undefined) { const { path_count: _drop, ...rest } = t; return rest as typeof t }
      return { ...t, path_count: raw as never }
    })
    renderRail({ ...SECTION, targets } as TargetCatalog)
    const r = row("bucket-1")
    expect(within(r).getByTestId("target-path-count-unreadable")).toHaveTextContent(/^path count unreadable$/)
    expect(r.textContent).not.toMatch(/NaN|\d+ paths?\b/)
  })

  it("AP193 CONTROL: a valid served count keeps its established text, and a valid 0 shows none", () => {
    renderRail(SECTION)
    expect(row("bucket-1")).toHaveTextContent("1 path")
    expect(within(row("bucket-1")).queryByTestId("target-path-count-unreadable")).toBeNull()
    expect(within(row("empty-bucket")).queryByTestId("target-path-count-unreadable")).toBeNull()
    expect(row("empty-bucket").textContent).not.toMatch(/\d+ paths?\b/)
  })
})
