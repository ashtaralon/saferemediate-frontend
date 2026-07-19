import { describe, expect, it } from "vitest"
import {
  buildAttackPathIdBlob,
  deriveAttackPathId,
  resolveClosurePathId,
  resolveReportPathIds,
} from "@/components/attack-paths-v2/derive-attack-path-id"

const ALON_DEMO_EXPECTED =
  "432c6db135ff8b2af80a67e22ec466f2b4fd3a37512bffea62c73779ac199d42"

const MAT_ID =
  "8fc8ad1ef6f33178ed68fa55cd6578b4267a5211055feab6907e7e753b10db4a"
const IAP_HASH =
  "7121656aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

describe("deriveAttackPathId", () => {
  it("matches phase3 materialized id for alon-demo path", async () => {
    const nodes = [
      { type: "EC2Instance", id: "i-0aa725bf8ff4c2001", name: "alon-demo-app2" },
      {
        type: "IAMRole",
        id: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
        name: "alon-demo-ec2-role",
      },
    ]
    const jewelId = "arn:aws:s3:::saferemediate-logs-745783559495"
    expect(buildAttackPathIdBlob(nodes, jewelId)).toBe(
      "i-0aa725bf8ff4c2001|arn:aws:iam::745783559495:role/alon-demo-ec2-role|arn:aws:s3:::saferemediate-logs-745783559495",
    )
    expect(await deriveAttackPathId(nodes, jewelId)).toBe(ALON_DEMO_EXPECTED)
  })
})

describe("resolveReportPathIds", () => {
  const nodes = [
    { type: "EC2Instance", id: "i-0aa725bf8ff4c2001", name: "alon-demo-app2" },
    {
      type: "IAMRole",
      id: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
      name: "alon-demo-ec2-role",
    },
  ]
  const jewelId = "arn:aws:s3:::saferemediate-logs-745783559495"

  it("prefers materialized_path.id over IAP attack_path_id", async () => {
    const ids = await resolveReportPathIds({
      id: "path-iap-synth",
      attack_path_id: IAP_HASH,
      nodes,
      crown_jewel_id: jewelId,
      materialized: false,
      materialized_path: { id: MAT_ID },
    })
    expect(ids[0]).toBe(MAT_ID)
    expect(ids).toContain(IAP_HASH)
    expect(ids).toContain(ALON_DEMO_EXPECTED)
  })

  it("for path-mat rows puts attack_path_id before derived", async () => {
    const ids = await resolveReportPathIds({
      id: `path-mat-${MAT_ID.slice(0, 12)}`,
      attack_path_id: MAT_ID,
      nodes,
      crown_jewel_id: jewelId,
      materialized: true,
    })
    expect(ids[0]).toBe(MAT_ID)
    expect(
      await resolveClosurePathId({
        id: `path-mat-${MAT_ID.slice(0, 12)}`,
        attack_path_id: MAT_ID,
        nodes,
        crown_jewel_id: jewelId,
        materialized: true,
      }),
    ).toBe(MAT_ID)
  })

  it("deprioritizes non-mat IAP hashes so derived can win on 404 fallback", async () => {
    const ids = await resolveReportPathIds({
      id: "path-34c2eeabcdef",
      attack_path_id: IAP_HASH,
      nodes,
      crown_jewel_id: jewelId,
      materialized: false,
    })
    expect(ids[0]).toBe(ALON_DEMO_EXPECTED)
    expect(ids.indexOf(ALON_DEMO_EXPECTED)).toBeLessThan(ids.indexOf(IAP_HASH))
  })
})
