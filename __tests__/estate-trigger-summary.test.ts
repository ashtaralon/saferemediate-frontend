import { describe, expect, it } from "vitest"
import { summarizeTriggerRelationships } from "@/components/topology-v0-2/estate-egress-summary"
import type { TrafficEdge } from "@/components/topology-v0-2/types"

const edge = (source_id: string, target_id: string, protocol: string): TrafficEdge => ({
  edge_class: "internal",
  source_id,
  target_id,
  protocol,
  port: null,
  last_seen: null,
})

describe("trigger relationship summary", () => {
  it("collapses TARGETS and TRIGGERS rows into one directed connection", () => {
    const summary = summarizeTriggerRelationships(
      [edge("rule-a", "fn-a", "TARGETS"), edge("rule-a", "fn-a", "TRIGGERS")],
      ["rule-a"],
      ["fn-a"],
    )
    expect(summary).toEqual({
      connectionCount: 1,
      edgeRowCount: 2,
      relationships: [{
        sourceId: "rule-a",
        targetId: "fn-a",
        spellings: ["TARGETS", "TRIGGERS"],
        edgeRows: 2,
      }],
    })
  })

  it("counts unique directed pairs and ignores unrelated observed data edges", () => {
    const summary = summarizeTriggerRelationships(
      [
        edge("rule-a", "fn-a", "TARGETS"),
        edge("rule-b", "fn-b", "TRIGGERS"),
        edge("fn-a", "bucket-a", "ACTUAL_S3_ACCESS"),
      ],
      ["rule-a", "rule-b"],
      ["fn-a", "fn-b"],
    )
    expect(summary?.connectionCount).toBe(2)
    expect(summary?.edgeRowCount).toBe(2)
  })

  it("fails honestly to unavailable when no supported relationship row exists", () => {
    expect(
      summarizeTriggerRelationships(
        [edge("fn-a", "bucket-a", "ACTUAL_S3_ACCESS")],
        ["rule-a"],
        ["fn-a"],
      ),
    ).toBeNull()
  })

  it("does not admit rows outside the supplied trigger and function scope", () => {
    expect(
      summarizeTriggerRelationships(
        [edge("other-rule", "fn-a", "TRIGGERS"), edge("rule-a", "other-fn", "TARGETS")],
        ["rule-a"],
        ["fn-a"],
      ),
    ).toBeNull()
  })
})
