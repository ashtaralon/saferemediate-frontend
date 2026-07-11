import { describe, expect, it } from "vitest"
import type { TopologyNode } from "@/components/topology-v0-2/types"

/** Pure filter used by estate-map "Just mine" toggle. */
function filterSharedNeighbors(
  nodes: TopologyNode[],
  showSharedNeighbors: boolean,
): TopologyNode[] {
  if (showSharedNeighbors) return nodes
  return nodes.filter(n => n.is_foreign !== true)
}

describe("estate ownership clarity — shared neighbor filter", () => {
  const nodes = [
    { id: "own", name: "Frontend-1", is_foreign: false, owner_system_name: "alon-prod" },
    {
      id: "tg",
      name: "payment-prod-frontend-tg",
      is_foreign: true,
      owner_system_name: "payment-production",
    },
    { id: "untagged", name: "mystery", is_foreign: false },
  ] as TopologyNode[]

  it("keeps foreign neighbors when toggle is ON", () => {
    expect(filterSharedNeighbors(nodes, true)).toHaveLength(3)
  })

  it("hides is_foreign nodes when toggle is OFF (just mine)", () => {
    const out = filterSharedNeighbors(nodes, false)
    expect(out.map(n => n.id)).toEqual(["own", "untagged"])
  })
})
