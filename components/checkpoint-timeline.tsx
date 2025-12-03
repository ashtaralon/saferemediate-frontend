"use client"

import { useState } from "react"
import { CreateCheckpointModal } from "./create-checkpoint-modal"
import { RestoreCheckpointModal } from "./restore-checkpoint-modal"

interface Checkpoint {
  id: string
  date: string
  time: string
  changes: number
  status: "stable" | "incident" | "rollback"
  healthScore: number
  author: string
  x: number
}

interface CheckpointTimelineProps {
  checkpoints?: Checkpoint[]
  onCreateCheckpoint?: () => void
  onRestoreCheckpoint?: (checkpoint: Checkpoint) => void
}

export function CheckpointTimeline({
  checkpoints = [],
  onCreateCheckpoint,
  onRestoreCheckpoint,
}: CheckpointTimelineProps) {
  const [hoveredCheckpoint, setHoveredCheckpoint] = useState<string | null>(null)
  const [selectedZoom, setSelectedZoom] = useState<"7d" | "30d" | "90d" | "1y">("30d")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "stable":
        return "#10B981"
      case "incident":
        return "#DC2626"
      case "rollback":
        return "#F97316"
      default:
        return "#6B7280"
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "stable":
        return "Stable"
      case "incident":
        return "Incident"
      case "rollback":
        return "Rollback"
      default:
        return "Unknown"
    }
  }

  const handleRestore = (checkpoint: Checkpoint) => {
    setSelectedCheckpoint(checkpoint)
    setShowRestoreModal(true)
    onRestoreCheckpoint?.(checkpoint)
  }

  if (checkpoints.length === 0) {
    return (
      <div
        className="rounded-xl p-6 border"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Configuration History & Checkpoints
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Track configuration changes and rollback to any point
            </p>
          </div>
        </div>

        <div className="text-center py-12">
          <div className="text-6xl mb-4">📸</div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            No Checkpoints Yet
          </h3>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Create your first checkpoint to track configuration changes
          </p>
          <button
            onClick={() => {
              setShowCreateModal(true)
              onCreateCheckpoint?.()
            }}
            className="px-6 py-3 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: "var(--action-primary)" }}
          >
            Create First Checkpoint
          </button>
        </div>

        <CreateCheckpointModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      </div>
    )
  }

  return (
    <>
      <div
        className="rounded-xl p-6 border"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Configuration History & Checkpoints
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Track configuration changes and rollback to any point
            </p>
          </div>

          <div className="flex gap-2">
            {(["7d", "30d", "90d", "1y"] as const).map((zoom) => (
              <button
                key={zoom}
                onClick={() => setSelectedZoom(zoom)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: selectedZoom === zoom ? "var(--action-primary)" : "transparent",
                  color: selectedZoom === zoom ? "white" : "var(--text-secondary)",
                  border: selectedZoom === zoom ? "none" : "1px solid var(--border)",
                }}
              >
                {zoom === "7d" && "Last 7 days"}
                {zoom === "30d" && "Last 30 days"}
                {zoom === "90d" && "Last 90 days"}
                {zoom === "1y" && "Last year"}
              </button>
            ))}
          </div>
        </div>

        <div className="relative h-[300px] mb-6 rounded-lg p-6" style={{ background: "var(--bg-primary)" }}>
          <svg width="100%" height="100%" viewBox="0 0 1100 250">
            {[0, 50, 100, 150, 200].map((y) => (
              <line key={y} x1="50" y1={y} x2="1050" y2={y} stroke="#374151" strokeWidth="1" opacity="0.2" />
            ))}

            <defs>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {checkpoints.length > 1 && (
              <path
                d={`M ${checkpoints.map((cp, i) => `${cp.x},${150 - (cp.healthScore - 50)}`).join(" L ")} L ${checkpoints[checkpoints.length - 1].x},200 L ${checkpoints[0].x},200 Z`}
                fill="url(#areaGradient)"
                stroke="#3B82F6"
                strokeWidth="2"
              />
            )}

            <line x1="100" y1="200" x2="1000" y2="200" stroke="#4B5563" strokeWidth="2" />

            {checkpoints.map((cp) => {
              const color = getStatusColor(cp.status)
              const isHovered = hoveredCheckpoint === cp.id

              return (
                <g
                  key={cp.id}
                  onMouseEnter={() => setHoveredCheckpoint(cp.id)}
                  onMouseLeave={() => setHoveredCheckpoint(null)}
                  style={{ cursor: "pointer" }}
                >
                  {isHovered && <circle cx={cp.x} cy="200" r="20" fill={color} opacity="0.2" />}

                  <circle
                    cx={cp.x}
                    cy="200"
                    r={isHovered ? "12" : "10"}
                    fill={color}
                    stroke="white"
                    strokeWidth="3"
                    style={{ transition: "all 0.2s" }}
                  />

                  <text x={cp.x} y="230" textAnchor="middle" fontSize="11" fill="#9CA3AF" fontWeight="600">
                    {cp.date}
                  </text>

                  {isHovered && (
                    <g>
                      <rect
                        x={cp.x - 80}
                        y="50"
                        width="160"
                        height="90"
                        fill="#252D3D"
                        stroke="#4B5563"
                        strokeWidth="1"
                        rx="8"
                      />
                      <text x={cp.x} y="70" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold">
                        {cp.date}, {cp.time}
                      </text>
                      <text x={cp.x} y="88" textAnchor="middle" fontSize="11" fill="#9CA3AF">
                        {cp.changes} config changes
                      </text>
                      <text x={cp.x} y="104" textAnchor="middle" fontSize="11" fill="#9CA3AF">
                        Status: {getStatusLabel(cp.status)}
                      </text>
                      <text x={cp.x} y="120" textAnchor="middle" fontSize="11" fill="#9CA3AF">
                        Health: {cp.healthScore}/100
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="space-y-3">
          {checkpoints.map((cp) => (
            <div
              key={cp.id}
              className="flex items-center justify-between p-4 rounded-lg border transition-all hover:border-opacity-70"
              style={{
                background: "var(--bg-primary)",
                borderColor: hoveredCheckpoint === cp.id ? getStatusColor(cp.status) : "var(--border-subtle)",
              }}
              onMouseEnter={() => setHoveredCheckpoint(cp.id)}
              onMouseLeave={() => setHoveredCheckpoint(null)}
            >
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full" style={{ background: getStatusColor(cp.status) }} />
                <div>
                  <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                    {cp.date}, {cp.time} • {cp.changes} changes
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {getStatusLabel(cp.status)} • Health: {cp.healthScore}/100 • By {cp.author}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleRestore(cp)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: "var(--action-primary)" }}
              >
                ⟲ Restore to this point
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <button
            onClick={() => {
              setShowCreateModal(true)
              onCreateCheckpoint?.()
            }}
            className="w-full px-4 py-3 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: "var(--action-primary)" }}
          >
            Create checkpoint now
          </button>
        </div>
      </div>

      <CreateCheckpointModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />

      {selectedCheckpoint && (
        <RestoreCheckpointModal
          isOpen={showRestoreModal}
          onClose={() => {
            setShowRestoreModal(false)
            setSelectedCheckpoint(null)
          }}
          checkpoint={selectedCheckpoint}
        />
      )}
    </>
  )
}
