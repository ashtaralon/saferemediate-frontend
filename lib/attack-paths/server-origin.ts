/**
 * Server-authored path origin — ONE contract for "where does this path
 * start" (AP3-001-FE).
 *
 * SERVE by-crown-jewel rows carry `source_kind` ((:AttackPath).workload_kind)
 * and `workload_arn` straight off the materialized node. Those are the
 * authority. Hop / node ORDER is a reconstruction: it may be used only when
 * the server fields are absent, and every consumer that falls back must say
 * so (`origin_inferred`) so the UI badges a reconstruction instead of
 * presenting it as fact.
 *
 * Three consumers share this module so they cannot drift into competing
 * matchers (the twin-helper failure this repo lints against):
 *   - lib/attack-paths/convergence-to-iap.ts               (hop tier tagging)
 *   - components/attack-paths-v2/compile-path-list-row.ts  (FROM tile, exclusion)
 *   - lib/attack-paths/build-current-access-dossier.ts     (dossier FROM)
 */

import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import { extractInstanceId } from "./build-spotlight-active-node-ids"

export interface ServerOrigin {
  /** (:AttackPath).workload_kind verbatim — EC2Instance | LambdaFunction |
   *  ECSService | OrphanRole | ExternalPrincipal. null = server did not say.
   *  Server vocabulary; never normalized here. */
  kind: string | null
  /** (:AttackPath).workload_arn verbatim. null = server did not say. */
  arn: string | null
  /** (:AttackPath).workload_name verbatim. null = server did not say. */
  name: string | null
}

/** Minimal shape a hop (ConvergenceHop) or node (PathNodeDetail) is reduced
 *  to for identity matching. All ids are compared; position never is. */
export interface OriginCandidate {
  ids: Array<string | null | undefined>
  name?: string | null
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/** Read the server origin off any row shape that carries the SERVE fields.
 *  IAP rows expose the server workload name under materialized_path. */
export function serverOriginOf(row: {
  source_kind?: string | null
  workload_arn?: string | null
  source?: string | null
  materialized_path?: { workload_name?: string | null } | null
}): ServerOrigin {
  return {
    kind: trimOrNull(row.source_kind),
    arn: trimOrNull(row.workload_arn),
    name:
      trimOrNull(row.source) ??
      trimOrNull(row.materialized_path?.workload_name),
  }
}

/** True when the server authored an origin IDENTITY (kind or arn). A bare
 *  name is a label, not an identity — it can tie a hop (see
 *  findServerOriginMatch) but does not by itself make the origin
 *  server-authored. */
export function hasServerOrigin(origin: ServerOrigin): boolean {
  return origin.kind != null || origin.arn != null
}

/** Last ARN segment: "…:function:my-fn" → "my-fn", "…/instance/i-1" → "i-1". */
function arnTail(arn: string): string | null {
  const tail = arn.split(/[/:]/).pop()
  return trimOrNull(tail)
}

/** "i-…" when the string carries an EC2 instance id; null otherwise. */
function instanceIdOf(s: string): string | null {
  const inst = extractInstanceId(s)
  return inst && inst !== s ? inst : /^i-[a-f0-9]+$/.test(s) ? s : null
}

/**
 * Index of the item tied to the server origin, or -1.
 *
 * Two passes, identity only: (1) any candidate id equals the workload ARN, its
 * tail, or its EC2 instance id; (2) the candidate name equals the server
 * workload name. ARN evidence outranks a name so a same-named role hop can
 * never shadow the workload. Crown-jewel items are the caller's job to skip.
 */
export function findServerOriginMatch<T>(
  items: readonly T[],
  toCandidate: (item: T) => OriginCandidate,
  origin: ServerOrigin,
): number {
  const arn = origin.arn
  if (arn) {
    const tail = arnTail(arn)
    const inst = instanceIdOf(arn)
    for (let i = 0; i < items.length; i++) {
      for (const raw of toCandidate(items[i]).ids) {
        const id = trimOrNull(raw)
        if (!id) continue
        if (id === arn) return i
        if (tail && id === tail) return i
        if (inst && instanceIdOf(id) === inst) return i
      }
    }
  }
  const name = origin.name
  if (name) {
    for (let i = 0; i < items.length; i++) {
      if (trimOrNull(toCandidate(items[i]).name) === name) return i
    }
  }
  return -1
}

/** Server / IAP vocabulary for identity-kind origins: (:AttackPath).workload_kind
 *  OrphanRole, IAP node types IAMRole / IAMUser / …, plus the principal node
 *  types. A path whose origin is one of these and that has no compute
 *  foothold anywhere is an identity-only exposure — it belongs to the
 *  Exposure view, not the compute-led path list (same `identity_only`
 *  vocabulary as fan-in-path-model.ts). ExternalPrincipal is deliberately
 *  NOT here: a cross-account / wildcard grant is a real route origin. */
const IDENTITY_ORIGIN_KIND_RE =
  /^(OrphanRole|IAMRole|IAMUser|IAMGroup|IAMPolicy|InstanceProfile|STSSession|AccessKey)$/i

export function isIdentityOriginKind(kind: string | null | undefined): boolean {
  const k = trimOrNull(kind)
  if (!k) return false
  return isPrincipalNodeType(k) || IDENTITY_ORIGIN_KIND_RE.test(k)
}
