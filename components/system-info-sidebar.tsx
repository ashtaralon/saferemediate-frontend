"use client"

interface SystemInfoSidebarProps {
  onSeverityFilter?: (severity: string | null) => void
  onResourceTypeFilter?: (type: string | null) => void
  selectedSeverity?: string | null
  selectedResourceType?: string | null
}

export function SystemInfoSidebar({
  onSeverityFilter,
  onResourceTypeFilter,
  selectedSeverity,
  selectedResourceType,
}: SystemInfoSidebarProps) {
  const severityData = [
    { label: "Critical", count: 7, color: "#ef4444" },
    { label: "High", count: 19, color: "#f97316" },
    { label: "Medium", count: 42, color: "#fbbf24" },
    { label: "Low", count: 88, color: "#3b82f6" },
    { label: "Healthy", count: 1204, color: "#10b981" },
  ]

  const resourceTypes = [
    { label: "Compute", count: 412 },
    { label: "Network", count: 167 },
    { label: "Data", count: 220 },
    { label: "Storage", count: 166 },
    { label: "Identity", count: 98 },
    { label: "Security", count: 74 },
  ]

  return (
    <div className="space-y-8">
      {/* SYSTEM INFO Section */}
      <div>
        <h3 className="text-xs uppercase tracking-wider mb-4 font-semibold" style={{ color: "var(--text-muted)" }}>
          SYSTEM INFO
        </h3>
        <div className="space-y-3">
          <div
            className="flex justify-between items-center py-2 border-b"
            style={{ borderColor: "rgba(75, 85, 99, 0.5)" }}
          >
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Account
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              prod-123
            </span>
          </div>
          <div
            className="flex justify-between items-center py-2 border-b"
            style={{ borderColor: "rgba(75, 85, 99, 0.5)" }}
          >
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Region
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              us-east-1
            </span>
          </div>
          <div
            className="flex justify-between items-center py-2 border-b"
            style={{ borderColor: "rgba(75, 85, 99, 0.5)" }}
          >
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Environment
            </span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Production
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Provider
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              AWS
            </span>
          </div>
        </div>
      </div>

      {/* SEVERITY COUNTS Section */}
      <div>
        <h3 className="text-xs uppercase tracking-wider mb-4 font-semibold" style={{ color: "var(--text-muted)" }}>
          SEVERITY COUNTS
        </h3>
        <div className="space-y-2">
          {severityData.map((item) => (
            <button
              key={item.label}
              onClick={() => onSeverityFilter?.(selectedSeverity === item.label ? null : item.label)}
              className={`w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-all ${
                selectedSeverity === item.label ? "bg-gray-800" : "hover:bg-gray-800/50"
              }`}
              style={
                selectedSeverity === item.label ? { borderLeft: `3px solid ${item.color}`, paddingLeft: "13px" } : {}
              }
            >
              <div className="w-1 h-8 rounded" style={{ background: item.color }} />
              <span className="text-sm flex-1 text-left" style={{ color: "var(--text-secondary)" }}>
                {item.label}
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {item.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* RESOURCE TYPES Section */}
      <div>
        <h3 className="text-xs uppercase tracking-wider mb-4 font-semibold" style={{ color: "var(--text-muted)" }}>
          RESOURCE TYPES
        </h3>
        <div className="space-y-2">
          {resourceTypes.map((item) => (
            <button
              key={item.label}
              onClick={() => onResourceTypeFilter?.(selectedResourceType === item.label ? null : item.label)}
              className={`w-full flex justify-between items-center py-2 px-2 -mx-2 rounded-lg text-sm transition-all ${
                selectedResourceType === item.label ? "bg-gray-800" : "hover:bg-gray-800/50"
              }`}
              style={
                selectedResourceType === item.label
                  ? { borderLeft: "3px solid var(--action-primary)", paddingLeft: "13px" }
                  : {}
              }
            >
              <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
