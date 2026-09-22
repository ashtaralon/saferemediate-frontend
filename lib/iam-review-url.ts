import { withAccountScope, type ProductScope } from "@/lib/account-scope"

/**
 * The one place the IAM Review gap-analysis URL is built.
 *
 * There are two reads of this endpoint in the permission modal -- the one the
 * panel opens with, and the cache-clear after a remediation lands. Both used to
 * spell the URL out inline, and both omitted the operator's scope, so the
 * backend was asked to resolve the role without being told which account. A
 * role id is not unique across accounts, so that is a cross-tenant read.
 *
 * Keeping the spelling in one function is what makes the property testable:
 * the caller supplies a scope and this decides what travels, so a new call site
 * inherits the rule instead of re-deciding it.
 */

/** Everything the backend resolves the role inside. */
export type ReviewScope = Pick<ProductScope, "customerId" | "groupId" | "accountId" | "region">

/**
 * The two call sites' existing cache-bust spellings, kept verbatim.
 *
 * Neither is a parameter the backend declares -- it takes days, envelope,
 * customer_id, account_id and region -- and the proxy's allowlist does not
 * forward either, so neither reaches it. They differentiate the URL for
 * anything caching in between, which is the whole point of the second read, so
 * they are preserved rather than unified on a guess about what is safe to drop.
 */
export type GapAnalysisCacheBust = "refresh" | "force_refresh"

export function buildIamGapAnalysisUrl(
  roleName: string,
  scope: ReviewScope,
  options: { days?: number; cacheBust?: GapAnalysisCacheBust } = {},
): string {
  const days = options.days ?? 365
  const base = `/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=${days}`
  const withBust = options.cacheBust ? `${base}&${options.cacheBust}=true` : base
  // `withAccountScope` omits a narrowing that is still "all" rather than
  // sending a placeholder the backend would have to interpret, and is the same
  // helper LeastPrivilegeTab uses for its proxy reads.
  return withAccountScope(withBust, scope)
}
