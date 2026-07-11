/**
 * Estate Map ownership tooltip helpers — answer "whose is this?" on hover.
 */
import type { SubnetMeta } from "@/components/topology-v0-2/types"

/**
 * Hover ownership line for subnet cells. Prefer foreign callout; otherwise
 * name the owner when the BE stamped one.
 */
export function subnetOwnershipTooltipLine(
  subnets: Array<Pick<SubnetMeta, "owner_system_name" | "is_foreign">>,
): string | null {
  if (subnets.length === 0) return null
  const foreignOwners = [
    ...new Set(
      subnets
        .filter(s => s.is_foreign === true && s.owner_system_name)
        .map(s => s.owner_system_name as string),
    ),
  ]
  if (foreignOwners.length === 1) {
    return `Shared neighbor · owned by ${foreignOwners[0]}`
  }
  if (foreignOwners.length > 1) {
    return `Shared neighbors · owned by ${foreignOwners.join(", ")}`
  }
  const ownOwners = [
    ...new Set(
      subnets
        .map(s => s.owner_system_name)
        .filter((x): x is string => Boolean(x)),
    ),
  ]
  if (ownOwners.length === 1) return `Owner: ${ownOwners[0]}`
  if (ownOwners.length > 1) return `Owners: ${ownOwners.join(", ")}`
  return null
}
