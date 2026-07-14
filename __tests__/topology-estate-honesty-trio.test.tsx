/// <reference types="vitest/globals" />
/**
 * Estate Map honesty trio (FE Phase 1b). Three bugs where the scoped canvas
 * lied by omission / mislabel:
 *   (1) Multi-AZ workloads left matching AZ cells falsely empty.
 *   (2) The scoped VPC silently dropped this system's workloads in other VPCs.
 *   (3) A co-owned (shared) resource was stamped like a foreign tenant.
 *
 * Shared BE contract (backend adds the fields; these tests pin the FE against
 * it): node.subnet_ids[], node.is_foreign + node.owner_systems[], and
 * response.out_of_scope_workloads { count, by_vpc[], sample_names[] }.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  WorkloadChip,
  buildVpcFrames,
  computeCanvasGrid,
  countGridWorkloads,
  countTierWorkloads,
  isMultiAzWorkload,
  sharedOwnerName,
  workloadSubnetIds,
} from "@/components/topology-v0-2/aws-frame"
import { OutOfScopeOverflowLine } from "@/components/topology-v0-2/estate-out-of-scope"
import type { SubnetMeta, TopologyNode } from "@/components/topology-v0-2/types"

beforeAll(() => {
  // WorkloadChip is pure, but keep parity with the other render tests.
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})
afterEach(() => cleanup())

const VPC = "vpc-honesty"

function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return { name: p.id, az: "eu-west-1a", cidr: "10.0.0.0/24", tier: "web", tier_source: "property", vpc_id: VPC, ...p }
}
function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return { name: p.id, type: "EC2", subnet_id: null, score: null, stale: null, is_jewel: false, ...p }
}

// Two data subnets in DIFFERENT AZs — a real Multi-AZ RDS occupies both.
const SUBNETS: SubnetMeta[] = [
  sn({ id: "sn-web", tier: "web", az: "eu-west-1a", cidr: "10.0.1.0/24" }),
  sn({ id: "sn-data-a", tier: "data", az: "eu-west-1a", cidr: "10.0.20.0/24" }),
  sn({ id: "sn-data-b", tier: "data", az: "eu-west-1b", cidr: "10.0.21.0/24" }),
]
const RDS_MULTI_AZ = nd({
  id: "db-multiaz",
  name: "orders-db",
  type: "RDS",
  vpc_id: VPC,
  subnet_id: "sn-data-a",
  subnet_ids: ["sn-data-a", "sn-data-b"],
})

// ── (1) Multi-AZ placement — stop false-empty cells ────────────────────────
describe("(1) Multi-AZ placement", () => {
  it("workloadSubnetIds unions subnet_ids with the primary, deduped + stable", () => {
    expect(workloadSubnetIds(RDS_MULTI_AZ)).toEqual(["sn-data-a", "sn-data-b"])
    // Degrades cleanly when subnet_ids is absent.
    expect(workloadSubnetIds(nd({ id: "solo", subnet_id: "sn-data-a" }))).toEqual(["sn-data-a"])
    expect(isMultiAzWorkload(RDS_MULTI_AZ)).toBe(true)
    expect(isMultiAzWorkload(nd({ id: "solo", subnet_id: "sn-data-a" }))).toBe(false)
  })

  it("places ONE instance into BOTH matching DB cells (never false-empty)", () => {
    const grid = computeCanvasGrid(VPC, SUBNETS, [RDS_MULTI_AZ], [])
    const cellA = (grid.byAzAndTier.get("eu-west-1a")?.get("data") ?? []).map(n => n.id)
    const cellB = (grid.byAzAndTier.get("eu-west-1b")?.get("data") ?? []).map(n => n.id)
    expect(cellA).toContain("db-multiaz") // DB-1
    expect(cellB).toContain("db-multiaz") // DB-2 — the previously-empty cell
  })

  it("counts the Multi-AZ DB as 1 — dedup by resource id, not chips rendered", () => {
    const { frames } = buildVpcFrames(SUBNETS, [RDS_MULTI_AZ], VPC, [], [], false)
    const frame = frames[0]
    expect(countTierWorkloads(frame, "data")).toBe(1)
    expect(countGridWorkloads(frame.grid)).toBe(1)
  })

  it("renders a Multi-AZ badge so the chip reads as one resource, not two", () => {
    render(<WorkloadChip node={RDS_MULTI_AZ} selected={false} onClick={() => {}} />)
    expect(screen.getByTestId("topology-multi-az-badge").textContent).toMatch(/Multi-AZ/i)
  })
})

// ── (2) Other-VPC overflow — no silent drop ────────────────────────────────
describe("(2) Out-of-scope overflow line", () => {
  const outOfScope = {
    count: 4,
    by_vpc: [
      { vpc_id: "vpc-b", count: 3 },
      { vpc_id: "vpc-c", count: 1 },
    ],
    sample_names: ["api-1", "worker-2"],
  }

  it("renders one honest chrome line with the count when count > 0", () => {
    render(<OutOfScopeOverflowLine systemName="alon-prod" outOfScope={outOfScope} onOpenCompare={() => {}} />)
    const line = screen.getByTestId("topology-out-of-scope-overflow")
    expect(line).toBeInTheDocument()
    expect(line.textContent).toContain("4")
    expect(line.textContent).toMatch(/other VPCs/i)
    expect(line.textContent).toContain("alon-prod")
    // Renders count verbatim from the payload — never recomputed.
    expect(line.getAttribute("data-out-of-scope-count")).toBe("4")
  })

  it("renders NOTHING when count is 0 (no fabricated overflow)", () => {
    render(
      <OutOfScopeOverflowLine
        systemName="alon-prod"
        outOfScope={{ count: 0, by_vpc: [], sample_names: [] }}
        onOpenCompare={() => {}}
      />,
    )
    expect(screen.queryByTestId("topology-out-of-scope-overflow")).toBeNull()
  })

  it("clicking opens Compare / switches VPC (fires the handler once)", () => {
    const onOpenCompare = vi.fn()
    render(<OutOfScopeOverflowLine systemName="alon-prod" outOfScope={outOfScope} onOpenCompare={onOpenCompare} />)
    fireEvent.click(screen.getByTestId("topology-out-of-scope-overflow"))
    expect(onOpenCompare).toHaveBeenCalledTimes(1)
  })
})

// ── (3) Dual-system ownership stamp — "shared", never "foreign" ────────────
describe("(3) Shared ownership stamp", () => {
  it("sharedOwnerName prefers owner_systems[0], falls back to owner_system_name", () => {
    expect(sharedOwnerName({ owner_systems: ["payment-production"], owner_system_name: "ignored" })).toBe(
      "payment-production",
    )
    expect(sharedOwnerName({ owner_systems: [], owner_system_name: "legacy-sys" })).toBe("legacy-sys")
    expect(sharedOwnerName({ owner_system_name: null })).toBe("other system")
  })

  it("renders a 'shared · <system>' chip and never the word 'foreign' in visible copy", () => {
    const shared = nd({
      id: "tg-shared",
      name: "checkout-tg",
      type: "TargetGroup",
      is_foreign: true,
      owner_systems: ["payment-production"],
    })
    render(<WorkloadChip node={shared} selected={false} onClick={() => {}} />)
    const chip = screen.getByTestId("topology-foreign-owner-chip")
    expect(chip.textContent).toContain("shared")
    expect(chip.textContent).toContain("payment-production")
    // The visible copy reads SHARED (co-owned), not FOREIGN (another tenant).
    expect(document.body.textContent?.toLowerCase()).not.toContain("foreign")
  })
})
