import { describe, expect, it } from "vitest"

import { filterTrafficEdgesForVisible } from "@/components/topology-v0-2/estate-system-scope"
import type { TrafficEdge } from "@/components/topology-v0-2/types"

function edge(sourceId: string, targetId: string): TrafficEdge {
  return {
    source_id: sourceId,
    target_id: targetId,
    port: null,
    protocol: "TCP",
    last_seen: "2026-08-19T07:38:02Z",
    edge_class: "egress",
    evidence_type: "observed",
    authority_state: "authoritative",
    path_basis: "observed_segment",
    projection_generation: 2,
  }
}

describe("directional topology scope", () => {
  it("keeps authoritative traffic through the IGW in both directions", () => {
    const visible = new Set(["i-web"])
    const scoped = filterTrafficEdgesForVisible(
      [
        edge("i-web", "__igw__"),
        edge("__igw__", "i-web"),
        edge("__igw__", "i-foreign"),
        edge("__igw__", "__aws_api__"),
      ],
      visible,
      new Set(),
    )

    expect(scoped.map(item => [item.source_id, item.target_id])).toEqual([
      ["i-web", "__igw__"],
      ["__igw__", "i-web"],
    ])
  })

  it("keeps VPCE traffic in both directions when the endpoint is in scope", () => {
    const scoped = filterTrafficEdgesForVisible(
      [edge("i-web", "vpce-1"), edge("vpce-1", "i-web")],
      new Set(["i-web"]),
      new Set(["vpce-1"]),
    )

    expect(scoped).toHaveLength(2)
  })
})
