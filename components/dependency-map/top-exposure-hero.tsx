"use client"

// TopExposureHero — single focal answer at the top of the Trust Boundary
// Map. The CISO landing here should read ONE sentence and know what
// they're looking at: "your most exposed jewel is X; here's the chain
// it could exit through; here's the one thing to do."
//
// Derived from the same data the Crown Jewel Exfil Paths widget inverts.
// Picks the SINGLE worst jewel by this priority:
//   1. Jewels that are internet-exposed themselves (worst case — already
//      reachable from outside without a workload compromise)
//   2. Jewels with the most exfil-capable readers (1-hop exfil chains)
//   3. Tiebreak: highest bytes_transferred (proxy for "actively used")
//
// When the data carries zero jewels with readers, the hero renders a
// muted "no jewels observed in window" placeholder rather than hiding —
// the absence is informative ("either you have nothing classified as a
// jewel yet, or no workload has read one in 30d"). Per
// feedback_no_mock_numbers_in_ui — three-state, never fabricated.

import React, { useMemo } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Database,
  ExternalLink,
  Globe,
  Lock,
  Shield,
} from "lucide-react"
import type { PostureWorkload, WorkloadBucket } from "./trust-boundary-map"

interface UpstreamCrownJewel {
  id: string
  name: string
  type?: string | null
  classification?: string | null
  is_internet_exposed?: boolean
  hits?: number
  bytes_transferred?: number
  last_seen?: string | null
}

interface JewelScore {
  jewel: UpstreamCrownJewel
  totalReaders: number
  exfilCapableReaders: PostureWorkload[]
  // Worst reader bucket among the exfil-capable set. Drives the
  // exit-path label ("via LATENT workload" / "via ACTIVE workload").
  worstBucket: WorkloadBucket | null
  // Bytes the jewel transferred to readers (sum over readers, since
  // PostureWorkload doesn't carry per-jewel bytes — fall back to
  // jewel.bytes_transferred if available).
  bytesTransferred: number
}

const BUCKET_LABEL_SHORT: Record<WorkloadBucket, string> = {
  ISOLATED: "isolated",
  AWS_REDIRECTABLE: "AWS-only",
  ACTIVE_INTERNET: "active internet egress",
  LATENT_EXPOSURE: "latent (can egress, unused)",
}

const BUCKET_RANK: Record<WorkloadBucket, number> = {
  ISOLATED: 0,
  AWS_REDIRECTABLE: 1,
  ACTIVE_INTERNET: 2,
  LATENT_EXPOSURE: 3,
}

function jewelTypeIcon(type: string | null | undefined) {
  const t = (type || "").toLowerCase()
  if (t.includes("kms") || t.includes("key")) return <Lock className="w-4 h-4" />
  return <Database className="w-4 h-4" />
}

function jewelTypeLabel(type: string | null | undefined) {
  const t = (type || "").toLowerCase()
  if (t.includes("s3")) return "S3 Bucket"
  if (t.includes("kms")) return "KMS Key"
  if (t.includes("rds")) return "RDS Database"
  if (t.includes("dynamo")) return "DynamoDB Table"
  if (t.includes("secret")) return "Secret"
  return type || "Resource"
}

function formatBytesShort(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

interface Props {
  workloads: PostureWorkload[]
  systemName: string
  onSelectWorkload?: (w: PostureWorkload) => void
}

export function TopExposureHero({ workloads, systemName, onSelectWorkload }: Props) {
  const scored = useMemo<JewelScore[]>(() => {
    const map = new Map<string, JewelScore>()
    for (const w of workloads) {
      // PostureWorkload doesn't statically declare upstream_crown_jewels —
      // backend ships it via the same egress payload but it's optional on
      // the type. Cast at the boundary; downstream code stays typed.
      const cjs = ((w as unknown) as { upstream_crown_jewels?: UpstreamCrownJewel[] })
        .upstream_crown_jewels
      if (!cjs || cjs.length === 0) continue
      for (const cj of cjs) {
        if (!cj?.id) continue
        let entry = map.get(cj.id)
        if (!entry) {
          entry = {
            jewel: cj,
            totalReaders: 0,
            exfilCapableReaders: [],
            worstBucket: null,
            bytesTransferred: cj.bytes_transferred || 0,
          }
          map.set(cj.id, entry)
        }
        entry.totalReaders += 1
        if (w.has_internet_capability) {
          entry.exfilCapableReaders.push(w)
        }
        if (
          !entry.worstBucket ||
          BUCKET_RANK[w.bucket] > BUCKET_RANK[entry.worstBucket]
        ) {
          entry.worstBucket = w.bucket
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // 1. Public jewels first — already reachable from outside.
      const aExp = a.jewel.is_internet_exposed ? 1 : 0
      const bExp = b.jewel.is_internet_exposed ? 1 : 0
      if (aExp !== bExp) return bExp - aExp
      // 2. Most exfil-capable readers next — biggest 1-hop chain.
      if (a.exfilCapableReaders.length !== b.exfilCapableReaders.length) {
        return b.exfilCapableReaders.length - a.exfilCapableReaders.length
      }
      // 3. Tiebreak: bytes through the jewel.
      return b.bytesTransferred - a.bytesTransferred
    })
  }, [workloads])

  const top = scored[0]
  const exfilCount = top?.exfilCapableReaders.length ?? 0
  const exposedJewel = !!top?.jewel.is_internet_exposed
  const hasUrgentChain = !!top && (exposedJewel || exfilCount > 0)

  // Three-state: data present + concerning / data present + clean / no data.
  if (!top) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-slate-500">
          <Shield className="w-3.5 h-3.5" />
          Top exposure
        </div>
        <div className="mt-1 text-[12px] text-slate-600 italic">
          No crown jewel reads observed in the 30-day window — either no
          resources are classified as jewels yet, or no workload accessed
          one. Tag a resource as a jewel from the Crown Jewels tab to
          start tracking exfil paths.
        </div>
      </section>
    )
  }

  return (
    <section
      className={`rounded-lg border-2 p-4 ${
        hasUrgentChain
          ? "border-rose-400 bg-rose-50"
          : "border-emerald-400 bg-emerald-50"
      }`}
    >
      {/* Header strip */}
      <div className="flex items-baseline gap-2 mb-3">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-bold ${
            hasUrgentChain ? "text-rose-900" : "text-emerald-900"
          }`}
        >
          {hasUrgentChain ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Shield className="w-3.5 h-3.5" />
          )}
          Top exposure
        </span>
        <span
          className="text-[10px] text-slate-500"
          title={`Picked from ${scored.length} crown jewel${scored.length === 1 ? "" : "s"} with observed reads. Priority: public jewels first, then most 1-hop exfil readers, tiebreak by bytes.`}
        >
          · {scored.length} jewel{scored.length === 1 ? "" : "s"} accessed in 30d
        </span>
      </div>

      {/* Jewel identity row */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-rose-700">{jewelTypeIcon(top.jewel.type)}</span>
        <span
          className="text-[15px] font-bold text-slate-900 truncate"
          title={top.jewel.name}
        >
          {top.jewel.name}
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-600">
          {jewelTypeLabel(top.jewel.type)}
        </span>
        {top.jewel.classification && (
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border border-amber-400 bg-amber-100 text-amber-900">
            {top.jewel.classification}
          </span>
        )}
        {exposedJewel && (
          <span
            className="text-[10px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border border-rose-400 bg-rose-100 text-rose-900"
            title="The jewel itself accepts inbound from 0.0.0.0/0 — reachable from outside without compromising any workload first. Worst-case exposure."
          >
            Public jewel
          </span>
        )}
      </div>

      {/* One-sentence answer */}
      <div className="text-[13px] text-slate-800 leading-relaxed mb-3">
        {exposedJewel ? (
          <>
            <strong>Reachable from the internet directly.</strong>{" "}
            Read by {top.totalReaders} workload{top.totalReaders === 1 ? "" : "s"}
            {top.bytesTransferred > 0 && (
              <> · {formatBytesShort(top.bytesTransferred)} transferred</>
            )}
            . Closing the public-access posture on the bucket itself takes
            priority over workload-side narrowing.
          </>
        ) : exfilCount > 0 ? (
          <>
            Read by <strong>{top.totalReaders}</strong> workload
            {top.totalReaders === 1 ? "" : "s"}, of which{" "}
            <strong className="text-rose-700">{exfilCount}</strong> can reach
            the internet directly. If any are compromised, this jewel's data
            exits to anywhere in one hop — before GuardDuty flags unusual volume.
          </>
        ) : (
          <>
            Read by {top.totalReaders} workload{top.totalReaders === 1 ? "" : "s"}.
            All readers are isolated from the internet — no 1-hop exfil chain
            in the observed window.
          </>
        )}
      </div>

      {/* Chain visual */}
      {hasUrgentChain && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900"
            title={`Crown jewel: ${jewelTypeLabel(top.jewel.type)}`}
          >
            <Database className="w-3 h-3" />
            <span className="text-[11px] font-semibold truncate" style={{ maxWidth: 200 }}>
              {top.jewel.name}
            </span>
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          {top.exfilCapableReaders.slice(0, 3).map((reader) => (
            <button
              key={reader.workload.id}
              type="button"
              onClick={() => onSelectWorkload?.(reader)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-rose-300 bg-rose-100 text-rose-900 hover:bg-rose-200 transition-colors"
              title={`Reader workload · ${BUCKET_LABEL_SHORT[reader.bucket]}. Click to open in the workload panel.`}
            >
              <ExternalLink className="w-3 h-3" />
              <span className="text-[11px] font-semibold truncate" style={{ maxWidth: 160 }}>
                {reader.workload.name}
              </span>
            </button>
          ))}
          {top.exfilCapableReaders.length > 3 && (
            <span className="text-[10px] text-slate-500 italic self-center">
              +{top.exfilCapableReaders.length - 3} more reader{top.exfilCapableReaders.length - 3 === 1 ? "" : "s"}
            </span>
          )}
          {top.exfilCapableReaders.length > 0 && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-slate-300 bg-slate-100 text-slate-700"
                title="Public-egress gateway open on the reader workload's subnet (IGW / NAT / EIGW). Data can exit the VPC to any destination."
              >
                <Globe className="w-3 h-3" />
                <span className="text-[11px] font-semibold">Internet</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Single primary CTA — anchored to the Flow Map view filtered to
          this jewel's readers. Operator clicks ONE button, lands on the
          full path detail. No drift to dashboards. */}
      <div className="flex items-center gap-3 pt-2 border-t border-rose-200">
        <button
          type="button"
          onClick={() => {
            if (top.exfilCapableReaders[0]) {
              onSelectWorkload?.(top.exfilCapableReaders[0])
            }
          }}
          disabled={!top.exfilCapableReaders[0]}
          className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
            top.exfilCapableReaders[0]
              ? "border-rose-500 bg-rose-600 text-white hover:bg-rose-700"
              : "border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
          title={
            top.exfilCapableReaders[0]
              ? `Open the highest-risk reader (${top.exfilCapableReaders[0].workload.name}) in the path drill-in panel.`
              : "No exfil-capable readers — nothing to drill into here."
          }
        >
          Open exfil path
          <ArrowRight className="w-3 h-3" />
        </button>
        <span className="text-[10px] text-slate-600">
          {systemName} · {scored.length} jewel{scored.length === 1 ? "" : "s"} tracked
        </span>
      </div>
    </section>
  )
}

export default TopExposureHero
