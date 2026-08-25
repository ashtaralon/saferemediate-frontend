/**
 * Which network claim the map is entitled to make, and why.
 *
 * History, because it explains every guard here. The banner has overclaimed
 * three times, each fix leaving a weaker version of the same error:
 *
 *  1. "NO NETWORK CONTROLS · Network defenses do not apply" fired from four
 *     empty arrays — an absence of collected data rendered as a finding (#465).
 *  2. Scoped to the path, but still asserted "so IAM is the only gate on it"
 *     from a settled fetch (#467). A loaded hop DTO containing no network
 *     checkpoint proves only that THE PROJECTION REPRESENTED NONE. It does not
 *     prove the workload is non-VPC, that network controls do not apply, or
 *     that the projection's network coverage was complete.
 *  3. "IAM is the only gate" is wrong even where network genuinely does not
 *     apply, because authorization is not just IAM: resource policy, KMS key
 *     policy, and IAM conditions are all gates on the same reach.
 *
 * So the rule is: name the SUBJECT of every claim. The projection represented
 * no checkpoint — that is an observation about the projection. Anything stronger
 * needs the server to say so explicitly, with evidence.
 */

/**
 * The server's explicit verdict. Preferred over `is_vpc_attached` wherever
 * present, because the boolean cannot distinguish "checked, and it is not
 * VPC-attached" from "nobody ever checked" — both arrive as `false`.
 *
 * Only the Lambda collector writes an explicit attachment fact, so today every
 * EC2 instance reaches the UI as an unchecked `false`. Reading that as proof is
 * how "IAM is the only line of defense" ends up cited against a workload whose
 * network posture was never collected.
 */
export type VpcAttachmentState =
  | "VPC_ATTACHED"
  | "NOT_VPC_ATTACHED"
  | "UNKNOWN"

export interface WorkloadNetworkPayload {
  /**
   * Legacy boolean. Retained so old payloads still parse, but it is NOT
   * sufficient on its own: `false` conflates verified-non-VPC with unchecked.
   * A payload carrying only this degrades to UNKNOWN.
   */
  is_vpc_attached: boolean
  /** Authoritative when present. Absent ⇒ legacy payload ⇒ UNKNOWN. */
  vpc_attachment_state?: VpcAttachmentState | null
  vpc_id?: string | null
  vpc_name?: string | null
  evidence?: string | null
  workload_count_queried?: number
  workload_count_in_sample?: number
  /** When the workload's network attachment was established by the collector. */
  verified_at?: string | null
  /** Authoritative route / execution-location verdict token from the path. */
  route_verdict?: string | null
}

export interface NetworkPostureLike {
  settled: boolean
  reason: string
}

export type NetworkBannerKind =
  /** Server verified the workload is not VPC-attached, with complete evidence.
   *  The only state entitled to say network controls do not apply. */
  | "verified-non-vpc"
  /** Projection settled and represented no network checkpoint. An observation,
   *  NOT a finding. */
  | "no-checkpoints-represented"
  /** Nothing settled — we do not know. */
  | "unverified"

export interface NetworkBannerState {
  kind: NetworkBannerKind
  /** Machine-readable why, surfaced in the DOM so a wrong state is debuggable
   *  from outside the app — that is how the #466 regression was caught. */
  reason: string
  /** True only for `verified-non-vpc`. Drives amber vs neutral styling: an
   *  observation about our own projection is not a security finding. */
  isFinding: boolean
}

/**
 * Fields the strong claim historically lacked. Kept as an empty list once the
 * collector + convergence/exfil wiring land — tests still import the symbol so
 * a regression that re-introduces a hard gap is visible.
 */
export const NETWORK_CLAIM_BACKEND_GAPS = [] as const

export function resolveNetworkBannerState(
  workloadNetwork: WorkloadNetworkPayload | null | undefined,
  posture: NetworkPostureLike | null | undefined,
): NetworkBannerState {
  const observation = (reason: string): NetworkBannerState => ({
    kind: "no-checkpoints-represented",
    reason,
    isFinding: false,
  })

  if (workloadNetwork) {
    // Every condition is a POSITIVE requirement. An absent field can never
    // satisfy one, so a thinner payload degrades instead of promoting.
    const state = workloadNetwork.vpc_attachment_state
    if (state === "VPC_ATTACHED" || workloadNetwork.is_vpc_attached) {
      // VPC-attached: real subnets/SGs render from real edges; no banner claim.
      return observation("workload_is_vpc_attached")
    }
    if (state === "UNKNOWN") {
      // The server looked and could not establish it. Say so; do not infer.
      return observation("workload_vpc_attachment_unknown")
    }
    if (state !== "NOT_VPC_ATTACHED") {
      // No explicit verdict at all — a pre-contract payload. The boolean alone
      // cannot carry the strong claim, so degrade rather than promote. This
      // resolves once the backend ships vpc_attachment_state.
      return observation("workload_vpc_attachment_state_absent")
    }
    if (!workloadNetwork.evidence || !workloadNetwork.evidence.trim()) {
      return observation("workload_network_evidence_missing")
    }
    const queried = workloadNetwork.workload_count_queried
    const inSample = workloadNetwork.workload_count_in_sample
    if (
      typeof queried === "number" &&
      typeof inSample === "number" &&
      inSample > 0 &&
      queried < inSample
    ) {
      // A sampled answer cannot speak for the workloads not queried.
      return observation("workload_network_coverage_incomplete")
    }
    if (!workloadNetwork.verified_at) {
      return observation("workload_network_timestamp_missing")
    }
    if (!workloadNetwork.route_verdict) {
      return observation("route_verdict_missing")
    }
    return {
      kind: "verified-non-vpc",
      reason: "workload_verified_non_vpc",
      isFinding: true,
    }
  }

  // No server verdict. The only question left is whether our own projection
  // settled — and even settled, it speaks for the projection, nothing more.
  if (posture && !posture.settled) {
    return { kind: "unverified", reason: posture.reason, isFinding: false }
  }
  return observation(posture?.reason ?? "posture_absent")
}


/**
 * The single question a consumer is entitled to ask before claiming a workload
 * sits outside every customer VPC.
 *
 * Exists because `is_vpc_attached === false` was being tested inline in views
 * that never saw the guards above — the resolver was correct and simply
 * bypassed. Anything asserting non-applicability of network controls must go
 * through here, so the rule has exactly one implementation.
 *
 * Note what this does NOT license: even a true answer means only that the VPC
 * network control plane does not apply. Authorization still gates the reach —
 * IAM, resource policy, KMS key policy and IAM conditions all remain in force.
 */
export function isVerifiedNonVpc(
  workloadNetwork: WorkloadNetworkPayload | null | undefined,
  posture?: NetworkPostureLike | null,
): boolean {
  return resolveNetworkBannerState(workloadNetwork, posture).kind === "verified-non-vpc"
}
