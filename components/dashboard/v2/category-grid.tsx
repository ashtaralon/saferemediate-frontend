"use client"

import { useMemo } from "react"
import { Shield, Network, Database, Cpu, Key } from "lucide-react"
import { DashboardCard, DashboardEmptyState } from "./dashboard-card"
import { StatusChip } from "./status-chip"
import { relativeTime, type SourceState } from "./use-home-data"

interface CategoryGridProps {
  state: SourceState<any[]>
  onRetry: () => void
}

type CategoryKey = "iam" | "network" | "data" | "compute" | "secrets"

const CATEGORY_DEFS: Array<{
  key: CategoryKey
  label: string
  icon: typeof Shield
  resourceTypes: string[]
}> = [
  { key: "iam", label: "IAM", icon: Shield, resourceTypes: ["IAMRole", "IAMPolicy", "IAMUser", "IAMGroup"] },
  { key: "network", label: "Network", icon: Network, resourceTypes: ["SecurityGroup", "NetworkACL", "VPC", "Subnet", "InternetGateway", "RouteTable"] },
  { key: "data", label: "Data", icon: Database, resourceTypes: ["S3Bucket", "S3", "RDSInstance", "RDS", "DynamoDBTable", "DynamoDB", "KMS", "KMSKey"] },
  { key: "compute", label: "Compute", icon: Cpu, resourceTypes: ["EC2Instance", "EC2", "Lambda", "LambdaFunction", "ECSService", "ECSTask", "EKSCluster"] },
  { key: "secrets", label: "Secrets", icon: Key, resourceTypes: ["Secret", "SecretsManagerSecret", "SSMParameter"] },
]

const RESOURCE_TO_CATEGORY: Record<string, CategoryKey> = CATEGORY_DEFS.reduce(
  (acc, def) => {
    for (const rt of def.resourceTypes) acc[rt] = def.key
    return acc
  },
  {} as Record<string, CategoryKey>,
)

export function CategoryGrid({ state, onRetry }: CategoryGridProps) {
  const findings = state.data ?? []

  const buckets = useMemo(() => {
    const init: Record<CategoryKey, { total: number; critical: number; high: number }> = {
      iam: { total: 0, critical: 0, high: 0 },
      network: { total: 0, critical: 0, high: 0 },
      data: { total: 0, critical: 0, high: 0 },
      compute: { total: 0, critical: 0, high: 0 },
      secrets: { total: 0, critical: 0, high: 0 },
    }
    for (const f of findings as any[]) {
      const rt = f?.resourceType || f?.resource_type
      const cat = rt ? RESOURCE_TO_CATEGORY[rt] : undefined
      if (!cat) continue
      const sev = String(f?.severity || "").toUpperCase()
      init[cat].total += 1
      if (sev === "CRITICAL") init[cat].critical += 1
      if (sev === "HIGH") init[cat].high += 1
    }
    return init
  }, [findings])

  const totalCategorized = CATEGORY_DEFS.reduce((sum, d) => sum + buckets[d.key].total, 0)

  return (
    <DashboardCard
      title="Findings by category"
      description={totalCategorized > 0 ? `${totalCategorized} findings across ${findings.length} total` : undefined}
      loading={state.loading}
      error={state.error ?? null}
      onRetry={onRetry}
      freshness={relativeTime(state.fetchedAt)}
    >
      {findings.length === 0 ? (
        <DashboardEmptyState title="No findings in this system" />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORY_DEFS.map((def) => {
            const b = buckets[def.key]
            const Icon = def.icon
            return (
              <div
                key={def.key}
                className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {def.label}
                  </div>
                </div>
                <div className="text-xl font-semibold tabular-nums text-slate-900">{b.total}</div>
                <div className="flex flex-wrap gap-1">
                  {b.critical > 0 ? <StatusChip tone="red">C · {b.critical}</StatusChip> : null}
                  {b.high > 0 ? <StatusChip tone="amber">H · {b.high}</StatusChip> : null}
                  {b.total === 0 ? <StatusChip tone="green">clean</StatusChip> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </DashboardCard>
  )
}
