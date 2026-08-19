import { describe, expect, it } from "vitest"
import {
  buildCurrentAccessDossier,
  findPinnedConvergencePath,
} from "@/lib/attack-paths/build-current-access-dossier"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

function path(partial: Partial<ConvergencePath> & { path_id: string }): ConvergencePath {
  return {
    path_id: partial.path_id,
    hops: partial.hops ?? [],
    confidence: partial.confidence ?? "observed",
    evidence: partial.evidence ?? partial.confidence ?? "observed",
    severity: partial.severity ?? "HIGH",
    hop_count: partial.hop_count ?? 3,
    source: partial.source ?? "ec2",
    workload_arn: partial.workload_arn ?? `arn:aws:ec2:us-east-1:1:instance/${partial.path_id}`,
    identity: partial.identity ?? "role-a",
    identity_name: partial.identity_name ?? "role-a",
    damage: partial.damage ?? ["read"],
    ...partial,
  } as ConvergencePath
}

describe("buildCurrentAccessDossier", () => {
  it("composes credential → network → authz → data → damage → cut", () => {
    const dossier = buildCurrentAccessDossier(
      path({
        path_id: "p1",
        identity_gate: "OPEN_OBSERVED",
        route_gate: "OPEN_CONFIG",
        data_plane_gate: "UNKNOWN",
        impact_headline: "DESTRUCTIVE ACCESS",
        damage: ["delete", "read"],
        closure_recommendation: {
          remove_actions: ["s3:DeleteObject", "s3:GetObject"],
        },
        route_verdict: {
          winning_gateway: "vpce-1",
          route_kind: "VPCEndpoint",
          basis: "prefix-list",
          evidence: "configured",
        },
        initial_access: [
          {
            category: "IMDS",
            pivot_name: "alon-demo-app2",
            attacker_narrative: "Steal instance-role creds via IMDSv1",
            verdict_confidence: "config",
          },
        ],
        hops: [
          {
            node_id: "i-1",
            node_type: "EC2Instance",
            name: "alon-demo-app2",
            plane: "compute",
            security_groups: ["sg-1"],
            is_crown_jewel: false,
          },
          {
            node_id: "subnet-1",
            node_type: "Subnet",
            name: "subnet-1",
            plane: "network",
            security_groups: [],
            is_crown_jewel: false,
            edge_type_from_prev: "IN_SUBNET",
            subnet_public: false,
          },
          {
            node_id: "sg-1",
            node_type: "SecurityGroup",
            name: "app-sg",
            plane: "network",
            security_groups: [],
            is_crown_jewel: false,
            rule_count: 4,
            rules_coverage: "COLLECTED",
          },
          {
            node_id: "role-a",
            node_type: "IAMRole",
            name: "alon-demo-ec2-role",
            plane: "identity",
            security_groups: [],
            is_crown_jewel: false,
            edge_type_from_prev: "USES_ROLE",
            edge_evidence: "configured",
          },
          {
            node_id: "arn:aws:s3:::bucket",
            node_type: "S3Bucket",
            name: "bucket",
            plane: "data",
            security_groups: [],
            is_crown_jewel: true,
            edge_type_from_prev: "ACCESSES_RESOURCE",
            edge_evidence: "observed",
            hit_count: 12,
            last_seen: "2026-07-01T00:00:00Z",
            vpc_endpoint_ids: ["vpce-1"],
            vpc_endpoint_call_count: 9,
            public_source_call_count: 3,
            private_source_call_count: 0,
            aws_service_source_call_count: 0,
            distinct_source_count: 2,
          },
        ],
      }),
    )

    expect(dossier).not.toBeNull()
    expect(dossier!.checkpoints.map((c) => c.kind)).toEqual([
      "credential",
      "execution_network",
      "authorization",
      "data_operation",
      "damage",
      "cut",
    ])
    expect(dossier!.headline).toBe("DESTRUCTIVE ACCESS")
    expect(dossier!.checkpoints[0].summary).toContain("IMDSv1")
    expect(dossier!.checkpoints[1].details.some((d) => d.label === "Route verdict")).toBe(
      true,
    )
    expect(dossier!.checkpoints[1].details.some((d) => d.value.includes("4 rules"))).toBe(
      true,
    )
    expect(dossier!.checkpoints[3].details.some((d) => d.label === "Last seen")).toBe(true)
    expect(
      dossier!.checkpoints[3].details.some(
        (d) => d.label === "VPC endpoint transport" && d.value === "vpce-1",
      ),
    ).toBe(true)
    expect(
      dossier!.checkpoints[3].details.some(
        (d) => d.label === "Public-source calls" && d.value === "3",
      ),
    ).toBe(true)
    expect(dossier!.checkpoints[4].status).toContain("delete")
    expect(dossier!.checkpoints[5].summary).toMatch(/remove 2/i)
  })

  it("does not invent cut or access when DTO omits them", () => {
    const dossier = buildCurrentAccessDossier(
      path({
        path_id: "thin",
        hops: [],
        damage: [],
        closure_recommendation: null,
      }),
    )
    expect(dossier!.checkpoints[5].status).toBe("unavailable")
    expect(dossier!.checkpoints[3].details.some((d) => d.value.includes("unavailable"))).toBe(
      true,
    )
  })

  it("uses the IAM role as From when an STS wrapper precedes it", () => {
    const dossier = buildCurrentAccessDossier(
      path({
        path_id: "session-role",
        hops: [
          {
            node_id: "session",
            node_type: "STSSession",
            name: "→ AWSServiceRoleForConfig",
            plane: "identity",
            security_groups: [],
            is_crown_jewel: false,
          },
          {
            node_id: "role",
            node_type: "IAMRole",
            name: "AWSServiceRoleForConfig",
            plane: "identity",
            security_groups: [],
            is_crown_jewel: false,
          },
          {
            node_id: "bucket",
            node_type: "S3Bucket",
            name: "bucket",
            plane: "data",
            security_groups: [],
            is_crown_jewel: true,
          },
        ],
      }),
    )

    expect(dossier?.from).toMatchObject({
      name: "AWSServiceRoleForConfig",
      type: "IAMRole",
    })
  })
})

describe("findPinnedConvergencePath", () => {
  it("returns exact path_id match only", () => {
    const paths = [path({ path_id: "a" }), path({ path_id: "b" })]
    expect(findPinnedConvergencePath(paths, "b")?.path_id).toBe("b")
    expect(findPinnedConvergencePath(paths, "missing")).toBeNull()
  })
})
