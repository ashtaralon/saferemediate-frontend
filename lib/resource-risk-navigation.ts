/** Cross-tab navigation into Resource Risk (LeastPrivilegeTab). */

export type ResourceRiskOpenDetail = {
  resourceName: string
  resourceType: "IAMRole" | "IAMUser" | "S3Bucket" | "SecurityGroup"
}

export const RESOURCE_RISK_OPEN_EVENT = "cyntro:resource-risk:open"
export const NAVIGATE_TAB_EVENT = "cyntro:navigate-tab"

export function openResourceRisk(detail: ResourceRiskOpenDetail): void {
  window.dispatchEvent(new CustomEvent(NAVIGATE_TAB_EVENT, { detail: { tabId: "least-privilege" } }))
  window.dispatchEvent(new CustomEvent(RESOURCE_RISK_OPEN_EVENT, { detail }))
}
