import { mutationFailure, mutationFailureText, type MutationFailure } from "@/lib/iam-mutation-outcome"

/** GET /api/snapshots/{id}/states (Permissions P8). */
export interface CheckpointStates {
  snapshot_id: string
  source: string
  grants_no_authority: boolean
  scope: { tenant_id: string; account_id: string; resource_arn: string }
  checkpoint: {
    status: string
    created_at: string | null
    s3_key: string | null
    /** The version S3 served on this read. Never requested: the row pins none. */
    s3_version_id_observed: string | null
    s3_version_pinned: false
    before_state_source: "s3_object" | "checkpoint_row" | null
  }
  operation: {
    operation_id: string | null
    state: string | null
    record_version: number | string | null
    pre_image_hash: string | null
    post_image_hash: string | null
    removed_actions: string[]
  }
  integrity: "VERIFIED" | "BEFORE_ONLY" | "UNVERIFIABLE"
  before: {
    verified: boolean
    reason: string | null
    policy_set_hash_checkpoint: string | null
    policy_set_hash_recomputed: string | null
    inline_policies: Record<string, unknown>
    attached_managed_policy_arns: string[]
  }
  after: {
    verified: boolean
    reason: string | null
    derivation: string
    policy_set_hash_recorded: string | null
    policy_set_hash_recomputed: string | null
    inline_policies: Record<string, unknown> | null
    deleted_inline_policies: string[] | null
  }
}

export type CheckpointStatesResult =
  | { ok: true; states: CheckpointStates }
  | { ok: false; failure: MutationFailure }

export const CHECKPOINT_STATE_REASONS: Record<string, string> = {
  BEFORE_HASH_MISMATCH: "the stored documents do not hash to the recorded pre-image",
  MANAGED_POLICY_DOCUMENTS_NOT_IN_CHECKPOINT: "attached managed policy documents are not stored in the checkpoint",
  BEFORE_NOT_VERIFIED: "the before state is not verified",
  REMOVAL_SET_NOT_RECORDED: "the removed actions were not recorded",
  POST_IMAGE_HASH_NOT_RECORDED: "no post-image hash was recorded",
  REMOVAL_DOES_NOT_COMPILE: "the recorded removal does not compile over the stored state",
  AFTER_HASH_MISMATCH: "the derived after state does not hash to the post-image verified at apply",
}

export function checkpointStateReason(reason: string | null | undefined): string {
  if (!reason) return ""
  return CHECKPOINT_STATE_REASONS[reason] ?? reason
}

const short = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : "not recorded")

/** One line saying exactly what was verified against what. */
export function describeCheckpointIntegrity(states: CheckpointStates): string {
  const { before, after, operation } = states
  const beforeText = before.verified
    ? `before verified: hash ${short(before.policy_set_hash_recomputed)} equals the checkpoint and the operation's pre-image`
    : `before not verified: ${checkpointStateReason(before.reason)}`
  const afterText = after.verified
    ? `after verified: hash ${short(after.policy_set_hash_recomputed)} equals the post-image verified at apply`
    : `after not shown: ${checkpointStateReason(after.reason)}`
  return `${states.integrity} — ${beforeText}; ${afterText} (operation ${operation.operation_id?.slice(0, 8) ?? "unknown"})`
}

export async function fetchCheckpointStates(
  snapshotId: string,
  fetcher: typeof fetch = fetch,
): Promise<CheckpointStatesResult> {
  let response: Response
  try {
    response = await fetcher(`/api/proxy/snapshots/${encodeURIComponent(snapshotId)}/states`, { cache: "no-store" })
  } catch (error: any) {
    return { ok: false, failure: { status: 0, code: null, message: error?.message || "The saved state could not be requested.", awsWrites: null } }
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) return { ok: false, failure: mutationFailure(response.status, body) }
  if (!body || typeof body !== "object" || !("integrity" in body) || !("before" in body)) {
    return { ok: false, failure: { status: response.status, code: null, message: "The saved state response was not in the expected form.", awsWrites: null } }
  }
  return { ok: true, states: body as CheckpointStates }
}

export { mutationFailureText }

/**
 * The actions a VERIFIED after state allows (inline Allow statements, as written).
 * Null unless the after state verified: an unverified derivation is not a count.
 */
export function allowedActionsAfterChange(states: CheckpointStates): string[] | null {
  if (!states.after.verified || !states.after.inline_policies) return null
  const actions = new Set<string>()
  for (const doc of Object.values(states.after.inline_policies)) {
    const statements = (doc as { Statement?: unknown })?.Statement
    for (const statement of Array.isArray(statements) ? statements : statements ? [statements] : []) {
      const st = statement as { Effect?: unknown; Action?: unknown }
      if (st?.Effect !== "Allow") continue
      for (const action of Array.isArray(st.Action) ? st.Action : [st.Action]) {
        if (typeof action === "string" && action) actions.add(action)
      }
    }
  }
  return Array.from(actions).sort()
}


/** How the saved object was located, in words that do not claim a pinned read. */
export function describeCheckpointVersion(states: CheckpointStates): string {
  const { checkpoint } = states
  if (checkpoint.before_state_source === "checkpoint_row") return "before state stored on the checkpoint row"
  const observed = checkpoint.s3_version_id_observed
  return observed
    ? `S3 version observed on this read: ${observed} (not pinned; trusted through the hashes)`
    : "S3 version not reported (not pinned; trusted through the hashes)"
}
