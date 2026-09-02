/**
 * Shared-prefix elision for chip labels.
 *
 * Resources of one system share a long naming prefix ("cyntro-tb-prod-…"),
 * and a chip truncates from the END, so six Lambdas read as six copies of
 * "cyntro-tb-prod-c…" (C1 production QA, 2026-09-02). Chips drop the prefix —
 * "…consumer-a" — and the lane header states it once. The full name stays in
 * the chip title.
 *
 * The prefix is the longest separator-bounded one that at least `minNames` of
 * the lane's names share, NOT the one they all share: a single outlier
 * ("aws-sam-cli-…" beside nine "cyntro-tb-prod-…") otherwise collapses the
 * prefix to "cyntro-" and leaves every chip reading the same truncated text
 * (C1, 2026-09-02). Names outside that family keep their own text, so nothing
 * is ever mislabelled — only the family's members are shortened.
 *
 * The cut is at a separator so it never splits a word, and it is backed off
 * until every member keeps at least `minRemainder` characters, so
 * "…consumer-a" / "…consumer-b" never become "…a" / "…b" while a short whole
 * token ("…cart", "…logs") stands.
 */

export interface ElidedNames {
  /** The prefix the labels omit; "" when nothing was elided. */
  prefix: string
  /** One label per input name, in input order; names outside the family are unchanged. */
  labels: string[]
  /** How many names carry the prefix (0 when nothing was elided). */
  count: number
}

const SEPARATOR = /[-_./:]/

/** Every separator-bounded prefix of a name, longest first. */
function prefixCandidates(name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < name.length; i += 1) {
    if (SEPARATOR.test(name[i])) out.push(name.slice(0, i + 1))
  }
  return out.reverse()
}

/**
 * Longest separator-bounded prefix shared by at least `minNames` of the names,
 * where every name carrying it keeps `minRemainder` characters.
 */
export function sharedNamePrefix(
  names: readonly string[],
  { minNames = 3, minPrefix = 6, minRemainder = 3 }: { minNames?: number; minPrefix?: number; minRemainder?: number } = {},
): string {
  const list = names.filter((name): name is string => typeof name === "string" && name.length > 0)
  if (list.length < minNames) return ""
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const name of list) {
    for (const candidate of prefixCandidates(name)) {
      if (candidate.length < minPrefix || seen.has(candidate)) continue
      seen.add(candidate)
      candidates.push(candidate)
    }
  }
  // Longest first: the most specific family that still has enough members.
  candidates.sort((a, b) => b.length - a.length)
  for (const candidate of candidates) {
    const members = list.filter(name => name.startsWith(candidate))
    if (members.length < minNames) continue
    if (members.some(name => name.length - candidate.length < minRemainder)) continue
    return candidate
  }
  return ""
}

/** Labels with the shared prefix replaced by an ellipsis; other names untouched. */
export function elideSharedPrefix(names: readonly string[], options?: Parameters<typeof sharedNamePrefix>[1]): ElidedNames {
  const prefix = sharedNamePrefix(names, options)
  if (!prefix) return { prefix: "", labels: [...names], count: 0 }
  let count = 0
  const labels = names.map(name => {
    if (typeof name === "string" && name.startsWith(prefix)) {
      count += 1
      return `…${name.slice(prefix.length)}`
    }
    return name
  })
  return { prefix, labels, count }
}
