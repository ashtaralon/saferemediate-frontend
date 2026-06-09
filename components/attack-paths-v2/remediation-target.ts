import type {
  PathNodeDetail,
  RiskReductionAction,
} from "@/components/identity-attack-paths/types"

export type ModalTarget =
  | { kind: "iam"; roleName: string }
  | { kind: "sg"; sgId: string; sgName: string }
  | { kind: "s3"; bucketName: string }
  | { kind: "none"; reason: string }

export function resolveModalTarget(
  action: RiskReductionAction,
  pathNodes: PathNodeDetail[],
): ModalTarget {
  const matchingNode = pathNodes.find(
    (n) => n.name === action.node_name && n.type === action.node_type,
  )
  if (!matchingNode) {
    const role = pathNodes.find((n) => n.type === "IAMRole")
    if (action.plane === "iam" && role) {
      return { kind: "iam", roleName: role.name }
    }
    return { kind: "none", reason: "Target node not found on this path" }
  }
  const t = (matchingNode.type || "").toLowerCase()
  if (t === "iamrole") return { kind: "iam", roleName: matchingNode.name }
  if (t === "securitygroup") {
    return { kind: "sg", sgId: matchingNode.id, sgName: matchingNode.name }
  }
  if (t === "s3bucket") {
    const bucketName = matchingNode.name.includes(":::")
      ? matchingNode.name.split(":::")[1]
      : matchingNode.name
    return { kind: "s3", bucketName }
  }
  return { kind: "none", reason: `No remediation modal for ${matchingNode.type} yet` }
}

export function resolveIamRoleFromPath(pathNodes: PathNodeDetail[]): string | null {
  return pathNodes.find((n) => n.type === "IAMRole")?.name ?? null
}
