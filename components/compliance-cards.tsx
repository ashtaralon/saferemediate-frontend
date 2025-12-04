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
          <h2 className="text-xl font-semibold text-gray-900">Compliance Issues Requiring Attention</h2>
          <p className="text-sm text-gray-600">4 systems with compliance scores below 90%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {systems.map((system) => (
          <div
            key={system.name}
            className="bg-white rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{system.name}</h3>
                  {system.environment && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{system.environment}</span>
                  )}
                  {system.standard && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">{system.standard}</span>
                  )}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-red-600">{system.criticalGaps} Critical Gaps</span> •{" "}
                  {system.passedControls}/{system.totalControls} controls
                </div>
                {system.owner && <div className="text-xs text-gray-500 mt-1">Owner: {system.owner}</div>}
              </div>

              <div className="text-right">
                <div
                  className={`text-2xl font-bold ${
                    system.score >= 90 ? "text-green-600" : system.score >= 80 ? "text-orange-600" : "text-red-600"
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
