import { describe, expect, it } from "vitest"

import {
  ACTION_UNAVAILABLE_NOTE,
  actionsSupported,
  anyActionSupported,
  declaredUnavailable,
  ORPHAN_ACTION_SUPPORT,
  ORPHAN_READ_SUPPORT,
  readSupported,
  readSupportedFamilies,
  readUnsupportedFamilies,
  SCOPE_NOTE,
  type OrphanFamily,
  type OrphanResourceType,
} from "@/lib/orphan-availability"

const ALL_FAMILIES: OrphanFamily[] = [
  "iam_role",
  "s3_bucket",
  "iam_policy",
  "security_group",
]
const ALL_RESOURCE_TYPES: OrphanResourceType[] = [
  "IAMRole",
  "S3Bucket",
  "IAMPolicy",
  "SecurityGroup",
]

describe("no orphan family can be read today", () => {
  it("supports no read at all", () => {
    expect(readSupportedFamilies()).toEqual([])
    expect(readUnsupportedFamilies().sort()).toEqual(ALL_FAMILIES.slice().sort())
    for (const family of ALL_FAMILIES) {
      expect(readSupported(family), `${family} must not claim read support`).toBe(false)
    }
  })

  it("gives every family a recorded reason", () => {
    for (const family of ALL_FAMILIES) {
      const detail = declaredUnavailable(family)
      expect(detail, `${family} needs a reason`).toBeDefined()
      expect(detail!.reason.length).toBeGreaterThan(40)
    }
  })

  it("marks the three live-AWS reads as boundary refusals", () => {
    for (const family of ["iam_role", "s3_bucket", "iam_policy"] as OrphanFamily[]) {
      const detail = declaredUnavailable(family)!
      expect(detail.boundary, `${family} is refused at the boundary`).toBe(true)
      // The distinction the whole page turns on.
      expect(detail.reason).toContain("not looked at")
    }
  })

  it("blocks the security-group read on the legacy classifier, not the boundary", () => {
    // It would answer. What it answers is a judgement, so the ground is
    // different from the other three and must read differently.
    const detail = declaredUnavailable("security_group")!
    expect(detail.boundary).toBe(false)
    expect(detail.reason).toContain("determine_status_and_severity")
    expect(detail.reason).toContain("P4D.4")
    expect(detail.reason).toContain("decision migration")
    for (const output of ["status", "severity", "recommendation", "safe_to_delete", "confidence"]) {
      expect(detail.reason, `names the classifier output ${output}`).toContain(output)
    }
    // And it says the part that is easy to get wrong.
    expect(detail.reason).toContain("A factual source does not make")
  })

  it("names the backend path for every family", () => {
    expect(ORPHAN_READ_SUPPORT.iam_role.endpoint).toBe("/api/iam-roles/orphan-detection")
    expect(ORPHAN_READ_SUPPORT.s3_bucket.endpoint).toBe("/api/s3-buckets/orphan-detection")
    expect(ORPHAN_READ_SUPPORT.iam_policy.endpoint).toBe("/api/iam-policies/orphan-detection")
    expect(ORPHAN_READ_SUPPORT.security_group.endpoint).toBe(
      "/api/security-groups/orphan-detection",
    )
  })
})

describe("action support is a SEPARATE matrix, and equally false", () => {
  it("has every current HTTP action capability false", () => {
    for (const type of ALL_RESOURCE_TYPES) {
      expect(actionsSupported(type), `${type} must not claim action support`).toBe(false)
    }
    expect(anyActionSupported()).toBe(false)
  })

  it("names the exact routes each blocked action would use", () => {
    expect(ORPHAN_ACTION_SUPPORT.SecurityGroup.routes).toEqual([
      "DELETE /api/security-groups/{sg_id}",
      "POST /api/quarantine/pre-check",
    ])
    for (const type of ALL_RESOURCE_TYPES) {
      expect(ORPHAN_ACTION_SUPPORT[type].routes).toContain("POST /api/quarantine/pre-check")
    }
  })

  it("gives both grounds, not a vague 'unavailable'", () => {
    for (const type of ALL_RESOURCE_TYPES) {
      const reason = ORPHAN_ACTION_SUPPORT[type].reason
      expect(reason, `${type}: delete ground`).toContain("503")
      expect(reason, `${type}: quarantine ground`).toContain("422")
      expect(reason).toContain("systemName")
      expect(ORPHAN_ACTION_SUPPORT[type].owner).toContain("P8")
      expect(ORPHAN_ACTION_SUPPORT[type].owner).toContain("P4D.4")
    }
  })

  it("has a banner that states the split in the UI's own words", () => {
    expect(ACTION_UNAVAILABLE_NOTE).toContain("Read-only")
    expect(ACTION_UNAVAILABLE_NOTE).toContain("serving boundary")
    expect(ACTION_UNAVAILABLE_NOTE).toContain("P8")
  })
})

describe("the page describes its scope as a deployment scope", () => {
  it("does not claim account-wide anywhere in the capability copy", () => {
    expect(SCOPE_NOTE).toContain("deployment scope")
    for (const text of [SCOPE_NOTE, ACTION_UNAVAILABLE_NOTE]) {
      expect(text.toLowerCase()).not.toContain("account-wide")
    }
  })

  it("blocks quarantine on the missing systemName, not on an account claim", () => {
    for (const type of ALL_RESOURCE_TYPES) {
      const reason = ORPHAN_ACTION_SUPPORT[type].reason
      expect(reason).toContain("systemName")
      expect(reason.toLowerCase()).not.toContain("account-wide")
    }
    expect(ACTION_UNAVAILABLE_NOTE).toContain("systemName")
    expect(ACTION_UNAVAILABLE_NOTE.toLowerCase()).not.toContain("account-wide")
  })
})

describe("the contract exposes nothing that could re-enable a verdict", () => {
  it("has no helper that formats a finding", () => {
    // observedSgState is gone with the SG rendering path it existed for.
    // A formatter is a rendering path waiting for a flag.
    const contract = ORPHAN_READ_SUPPORT as unknown as Record<string, unknown>
    expect(Object.keys(contract).sort()).toEqual(ALL_FAMILIES.slice().sort())
  })
})
