"use client"

import { useState } from "react"
import { TrendingDown } from "lucide-react"
import { CriticalFindingsModal } from "./critical-findings-modal"
import { SimulateFixModal } from "./issues/SimulateFixModal"

export function SystemHealthSection() {
  const [showCriticalModal, setShowCriticalModal] = useState(false)
  const [showSimulateModal, setShowSimulateModal] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<any>(null)

  const handleSimulateFix = (finding: any) => {
<<<<<<< HEAD:components/system-health-section.tsx
    setSelectedFinding(finding)
=======
    // Ensure finding has required properties including id
    const safeFinding = {
      id: finding?.id || finding?.findingId || `finding-${Date.now()}`,
      title: finding?.title || finding?.description || "Security Finding",
      icon: finding?.icon || "⚠️"
    }
    setSelectedFinding(safeFinding)
>>>>>>> e1c24ef (Wire SIMULATE FIX and AUTO-FIX buttons to backend API):components/dashboard/system-health-section.tsx
    setShowCriticalModal(false)
    setShowSimulateModal(true)
  }

<<<<<<< HEAD:components/system-health-section.tsx
=======
  const handleAutoFix = async (finding: any) => {
    const issueId = finding?.id || finding?.findingId
    if (!issueId) {
      alert("Error: Finding ID is required for auto-fix")
      return
    }

    if (!confirm(`Are you sure you want to automatically fix "${finding?.title || 'this issue'}"? This will modify your infrastructure.`)) {
      return
    }

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://saferemediate-backend.onrender.com'
    const API_URL = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`

    try {
      setLoading(true)
      const res = await fetch(`${API_URL}/simulation/issue/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, confirm: true }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(errorData.detail || `Fix failed: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      if (data.status === "success") {
        alert("Issue fixed successfully! The page will reload to show updated status.")
        window.location.reload()
      }
    } catch (err) {
      console.error("Fix failed", err)
      alert(`Auto-fix failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const healthScore = healthData?.healthScore || 72
  const criticalCount = healthData?.criticalCount || 0

>>>>>>> e1c24ef (Wire SIMULATE FIX and AUTO-FIX buttons to backend API):components/dashboard/system-health-section.tsx
  return (
    <>
      <div className="space-y-6">
        {/* Health Score Row */}
        <div className="grid grid-cols-[auto_auto_1fr] gap-6 items-center">
          {/* Health Circle */}
          <div className="flex flex-col items-center">
            <div className="relative w-[180px] h-[180px]">
              <svg className="w-full h-full -rotate-90">
                {/* Background circle */}
                <circle cx="90" cy="90" r="80" fill="none" stroke="#374151" strokeWidth="12" />
                {/* Progress circle */}
                <circle
                  cx="90"
                  cy="90"
                  r="80"
                  fill="none"
                  stroke="url(#healthGradient)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(72 / 100) * 2 * Math.PI * 80} ${2 * Math.PI * 80}`}
                />
                <defs>
                  <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#DC2626" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[60px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>
                  72
                </span>
                <span className="text-xl" style={{ color: "var(--text-secondary)" }}>
                  /100
                </span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--critical)" }}>
                CRITICAL
              </div>
              <div className="flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                <TrendingDown className="w-4 h-4" />
                <span>degrading</span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                -8 vs last week
              </div>
            </div>
          </div>

          {/* Critical Badge */}
          <button
            onClick={() => setShowCriticalModal(true)}
            className="w-[120px] h-[100px] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 hover:brightness-110"
            style={{ background: "var(--critical)" }}
          >
            <div className="text-4xl font-bold text-white">7</div>
            <div className="text-xs font-semibold text-white mt-1">CRITICAL</div>
          </button>

          {/* Action Button */}
          <button
            className="w-[120px] h-[40px] rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 ml-6"
            style={{ background: "var(--action-primary)" }}
          >
            <span>▶</span>
            <span>START FIXING</span>
          </button>
        </div>

        {/* System Status Card */}
        <div
          className="rounded-xl p-5 border"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border-subtle)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
          }}
        >
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            System Health - payment-prod
          </h2>
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
            Production • AWS us-east-1 • Last scan: 2 min ago
          </p>
          <div className="flex items-center gap-4 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>
              🟢 In production hours • Next maintenance window in 4 hours
            </span>
            <span
              className="px-3 py-1 rounded text-xs font-semibold text-white"
              style={{ background: "var(--critical)" }}
            >
              Traffic: HIGH
            </span>
          </div>
        </div>
      </div>

      {/* Modal Components */}
      <CriticalFindingsModal
        isOpen={showCriticalModal}
        onClose={() => setShowCriticalModal(false)}
        onSimulateFix={handleSimulateFix}
<<<<<<< HEAD:components/system-health-section.tsx
=======
        onAutoFix={handleAutoFix}
        findings={[]} // Pass empty array - real findings will come from API
>>>>>>> e1c24ef (Wire SIMULATE FIX and AUTO-FIX buttons to backend API):components/dashboard/system-health-section.tsx
      />

      {selectedFinding && (
        <SimulateFixModal
          open={showSimulateModal}
          onClose={() => {
            setShowSimulateModal(false)
            setSelectedFinding(null)
          }}
          finding={selectedFinding}
        />
      )}
    </>
  )
}
