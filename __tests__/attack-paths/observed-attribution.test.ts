/**
 * AP3-103 — an empty observed-action list has two very different meanings.
 *
 * "We looked and saw no use" is an all-clear. "Several workloads share this
 * role and nobody can say which acted" is the opposite: the path we know
 * least about. Rendering them the same way is the failure this guards.
 */
import { describe, expect, it } from "vitest"

import {
  describeUnattributedActions,
  isUnresolvedAttribution,
} from "@/lib/attack-paths/observed-attribution"

const ROLE = "shared-role"

describe("describeUnattributedActions", () => {
  it("explains the ambiguity and names the role's activity", () => {
    const line = describeUnattributedActions({
      attribution: "unresolved",
      observedActions: [],
      roleObservedActions: ["s3:GetObject", "s3:PutObject"],
      roleName: ROLE,
    })
    expect(line).not.toBeNull()
    expect(line!.text).toContain("2 actions observed")
    expect(line!.text).toContain(ROLE)
    // Never presented as evidence about this workload.
    expect(line!.confidence).toBe("Unknown")
  })

  it("uses the singular when the role was seen doing one thing", () => {
    const line = describeUnattributedActions({
      attribution: "unresolved",
      observedActions: [],
      roleObservedActions: ["s3:GetObject"],
      roleName: ROLE,
    })
    expect(line!.text).toContain("1 action observed")
    expect(line!.text).not.toContain("1 actions")
  })

  it("still refuses to imply an all-clear when the role shows nothing", () => {
    const line = describeUnattributedActions({
      attribution: "unresolved",
      observedActions: [],
      roleObservedActions: [],
      roleName: null,
    })
    expect(line!.text).toContain("cannot be attributed")
    expect(line!.confidence).toBe("Unknown")
  })

  it("leaves every other path alone", () => {
    // Attributed to this workload — the caller renders the real list.
    expect(
      describeUnattributedActions({
        attribution: "exact",
        observedActions: [],
        roleObservedActions: ["s3:GetObject"],
        roleName: ROLE,
      }),
    ).toBeNull()
    // Sole consumer on the role.
    expect(
      describeUnattributedActions({
        attribution: "sole_consumer",
        observedActions: [],
        roleObservedActions: [],
        roleName: ROLE,
      }),
    ).toBeNull()
    // A path materialized before AP3-103 carries no attribution at all.
    expect(
      describeUnattributedActions({
        attribution: undefined,
        observedActions: [],
        roleObservedActions: null,
        roleName: ROLE,
      }),
    ).toBeNull()
  })

  it("does not override a workload that does have attributed actions", () => {
    expect(
      describeUnattributedActions({
        attribution: "unresolved",
        observedActions: ["s3:GetObject"],
        roleObservedActions: ["s3:GetObject"],
        roleName: ROLE,
      }),
    ).toBeNull()
  })
})

describe("isUnresolvedAttribution", () => {
  it("is true only for the unresolved case", () => {
    expect(isUnresolvedAttribution("unresolved")).toBe(true)
    for (const v of ["exact", "sole_consumer", null, undefined, ""]) {
      expect(isUnresolvedAttribution(v as string | null | undefined)).toBe(false)
    }
  })
})
