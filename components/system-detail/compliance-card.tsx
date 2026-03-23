"use client"

export function ComplianceCard() {
  return (
    <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
      <h3 className="text-sm font-semibold text-[var(--foreground,#111827)] uppercase tracking-wide mb-4">
        Compliance Status
      </h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm text-[var(--foreground,#374151)]">PCI-DSS</span>
            <span className="text-sm font-medium text-[var(--foreground,#111827)]">93%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#22c55e10]0 rounded-full" style={{ width: "93%" }}></div>
          </div>
          <button className="text-xs text-[#3b82f6] hover:underline mt-1">View gaps & remediate →</button>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm text-[var(--foreground,#374151)]">SOC 2</span>
            <span className="text-sm font-medium text-[var(--foreground,#111827)]">89%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#eab30810]0 rounded-full" style={{ width: "89%" }}></div>
          </div>
          <button className="text-xs text-[#3b82f6] hover:underline mt-1">View gaps & remediate →</button>
        </div>
      </div>
    </div>
  )
}







