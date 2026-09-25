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

/**
 * The claims the shared Review modal sends for one role.
 *
 * The modal is opened from many surfaces, some of which know only a role name,
 * so it does not refuse an ARN-less role the way the LP tab refuses an
 * account-less row. It sends every claim it can prove: the selected customer,
 * and the account parsed from the role's own ARN. The backend validates each
 * against its server-owned binding (403 on a mismatch) and never widens scope
 * for a missing claim, so omitting the account can only read the deployment's
 * own verified account, never another tenant's.
 */
export function reviewClaimsQuery(
  roleArn: string | null | undefined,
  customerId: string | null | undefined,
): string {
  const params = new URLSearchParams()
  const customer = typeof customerId === "string" ? customerId.trim() : ""
  if (customer) params.set("customer_id", customer)
  const account = typeof roleArn === "string" ? resourceAccountId({ arn: roleArn }) : null
  if (account) params.set("account_id", account)
  const query = params.toString()
  return query ? `&${query}` : ""
}
