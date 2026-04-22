'use client'

import React from 'react'
import type { ConfidenceScore, ConfidenceRouting, LLMReviewVerdict } from '@/lib/types'

interface Props {
  score: ConfidenceScore
}

// Cloud-agnostic routing pills. The deterministic scorer returns internal keys;
// we render the operator-facing label here and nowhere else.
const ROUTING_STYLE: Record<ConfidenceRouting, { label: string; color: string; bg: string }> = {
  auto_execute:   { label: 'Safe to apply',   color: '#15803d', bg: '#dcfce7' },
  human_approval: { label: 'Needs approval',  color: '#a16207', bg: '#fef3c7' },
  manual_review:  { label: 'Review required', color: '#b91c1c', bg: '#fee2e2' },
  blocked:        { label: 'Blocked',         color: '#991b1b', bg: '#fecaca' },
}

const REVIEW_STYLE: Record<LLMReviewVerdict, { label: string; color: string; bg: string; border: string }> = {
  agree:    { label: 'AI reviewer agrees',    color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  escalate: { label: 'AI reviewer escalated', color: '#a16207', bg: '#fffbeb', border: '#fde68a' },
  block:    { label: 'AI reviewer blocked',   color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
}

const ENV_STYLE: Record<string, { color: string; bg: string }> = {
  prod:    { color: '#991b1b', bg: '#fee2e2' },
  staging: { color: '#a16207', bg: '#fef3c7' },
  dev:     { color: '#166534', bg: '#dcfce7' },
  test:    { color: '#1d4ed8', bg: '#dbeafe' },
  unknown: { color: '#475569', bg: '#e2e8f0' },
}

// Cloud-agnostic labels for the signal chips. Keys match the scorer output
// (unified across IAM / SG / S3). Anything not in this map falls back to a
// generic prettifier — but the backend should never emit provider-specific
// keys. If a raw key leaks through, that's a contract break worth fixing
// at the source.
const SIGNAL_LABELS: Record<string, string> = {
  // IAM
  control_plane_telemetry: 'Control-plane telemetry',
  data_plane_telemetry:    'Data-plane telemetry',
  usage_telemetry:         'Usage telemetry',
  runtime_telemetry:       'Runtime telemetry',
  execution_triggers:      'Execution triggers',
  trust_graph:             'Trust graph',
  resource_metadata:       'Resource metadata',
  // SG
  resource_indexed:        'Resource indexed',
  attachment_graph:        'Attachment graph',
  policy_inventory:        'Policy inventory',
  network_flow_telemetry:  'Network flow telemetry',
  // S3
  public_exposure_controls: 'Public exposure controls',
  access_policy_analyzed:   'Access policy analyzed',
}

function prettifySignalKey(key: string): string {
  return SIGNAL_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Routing transitions as a humanist arrow sentence. Read as: scorer said X,
// reviewer pushed to Y.
function describeRoutingDelta(from: ConfidenceRouting, to: ConfidenceRouting): string {
  const f = ROUTING_STYLE[from]?.label ?? from
  const t = ROUTING_STYLE[to]?.label ?? to
  return `${f} → ${t}`
}

function scoreColor(n: number) {
  if (n >= 95) return '#15803d'
  if (n >= 80) return '#a16207'
  if (n >= 60) return '#ea580c'
  return '#b91c1c'
}

// Explainer output format contract (enforced in backend prompt):
//   Line 1: HEADLINE (5-12 words, no trailing period)
//   Line 2: blank
//   Line 3+: DETAILS (one or two sentences)
// Older cache entries may arrive as a single paragraph — we fall back to
// splitting on the first sentence boundary so we never crash the render.
function splitExplanation(text: string): { headline: string; details: string } {
  const trimmed = text.trim()
  const lineBreak = trimmed.indexOf('\n\n')
  if (lineBreak !== -1) {
    return {
      headline: trimmed.slice(0, lineBreak).trim(),
      details:  trimmed.slice(lineBreak + 2).trim(),
    }
  }
  const firstStop = trimmed.search(/\.\s/)
  if (firstStop !== -1) {
    return {
      headline: trimmed.slice(0, firstStop).trim(),
      details:  trimmed.slice(firstStop + 1).trim(),
    }
  }
  return { headline: trimmed, details: '' }
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
  const routingShifted =
    score.routing_deterministic && score.routing_deterministic !== score.routing
  const resourceMeta = score.resource_tags ?? score.role_tags

  const explanation = score.llm_explanation ? splitExplanation(score.llm_explanation) : null

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
        {routingShifted ? (
          <span
            className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase"
            style={{ background: routingStyle.bg, color: routingStyle.color }}
            title={`Deterministic scorer chose ${ROUTING_STYLE[score.routing_deterministic!]?.label}; reviewer pushed to ${routingStyle.label}`}
          >
            {describeRoutingDelta(score.routing_deterministic!, score.routing)}
          </span>
        ) : (
          <span
            className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase"
            style={{ background: routingStyle.bg, color: routingStyle.color }}
          >
            {routingStyle.label}
          </span>
        )}
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

      {resourceMeta && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="confidence-role-tags">
          {(() => {
            const env = (resourceMeta.environment || 'unknown').toLowerCase()
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
          {resourceMeta.system && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
              system: {resourceMeta.system}
            </span>
          )}
          {resourceMeta.owner && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
              owner: {resourceMeta.owner}
            </span>
          )}
          {resourceMeta.compliance && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
              compliance: {resourceMeta.compliance}
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
          </div>
          <div className="text-sm leading-relaxed" style={{ color: REVIEW_STYLE[score.llm_review.verdict].color }}>
            {score.llm_review.reason}
          </div>
        </div>
      )}

      {explanation ? (
        <div
          className="rounded border p-3 space-y-1"
          style={{ borderColor: '#cbd5e1', background: '#ffffff' }}
          data-testid="confidence-llm-explanation"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Why this score
          </div>
          <div className="text-sm font-semibold text-slate-900 leading-snug">
            {explanation.headline}
          </div>
          {explanation.details && (
            <div className="text-sm text-slate-700 leading-relaxed">
              {explanation.details}
            </div>
          )}
        </div>
      ) : (
        <div
          className="rounded border border-dashed p-3 text-xs text-slate-500"
          data-testid="confidence-llm-explanation-disabled"
        >
          AI explanations are disabled. Set{' '}
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
            ✓ {prettifySignalKey(s)}
          </span>
        ))}
        {signalsOff.map(s => (
          <span
            key={s}
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}
          >
            ✗ {prettifySignalKey(s)}
          </span>
        ))}
      </div>
    </div>
  )
}
