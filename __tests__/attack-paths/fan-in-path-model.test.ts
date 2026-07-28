import { describe, expect, it } from "vitest"
import {
  fanInPathDisposition,
  formatFanInCardinality,
  summarizeFanInDrawability,
} from "@/lib/attack-paths/fan-in-path-model"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

function path(
  partial: Partial<ConvergencePath> & { path_id: string },
): ConvergencePath {
  const { path_id, ...overrides } = partial
  return {
    path_id,
    workload_arn: "arn:aws:ec2:eu-west-1:1:instance/i-abc",
    confidence: "configured",
    damage: [],
    score: 1,
    hop_count: 2,
    hops_load_state: "ready",
    hops: [
      {
        node_id: "i-abc",
        node_type: "EC2Instance",
        plane: "compute",
        security_groups: [],
        is_crown_jewel: false,
      },
      {
        node_id: "arn:aws:s3:::target",
        node_type: "S3Bucket",
        plane: "data",
        security_groups: [],
        is_crown_jewel: true,
        edge_type_from_prev: "ACCESSES_RESOURCE",
      },
    ],
    ...overrides,
  }
}

describe("fan-in path drawability model", () => {
  it("keeps eligible identity-only paths explicit but omits them from compute-led fan-in", () => {
    const identityOnly = path({
      path_id: "identity-only",
      workload_arn: null,
    })
    expect(fanInPathDisposition(identityOnly)).toMatchObject({
      drawable: false,
      reason: "identity_only",
    })
  })

  it("distinguishes failed detail and missing typed-edge omissions", () => {
    const summary = summarizeFanInDrawability([
      path({ path_id: "drawn" }),
      path({ path_id: "failed", hops_load_state: "error" }),
      path({
        path_id: "no-edge",
        hops: [
          {
            node_id: "i-abc",
            node_type: "EC2Instance",
            plane: "compute",
            security_groups: [],
            is_crown_jewel: false,
          },
        ],
      }),
    ])
    expect(summary.drawnPaths.map((item) => item.path_id)).toEqual(["drawn"])
    expect(summary.omittedByReason).toEqual({
      detail_failed: 1,
      no_renderable_edge: 1,
    })
  })

  it("formats eligible, returned, drawn, and omitted as distinct buckets", () => {
    const drawability = summarizeFanInDrawability([
      path({ path_id: "drawn" }),
      path({ path_id: "identity", workload_arn: null }),
    ])
    expect(
      formatFanInCardinality(
        {
          generation_total: 4,
          eligible_total: 3,
          returned_count: 2,
          excluded_count_by_reason: { path_ineligible: 1 },
          truncated: true,
        },
        drawability,
      ),
    ).toBe(
      "3 eligible · 2 returned · 1 drawn · 1 omitted (1 identity-only) · 4 in generation · 1 not returned · 1 generation-excluded · truncated",
    )
  })
})
