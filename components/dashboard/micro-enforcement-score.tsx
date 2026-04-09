"use client"

import { useState, useEffect } from "react"
import { Shield, Lock, Globe, Database, TrendingUp, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"

interface LayerScore {
  score: number
  enforced: number
  total: number
  gap: number
  gapPercent: number
  details: string
  items: Array<{ name: string; status: 'enforced' | 'exposed' | 'partial'; detail: string }>
}

interface EnforcementData {
  systemName: string
  totalScore: number
  totalGap: number
  projected: {
    totalScore: number
    privilege: number
    network: number
    data: number
    improvement: number
  }
  layers: {
    privilege: LayerScore
    network: LayerScore
    data: LayerScore
  }
  headline: string
  canClose: string
}

const LAYER_CONFIG = {
  privilege: {
    label: "Privilege",
    sublabel: "IAM Blast Radius",
    icon: Lock,
    color: "#8B5CF6",
    weight: "50%",
  },
  network: {
    label: "Network",
    sublabel: "Exposure Surface",
    icon: Globe,
    color: "#3B82F6",
    weight: "30%",
  },
  data: {
    label: "Data",
    sublabel: "Encryption & Access",
    icon: Database,
    color: "#10B981",
    weight: "20%",
  },
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e"
  if (score >= 60) return "#eab308"
  if (score >= 40) return "#f97316"
  return "#ef4444"
}

function ScoreRing({ score, size = 120, strokeWidth = 10 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const color = getScoreColor(score)

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  )
}

function LayerBar({ layer, config, projected }: {
  layer: LayerScore
  config: typeof LAYER_CONFIG.privilege
  projected: number
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = config.icon
  const improvement = projected - layer.score

  return (
    <div className="border border-[var(--border,#e5e7eb)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 hover:bg-[var(--muted,#f9fafb)] transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
          <Icon className="w-4 h-4" style={{ color: config.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-sm font-semibold text-[var(--foreground,#111827)]">{config.label}</span>
              <span className="text-xs text-[var(--muted-foreground,#6b7280)] ml-2">{config.sublabel}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold" style={{ color: getScoreColor(layer.score) }}>
                {layer.score}%
              </span>
              {improvement > 0 && (
                <span className="text-xs font-medium text-[#22c55e] flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  +{improvement}%
                </span>
              )}
            </div>
          </div>
          {/* Progress bar: current + projected */}
          <div className="relative h-2 bg-[#e5e7eb] rounded-full overflow-hidden">
            {/* Projected (lighter, behind) */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{ width: `${projected}%`, backgroundColor: `${config.color}30` }}
            />
            {/* Current (solid) */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{ width: `${layer.score}%`, backgroundColor: config.color }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">
              {layer.enforced}/{layer.total} enforced
            </span>
            <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">
              Weight: {config.weight}
            </span>
          </div>
        </div>
        <div className="ml-2 text-[var(--muted-foreground,#9ca3af)]">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && layer.items.length > 0 && (
        <div className="border-t border-[var(--border,#e5e7eb)] bg-[var(--muted,#f9fafb)] px-4 py-3 space-y-2">
          {layer.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.status === 'enforced' ? 'bg-[#22c55e]' :
                item.status === 'partial' ? 'bg-[#eab308]' : 'bg-[#ef4444]'
              }`} />
              <span className="font-medium text-[var(--foreground,#374151)] truncate flex-1" title={item.name}>
                {item.name}
              </span>
              <span className="text-[var(--muted-foreground,#6b7280)] flex-shrink-0">{item.detail}</span>
            </div>
          ))}
          {layer.gap > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--border,#e5e7eb)] text-xs text-[var(--muted-foreground,#6b7280)]">
              {layer.details}
            </div>
          )}
        </div>
      )}

      {expanded && layer.items.length === 0 && (
        <div className="border-t border-[var(--border,#e5e7eb)] bg-[var(--muted,#f9fafb)] px-4 py-3">
          <p className="text-xs text-[var(--muted-foreground,#9ca3af)]">{layer.details || "No detailed data available"}</p>
        </div>
      )}
    </div>
  )
}

interface MicroEnforcementScoreProps {
  systemName?: string
}

export function MicroEnforcementScore({ systemName = "alon-prod" }: MicroEnforcementScoreProps) {
  const [data, setData] = useState<EnforcementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await fetch(`/api/proxy/enforcement-score?systemName=${encodeURIComponent(systemName)}`, {
          cache: "no-store",
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const json = await resp.json()
        setData(json)
      } catch (e: any) {
        setError(e.message || "Failed to load")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [systemName])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] shadow-sm p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] shadow-sm p-8">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="w-8 h-8 text-[#ef4444] mb-2" />
          <p className="text-sm text-[var(--muted-foreground,#6b7280)]">Failed to load enforcement score</p>
        </div>
      </div>
    )
  }

  const scoreColor = getScoreColor(data.totalScore)
  const projectedColor = getScoreColor(data.projected.totalScore)

  return (
    <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[var(--border,#e5e7eb)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#8b5cf6]" />
            <h3 className="text-sm font-semibold text-[var(--foreground,#111827)] uppercase tracking-wide">
              Micro-Enforcement Score
            </h3>
          </div>
          <span className="text-xs bg-[#8b5cf6] text-white px-2 py-1 rounded-full font-medium">LIVE</span>
        </div>
        <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">{data.headline}</p>
      </div>

      {/* Score Hero: Today vs Projected */}
      <div className="px-6 py-6">
        <div className="flex items-center justify-center gap-8">
          {/* Today */}
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground,#9ca3af)] mb-2 font-medium">Today</p>
            <div className="relative inline-flex items-center justify-center">
              <ScoreRing score={data.totalScore} size={130} strokeWidth={10} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold" style={{ color: scoreColor }}>{data.totalScore}%</span>
                <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">enforced</span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-1">
            <TrendingUp className="w-6 h-6 text-[#22c55e]" />
            <span className="text-xs font-bold text-[#22c55e]">+{data.projected.improvement}%</span>
          </div>

          {/* With Cyntro */}
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground,#9ca3af)] mb-2 font-medium">With Cyntro</p>
            <div className="relative inline-flex items-center justify-center">
              <ScoreRing score={data.projected.totalScore} size={130} strokeWidth={10} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold" style={{ color: projectedColor }}>{data.projected.totalScore}%</span>
                <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">projected</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA line */}
        {data.canClose && (
          <div className="mt-4 text-center">
            <p className="text-xs font-medium text-[#8b5cf6] bg-[#8b5cf620] inline-block px-4 py-1.5 rounded-full">
              {data.canClose}
            </p>
          </div>
        )}
      </div>

      {/* 3-Layer Breakdown */}
      <div className="px-6 pb-6 space-y-3">
        <h4 className="text-xs font-semibold text-[var(--foreground,#111827)] uppercase tracking-wide mb-2">
          Enforcement Layers
        </h4>
        <LayerBar
          layer={data.layers.privilege}
          config={LAYER_CONFIG.privilege}
          projected={data.projected.privilege}
        />
        <LayerBar
          layer={data.layers.network}
          config={LAYER_CONFIG.network}
          projected={data.projected.network}
        />
        <LayerBar
          layer={data.layers.data}
          config={LAYER_CONFIG.data}
          projected={data.projected.data}
        />
      </div>
    </div>
  )
}
