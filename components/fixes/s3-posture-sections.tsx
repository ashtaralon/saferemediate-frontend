"use client"

// Issue-first rendering of the S3 fleet posture: actionable buckets lead
// (public path, then evidence gaps, then ready-to-enforce), buckets with
// nothing to do collapse into a single expandable line. Pure presentation —
// grouping/copy logic lives in s3-posture.ts, wizard state in the tab.

import { type ReactNode } from "react"
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Database, Lock, Network, RefreshCw, SearchCheck } from "lucide-react"
import type { S3OperationKind } from "@/components/topology-v0-2/estate-operations"
import { isInFlight, S3_ENFORCEMENT_KIND, S3_PRIVATE_PATH_KIND, type RememberedOperation } from "./s3-vpce-lifecycle"
import type { EnforcementAvailability } from "./enforcement-availability"
import {
  bucketToResource,
  groupPostureBuckets,
  postureDetail,
  POSTURE_BADGE,
  type PostureResource,
  type S3FleetPosture,
  type S3PostureBucket,
} from "./s3-posture"

interface Props {
  posture: S3FleetPosture
  enforcementMode: EnforcementAvailability
  latestVpceByBucket: Map<string, RememberedOperation>
  latestEnforcementByBucket: Map<string, RememberedOperation>
  onOpen: (bucket: PostureResource, resume: RememberedOperation | null, kind: S3OperationKind) => void
  onRescan: () => void
  rescanning: boolean
}

function findOperation(
  map: Map<string, RememberedOperation>,
  bucket: S3PostureBucket,
): RememberedOperation | undefined {
  const byId = map.get(bucket.bucket_id)
  if (byId) return byId
  for (const entry of map.values()) {
    if (entry.bucketName === bucket.bucket_name) return entry
  }
  return undefined
}

function PostureBadge({ bucket }: { bucket: S3PostureBucket }) {
  const badge = POSTURE_BADGE[bucket.posture]
  if (!badge) return null
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={badge.style}
      data-testid="posture-badge"
    >
      {badge.label}
    </span>
  )
}

function ConsumerHint({ bucket }: { bucket: S3PostureBucket }) {
  const offenders = bucket.posture === "PUBLIC_EXPOSURE"
    ? bucket.public_consumers
    : bucket.posture === "EVIDENCE_GAP"
      ? bucket.unknown_consumers
      : []
  if (!offenders.length) return null
  const names = offenders.slice(0, 3).map((c) => c.resource_name || c.resource_id).filter(Boolean)
  const more = offenders.length - names.length
  return (
    <span className="font-mono text-[10px]" style={{ color: "#7A8996" }}>
      {names.join(", ")}{more > 0 ? ` +${more} more` : ""}{bucket.detail_truncated ? " (list truncated)" : ""}
    </span>
  )
}

function BucketRow({
  bucket,
  action,
  children,
}: {
  bucket: S3PostureBucket
  action: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3"
      style={{ borderColor: "#DDE3E8" }}
      data-testid="posture-bucket-row"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg p-1.5" style={{ background: "#E6FBF7" }}>
            <Database className="h-4 w-4" style={{ color: "#0E8B7A" }} />
          </span>
          <span className="truncate text-sm font-semibold" style={{ color: "#1A2330" }}>{bucket.bucket_name}</span>
          <PostureBadge bucket={bucket} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "#5A6B7A" }}>
          <span>{postureDetail(bucket)}</span>
          <ConsumerHint bucket={bucket} />
        </div>
        {children}
      </div>
      {action}
    </div>
  )
}

export function S3PostureSections({
  posture,
  enforcementMode,
  latestVpceByBucket,
  latestEnforcementByBucket,
  onOpen,
  onRescan,
  rescanning,
}: Props) {
  const groups = groupPostureBuckets(posture.buckets)
  const attention = [...groups.publicExposure, ...groups.evidenceGap]
  const scannedAt = posture.generated_at
    ? new Date(posture.generated_at).toLocaleTimeString()
    : null

  const transportButton = (bucket: S3PostureBucket) => {
    const entry = findOperation(latestVpceByBucket, bucket)
    const active = entry ? isInFlight(entry.state) : false
    return (
      <button
        type="button"
        onClick={() => onOpen(bucketToResource(bucket), active ? entry ?? null : null, S3_PRIVATE_PATH_KIND)}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
        style={{ background: active ? "#1D4ED8" : "#0E8B7A" }}
        data-testid="posture-fix-transport"
      >
        {active ? "Resume setup" : bucket.posture === "EVIDENCE_GAP" ? "Review evidence" : "Set up private path"}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    )
  }

  const enforceButton = (bucket: S3PostureBucket) => {
    const entry = findOperation(latestEnforcementByBucket, bucket)
    const active = entry ? isInFlight(entry.state) : false
    const enforced = bucket.posture === "PRIVATE_ENFORCED" || entry?.state === "COMPLETE"
    return (
      <button
        type="button"
        onClick={() => onOpen(bucketToResource(bucket), active ? entry ?? null : null, S3_ENFORCEMENT_KIND)}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
        style={enforced
          ? { background: "#FFFFFF", color: "#0E8B7A", border: "1px solid #9FE8DC" }
          : enforcementMode === "preview" && !active
            ? { background: "#FFFFFF", color: "#5A6B7A", border: "1px solid #C9D4DE" }
            : { background: active ? "#1D4ED8" : "#0D1B2A", color: "#FFFFFF" }}
        title={enforcementMode === "preview" && !enforced
          ? "Enforcement execution is disabled on the backend — the wizard opens in preview: analyze and review only."
          : undefined}
        data-testid="posture-fix-enforce"
      >
        <Lock className="h-3.5 w-3.5" />
        {active
          ? "Resume enforcement"
          : enforced
            ? "Enforced · review"
            : enforcementMode === "preview"
              ? "Preview enforcement"
              : "Enforce private path"}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <div className="space-y-5" data-testid="posture-sections">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm" style={{ color: "#1A2330" }}>
          {posture.summary.actionable > 0 ? (
            <span data-testid="posture-headline">
              <strong>{posture.summary.actionable}</strong> of {posture.summary.total_buckets} bucket
              {posture.summary.total_buckets === 1 ? "" : "s"} need attention
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5" data-testid="posture-headline">
              <CheckCircle2 className="h-4 w-4" style={{ color: "#0E8B7A" }} />
              All {posture.summary.total_buckets} bucket{posture.summary.total_buckets === 1 ? "" : "s"} are clear
            </span>
          )}
          {scannedAt ? (
            <span className="ml-2 text-[11px]" style={{ color: "#7A8996" }}>scanned {scannedAt}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRescan}
          disabled={rescanning}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
          style={{ borderColor: "#C9D4DE", color: "#5A6B7A", background: "#FFFFFF" }}
          data-testid="posture-rescan"
        >
          <RefreshCw className={`h-3 w-3 ${rescanning ? "animate-spin" : ""}`} /> Re-scan
        </button>
      </div>

      {attention.length > 0 ? (
        <section>
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: "#B91C1C" }}>
            <AlertTriangle className="h-3.5 w-3.5" /> Needs attention ({attention.length})
          </h3>
          <div className="space-y-2">
            {attention.map((bucket) => (
              <BucketRow key={bucket.bucket_id} bucket={bucket} action={transportButton(bucket)} />
            ))}
          </div>
        </section>
      ) : null}

      {groups.readyToEnforce.length > 0 ? (
        <section>
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: "#1D4ED8" }}>
            <SearchCheck className="h-3.5 w-3.5" /> Review enforcement readiness ({groups.readyToEnforce.length})
          </h3>
          <div className="space-y-2">
            {groups.readyToEnforce.map((bucket) => (
              <BucketRow key={bucket.bucket_id} bucket={bucket} action={enforceButton(bucket)} />
            ))}
          </div>
        </section>
      ) : null}

      {groups.noAction.length > 0 ? (
        <details className="rounded-xl border" style={{ borderColor: "#DDE3E8" }} data-testid="posture-no-action">
          <summary
            className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-semibold"
            style={{ color: "#5A6B7A" }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {groups.noAction.length} bucket{groups.noAction.length === 1 ? "" : "s"} need no action right now
          </summary>
          <div className="space-y-2 border-t p-3" style={{ borderColor: "#EDF1F4" }}>
            {groups.noAction.map((bucket) => (
              <BucketRow
                key={bucket.bucket_id}
                bucket={bucket}
                action={bucket.posture === "PRIVATE_ENFORCED" ? enforceButton(bucket) : (
                  <button
                    type="button"
                    onClick={() => onOpen(bucketToResource(bucket), null, S3_PRIVATE_PATH_KIND)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: "#C9D4DE", color: "#5A6B7A", background: "#FFFFFF" }}
                    data-testid="posture-fix-details"
                  >
                    <Network className="h-3.5 w-3.5" /> Details
                  </button>
                )}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}
