"use client"

import { useState } from "react"
import { PlanePulse, MOCK_PLANE_PULSE_DATA } from "@/components/security-posture/PlanePulse"
import { CommandQueues, MOCK_COMMAND_QUEUES_DATA } from "@/components/security-posture/CommandQueues"
import type { TimeWindow, ConfidenceLevel } from "@/components/security-posture/types"

export default function TestSecurityPosturePage() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("30d")
  const [minConfidence, setMinConfidence] = useState<ConfidenceLevel>("low")

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Security Posture</h1>
            <p className="text-indigo-200 text-sm">alon-prod - Allowed vs Observed Analysis (Test Page)</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-3xl font-bold">57</div>
              <div className="text-indigo-200 text-xs">Removal Candidates</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-red-300">4</div>
              <div className="text-indigo-200 text-xs">High Risk</div>
            </div>
          </div>
        </div>
      </div>

      {/* Plane Pulse Section */}
      <div className="px-6 py-4 border-b bg-white">
        <PlanePulse
          data={MOCK_PLANE_PULSE_DATA}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          onFixCoverage={() => alert("Fix Coverage clicked!")}
        />
      </div>

      {/* Command Queues Section */}
      <div className="px-6 py-4 bg-gray-50">
        <CommandQueues
          data={MOCK_COMMAND_QUEUES_DATA}
          minConfidence={minConfidence}
          onMinConfidenceChange={setMinConfidence}
          onCardClick={(item, queue) => alert(`Clicked ${item.resource_name} in ${queue}`)}
          onCTAClick={(item, queue) => alert(`CTA: ${item.recommended_action.cta_label} for ${item.resource_name}`)}
        />
      </div>
    </div>
  )
}
