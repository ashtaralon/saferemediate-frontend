"use client"

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CircleHelp,
  FileCode2,
  GitBranch,
  LockKeyhole,
  Network,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { ChangeImpactGraph } from '@/components/change-impact-graph'
import { describeAdjacency, describeFamily, normalizeAffectedResources, normalizeBlastRadius } from '@/lib/change-assurance/baseline-contract'

interface Evidence {
  kind: string
  statement: string
  plane?: string
  edge_class?: string | null
  source_system?: string | null
  freshness?: { state?: string; field?: string | null; value?: string | null }
  is_stale?: boolean
  neighbor?: { resource_name?: string; resource_type?: string; resource_id?: string }
  details?: Record<string, unknown>
}

interface Finding {
  finding_id: string
  code: string
  category: string
  severity: string
  disposition: string
  confidence: string
  title: string
  summary: string
  addresses: string[]
  failure_mode: string
  recommendation: string
  affected_resources?: Array<{ resource_id?: string; resource_name?: string; resource_type?: string; system_names?: string[] }>
  affected_resources_assessment?: { state?: string; items?: unknown[]; detail?: string }
  evidence: Evidence[]
}

interface SemanticChange {
  address: string
  resource_type: string
  family: string
  actions: string[]
  replace_paths: string[]
  changed_paths: string[]
  previous_address?: string | null
  replacement_order?: string | null
  removed_references?: string[]
  added_references?: string[]
  is_import?: boolean
  import_id?: string | null
  importing?: Record<string, unknown>
  mapping_group_id?: string | null
}

interface ImpactEdge {
  relationship: string
  direction: string
  plane: string
  evidence_kind?: string
  is_stale?: boolean
  neighbor: { resource_id?: string | null; resource_name?: string; resource_type?: string; system_names?: string[] }
}

interface Impact {
  address: string
  requested_ref?: string | null
  query_status: string
  query_error?: string | null
  resolved: boolean
  ambiguous: boolean
  direct_relationship_count: number
  direct_resource_count: number
  direct_detail_count: number
  direct_detail_complete: boolean
  direct_edges: ImpactEdge[]
  transitive_paths?: Array<{
    relationships: string[]
    planes: string[]
    middle: { resource_id?: string | null; resource_name?: string; resource_type?: string; system_names?: string[] }
    endpoint: { resource_id?: string | null; resource_name?: string; resource_type?: string; system_names?: string[] }
    interpretation?: string
  }>
  unexpected_edge_types: string[]
}

interface EvidenceCoverage {
  status: string
  source_count: number
  enabled_source_count: number
  interpretation?: string
  reason?: string
  sources: Array<{
    source_id?: string
    source_type?: string
    region?: string
    enabled?: boolean
    coverage_days?: number
    coverage_window_start?: string
    coverage_window_end?: string
    last_run_status?: string
    last_run_at?: string
    last_event_at?: string
    event_count_last_24h?: number
    missing_reason?: string
  }>
}

export interface IaCIntentDocument {
  intent_id: string
  analyzed_at: string
  document_hash: string
  source_lineage?: { repository?: string; workspace?: string; commit_sha?: string; pull_request_url?: string }
  intent: {
    requested_by: string
    scope: { customer_id?: string; system_name?: string; account_id?: string; region?: string }
    change: { resource_type: string; resource_id: string; action: string; reason: string; source?: string }
  }
  analysis_coverage: Record<string, string>
  decision: { state: string; reason: string; approval_binds_to?: string }
  execution: { state: string; reason: string; available_from_this_intent: boolean }
  risk_dossier: {
    analysis_kind: 'IAC_CHANGE_INTELLIGENCE' | 'TERRAFORM_BASELINE_ASSURANCE'
    baseline_phase?: string
    readiness?: { state: string; failed_gate_count: number; required_gate_count?: number; required_gate_definition?: string; meaning: string }
    analysis_conclusion: { state: string; headline: string; safe_to_apply: null; safe_to_apply_reason: string }
    risk_band: string
    // The baseline lane emits null with risk_indicator_state NOT_COMPUTED:
    // it returns deterministic conservation verdicts, not a risk score.
    risk_indicator: number | null
    risk_indicator_state?: string
    risk_indicator_explanation: string
    confidence: { level: string; meaning: string; gaps: string[]; proven_scope: string; graph_scope: string }
    source_artifact: { kind: string; fingerprint: string; semantic_fingerprint?: string; account_id: string; region: string; metadata: Record<string, unknown>; raw_artifact_persisted: false; retained_form: string }
    semantic_diff: {
      summary: { total_changes: number; action_counts: Record<string, number>; family_counts: Record<string, number> }
      resource_changes: SemanticChange[]
    }
    findings: Finding[]
    finding_counts: { total: number; by_severity: Record<string, number>; by_category: Record<string, number>; by_disposition: Record<string, number> }
    blast_radius: {
      systems: string[]
      changed_resource_count: number
      resolved_changed_resource_count: number
      graph_relationship_count: number
      dependency_incidences?: number
      direct_dependency_count?: number
      direct_dependency_count_semantics?: string
      distinct_affected_resources?: { state?: string; count?: number; detail?: string }
      periodic_dependencies?: unknown[]
      data_dependencies?: unknown[]
      periodic_dependencies_assessment?: { state?: string; items?: unknown[]; detail?: string }
      data_dependencies_assessment?: { state?: string; items?: unknown[]; detail?: string }
    }
    impact_graph: {
      status: string
      targets_requested: number
      targets_analyzed: number
      targets_resolved: number
      targets_failed: number
      target_limit_reached: boolean
      direct_relationship_count: number
      systems: string[]
      impacts: Impact[]
      evidence_coverage?: EvidenceCoverage
      limitations: string[]
    }
    evidence_model: {
      classes: Array<{ kind: string; meaning: string }>
      counts: Record<string, number>
      coverage: Record<string, unknown>
      negative_evidence_rule: string
    }
    evidence_gap_count: number
    approval_guardrails: Array<{ gate: string; state: string; detail: string }>
    rollback_suggestions: Array<{ kind: string; title: string; detail: string }>
    limits: string[]
  }
}

const severityStyles: Record<string, string> = {
  CRITICAL: 'border-red-300 bg-red-50 text-red-950',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-950',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-950',
  LOW: 'border-blue-200 bg-blue-50 text-blue-950',
  INFO: 'border-slate-200 bg-slate-50 text-slate-800',
}

const conclusionStyles: Record<string, string> = {
  BLOCK: 'border-red-300 bg-red-50 text-red-950',
  NEEDS_EVIDENCE: 'border-amber-300 bg-amber-50 text-amber-950',
  REQUIRE_REVIEW: 'border-violet-300 bg-violet-50 text-violet-950',
}

export function IaCChangeDossier({ document, customerId }: { document: IaCIntentDocument; customerId: string }) {
  const dossier = document.risk_dossier
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [evidenceFilter, setEvidenceFilter] = useState('ALL')
  const findings = useMemo(() => dossier.findings.filter(item => {
    const severityMatches = severityFilter === 'ALL' || item.severity === severityFilter
    const evidenceMatches = evidenceFilter === 'ALL' || item.evidence.some(evidence => evidence.kind === evidenceFilter)
    return severityMatches && evidenceMatches
  }), [dossier.findings, evidenceFilter, severityFilter])
  const scopeQuery = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ''
  const conclusion = dossier.analysis_conclusion
  const summary = dossier.semantic_diff.summary
  const isBaseline = dossier.analysis_kind === 'TERRAFORM_BASELINE_ASSURANCE'
  const artifactLabel = isBaseline ? 'Terraform baseline import plan' : dossier.source_artifact.kind === 'TERRAFORM_PLAN_JSON' ? 'Terraform plan' : 'CloudFormation change'
  const coverage = dossier.impact_graph.evidence_coverage

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/change-queue${scopeQuery}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700"><ArrowLeft className="h-4 w-4" /> Change Queue</Link>
          <Link href={`/change-queue/new${scopeQuery}`} className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-700">Check another change</Link>
        </div>

        <section className={`mt-5 rounded-2xl border p-6 shadow-sm ${conclusionStyles[conclusion.state] || conclusionStyles.REQUIRE_REVIEW}`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-4xl">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em]"><ShieldAlert className="h-4 w-4" /> {humanize(conclusion.state)}</div>
              <h1 className="mt-2 text-2xl font-black">{conclusion.headline}</h1>
              <p className="mt-3 text-sm leading-6 opacity-90">{conclusion.safe_to_apply_reason}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <VerdictMetric label="Risk" value={dossier.risk_band} />
              <VerdictMetric label="Evidence confidence" value={dossier.confidence.level} />
            </div>
          </div>
        </section>

        <header className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-700"><FileCode2 className="h-4 w-4" /> {artifactLabel} · frozen review</div>
              <h2 className="mt-2 text-2xl font-bold">{summary.total_changes} {isBaseline ? 'baseline import target' : 'proposed resource change'}{summary.total_changes === 1 ? '' : 's'}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-700"><strong>Why:</strong> {document.intent.change.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                <Chip>{dossier.source_artifact.account_id}</Chip>
                <Chip>{dossier.source_artifact.region}</Chip>
                {document.intent.scope.system_name && <Chip>{document.intent.scope.system_name}</Chip>}
                <Chip>{document.intent.requested_by}</Chip>
              </div>
            </div>
            <div className="max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-bold uppercase tracking-wide text-slate-800">Exact artifact approval binding</div>
              <div className="mt-2 break-all font-mono text-[10px]">{dossier.source_artifact.fingerprint}</div>
              {dossier.source_artifact.semantic_fingerprint && <><div className="mt-3 font-bold uppercase tracking-wide text-slate-600">Redacted semantic fingerprint</div><div className="mt-1 break-all font-mono text-[10px] text-slate-500">{dossier.source_artifact.semantic_fingerprint}</div></>}
              <p className="mt-2">Raw artifact stored: <strong>No</strong> · semantic slice + hash only</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <Metric label="Import" value={String(summary.action_counts.import || 0)} />
            <Metric label="Create" value={String(summary.action_counts.create || 0)} />
            <Metric label="Update" value={String(summary.action_counts.update || 0)} />
            <Metric label="Delete" value={String(summary.action_counts.delete || 0)} />
            <Metric label="Replace" value={String(summary.action_counts.replace || 0)} />
            <Metric label="Findings" value={String(dossier.finding_counts.total)} />
            <Metric label="Systems" value={String(dossier.blast_radius.systems.length)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" data-testid="blast-radius-contract">
            {(() => {
              const blast = normalizeBlastRadius(dossier.blast_radius)
              return (
                <>
                  <span data-testid="adjacency">{describeAdjacency(blast.adjacency)}</span>
                  <span data-testid="distinct-affected">{describeFamily(blast.distinctAffectedResources, "distinct affected resources")}</span>
                  <span data-testid="periodic-dependencies">{describeFamily(blast.periodicDependencies, "periodic dependencies")}</span>
                  <span data-testid="data-dependencies">{describeFamily(blast.dataDependencies, "data dependencies")}</span>
                </>
              )
            })()}
          </div>
        </header>

        {isBaseline && dossier.readiness && <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[.16em]">Baseline readiness · {humanize(dossier.readiness.state)}</div><p className="mt-2 max-w-3xl text-sm leading-6">{dossier.readiness.meaning}</p></div><div className="flex gap-2"><VerdictMetric label="Failed gates" value={String(dossier.readiness.failed_gate_count)} /><VerdictMetric label="Still required" value={dossier.readiness.required_gate_count === undefined ? 'Unknown' : String(dossier.readiness.required_gate_count)} /></div></div>
        </section>}

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
          <div className="space-y-5">
            <Section icon={<ShieldAlert className="h-4 w-4" />} title="What can break">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-bold text-slate-500">Severity</span>
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(item => <FilterChip key={item} selected={severityFilter === item} onClick={() => setSeverityFilter(item)}>{humanize(item)}</FilterChip>)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-bold text-slate-500">Evidence</span>
                {['ALL', 'IAC_PROVEN', 'CONFIG_PROVEN', 'OBSERVED_RUNTIME', 'GRAPH_INFERRED', 'CONFIDENCE_GAP'].map(item => <FilterChip key={item} selected={evidenceFilter === item} onClick={() => setEvidenceFilter(item)}>{humanize(item)}</FilterChip>)}
              </div>
              <div className="mt-4 space-y-3">
                {findings.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">No finding matches these filters. This does not change the dossier conclusion.</div> : findings.map(item => <FindingCard key={item.finding_id} finding={item} />)}
              </div>
            </Section>

            <Section icon={<Network className="h-4 w-4" />} title="Current graph around the proposed change">
              <div className="mb-4 grid gap-3 sm:grid-cols-5">
                <Metric label="Graph status" value={humanize(dossier.impact_graph.status)} />
                <Metric label="Targets resolved" value={`${dossier.impact_graph.targets_resolved}/${dossier.impact_graph.targets_requested}`} />
                <Metric label="Relationships" value={String(dossier.impact_graph.direct_relationship_count)} />
                <Metric label="Failed lookups" value={String(dossier.impact_graph.targets_failed)} />
                <Metric label="Evidence sources" value={coverage ? `${coverage.enabled_source_count}/${coverage.source_count}` : 'Unknown'} />
              </div>
              <ChangeImpactGraph impacts={dossier.impact_graph.impacts} />
            </Section>

            <Section icon={<GitBranch className="h-4 w-4" />} title="Semantic change set">
              <div className="space-y-2">{dossier.semantic_diff.resource_changes.map(item => <SemanticChangeRow key={item.address} change={item} />)}</div>
            </Section>
          </div>

          <aside className="space-y-5">
            <Section icon={<CircleHelp className="h-4 w-4" />} title="Evidence quality">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-slate-600">Confidence</span><strong>{dossier.confidence.level}</strong></div><p className="mt-2 text-xs leading-5 text-slate-600">{dossier.confidence.meaning}</p></div>
              <div className="mt-3 space-y-2">{dossier.evidence_model.classes.map(item => <div key={item.kind} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><EvidenceChip kind={item.kind} /><strong className="text-xs">{dossier.evidence_model.counts[item.kind] || 0}</strong></div><p className="mt-2 text-xs leading-5 text-slate-600">{item.meaning}</p></div>)}</div>
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">{dossier.evidence_model.negative_evidence_rule}</div>
              {coverage && <div className="mt-3"><div className="flex items-center justify-between gap-2 text-xs font-bold uppercase text-slate-600"><span>Runtime source health</span><span>{humanize(coverage.status)}</span></div><div className="mt-2 space-y-2">{coverage.sources.slice(0, 8).map((source, index) => <div key={source.source_id || `${source.source_type}-${index}`} className="rounded-xl border border-slate-200 p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong>{sourceLabel(source.source_type)}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${source.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{source.enabled ? 'ENABLED' : 'NOT ENABLED'}</span></div><p className="mt-1 text-slate-500">{source.region || 'global'} · {source.coverage_days ?? 'unknown'} coverage days · {source.last_run_status || 'run status unknown'}</p></div>)}</div>{coverage.sources.length === 0 && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No account/region SignalSource coverage record was available. Runtime silence cannot support a safe conclusion.</p>}{coverage.interpretation && <p className="mt-2 text-xs leading-5 text-slate-500">{coverage.interpretation}</p>}</div>}
              {dossier.confidence.gaps.length > 0 && <div className="mt-3"><div className="text-xs font-bold uppercase text-slate-600">Confidence gaps</div><ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">{dossier.confidence.gaps.map(gap => <li key={gap}>• {gap}</li>)}</ul></div>}
            </Section>

            <Section icon={<ShieldCheck className="h-4 w-4" />} title="Approval gates">
              <div className="space-y-2">{dossier.approval_guardrails.map(item => <div key={item.gate} className={`rounded-xl border p-3 ${item.state === 'FAILED' ? 'border-red-200 bg-red-50' : item.state === 'PASSED' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center justify-between gap-2"><strong className="text-xs uppercase tracking-wide">{humanize(item.gate)}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.state === 'FAILED' ? 'bg-red-100 text-red-800' : item.state === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{item.state}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p></div>)}</div>
            </Section>

            <Section icon={<RotateCcw className="h-4 w-4" />} title="Rollback preparation">
              <div className="space-y-2">{dossier.rollback_suggestions.map(item => <div key={`${item.kind}-${item.title}`} className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-violet-700">{item.kind}</div><div className="mt-1 text-sm font-semibold">{item.title}</div><p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p></div>)}</div>
            </Section>

            <Section icon={<LockKeyhole className="h-4 w-4" />} title="Execution boundary">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>{humanize(document.execution.state)}</strong><p className="mt-1 text-xs leading-5">{document.execution.reason}</p></div>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-700">Approval must bind to the exact artifact hash. Apply stays in the customer's governed IaC pipeline after live drift, quota, health, and rollback preflight.</p>
            </Section>

            {(document.source_lineage?.repository || document.source_lineage?.workspace || document.source_lineage?.commit_sha || document.source_lineage?.pull_request_url) && <Section icon={<FileCode2 className="h-4 w-4" />} title="Deployment lineage">
              <dl className="space-y-2 text-xs">{document.source_lineage.repository && <Lineage label="Repository" value={document.source_lineage.repository} />}{document.source_lineage.workspace && <Lineage label="Workspace / stack" value={document.source_lineage.workspace} />}{document.source_lineage.commit_sha && <Lineage label="Commit" value={document.source_lineage.commit_sha} />}{document.source_lineage.pull_request_url && <div><dt className="font-bold uppercase text-slate-500">Pull request</dt><dd className="mt-1 break-all"><a href={document.source_lineage.pull_request_url} target="_blank" rel="noreferrer" className="font-semibold text-violet-700 underline">{document.source_lineage.pull_request_url}</a></dd></div>}</dl>
            </Section>}

            <Section icon={<AlertTriangle className="h-4 w-4" />} title="What this analysis cannot prove">
              <ul className="space-y-2 text-xs leading-5 text-slate-600">{dossier.limits.map(limit => <li key={limit}>• {limit}</li>)}</ul>
              <div className="mt-3 break-all border-t border-slate-100 pt-3 font-mono text-[10px] text-slate-400">Frozen dossier {document.document_hash}</div>
            </Section>
          </aside>
        </div>
      </div>
    </main>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className={`rounded-2xl border p-4 ${severityStyles[finding.severity] || severityStyles.INFO}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black uppercase">{finding.severity}</span><span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black uppercase">{humanize(finding.disposition)}</span><span className="text-[10px] font-bold uppercase opacity-70">{humanize(finding.category)}</span></div><h3 className="mt-2 font-bold">{finding.title}</h3></div>
        <span className="text-[10px] font-bold uppercase opacity-70">Confidence {finding.confidence}</span>
      </div>
      <p className="mt-2 text-sm leading-6">{finding.summary}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white/60 p-3"><div className="text-[10px] font-black uppercase tracking-wide opacity-60">Failure mode</div><p className="mt-1 text-xs leading-5">{finding.failure_mode}</p></div><div className="rounded-xl bg-white/60 p-3"><div className="text-[10px] font-black uppercase tracking-wide opacity-60">Operator action</div><p className="mt-1 text-xs leading-5">{finding.recommendation}</p></div></div>
      <div className="mt-3 flex flex-wrap gap-1.5">{finding.evidence.map((item, index) => <EvidenceChip key={`${item.kind}-${index}`} kind={item.kind} />)}</div>
      <details className="mt-3 rounded-xl border border-black/10 bg-white/50 p-3"><summary className="cursor-pointer text-xs font-bold">Evidence and affected resources</summary><div className="mt-3 space-y-2">{finding.evidence.map((item, index) => <div key={`${item.statement}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"><div className="flex flex-wrap items-center gap-2"><EvidenceChip kind={item.kind} />{item.plane && <span className="font-bold text-slate-500">Plane {item.plane}</span>}{item.edge_class && <span className="font-bold text-slate-500">{humanize(item.edge_class)}</span>}{item.source_system && <span className="font-mono text-[10px] text-slate-500">{item.source_system}</span>}{item.is_stale && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">STALE</span>}</div><p className="mt-2 text-slate-700">{item.statement}</p>{item.neighbor?.resource_name && <p className="mt-1 font-mono text-[10px] text-slate-500">{item.neighbor.resource_type} · {item.neighbor.resource_name}</p>}{item.freshness?.value && <p className="mt-1 text-[10px] text-slate-500">{item.freshness.field}: {item.freshness.value}</p>}{item.details && Object.keys(item.details).length > 0 && <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-950 p-2 font-mono text-[10px] leading-4 text-slate-200">{JSON.stringify(item.details, null, 2)}</pre>}</div>)}</div>{(() => { const af = normalizeAffectedResources(finding); return af.state === 'NOT_COMPUTED' || af.state === 'UNKNOWN' ? <div className="mt-3"><div className="text-[10px] font-black uppercase text-slate-500">Affected graph resources</div><p className="mt-1 text-xs text-slate-500" data-testid="affected-resources-state">{af.state === 'NOT_COMPUTED' ? 'Not computed' : 'Unknown'}{af.detail ? ` · ${af.detail}` : ''}</p></div> : null })()}
      {(finding.affected_resources?.length ?? 0) > 0 && <div className="mt-3"><div className="text-[10px] font-black uppercase text-slate-500">Affected graph resources</div><div className="mt-2 space-y-1">{(finding.affected_resources ?? []).slice(0, 20).map((resource, index) => <div key={`${resource.resource_id || resource.resource_name}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2 text-xs"><strong>{resource.resource_name || resource.resource_id || 'Unknown resource'}</strong><span className="ml-2 text-slate-500">{resource.resource_type || 'Resource'}{resource.system_names?.length ? ` · ${resource.system_names.join(', ')}` : ''}</span></div>)}</div></div>}</details>
      <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px] opacity-70">{finding.addresses.map(address => <span key={address} className="rounded bg-white/60 px-2 py-1">{address}</span>)}</div>
    </article>
  )
}

function SemanticChangeRow({ change }: { change: SemanticChange }) {
  const cloudAction = change.actions.includes('create') && change.actions.includes('delete') ? 'replace' : change.actions.join(' + ')
  const action = change.is_import ? cloudAction ? `import + ${cloudAction}` : 'import' : cloudAction
  const destructive = cloudAction === 'delete' || cloudAction === 'replace' || (change.is_import && Boolean(cloudAction))
  return <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-mono text-xs font-bold text-slate-900">{change.address}</div><div className="mt-1 text-[11px] text-slate-500">{change.resource_type} · {humanize(change.family)}</div></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${destructive ? 'bg-red-100 text-red-800' : action === 'create' ? 'bg-emerald-100 text-emerald-800' : change.is_import ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{action || 'unknown'}</span>{change.replacement_order && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">{humanize(change.replacement_order)}</span>}</div></div></summary><div className="mt-3 border-t border-slate-100 pt-3">{change.is_import && <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950"><strong>Import ID:</strong> <span className="break-all font-mono">{change.import_id || 'Missing — blocked'}</span>{change.mapping_group_id && <><br /><strong>Mapping group:</strong> <span className="font-mono">{change.mapping_group_id}</span></>}</div>}<div className="text-[10px] font-black uppercase text-slate-500">Changed fields</div><div className="mt-2 flex flex-wrap gap-1.5">{change.changed_paths.length === 0 ? <span className="text-xs text-slate-500">No cloud configuration change is shown in the retained semantic slice.</span> : change.changed_paths.map(path => <span key={path} className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-700">{path}</span>)}</div>{change.replace_paths.length > 0 && <div className="mt-3"><div className="text-[10px] font-black uppercase text-red-600">ForceNew paths</div><div className="mt-1 font-mono text-xs text-red-800">{change.replace_paths.join(', ')}</div></div>}{(change.removed_references?.length || change.added_references?.length) ? <div className="mt-3 grid gap-3 md:grid-cols-2">{Boolean(change.removed_references?.length) && <ReferenceList title="Removed references" values={change.removed_references || []} tone="text-red-700" />}{Boolean(change.added_references?.length) && <ReferenceList title="Added references" values={change.added_references || []} tone="text-emerald-700" />}</div> : null}{change.previous_address && <p className="mt-3 text-xs text-slate-600"><strong>Moved from:</strong> <span className="font-mono">{change.previous_address}</span></p>}</div></details>
}

function ReferenceList({ title, values, tone }: { title: string; values: string[]; tone: string }) {
  return <div><div className={`text-[10px] font-black uppercase ${tone}`}>{title}</div><div className="mt-1 space-y-1">{values.slice(0, 20).map(value => <div key={value} className="break-all rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-700">{value}</div>)}</div></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>
}

function VerdictMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-28 rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-[10px] font-bold uppercase opacity-70">{label}</div><div className="mt-1 text-lg font-black">{value}</div></div>
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">{icon}{title}</div><div className="mt-4">{children}</div></section>
}

function EvidenceChip({ kind }: { kind: string }) {
  const style = kind === 'IAC_PROVEN' ? 'bg-slate-900 text-white' : kind === 'CONFIG_PROVEN' ? 'bg-blue-100 text-blue-800' : kind === 'OBSERVED_RUNTIME' ? 'bg-emerald-100 text-emerald-800' : kind === 'GRAPH_INFERRED' ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-800'
  return <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${style}`}>{humanize(kind)}</span>
}

function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${selected ? 'border-violet-500 bg-violet-100 text-violet-900' : 'border-slate-200 bg-white text-slate-600'}`}>{children}</button>
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{children}</span>
}

function Lineage({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 break-all font-mono text-slate-800">{value}</dd></div>
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
}

function sourceLabel(value?: string): string {
  const labels: Record<string, string> = {
    CLOUDTRAIL_MGMT: 'CloudTrail management events',
    CLOUDTRAIL_DATA: 'CloudTrail data events',
    VPC_FLOW: 'VPC Flow Logs',
    S3_ACCESS_LOGS: 'S3 access logs',
    AWS_CONFIG: 'AWS Config',
    SSM_INVENTORY: 'SSM inventory',
  }
  return labels[value || ''] || humanize(value || 'Unknown source')
}
