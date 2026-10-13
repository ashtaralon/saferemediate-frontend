/**
 * (S1b) The per-Deployment context the backend serves beside an authored System's members -- in the draft preview v2
 * (lib/system-boundary-setup-preview.ts) and in the served result v2 (lib/system-boundary-result.ts) -- read EXACTLY as the
 * backend writes it (saferemediate-backend unified/system_boundary_context.context_is_valid and
 * services/system_membership_result_publication._valid_decoration), and grouped per Deployment for the person. Pure: no
 * React, no fetch.
 *
 * A context names, for ONE member, the Deployments its roots made it a member of, each at the exact version the membership was
 * computed against: SINGLE (one), MULTIPLE (two or more: shared), MIXED (one, beside a root that names none), SYSTEM_LEVEL
 * (none). A decoration is all or nothing: SERVED with a context on EVERY listed member, or UNAVAILABLE by name with none -- it
 * never hides a member. Nothing here infers a Deployment from a member's own region, its absence or its name.
 */

export const RESOLUTIONS = ["SINGLE", "MULTIPLE", "MIXED", "SYSTEM_LEVEL"] as const
export type Resolution = (typeof RESOLUTIONS)[number]

export interface DeploymentRef {
  key: string
  version: number
}

export interface DeploymentContext {
  resolution: Resolution
  deployments: DeploymentRef[]
}

export type Decoration =
  | { state: "SERVED"; members: number }
  | { state: "UNAVAILABLE"; reason: string }

/** One Deployment of the setup, with the human key it was authored under, paired with what the backend pinned for it. */
export interface PairedDeployment {
  deploymentKey: string
  key: string
  version: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const exactly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((k) => k in value)
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

/** A Deployment's record key: ``DEPLOYMENT#authored_deployment:<64 hex>`` (the planner's own id rule). */
export const DEPLOYMENT_KEY = /^DEPLOYMENT#authored_deployment:[0-9a-f]{64}$/

const CARDINALITY: Record<Resolution, (n: number) => boolean> = {
  SINGLE: (n) => n === 1, MULTIPLE: (n) => n >= 2, MIXED: (n) => n === 1, SYSTEM_LEVEL: (n) => n === 0,
}

/** One member's context exactly as the backend writes it, or null: exact keys, a certifying resolution with its exact
 *  cardinality, canonical keys with positive versions, unique and sorted. */
export function deploymentContext(value: unknown): DeploymentContext | null {
  if (!isRecord(value) || !exactly(value, ["resolution", "deployments"]) || typeof value.resolution !== "string"
      || !(value.resolution in CARDINALITY) || !Array.isArray(value.deployments)) return null
  const resolution = value.resolution as Resolution
  if (!CARDINALITY[resolution](value.deployments.length)) return null
  const refs: DeploymentRef[] = []
  for (const ref of value.deployments) {
    if (!isRecord(ref) || !exactly(ref, ["key", "version"]) || typeof ref.key !== "string" || !DEPLOYMENT_KEY.test(ref.key)
        || !Number.isSafeInteger(ref.version) || (ref.version as number) < 1) return null
    refs.push({ key: ref.key, version: ref.version as number })
  }
  if (!refs.every((r, i) => i === 0 || refs[i - 1].key < r.key)) return null      // unique and sorted (ASCII keys)
  return { resolution, deployments: refs }
}

/** A decoration's state exactly: SERVED {state, members} with a full count, or UNAVAILABLE {state, reason, detail}. */
export function decoration(value: unknown): Decoration | null {
  if (!isRecord(value)) return null
  if (value.state === "SERVED") {
    return exactly(value, ["state", "members"]) && isCount(value.members) ? { state: "SERVED", members: value.members } : null
  }
  if (value.state === "UNAVAILABLE") {
    return exactly(value, ["state", "reason", "detail"]) && typeof value.reason === "string" && value.reason.length > 0
      && isRecord(value.detail) ? { state: "UNAVAILABLE", reason: value.reason } : null
  }
  return null
}

/** Whether a decorated member list is whole, exactly as the backend's own reader checks it: SERVED -- the full count equals
 *  the member count and the listed members plus the omitted ones (never the capped list's length alone), and EVERY listed
 *  member carries a valid context; UNAVAILABLE -- no member carries one. */
export function decoratedMembersAreWhole(state: Decoration, members: readonly Record<string, unknown>[], fullCount: number,
                                         omitted: number): boolean {
  if (state.state === "UNAVAILABLE") return members.every((m) => !("deployment_context" in m))
  return state.members === fullCount && members.length + omitted === fullCount
    && members.every((m) => deploymentContext(m.deployment_context) !== null)
}

/** A ``deployment_key`` as the backend admits one (unified/system_boundary_plan.DEPLOYMENT_KEY_RE): ASCII, so this sort and
 *  the backend's canonical sort agree. */
export const DEPLOYMENT_KEY_NAME = /^[A-Za-z0-9._-]{1,64}$/

/** The setup's Deployments paired with what the backend pinned for them (agreed A3: the association lists every Deployment in
 *  CANONICAL ``deployment_key`` order, and deployment keys are ASCII): the intent's keys sorted, position for position. Null
 *  when the counts differ, a key is not one the backend admits or a ref is not a Deployment key -- never a guessed pairing. */
export function pairDeployments(deploymentKeys: readonly string[], pinned: readonly DeploymentRef[]): PairedDeployment[] | null {
  const keys = [...deploymentKeys].sort()
  if (keys.length === 0 || keys.length !== pinned.length || new Set(keys).size !== keys.length
      || !keys.every((k) => DEPLOYMENT_KEY_NAME.test(k))
      || !pinned.every((p) => DEPLOYMENT_KEY.test(p.key) && Number.isSafeInteger(p.version) && p.version >= 1)
      || new Set(pinned.map((p) => p.key)).size !== pinned.length) return null
  return keys.map((deploymentKey, i) => ({ deploymentKey, key: pinned[i].key, version: pinned[i].version }))
}

/** One Deployment's explanation: its SINGLE members, and the members it SHARES (MULTIPLE / MIXED naming it) -- said apart,
 *  never folded into "its" members. */
export interface DeploymentExplanation {
  deployment: PairedDeployment
  single: string[]
  shared: string[]
}

/** The members grouped per Deployment, over the members LISTED (a capped list's omitted members are counted apart, never
 *  attributed); SYSTEM_LEVEL members, and members whose context names a Deployment or a version other than the paired ones
 *  (``foreign``), are said apart. Null for a decoration that is not SERVED. */
export interface Explanation {
  deployments: DeploymentExplanation[]
  systemLevel: string[]
  foreign: string[]
  listed: number
  omitted: number
}

export function explain(state: Decoration, members: readonly Record<string, unknown>[], omitted: number,
                        paired: readonly PairedDeployment[]): Explanation | null {
  if (state.state !== "SERVED") return null
  const byKey = new Map(paired.map((d) => [d.key, { deployment: d, single: [] as string[], shared: [] as string[] }]))
  const systemLevel: string[] = []
  const foreign: string[] = []
  for (const member of members) {
    const uid = String(member.resource_uid)
    const context = deploymentContext(member.deployment_context)
    if (context === null) return null                                   // a SERVED decoration is whole, or it is not read
    if (context.resolution === "SYSTEM_LEVEL") {
      systemLevel.push(uid)
      continue
    }
    const named = context.deployments.map((ref) => {
      const entry = byKey.get(ref.key)
      return entry !== undefined && entry.deployment.version === ref.version ? entry : null
    })
    if (named.some((entry) => entry === null)) {
      foreign.push(uid)                                                 // another Deployment, or another version of one
      continue
    }
    for (const entry of named as { single: string[]; shared: string[] }[]) {
      ;(context.resolution === "SINGLE" ? entry.single : entry.shared).push(uid)
    }
  }
  return { deployments: [...byKey.values()], systemLevel, foreign, listed: members.length, omitted }
}

/** The resolution of a member in words (MULTIPLE / MIXED / SYSTEM_LEVEL said as such). */
export function resolutionWords(resolution: Resolution): string {
  return {
    SINGLE: "this Deployment's",
    MULTIPLE: "shared by several Deployments",
    MIXED: "this Deployment's, and also reached from the System as a whole",
    SYSTEM_LEVEL: "the System's, not one Deployment's",
  }[resolution]
}

/** Why a decoration is withheld, in words; the backend's reason stays visible. */
export function decorationSentence(state: Decoration): string {
  if (state.state === "SERVED") return `Deployment context shown for all ${state.members} member(s).`
  const words: Record<string, string> = {
    PUBLICATION_WITHOUT_CONTEXT: "this membership was published before Deployments were explained",
    PLANNER_INPUTS_UNAVAILABLE: "the inputs this membership was computed from could not be read",
    DEPLOYMENT_VERSION_NOT_PLANNER_INPUT: "a Deployment changed after this membership was computed",
    AUTHORED_REVISION_UNKNOWN: "this membership does not record which declarations it was computed from",
    CONTEXT_BUDGET_EXHAUSTED: "too many Deployments to explain in one read",
  }
  return `Which Deployment each member belongs to is not shown: ${words[state.reason] ?? "it could not be established"} `
    + `(${state.reason}). Every member is still listed.`
}
