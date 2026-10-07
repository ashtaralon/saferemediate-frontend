/**
 * A7 S1c: the census client (lib/account-census.ts) on the REAL route's answers -- backend
 * tests/cyntro_data/test_account_census_captures.py at f329ca131f1602847ece7b6d2ef2ea56b0b6c315, every capture with its _provenance (fixed clock, real writer, real
 * acquirers over Stubber-validated responses, real census pass, real P3a2 inventory). Each mutated case below is named
 * MUTATED: the producer never emits it; it proves a contradiction is refused, never shown.
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CENSUS_CONTRACT,
  RESPONSE_MALFORMED,
  RESPONSE_NOT_CONTRACT,
  censusPath,
  groupByService,
  notObservableSentence,
  outcomeSentence,
  parseCensusResponse,
  rowName,
  scopeSentence,
  type CensusData,
  type CensusOutcome,
} from "@/lib/account-census"

const DIR = resolve(process.cwd(), "__tests__/fixtures/account-census-captures")

function capture(name: string): { status: number; body: Record<string, any>; _provenance: Record<string, any> } {
  return JSON.parse(readFileSync(resolve(DIR, `${name}.json`), "utf8"))
}

const ACCOUNT: string = capture("populated_page1").body.account_id

/** The account the captured request asked about (the 403 capture asked about an account outside the tenant). */
function askedAccount(c: { _provenance: Record<string, any> }): string {
  return String(c._provenance.request.path).split("/")[3]
}

function parsed(name: string, depth: "listed_only" | "inventory_pending" | null = null) {
  const c = capture(name)
  return parseCensusResponse(c.status, c.body, askedAccount(c), depth)
}

function data(name: string, depth: "listed_only" | "inventory_pending" | null = null): CensusData {
  const result = parsed(name, depth)
  if (result.kind !== "data") throw new Error(`${name}: ${JSON.stringify(result)}`)
  return result
}

function outcome(name: string): CensusOutcome {
  const result = parsed(name)
  if (result.kind === "data") throw new Error(`${name} is data`)
  return result
}

describe("the census client on the real route's answers", () => {
  it("accepts every capture the route produced, each as the state it was taken in", () => {
    const names = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort()
    expect(names).toHaveLength(24)
    for (const name of names) {
      const c = capture(name)
      expect(c.body.contract).toBe(CENSUS_CONTRACT)
      expect(c._provenance.route).toContain("/api/accounts/{account_id}/census")
      const result = parseCensusResponse(c.status, c.body, askedAccount(c))
      expect(result.state, name).toBe(c.body.state)
      expect(result.kind === "unavailable" && result.reasonCode === RESPONSE_MALFORMED, name).toBe(false)
    }
  })

  it("reads band 1 from a served census: partial coverage, four source lines, the not-observable Region, the totals", () => {
    const page = data("populated_page1")
    expect(page.coverage.accountState).toBe("PARTIAL")
    expect(page.coverage.scopes.map(scopeSentence)).toEqual([
      "AWS Config eu-west-1: unavailable, no configuration recorder",
      "Tagging API eu-west-1: partial by design (tagged or previously tagged resources only), 6 resources",
      "CloudFormation eu-west-1: complete, 1 resource in 1 stack (1 deleted stack listed as deleted)",
      "Resource Explorer eu-west-1: unavailable, no Resource Explorer index",
    ])
    expect(page.coverage.notObservableRegions).toEqual(["eu-west-1"])
    expect(notObservableSentence(page.coverage.notObservableRegions)).toContain("cannot be observed in eu-west-1")
    expect(page.totals.byDepth).toEqual({ collected: 30, listed_only: 3, inventory_pending: 0 })
    expect(page.totals.deleted).toBe(1)
    expect(page.publication.inventory.status).toBe("served")
  })

  it("reads the depth the page asks for: listed only over three pages, the last legitimately empty", () => {
    const one = data("depth_listed_only_page1", "listed_only")
    const two = data("depth_listed_only_page2", "listed_only")
    const three = data("depth_listed_only_page3", "listed_only")
    expect([one.rows.length, two.rows.length, three.rows.length]).toEqual([2, 2, 0])
    expect([one.hasMore, two.hasMore, three.hasMore]).toEqual([true, true, false])
    const rows = [...one.rows, ...two.rows]
    expect(rows.every((r) => r.depth === "listed_only" && !r.eligibility.selectable)).toBe(true)
    const deleted = rows.filter((r) => r.deleted)
    expect(deleted).toHaveLength(1)
    expect(deleted[0].cfn?.stack_status).toBe("DELETE_COMPLETE")
    expect(groupByService(rows).map((g) => [g.service, g.rows.map(rowName)])).toEqual([
      ["dynamodb", ["orders-00", "orders-01", "orders-02", "orders-v0"]],
    ])
  })

  it("names the inventory wait: certified types are inventory_pending while the inventory is not served", () => {
    const pending = data("pending_stage_depth_inventory_pending", "inventory_pending")
    expect(pending.publication.inventory).toEqual({ status: "not_recorded", reason: "no_publication_recorded" })
    expect(pending.rows.map((r) => [r.resource_type, r.eligibility.reason])).toEqual(
      pending.rows.map((r) => [r.resource_type, "INVENTORY_NOT_SERVED"]))
    expect(data("depth_inventory_pending_served", "inventory_pending").state).toBe("filter_empty")
  })

  it("says every answer without rows in words", () => {
    expect(outcomeSentence(outcome("not_published_no_publication_recorded"))).toBe(
      "The census has not been published for this account yet.")
    expect(outcomeSentence(outcome("not_published_census_disabled"))).toBe("Census is not enabled on this install.")
    expect(outcomeSentence(outcome("not_published_census_not_run"))).toBe(
      "Census has not run yet for this account's current registration.")
    expect(outcomeSentence(outcome("not_published_census_stopped"))).toBe(
      "Census has stopped (last dispatched 2027-01-12T08:00:00+00:00).")
    expect(outcomeSentence(outcome("held_authority_changed"))).toContain("registered again")
    expect(outcomeSentence(outcome("held_scope_not_ready"))).toBe("The census for this account is not ready to be shown yet.")
    expect(outcomeSentence(outcome("refused_not_authorized_403"))).toBe("You are not authorized to read this account's census.")
    expect(outcomeSentence(outcome("unavailable_store_503"))).toBe("The census could not be read (store_unavailable).")
    expect(outcome("refused_cursor_restart_409").reasonCode).toBe("CURSOR_RESTART_REQUIRED:publication_moved")
  })

  it("reads complete_empty and filter_empty as data, never as an empty estate guessed from rows", () => {
    expect(data("complete_empty").state).toBe("complete_empty")
    const filtered = data("filter_empty")
    expect(filtered.state).toBe("filter_empty")
    expect(filtered.totals.rowsTotal).toBeGreaterThan(0)
  })
})

describe("the census client refuses what the producer never emits (MUTATED cases)", () => {
  const page = () => structuredClone(capture("populated_page1").body)

  it("refuses another contract, another account, and a proxy code is relayed by name", () => {
    expect(parseCensusResponse(200, { ...page(), contract: "account_inventory/v1" }, ACCOUNT).state).toBe("unavailable")
    expect(parseCensusResponse(200, page(), "444455556666")).toMatchObject({ reasonCode: RESPONSE_MALFORMED })
    expect(parseCensusResponse(502, { error: "PROXY_BACKEND_REDIRECT" }, ACCOUNT)).toMatchObject({
      reasonCode: "PROXY_BACKEND_REDIRECT" })
    expect(parseCensusResponse(404, { detail: "Not Found" }, ACCOUNT)).toMatchObject({ reasonCode: RESPONSE_NOT_CONTRACT })
  })

  it("refuses data carried by an error status, and COMPLETE coverage that names a gap", () => {
    expect(parseCensusResponse(500, page(), ACCOUNT)).toMatchObject({ reasonCode: RESPONSE_MALFORMED })
    const contradicted = page()
    contradicted.coverage.account_state = "COMPLETE"
    expect(parseCensusResponse(200, contradicted, ACCOUNT)).toMatchObject({ reasonCode: RESPONSE_MALFORMED })
  })

  it("refuses a listed-only row marked selectable, a deleted row without its stack, and a row of another depth", () => {
    const selectable = structuredClone(capture("depth_listed_only_page1").body)
    selectable.rows[0].eligibility.selectable = true
    expect(parseCensusResponse(200, selectable, ACCOUNT, "listed_only")).toMatchObject({ reasonCode: RESPONSE_MALFORMED })
    const orphan = structuredClone(capture("depth_listed_only_page2").body)
    const deleted = orphan.rows.find((r: any) => r.deleted)
    deleted.cfn = null
    expect(parseCensusResponse(200, orphan, ACCOUNT, "listed_only")).toMatchObject({ reasonCode: RESPONSE_MALFORMED })
    expect(parseCensusResponse(200, capture("depth_listed_only_page1").body, ACCOUNT, "inventory_pending"))
      .toMatchObject({ reasonCode: RESPONSE_MALFORMED })
  })

  it("refuses totals that do not add up and a not-published answer carrying rows", () => {
    const totals = page()
    totals.totals.present += 1
    expect(parseCensusResponse(200, totals, ACCOUNT)).toMatchObject({ reasonCode: RESPONSE_MALFORMED })
    const rows = structuredClone(capture("not_published_census_disabled").body)
    rows.rows = page().rows
    expect(parseCensusResponse(200, rows, ACCOUNT)).toMatchObject({ reasonCode: RESPONSE_MALFORMED })
  })
})

describe("the census request", () => {
  it("asks the proxy for one depth, one page, at most the route's limit", () => {
    expect(censusPath("111122223333", { depth: "listed_only", cursor: null })).toBe(
      "/api/proxy/accounts/111122223333/census?depth=listed_only&limit=200")
    expect(censusPath("111122223333", { depth: "inventory_pending", cursor: "abc=" })).toBe(
      "/api/proxy/accounts/111122223333/census?depth=inventory_pending&limit=200&cursor=abc%3D")
  })
})
