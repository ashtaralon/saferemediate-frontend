import { describe, expect, it } from "vitest"
import {
  detailFailuresFor,
  detailsReadyFor,
  mergeSummaryWithPathDetails,
  pathIdsNeedingDetail,
  pathsWithAuthoritativeHops,
  type PathDetailRecord,
} from "@/lib/attack-paths/convergence-path-details"
import type {
  ConvergencePath,
  CrownJewelConvergenceSummary,
} from "@/lib/attack-paths/convergence-types"

function summaryPath(
  overrides: Partial<ConvergencePath> & { path_id: string },
): ConvergencePath {
  return {
    path_id: overrides.path_id,
    damage: [],
    score: 1,
    confidence: "configured",
    hop_count: overrides.hop_count ?? 3,
    source: overrides.source ?? "src",
    workload_arn: overrides.workload_arn ?? "i-1",
    hops: overrides.hops ?? [],
    ...overrides,
  }
}

const summary: CrownJewelConvergenceSummary = {
  system: "alon-prod",
  cj_arn: "arn:aws:s3:::cyntro-demo-analytics-745783559495",
  paths_total: 3,
  observed_paths: 0,
  choke_points: {},
  cardinality: {
    generation_total: 5,
    eligible_total: 3,
    returned_count: 3,
    truncated: false,
  },
  paths: [
    summaryPath({
      path_id: "lambda-path",
      source: "cyntro-demo-batch-processor",
      workload_arn: "arn:aws:lambda:eu-west-1:1:function:batch",
      hop_count: 3,
    }),
    summaryPath({
      path_id: "ec2-path",
      source: "SafeRemediate-Test-App-2",
      workload_arn: "i-0e9b891793b5b2dbd",
      hop_count: 15,
    }),
    summaryPath({
      path_id: "orphan-path",
      source: "pivot-role",
      workload_arn: "",
      hop_count: 3,
    }),
  ],
}

describe("pathIdsNeedingDetail", () => {
  it("fan-in (no pin) requests detail for EVERY summary path", () => {
    expect(pathIdsNeedingDetail(summary, null).sort()).toEqual([
      "ec2-path",
      "lambda-path",
      "orphan-path",
    ])
  })

  it("pinned path requests only that path_id", () => {
    expect(pathIdsNeedingDetail(summary, "ec2-path")).toEqual(["ec2-path"])
  })
})

describe("mergeSummaryWithPathDetails", () => {
  it("keeps hops pending until detail settles — not an authoritative empty spine", () => {
    const merged = mergeSummaryWithPathDetails(summary, {
      "lambda-path": { state: "pending" },
    })
    const lambda = merged.paths.find((p) => p.path_id === "lambda-path")!
    expect(lambda.hops_load_state).toBe("pending")
    expect(lambda.hops).toEqual([])
    expect(pathsWithAuthoritativeHops(merged.paths)).toEqual([])
  })

  it("merges hop DTOs for all settled paths so EC2 network spine is present", () => {
    const details: Record<string, PathDetailRecord> = {
      "lambda-path": {
        state: "ready",
        path: summaryPath({
          path_id: "lambda-path",
          hops: [
            {
              node_id: "arn:aws:lambda:eu-west-1:1:function:batch",
              node_type: "LambdaFunction",
              plane: "compute",
              security_groups: [],
              is_crown_jewel: false,
            },
            {
              node_id: "arn:aws:iam::1:role/s3",
              node_type: "IAMRole",
              plane: "identity",
              security_groups: [],
              is_crown_jewel: false,
              edge_type_from_prev: "USES_ROLE",
            },
            {
              node_id: summary.cj_arn!,
              node_type: "S3Bucket",
              plane: "data",
              security_groups: [],
              is_crown_jewel: true,
              edge_type_from_prev: "ACCESSES_RESOURCE",
            },
          ],
        }),
      },
      "ec2-path": {
        state: "ready",
        path: summaryPath({
          path_id: "ec2-path",
          hops: [
            {
              node_id: "i-0e9b891793b5b2dbd",
              node_type: "EC2Instance",
              plane: "network",
              security_groups: ["sg-1"],
              is_crown_jewel: false,
            },
            {
              node_id: "subnet-1",
              node_type: "Subnet",
              plane: "network",
              security_groups: [],
              is_crown_jewel: false,
              edge_type_from_prev: "IN_SUBNET",
            },
            {
              node_id: "sg-1",
              node_type: "SecurityGroup",
              plane: "network",
              security_groups: [],
              is_crown_jewel: false,
            },
            {
              node_id: "igw-1",
              node_type: "InternetGateway",
              plane: "network",
              security_groups: [],
              is_crown_jewel: false,
            },
            {
              node_id: "arn:aws:iam::1:role/s3",
              node_type: "IAMRole",
              plane: "identity",
              security_groups: [],
              is_crown_jewel: false,
              edge_type_from_prev: "USES_ROLE",
            },
            {
              node_id: summary.cj_arn!,
              node_type: "S3Bucket",
              plane: "data",
              security_groups: [],
              is_crown_jewel: true,
              edge_type_from_prev: "ACCESSES_RESOURCE",
            },
          ],
        }),
      },
      "orphan-path": { state: "error", error: "detail 404" },
    }

    const merged = mergeSummaryWithPathDetails(summary, details)
    expect(merged.cardinality).toEqual({
      generation_total: 5,
      eligible_total: 3,
      returned_count: 3,
      truncated: false,
    })
    expect(detailsReadyFor(["lambda-path", "ec2-path", "orphan-path"], details)).toBe(
      true,
    )

    const ready = pathsWithAuthoritativeHops(merged.paths)
    expect(ready.map((p) => p.path_id).sort()).toEqual(["ec2-path", "lambda-path"])

    expect(
      detailFailuresFor(["lambda-path", "ec2-path", "orphan-path"], details),
    ).toEqual([{ pathId: "orphan-path", error: "detail 404" }])

    const ec2 = ready.find((p) => p.path_id === "ec2-path")!
    const hopTypes = (ec2.hops ?? []).map((h) => h.node_type)
    expect(hopTypes).toContain("Subnet")
    expect(hopTypes).toContain("SecurityGroup")
    expect(hopTypes).toContain("InternetGateway")
  })

  it("forwards workload_network from summary and prefers detail", () => {
    const summaryWithWn: CrownJewelConvergenceSummary = {
      ...summary,
      paths: [
        summaryPath({
          path_id: "lambda-path",
          source: "cyntro-demo-batch-processor",
          workload_arn: "arn:aws:lambda:eu-west-1:1:function:batch",
          workload_network: {
            is_vpc_attached: false,
            evidence: "summary evidence",
            verified_at: "2026-07-30T00:00:00Z",
            route_verdict: "EXECUTION_LOCATION_UNBOUND",
            workload_count_queried: 1,
            workload_count_in_sample: 1,
          },
        }),
      ],
    }
    const pending = mergeSummaryWithPathDetails(summaryWithWn, {
      "lambda-path": { state: "pending" },
    })
    expect(pending.paths[0].workload_network?.evidence).toBe("summary evidence")

    const ready = mergeSummaryWithPathDetails(summaryWithWn, {
      "lambda-path": {
        state: "ready",
        path: summaryPath({
          path_id: "lambda-path",
          hops: [],
          workload_network: {
            is_vpc_attached: false,
            evidence: "Lambda VpcConfig empty (no VpcId), verified at 2026-07-30T12:00:00Z",
            verified_at: "2026-07-30T12:00:00Z",
            route_verdict: "EXECUTION_LOCATION_UNBOUND",
            workload_count_queried: 1,
            workload_count_in_sample: 1,
          },
        }),
      },
    })
    expect(ready.paths[0].workload_network?.verified_at).toBe(
      "2026-07-30T12:00:00Z",
    )
    expect(ready.paths[0].workload_network?.evidence).toContain("VpcConfig empty")
  })
})
