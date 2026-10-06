/**
 * Row v3 details read for people: every attribute the backend may serve has a label (the allow-list captured by EXECUTING the
 * backend, fixtures/account-inventory-types/detail-attributes.json), every column and date this table names is on that type's
 * allow-list, values read exactly as collected, and "internet-facing" is only ever the named fact.
 */
import { describe, expect, it } from "vitest"
import captured from "@/__tests__/fixtures/account-inventory-types/detail-attributes.json"
import { DATE_ATTRIBUTE, DETAIL_LABELS, SUMMARY_COLUMNS, formatDetail, internetFacingFacts } from "@/lib/inventory-details"
import { formatUtcInstantExact } from "@/lib/account-admin"

const allowed: Record<string, string[]> = captured.detail_attributes

describe("the details table", () => {
  it("labels every attribute the backend may serve (95 over 20 types)", () => {
    const names = new Set(Object.values(allowed).flat())
    expect(Object.values(allowed).flat()).toHaveLength(95)
    for (const name of names) expect(DETAIL_LABELS[name]?.label, name).toBeTruthy()
  })

  it("names only columns and dates that are on the type's own allow-list", () => {
    for (const [type, columns] of Object.entries(SUMMARY_COLUMNS)) {
      for (const column of columns) expect(allowed[type], `${type}.${column}`).toContain(column)
    }
    for (const [type, attribute] of Object.entries(DATE_ATTRIBUTE)) expect(allowed[type], type).toContain(attribute)
    expect(Object.keys(SUMMARY_COLUMNS).sort()).toEqual(Object.keys(allowed).sort())
  })

  it("heads each type's date honestly", () => {
    const head = (type: string) => DETAIL_LABELS[DATE_ATTRIBUTE[type]].label
    expect(head("ec2:instance")).toBe("Launched")
    expect(head("lambda:function")).toBe("Last modified")
    expect(head("iam:policy")).toBe("Updated")
    for (const type of ["s3:bucket", "iam:role", "rds:db-instance", "rds:db-cluster", "kms:key-authorization"]) expect(head(type)).toBe("Created")
  })

  it("reads values exactly as collected", () => {
    expect(formatDetail("publicly_accessible", false)).toBe("No")
    expect(formatDetail("memory_size", 512)).toBe("512 MB")
    expect(formatDetail("max_session_duration", 3600)).toBe("3600 s")
    expect(formatDetail("create_date", "2026-09-30T08:01:02+00:00")).toBe(formatUtcInstantExact("2026-09-30T08:01:02+00:00"))
    expect(formatDetail("create_date", "not a time")).toBe("not a time")
    expect(formatDetail("unlisted_attribute", "x")).toBe("x")
  })

  it("calls a resource internet-facing only by the fact that says so", () => {
    expect(internetFacingFacts("elasticloadbalancing:load-balancer", { scheme: "internet-facing" })).toEqual(["scheme = internet-facing"])
    expect(internetFacingFacts("elasticloadbalancing:load-balancer", { scheme: "internal" })).toEqual([])
    expect(internetFacingFacts("rds:db-instance", { publicly_accessible: true })).toEqual(["publicly_accessible = true"])
    expect(internetFacingFacts("rds:db-instance", { publicly_accessible: "true" })).toEqual([])
    expect(internetFacingFacts("ec2:network-interface", { association_public_ip: "52.1.2.3" })).toEqual(["public IP 52.1.2.3"])
    expect(internetFacingFacts("ec2:subnet", { map_public_ip_on_launch: true })).toEqual(["map_public_ip_on_launch = true"])
    expect(internetFacingFacts("eks:cluster", { endpoint_public_access: false })).toEqual([])
    expect(internetFacingFacts("s3:bucket", undefined)).toEqual([])
  })
})
