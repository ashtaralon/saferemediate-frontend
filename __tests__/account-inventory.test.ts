/**
 * T11b: the strict account_inventory/v1 reader and its epoch / cursor / publication-bound state machine.
 *
 * Every envelope is a PRODUCER golden: the real backend route's answer, copied byte-for-byte from backend commit
 * 92b2c54f7ea6fbf09b50ae06cec98f9c268bedd0 (tests/fixtures/account_inventory_api/); the two populated pages are the row v3
 * re-captures of 9e17d639b01b034405eec480b531d4efe63e9aef (I2(b1): tags + details). A malformed case is one of those
 * goldens with ONE field broken, named as such. The single "inventory_complete: false" case is an explicitly MUTATED
 * robustness case: the producer at that commit never emits it (a SERVED page is always complete).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  applyInventoryResponse,
  firstPageRequest,
  isCursorRestart,
  nextPageRequest,
  PAGE_PROGRESSION_INVALID,
  parseInventoryResponse,
  RESPONSE_MALFORMED,
  RESPONSE_NOT_CONTRACT,
  startRead,
  type InventoryKey,
  type InventoryModel,
  type ParsedInventory,
} from "@/lib/account-inventory"

const PRODUCER_COMMIT = "92b2c54f7ea6fbf09b50ae06cec98f9c268bedd0"
/** The tenth golden (the route held by its readiness gate) was added by a later backend commit, which asserts all ten. */
const PRODUCER_COMMIT_OF: Partial<Record<string, string>> = {
  held_consumer_not_recorded: "95dea3288a8b713b37be95114060c227ff5d0af8",
  populated_page1: "9e17d639b01b034405eec480b531d4efe63e9aef",
  populated_page2: "9e17d639b01b034405eec480b531d4efe63e9aef",
}
const NAMES = [
  "populated_page1", "populated_page2", "complete_empty", "filter_empty", "not_published", "held_authority_changed",
  "refused_cursor_restart_publication_moved", "refused_not_authorized_403", "unavailable_registry_unreadable",
  "held_consumer_not_recorded",
] as const
type Name = (typeof NAMES)[number]

interface Golden {
  _provenance: { backend_commit: string; backend_path: string }
  status: number
  cache_control: string
  body: Record<string, any>
}

function golden(name: Name): Golden {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-inventory", `${name}.json`), "utf8"))
}

function body(name: Name): Record<string, any> {
  return structuredClone(golden(name).body)
}

const ACCOUNT: string = golden("populated_page1").body.account_id
const KEY: InventoryKey = { customerId: "acme", accountId: ACCOUNT, resourceType: null }

function parse(name: Name, mutate?: (b: Record<string, any>) => void, status?: number): ParsedInventory {
  const b = body(name)
  mutate?.(b)
  return parseInventoryResponse(status ?? golden(name).status, b, ACCOUNT)
}

describe("the producer goldens", () => {
  it("are the backend's own answers, pinned to the producing commit, all no-store", () => {
    for (const name of NAMES) {
      const g = golden(name)
      expect(g._provenance.backend_commit).toBe(PRODUCER_COMMIT_OF[name] ?? PRODUCER_COMMIT)
      expect(g._provenance.backend_path).toBe(`tests/fixtures/account_inventory_api/${name}.json`)
      expect(g.cache_control).toBe("no-store")
      expect(g.body.contract).toBe("account_inventory/v1")
    }
  })

  it("each parse to its own kind and state", () => {
    const seen = Object.fromEntries(NAMES.map((name) => {
      const p = parse(name)
      return [name, [p.kind, p.state, p.kind === "data" ? p.rows.length : (p as { reasonCode: string | null }).reasonCode]]
    }))
    expect(seen).toEqual({
      populated_page1: ["data", "populated", 4],
      populated_page2: ["data", "populated", 4],
      complete_empty: ["data", "complete_empty", 0],
      filter_empty: ["data", "filter_empty", 0],
      not_published: ["evidence", "not_published", "no_publication_recorded"],
      held_authority_changed: ["evidence", "held", "AUTHORITY_CHANGED"],
      refused_cursor_restart_publication_moved: ["refused", "refused", "CURSOR_RESTART_REQUIRED:publication_moved"],
      refused_not_authorized_403: ["refused", "refused", "PERSON_NOT_AUTHORIZED"],
      unavailable_registry_unreadable: ["unavailable", "unavailable", "INVENTORY_SCOPE_UNAVAILABLE"],
      held_consumer_not_recorded: ["evidence", "held", "111122223333:CONSUMER_NOT_READY:not_recorded"],
    })
    expect(isCursorRestart(parse("refused_cursor_restart_publication_moved"))).toBe(true)
    expect(isCursorRestart(parse("refused_not_authorized_403"))).toBe(false)
  })

  it("a short populated page continues by cursor, not by count", () => {
    const first = parse("populated_page1")
    if (first.kind !== "data") throw new Error("expected data")
    expect(first.rows.length).toBeLessThan(20)
    expect(first.hasMore).toBe(true)
    expect(typeof first.nextCursor).toBe("string")
  })

  it("keeps eligibility, assignment and incarnation as data and never as a selection", () => {
    const first = parse("populated_page1")
    if (first.kind !== "data") throw new Error("expected data")
    for (const row of first.rows) {
      expect(row.eligibility).toBeTypeOf("object")
      expect(row.assignment).toEqual({ status: "not_evaluated" })
      expect(row.observed_incarnation).toBeTypeOf("object")
    }
  })
})

describe("row v3 (I1): tags and details exactly as the producer serves them", () => {
  it("reads the re-captured page's tags and details, and no tags for a type whose collector reads none", () => {
    const first = parse("populated_page1")
    if (first.kind !== "data") throw new Error("expected data")
    const byType = Object.fromEntries(first.rows.map((row) => [row.resource_type, row]))
    expect(byType["account:regions"].details).toEqual({})
    expect("tags" in byType["account:regions"]).toBe(false)
    expect(byType["ec2:instance"].tags).toEqual({})
    expect(byType["ec2:instance"].details).toEqual({
      iam_instance_profile: "arn:aws:iam::111122223333:instance-profile/app-role",
    })
  })

  it("still reads a v2 row (a publication written before the upgrade) with neither member", () => {
    const p = parse("populated_page1", (b) => {
      for (const row of b.rows) {
        delete row.tags
        delete row.details
      }
    })
    expect(p.kind).toBe("data")
  })

  it("accepts a detail text of exactly the producer's 512 characters, counted as Python counts them", () => {
    const astral = "\u{1F600}".repeat(512)
    expect(astral.length).toBe(1024)
    expect(parse("populated_page1", (b) => { b.rows[1].details.description = astral }).kind).toBe("data")
    expect(parse("populated_page1", (b) => { b.rows[1].details.description = `${astral}x` }).kind).toBe("unavailable")
  })

  it("accepts withheld tags and withheld detail names in the producer's shape", () => {
    const p = parse("populated_page1", (b) => {
      delete b.rows[1].tags
      b.rows[1].tags_withheld = { reason: "TAGS_OVER_CAP", count: 51 }
      b.rows[1].details_withheld = ["private_ip"]
    })
    expect(p.kind === "data" && p.rows[1]).toMatchObject({
      tags_withheld: { reason: "TAGS_OVER_CAP", count: 51 }, details_withheld: ["private_ip"],
    })
  })

  const brokenV3: Array<[string, (b: Record<string, any>) => void]> = [
    ["a tag value that is not text", (b) => { b.rows[1].tags = { team: 7 } }],
    ["tags that are not an object", (b) => { b.rows[1].tags = ["team"] }],
    ["tags and withheld tags together", (b) => { b.rows[1].tags_withheld = { reason: "TAGS_OVER_CAP", count: 1 } }],
    ["a withheld-tags reason the producer never gives", (b) => {
      delete b.rows[1].tags
      b.rows[1].tags_withheld = { reason: "TOO_MANY", count: 1 }
    }],
    ["a withheld-tags count that is not a count", (b) => {
      delete b.rows[1].tags
      b.rows[1].tags_withheld = { reason: "TAGS_NOT_TEXT", count: -1 }
    }],
    ["a detail that is an object", (b) => { b.rows[1].details.vpc_id = { id: "vpc-1" } }],
    ["a detail that is null (the producer omits it)", (b) => { b.rows[1].details.vpc_id = null }],
    ["a detail that is a fraction", (b) => { b.rows[1].details.memory_size = 1.5 }],
    ["details that are not an object", (b) => { b.rows[1].details = "i-1" }],
    ["withheld detail names that are not a list", (b) => { b.rows[1].details_withheld = "private_ip" }],
    ["a detail both shown and withheld", (b) => { b.rows[1].details_withheld = ["iam_instance_profile"] }],
  ]
  it.each(brokenV3)("refuses %s", (_why, mutate) => {
    expect(parse("populated_page1", mutate)).toMatchObject({ kind: "unavailable", reasonCode: RESPONSE_MALFORMED })
  })
})

describe("the strict reader refuses anything it cannot read exactly", () => {
  const broken: Array<[string, Name, (b: Record<string, any>) => void]> = [
    ["another account", "populated_page1", (b) => { b.account_id = "999988887777" }],
    ["another contract", "populated_page1", (b) => { b.contract = "account_inventory/v2" }],
    ["generation 0", "populated_page1", (b) => { b.publication.generation = 0 }],
    ["generation not an integer", "populated_page1", (b) => { b.publication.generation = 1.5 }],
    ["attempt not 32 hex", "populated_page1", (b) => { b.publication.attempt = "attempt-1" }],
    ["source identity not a digest", "populated_page1", (b) => { b.publication.source_identity = "v1:xyz" }],
    ["registration not 32 hex", "populated_page1", (b) => { b.account_authority.registration_id = "R" }],
    ["completeness not a boolean", "populated_page1", (b) => { b.publication.inventory_complete = "true" }],
    ["filter total above account total", "populated_page1", (b) => { b.totals.filter_total = b.totals.account_total + 1 }],
    ["populated with no rows", "populated_page1", (b) => { b.rows = [] }],
    ["more pages without a cursor", "populated_page1", (b) => { b.next_cursor = null }],
    ["a cursor with no more pages", "populated_page1", (b) => { b.has_more = false }],
    ["a row state outside the producer's", "populated_page1", (b) => { b.rows[0].state = "RUNNING" }],
    ["a row name over its byte cap", "populated_page1", (b) => { b.rows[0].name = "x".repeat(1025) }],
    ["a global row with a regional scope", "populated_page1", (b) => { b.rows[0].scope_kind = "regional" }],
    ["a row without eligibility data", "populated_page1", (b) => { delete b.rows[0].eligibility }],
    ["a row repeated within one page", "populated_page1", (b) => { b.rows[1] = structuredClone(b.rows[0]) }],
    ["more rows than the filter total", "populated_page1", (b) => { b.totals.filter_total = b.rows.length - 1 }],
    ["complete_empty that has more", "complete_empty", (b) => { b.has_more = true }],
    ["filter_empty with no account rows", "filter_empty", (b) => { b.totals.account_total = 0 }],
    ["a hold that carries rows", "held_authority_changed", (b) => { b.rows = body("populated_page1").rows }],
    ["a refusal that carries a publication", "refused_not_authorized_403", (b) => {
      b.publication = body("populated_page1").publication
    }],
  ]
  it.each(broken)("%s", (_why, name, mutate) => {
    const p = parse(name, mutate)
    expect(p.kind).toBe("unavailable")
    if (p.kind !== "data") expect(p.reasonCode).toBe(_why === "another contract" ? RESPONSE_NOT_CONTRACT : RESPONSE_MALFORMED)
  })

  it("an HTTP status that disagrees with the body is never accepted data", () => {
    expect(parse("populated_page1", undefined, 500).kind).toBe("unavailable")
    expect(parse("populated_page1", undefined, 403).kind).toBe("unavailable")
    expect(parse("refused_not_authorized_403", undefined, 200)).toMatchObject({ kind: "unavailable", reasonCode: RESPONSE_MALFORMED })
    expect(parse("unavailable_registry_unreadable", undefined, 200)).toMatchObject({ kind: "unavailable", reasonCode: RESPONSE_MALFORMED })
    expect(parse("not_published", undefined, 503)).toMatchObject({ kind: "unavailable", reasonCode: RESPONSE_MALFORMED })
  })

  it("a proxy refusal is named; any other non-contract body is not", () => {
    expect(parseInventoryResponse(502, { error: "PROXY_BACKEND_REDIRECT" }, ACCOUNT))
      .toMatchObject({ kind: "unavailable", reasonCode: "PROXY_BACKEND_REDIRECT" })
    expect(parseInventoryResponse(502, { error: "something the proxy never says" }, ACCOUNT))
      .toMatchObject({ kind: "unavailable", reasonCode: RESPONSE_NOT_CONTRACT })
    expect(parseInventoryResponse(0, null, ACCOUNT)).toMatchObject({ kind: "unavailable", reasonCode: RESPONSE_NOT_CONTRACT })
  })

  it("MUTATED robustness case (the producer never emits it): a partial publication is still data, marked partial", () => {
    const p = parse("populated_page1", (b) => { b.publication.inventory_complete = false })
    expect(p).toMatchObject({ kind: "data", inventoryComplete: false })
  })
})

describe("the state machine binds every page to one epoch, key, cursor and publication", () => {
  function loaded(epoch = 1): InventoryModel {
    const model = startRead(epoch, KEY)
    return applyInventoryResponse(model, firstPageRequest(model), parse("populated_page1")).model
  }

  it("drops a response for another epoch or another key", () => {
    const model = startRead(2, KEY)
    const old = { ...firstPageRequest(model), epoch: 1 }
    expect(applyInventoryResponse(model, old, parse("populated_page1")).model).toBe(model)
    const otherKey = { ...firstPageRequest(model), key: { ...KEY, resourceType: "s3:bucket" } }
    expect(applyInventoryResponse(model, otherKey, parse("populated_page1")).model).toBe(model)
  })

  it("A -> B -> A: the first A request can never land in the second A read", () => {
    const a1 = startRead(1, KEY)
    const requestA1 = firstPageRequest(a1)
    const a3 = startRead(3, KEY)          // B was epoch 2
    expect(applyInventoryResponse(a3, requestA1, parse("populated_page1")).model).toBe(a3)
  })

  it("appends the next page only for the cursor and publication it was issued for", () => {
    const first = loaded()
    const request = nextPageRequest(first)
    expect(request).not.toBeNull()
    const second = applyInventoryResponse(first, request!, parse("populated_page2")).model
    expect(second.kind === "data" && second.rows.length).toBe(8)
    // The same completion again (an overlapping load-more): its cursor is no longer the current one.
    expect(applyInventoryResponse(second, request!, parse("populated_page2")).model).toBe(second)
  })

  it("no next request while one is loading, or when there is no more", () => {
    const first = loaded()
    if (first.kind !== "data") throw new Error("expected data")
    expect(nextPageRequest({ ...first, loadingMore: true })).toBeNull()
    expect(nextPageRequest({ ...first, hasMore: false })).toBeNull()
  })

  it("a moved publication restarts once, then shows republishing", () => {
    const first = loaded()
    const request = nextPageRequest(first)!
    const moved = parse("populated_page2", (b) => { b.publication.attempt = "f".repeat(32) })
    expect(applyInventoryResponse(first, request, moved).effect).toBe("restart")
    expect(applyInventoryResponse(first, request, parse("refused_cursor_restart_publication_moved")).effect).toBe("restart")
    const again = { ...first, restarts: 1 }
    const second = applyInventoryResponse(again, request, parse("refused_cursor_restart_publication_moved"))
    expect([second.effect, second.model.kind]).toEqual(["none", "republishing"])
  })

  it("every non-data outcome replaces the rows, never leaving old success as current", () => {
    const first = loaded()
    const request = nextPageRequest(first)!
    for (const name of ["refused_not_authorized_403", "unavailable_registry_unreadable", "held_authority_changed"] as const) {
      const next = applyInventoryResponse(first, request, parse(name)).model
      expect(next.kind).not.toBe("data")
      expect("rows" in next).toBe(false)
    }
    const page1Again = applyInventoryResponse(first, firstPageRequest(first), parse("not_published")).model
    expect(page1Again.kind).toBe("evidence")
  })
})

describe("one publication must be walked forward (bounded progression cases, each a golden with one field broken)", () => {
  function firstPage(): InventoryModel {
    const model = startRead(1, KEY)
    return applyInventoryResponse(model, firstPageRequest(model), parse("populated_page1")).model
  }

  function append(model: InventoryModel, mutate: (b: Record<string, any>) => void) {
    const request = nextPageRequest(model)!
    return applyInventoryResponse(model, request, parse("populated_page2", mutate)).model
  }

  function invalid(model: InventoryModel): boolean {
    return model.kind === "unavailable" && model.reasonCode === PAGE_PROGRESSION_INVALID && !("rows" in model)
  }

  it("a legitimate short page continues: has_more decides, never the row count", () => {
    const second = append(firstPage(), () => {})
    expect(second.kind === "data" && [second.rows.length, second.hasMore]).toEqual([8, true])
  })

  it("a cursor that does not advance (an echo of the request) is refused, rows cleared", () => {
    const first = firstPage()
    const echoed = (first as { nextCursor: string }).nextCursor
    expect(invalid(append(first, (b) => { b.next_cursor = echoed }))).toBe(true)
  })

  it("a cursor seen earlier in this read (a cycle) is refused", () => {
    const first = firstPage()
    const firstCursor = (first as { nextCursor: string }).nextCursor
    const second = append(first, () => {})
    expect(second.kind).toBe("data")
    expect(invalid(append(second, (b) => { b.next_cursor = firstCursor }))).toBe(true)
  })

  it("rows seen on an earlier page are refused even with an advancing cursor", () => {
    expect(invalid(append(firstPage(), (b) => { b.rows = body("populated_page1").rows }))).toBe(true)
  })

  it("changed totals within one publication are refused", () => {
    expect(invalid(append(firstPage(), (b) => {
      b.totals.account_total += 1
      b.totals.filter_total += 1
    }))).toBe(true)
  })

  it("an end of the walk with fewer rows than the publication's count is refused", () => {
    expect(invalid(append(firstPage(), (b) => {
      b.has_more = false
      b.next_cursor = null
    }))).toBe(true)
  })

  it("a first page that is also the last must hold exactly the count", () => {
    const model = startRead(1, KEY)
    const terminal = parse("populated_page1", (b) => {
      b.has_more = false
      b.next_cursor = null
    })
    expect(invalid(applyInventoryResponse(model, firstPageRequest(model), terminal).model)).toBe(true)
  })
})
