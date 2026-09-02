/**
 * Shared-prefix elision for chip labels.
 *
 * Resources of one system share a long naming prefix ("cyntro-tb-prod-…"),
 * and a chip truncates from the END, so six Lambdas read as six copies of
 * "cyntro-tb-prod-c…" (C1 production QA, 2026-09-02). When at least three
 * names in a lane share a prefix, the chips drop it — "…consumer-a" — and the
 * lane header states the prefix once. The full name stays in the chip title.
 *
 * The prefix is cut at a separator so it never splits a word, and it is
 * backed off until every name keeps at least `minRemainder` characters: for
 * "…-a" / "…-b" / "…-c" the prefix stops one token earlier and the chips read
 * "…prod-a". Fewer than `minNames` names, no shared separator-bounded prefix
 * of `minPrefix` characters, or a name that would be left empty: no elision.
 */

export interface ElidedNames {
  /** The prefix the labels omit; "" when nothing was elided. */
  prefix: string
  /** One label per input name, in input order. */
  labels: string[]
}

const SEPARATOR = /[-_./:]/

function longestCommonPrefix(names: string[]): string {
  let lcp = names[0] ?? ""
  for (const name of names.slice(1)) {
    let i = 0
    while (i < lcp.length && i < name.length && lcp[i] === name[i]) i += 1
    lcp = lcp.slice(0, i)
    if (!lcp) break
  }
  return lcp
}

/** Longest separator-bounded prefix shared by every name, per the rules above. */
export function sharedNamePrefix(
  names: readonly string[],
  { minNames = 3, minPrefix = 6, minRemainder = 6 }: { minNames?: number; minPrefix?: number; minRemainder?: number } = {},
): string {
  const list = names.filter((name): name is string => typeof name === "string" && name.length > 0)
  if (list.length < minNames) return ""
  const lcp = longestCommonPrefix(list)
  // Candidate cuts: right after each separator inside the common prefix,
  // longest first.
  const cuts: number[] = []
  for (let i = 0; i < lcp.length; i += 1) if (SEPARATOR.test(lcp[i])) cuts.push(i + 1)
  for (const cut of cuts.reverse()) {
    if (cut < minPrefix) break
    if (list.every(name => name.length - cut >= minRemainder)) return lcp.slice(0, cut)
  }
  return ""
}

/** Labels with the shared prefix replaced by an ellipsis. */
export function elideSharedPrefix(names: readonly string[], options?: Parameters<typeof sharedNamePrefix>[1]): ElidedNames {
  const prefix = sharedNamePrefix(names, options)
  if (!prefix) return { prefix: "", labels: [...names] }
  return {
    prefix,
    labels: names.map(name => (name.startsWith(prefix) ? `…${name.slice(prefix.length)}` : name)),
  }
}
