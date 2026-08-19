import { describe, expect, it } from "vitest"
import {
  leastPrivilegeHeadline,
  selectedObservedSummary,
  targetRelevantActions,
  type ObservedDataChild,
} from "@/components/attack-paths-v2/damage-scope-drawer"

function prefix(name: string, operation: string): ObservedDataChild {
  return {
    id: `prefix:${name}`,
    name,
    parent_name: "bucket",
    type: "S3Prefix",
    operations: [operation],
    evidence_state: "observed",
  }
}

describe("damage scope drawer presentation", () => {
  it("shows only the operation for the selected observed target", () => {
    expect(selectedObservedSummary(prefix("catalog/", "Read"))).toEqual({
      headline: "Read on /catalog/",
      bullets: ["Operation: Read"],
    })
    expect(selectedObservedSummary(prefix("orders/", "Write"))).toEqual({
      headline: "Write on /orders/",
      bullets: ["Operation: Write"],
    })
  })

  it("removes unrelated role permissions from an S3 target view", () => {
    expect(targetRelevantActions("S3Prefix", [
      "ec2messages:GetMessages",
      "kms:Decrypt",
      "s3:GetObject",
      "secretsmanager:GetSecretValue",
    ])).toEqual(["kms:Decrypt", "s3:GetObject"])
  })

  it("does not claim delete was removed while s3:* remains", () => {
    expect(leastPrivilegeHeadline(
      "S3Prefix",
      "Read + write to S3 (delete removed)",
      ["kms:Decrypt", "s3:*"],
    )).toBe("Recommendation needs review: s3:* still permits delete actions.")
  })
})
