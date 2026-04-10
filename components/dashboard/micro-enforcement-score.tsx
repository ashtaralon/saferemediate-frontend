"use client"

import { useState, useEffect } from "react"
import {
  Shield, Lock, Globe, Database, TrendingUp, ChevronDown, ChevronUp,
  AlertTriangle, Zap, RotateCcw, Eye, AlertCircle, CheckCircle2, Target
} from "lucide-react"

interface LayerScore {
  score: number
  enforced: number
  total: number
  gap: number
  gapPercent: number
  details: string
  riskLabel: string
  items: Array<{ name: string; status: 'enforced' | 'exposed' | 'partial'; detail: string }>
}

interface EnforcementAction {
  id: string
  layer: 'privilege' | 'network' | 'data'
  title: string
  detail: string
  impact: string
  risk: string
  confidence: 'high' | 'medium' | 'low'
  observationDays: number
  rollback: string
  count: number
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
  actions: EnforcementAction[]
  impact: {
    attackPathsExposed: number
    reductionPercent: number
    primaryDriver: string
    riskStatement: string
  }
  headline: string
  canClose: string
}

const LAYER_CONFIG = {
  privilege: { label: "Privilege", icon: Lock, color: "#8B5CF6" },
  network: { label: "Network", icon: Globe, color: "#3B82F6" },
  data: { label: "Data", icon: Database, color: "#10B981" },
}

const CONFIDENCE_CONFIG = {
  high: { label: "High", color: "#22c55e", bg: "bg-[#22c55e15]", border: "border-[#22c55e40]" },
  medium: { label: "Medium", color: "#eab308", bg: "bg-[#eab30815]", border: "border-[#eab30840]" },
  low: { label: "Low", color: "#f97316", bg: "bg-[#f9731615]", border: "border-[#f9731640]" },
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
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color}
        strokeWidth={strokeWidth} strokeDasharray={circumference}
        strokeDashoffset={circumference - progress} strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  )
}

function ActionCard({ action }: { action: EnforcementAction }) {
  const [expanded, setExpanded] = useState(false)
  const conf = CONFIDENCE_CONFIG[action.confidence]
  const layerConf = LAYER_CONFIG[action.layer]
  const LayerIcon = layerConf.icon

  return (
    <div className={`border rounded-lg overflow-hidden ${conf.border}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-start gap-3 hover:bg-[var(--muted,#f9fafb)] transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: `${layerConf.color}15` }}>
          <LayerIcon className="w-4 h-4" style={{ color: layerConf.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-[var(--foreground,#111827)]">{action.title}</span>
          </div>
          <p className="text-xs text-[var(--muted-foreground,#6b7280)]">{action.detail}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${conf.bg} border ${conf.border}`}
              style={{ color: conf.color }}>
              <CheckCircle2 className="w-3 h-3" />
              {conf.label} confidence
            </span>
            {action.observationDays > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground,#9ca3af)]">
                <Eye className="w-3 h-3" />
                {action.observationDays}d observed
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground,#9ca3af)]">
              <RotateCcw className="w-3 h-3" />
              Rollback ready
            </span>
          </div>
        </div>
        <div className="text-[var(--muted-foreground,#9ca3af)] flex-shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border,#e5e7eb)] bg-[var(--muted,#f9fafb)] px-4 py-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-[#22c55e] mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] font-semibold text-[var(--foreground,#374151)] uppercase tracking-wide">If you enforce</span>
              <p className="text-xs text-[var(--foreground,#374151)]">{action.impact}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-[#ef4444] mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] font-semibold text-[var(--foreground,#374151)] uppercase tracking-wide">If you don't</span>
              <p className="text-xs text-[#ef4444]">{action.risk}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] font-semibold text-[var(--foreground,#374151)] uppercase tracking-wide">Rollback</span>
              <p className="text-xs text-[var(--muted-foreground,#6b7280)]">{action.rollback}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LayerRow({ layer, config, projected }: {
  layer: LayerScore
  config: typeof LAYER_CONFIG.privilege
  projected: number
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = config.icon
  const isNoData = layer.total === 0 && layer.score === 100

  return (
    <div className="border border-[var(--border,#e5e7eb)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center gap-3 hover:bg-[var(--muted,#f9fafb)] transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${config.color}15` }}>
          <Icon className="w-4 h-4" style={{ color: config.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-[var(--foreground,#111827)]">{config.label}</span>
            {!isNoData ? (
              <span className="text-base font-bold" style={{ color: getScoreColor(layer.score) }}>
                {layer.score}%
              </span>
            ) : (
              <span className="text-xs text-[var(--muted-foreground,#9ca3af)]">Pending</span>
            )}
          </div>
          {!isNoData ? (
            <>
              <div className="relative h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                  style={{ width: `${projected}%`, backgroundColor: `${config.color}30` }} />
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                  style={{ width: `${layer.score}%`, backgroundColor: config.color }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">
                  {layer.enforced}/{layer.total} enforced · {layer.gap} exposed
                </span>
                <span className="text-[10px] font-medium" style={{
                  color: layer.riskLabel === 'Primary risk driver' ? '#ef4444'
                    : layer.riskLabel === 'Significant exposure' ? '#f97316'
                    : '#22c55e'
                }}>
                  {layer.riskLabel}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">{layer.riskLabel || layer.details}</p>
          )}
        </div>
        {layer.items.length > 0 && (
          <div className="text-[var(--muted-foreground,#9ca3af)] flex-shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        )}
      </button>

      {expanded && layer.items.length > 0 && (
        <div className="border-t border-[var(--border,#e5e7eb)] bg-[var(--muted,#f9fafb)] px-4 py-3 space-y-1.5">
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
      {/* ── Header ── */}
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
        {/* Risk statement instead of bland headline */}
        <p className="text-xs text-[#ef4444] font-medium mt-1">{data.impact?.riskStatement || data.headline}</p>
      </div>

      {/* ── Score Hero + Risk Summary ── */}
      <div className="px-6 py-5 border-b border-[var(--border,#e5e7eb)]">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground,#9ca3af)] mb-2 font-medium">Today</p>
            <div className="relative inline-flex items-center justify-center">
              <ScoreRing score={data.totalScore} size={110} strokeWidth={8} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold" style={{ color: scoreColor }}>{data.totalScore}%</span>
                <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">enforced</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <TrendingUp className="w-5 h-5 text-[#22c55e]" />
            <span className="text-xs font-bold text-[#22c55e]">+{data.projected.improvement}%</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground,#9ca3af)] mb-2 font-medium">With Cyntro</p>
            <div className="relative inline-flex items-center justify-center">
              <ScoreRing score={data.projected.totalScore} size={110} strokeWidth={8} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold" style={{ color: projectedColor }}>{data.projected.totalScore}%</span>
                <span className="text-[10px] text-[var(--muted-foreground,#9ca3af)]">projected</span>
              </div>
            </div>
          </div>
        </div>
        {data.impact && data.impact.reductionPercent > 0 && (
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px]">
            <span className="flex items-center gap-1 text-[#22c55e] font-medium">
              <Target className="w-3.5 h-3.5" />
              Reduces exposure by {data.impact.reductionPercent}%
            </span>
            <span className="text-[var(--border,#d1d5db)]">|</span>
            <span className="flex items-center gap-1 text-[var(--muted-foreground,#6b7280)]">
              <Zap className="w-3.5 h-3.5" />
              Primary driver: {data.impact.primaryDriver}
            </span>
          </div>
        )}
      </div>

      {/* ── Top Enforcement Actions ── */}
      {data.actions && data.actions.length > 0 && (
        <div className="px-6 py-4">
          <h4 className="text-xs font-semibold text-[var(--foreground,#111827)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#f97316]" />
            Top Enforcement Actions
          </h4>
          <div className="space-y-2.5">
            {data.actions.slice(0, 5).map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* ── Enforcement Layers ── */}
      <div className="px-6 py-4 border-t border-[var(--border,#e5e7eb)]">
        <h4 className="text-xs font-semibold text-[var(--foreground,#111827)] uppercase tracking-wide mb-3">
          Enforcement Layers
        </h4>
        <div className="space-y-2">
          <LayerRow layer={data.layers.privilege} config={LAYER_CONFIG.privilege} projected={data.projected.privilege} />
          <LayerRow layer={data.layers.network} config={LAYER_CONFIG.network} projected={data.projected.network} />
          <LayerRow layer={data.layers.data} config={LAYER_CONFIG.data} projected={data.projected.data} />
        </div>
      </div>

      {/* ── CTA ── */}
      {data.canClose && (
        <div className="px-6 py-4 bg-[#8b5cf608] border-t border-[var(--border,#e5e7eb)]">
          <p className="text-xs font-medium text-[#8b5cf6] text-center">{data.canClose}</p>
        </div>
      )}
    </div>
  )
}
