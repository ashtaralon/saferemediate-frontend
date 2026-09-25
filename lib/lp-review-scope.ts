/**
 * The scope a clicked role's Review is requested under.
 *
 * The operator's selected customer, plus the account the ROLE ROW itself
 * carries (its account_id or ARN), even when the global account filter is
 * "All": each clicked resource is scoped on its own, never by silently
 * substituting the deployment's account. The backend validates both claims
 * against its server-owned binding and answers 403 on a mismatch. A row with no
 * trustworthy account is refused here, typed, and no request is made.
 */
import { resourceAccountId } from "@/lib/account-scope"

export const ROLE_ACCOUNT_UNKNOWN = "REVIEW_ROLE_ACCOUNT_UNKNOWN"

export type ReviewScope =
  | { ok: true; query: string; cacheKey: string }
  | { ok: false; code: typeof ROLE_ACCOUNT_UNKNOWN; message: string }

export function reviewScopeFor(
  resource: Record<string, unknown> | null | undefined,
  customerId: string | null | undefined,
  roleName: string,
): ReviewScope {
  const account = resource ? resourceAccountId(resource) : null
  if (!account) {
    return {
      ok: false,
      code: ROLE_ACCOUNT_UNKNOWN,
      message:
        "This role's account is not known, so its Review is not requested. " +
        "Nothing is shown in its place.",
    }
  }
  const params = new URLSearchParams()
  const customer = typeof customerId === "string" ? customerId.trim() : ""
  if (customer) params.set("customer_id", customer)
  params.set("account_id", account)
  return { ok: true, query: `&${params.toString()}`, cacheKey: `${customer}|${account}|${roleName}` }
}
