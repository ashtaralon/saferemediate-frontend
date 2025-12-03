"use client"

interface InfrastructureStats {
  containerClusters?: number
  kubernetesWorkloads?: number
  standaloneVMs?: number
  vmScalingGroups?: number
  relationalDatabases?: number
  blockStorage?: number
  fileStorage?: number
  objectStorage?: number
}

interface InfrastructureOverviewProps {
  stats?: InfrastructureStats
}

export function InfrastructureOverview({ stats = {} }: InfrastructureOverviewProps) {
  const {
    containerClusters = 0,
    kubernetesWorkloads = 0,
    standaloneVMs = 0,
    vmScalingGroups = 0,
    relationalDatabases = 0,
    blockStorage = 0,
    fileStorage = 0,
    objectStorage = 0,
  } = stats

  const infraItems = [
    { label: "Container Clusters", value: containerClusters, category: "CONTAINER" },
    { label: "Kubernetes Workloads", value: kubernetesWorkloads, category: "KUBERNETES" },
    { label: "Standalone VMs", value: standaloneVMs, category: "VM" },
    { label: "VM Scaling groups", value: vmScalingGroups, category: "SCALING" },
    { label: "Relational Databases", value: relationalDatabases, category: "DATABASE" },
    { label: "Block Storage", value: blockStorage, category: "STORAGE" },
    { label: "File Storage", value: fileStorage, category: "FILES" },
    { label: "Object Storage", value: objectStorage, category: "OBJECT" },
  ]

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Infrastructure Overview</h2>
      <div className="grid grid-cols-4 gap-4">
        {infraItems.map((item) => (
          <div key={item.label} className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">{item.category}</div>
            <div className="text-3xl font-bold text-gray-900">{item.value}</div>
            <div className="text-sm text-gray-600 mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
