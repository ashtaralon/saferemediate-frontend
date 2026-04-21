'use client'

import React from 'react'
import type { ConfidenceScore, ConfidenceRouting, LLMReviewVerdict, RoleTags } from '@/lib/types'

interface Props {
  score: ConfidenceScore
}

const ROUTING_STYLE: Record<ConfidenceRouting, { label: string; color: string; bg: string }> = {
  auto_execute: { label: 'Auto-Execute', color: '#15803d', bg: '#dcfce7' },
  human_approval: { label: 'Human Approval', color: '#a16207', bg: '#fef3c7' },
  manual_review: { label: 'Manual Review', color: '#b91c1c', bg: '#fee2e2' },
  blocked: { label: 'Blocked', color: '#991b1b', bg: '#fecaca' },
}

const REVIEW_STYLE: Record<LLMReviewVerdict, { label: string; color: string; bg: string; border: string }> = {
  agree: { label: 'LLM reviewer agrees', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  escalate: { label: 'LLM reviewer escalated', color: '#a16207', bg: '#fffbeb', border: '#fde68a' },
  block: { label: 'LLM reviewer blocked', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
}

const ENV_STYLE: Record<string, { color: string; bg: string }> = {
  prod:    { color: '#991b1b', bg: '#fee2e2' },
  staging: { color: '#a16207', bg: '#fef3c7' },
  dev:     { color: '#166534', bg: '#dcfce7' },
  test:    { color: '#1d4ed8', bg: '#dbeafe' },
  unknown: { color: '#475569', bg: '#e2e8f0' },
}

function scoreColor(n: number) {
  if (n >= 95) return '#15803d'
  if (n >= 80) return '#a16207'
  if (n >= 60) return '#ea580c'
  return '#b91c1c'
}

export function ConfidenceExplanationPanel({ score }: Props) {
  const routingStyle = ROUTING_STYLE[score.routing] ?? ROUTING_STYLE.manual_review
  const signals = score.signals_available ?? ({} as ConfidenceScore['signals_available'])
  const gates = score.gates_failed ?? []
  const visibilityReasons = score.visibility_reasons ?? []
  const visibilityInt = typeof score.visibility_integrity === 'number' ? score.visibility_integrity : 0
  const signalsOn = Object.entries(signals).filter(([, v]) => v).map(([k]) => k)
  const signalsOff = Object.entries(signals).filter(([, v]) => !v).map(([k]) => k)
  const hardBlocks = gates.filter(g => g.severity === 'hard_block')
  const warnings = gates.filter(g => g.severity === 'warn')

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: '#e2e8f0', background: '#f8fafc' }}
      data-testid="confidence-explanation-panel"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Agent 5 · Confidence Scorer
          </span>
        </div>
        <span
          className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase"
          style={{ background: routingStyle.bg, color: routingStyle.color }}
        >
          {routingStyle.label}
        </span>
      </div>

      <div className="flex items-baseline gap-3">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color: scoreColor(score.confidence) }}
        >
          {score.confidence}
        </span>
        <span className="text-xs text-slate-500">confidence / 100</span>
        <span className="ml-auto text-xs text-slate-600">
          Visibility {Math.round(visibilityInt * 100)}%
        </span>
      </div>

      {score.role_tags && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="confidence-role-tags">
          {(() => {
            const env = (score.role_tags.environment || 'unknown').toLowerCase()
            const envStyle = ENV_STYLE[env] ?? ENV_STYLE.unknown
            return (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: envStyle.bg, color: envStyle.color }}
              >
                env: {env}
              </span>
            )
          })()}
          {score.role_tags.system && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
              system: {score.role_tags.system}
            </span>
          )}
          {score.role_tags.owner && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
              owner: {score.role_tags.owner}
            </span>
          )}
          {score.role_tags.compliance && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
              compliance: {score.role_tags.compliance}
            </span>
          )}
        </div>
      )}

      {score.llm_review && (
        <div
          className="rounded border p-3"
          style={{ borderColor: REVIEW_STYLE[score.llm_review.verdict].border, background: REVIEW_STYLE[score.llm_review.verdict].bg }}
          data-testid="confidence-llm-review"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: REVIEW_STYLE[score.llm_review.verdict].color }}>
              {REVIEW_STYLE[score.llm_review.verdict].label}
            </span>
            {score.routing_deterministic && score.routing_deterministic !== score.routing && (
              <span className="text-[10px] font-mono text-slate-600">
                routing: {score.routing_deterministic} → {score.routing}
              </span>
            )}
          </div>
          <div className="text-sm leading-relaxed" style={{ color: REVIEW_STYLE[score.llm_review.verdict].color }}>
            {score.llm_review.reason}
          </div>
        </div>
      )}

      {score.llm_explanation ? (
        <div
          className="rounded border p-3 text-sm leading-relaxed"
          style={{ borderColor: '#cbd5e1', background: '#ffffff' }}
          data-testid="confidence-llm-explanation"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Why this score
          </div>
          {score.llm_explanation}
        </div>
      ) : (
        <div
          className="rounded border border-dashed p-3 text-xs text-slate-500"
          data-testid="confidence-llm-explanation-disabled"
        >
          LLM explanations are disabled. Set{' '}
          <code className="bg-slate-100 px-1 rounded">ENABLE_LLM_EXPLANATIONS=true</code>
          {' '}on the backend to see Agent 5 reasoning here.
        </div>
      )}

      {hardBlocks.length > 0 && (
        <div className="rounded border p-3" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
          <div className="text-xs font-semibold text-red-700 mb-1">Hard Blocks</div>
          <ul className="list-disc ml-5 text-sm text-red-800 space-y-1">
            {hardBlocks.map((g, i) => (
              <li key={i}>
                <strong>{g.gate}:</strong> {g.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded border p-3" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
          <div className="text-xs font-semibold text-amber-700 mb-1">Warnings</div>
          <ul className="list-disc ml-5 text-sm text-amber-800 space-y-1">
            {warnings.map((g, i) => (
              <li key={i}>
                <strong>{g.gate}:</strong> {g.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {visibilityReasons.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600 text-xs font-medium">
            Visibility signals ({visibilityReasons.length})
          </summary>
          <ul className="mt-2 list-disc ml-5 text-xs text-slate-700 space-y-0.5">
            {visibilityReasons.map((r, i) => (
              <li key={i} className="font-mono">{r}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {signalsOn.map(s => (
          <span
            key={s}
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: '#dcfce7', color: '#15803d' }}
          >
            ✓ {s}
          </span>
        ))}
        {signalsOff.map(s => (
          <span
            key={s}
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}
          >
            ✗ {s}
          </span>
        ))}
      </div>
    </div>
  )
}
