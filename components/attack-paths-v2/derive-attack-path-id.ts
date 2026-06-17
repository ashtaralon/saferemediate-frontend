// Derive the materialized Neo4j :AttackPath id from identity-path nodes.
// Matches saferemediate-backend phase3: sha256(workload|role|cj_arn).

import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"

const WORKLOAD_TYPES = new Set([
  "EC2Instance",
  "EC2",
  "LambdaFunction",
  "Lambda",
  "ECSService",
])

export function buildAttackPathIdBlob(
  nodes: PathNodeDetail[],
  jewelId: string,
): string | null {
  let workloadArn = ""
  let roleArn = ""
  for (const n of nodes) {
    const t = String(n.type ?? "")
    const nodeId = String(n.arn ?? n.id ?? "")
    if (WORKLOAD_TYPES.has(t) && !workloadArn) {
      workloadArn = nodeId
    } else if (t === "IAMRole" && !roleArn && nodeId.startsWith("arn:")) {
      roleArn = nodeId
    }
  }
  if (!roleArn) return null
  const cjArn = jewelId.startsWith("arn:") ? jewelId : `arn:aws:s3:::${jewelId}`
  return `${workloadArn}|${roleArn}|${cjArn}`
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const data = new TextEncoder().encode(text)
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data)
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
  }
  const { createHash } = await import("node:crypto")
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export async function deriveAttackPathId(
  nodes: PathNodeDetail[],
  jewelId: string,
): Promise<string | null> {
  const blob = buildAttackPathIdBlob(nodes, jewelId)
  if (!blob) return null
  return sha256Hex(blob)
}

/** Prefer backend field; derive client-side when prod hasn't shipped attack_path_id yet. */
export async function resolveClosurePathId(
  path: Pick<IdentityAttackPath, "id" | "attack_path_id" | "nodes" | "crown_jewel_id"> & {
    materialized_path?: { id?: string | null } | null
  },
): Promise<string> {
  const fromMaterialized = path.materialized_path?.id
  if (fromMaterialized) return fromMaterialized
  if (path.attack_path_id) return path.attack_path_id
  const derived = await deriveAttackPathId(path.nodes, path.crown_jewel_id)
  return derived ?? path.id
}
