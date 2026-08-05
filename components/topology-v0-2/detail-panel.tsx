"use client"

import { ResourceDossier } from "@/components/inventory/resource-dossier"
import type { TopologyNode } from "./types"

interface Props {
  node: TopologyNode | null
  systemName: string
  vpcId?: string | null
  accountId?: string | null
  region?: string | null
  onClose: () => void
}

/** The map and Inventory intentionally open the same canonical dossier. */
export function DetailPanel({
  node,
  systemName,
  vpcId,
  accountId,
  region,
  onClose,
}: Props) {
  if (!node) return null
  return (
    <ResourceDossier
      resourceId={node.id}
      resourceName={node.name}
      resourceType={node.type}
      systemName={systemName}
      vpcId={vpcId ?? node.vpc_id}
      accountId={accountId ?? node.account_id}
      region={region ?? node.region}
      onClose={onClose}
    />
  )
}
