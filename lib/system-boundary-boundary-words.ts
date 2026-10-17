/**
 * (PC1 S0-F) The Resource-boundaries step in the plan's words -- owned, used, shared, unresolved -- over the server's four
 * lists, never a classification of the browser's own:
 *
 * - Owned = ``members``; Used = ``dependencies``; Unresolved = ``held``; every ``not_members`` row is "not part of this system".
 * - Shared is the server's count only: ``not_member_reasons`` (backend PC1 S0-F) counts every not-member row before the list is
 *   capped, in a CLOSED set of classes. SHARED_FOUNDATION and SHARED_CLUSTER are the A7 outcomes "a member of no single system,
 *   by design". A browser never derives that number from a list it may only partly hold.
 * - An answer without the field (a backend or a stored result from before it) says "not reported", never 0. A field that is
 *   present but not exactly the closed set, or whose classes do not add up to the not-member count, is malformed: the whole
 *   answer is then not read, as with any list and count that disagree.
 */

export const NOT_MEMBER_CLASSES = ["SHARED_FOUNDATION", "SHARED_CLUSTER", "EXCLUDED_BY_DECISION", "OTHER"] as const
export type NotMemberClass = (typeof NOT_MEMBER_CLASSES)[number]
export type NotMemberReasons = Record<NotMemberClass, number>

/** The four server lists, in the plan's words. */
export const BOUNDARY_TITLES = {
  members: "Owned -- part of this system",
  dependencies: "Used -- by this system, not part of it",
  held: "Unresolved -- waiting on a person or on a source",
  not_members: "Not part of this system (shared resources among them)",
} as const

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

/** The field read exactly: null when it is absent or null (not reported); undefined when it is malformed. */
export function readNotMemberReasons(value: unknown, notMembers: number): NotMemberReasons | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== NOT_MEMBER_CLASSES.length || !NOT_MEMBER_CLASSES.every((k) => isCount(record[k]))) return undefined
  const total = NOT_MEMBER_CLASSES.reduce((sum, k) => sum + (record[k] as number), 0)
  return total === notMembers ? (record as NotMemberReasons) : undefined
}

/** How many resources are shared, by the server's count; null when the answer did not report it. */
export function sharedCount(reasons: NotMemberReasons | null): number | null {
  return reasons === null ? null : reasons.SHARED_FOUNDATION + reasons.SHARED_CLUSTER
}

/** The Shared line, in words: the count and its two kinds, or that this answer does not report it. */
export function sharedSentence(reasons: NotMemberReasons | null): string {
  if (reasons === null) return "Shared: not reported by this backend, so the shared resources are not counted apart here."
  const shared = sharedCount(reasons) as number
  const excluded = reasons.EXCLUDED_BY_DECISION
  return `Shared: ${shared} -- ${reasons.SHARED_FOUNDATION} shared foundation, ${reasons.SHARED_CLUSTER} shared cluster: `
    + "by design a member of no single system."
    + (excluded ? ` ${excluded} excluded by a person's decision.` : "")
}

/** One line over the four lists: owned, used, unresolved, and not part of the system -- with how many of those are shared. */
export function boundarySummary(counts: { members: number; stale_members: number; dependencies: number; held: number;
                                          not_members: number }, reasons: NotMemberReasons | null): string {
  const shared = sharedCount(reasons)
  const owned = `${counts.members} owned${counts.stale_members ? ` (${counts.stale_members} last seen)` : ""}`
  return `${owned}, ${counts.dependencies} used, ${counts.held} unresolved, ${counts.not_members} not part of this system `
    + `(${shared === null ? "shared not reported" : `${shared} of them shared`})`
}
