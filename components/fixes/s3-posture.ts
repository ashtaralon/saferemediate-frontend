// Fleet-wide S3 transport posture: the issue-first read model behind the
// Fixes tab. The backend classifies every bucket's observed consumers in one
// sweep (GET /{system}/s3-posture) so the tab can lead with buckets that
// actually need attention instead of the whole inventory. Fail-soft by
// design: when the endpoint is unavailable the tab falls back to the plain
// inventory grid, so posture can never make the surface *less* capable.

import { operationalRequest } from "@/components/topology-v0-2/estate-operations"

export type S3BucketPostureKind =
  | "PUBLIC_EXPOSURE"
  | "EVIDENCE_GAP"
  | "PRIVATE_UNENFORCED"
  | "PRIVATE_ENFORCED"
  | "NO_VPC_CONSUMERS"

export interface S3PostureConsumerRow {
  resource_id: string | null
  resource_name: string | null
  resource_type: string | null
  vpc_id: string | null
  route_kinds: string[]
  via_vpce_id: string | null
  last_seen: string | null
}

export interface S3PostureOperationRow {
  operation_id: string | null
  kind: string | null
  state: string | null
  updated_at: string | null
  requested_by: string | null
  approved_by: string | null
  active: boolean
}

export interface S3PostureBucket {
  bucket_id: string
  bucket_name: string
  region: string | null
  account_id: string | null
  posture: S3BucketPostureKind
  actionable: boolean
  consumers: {
    observed: number
    in_vpc: number
    out_of_vpc: number
    private: number
    public: number
    unknown: number
  }
  public_route_kinds: string[]
  vpce_ids_in_use: string[]
  vpc_ids: string[]
  last_activity: string | null
  public_consumers: S3PostureConsumerRow[]
  unknown_consumers: S3PostureConsumerRow[]
  out_of_vpc_consumers: S3PostureConsumerRow[]
  detail_truncated: boolean
  transport_operation: S3PostureOperationRow | null
  enforcement_operation: S3PostureOperationRow | null
}

export interface S3FleetPosture {
  system_name: string
  generated_at: string | null
  structural_refresh: "completed" | "skipped" | "failed" | string
  ledger: "ok" | "unavailable" | string
  summary: {
    total_buckets: number
    actionable: number
    by_posture: Partial<Record<S3BucketPostureKind, number>>
  }
  buckets: S3PostureBucket[]
}

// Minimal shape validation before trusting the payload: a proxy hiccup, an
// older backend without the route, or an HTML error page must all resolve to
// "posture unavailable" (fallback UI), never to a half-rendered list.
export function parseFleetPosture(body: unknown): S3FleetPosture | null {
  if (!body || typeof body !== "object") return null
  const candidate = body as Record<string, unknown>
  const summary = candidate.summary as Record<string, unknown> | undefined
  if (!Array.isArray(candidate.buckets)) return null
  if (!summary || typeof summary.total_buckets !== "number") return null
  const buckets = (candidate.buckets as Array<Record<string, unknown>>).filter(
    (row) => typeof row?.bucket_id === "string" && typeof row?.posture === "string",
  )
  return { ...(candidate as unknown as S3FleetPosture), buckets: buckets as unknown as S3PostureBucket[] }
}

export async function fetchFleetPosture(
  systemName: string,
  options?: { refreshStructural?: boolean },
): Promise<S3FleetPosture | null> {
  const refresh = options?.refreshStructural ?? true
  try {
    const body = await operationalRequest<unknown>(
      systemName,
      `s3-posture?refresh_structural=${refresh ? "true" : "false"}`,
    )
    return parseFleetPosture(body)
  } catch {
    return null
  }
}

export interface PostureGroups {
  publicExposure: S3PostureBucket[]
  evidenceGap: S3PostureBucket[]
  readyToEnforce: S3PostureBucket[]
  noAction: S3PostureBucket[]
}

// Grouping preserves the server's actionable-first ordering inside each group.
export function groupPostureBuckets(buckets: S3PostureBucket[]): PostureGroups {
  const groups: PostureGroups = {
    publicExposure: [],
    evidenceGap: [],
    readyToEnforce: [],
    noAction: [],
  }
  for (const bucket of buckets ?? []) {
    switch (bucket.posture) {
      case "PUBLIC_EXPOSURE":
        groups.publicExposure.push(bucket)
        break
      case "EVIDENCE_GAP":
        groups.evidenceGap.push(bucket)
        break
      case "PRIVATE_UNENFORCED":
        groups.readyToEnforce.push(bucket)
        break
      default:
        groups.noAction.push(bucket)
    }
  }
  return groups
}

// One-line human detail for a bucket's badge, e.g. "2 of 5 consumers public
// via NAT" or "3 consumers lack transport proof".
export function postureDetail(bucket: S3PostureBucket): string {
  const counts = bucket.consumers
  switch (bucket.posture) {
    case "PUBLIC_EXPOSURE": {
      const via = bucket.public_route_kinds.length
        ? ` via ${bucket.public_route_kinds.join(" + ")}`
        : ""
      return `${counts.public} of ${counts.in_vpc} in-VPC consumer${counts.in_vpc === 1 ? "" : "s"} on the public path${via}`
    }
    case "EVIDENCE_GAP":
      return `${counts.unknown} consumer${counts.unknown === 1 ? "" : "s"} without complete transport proof`
    case "PRIVATE_UNENFORCED":
      return `All ${counts.in_vpc} in-VPC consumer${counts.in_vpc === 1 ? "" : "s"} private — bucket policy not yet enforced`
    case "PRIVATE_ENFORCED":
      return "Private path enforced by bucket policy"
    case "NO_VPC_CONSUMERS":
      return counts.out_of_vpc > 0
        ? `No in-VPC consumers (${counts.out_of_vpc} out-of-VPC caller${counts.out_of_vpc === 1 ? "" : "s"})`
        : "No observed consumers in the window"
    default:
      return ""
  }
}

export const POSTURE_BADGE: Record<S3BucketPostureKind, { label: string; style: { background: string; color: string; borderColor: string } }> = {
  PUBLIC_EXPOSURE: {
    label: "Public path",
    style: { background: "#FEF2F2", color: "#B91C1C", borderColor: "#FCA5A5" },
  },
  EVIDENCE_GAP: {
    label: "Evidence needed",
    style: { background: "#FFFBEB", color: "#B45309", borderColor: "#FDE68A" },
  },
  PRIVATE_UNENFORCED: {
    label: "Private · unenforced",
    style: { background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" },
  },
  PRIVATE_ENFORCED: {
    label: "Enforced",
    style: { background: "#E6FBF7", color: "#0E8B7A", borderColor: "#9FE8DC" },
  },
  NO_VPC_CONSUMERS: {
    label: "No VPC consumers",
    style: { background: "#F8FAFC", color: "#5A6B7A", borderColor: "#DDE3E8" },
  },
}

export interface PostureResource {
  id: string
  name: string
  type: string
  region?: string | null
}

export function bucketToResource(bucket: S3PostureBucket): PostureResource {
  return {
    id: bucket.bucket_id,
    name: bucket.bucket_name,
    type: "S3",
    region: bucket.region,
  }
}
