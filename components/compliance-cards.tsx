"use client"

interface ComplianceSystem {
  name: string
  environment?: string
  standard?: string
  score: number
  criticalGaps: number
  totalControls: number
  passedControls: number
  owner?: string
}

interface ComplianceCardsProps {
  systems?: ComplianceSystem[]
}

export function ComplianceCards({ systems = [] }: ComplianceCardsProps) {
  if (systems.length === 0) {
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground,#111827)]">Compliance Issues Requiring Attention</h2>
          <p className="text-sm text-[var(--muted-foreground,#4b5563)]">4 systems with compliance scores below 90%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {systems.map((system) => (
          <div
            key={system.name}
            className="bg-white rounded-lg p-4 border border-[var(--border,#e5e7eb)] hover:border-[var(--border,#d1d5db)] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-[var(--foreground,#111827)]">{system.name}</h3>
                  {system.environment && (
                    <span className="text-xs px-2 py-0.5 bg-[#3b82f620] text-[#3b82f6] rounded">{system.environment}</span>
                  )}
                  {system.standard && (
                    <span className="text-xs px-2 py-0.5 bg-[#22c55e20] text-[#22c55e] rounded">{system.standard}</span>
                  )}
                </div>
                <div className="text-sm text-[var(--muted-foreground,#4b5563)]">
                  <span className="font-semibold text-[#ef4444]">{system.criticalGaps} Critical Gaps</span> •{" "}
                  {system.passedControls}/{system.totalControls} controls
                </div>
                {system.owner && <div className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">Owner: {system.owner}</div>}
              </div>

              <div className="text-right">
                <div
                  className={`text-2xl font-bold ${
                    system.score >= 90 ? "text-[#22c55e]" : system.score >= 80 ? "text-orange-600" : "text-[#ef4444]"
                  }`}
                >
                  {system.score}%
                </div>
                <button className="text-xs text-[#2D51DA] hover:underline mt-1">View →</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
