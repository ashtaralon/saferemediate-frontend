import type { Discovery } from "@/lib/account-onboarding"

export interface ScopeSelection {
  organizationalUnitIds: string[]
  accountIds: string[]
  excludedAccountIds: string[]
}

export interface ScopePreview {
  active: string[]
  suspended: string[]
  notDiscovered: string[]
}

/**
 * Preview of `resolve_organization_scope` in services/account_onboarding_worker.py:
 * accounts under a selected OU (at any depth) plus explicitly selected accounts,
 * minus exclusions, split into ACTIVE and not-ACTIVE. Display only; the worker
 * resolves the scope again from the stored discovery.
 */
export function previewScope(discovery: Discovery, selection: ScopeSelection): ScopePreview {
  const accounts = new Map(discovery.accounts.map((account) => [account.account_id, account]))
  const parents = new Map(discovery.organizational_units.map((unit) => [unit.organizational_unit_id, unit.parent_id]))
  const selectedUnits = new Set(selection.organizationalUnitIds)

  const underSelected = (parentId: string): boolean => {
    const seen = new Set<string>()
    let node = parentId
    while (node && !seen.has(node)) {
      if (selectedUnits.has(node)) return true
      seen.add(node)
      node = parents.get(node) || ""
    }
    return false
  }

  const candidates = new Set<string>()
  if (selectedUnits.size) {
    for (const account of discovery.accounts) if (underSelected(account.parent_id)) candidates.add(account.account_id)
  }
  const explicit = new Set(selection.accountIds)
  const notDiscovered = [...explicit].filter((id) => !accounts.has(id)).sort()
  explicit.forEach((id) => { if (accounts.has(id)) candidates.add(id) })
  selection.excludedAccountIds.forEach((id) => candidates.delete(id))
  const suspended = [...candidates].filter((id) => accounts.get(id)?.status !== "ACTIVE").sort()
  const active = [...candidates].filter((id) => accounts.get(id)?.status === "ACTIVE").sort()
  return { active, suspended, notDiscovered }
}

export interface OrganizationTreeNode {
  id: string
  name: string
  kind: "root" | "unit"
  children: OrganizationTreeNode[]
  accounts: Discovery["accounts"]
}

export function organizationTree(discovery: Discovery): OrganizationTreeNode[] {
  const units = new Map<string, OrganizationTreeNode>()
  for (const unit of discovery.organizational_units) {
    units.set(unit.organizational_unit_id, { id: unit.organizational_unit_id, name: unit.name || unit.organizational_unit_id, kind: "unit", children: [], accounts: [] })
  }
  const roots = new Map<string, OrganizationTreeNode>()
  const nodeFor = (id: string): OrganizationTreeNode => {
    const unit = units.get(id)
    if (unit) return unit
    if (!roots.has(id)) roots.set(id, { id, name: "Root", kind: "root", children: [], accounts: [] })
    return roots.get(id)!
  }
  for (const unit of discovery.organizational_units) nodeFor(unit.parent_id).children.push(units.get(unit.organizational_unit_id)!)
  for (const account of discovery.accounts) nodeFor(account.parent_id).accounts.push(account)
  const sort = (node: OrganizationTreeNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name))
    node.accounts.sort((a, b) => a.name.localeCompare(b.name) || a.account_id.localeCompare(b.account_id))
    node.children.forEach(sort)
  }
  const result = [...roots.values()]
  result.forEach(sort)
  return result
}
