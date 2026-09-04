/**
 * AP3-103 — how a path's observed IAM actions were established.
 *
 * The backend records the access evidence for a bucket against the ROLE, not
 * the workload. Where several workloads share a role and nothing resolves
 * which one acted, the path carries no observed actions and says so. An empty
 * list must never be rendered as "we looked and found no use": that reads as
 * a quiet all-clear on exactly the path we know least about.
 */

export type ObservedAttribution = "sole_consumer" | "exact" | "unresolved"

export type ObservedActionsLine = {
  text: string
  /** Matches the confidence vocabulary the path card already renders. */
  confidence: "Observed" | "Configured" | "Unknown"
}

export function isUnresolvedAttribution(
  attribution: string | null | undefined,
): boolean {
  return attribution === "unresolved"
}

/**
 * The IAM line for a path whose own activity could not be attributed.
 *
 * Returns null when attribution is not the reason the list is empty, so the
 * caller keeps its existing behaviour for every other path.
 */
export function describeUnattributedActions(args: {
  attribution: string | null | undefined
  observedActions: readonly string[]
  roleObservedActions: readonly string[] | null | undefined
  roleName: string | null | undefined
}): ObservedActionsLine | null {
  const { attribution, observedActions, roleObservedActions, roleName } = args
  if (!isUnresolvedAttribution(attribution)) return null
  if (observedActions.length > 0) return null

  const role = roleName ? `\`${roleName}\`` : "the shared role"
  const onRole = roleObservedActions?.length ?? 0
  if (onRole === 0) {
    return {
      text: `Activity on ${role} cannot be attributed to this workload.`,
      confidence: "Unknown",
    }
  }
  const count = `${onRole} action${onRole === 1 ? "" : "s"}`
  return {
    text:
      `${count} observed on ${role}, shared with other workloads. ` +
      "Nothing in the evidence says whether this one performed them.",
    confidence: "Unknown",
  }
}
