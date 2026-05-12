/**
 * Pure helpers exported here so the regression tests exercise the SAME
 * detection / classification logic as the production renderers. Drift
 * between the test fixtures and the live code (e.g., someone tweaks
 * the IP-detection regex in attack-path-flow-viz.tsx but forgets the
 * traffic-flow-map.tsx copy) is exactly the kind of bug this contract
 * exists to prevent. Keep this file as the single source.
 */

type LooseNode = {
  id: string
  name?: string
  type?: string
  tier?: string
  lane?: string
}

export function isInstanceProfileNode(node: { id: string }): boolean {
  // Match by ARN segment first (most precise) then fall back to a
  // case-insensitive "instanceprofile" keyword check for nodes whose
  // ids are not full ARNs.
  if (!node?.id) return false
  if (node.id.includes(":instance-profile/")) return true
  return /instance.?profile/i.test(node.id)
}

export type ModalKind = "iam" | "instance_profile" | "s3" | "sg" | null

export function classifyNodeForModal(node: LooseNode): ModalKind {
  const type = (node.type ?? "").toLowerCase()
  const lane = (node.lane ?? "").toLowerCase()
  if (type.includes("s3") || type.includes("bucket") || lane === "crown_jewel") {
    if (type.includes("s3") || type.includes("bucket")) return "s3"
  }
  if (type.includes("security") || type.includes("sg") || lane === "security_group") return "sg"
  if (type.includes("instanceprofile") || type === "instance_profile") return "instance_profile"
  if (type.includes("iam") || type.includes("role") || node.tier === "identity") return "iam"
  return null
}
