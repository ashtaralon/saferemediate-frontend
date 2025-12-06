"use client"

export function ComplianceCard() {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
        Compliance Status
      </h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-700">PCI-DSS</span>
            <span className="text-sm font-medium text-gray-900">93%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: "93%" }}></div>
          </div>
          <button className="text-xs text-blue-600 hover:underline mt-1">View gaps & remediate →</button>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-700">SOC 2</span>
            <span className="text-sm font-medium text-gray-900">89%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-500 rounded-full" style={{ width: "89%" }}></div>
          </div>
          <button className="text-xs text-blue-600 hover:underline mt-1">View gaps & remediate →</button>
        </div>
      </div>
    </div>
  )
}

