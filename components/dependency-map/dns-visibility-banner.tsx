"use client"

// DNS Visibility banner — surfaces the Route 53 Resolver Query Logs
// coverage state for the active region above the Flow Map path list.
// Three states:
//   - enabled (all VPCs covered)         → emerald checkmark + count
//   - partial (some VPCs covered)        → amber chip + "Enable N more"
//   - not enabled (zero configs)         → rose CTA + "Enable" button
//
// Clicking the button POSTs /api/proxy/dns/enable for the missing VPCs,
// which creates a CloudWatch Logs group + Resolver Query Log config +
// per-VPC association. Logs start flowing immediately; the collector
// ingests on the next 30-min scheduler tick.
//
// Per feedback_no_mock_numbers_in_ui: three-state rendering (live /
// loading / not-wired). Never claims "enabled" optimistically — only
// when /api/dns/status returns enabled=true.

import React, { useCallback, useEffect, useState } from "react"
import { Activity, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"

// Matches backend api/dns_visibility.py /status response shape.
interface DnsStatusResponse {
  region?: string
  total_vpcs?: number
  enabled_vpcs?: number
  missing_vpcs?: number
  vpcs?: Array<{
    vpc_id: string
    cidr?: string | null
    name?: string | null
    is_default?: boolean
    enabled?: boolean
    associations?: Array<{ association_id?: string; config_id?: string; status?: string }>
  }>
}

interface DnsEnableResponse {
  ok?: boolean
  created?: Array<{ vpc_id: string; config_id?: string; association_id?: string; status?: string }>
  errors?: Array<{ vpc_id: string; error: string }>
}

interface Props {
  region?: string
}

export function DnsVisibilityBanner({ region = "eu-west-1" }: Props) {
  const [status, setStatus] = useState<DnsStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [enableResult, setEnableResult] = useState<DnsEnableResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const fetchStatus = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetch(`/api/proxy/dns/status?region=${encodeURIComponent(region)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DnsStatusResponse>
      })
      .then((d) => setStatus(d))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [region])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const missingVpcIds = (status?.vpcs || [])
    .filter((v) => v.enabled === false)
    .map((v) => v.vpc_id)
    .filter((id): id is string => !!id)

  const handleEnable = useCallback(async () => {
    if (missingVpcIds.length === 0) return
    setEnabling(true)
    setEnableResult(null)
    setErr(null)
    try {
      const res = await fetch("/api/proxy/dns/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vpc_ids: missingVpcIds,
          region,
        }),
      })
      const data = (await res.json()) as DnsEnableResponse & { error?: string }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setEnableResult(data)
      // Refresh status so the banner flips to "enabled" once the create
      // succeeded. Logs themselves take ~30s to start flowing + 30min
      // for the first collector tick — we surface that timeline in the
      // success message rather than fake-claiming domains are visible.
      setTimeout(fetchStatus, 1500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEnabling(false)
    }
  }, [missingVpcIds, region, fetchStatus])

  // Hidden when loading first time — banner that flickers on every page
  // load is more noise than signal. The 'show me coverage status' value
  // kicks in once we have real data.
  if (loading && !status) {
    return null
  }
  if (err && !status) {
    return null
  }
  if (!status) return null

  const totalVpcs = status.total_vpcs ?? 0
  const enabledVpcs = status.enabled_vpcs ?? 0
  const missingVpcs = status.missing_vpcs ?? Math.max(totalVpcs - enabledVpcs, 0)
  const allEnabled = totalVpcs > 0 && missingVpcs === 0 && enabledVpcs > 0
  const partial = !allEnabled && enabledVpcs > 0
  // `none` derived from the same predicates above for readability.
  void partial

  const tone = allEnabled
    ? "border-emerald-500/40 bg-emerald-500/5"
    : partial
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-slate-700 bg-slate-900/40"

  return (
    <div className={`rounded-lg border ${tone} px-4 py-3 mb-3`}>
      <div className="flex items-center gap-3 flex-wrap">
        {allEnabled ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
        ) : partial ? (
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
        ) : (
          <Activity className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div
            className={`text-[11px] uppercase tracking-[0.12em] font-semibold ${
              allEnabled
                ? "text-emerald-200"
                : partial
                  ? "text-amber-200"
                  : "text-slate-400"
            }`}
          >
            Domain visibility
          </div>
          <div className="mt-0.5 text-[12px] text-slate-100">
            {allEnabled ? (
              <>
                Route 53 Resolver Query Logs active on all {enabledVpcs} VPCs.
                Destination cards show authoritative domains alongside IPs.
              </>
            ) : enabledVpcs > 0 ? (
              <>
                Active on {enabledVpcs} of {totalVpcs} VPCs —{" "}
                <span className="font-semibold text-amber-100">
                  {missingVpcs} missing
                </span>
                . Workloads in uncovered VPCs egress without domain attribution.
              </>
            ) : (
              <>
                Not enabled. Destination cards show only IPs and reverse-DNS PTR (partial).
                Enable Resolver Query Logs to capture every domain the VPC asks for —{" "}
                <code className="font-mono text-slate-300">api.stripe.com</code> instead of
                shared CDN IP ranges. Whitelistable, stable, customer-facing.
              </>
            )}
          </div>
        </div>
        {!allEnabled && missingVpcIds.length > 0 && (
          <button
            type="button"
            onClick={handleEnable}
            disabled={enabling}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              enabling
                ? "border-slate-700 bg-slate-900 text-slate-500 cursor-wait"
                : "border-emerald-500/60 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
            }`}
          >
            {enabling ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Enabling…
              </>
            ) : (
              <>
                Enable on {missingVpcIds.length} VPC{missingVpcIds.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        )}
      </div>
      {enableResult && (
        <div className="mt-2 pl-7 text-[11px] text-slate-300 leading-relaxed">
          <span className="font-semibold text-emerald-200">
            {enableResult.created?.length ?? 0} created.
          </span>{" "}
          Logs flow within ~30 sec. First domain edges appear after the next
          collector tick (within 30 min).
          {(enableResult.errors?.length ?? 0) > 0 && (
            <div className="mt-1 text-rose-300">
              {enableResult.errors!.length} VPC{enableResult.errors!.length === 1 ? "" : "s"} failed:{" "}
              {enableResult.errors!.map((e) => `${e.vpc_id} (${e.error})`).join(", ")}
            </div>
          )}
        </div>
      )}
      {err && (
        <div className="mt-2 pl-7 text-[11px] text-rose-300">{err}</div>
      )}
    </div>
  )
}
