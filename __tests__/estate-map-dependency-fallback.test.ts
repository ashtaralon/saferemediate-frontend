import { describe, expect, it } from "vitest"

import { buildMapDependencyFallback } from "@/components/topology-v0-2/estate-operations"

describe("Estate map dependency fallback", () => {
  it("projects only payload-backed direct edges and drops ambiguous self-edges", () => {
    const dossier = buildMapDependencyFallback(
      { id: "lambda-worker", name: "worker", type: "Lambda" },
      [
        { id: "lambda-worker", name: "worker", type: "Lambda" },
        { id: "bucket-data", name: "data", type: "S3" },
        { id: "rule-worker", name: "worker schedule", type: "EventBridge" },
      ],
      [
        {
          source_id: "lambda-worker",
          target_id: "bucket-data",
          protocol: "ACTUAL_S3_ACCESS",
          last_seen: "2026-08-31T20:00:00Z",
          evidence_type: "observed",
          evidence_source: "cloudtrail",
          activity_count: 12,
        },
        {
          source_id: "rule-worker",
          target_id: "lambda-worker",
          protocol: "TRIGGERS",
          evidence_type: "configured",
          evidence_source: "aws_config",
        },
        {
          source_id: "lambda-worker",
          target_id: "lambda-worker",
          protocol: "TARGETS",
        },
      ],
      { systemName: "test-system", stale: true },
    )

    expect(dossier.dependencies.upstream).toHaveLength(1)
    expect(dossier.dependencies.upstream[0]).toMatchObject({
      resource_id: "rule-worker",
      evidence_type: "configured",
    })
    expect(dossier.dependencies.downstream).toHaveLength(1)
    expect(dossier.dependencies.downstream[0]).toMatchObject({
      resource_id: "bucket-data",
      evidence_type: "observed",
      activity_count: 12,
    })
    expect(dossier.dependencies.summary).toEqual({
      consumer_count: 1,
      observed: 1,
      configured: 1,
      inferred: 0,
    })
    expect(dossier.evidence).toMatchObject({
      coverage_state: "stale · partial",
      sources: ["estate_topology_snapshot"],
    })
  })
})
