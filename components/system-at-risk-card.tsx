"use client"

interface SystemAtRiskCardProps {
  system: {
    name: string
    health: number
    critical: number
    high: number
    severity: "critical" | "high"
  }
}

export function SystemAtRiskCard({ system }: SystemAtRiskCardProps) {
  const borderColor = system.severity === "critical" ? "#DC2626" : "#F59E0B"

  const healthColor = "#F97316"

  return (
    <div
      className="bg-white rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
      style={{
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div className="space-y-3">
        {/* System name */}
        <h3 className="text-base font-bold text-gray-900">{system.name}</h3>

        {/* Health score with orange circle */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: healthColor }} />
          <span className="text-sm text-gray-700">Health: {system.health}/100</span>
        </div>

        {/* Badge row */}
        <div className="flex gap-2 flex-wrap">
          {system.critical > 0 && (
            <span className="px-2.5 py-1 rounded bg-red-600 text-white text-xs font-semibold">
              {system.critical} Critical
            </span>
          )}
          {system.high > 0 && (
            <span className="px-2.5 py-1 rounded bg-orange-600 text-white text-xs font-semibold">
              {system.high} High
            </span>
          )}
        </div>

        {/* View System link */}
        <div className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors">View System →</div>
      </div>
    </div>
  )
}
