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

function runtime(name: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, "runtime-bfe10ed9", `${name}.json`), "utf8")).result
}

function legacyRoute(name: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, "legacy-route-47e01757", `${name}.json`), "utf8")).body
}

/**
 * Semantic's PROPOSED route mapping (semantic-inventory-envelope-post-b1b2-snapshots-and-route-mapping
 * §3) applied to the actual runtime output. It is not a route snapshot: the route hunk is held.
 * Replace these with the real route's snapshots when it lands. Registry categories are the
 * ones that document names.
 */
const CATEGORY: Record<string, string> = {
  TENANT_LIFECYCLE_OFFBOARDED: "authorization",
  ANALYST_RESOURCE_TYPE_FORBIDDEN: "authorization",
  ANALYST_INVENTORY_AUTHORITY_UNSUPPORTED: "capability",
  INVENTORY_LIST_RESOURCE_TYPE_UNSUPPORTED: "capability",
  GRAPH_UNAVAILABLE: "availability",
  INVENTORY_LIST_CURSOR_MISMATCH: "consistency",
  ANALYST_ARGUMENTS_INVALID: "validation",
}

function proposedRouteResult(out: Record<string, any>, resourceType: string): Record<string, any> {
  if (out.serve_state === "ACTIVE") {
    if (out.operation_id === "inventory.count") {
      return { status: "ready", count: out.count, display_name: "S3 Buckets", label: "S3Bucket", resource_type: resourceType,
        system: "payments", scope_applied: {}, serve_state: "ACTIVE" }
    }
    const value = out.claims[0].value
    return { status: "ready", items: value.items, total: value.total, has_next: value.has_next, next_cursor: value.next_cursor,
      sort: value.sort, serve_state: "ACTIVE" }
  }
  const code = out.error_code ?? out.reason_codes[0]
  const category = CATEGORY[code] ?? "unregistered"
  const status = code === "GRAPH_UNAVAILABLE" ? "unavailable" : category === "capability" ? "abstained" : "refused"
  return { status, serve_state: "NOT_READY", reason_code: code, reason_category: category, failing_axes: out.failing_axes,
    resource_type: resourceType, system: "payments" }
}

const NOT_READY_ROWS: Array<[string, string, string]> = [
  ["count-refused-OFFBOARDED", "s3", "TENANT_LIFECYCLE_OFFBOARDED"],
  ["list-refused-OFFBOARDED", "s3", "TENANT_LIFECYCLE_OFFBOARDED"],
  ["count-abstained-uncertified-subnet-in-scope", "subnet", "ANALYST_INVENTORY_AUTHORITY_UNSUPPORTED"],
  ["list-abstained-uncertified-subnet-in-scope", "subnet", "INVENTORY_LIST_RESOURCE_TYPE_UNSUPPORTED"],
  ["count-refused-forbidden-subnet-outside-scope", "subnet", "ANALYST_RESOURCE_TYPE_FORBIDDEN"],
  ["list-refused-forbidden-subnet-outside-scope", "subnet", "ANALYST_RESOURCE_TYPE_FORBIDDEN"],
  ["count-graph-unavailable", "s3", "GRAPH_UNAVAILABLE"],
  ["list-graph-unavailable", "s3", "GRAPH_UNAVAILABLE"],
  ["count-bad-alias", "not-a-type", "ANALYST_RESOURCE_TYPE_FORBIDDEN"],
  ["list-bad-alias", "not-a-type", "ANALYST_RESOURCE_TYPE_FORBIDDEN"],
  ["list-bad-cursor", "s3", "INVENTORY_LIST_CURSOR_MISMATCH"],
  ["list-bad-sort", "s3", "ANALYST_ARGUMENTS_INVALID"],
]

function rendered(answer: InventoryAnswer) {
  const { container } = render(<InventoryAnswerView answer={answer} />)
  return container
}

describe("every actual NOT_READY runtime answer is a named refusal, never a number", () => {
  it.each(NOT_READY_ROWS)("%s, as the runtime returns it", (name, _type, code) => {
    const answer = classifyInventoryResult(runtime(name))
    expect(answer).toMatchObject({ kind: "not_answered", status: "not_ready", reasonCode: code })
    const container = rendered(answer)
    expect(container.querySelector("[data-copilot-inventory-count], [data-copilot-inventory-list]")).toBeNull()
    expect(container.querySelector("[data-copilot-inventory-not-answered]")?.getAttribute("data-reason-code")).toBe(code)
    expect(container.textContent).toContain(code)
    expect(container.textContent).not.toMatch(/(^|\s)0(\s|$)/)
  })

  it.each(NOT_READY_ROWS)("%s, through the proposed route mapping", (name, type, code) => {
    const mapped = proposedRouteResult(runtime(name), type)
    const answer = classifyInventoryResult(mapped)
    const status = code === "GRAPH_UNAVAILABLE" ? "unavailable" : CATEGORY[code] === "capability" ? "abstained" : "refused"
    expect(answer).toEqual({ kind: "not_answered", status, reasonCode: code, reasonCategory: CATEGORY[code],
      failingAxes: runtime(name).failing_axes })
    const container = rendered(answer)
    expect(container.querySelector("[data-copilot-inventory-count], [data-copilot-inventory-list]")).toBeNull()
    expect(container.textContent).toContain(code)
    if (code === "GRAPH_UNAVAILABLE") {
      expect(container.textContent).toContain("Graph data is unavailable")
    } else {
      expect(container.textContent).not.toContain("Graph data is unavailable")
    }
  })
})

describe("ready answers render their number only through an unambiguous ready shape", () => {
  it("the raw runtime count (count AND items) is not guessed at", () => {
    const raw = runtime("count-ready-s3-ACTIVE")
    expect(raw.count).toBe(2)
    expect(raw.items).toEqual([])
    expect(classifyInventoryResult(raw)).toEqual({ kind: "unrecognized" })
    expect(rendered({ kind: "unrecognized" }).textContent).not.toMatch(/(^|\s)[02](\s|$)/)
  })

  it("the raw runtime list (a DecisionResponse) is not guessed at either", () => {
    expect(classifyInventoryResult(runtime("list-ready-s3-ACTIVE"))).toEqual({ kind: "unrecognized" })
  })

  it("the proposed mapped ready count shows the runtime's count", () => {
    const answer = classifyInventoryResult(proposedRouteResult(runtime("count-ready-s3-ACTIVE"), "s3"))
    expect(answer).toMatchObject({ kind: "count", count: 2, decisionBacked: true })
    const container = rendered(answer)
    expect(container.querySelector("[data-copilot-inventory-count]")?.textContent).toContain("2")
  })

  it("the proposed mapped ready list shows the runtime's items with their own fields", () => {
    const answer = classifyInventoryResult(proposedRouteResult(runtime("list-ready-s3-ACTIVE"), "s3"))
    expect(answer).toMatchObject({ kind: "list", decisionBacked: true, columns: ["name", "resource_id", "region", "state", "account_id"] })
    const container = rendered(answer)
    expect(container.textContent).toContain("alpha")
    expect(container.textContent).toContain("beta")
    expect(container.textContent).toMatch(/^2 resources/)
  })

  it("today's legacy ready count still renders, and keeps its provenance badge", () => {
    const envelope = legacyRoute("legacy-count-ready-s3")
    const answer = classifyInventoryResult(envelope.result)
    expect(answer).toMatchObject({ kind: "count", decisionBacked: false })
    expect(inventoryProvenanceToShow(envelope.result, envelope.provenance)).toBe(envelope.provenance)
  })

  it("today's legacy graph-unavailable envelope is the named unavailable state with its outage text", () => {
    const answer = classifyInventoryResult(legacyRoute("legacy-count-graph-unavailable").result)
    expect(answer).toMatchObject({ kind: "not_answered", status: "unavailable", reasonCode: "GRAPH_UNAVAILABLE" })
    expect(rendered(answer).textContent).toContain("Graph data is unavailable")
  })
})

describe("no badge states evidence the answer does not rest on", () => {
  const legacyProvenance = legacyRoute("legacy-count-ready-s3").provenance

  it.each([
    ["a mapped refusal", proposedRouteResult(runtime("count-refused-OFFBOARDED"), "s3")],
    ["a mapped abstention", proposedRouteResult(runtime("list-abstained-uncertified-subnet-in-scope"), "subnet")],
    ["a mapped ready count (Decision-backed)", proposedRouteResult(runtime("count-ready-s3-ACTIVE"), "s3")],
    ["a raw runtime answer", runtime("count-ready-s3-ACTIVE")],
    ["a legacy unavailable read", legacyRoute("legacy-count-graph-unavailable").result],
  ])("%s", (_label, result) => {
    expect(inventoryProvenanceToShow(result, legacyProvenance)).toBeNull()
  })
})

describe("shapes that must never become a number", () => {
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
