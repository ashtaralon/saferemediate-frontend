"use client"

// Crown Jewel Exfil Paths — ACT 2 of the CISO demo.
//
// Inverts the workload-centric view. Instead of "for each workload,
// where does it go," shows "for each crown jewel, who reads it AND
// what's their egress capability." The killer slide is the 1-hop
// exfil chain: jewel → reader workload (with internet egress) →
// internet. By the time GuardDuty flags "unusual volume," the data's
// gone.
//
// Renders above the Trust Boundary Map summary as a callout card.
// Only appears when at least one jewel has at least one reader
// workload — empty case returns null (no fabricated jewels).
//
// Per feedback_no_mock_numbers_in_ui — three-state UI: shows only
// jewels that have OBSERVED reads in the lookback window. Honest
// "0 readers" placeholder is suppressed by hiding the whole section.

import React, { useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Crown,
  Database,
  ExternalLink,
  Lock,
  Network,
  Shield,
} from "lucide-react"
import type {
  PostureWorkload,
  WorkloadBucket,
} from "./trust-boundary-map"

// Mirrors the UpstreamCrownJewel shape egress_visibility emits.
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

interface JewelReaderRow {
  jewel: UpstreamCrownJewel
  readers: Array<{
    workload: PostureWorkload
    hits: number
    bytes_transferred: number
  }>
  // Of the readers, how many have an internet egress path? These
  // are the 1-hop exfil candidates — the killer demo slide.
  exfilCapableReaderCount: number
  // Worst-case bucket among the readers (LATENT > ACTIVE > REDIRECTABLE > ISOLATED)
  worstReaderBucket: WorkloadBucket | null
}

const BUCKET_RANK: Record<WorkloadBucket, number> = {
  ISOLATED: 0,
  AWS_REDIRECTABLE: 1,
  ACTIVE_INTERNET: 2,
  LATENT_EXPOSURE: 3,
}

const BUCKET_HEX: Record<WorkloadBucket, string> = {
  ISOLATED: "#059669",
  AWS_REDIRECTABLE: "#d97706",
  ACTIVE_INTERNET: "#ea580c",
  LATENT_EXPOSURE: "#dc2626",
}

const BUCKET_TONE: Record<WorkloadBucket, string> = {
  ISOLATED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  AWS_REDIRECTABLE: "border-amber-300 bg-amber-50 text-amber-800",
  ACTIVE_INTERNET: "border-orange-300 bg-orange-50 text-orange-800",
  LATENT_EXPOSURE: "border-red-400 bg-red-50 text-red-800",
}

const BUCKET_EMOJI: Record<WorkloadBucket, string> = {
  ISOLATED: "🟢",
  AWS_REDIRECTABLE: "🟡",
  ACTIVE_INTERNET: "🟠",
  LATENT_EXPOSURE: "🔴",
}

function jewelTypeIcon(type: string | null | undefined) {
  if (!type) return <Database className="w-4 h-4 text-fuchsia-700" />
  const t = type.toLowerCase()
  if (t.includes("s3") || t.includes("bucket")) return <Database className="w-4 h-4 text-fuchsia-700" />
  if (t.includes("kms") || t.includes("key")) return <Lock className="w-4 h-4 text-fuchsia-700" />
  if (t.includes("rds") || t.includes("db") || t.includes("dynamo")) return <Database className="w-4 h-4 text-fuchsia-700" />
  return <Crown className="w-4 h-4 text-fuchsia-700" />
}

function jewelTypeLabel(type: string | null | undefined) {
  if (!type) return "Resource"
  const t = type.toLowerCase()
  if (t.includes("s3")) return "S3 Bucket"
  if (t.includes("kms")) return "KMS Key"
  if (t.includes("rds")) return "RDS Database"
  if (t.includes("dynamo")) return "DynamoDB Table"
  if (t.includes("secret")) return "Secret"
  return type
}

// ---- Main component ------------------------------------------------

interface CrownJewelExfilPathsProps {
  workloads: PostureWorkload[]
  onSelectWorkload?: (workload: PostureWorkload) => void
}

export function CrownJewelExfilPaths({
  workloads,
  onSelectWorkload,
}: CrownJewelExfilPathsProps) {
  // Collapsed by default — the new TopExposureHero answers the
  // "what's the worst jewel?" question above this widget. Operators
  // who want the full inverted list expand it on demand. Keeps the
  // top-of-page focal point clean (operator-overload fix 2026-05-19).
  const [expanded, setExpanded] = useState(false)

  // Invert the workload→jewel mapping: build jewel→[reader workloads].
  // Skip jewels with no readers at all (no observed CJ-read traffic).
  const jewelRows = useMemo<JewelReaderRow[]>(() => {
    const jewelMap = new Map<string, JewelReaderRow>()

    for (const w of workloads) {
      const cjs = (w as any).upstream_crown_jewels as UpstreamCrownJewel[] | undefined
      if (!cjs || cjs.length === 0) continue
      for (const cj of cjs) {
        if (!cj?.id) continue
        let row = jewelMap.get(cj.id)
        if (!row) {
          row = {
            jewel: cj,
            readers: [],
            exfilCapableReaderCount: 0,
            worstReaderBucket: null,
          }
          jewelMap.set(cj.id, row)
        }
        row.readers.push({
          workload: w,
          hits: cj.hits || 0,
          bytes_transferred: cj.bytes_transferred || 0,
        })
        if (w.has_internet_capability) {
          row.exfilCapableReaderCount += 1
        }
        if (
          !row.worstReaderBucket ||
          BUCKET_RANK[w.bucket] > BUCKET_RANK[row.worstReaderBucket]
        ) {
          row.worstReaderBucket = w.bucket
        }
      }
    }

    // Sort: jewels with exfil-capable readers first; then by reader count.
    return Array.from(jewelMap.values()).sort((a, b) => {
      if (a.exfilCapableReaderCount !== b.exfilCapableReaderCount) {
        return b.exfilCapableReaderCount - a.exfilCapableReaderCount
      }
      return b.readers.length - a.readers.length
    })
  }, [workloads])

  if (jewelRows.length === 0) return null

  const totalExfilCapableJewels = jewelRows.filter((r) => r.exfilCapableReaderCount > 0).length

  return (
    <div className="rounded-xl border-2 border-fuchsia-300 bg-gradient-to-br from-fuchsia-50 to-white shadow-sm p-4 mb-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 mb-3 text-left"
        aria-expanded={expanded}
      >
        <Crown className="w-5 h-5 text-fuchsia-700" />
        <div className="flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-800">
            Crown Jewel Exfil Paths
          </div>
          <div className="text-[11px] text-fuchsia-700 mt-0.5">
            {jewelRows.length} jewel{jewelRows.length === 1 ? "" : "s"} accessed in window
            {totalExfilCapableJewels > 0 && (
              <span className="ml-1 font-semibold text-red-700">
                · {totalExfilCapableJewels} reachable from internet via 1-hop exfil chain ⚠
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-fuchsia-700" />
        ) : (
          <ChevronRight className="w-4 h-4 text-fuchsia-700" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2.5">
          {jewelRows.map((row) => (
            <JewelRowCard
              key={row.jewel.id}
              row={row}
              onSelectWorkload={onSelectWorkload}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function JewelRowCard({
  row,
  onSelectWorkload,
}: {
  row: JewelReaderRow
  onSelectWorkload?: (w: PostureWorkload) => void
}) {
  const exfilCapable = row.exfilCapableReaderCount > 0
  const jewelTone = exfilCapable
    ? "border-red-400 bg-red-50/50"
    : "border-fuchsia-200 bg-white"
  return (
    <div className={`rounded-lg border-2 ${jewelTone} p-3`}>
      <div className="grid grid-cols-[1fr_auto_2fr] gap-3 items-center">
        {/* Jewel identity */}
        <div className="flex items-center gap-2 min-w-0">
          {jewelTypeIcon(row.jewel.type)}
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-slate-900 truncate" title={row.jewel.name}>
              {row.jewel.name}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1.5">
              <span className="font-semibold">{jewelTypeLabel(row.jewel.type)}</span>
              {row.jewel.classification && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 font-bold uppercase tracking-wider text-[9px]">
                  {row.jewel.classification}
                </span>
              )}
              {row.jewel.is_internet_exposed && (
                <span className="px-1.5 py-0.5 rounded bg-red-100 border border-red-400 text-red-800 font-bold uppercase tracking-wider text-[9px]">
                  Public Jewel
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">
            {row.readers.length} reader{row.readers.length === 1 ? "" : "s"}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>

        {/* Reader workloads */}
        <div className="flex flex-wrap gap-1.5">
          {row.readers.slice(0, 8).map(({ workload }) => {
            const tone = BUCKET_TONE[workload.bucket]
            const exfilIcon = workload.has_internet_capability ? (
              <ExternalLink className="w-2.5 h-2.5 inline-block" />
            ) : null
            return (
              <button
                key={workload.workload.id}
                type="button"
                onClick={() => onSelectWorkload?.(workload)}
                className={`text-left inline-flex items-center gap-1 rounded border ${tone} px-1.5 py-1 hover:scale-105 hover:shadow-sm transition-all`}
                title={
                  workload.has_internet_capability
                    ? `${workload.workload.name} · 1-hop exfil capable (internet egress open)`
                    : `${workload.workload.name} · isolated from internet`
                }
              >
                <span className="text-[10px]">{BUCKET_EMOJI[workload.bucket]}</span>
                <span className="text-[10px] font-medium truncate" style={{ maxWidth: 140 }}>
                  {workload.workload.name}
                </span>
                {exfilIcon}
              </button>
            )
          })}
          {row.readers.length > 8 && (
            <span className="text-[10px] text-slate-500 italic self-center">
              + {row.readers.length - 8} more
            </span>
          )}
        </div>
      </div>

      {/* Exfil chain callout */}
      {exfilCapable && (
        <div className="mt-2.5 rounded border border-red-300 bg-red-100/60 px-2.5 py-1.5 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0" />
          <span className="text-[11px] font-semibold text-red-900">
            1-hop exfil:
          </span>
          <span className="text-[10px] text-red-800">
            <span className="font-bold">{row.exfilCapableReaderCount}</span> of {row.readers.length} reader
            {row.readers.length === 1 ? "" : "s"} can reach the internet directly. If any are compromised,
            this jewel exits to anywhere before detection.
          </span>
        </div>
      )}
    </div>
  )
}

export default CrownJewelExfilPaths
