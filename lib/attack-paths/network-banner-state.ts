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

export interface WorkloadNetworkPayload {
  is_vpc_attached: boolean
  vpc_id?: string | null
  vpc_name?: string | null
  evidence?: string | null
  workload_count_queried?: number
  workload_count_in_sample?: number
  /** When the workload's network attachment was established. NOT yet sent by
   *  the backend — see NETWORK_CLAIM_BACKEND_GAPS. */
  verified_at?: string | null
  /** Authoritative route / execution-location verdict. NOT yet sent — ditto. */
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
 * Fields the strong claim requires that the backend does not yet send.
 *
 * Listed rather than quietly ignored. Until they arrive, `verified-non-vpc`
 * cannot be reached and the banner degrades to the honest observation — which
 * is the correct direction to fail.
 */
export const NETWORK_CLAIM_BACKEND_GAPS = [
  "verified_at",
  "route_verdict",
] as const

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
    if (workloadNetwork.is_vpc_attached) {
      // VPC-attached: real subnets/SGs render from real edges; no banner claim.
      return observation("workload_is_vpc_attached")
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
