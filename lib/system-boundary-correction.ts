/**
 * Correcting declarations (Phase 2 T18A): each change a person makes on one account's page, turned into the exact
 * Correction the backend saves as ONE revision, with every expected version read from the view the person sees. Pure: no
 * React, no fetch. The backend decides (versions, conflicts, the raw environment word); locally this refuses only what
 * the view already rules out.
 *
 * Intent is explicit, never inferred:
 *  - criticality: the System's tier set, or cleared (null) -- tenant-wide;
 *  - environment: the Deployment's canonical environment and/or the customer's own word for it. Omitted keeps, null
 *    clears. The effect, including a kept word, is spelled out before the save;
 *  - roots: add the picked roots, remove roots (a tombstone revision -- not an AWS deletion), move roots to another
 *    Deployment. A REPLACEMENT is remove + add in the same correction, so the declared set goes from A+B to A+C in one
 *    revision and is never A+B+C; until that revision is saved, it stays A+B.
 */
import type { BoundaryRecord, Correction, DeclarationsView } from "@/lib/system-boundary-authoring"
import type { PickedRoot } from "@/lib/system-boundary-declaration"

export type CorrectionIntent =
  | { kind: "criticality"; systemKey: string; criticality: string | null }
  | { kind: "environment"; deploymentKey: string; environment?: string; environmentRaw?: string | null }
  | { kind: "roots"; deploymentKey: string; add: PickedRoot[]; remove: string[]; move: { rootKey: string; toDeploymentKey: string }[] }

export type BuildCorrection = { ok: true; correction: Correction } | { ok: false; problems: string[] }

export interface DeclaredDeployment {
  deployment: BoundaryRecord
  /** This account's live roots of the Deployment. */
  roots: BoundaryRecord[]
}

export interface DeclaredSystem {
  system: BoundaryRecord
  deployments: DeclaredDeployment[]
}

function live(records: BoundaryRecord[]): BoundaryRecord[] {
  return records.filter((record) => !record.tombstoned)
}

function text(body: Record<string, unknown>, field: string): string {
  return typeof body[field] === "string" ? (body[field] as string) : ""
}

function inAccount(deployment: BoundaryRecord, accountId: string): boolean {
  const scopes = Array.isArray(deployment.body.scopes) ? (deployment.body.scopes as { account_id?: unknown }[]) : []
  return scopes.some((scope) => scope.account_id === accountId)
}

/** What is declared on ONE account: each System with a Deployment covering it, and that account's live roots. */
export function declaredIn(view: DeclarationsView, accountId: string): DeclaredSystem[] {
  const roots = live(view.roots).filter((root) => root.body.account_id === accountId)
  return live(view.systems)
    .map((system) => ({
      system,
      deployments: live(view.deployments)
        .filter((d) => d.body.system_id === system.body.system_id && inAccount(d, accountId))
        .sort((a, b) => text(a.body, "deployment_key").localeCompare(text(b.body, "deployment_key")))
        .map((deployment) => ({ deployment, roots: roots.filter((r) => r.body.deployment_id === deployment.body.deployment_id)
          .sort((a, b) => text(a.body, "resource_uid").localeCompare(text(b.body, "resource_uid"))) })),
    }))
    .filter((entry) => entry.deployments.length > 0)
    .sort((a, b) => text(a.system.body, "display_name").localeCompare(text(b.system.body, "display_name")))
}

function find(records: BoundaryRecord[], key: string): BoundaryRecord | undefined {
  return live(records).find((record) => record.key === key)
}

function systemOf(view: DeclarationsView, deployment: BoundaryRecord): BoundaryRecord | undefined {
  return live(view.systems).find((system) => system.body.system_id === deployment.body.system_id)
}

function rootAt(record: BoundaryRecord) {
  return { account_id: text(record.body, "account_id"), region: text(record.body, "region"),
           resource_uid: text(record.body, "resource_uid"), expected_version: record.version }
}

const GONE = "has changed since this page was read; reload and try again."

export function buildCorrection(intent: CorrectionIntent, view: DeclarationsView): BuildCorrection {
  if (intent.kind === "criticality") {
    const system = find(view.systems, intent.systemKey)
    if (!system) return { ok: false, problems: [`The system ${GONE}`] }
    if (intent.criticality !== null && !view.limits.criticalities.includes(intent.criticality)) {
      return { ok: false, problems: ["Choose one of the listed criticality tiers."] }
    }
    if ((system.body.criticality ?? null) === intent.criticality) return { ok: false, problems: ["Nothing to change."] }
    return { ok: true, correction: { system: { system_id: String(system.body.system_id), expected_version: system.version,
                                               set: { criticality: intent.criticality } } } }
  }
  const deployment = find(view.deployments, intent.deploymentKey)
  const system = deployment ? systemOf(view, deployment) : undefined
  if (!deployment || !system) return { ok: false, problems: [`The deployment ${GONE}`] }
  const head = { system: { system_id: String(system.body.system_id), expected_version: system.version } }
  const target = { deployment_id: String(deployment.body.deployment_id), expected_version: deployment.version }

  if (intent.kind === "environment") {
    const set: { environment?: string; environment_raw?: string | null } = {}
    if (intent.environment !== undefined && intent.environment !== deployment.body.environment) {
      if (!view.limits.environments.includes(intent.environment)) return { ok: false, problems: ["Choose the deployment's environment."] }
      set.environment = intent.environment
    }
    if (intent.environmentRaw !== undefined) {
      const raw = intent.environmentRaw === null ? null : intent.environmentRaw.trim() || null
      if (raw !== null && raw.length > view.limits.max_environment_raw) {
        return { ok: false, problems: [`Your own environment word is at most ${view.limits.max_environment_raw} characters.`] }
      }
      if (raw !== (deployment.body.environment_raw ?? null)) set.environment_raw = raw
    }
    if (Object.keys(set).length === 0) return { ok: false, problems: ["Nothing to change."] }
    return { ok: true, correction: { ...head, deployment: { ...target, set } } }
  }

  const problems: string[] = []
  const ownRoots = live(view.roots).filter((r) => r.body.deployment_id === deployment.body.deployment_id)
  const remove = intent.remove.map((key) => ownRoots.find((r) => r.key === key))
  if (remove.some((r) => r === undefined)) problems.push(`A root to remove ${GONE}`)
  const moves = intent.move.map(({ rootKey, toDeploymentKey }) => {
    const root = ownRoots.find((r) => r.key === rootKey)
    const to = find(view.deployments, toDeploymentKey)
    const toSystem = to ? systemOf(view, to) : undefined
    return root && to && toSystem && to.key !== deployment.key ? { root, to, toSystem } : null
  })
  if (moves.some((m) => m === null)) problems.push(`A root to move, or where it moves to, ${GONE}`)
  const touched = [...intent.remove, ...intent.move.map((m) => m.rootKey)]
  if (new Set(touched).size !== touched.length) problems.push("A root can be removed or moved, not both.")
  if (intent.add.length + intent.remove.length + intent.move.length === 0) problems.push("Nothing to change.")
  if (intent.add.length + intent.remove.length + intent.move.length > view.limits.max_roots) {
    problems.push(`At most ${view.limits.max_roots} roots change in one correction.`)
  }
  if (problems.length) return { ok: false, problems }
  const roots: NonNullable<Correction["roots"]> = {}
  if (intent.add.length) roots.add = intent.add.map((picked) => picked.root)
  if (intent.remove.length) roots.remove = (remove as BoundaryRecord[]).map(rootAt)
  if (intent.move.length) {
    roots.move = (moves as { root: BoundaryRecord; to: BoundaryRecord; toSystem: BoundaryRecord }[]).map(({ root, to, toSystem }) => ({
      ...rootAt(root), to_deployment_id: String(to.body.deployment_id), to_deployment_expected_version: to.version,
      to_system_id: String(toSystem.body.system_id), to_system_expected_version: toSystem.version }))
  }
  return { ok: true, correction: { ...head, deployment: target, roots } }
}

/** What an environment correction will do, in words, before it is saved -- a KEPT word included. */
export function environmentEffect(deployment: BoundaryRecord, set: { environment?: string; environment_raw?: string | null }): string[] {
  const environment = text(deployment.body, "environment")
  const raw = typeof deployment.body.environment_raw === "string" ? (deployment.body.environment_raw as string) : null
  const lines = [set.environment !== undefined && set.environment !== environment
    ? `Environment: ${environment} becomes ${set.environment}.` : `Environment: ${environment} (unchanged).`]
  if (set.environment_raw === undefined) {
    lines.push(raw === null ? "Your own word: none." : `Your own word "${raw}" is KEPT and must still fit the environment.`)
  } else if (set.environment_raw === null) {
    lines.push(raw === null ? "Your own word: none." : `Your own word "${raw}" is cleared.`)
  } else {
    lines.push(raw === null ? `Your own word becomes "${set.environment_raw}".` : `Your own word "${raw}" becomes "${set.environment_raw}".`)
  }
  return lines
}
