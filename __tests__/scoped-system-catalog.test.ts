import { describe, expect, it } from "vitest"
import {
  catalogEntries,
  catalogEntryHref,
  catalogSystemName,
  familyMetricsAttributable,
  productScopeKey,
  scopedStorageKey,
  selectCatalogSystem,
  unrepeatedLabels,
  type CatalogEntry,
} from "@/lib/scoped-system-catalog"
import golden from "./fixtures/systems-catalog-checkout-3-5.json"
import families from "./fixtures/systems-with-families.json"

describe("scoped system catalog helpers", () => {
  it("keys browser state by every scope dimension", () => {
    const first = productScopeKey({
      customerId: "customer-a",
      groupId: "prod",
      accountId: "111111111111",
      region: "eu-west-1",
    })
    const second = productScopeKey({
      customerId: "customer-a",
      groupId: "prod",
      accountId: "111111111111",
      region: "us-east-1",
    })
    expect(first).not.toBe(second)
    expect(scopedStorageKey("cyntro:lastSystem", first)).toContain(first)
  })

  it("accepts a requested system only when it belongs to the scoped catalog", () => {
    expect(catalogSystemName("PAYMENTS", ["payments", "reports"])).toBe("payments")
    expect(catalogSystemName("other-tenant", ["payments", "reports"])).toBeNull()
  })
})

// ── T10 S1: identity, the one selection rule, tuple links and metric attribution ────────────────────────────────────────

const answer = (golden as { answer: { systems: Record<string, unknown>[] } }).answer
const rowFor = (account: string) => answer.systems.find((row) => (row.catalog_identity as { account_id: string }).account_id === account)!
const withRows = (...rows: Record<string, unknown>[]) => ({ systems: rows })

describe("T10 S1 catalogue identity (real producer golden: checkout in two accounts)", () => {
  it("reads the golden as two IDENTIFIED entries of one repeated label", () => {
    const entries = catalogEntries(answer, "acme")
    expect(entries.map((e) => [e.name, e.status, e.identity?.account_id, e.repeated])).toEqual([
      ["checkout", "IDENTIFIED", "123456789012", true],
      ["checkout", "IDENTIFIED", "222222222222", true],
    ])
  })

  it("never resolves a repeated label by name alone", () => {
    expect(catalogSystemName("checkout", ["checkout", "checkout"])).toBeNull()
    expect(catalogSystemName("Checkout", ["checkout", "reports"])).toBe("checkout")
  })

  it.each([
    ["kind", { kind: "authored" }],
    ["version", { version: 2 }],
    ["account", { account_id: "12345" }],
    ["region", { region: "Europe" }],
    ["label", { label: "payments" }],
    ["tenant", { customer_id: "other-tenant" }],
  ])("a present identity with a bad %s is MALFORMED, never legacy", (_field, change) => {
    const row = rowFor("123456789012")
    const bad = { ...row, catalog_identity: { ...(row.catalog_identity as object), ...change } }
    expect(catalogEntries(withRows(bad), "acme")[0].status).toBe("MALFORMED")
  })

  it("an identity is not trusted without the scope's own tenant", () => {
    expect(catalogEntries(withRows(rowFor("123456789012")), null)[0].status).toBe("MALFORMED")
  })

  it("a row with no identity is the legacy name-merged shape", () => {
    const { catalog_identity: _absent, ...legacy } = rowFor("123456789012")
    expect(catalogEntries(withRows(legacy), "acme")[0]).toMatchObject({ status: "LEGACY", identity: null })
  })
})

describe("selectCatalogSystem: the one rule (no ambiguity-to-first)", () => {
  const entries = catalogEntries(answer, "acme")

  it("a repeated label with no account is AMBIGUOUS, never the first row", () => {
    const selection = selectCatalogSystem({ system: "checkout" }, entries)
    expect(selection.kind).toBe("AMBIGUOUS")
  })

  it("the URL's account and region select exactly that row", () => {
    const selection = selectCatalogSystem({ system: "checkout", accountId: "222222222222", region: "eu-west-1" }, entries)
    expect(selection).toMatchObject({ kind: "SELECTED", entry: { identity: { account_id: "222222222222" } } })
  })

  it("an account no row carries is NOT_FOUND, never another account", () => {
    expect(selectCatalogSystem({ system: "checkout", accountId: "333333333333" }, entries).kind).toBe("NOT_FOUND")
    expect(selectCatalogSystem({ system: "checkout", accountId: "123456789012", region: "us-east-1" }, entries).kind)
      .toBe("NOT_FOUND")
  })

  it("nothing requested opens the first label exactly one account serves, else NONE", () => {
    expect(selectCatalogSystem({}, entries).kind).toBe("NONE")
    const reports: CatalogEntry = { name: "reports", status: "LEGACY", identity: null, repeated: false }
    expect(selectCatalogSystem({}, [...entries, reports])).toEqual({ kind: "SELECTED", entry: reports })
  })

  it("a lone malformed match is IDENTITY_UNAVAILABLE, and malformed rows are never the default", () => {
    const row = rowFor("123456789012")
    const malformed = catalogEntries(withRows({ ...row, catalog_identity: { ...(row.catalog_identity as object), version: 9 } }), "acme")
    expect(selectCatalogSystem({ system: "checkout" }, malformed).kind).toBe("IDENTITY_UNAVAILABLE")
    expect(selectCatalogSystem({}, malformed).kind).toBe("NONE")
  })
})

describe("catalogEntryHref: the full tuple is the carrier", () => {
  const [first] = catalogEntries(answer, "acme")

  it("an identified row links with label, tenant, account and observed region", () => {
    const href = catalogEntryHref("/services", first)!
    const query = new URL(href, "https://x").searchParams
    expect(Object.fromEntries(query)).toEqual({
      system: "checkout", customer_id: "acme", account_id: "123456789012", region: "eu-west-1",
    })
    expect(catalogEntryHref("/systems", first, "systemName")).toContain("systemName=checkout&customer_id=acme")
  })

  it("a legacy row is name-only and a malformed row has no link", () => {
    expect(catalogEntryHref("/", { name: "payments", status: "LEGACY", identity: null, repeated: false })).toBe("/?system=payments")
    expect(catalogEntryHref("/", { ...first, status: "MALFORMED", identity: null })).toBeNull()
  })
})

describe("familyMetricsAttributable (real with-families captures)", () => {
  type Answer = { scope: { customer_id: string; account_id: string; region: string | null } }
  const answers = (families as { answers: Record<string, Answer> }).answers
  const single = (account: string): CatalogEntry => ({ ...catalogEntries(withRows(rowFor(account)), "acme")[0] })
  const narrowed = (account: string) => ({ customerId: "acme", accountId: account, region: "eu-west-1" })

  it("shows values only for the exact explicit scope the answer was computed for", () => {
    expect(familyMetricsAttributable(single("123456789012"), narrowed("123456789012"), answers["123456789012"].scope)).toBe(true)
  })

  it("withholds under a broader scope, even when the answer names the same account", () => {
    const all = { customerId: "acme", accountId: "all", region: "all" }
    expect(familyMetricsAttributable(single("123456789012"), all, answers.all.scope)).toBe(false)
    expect(familyMetricsAttributable(single("123456789012"), { ...narrowed("123456789012"), region: "all" },
      answers.all.scope)).toBe(false)
  })

  it("withholds when the answer's own scope is another account's (e.g. one from a previous scope)", () => {
    expect(familyMetricsAttributable(single("222222222222"), narrowed("222222222222"), answers["123456789012"].scope)).toBe(false)
  })

  it("withholds a repeated label, a malformed row, and no row at all; a legacy row keeps today's behaviour", () => {
    const [repeated] = catalogEntries(answer, "acme")
    expect(familyMetricsAttributable(repeated, narrowed("123456789012"), answers["123456789012"].scope)).toBe(false)
    expect(familyMetricsAttributable({ ...repeated, repeated: false, status: "MALFORMED", identity: null },
      narrowed("123456789012"), answers["123456789012"].scope)).toBe(false)
    expect(familyMetricsAttributable(null, narrowed("123456789012"), answers["123456789012"].scope)).toBe(false)
    expect(familyMetricsAttributable({ name: "payments", status: "LEGACY", identity: null, repeated: false },
      { customerId: "acme", accountId: "all", region: "all" }, null)).toBe(true)
  })
})

describe("unrepeatedLabels: the default for home, topology and attack paths", () => {
  it("keeps input order and drops every label two rows serve, whatever its case", () => {
    expect(unrepeatedLabels(["checkout", "reports", "Checkout", "billing"])).toEqual(["reports", "billing"])
    expect(unrepeatedLabels(["checkout", "checkout"])).toEqual([])
  })
})
