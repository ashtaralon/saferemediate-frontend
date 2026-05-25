"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Globe2,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { fetchSharedRoles, postSplitPlan } from "@/lib/api-client"
import type { SharedRole, SharedRolesResponse } from "@/lib/types"

interface Filters {
  minPrincipals: number
  systemName: string
  crossSystemOnly: boolean
  includeStale: boolean
  includeInactive: boolean
}

const DEFAULT_FILTERS: Filters = {
  minPrincipals: 2,
  systemName: "",
  crossSystemOnly: false,
  includeStale: false,
  includeInactive: false,
}

export default function IAMSharedRolesListView() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [data, setData] = useState<SharedRolesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSharedRoles({
      minPrincipals: filters.minPrincipals,
      systemName: filters.systemName.trim() || null,
      crossSystemOnly: filters.crossSystemOnly,
      includeStale: filters.includeStale,
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
  }, [
    filters.minPrincipals,
    filters.systemName,
    filters.crossSystemOnly,
    filters.includeStale,
    filters.includeInactive,
    reloadKey,
  ])

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Shared IAM Roles</h1>
          {data?.as_of && (
            <span className="text-xs text-zinc-700 dark:text-zinc-400">
              as of {new Date(data.as_of).toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-700 dark:text-zinc-400 max-w-2xl">
          IAM roles attached to multiple principals. Each principal inherits the
          union of the role's permissions — including the parts only used by other
          principals. Cross-system sharing widens the blast radius further.
        </p>
      </header>

      <FilterBar filters={filters} setFilters={setFilters} onReload={reload} loading={loading} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && data && (
        <ResultsList data={data} filters={filters} />
      )}
    </div>
  )
}

function FilterBar({
  filters,
  setFilters,
  onReload,
  loading,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  onReload: () => void
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-zinc-700 dark:text-zinc-400">
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="minPrincipals" className="text-xs">
            Min principals
          </Label>
          <Input
            id="minPrincipals"
            type="number"
            min={2}
            max={1000}
            value={filters.minPrincipals}
            onChange={(e) =>
              setFilters({
                ...filters,
                minPrincipals: Math.max(2, parseInt(e.target.value || "2", 10)),
              })
            }
            className="h-9"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="systemName" className="text-xs">
            System name (optional)
          </Label>
          <Input
            id="systemName"
            placeholder="e.g. alon-prod"
            value={filters.systemName}
            onChange={(e) => setFilters({ ...filters, systemName: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={filters.crossSystemOnly}
              onCheckedChange={(v) =>
                setFilters({ ...filters, crossSystemOnly: Boolean(v) })
              }
            />
            <span>Cross-system only</span>
          </label>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={loading}
            className="h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Reload
          </Button>
        </div>

        <div className="md:col-span-5 flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t">
          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-400 cursor-pointer">
            <Checkbox
              checked={filters.includeStale}
              onCheckedChange={(v) =>
                setFilters({ ...filters, includeStale: Boolean(v) })
              }
            />
            <span>Include stale attachment edges</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-400 cursor-pointer">
            <Checkbox
              checked={filters.includeInactive}
              onCheckedChange={(v) =>
                setFilters({ ...filters, includeInactive: Boolean(v) })
              }
            />
            <span>Include soft-deleted resources</span>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[200px] text-zinc-700 dark:text-zinc-400">
      <RefreshCw className="h-5 w-5 animate-spin mr-2" />
      <span className="text-sm">Loading shared roles…</span>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-l-4 border-l-red-600">
      <CardContent className="py-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">Discovery query failed</p>
          <p className="text-xs text-zinc-700 dark:text-zinc-400 break-all">{message}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ResultsList({
  data,
  filters,
}: {
  data: SharedRolesResponse
  filters: Filters
}) {
  if (data.shared_roles.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <p className="text-sm font-medium">No shared roles match these filters.</p>
          <p className="text-xs text-zinc-700 dark:text-zinc-400">
            Live query against Aura — nothing was found with{" "}
            <span className="font-mono">min_principals ≥ {filters.minPrincipals}</span>
            {filters.systemName && (
              <>
                , <span className="font-mono">system_name = {filters.systemName}</span>
              </>
            )}
            {filters.crossSystemOnly && (
              <>, <span className="font-mono">cross_system_only = true</span></>
            )}
            .
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <p className="text-xs text-zinc-700 dark:text-zinc-400">
          {data.count} role{data.count === 1 ? "" : "s"} attached to{" "}
          ≥{filters.minPrincipals} principal{filters.minPrincipals === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-4 text-xs text-zinc-700 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-600" aria-hidden />
            Same-system sharing
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-orange-600" aria-hidden />
            Cross-system sharing
            <span className="text-orange-700 dark:text-orange-300 font-medium">
              (highest severity)
            </span>
          </span>
        </div>
      </div>
      {data.shared_roles.map((role) => (
        <SharedRoleCard key={role.role_arn} role={role} />
      ))}
    </div>
  )
}

function SharedRoleCard({ role }: { role: SharedRole }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const borderColor = role.cross_system ? "border-l-orange-600" : "border-l-blue-600"
  const kindEntries = Object.entries(role.consumer_kinds)

  const openOrCreatePlan = useCallback(async () => {
    if (role.has_active_plan && role.active_plan_id) {
      router.push(`/iam/shared-roles/by-plan/${encodeURIComponent(role.active_plan_id)}`)
      return
    }
    setCreating(true)
    setError(null)
    try {
      // Self-attested identity until SSO. Same caveat as the backend
      // ApprovePlanRequest model — recorded on the plan node verbatim.
      const plan = await postSplitPlan(role.role_arn, "self@cyntro.io")
      router.push(`/iam/shared-roles/by-plan/${encodeURIComponent(plan.plan_id)}`)
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setCreating(false)
    }
  }, [role, router])

  return (
    <Card className={`border-l-4 ${borderColor} hover:shadow-md transition-shadow`}>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="text-[11px] font-medium bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 shrink-0"
              >
                <KeyRound className="h-3 w-3 mr-1" />
                IAM Role
              </Badge>
              <h3 className="text-base font-semibold truncate">
                {role.role_name}
              </h3>
            </div>
            <p className="text-[11px] font-mono text-zinc-700 dark:text-zinc-400 break-all mt-1">
              {role.role_arn}
            </p>
          </div>
          {role.cross_system && (
            <Badge
              variant="outline"
              className="border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700/50 dark:bg-orange-950/40 dark:text-orange-200 shrink-0"
            >
              <Globe2 className="h-3 w-3 mr-1" />
              Cross-system
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <Stat
            icon={<Users className="h-3.5 w-3.5" />}
            label="Principals"
            value={String(role.consumer_count)}
          />
          <KindsStat kindEntries={kindEntries} />
          <SystemsStat tags={role.system_tags} crossSystem={role.cross_system} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t text-xs text-zinc-700 dark:text-zinc-400 gap-3 flex-wrap">
          <span className="break-all">
            {role.has_active_plan
              ? `Active plan: ${role.active_plan_id}`
              : "No active split plan"}
          </span>
          <Button
            size="sm"
            variant={role.has_active_plan ? "outline" : "default"}
            onClick={openOrCreatePlan}
            disabled={creating}
          >
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Generating plan…
              </>
            ) : role.has_active_plan ? (
              "View split plan →"
            ) : (
              "Generate split plan →"
            )}
          </Button>
        </div>
        {error && (
          <p className="text-xs text-red-600 break-all">Failed: {error}</p>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-700 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  )
}

function KindsStat({ kindEntries }: { kindEntries: [string, number][] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-700 dark:text-zinc-400">
        <Layers className="h-3.5 w-3.5" />
        Principal kinds
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {kindEntries.length === 0 ? (
          <span className="text-xs text-zinc-700 dark:text-zinc-400">—</span>
        ) : (
          kindEntries.map(([kind, count]) => (
            <Badge key={kind} variant="secondary" className="text-[11px]">
              {kind}: {count}
            </Badge>
          ))
        )}
      </div>
    </div>
  )
}

function SystemsStat({
  tags,
  crossSystem,
}: {
  tags: string[]
  crossSystem: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-700 dark:text-zinc-400">
        <Globe2 className="h-3.5 w-3.5" />
        Systems
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {tags.length === 0 ? (
          <span className="text-xs text-zinc-700 dark:text-zinc-400">untagged</span>
        ) : (
          tags.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className={`text-[11px] ${
                crossSystem
                  ? "border-orange-300 dark:border-orange-700/50"
                  : ""
              }`}
            >
              {t}
            </Badge>
          ))
        )}
      </div>
    </div>
  )
}
