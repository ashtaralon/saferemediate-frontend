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
    expect(screen.getByTestId("target-zero-states")).toHaveTextContent("8 coverage incomplete")
  })
})
