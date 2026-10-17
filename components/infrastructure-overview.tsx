"use client"

import type { InfrastructureCounts } from "@/lib/api-client"

interface InfrastructureOverviewProps {
  /** As measured: a kind the source did not count is null, and no source at all is null. */
  stats?: Partial<InfrastructureCounts> | null
}

const INFRA_ITEMS: { key: keyof InfrastructureCounts; label: string; category: string }[] = [
  { key: "containerClusters", label: "Container Clusters", category: "CONTAINER" },
  { key: "kubernetesWorkloads", label: "Kubernetes Workloads", category: "KUBERNETES" },
  { key: "standaloneVMs", label: "Standalone VMs", category: "VM" },
  { key: "vmScalingGroups", label: "VM Scaling groups", category: "SCALING" },
  { key: "relationalDatabases", label: "Relational Databases", category: "DATABASE" },
  { key: "blockStorage", label: "Block Storage", category: "STORAGE" },
  { key: "fileStorage", label: "File Storage", category: "FILES" },
  { key: "objectStorage", label: "Object Storage", category: "OBJECT" },
]

/**
 * One tile per kind a source counted. A kind nothing counted gets no tile -- it
 * used to render 0, which read as a measured "0 clusters" -- and with no counts
 * at all the section is not rendered.
 */
export function InfrastructureOverview({ stats }: InfrastructureOverviewProps) {
  const items = INFRA_ITEMS.flatMap((item) => {
    const value = stats?.[item.key]
    return typeof value === "number" && Number.isFinite(value) ? [{ ...item, value }] : []
  })
  if (items.length === 0) return null

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-[var(--foreground,#111827)]">Infrastructure Overview</h2>
      <div className="grid grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.label} className="bg-white rounded-lg p-4 border border-[var(--border,#e5e7eb)]">
            <div className="text-xs text-[var(--muted-foreground,#6b7280)] mb-1">{item.category}</div>
            <div className="text-3xl font-bold text-[var(--foreground,#111827)]">{item.value}</div>
            <div className="text-sm text-[var(--muted-foreground,#4b5563)] mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
