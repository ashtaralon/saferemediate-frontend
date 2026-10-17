/**
 * The way into system authoring from outside an account page (D2/D4/D17). A system is created only by the System Boundary
 * wizard on an account's inventory (components/system-boundary/declare-from-inventory.tsx, saving through
 * lib/system-boundary-authoring.ts); everything here only LEADS there. Pure: no React, no fetch, nothing saved.
 *
 * - ``declareFlowHref``: the account page's Inventory tab with the declare flow asked for (``?declare=1``). The wizard
 *   honours the flag only where its own checks pass; otherwise it says why, as it does without the flag.
 * - ``addSystemTargets``: the served accounts the CURRENT product scope covers, narrowed the way the scope bar narrows
 *   them (group, then account, then Region) -- or why none can be offered. The scope options name only data accounts (the
 *   control plane's own account is never one), so every account offered is one the wizard can be opened for. The provider
 *   KEEPS its previous options while a reload is in flight and after one fails, and a customer switch names the new
 *   customer before its options arrive: options are trusted only for a resolved, settled scope whose options name that
 *   same customer, so a stale list (another customer's accounts among them) is never offered.
 */
import type { AccountScopeOption, AccountScopeOptions, ProductScope } from "@/lib/account-scope"

/** The query flag the account inventory page reads to open its declare flow on load. */
export const DECLARE_FLOW_PARAM = "declare"

/** /accounts/{accountId}?tab=inventory&declare=1 -- the account's inventory, declare flow asked for. */
export function declareFlowHref(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}?tab=inventory&${DECLARE_FLOW_PARAM}=1`
}

/** Whether these search params ask for the declare flow. A missing reader (no router) asks for nothing. */
export function wantsDeclareFlow(params: { get(name: string): string | null } | null | undefined): boolean {
  return params?.get(DECLARE_FLOW_PARAM) === "1"
}

export type AddSystemTargets =
  | { kind: "accounts"; accounts: AccountScopeOption[] }
  | { kind: "unavailable"; reason: string }

export const SCOPE_LOADING = "Loading the accounts in scope…"
export const SCOPE_UNREADABLE = "The accounts in scope could not be read, so no account can be opened to declare a system."
export const SCOPE_NO_CUSTOMER = "No organization is selected, so no account can be opened to declare a system."
export const SCOPE_NOT_CURRENT =
  "The accounts of the selected organization have not been read yet, so no account can be opened to declare a system."
export const SCOPE_NO_ACCOUNT = "No AWS account is in the selected scope. Systems are declared from an account's inventory."

/**
 * The accounts "Add System" may offer, or why it offers none. Gated BEFORE any account is derived: a resolved current
 * customer, a settled scope (not loading, no error), and options naming that customer.
 */
export function addSystemTargets(
  scope: Pick<ProductScope, "customerId" | "groupId" | "accountId" | "region"> & {
    options: AccountScopeOptions | null
    loading: boolean
    error: string | null
  },
): AddSystemTargets {
  if (scope.loading) return { kind: "unavailable", reason: SCOPE_LOADING }
  if (scope.error) return { kind: "unavailable", reason: SCOPE_UNREADABLE }
  if (!scope.customerId) return { kind: "unavailable", reason: SCOPE_NO_CUSTOMER }
  const options = scope.options
  if (!options || !Array.isArray(options.accounts)) return { kind: "unavailable", reason: SCOPE_UNREADABLE }
  if (options.customer_id !== scope.customerId) return { kind: "unavailable", reason: SCOPE_NOT_CURRENT }
  const inGroup = scope.groupId === "all"
    ? options.accounts
    : options.accounts.filter((account) => account.group_ids.includes(scope.groupId))
  const accounts = scope.accountId !== "all"
    ? inGroup.filter((account) => account.account_id === scope.accountId)
    : scope.region !== "all"
      ? inGroup.filter((account) => account.regions.includes(scope.region))
      : inGroup
  return accounts.length > 0 ? { kind: "accounts", accounts } : { kind: "unavailable", reason: SCOPE_NO_ACCOUNT }
}
