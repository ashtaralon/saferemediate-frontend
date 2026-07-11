import { describe, expect, it } from "vitest"
import { formatClosureClosesLine } from "@/components/attack-paths-v2/format-closure-closes"
import { jewelServiceLabel } from "@/components/attack-paths-v2/reachable-damage-priority"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

describe("formatClosureClosesLine", () => {
  it("returns null when closes omitted or zero — never invents", () => {
    expect(formatClosureClosesLine(null)).toBeNull()
    expect(
      formatClosureClosesLine({
        closes_paths: 0,
        closes_path_ids: [],
        closes_lateral: 0,
        closes_lateral_ids: [],
        closes_lateral_jewels: 0,
        source: "neo4j_attack_path",
      }),
    ).toBeNull()
  })

  it("formats same-CJ + lateral from graph counts", () => {
    expect(
      formatClosureClosesLine({
        closes_paths: 7,
        closes_path_ids: [],
        closes_lateral: 3,
        closes_lateral_ids: [],
        closes_lateral_jewels: 2,
        source: "neo4j_attack_path",
      }),
    ).toBe("7 paths to this jewel · 3 lateral branches (2 other jewels)")
  })
})

describe("jewelServiceLabel (compiler v2 terminals inherit row contract)", () => {
  it("labels DynamoDB / KMS like S3 for Zoom 0 headlines", () => {
    const ddb = {
      id: "p",
      nodes: [{ tier: "crown_jewel", type: "DynamoDBTable", name: "orders" }],
      damage_capability: { jewel_service: "dynamodb" },
    } as unknown as IdentityAttackPath
    const kms = {
      id: "p",
      nodes: [{ tier: "crown_jewel", type: "KMSKey", name: "cmk" }],
      damage_capability: { jewel_service: "kms" },
    } as unknown as IdentityAttackPath
    expect(jewelServiceLabel(ddb, null)).toBe("DynamoDB table")
    expect(jewelServiceLabel(kms, null)).toBe("KMS key")
  })
})
