"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  Globe2,
  Info,
  Zap as LambdaIcon,
  Layers,
  Loader2,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { fetchSharedSGs, postSGSplitPlan } from "@/lib/api-client"
import type { SharedSG, SharedSGsResponse } from "@/lib/types"

// Mirror of components/iam-shared-roles-list-view.tsx for shared
// Security Groups. SG-9 v1: discovery surface only. Plan detail +
// execute/rollback flow are a follow-up.

interface Filters {
  minConsumers: number
  includeInactive: boolean
}

const DEFAULT_FILTERS: Filters = {
  minConsumers: 2,
  includeInactive: false,
}

export default function SGSharedSGsListView() {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [data, setData] = useState<SharedSGsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSharedSGs({
      minConsumers: filters.minConsumers,
      includeInactive: filters.includeInactive,
    })
      .then((resp) => {
        if (!cancelled) setData(resp)
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e?.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters.minConsumers, filters.includeInactive, reloadKey])

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">Shared Security Groups</h1>
          </div>
          {data?.discovered_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>as of {new Date(data.discovered_at).toLocaleString()}</span>
              <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Security Groups attached to ≥{filters.minConsumers} consumers with
          over-permission evidence. Operator can split each into per-system
          scoped SGs — same lifecycle as IAM shared-roles (mint plan → approve
          → CREATE_ONLY → STAGED). Discovery is read-only.
        </p>
      </header>

      {/* Evidence-completeness banner — honest labeling when SG-0 sub-items pending */}
      {data?.evidence_completeness === "degraded" && data.sg0_pending_items.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3">
          <Info className="w-4 h-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
          <div className="space-y-1 text-xs">
            <div className="font-medium text-amber-900 dark:text-amber-100">
              Evidence: degraded
            </div>
            <ul className="list-disc list-inside text-amber-800 dark:text-amber-200">
              {data.sg0_pending_items.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="min-consumers" className="text-xs">Min consumers</Label>
            <Input
              id="min-consumers"
              type="number"
              min={2}
              max={100}
              value={filters.minConsumers}
              onChange={(e) => setFilters((f) => ({
                ...f, minConsumers: Math.max(2, Number(e.target.value) || 2),
              }))}
              className="w-20 h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-inactive"
              checked={filters.includeInactive}
              onCheckedChange={(checked) => setFilters((f) => ({
                ...f, includeInactive: Boolean(checked),
              }))}
            />
            <Label htmlFor="include-inactive" className="text-xs cursor-pointer">
              Include soft-deleted SGs
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Body */}
      {loading && !data && (
        <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading shared SGs…</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="text-xs text-muted-foreground">
            Showing {data.shared_sgs.length} candidate{data.shared_sgs.length === 1 ? "" : "s"}
          </div>
          {data.shared_sgs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No shared SGs found with these filters.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.shared_sgs.map((sg) => (
                <SharedSGCard key={sg.sg_id} sg={sg} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ───────────────────────────────────────────────────────────────────


function SharedSGCard({ sg }: { sg: SharedSG }) {
  const router = useRouter()
  const { verdict, consumer_breakdown: bd, rule_summary: rs, topology } = sg
  const isDefault = (sg.sg_name || "").toLowerCase() === "default"
  const [minting, setMinting] = useState(false)
  const [mintError, setMintError] = useState<string | null>(null)

  const handleMint = async () => {
    setMinting(true)
    setMintError(null)
    try {
      const result = await postSGSplitPlan(sg.sg_id, "alon")
      router.push(`/sg/shared-sgs/by-plan/${encodeURIComponent(result.plan_id)}`)
    } catch (e: any) {
      setMintError(String(e?.message ?? e))
      setMinting(false)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold truncate flex items-center gap-2">
            <Network className="w-4 h-4 shrink-0 text-zinc-500" />
            <span className="truncate" title={sg.sg_name || sg.sg_id}>
              {sg.sg_name || sg.sg_id}
            </span>
          </CardTitle>
          {isDefault && (
            <Badge variant="outline" className="text-[10px] shrink-0">default</Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono truncate" title={sg.sg_id}>
          {sg.sg_id}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <Badge variant="secondary" className="font-normal">
            {sg.consumer_count} consumer{sg.consumer_count === 1 ? "" : "s"}
          </Badge>
          {sg.vpc_id && (
            <Badge variant="outline" className="font-mono font-normal">
              {sg.vpc_id}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pt-0">
        {/* Consumer breakdown */}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Consumer breakdown
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {bd.lambda > 0 && (
              <span className="inline-flex items-center gap-1">
                <LambdaIcon className="w-3 h-3 text-zinc-500" />
                {bd.lambda} Lambda
              </span>
            )}
            {bd.ec2 > 0 && (
              <span className="inline-flex items-center gap-1">
                <Server className="w-3 h-3 text-zinc-500" />
                {bd.ec2} EC2
              </span>
            )}
            {bd.rds > 0 && (
              <span className="inline-flex items-center gap-1">
                <Database className="w-3 h-3 text-zinc-500" />
                {bd.rds} RDS
              </span>
            )}
            {bd.load_balancer > 0 && (
              <span className="inline-flex items-center gap-1">
                <Layers className="w-3 h-3 text-zinc-500" />
                {bd.load_balancer} LB
              </span>
            )}
            {bd.network_interface > 0 && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Globe2 className="w-3 h-3" />
                {bd.network_interface} ENI
              </span>
            )}
          </div>
        </div>

        {/* Rule summary */}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Rules
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span>{rs.inbound} in / {rs.outbound} out</span>
            {rs.unused > 0 && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {rs.unused} unused
              </Badge>
            )}
            {rs.high_risk > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] font-normal border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
              >
                <ShieldAlert className="w-3 h-3 mr-1" />
                {rs.high_risk} high-risk
              </Badge>
            )}
            {rs.has_public_ingress && (
              <Badge
                variant="outline"
                className="text-[10px] font-normal border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
              >
                public ingress
              </Badge>
            )}
          </div>
        </div>

        {/* Systems + topology indicators */}
        {(topology.systems.length > 0 ||
          topology.external_in_ref_ids.length > 0 ||
          topology.external_out_ref_ids.length > 0 ||
          topology.self_ref_ingress ||
          topology.self_ref_egress) && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Topology
            </div>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {topology.systems.map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">
                  {s}
                </Badge>
              ))}
              {(topology.self_ref_ingress || topology.self_ref_egress) && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
                >
                  self-ref
                </Badge>
              )}
              {topology.external_in_ref_ids.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
                >
                  {topology.external_in_ref_ids.length} ext-in-ref
                </Badge>
              )}
              {topology.external_out_ref_ids.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
                >
                  {topology.external_out_ref_ids.length} ext-out-ref
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Multi-verdict matrix */}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Verdict
          </div>
          <div className="flex flex-wrap gap-1.5">
            <VerdictPill label="discovery" ok={verdict.discovery_candidate} />
            <VerdictPill label="proposal" ok={verdict.proposal_allowed} />
            <VerdictPill label="create_only" ok={verdict.create_only_allowed} />
            <VerdictPill label="staged" ok={verdict.staged_allowed} />
          </div>
          {verdict.blocked_reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {verdict.blocked_reasons.slice(0, 3).map((b, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle
                    className={`w-3 h-3 mt-0.5 shrink-0 ${
                      b.severity === "hard" ? "text-red-500" : "text-amber-500"
                    }`}
                  />
                  <span>
                    <span className="font-mono">{b.code}</span>
                    {" "}
                    <span className="text-[10px] opacity-60">
                      [{b.phase_blocked}/{b.severity}]
                    </span>
                  </span>
                </li>
              ))}
              {verdict.blocked_reasons.length > 3 && (
                <li className="text-[10px] opacity-60 pl-4">
                  +{verdict.blocked_reasons.length - 3} more…
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Mint plan CTA — only when proposal is allowed */}
        <div className="pt-3 mt-auto border-t border-zinc-100 dark:border-zinc-800">
          <Button
            variant={verdict.proposal_allowed ? "default" : "outline"}
            size="sm"
            className="w-full"
            onClick={handleMint}
            disabled={minting || !verdict.proposal_allowed}
            title={
              verdict.proposal_allowed
                ? "Mint a split plan for this SG"
                : "Proposal not allowed — see blockers above"
            }
          >
            {minting ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Minting…
              </>
            ) : (
              "Mint split plan"
            )}
          </Button>
          {mintError && (
            <div className="mt-2 text-[10px] text-red-700 dark:text-red-300 break-all">
              {mintError}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}


function VerdictPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        ok
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
          : "bg-zinc-50 text-zinc-500 border border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-500 dark:border-zinc-800"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-zinc-400"}`} />
      {label}
    </span>
  )
}
