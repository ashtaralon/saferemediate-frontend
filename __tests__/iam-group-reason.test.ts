import { describe, expect, it } from "vitest"

import {
  iamGroupReasonCopy,
  isApprovingReason,
  isBlockedGroup,
  stripRemovalVerdict,
} from "@/lib/iam-group-reason"

const FACTS = "Fully logged in CloudTrail. Role is active (11 permissions in use). Zero usage in 18 days."
const APPROVING = `${FACTS.slice(0, -1)} — safe to remove.`
const BLOCK = "Cyntro has incomplete signals for this permission; manual review recommended before removal."

describe("stripRemovalVerdict", () => {
  it("keeps the facts and drops the verdict", () => {
    expect(stripRemovalVerdict(APPROVING)).toBe(FACTS)
    expect(stripRemovalVerdict("Zero S3 data operations in 18 days — can remove.")).toBe(
      "Zero S3 data operations in 18 days.",
    )
  })

  it("leaves other sentences alone", () => {
    const text = "S3 data events are NOT enabled in CloudTrail. Enable S3 data events before removing."
    expect(stripRemovalVerdict(text)).toBe(text)
    expect(stripRemovalVerdict(null)).toBe("")
  })
})

describe("iamGroupReasonCopy", () => {
  it("never renders an approving sentence beside a blocked decision", () => {
    const copy = iamGroupReasonCopy({
      explanation: APPROVING,
      block_reason_code: "inferred_usage",
      block_reason_human: BLOCK,
      auto_remediable: false,
    })
    expect(copy).toBe(`${FACTS} ${BLOCK}`)
    expect(isApprovingReason(copy)).toBe(false)
  })

  it("prefers the backend facts-only summary when it is served", () => {
    const copy = iamGroupReasonCopy({
      explanation: `${FACTS} ${BLOCK}`,
      evidence_summary: FACTS,
      block_reason_code: "inferred_usage",
      block_reason_human: BLOCK,
      auto_remediable: false,
    })
    expect(copy).toBe(`${FACTS} ${BLOCK}`)
  })

  it("keeps the served explanation for an auto-remediable group", () => {
    expect(iamGroupReasonCopy({
      explanation: APPROVING,
      block_reason_code: "ok",
      block_reason_human: "",
      auto_remediable: true,
    })).toBe(APPROVING)
  })

  it("treats auto_remediable=false as a block even when the code is missing", () => {
    const group = { explanation: APPROVING, auto_remediable: false, block_reason_human: BLOCK }
    expect(isBlockedGroup(group)).toBe(true)
    expect(iamGroupReasonCopy(group)).toBe(`${FACTS} ${BLOCK}`)
  })

  it("does not repeat a block reason the explanation already carries", () => {
    const protectedText = "iam:PassRole never appears in CloudTrail — it is a permission check, not an API call."
    expect(iamGroupReasonCopy({
      explanation: protectedText,
      block_reason_code: "protected",
      block_reason_human: protectedText,
      auto_remediable: false,
    })).toBe(protectedText)
  })

  it("renders the block reason alone when the explanation is empty", () => {
    expect(iamGroupReasonCopy({
      explanation: "",
      block_reason_code: "telemetry_asymmetry",
      block_reason_human: "Access Advisor shows s3 was used by this role.",
      auto_remediable: false,
    })).toBe("Access Advisor shows s3 was used by this role.")
    expect(iamGroupReasonCopy({ explanation: "", block_reason_code: "ok" })).toBeNull()
  })
})
