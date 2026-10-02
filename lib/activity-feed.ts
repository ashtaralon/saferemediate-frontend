/**
 * The merged activity feed (/api/proxy/recent-activity): remediation events,
 * snapshots and rollbacks, each fetched independently. The proxy answers 200
 * with `errors[]` naming every source that failed, and stamps `stale: true`
 * when it replays an older feed because the live sources failed.
 */
export type ActivityFeedEnvelope = {
  items?: unknown[]
  total?: number
  errors?: string[]
  /** Set by the proxy when this is an older feed replayed over a failed read. */
  stale?: boolean
}

/**
 * Whether this feed may say what it does NOT contain ("0 events", "no
 * remediations recorded", "engine idle"): only when every source answered
 * and it is not a replay. A feed with source errors lists what it read and
 * claims nothing about the rest; one with no items and errors read nothing.
 */
export function activityFeedIsComplete(feed: ActivityFeedEnvelope | null | undefined): boolean {
  // The envelope the proxy builds: an items list and an errors list. Anything
  // else (`{}`, a typed error body, a malformed answer) is no reading.
  if (!feed || !Array.isArray(feed.items) || !Array.isArray(feed.errors)) return false
  return feed.errors.length === 0 && feed.stale !== true
}
