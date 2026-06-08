"use client"

// InternetDestinationsTable — compact list of the egress destinations
// the workload reached over the last N days, rendered inline below the
// per-path flow map. Answers the operator question that wasn't visible
// in the (Attack-Paths-style) flow map: "where could this workload
// phone home — and where has it already?"
//
// Three states (per feedback_no_mock_numbers_in_ui):
//   - wired + totalDistinct > 0 → table of topDestinations
//   - wired + totalDistinct == 0 → "no observed external destinations"
//   - not_wired / loading      → explicit copy, never a fabricated zero

import { Globe2, Wifi, WifiOff } from "lucide-react"
import type { DataLeakInternetDestinations } from "@/lib/types"

interface Props {
  dests: DataLeakInternetDestinations
}

export function InternetDestinationsTable({ dests }: Props) {
  // Header is always present so operators see the panel even when
  // empty — establishes the "this is where we'd show destinations" slot.
  return (
    <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <Header dests={dests} />
      {renderBody(dests)}
    </section>
  )
}

function Header({ dests }: { dests: DataLeakInternetDestinations }) {
  const summary =
    dests._state !== "wired"
      ? "—"
      : dests.totalDistinct === 0
        ? "0 destinations in window"
        : `${dests.totalDistinct} distinct · aws ${dests.byClass.aws} · external ${dests.byClass.external}${
            dests.byClass.unknown ? ` · unknown ${dests.byClass.unknown}` : ""
          }`
  const Icon =
    dests._state === "not_wired" || dests.totalDistinct === 0 ? WifiOff : Wifi
  return (
    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-slate-500" />
      <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-600">
        Internet destinations
      </div>
      <span className="ml-auto text-[11px] text-slate-600">{summary}</span>
      {dests.signals.length > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
          {dests.signals.length} signal{dests.signals.length === 1 ? "" : "s"}
        </span>
      )}
    </div>
  )
}

function renderBody(dests: DataLeakInternetDestinations) {
  if (dests._state === "not_wired") {
    return (
      <div className="px-3 py-3 text-[11px] text-slate-500 italic">
        Internet-destination tracking is not yet computed for this system.
      </div>
    )
  }
  if (dests._state === "loading") {
    return (
      <div className="px-3 py-3 text-[11px] text-slate-500 italic">Loading destinations…</div>
    )
  }
  if (dests.totalDistinct === 0 || dests.topDestinations.length === 0) {
    return (
      <div className="px-3 py-3 text-[11px] text-slate-500 italic">
        No observed external destinations in the last 30 days. The egress path is open but unused.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <Th>Destination</Th>
            <Th>Kind</Th>
            <Th>Service / Org</Th>
            <Th className="text-right">Bytes</Th>
            <Th className="text-right">Hits</Th>
            <Th>First seen</Th>
            <Th>Signals</Th>
          </tr>
        </thead>
        <tbody>
          {dests.topDestinations.map((d, i) => (
            <tr key={`${d.ip || "?"}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/60">
              <Td>
                <span className="font-mono text-slate-800">{d.ip || "—"}</span>
                {d.country && (
                  <span className="ml-1.5 text-[10px] text-slate-500">· {d.country}</span>
                )}
              </Td>
              <Td>
                <KindChip kind={d.kind} />
              </Td>
              <Td>
                <span className="text-slate-800">
                  {d.service ? humanService(d.service) : d.org || "—"}
                </span>
                {d.service && d.org && (
                  <span className="ml-1 text-[10px] text-slate-500">· {d.org}</span>
                )}
              </Td>
              <Td className="text-right font-mono text-slate-700">
                {formatBytes(d.bytes ?? 0)}
              </Td>
              <Td className="text-right font-mono text-slate-700">
                {(d.hits ?? 0).toLocaleString()}
              </Td>
              <Td className="text-slate-600">{formatDate(d.firstSeen)}</Td>
              <Td>
                {d.signals && d.signals.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {d.signals.map((s) => (
                      <span
                        key={s}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${signalTone(s)}`}
                      >
                        {humanSignal(s)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small render units + helpers
// ---------------------------------------------------------------------------

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left font-medium uppercase tracking-wider px-3 py-1.5 ${className || ""}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className || ""}`}>{children}</td>
}

function KindChip({ kind }: { kind?: string | null }) {
  if (!kind) return <span className="text-slate-400">—</span>
  const tone =
    kind === "aws"
      ? "bg-blue-50 text-blue-800 border-blue-200"
      : kind === "external"
        ? "bg-rose-50 text-rose-800 border-rose-200"
        : kind === "internal"
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : "bg-slate-50 text-slate-700 border-slate-200"
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${tone}`}
    >
      {kind === "external" && <Globe2 className="w-3 h-3" />}
      {kind}
    </span>
  )
}

function humanService(svc: string): string {
  // Backend hands us the raw AWS service token (s3, dynamodb, kms, ec2,
  // ssm, etc.). Vendor-neutral display strings for the operator.
  const map: Record<string, string> = {
    s3:        "Object storage",
    dynamodb:  "Key-value store",
    kms:       "Key management",
    ec2:       "Compute control plane",
    ssm:       "Systems management",
    sts:       "Identity broker",
    secretsmanager: "Secret store",
    rds:       "Managed database",
    lambda:    "Function runtime",
    cloudwatch:"Telemetry",
    logs:      "Log ingestion",
    sqs:       "Message queue",
    sns:       "Pub/sub",
  }
  return map[svc.toLowerCase()] || svc
}

function humanSignal(signal: string): string {
  // feedback_signal_language: NEVER "suspicious". Use the specific
  // signal name with operator-facing copy.
  const map: Record<string, string> = {
    plaintext:                        "Plaintext channel",
    residential_isp:                  "Residential ISP",
    rare_asn:                         "Rare ASN",
    new_destination:                  "New destination",
    cross_region_aws:                 "Cross-region AWS",
    cross_cloud:                      "Cross-cloud",
    non_aws_public_from_private_subnet: "Private subnet → public",
  }
  return map[signal] || signal.replace(/_/g, " ")
}

function signalTone(signal: string): string {
  const high = new Set(["plaintext", "residential_isp", "rare_asn"])
  if (high.has(signal)) return "bg-rose-50 text-rose-800 border-rose-200"
  return "bg-amber-50 text-amber-800 border-amber-200"
}

function formatBytes(n: number): string {
  if (!n) return "—"
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return iso
  }
}
