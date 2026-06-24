import {
  buildAttackPathsV2CjUrl,
  filterRealConvergencePaths,
  pickCanonicalConvergencePath,
} from "@/lib/attack-paths/crown-jewel-v2-navigation"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

function path(overrides: Partial<ConvergencePath>): ConvergencePath {
  return {
    path_id: "p1",
    damage: [],
    score: 0,
    confidence: "configured",
    hop_count: 1,
    ...overrides,
  }
}

describe("crown-jewel-v2-navigation", () => {
  it("filters orphan paths without workload_arn", () => {
    const paths = [
      path({ path_id: "orphan", workload_arn: "" }),
      path({ path_id: "real", workload_arn: "i-abc" }),
    ]
    expect(filterRealConvergencePaths(paths)).toHaveLength(1)
    expect(filterRealConvergencePaths(paths)[0].path_id).toBe("real")
  })

  it("picks highest severity observed path", () => {
    const paths = [
      path({
        path_id: "low",
        workload_arn: "i-1",
        severity: "LOW",
        confidence: "configured",
        score: 10,
      }),
      path({
        path_id: "high",
        workload_arn: "i-2",
        severity: "HIGH",
        confidence: "observed",
        score: 5,
      }),
    ]
    expect(pickCanonicalConvergencePath(paths)?.path_id).toBe("high")
  })

  it("builds v2 URL with map=cyntro", () => {
    const url = buildAttackPathsV2CjUrl({
      systemName: "alon-prod",
      jewelId: "arn:aws:s3:::bucket",
      pathId: "path-1",
    })
    expect(url).toContain("/attack-paths-v2?")
    expect(url).toContain("map=cyntro")
    expect(url).toContain("path=path-1")
  })
})
