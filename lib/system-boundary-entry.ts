/**
 * The way into system authoring from outside an account page (D2/D4/D17). A system is created only by the System Boundary
 * wizard on an account's inventory (components/system-boundary/declare-from-inventory.tsx, saving through
 * lib/system-boundary-authoring.ts); everything here only LEADS there. Pure: no React, no fetch, nothing saved.
 *
 * - ``declareFlowHref``: the account page's Inventory tab with the declare flow asked for (``?declare=1``). The wizard
 *   honours the flag only where its own checks pass; otherwise it says why, as it does without the flag.
 * - ``accountsInScope``: the served accounts the current product scope covers, narrowed the way the scope bar narrows
 *   them (group, then account, then Region). The scope options name only data accounts (the control plane's own account
 *   is never one), so every account listed here is one the wizard can be opened for.
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

/**
 * The served accounts in the current scope. Unknown options (still loading, or unreadable) are none: the caller says
 * why rather than offering an account it cannot vouch for.
 */
export function accountsInScope(
  scope: Pick<ProductScope, "groupId" | "accountId" | "region"> & { options: AccountScopeOptions | null },
): AccountScopeOption[] {
  const all = Array.isArray(scope.options?.accounts) ? scope.options.accounts : []
  const inGroup = scope.groupId === "all" ? all : all.filter((account) => account.group_ids.includes(scope.groupId))
  if (scope.accountId !== "all") return inGroup.filter((account) => account.account_id === scope.accountId)
  if (scope.region !== "all") return inGroup.filter((account) => account.regions.includes(scope.region))
  return inGroup
}
