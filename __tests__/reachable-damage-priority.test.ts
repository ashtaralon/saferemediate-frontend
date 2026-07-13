import { describe, expect, it } from "vitest"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  classifyReachableDamageBucket,
  compareReachableDamagePriority,
  compileAttackerHeadline,
  compilePathLayers,
  compileZoom0Projection,
  layerChipLabel,
} from "@/components/attack-paths-v2/reachable-damage-priority"

function basePath(over: Record<string, unknown> = {}): IdentityAttackPath {
  return {
    id: "p1",
    crown_jewel_id: "arn:aws:s3:::customer-data-s3",
    hop_count: 3,
    nodes: [
      {
        id: "i-abc",
        name: "web-1",
        type: "EC2Instance",
        tier: "entry",
        is_internet_exposed: true,
        lp_score: null,
        gap_count: 0,
      },
      {
        id: "role-1",
        name: "AppRole",
        type: "IAMRole",
        tier: "identity",
        is_internet_exposed: false,
        lp_score: null,
        gap_count: 0,
      },
      {
        id: "arn:aws:s3:::customer-data-s3",
        name: "customer-data-s3",
        type: "S3Bucket",
        tier: "crown_jewel",
        is_internet_exposed: false,
        lp_score: null,
        gap_count: 0,
      },
    ],
    edges: [],
    ...over,
  } as IdentityAttackPath
}

const jewel = {
  id: "arn:aws:s3:::customer-data-s3",
  name: "customer-data-s3",
  type: "S3Bucket",
} as any

describe("compilePathLayers", () => {
  it("keeps observed vs config separate from materialized gates", () => {
    const layers = compilePathLayers(
      basePath({
        materialized_path: {
          id: "m1",
          path_status: "OBSERVED",
          damage_types: ["delete", "read"],
          identity_gate: "OPEN_OBSERVED",
          route_gate: "OPEN_CONFIG",
          data_plane_gate: "OPEN_OBSERVED",
        },
      }),
    )
    expect(layers.permissions).toBe("observed")
    expect(layers.network).toBe("config-open")
    expect(layers.data).toBe("observed")
  })

  it("sets network to N/A — standing access on assume-chain with unknown route", () => {
    const layers = compilePathLayers(
      basePath({
        edges: [
          {
            source: "role-entry",
            target: "role-1",
            type: "ASSUMES_ROLE",
            is_observed: false,
          },
        ],
        nodes: [
          {
            id: "role-entry",
            name: "EntryRole",
            type: "IAMRole",
            tier: "identity",
            is_internet_exposed: false,
            lp_score: null,
            gap_count: 0,
          },
          {
            id: "role-1",
            name: "AppRole",
            type: "IAMRole",
            tier: "identity",
            is_internet_exposed: false,
            lp_score: null,
            gap_count: 0,
          },
          {
            id: "arn:aws:s3:::customer-data-s3",
            name: "customer-data-s3",
            type: "S3Bucket",
            tier: "crown_jewel",
            is_internet_exposed: false,
            lp_score: null,
            gap_count: 0,
          },
        ],
        materialized_path: {
          id: "m2",
          path_status: "POTENTIAL_EXCESS",
          damage_types: ["read"],
          identity_gate: "OPEN_CONFIG",
          route_gate: "UNKNOWN",
          data_plane_gate: "OPEN_CONFIG",
        },
      }),
    )
    expect(layers.network).toBe("na-standing")
    expect(layerChipLabel("N", layers.network)).toContain("standing access")
  })
})

describe("Reachable Damage Priority", () => {
  it("ranks observed destructive above config-only read", () => {
    const observedDel = compileZoom0Projection(
      basePath({
        evidence_type: "observed",
        edges: [
          {
            source: "role-1",
            target: "arn:aws:s3:::customer-data-s3",
            type: "ACTUAL_S3_ACCESS",
            is_observed: true,
            hit_count: 5,
          },
        ],
        damage_types: ["delete", "read"],
        materialized_path: {
          id: "m1",
          path_status: "OBSERVED",
          damage_types: ["delete", "read"],
          identity_gate: "OPEN_OBSERVED",
          route_gate: "OPEN_CONFIG",
          data_plane_gate: "OPEN_OBSERVED",
        },
      }),
      jewel,
    )
    const configRead = compileZoom0Projection(
      basePath({
        id: "p2",
        evidence_type: "configured",
        damage_types: ["read"],
        materialized_path: {
          id: "m2",
          path_status: "POTENTIAL_EXCESS",
          damage_types: ["read"],
          identity_gate: "OPEN_CONFIG",
          route_gate: "OPEN_CONFIG",
          data_plane_gate: "OPEN_CONFIG",
        },
      }),
      jewel,
    )
    expect(observedDel.reachable_damage_rank).toBeLessThan(configRead.reachable_damage_rank)
    expect(compareReachableDamagePriority(observedDel, configRead)).toBeLessThan(0)
  })

  it("does not bury standing destructive under foothold config-read", () => {
    const standingDelete = compileZoom0Projection(
      basePath({
        id: "standing",
        evidence_type: "configured",
        damage_types: ["delete", "admin"],
        edges: [
          {
            source: "role-entry",
            target: "role-1",
            type: "ASSUMES_ROLE",
            is_observed: false,
          },
        ],
        nodes: [
          {
            id: "role-entry",
            name: "EntryRole",
            type: "IAMRole",
            tier: "identity",
            is_internet_exposed: false,
            lp_score: null,
            gap_count: 0,
          },
          {
            id: "role-1",
            name: "AppRole",
            type: "IAMRole",
            tier: "identity",
            is_internet_exposed: false,
            lp_score: null,
            gap_count: 0,
          },
          {
            id: "arn:aws:s3:::customer-data-s3",
            name: "customer-data-s3",
            type: "S3Bucket",
            tier: "crown_jewel",
            is_internet_exposed: false,
            lp_score: null,
            gap_count: 0,
          },
        ],
        materialized_path: {
          id: "m-stand",
          path_status: "POTENTIAL_EXCESS",
          damage_types: ["delete", "admin"],
          identity_gate: "OPEN_CONFIG",
          route_gate: "UNKNOWN",
          data_plane_gate: "OPEN_CONFIG",
          role_name: "AppRole",
        },
      }),
      jewel,
    )
    const footholdRead = compileZoom0Projection(
      basePath({
        id: "foothold-read",
        evidence_type: "configured",
        damage_types: ["read"],
        materialized_path: {
          id: "m-read",
          path_status: "POTENTIAL_EXCESS",
          damage_types: ["read"],
          identity_gate: "OPEN_CONFIG",
          route_gate: "OPEN_CONFIG",
          data_plane_gate: "OPEN_CONFIG",
        },
      }),
      jewel,
    )
    expect(standingDelete.reachable_damage_bucket).toBe("standing_iam_only")
    expect(standingDelete.origin_confidence).toBe("origin_unresolved")
    expect(standingDelete.impact_tier).toBeLessThan(footholdRead.impact_tier)
    expect(compareReachableDamagePriority(standingDelete, footholdRead)).toBeLessThan(0)
  })

  it("classifies standing IAM-only when network is N/A", () => {
    const layers = {
      permissions: "config-open" as const,
      network: "na-standing" as const,
      data: "config-open" as const,
    }
    expect(classifyReachableDamageBucket(basePath(), layers, ["READ"])).toBe(
      "standing_iam_only",
    )
  })
})

describe("compileAttackerHeadline", () => {
  it("leads with Observed destructive path to jewel", () => {
    const path = basePath({
      evidence_type: "observed",
      damage_types: ["delete"],
      edges: [
        {
          source: "role-1",
          target: "arn:aws:s3:::customer-data-s3",
          type: "ACTUAL_S3_ACCESS",
          is_observed: true,
          hit_count: 2,
        },
      ],
      materialized_path: {
        id: "m1",
        path_status: "OBSERVED",
        damage_types: ["delete"],
        identity_gate: "OPEN_OBSERVED",
        route_gate: "OPEN_CONFIG",
        data_plane_gate: "OPEN_OBSERVED",
        role_name: "AppRole",
      },
    })
    const layers = compilePathLayers(path)
    const bucket = classifyReachableDamageBucket(path, layers, ["DELETE"])
    const headline = compileAttackerHeadline(path, jewel, layers, bucket, ["DELETE"])
    expect(headline).toMatch(/^Observed destructive path to customer-data-s3/)
    expect(headline).toContain("AppRole")
  })

  it("uses Standing access headline for IAM-only", () => {
    const path = basePath({
      edges: [
        {
          source: "role-entry",
          target: "role-1",
          type: "ASSUMES_ROLE",
          is_observed: false,
        },
      ],
      nodes: [
        {
          id: "role-entry",
          name: "EntryRole",
          type: "IAMRole",
          tier: "identity",
          is_internet_exposed: false,
          lp_score: null,
          gap_count: 0,
        },
        {
          id: "role-1",
          name: "AppRole",
          type: "IAMRole",
          tier: "identity",
          is_internet_exposed: false,
          lp_score: null,
          gap_count: 0,
        },
        {
          id: "arn:aws:s3:::customer-data-s3",
          name: "customer-data-s3",
          type: "S3Bucket",
          tier: "crown_jewel",
          is_internet_exposed: false,
          lp_score: null,
          gap_count: 0,
        },
      ],
      damage_types: ["read"],
      materialized_path: {
        id: "m2",
        path_status: "POTENTIAL_EXCESS",
        damage_types: ["read"],
        identity_gate: "OPEN_CONFIG",
        route_gate: "UNKNOWN",
        data_plane_gate: "OPEN_CONFIG",
        role_name: "AppRole",
      },
    })
    const proj = compileZoom0Projection(path, jewel)
    expect(proj.attacker_headline).toMatch(/^Standing access — IAM-only path to customer-data-s3/)
    expect(proj.layers.network).toBe("na-standing")
  })
})
