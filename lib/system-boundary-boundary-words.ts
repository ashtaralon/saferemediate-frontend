/**
 * (PC1 S0-F) The Resource-boundaries step in the plan's words -- owned, used, shared, unresolved -- over the server's four
 * lists, never a classification of the browser's own:
 *
 * - Owned = ``members``; Used = ``dependencies``; Unresolved = ``held``; every ``not_members`` row is "not part of this system".
 * - Shared is the server's count only: ``not_member_reasons`` (backend PC1 S0-F) counts every not-member row before the list is
 *   capped, in a CLOSED set of classes. SHARED_FOUNDATION and SHARED_CLUSTER are the A7 outcomes "a member of no single system,
 *   by design". A browser never derives that number from a list it may only partly hold.
 * - (PC1 S0-F2, review CC-002) The field is read into one of three states. Absent or null (a backend or a stored result from
 *   before it): NOT_REPORTED, never 0. Present and exactly the closed set adding up to the not-member count: REPORTED.
 *   Anything else -- a missing or extra class, a non-count, or classes that do not add up -- is INCONSISTENT: no shared number
 *   is shown (neither the map's nor one worked out from the list), and the rest of the answer still is.
 */

export const NOT_MEMBER_CLASSES = ["SHARED_FOUNDATION", "SHARED_CLUSTER", "EXCLUDED_BY_DECISION", "OTHER"] as const
export type NotMemberClass = (typeof NOT_MEMBER_CLASSES)[number]
export type NotMemberReasons = Record<NotMemberClass, number>

/** What an answer says about its not-member classes. */
export type SharedRead =
  | { state: "reported"; reasons: NotMemberReasons }
  | { state: "not_reported" }
  | { state: "inconsistent" }

/** The four server lists, in the plan's words. */
export const BOUNDARY_TITLES = {
  members: "Owned -- part of this system",
  dependencies: "Used -- by this system, not part of it",
  held: "Unresolved -- waiting on a person or on a source",
  not_members: "Not part of this system (shared resources among them)",
} as const

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

/** The field read into one of three states (see the module comment). Never throws, never refuses the answer it is in. */
export function readShared(value: unknown, notMembers: number): SharedRead {
  if (value === undefined || value === null) return { state: "not_reported" }
  if (typeof value !== "object" || Array.isArray(value)) return { state: "inconsistent" }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== NOT_MEMBER_CLASSES.length || !NOT_MEMBER_CLASSES.every((k) => isCount(record[k]))) {
    return { state: "inconsistent" }
  }
  const total = NOT_MEMBER_CLASSES.reduce((sum, k) => sum + (record[k] as number), 0)
  return total === notMembers ? { state: "reported", reasons: record as NotMemberReasons } : { state: "inconsistent" }
}

/** How many resources are shared, by the server's count; null unless the answer reported a consistent count. */
export function sharedCount(read: SharedRead): number | null {
  return read.state === "reported" ? read.reasons.SHARED_FOUNDATION + read.reasons.SHARED_CLUSTER : null
}

/** The Shared line, in words. */
export function sharedSentence(read: SharedRead): string {
  if (read.state === "not_reported") {
    return "Shared: not reported by this backend, so the shared resources are not counted apart here."
  }
  if (read.state === "inconsistent") {
    return "Shared: not shown -- this answer's counts of why resources are not part of the system do not add up to its "
      + "not-member count, so no shared number is given."
  }
  const { reasons } = read
  const excluded = reasons.EXCLUDED_BY_DECISION
  return `Shared: ${sharedCount(read)} -- ${reasons.SHARED_FOUNDATION} shared foundation, ${reasons.SHARED_CLUSTER} shared cluster: `
    + "by design a member of no single system."
    + (excluded ? ` ${excluded} excluded by a person's decision.` : "")
}

/** One line over the four lists: owned, used, unresolved, and not part of the system -- with how many of those are shared. */
export function boundarySummary(counts: { members: number; stale_members: number; dependencies: number; held: number;
                                          not_members: number }, read: SharedRead): string {
  const owned = `${counts.members} owned${counts.stale_members ? ` (${counts.stale_members} last seen)` : ""}`
  const shared = read.state === "reported" ? `${sharedCount(read)} of them shared`
    : read.state === "not_reported" ? "shared not reported" : "shared not shown: its counts do not add up"
  return `${owned}, ${counts.dependencies} used, ${counts.held} unresolved, ${counts.not_members} not part of this system (${shared})`
}
