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

const SHA256_HEX = /^[a-f0-9]{64}$/i

export function isSha256HexId(id: string | null | undefined): boolean {
  return Boolean(id && SHA256_HEX.test(id))
}

type PathIdSource = Pick<
  IdentityAttackPath,
  "id" | "attack_path_id" | "nodes" | "crown_jewel_id" | "materialized"
> & {
  materialized_path?: { id?: string | null } | null
}

/**
 * Ordered candidates for Neo4j :AttackPath lookups (report / closure-preview).
 *
 * IAP-synthesized rows often carry an `attack_path_id` that is NOT a graph
 * node id — `/report` 404s. Prefer materialized / URL hex ids, then derive,
 * and only then fall back to the IAP hash so callers can try-next-on-404.
 */
export async function resolveReportPathIds(path: PathIdSource): Promise<string[]> {
  const out: string[] = []
  const push = (id: string | null | undefined) => {
    const v = (id ?? "").trim()
    if (!v || out.includes(v)) return
    out.push(v)
  }

  push(path.materialized_path?.id ?? null)

  // Deep-link / list id that is already a mat sha256.
  if (isSha256HexId(path.id)) push(path.id)

  // path-mat-* rows: attack_path_id is the mat id and report accepts it.
  const matBacked =
    path.materialized === true ||
    Boolean(path.materialized_path?.id) ||
    path.id.startsWith("path-mat-")
  if (matBacked && isSha256HexId(path.attack_path_id)) {
    push(path.attack_path_id)
  }

  const derived = await deriveAttackPathId(path.nodes, path.crown_jewel_id)
  push(derived)

  // Non-mat IAP hashes last — often 404 on /report; still try before raw path-*.
  if (isSha256HexId(path.attack_path_id)) push(path.attack_path_id)
  push(path.id)

  return out
}

/** Prefer backend field; derive client-side when prod hasn't shipped attack_path_id yet. */
export async function resolveClosurePathId(path: PathIdSource): Promise<string> {
  const ids = await resolveReportPathIds(path)
  return ids[0] ?? path.id
}
