import { describe, expect, it } from "vitest"
import { zoom0SpotlightPaths } from "@/components/attack-paths-v2/zoom0-fan-in-panel"
import type {
  ConvergencePath,
  CrownJewelConvergence,
} from "@/lib/attack-paths/convergence-types"

function path(partial: Partial<ConvergencePath> & { path_id: string }): ConvergencePath {
  return {
    path_id: partial.path_id,
    hops: partial.hops ?? [],
    confidence: partial.confidence ?? "observed",
    severity: partial.severity ?? "HIGH",
    hop_count: partial.hop_count ?? 3,
    source: partial.source ?? "ec2",
    workload_arn: partial.workload_arn ?? `arn:aws:ec2:us-east-1:1:instance/${partial.path_id}`,
    identity: partial.identity ?? "role-a",
    identity_name: partial.identity_name ?? "role-a",
    ...partial,
  } as ConvergencePath
}

function data(paths: ConvergencePath[]): CrownJewelConvergence {
  return {
    system_name: "alon-prod",
    cj_arn: "arn:aws:s3:::bucket",
    cj_name: "bucket",
    cj_type: "S3Bucket",
    paths,
    paths_total: paths.length,
    observed_paths: paths.filter((p) => p.confidence === "observed").length,
    choke_points: {},
  } as CrownJewelConvergence
}

describe("zoom0SpotlightPaths", () => {
  it("unions workload paths for Attack Map spotlight (no path pin)", () => {
    const out = zoom0SpotlightPaths(
      data([
        path({ path_id: "p1", workload_arn: "arn:aws:ec2:...:instance/i-1" }),
        path({ path_id: "p2", workload_arn: "arn:aws:ec2:...:instance/i-2" }),
        path({ path_id: "orphan", workload_arn: "" }),
      ]),
      null,
    )
    expect(out.map((p) => p.path_id).sort()).toEqual(["p1", "p2"])
  })

  it("applies choke tile filter before spotlight select", () => {
    const out = zoom0SpotlightPaths(
      data([
        path({ path_id: "p1" }),
        path({ path_id: "p2" }),
        path({ path_id: "p3" }),
      ]),
      ["p2", "p3"],
    )
    expect(out.map((p) => p.path_id).sort()).toEqual(["p2", "p3"])
  })
})
