import { describe, expect, it } from "vitest"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import {
  CHOKE_TILE_THRESHOLD,
  compileChokePointTiles,
  pathIdsForChokeSelection,
  shouldCollapseToChokeTiles,
} from "@/components/attack-paths-v2/choke-point-tiles"

function fakeConvergence(n: number): CrownJewelConvergence {
  const paths = Array.from({ length: n }, (_, i) => ({
    path_id: `p${i}`,
    source: i % 3 === 0 ? "alon-prod-3tier-alb" : `workload-${i}`,
    source_kind: i % 3 === 0 ? "ApplicationLoadBalancer" : "EC2Instance",
    identity: i % 2 === 0 ? "arn:aws:iam::1:role/AppRole" : `arn:aws:iam::1:role/Role${i}`,
    identity_name: i % 2 === 0 ? "AppRole" : `Role${i}`,
    damage: i % 4 === 0 ? ["s3:DeleteObject"] : ["s3:GetObject"],
    score: 50,
    confidence: i % 2 === 0 ? "observed" : "configured",
    hop_count: 4,
    hops: [
      {
        node_id: `sg-${i % 2}`,
        name: `sg-web-${i % 2}`,
        node_type: "SecurityGroup",
        plane: "network",
        security_groups: [`sg-${i % 2}`],
        is_crown_jewel: false,
      },
      {
        node_id: i % 2 === 0 ? "arn:aws:iam::1:role/AppRole" : `arn:aws:iam::1:role/Role${i}`,
        name: i % 2 === 0 ? "AppRole" : `Role${i}`,
        node_type: "IAMRole",
        plane: "identity",
        security_groups: [],
        is_crown_jewel: false,
      },
      {
        node_id: "arn:aws:s3:::customer-data-s3",
        name: "customer-data-s3",
        node_type: "S3Bucket",
        plane: "data",
        security_groups: [],
        is_crown_jewel: true,
      },
    ],
  }))
  return {
    system: "alon-prod",
    cj_arn: "arn:aws:s3:::customer-data-s3",
    cj_name: "customer-data-s3",
    cj_type: "S3Bucket",
    paths_total: n,
    observed_paths: Math.ceil(n / 2),
    choke_points: { "arn:aws:iam::1:role/AppRole": Math.ceil(n / 2) },
    paths,
  }
}

describe("shouldCollapseToChokeTiles", () => {
  it("collapses only above threshold", () => {
    expect(shouldCollapseToChokeTiles(12)).toBe(false)
    expect(shouldCollapseToChokeTiles(13)).toBe(true)
    expect(shouldCollapseToChokeTiles(CHOKE_TILE_THRESHOLD)).toBe(false)
  })
})

describe("compileChokePointTiles", () => {
  it("emits five tile kinds with crown jewel = 1", () => {
    const tiles = compileChokePointTiles(fakeConvergence(18))
    expect(tiles.map((t) => t.kind)).toEqual([
      "public_entries",
      "identity_chokes",
      "network_chokes",
      "data_plane_gates",
      "crown_jewel",
    ])
    const cj = tiles.find((t) => t.kind === "crown_jewel")!
    expect(cj.count).toBe(1)
    expect(cj.subtitle).toBe("customer-data-s3")
  })

  it("counts shared AppRole as an identity choke", () => {
    const tiles = compileChokePointTiles(fakeConvergence(18))
    const id = tiles.find((t) => t.kind === "identity_chokes")!
    expect(id.count).toBeGreaterThanOrEqual(1)
    expect(id.members.some((m) => m.label === "AppRole")).toBe(true)
  })

  it("pathIdsForChokeSelection returns members' paths", () => {
    const tiles = compileChokePointTiles(fakeConvergence(6))
    const publicTile = tiles.find((t) => t.kind === "public_entries")!
    const ids = pathIdsForChokeSelection(publicTile, null)
    expect(ids).not.toBeNull()
    expect((ids || []).length).toBeGreaterThan(0)
  })
})
