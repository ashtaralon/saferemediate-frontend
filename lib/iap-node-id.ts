/**
 * Prefer backend canonical_id (ARN) when sending node ids to canvas /
 * graph-view / attack-chain endpoints. Legacy `id` stays for React keys
 * and local lookups.
 */
export type IapNodeIdSource = {
  id: string
  canonical_id?: string | null
}

export function backendNodeId(node: IapNodeIdSource): string {
  const cid = node.canonical_id
  if (typeof cid === "string" && cid.length > 0) return cid
  return node.id
}
