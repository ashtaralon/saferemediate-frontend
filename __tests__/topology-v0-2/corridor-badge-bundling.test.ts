import { describe, expect, it } from "vitest"
import {
  bundleCorridorBadge,
  corridorKindForEdge,
  selectBundledCorridorBadges,
} from "@/components/topology-v0-2/estate-edge-labels"

describe("corridorKindForEdge", () => {
  it("classifies egress and IGW rail targets", () => {
    expect(corridorKindForEdge({ target_id: "__igw__", edge_class: "egress" })).toBe("egress")
    expect(corridorKindForEdge({ target_id: "x", edge_class: "egress" })).toBe("egress")
  })

  it("classifies S3 / API via IGW and VPCE", () => {
    expect(
      corridorKindForEdge(
        { target_id: "__aws_s3__", edge_class: "edge_service", via_igw: true },
        { routedViaIgw: true },
      ),
    ).toBe("s3_via_igw")
    expect(
      corridorKindForEdge(
        { target_id: "__aws_api__", edge_class: "edge_service", egress_path: "public" },
        { routedViaIgw: true },
      ),
    ).toBe("aws_api_via_igw")
    expect(
      corridorKindForEdge(
        { target_id: "vpce-1", edge_class: "vpce", via_vpce_id: "vpce-1" },
        { routedViaVpce: true },
      ),
    ).toBe("vpce")
  })

  it("never bundles exposed database edges", () => {
    expect(
      corridorKindForEdge({
        target_id: "rds-1",
        edge_class: "database",
        is_exposed: true,
      }),
    ).toBeNull()
  })
})

describe("bundleCorridorBadge", () => {
  it("keeps a single member label as-is", () => {
    expect(bundleCorridorBadge("egress", [{ label: "egress 12 (NTP)" }])).toEqual({
      label: "egress 12 (NTP)",
      title: "egress 12 (NTP)",
    })
  })

  it("bundles egress / VPCE / S3 corridors", () => {
    expect(
      bundleCorridorBadge("egress", [
        { label: "egress A" },
        { label: "egress B" },
      ]).label,
    ).toBe("Egress · 2 flows")
    expect(
      bundleCorridorBadge("vpce", [{ label: "VPCE" }, { label: "VPCE" }, { label: "VPCE" }]).label,
    ).toBe("VPCE · 3 flows")
    expect(
      bundleCorridorBadge("s3_via_igw", [
        { label: "S3 · 10 endpoints · via IGW", externalDestinations: 10 },
        { label: "S3 · 5 endpoints · via IGW", externalDestinations: 5 },
      ]).label,
    ).toBe("S3 · 15 endpoints · via IGW")
  })
})

describe("selectBundledCorridorBadges", () => {
  it("bundles glance corridors with 2+ members and keeps DB labels", () => {
    const selected = selectBundledCorridorBadges(
      [
        { kind: "egress", label: "egress A", badgeX: 10, badgeY: 10 },
        { kind: "egress", label: "egress B", badgeX: 100, badgeY: 12 },
        { kind: null, label: "57 public IPs on :5432", badgeX: 40, badgeY: 80 },
      ],
      "glance",
    )
    const visible = selected.filter(Boolean)
    expect(visible).toHaveLength(2)
    expect(visible.some(v => v!.label === "Egress · 2 flows")).toBe(true)
    expect(visible.some(v => v!.label === "57 public IPs on :5432")).toBe(true)
    // Rightmost egress keeps the chip
    expect(selected[1]?.label).toBe("Egress · 2 flows")
    expect(selected[0]).toBeNull()
  })

  it("inventory only bundles when corridor has more than 2 badges", () => {
    const selected = selectBundledCorridorBadges(
      [
        { kind: "vpce", label: "VPCE", badgeX: 1, badgeY: 1 },
        { kind: "vpce", label: "VPCE", badgeX: 2, badgeY: 2 },
      ],
      "inventory",
    )
    expect(selected[0]?.label).toBe("VPCE")
    expect(selected[1]?.label).toBe("VPCE")
  })
})
