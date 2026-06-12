import { describe, expect, it } from "vitest"
import { buildAttackPathIdBlob, deriveAttackPathId } from "@/components/attack-paths-v2/derive-attack-path-id"

const ALON_DEMO_EXPECTED =
  "432c6db135ff8b2af80a67e22ec466f2b4fd3a37512bffea62c73779ac199d42"

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
