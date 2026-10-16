/**
 * AP182 · the dashboard "Top damage paths" card over /all answers that carry lifecycle evidence.
 *
 * Real: AttackPathsCard, derivePathsIntegrity / isCacheablePaths, and the captured backend /all bodies
 * (__tests__/fixtures/ap182-lifecycle). Stubbed: next/navigation. The card reads a lifted reading (`shared`), the
 * cockpit's own path. The constructed payloads are labelled; each is a legacy or contradictory shape no capture holds.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import allHeld from "@/__tests__/fixtures/ap182-lifecycle/all-lifecycle-held.json"
import allMissing from "@/__tests__/fixtures/ap182-lifecycle/all-record-missing.json"
import allResolved from "@/__tests__/fixtures/ap182-lifecycle/all-resolved.json"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined }),
}))

import { AttackPathsCard, type PathsResponse } from "@/components/dashboard/v3/attack-paths-card"
import { LIFECYCLE_HELD_EXPLANATION, LIFECYCLE_TOTALS_WITHHELD } from "@/lib/attack-paths/lifecycle-coverage"
import { derivePathsIntegrity, isCacheablePaths } from "@/lib/paths-integrity"
import type { UseCachedFetchResult } from "@/lib/use-cached-fetch"

afterEach(() => cleanup())

function reading(data: unknown, stale?: { cachedAt: number }): UseCachedFetchResult<PathsResponse> {
  return {
    data: data as PathsResponse, isStale: Boolean(stale), cachedAt: stale?.cachedAt ?? null,
    staleReason: stale ? "cached reading" : null, loading: false, isComputing: false, error: null, hold: null,
    retry: () => undefined,
  }
}

function renderCard(data: unknown, stale?: { cachedAt: number }) {
  return render(<AttackPathsCard shared={reading(data, stale)} />)
}

describe("derivePathsIntegrity / isCacheablePaths with lifecycle evidence", () => {
  it("held and unverified answers are PARTIAL, not an all-clear, and never cached", () => {
    for (const body of [allHeld, allMissing]) {
      const i = derivePathsIntegrity(body)
      expect([i.state, i.canRenderNoneFound, i.listIsPartial, i.lifecycle.incomplete]).toEqual(["PARTIAL", false, true, true])
      expect(isCacheablePaths(body)).toBe(false)
    }
  })

  it("the resolved answer is READY and cacheable exactly as before", () => {
    const i = derivePathsIntegrity(allResolved)
    expect([i.state, i.canRenderNoneFound, i.listIsPartial, i.lifecycle.incomplete]).toEqual(["READY", true, false, false])
    expect(isCacheablePaths(allResolved)).toBe(true)
  })

  it("CONSTRUCTED contradiction: READY + analysis_complete carrying lifecycle evidence is never READY or cached", () => {
    const contradictory = {
      serve_state: "READY", analysis_complete: true, crown_jewels_partial: false, errors: [], uncomputed: [],
      lifecycle_held_systems: [{ system: "Orders", system_key: "authored_system:ord", held_path_count: 1 }],
    }
    const i = derivePathsIntegrity(contradictory)
    expect([i.state, i.canRenderNoneFound, i.listIsPartial]).toEqual(["PARTIAL", false, true])
    expect(isCacheablePaths(contradictory)).toBe(false)
  })

  it.each(["lifecycle_held_systems", "lifecycle_unverified_systems"])(
    "AP183-R1 CONSTRUCTED: READY + analysis_complete with %s: null is never READY, cached or an all-clear",
    (field) => {
      const contradictory = { ...allResolved, [field]: null }
      const i = derivePathsIntegrity(contradictory)
      expect([i.state, i.canRenderNoneFound, i.listIsPartial, i.lifecycle.unreadable]).toEqual(["PARTIAL", false, true, true])
      expect(isCacheablePaths(contradictory)).toBe(false)
      // the resolved body without the field stays READY and cacheable (the control)
      expect(isCacheablePaths(allResolved)).toBe(true)
    },
  )
})

describe("AttackPathsCard: lifecycle-held paths are explained, never totalled", () => {
  it("held: the scan is complete, so the cause is named as lifecycle, with the system's own count", () => {
    renderCard(allHeld)
    const descriptor = screen.getByText(/Ranked by priority_score/)
    expect(descriptor).toHaveTextContent("Ranked by priority_score · lifecycle coverage incomplete — more may exist")
    expect(descriptor.textContent).not.toMatch(/partial scan/)
    const note = screen.getByTestId("paths-lifecycle-coverage")
    expect(note).toHaveTextContent("Lifecycle coverage incomplete · 1 path held — some paths are not listed or counted")
    expect(note).toHaveTextContent(LIFECYCLE_HELD_EXPLANATION)
    expect(note).toHaveTextContent("Orders: 1 path held")
    expect(screen.getByText("· Orders: 1 path held")).toHaveAttribute("title", "authored_system:ord")
    // Totals stay unknown; the jewel row shows its own eligible count and no held count of any scope.
    expect(screen.getByText("jewels ·", { exact: false }).textContent).toContain("— jewels · — paths · — internet-exposed")
    const row = screen.getByRole("button", { name: /bucket-1/ })
    expect(row).toHaveTextContent("1 path")
    expect(row.textContent).not.toMatch(/held/)
  })

  it("record missing: the system is named with the reason's wording, the code beside it", () => {
    renderCard(allMissing)
    const note = screen.getByTestId("paths-lifecycle-coverage")
    expect(note).toHaveTextContent("Lifecycle coverage incomplete — some paths are not listed or counted")
    expect(note).toHaveTextContent("Payments (authored_system:pay): no lifecycle coverage record was published for it")
    expect(note.textContent).not.toContain(LIFECYCLE_HELD_EXPLANATION)              // nothing is held, only unverified
    expect(screen.getByText(/Payments \(authored_system:pay\)/)).toHaveAttribute("title", "jewel_coverage_record_missing")
    expect(note.textContent).not.toMatch(/\d+ paths? held/)                          // no count invented
  })

  it("resolved: exactly the established card — no note, the complete descriptor, the totals", () => {
    renderCard(allResolved)
    expect(screen.queryByTestId("paths-lifecycle-coverage")).toBeNull()
    expect(screen.getByText(
      "Crown jewels ranked by priority_score across all inbound paths · click to open the path graph",
    )).toBeInTheDocument()
    expect(screen.getByText("jewels ·", { exact: false }).textContent).toContain("1 jewels · 2 paths · 0 internet-exposed")
  })

  it("CONSTRUCTED legacy partial (no lifecycle fields): the established scan wording, unchanged", () => {
    renderCard({
      serve_state: "PARTIAL", analysis_complete: false, crown_jewels_partial: true, systems_discovered: 3,
      systems_scanned: 2, systems_uncomputed: 1, uncomputed: ["Billing: computing"], errors: [],
      total_jewels: null, total_paths: null, exposed_jewels: null,
      crown_jewels: [{ id: "arn:aws:s3:::x", name: "x", type: "S3Bucket", severity: "HIGH", path_count: 2, system_name: "Orders" }],
    })
    expect(screen.getByText("Ranked by priority_score · partial scan (2 of 3 systems) — more may exist")).toBeInTheDocument()
    expect(screen.queryByTestId("paths-lifecycle-coverage")).toBeNull()
  })

  it("CONSTRUCTED both causes: a system not scanned AND a held system — both are named, neither replaces the other", () => {
    renderCard({
      ...allHeld, systems_discovered: 3, systems_scanned: 2, systems_uncomputed: 1, uncomputed: ["Billing: computing"],
    })
    expect(screen.getByText(
      "Ranked by priority_score · partial scan (2 of 3 systems) · lifecycle coverage incomplete — more may exist",
    )).toBeInTheDocument()
  })

  it("CONSTRUCTED membership gap AND a held system: the partial-scan wording stays beside the lifecycle cause", () => {
    renderCard({ ...allHeld, membership_systems_without_paths: ["authored_system:rpt"] })
    expect(screen.getByText(
      "Ranked by priority_score · partial scan (2 of 2 systems) · lifecycle coverage incomplete — more may exist",
    )).toBeInTheDocument()
  })

  it("CONSTRUCTED unreadable lifecycle evidence: said so, with no count and no 'none held'", () => {
    renderCard({ ...allResolved, serve_state: "PARTIAL", analysis_complete: false, crown_jewels_partial: true,
      lifecycle_held_systems: "Orders" })
    const note = screen.getByTestId("paths-lifecycle-coverage")
    expect(note).toHaveTextContent("Part of this answer's lifecycle coverage evidence could not be read.")
    expect(note.textContent).not.toMatch(/\d+ paths? held/)
  })

  it("CONSTRUCTED empty list with lifecycle evidence: the not-an-all-clear block carries the lifecycle note too", () => {
    renderCard({ ...allMissing, crown_jewels: [] })
    expect(screen.getByText("Not computed yet — this is not an all-clear")).toBeInTheDocument()
    expect(screen.getByTestId("paths-lifecycle-coverage")).toHaveTextContent("Payments (authored_system:pay)")
    expect(screen.queryByText(/None surfaced reachable jewels/)).toBeNull()
  })

  it.each(["lifecycle_held_systems", "lifecycle_unverified_systems"])(
    "AP183-R1 CONSTRUCTED: a READY answer with %s: null renders as unreadable, never the complete card",
    (field) => {
      renderCard({ ...allResolved, [field]: null })
      const note = screen.getByTestId("paths-lifecycle-coverage")
      expect(note).toHaveTextContent("Part of this answer's lifecycle coverage evidence could not be read.")
      expect(note.textContent).not.toMatch(/\d+ paths? held/)
      expect(screen.queryByText(
        "Crown jewels ranked by priority_score across all inbound paths · click to open the path graph",
      )).toBeNull()
      expect(screen.getByText(/Ranked by priority_score/)).toHaveTextContent("lifecycle coverage incomplete")
    },
  )

  it("AP183-R3 CONSTRUCTED: reason codes that name Object prototype members render the generic wording", () => {
    renderCard({
      ...allMissing,
      lifecycle_unverified_systems: [
        "Alpha (k:a): constructor", "Beta (k:b): toString", "Gamma (k:c): __proto__", "Delta (k:d): hasOwnProperty",
      ],
    })
    const note = screen.getByTestId("paths-lifecycle-coverage")
    for (const label of ["Alpha (k:a)", "Beta (k:b)", "Gamma (k:c)", "Delta (k:d)"]) {
      expect(note).toHaveTextContent(`${label}: its lifecycle coverage could not be verified`)
    }
    expect(note.textContent).not.toMatch(/function|\[object|native code/)
  })

  // AP187-F1: the aggregate totals are a total only when the lifecycle evidence is complete.
  const totals = () => screen.getByTestId("paths-totals")
  const WITHHELD_TEXT = "— jewels · — paths · — internet-exposed"

  it.each(["lifecycle_held_systems", "lifecycle_unverified_systems"])(
    "AP187-F1 CONSTRUCTED: READY + numeric totals with %s: null withholds the totals and names why, no count invented",
    (field) => {
      renderCard({ ...allResolved, [field]: null })                    // the body still carries 1 / 2 / 0
      expect(totals()).toHaveTextContent(WITHHELD_TEXT)
      expect(totals()).toHaveAttribute("title", LIFECYCLE_TOTALS_WITHHELD)
      expect(totals()).toHaveAttribute("data-totals-withheld", "lifecycle")
      expect(totals().textContent).not.toMatch(/\d/)
      expect(screen.getByTestId("paths-lifecycle-coverage").textContent).not.toMatch(/\d+ paths? held/)
    },
  )

  it("AP187-F1 CONSTRUCTED: held / unverified answers that DO carry numeric totals still withhold them", () => {
    for (const body of [allHeld, allMissing]) {
      renderCard({ ...body, total_jewels: 1, total_paths: 2, exposed_jewels: 0 })
      expect(totals()).toHaveTextContent(WITHHELD_TEXT)
      expect(totals()).toHaveAttribute("title", LIFECYCLE_TOTALS_WITHHELD)
      cleanup()
    }
    // the empty-list (not-an-all-clear) branch shares the same totals
    renderCard({ ...allMissing, crown_jewels: [], total_jewels: 0, total_paths: 0, exposed_jewels: 0 })
    expect(totals()).toHaveTextContent(WITHHELD_TEXT)
  })

  it("AP187-F1 controls: resolved and legacy-partial totals are shown exactly as before, with no withheld marker", () => {
    renderCard(allResolved)
    expect(totals()).toHaveTextContent("1 jewels · 2 paths · 0 internet-exposed")
    expect(totals()).not.toHaveAttribute("title")
    expect(totals()).not.toHaveAttribute("data-totals-withheld")
    cleanup()
    // CONSTRUCTED legacy partial carrying numbers and no lifecycle field: the established card shows them
    renderCard({
      serve_state: "PARTIAL", analysis_complete: false, crown_jewels_partial: true, systems_discovered: 3,
      systems_scanned: 2, systems_uncomputed: 1, uncomputed: ["Billing: computing"], errors: [],
      total_jewels: 4, total_paths: 9, exposed_jewels: 1,
      crown_jewels: [{ id: "arn:aws:s3:::x", name: "x", type: "S3Bucket", severity: "HIGH", path_count: 2, system_name: "Orders" }],
    })
    expect(totals()).toHaveTextContent("4 jewels · 9 paths · 1 internet-exposed")
    expect(totals()).not.toHaveAttribute("data-totals-withheld")
  })

  it("a cached reading keeps its stale marker beside the lifecycle note", () => {
    renderCard(allHeld, { cachedAt: Date.now() - 5 * 60 * 1000 })
    expect(screen.getByText(/as of .* refreshing/)).toBeInTheDocument()
    expect(screen.getByTestId("paths-lifecycle-coverage")).toBeInTheDocument()
  })
})
