import fs from "node:fs"
import path from "node:path"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  classifyInventoryResult,
  inventoryProvenanceToShow,
  refusalExplanation,
  type InventoryAnswer,
} from "@/components/copilot/inventory-answer"
import { InventoryAnswerView } from "@/components/copilot/inventory-answer-view"

afterEach(cleanup)

const FIXTURES = path.join(__dirname, "fixtures", "copilot-inventory")
const ROUTE = path.join(FIXTURES, "route-e05bad32")

/** One actual HTTP response of the envelope=true route at backend e05bad32 (see SOURCES.md). */
function routeSnapshot(name: string): { http: number; body: Record<string, any> } {
  return JSON.parse(fs.readFileSync(path.join(ROUTE, `${name}.json`), "utf8"))
}

function legacyRoute(name: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, "legacy-route-47e01757", `${name}.json`), "utf8")).body
}

const ALL_ROUTE_STATES = fs.readdirSync(ROUTE).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)).sort()
const DECIDED = ALL_ROUTE_STATES.filter((name) => routeSnapshot(name).http === 200 && "result" in routeSnapshot(name).body)
const UNSERVED = DECIDED.filter((name) => routeSnapshot(name).body.result.status !== "ready")
const READY = DECIDED.filter((name) => routeSnapshot(name).body.result.status === "ready")

function rendered(answer: InventoryAnswer) {
  const { container } = render(<InventoryAnswerView answer={answer} />)
  return container
}

describe("the wire contract Estate acknowledges, read from the route's actual bodies", () => {
  it("covers all 18 captured states: 14 decided, 2 non-2xx, 2 raw", () => {
    expect(ALL_ROUTE_STATES).toHaveLength(18)
    expect(DECIDED).toHaveLength(14)
    expect(READY).toEqual(["count-ready", "list-ready"])
    expect(ALL_ROUTE_STATES.filter((name) => routeSnapshot(name).http !== 200)).toEqual(["count-401-unverified", "count-503-no-runtime"])
    expect(ALL_ROUTE_STATES.filter((name) => name.includes("-raw-"))).toEqual(["count-raw-envelope-absent", "count-raw-envelope-false"])
  })

  it.each(DECIDED)("%s: HTTP 200 with exactly {result, provenance}", (name) => {
    expect(Object.keys(routeSnapshot(name).body).sort()).toEqual(["provenance", "result"])
  })

  it.each(UNSERVED)("%s: a failure names its code and never carries count, items or total", (name) => {
    const { result, provenance } = routeSnapshot(name).body
    expect(["refused", "abstained", "unavailable"]).toContain(result.status)
    for (const key of ["reason_code", "reason_codes", "reason_category", "failing_axes", "resource_type", "system"]) {
      expect(result).toHaveProperty(key)
    }
    for (const key of ["count", "items", "total"]) expect(result).not.toHaveProperty(key)
    expect(provenance.evidence_sources).toEqual([])
  })

  it("a ready count and a ready list carry their fields, and only they name evidence", () => {
    const count = routeSnapshot("count-ready").body
    expect(Number.isInteger(count.result.count)).toBe(true)
    for (const key of ["display_name", "serve_state"]) expect(count.result).toHaveProperty(key)
    const list = routeSnapshot("list-ready").body
    for (const key of ["items", "total", "has_next", "next_cursor", "sort", "filters", "truncated", "display_name", "columns"]) {
      expect(list.result).toHaveProperty(key)
    }
    expect(count.provenance.evidence_sources).toEqual(["Neptune Serving Graph"])
    expect(list.provenance.evidence_sources).toEqual(["Neptune Serving Graph"])
  })

  it.each([
    ["count-401-unverified", 401, { error_code: "ANALYST_IDENTITY_INVALID" }],
    ["count-503-no-runtime", 503, { error_code: "DECISION_RUNTIME_DISABLED", serve_state: "NOT_READY" }],
  ])("%s: a non-2xx names its code at the top level", (name, http, fields) => {
    const snapshot = routeSnapshot(name)
    expect(snapshot.http).toBe(http)
    expect(snapshot.body).toMatchObject(fields)
    expect(snapshot.body).not.toHaveProperty("result")
  })
})

describe("every unserved route state is a named refusal, never a number", () => {
  it.each(UNSERVED)("%s", (name) => {
    const { result } = routeSnapshot(name).body
    const answer = classifyInventoryResult(result)
    expect(answer).toEqual({
      kind: "not_answered",
      status: result.status,
      reasonCode: result.reason_code,
      reasonCategory: result.reason_category,
      failingAxes: result.failing_axes,
    })
    const container = rendered(answer)
    expect(container.querySelector("[data-copilot-inventory-count], [data-copilot-inventory-list]")).toBeNull()
    const node = container.querySelector("[data-copilot-inventory-not-answered]")
    expect(node?.getAttribute("data-status")).toBe(result.status)
    expect(node?.getAttribute("data-reason-code")).toBe(result.reason_code)
    expect(container.textContent).toContain(result.reason_code)
    expect(container.textContent).not.toMatch(/(^|\s)\d+(\s|$)/)
    if (result.reason_code === "GRAPH_UNAVAILABLE") {
      expect(container.textContent).toContain("Graph data is unavailable")
    } else {
      expect(container.textContent).not.toContain("Graph data is unavailable")
    }
  })
})

describe("ready route answers render what the route served", () => {
  it("the ready count shows its number, display name and system", () => {
    const { result } = routeSnapshot("count-ready").body
    const answer = classifyInventoryResult(result)
    expect(answer).toEqual({ kind: "count", count: 2, displayName: "S3 buckets", system: "payments", decisionBacked: true })
    const count = rendered(answer).querySelector("[data-copilot-inventory-count]")
    expect(count?.textContent).toContain("2")
    expect(count?.textContent).toContain("S3 buckets")
  })

  it("the ready list shows its items under the route's own columns, in order", () => {
    const { result } = routeSnapshot("list-ready").body
    const answer = classifyInventoryResult(result)
    expect(answer).toMatchObject({
      kind: "list", decisionBacked: true, total: 2, hasMore: false, sort: "name", filtersApplied: {}, columns: result.columns,
    })
    const container = rendered(answer)
    expect([...container.querySelectorAll("th")].map((th) => th.textContent)).toEqual(result.columns)
    expect(container.textContent).toContain("alpha")
    expect(container.textContent).toContain("sid-beta")
    expect(container.textContent).toMatch(/^2 S3 buckets in payments/)
    expect(container.textContent).not.toContain("more available")
  })

  // Derived from the actual ready list, labelled: the capture has one page, no filter and no truncation.
  it("a page of a larger list says so, and never presents the page as the whole count", () => {
    const { result } = routeSnapshot("list-ready").body
    const page = classifyInventoryResult({ ...result, total: 5, has_next: true, next_cursor: "c2" })
    expect(page).toMatchObject({ kind: "list", total: 5, hasMore: true })
    expect(rendered(page).textContent).toMatch(/^2 of 5 S3 buckets in payments \(more available\)/)
  })

  it("a truncated page is not the whole list even without a cursor", () => {
    const { result } = routeSnapshot("list-ready").body
    expect(classifyInventoryResult({ ...result, truncated: true })).toMatchObject({ kind: "list", hasMore: true })
  })

  it("the Decision list's `filters` are shown; the legacy `filters_applied` still are", () => {
    const { result } = routeSnapshot("list-ready").body
    expect(classifyInventoryResult({ ...result, filters: { state: "ACTIVE" } })).toMatchObject({ filtersApplied: { state: "ACTIVE" } })
    const legacyShape = { ...result, filters: undefined, filters_applied: { region: "eu-west-1" } }
    expect(classifyInventoryResult(legacyShape)).toMatchObject({ filtersApplied: { region: "eu-west-1" } })
  })

  it("a total smaller than the page it came with is not believed", () => {
    const { result } = routeSnapshot("list-ready").body
    expect(classifyInventoryResult({ ...result, total: 1 })).toMatchObject({ kind: "list", total: null })
  })
})

describe("the raw envelope=false and absent route states are today's legacy count", () => {
  it.each(["count-raw-envelope-false", "count-raw-envelope-absent"])("%s", (name) => {
    const body = routeSnapshot(name).body
    expect(classifyInventoryResult(body)).toMatchObject({ kind: "count", count: 3, decisionBacked: false })
    expect(inventoryProvenanceToShow(body, null)).toBeNull()
  })

  it("today's legacy ready count still renders, and keeps its provenance badge", () => {
    const envelope = legacyRoute("legacy-count-ready-s3")
    expect(classifyInventoryResult(envelope.result)).toMatchObject({ kind: "count", decisionBacked: false })
    expect(inventoryProvenanceToShow(envelope.result, envelope.provenance)).toBe(envelope.provenance)
  })

  it("today's legacy graph-unavailable envelope is the named unavailable state with its outage text", () => {
    const answer = classifyInventoryResult(legacyRoute("legacy-count-graph-unavailable").result)
    expect(answer).toMatchObject({ kind: "not_answered", status: "unavailable", reasonCode: "GRAPH_UNAVAILABLE" })
    expect(rendered(answer).textContent).toContain("Graph data is unavailable")
  })
})

describe("a badge only for an answer, and only for the evidence it names", () => {
  it.each(READY)("%s: the route's provenance (the generation it read) is shown", (name) => {
    const { result, provenance } = routeSnapshot(name).body
    expect(inventoryProvenanceToShow(result, provenance)).toBe(provenance)
  })

  it.each(UNSERVED)("%s: no badge", (name) => {
    const { result, provenance } = routeSnapshot(name).body
    expect(inventoryProvenanceToShow(result, provenance)).toBeNull()
  })

  // Derived, labelled: the route never sends evidence on a failure (Semantic M16); the view must not trust it if it did.
  it.each(UNSERVED)("%s: still no badge when a body claims evidence", (name) => {
    const { result, provenance } = routeSnapshot(name).body
    expect(inventoryProvenanceToShow(result, { ...provenance, evidence_sources: ["Neptune Serving Graph"] })).toBeNull()
  })

  it("a ready Decision answer whose provenance names no evidence gets no badge", () => {
    const { result, provenance } = routeSnapshot("count-ready").body
    expect(inventoryProvenanceToShow(result, { ...provenance, evidence_sources: [] })).toBeNull()
    expect(inventoryProvenanceToShow(result, null)).toBeNull()
  })

  it("a legacy unavailable read gets no badge", () => {
    const legacyProvenance = legacyRoute("legacy-count-ready-s3").provenance
    expect(inventoryProvenanceToShow(legacyRoute("legacy-count-graph-unavailable").result, legacyProvenance)).toBeNull()
  })
})

describe("shapes that must never become a number", () => {
  // Derived from an actual refusal, labelled: a Decision body that lost its status is still not an answer.
  it("a Decision NOT_READY body without a status is not_ready with its code", () => {
    const { result } = routeSnapshot("count-refused-offboarded").body
    const { status: _status, ...withoutStatus } = result
    expect(classifyInventoryResult(withoutStatus)).toMatchObject({
      kind: "not_answered", status: "not_ready", reasonCode: "TENANT_LIFECYCLE_OFFBOARDED",
    })
  })

  it.each([
    ["null count", { count: null, display_name: "S3 Buckets" }],
    ["string count", { count: "3" }],
    ["negative count", { count: -1 }],
    ["fractional count", { count: 1.5 }],
    ["count and items together", { count: 3, items: [] }],
    ["unknown status", { status: "degraded", count: 3 }],
    ["ready status without a count or items", { status: "ready" }],
    ["non-record items", { items: [1, 2] }],
    ["an ACTIVE serve_state without status ready", { serve_state: "ACTIVE", count: 3 }],
    ["a refusal that also carries a count", { status: "refused", reason_code: "TENANT_LIFECYCLE_OFFBOARDED", count: 3 }],
    ["not an object", ["0"]],
  ])("%s", (_label, result) => {
    const answer = classifyInventoryResult(result)
    expect(answer.kind === "count" || answer.kind === "list").toBe(false)
  })

  it("an untyped reason is not shown as a code", () => {
    const answer = classifyInventoryResult({ status: "refused", reason_code: "<script>" })
    expect(answer).toMatchObject({ kind: "not_answered", reasonCode: null })
    expect(rendered(answer).textContent).toContain("No reason code was returned.")
  })
})

describe("typed non-2xx refusals explain the refusal, not a crash", () => {
  it.each([
    [401, "authenticated identity or system scope"],
    [403, "authenticated identity or system scope"],
    [409, "conflicts with the verified one"],
    [503, "could not answer this question right now"],
  ])("%s", (status, text) => {
    expect(refusalExplanation(status)).toContain(text)
  })
})
