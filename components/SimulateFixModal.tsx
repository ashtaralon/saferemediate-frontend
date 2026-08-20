'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  Loader2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Finding {
  id?: string
  finding_id?: string
  title?: string
  description?: string
  severity?: string
  resource?: string
  resourceId?: string
  resourceType?: string
  type?: string
  role_name?: string
}

interface SimulateFixModalProps {
  isOpen?: boolean
  open?: boolean
  onClose: () => void
  finding?: Finding | null
  role?: { id?: string; name?: string; arn?: string; policies?: any[] }
  onExecute?: (...args: any[]) => any
  onRefreshFindings?: () => void
  backendUrl?: string
}

type Step = 'INTRO' | 'REVIEW' | 'REQUESTED' | 'ERROR'

const list = (value: any): any[] => Array.isArray(value) ? value : []

function displayValue(value: any): string {
  if (value === null || value === undefined || value === '') return 'Unknown'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  const parts = [
    value.action,
    value.protocol,
    value.port,
    value.source,
    value.permission,
    value.name,
    value.id,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : JSON.stringify(value)
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="text-teal-700">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  )
}

export function SimulateFixModal({ isOpen, open, onClose, finding, role, onRefreshFindings }: SimulateFixModalProps) {
  const modalOpen = isOpen ?? open ?? false
  const [step, setStep] = useState<Step>('INTRO')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const findingId = finding?.finding_id || finding?.id
  const changeCase = result?.change_case || {}
  const resource = changeCase.resource || changeCase.scope || {}
  const explanation = changeCase.explanation || changeCase.narrative || {}
  const proposed = changeCase.proposed_change || {}
  const evidence = changeCase.evidence || {}
  const approval = changeCase.approval || {}
  const decision = result?.decision || {}

  const evidenceCaveats = useMemo(() => [
    ...list(evidence.caveats),
    ...list(evidence.gaps).map((gap) => gap?.message || displayValue(gap)),
  ].filter(Boolean), [evidence])

  useEffect(() => {
    if (modalOpen) {
      setStep('INTRO')
      setResult(null)
      setError(null)
      setLoading(false)
    }
  }, [modalOpen, findingId])

  const close = () => {
    setStep('INTRO')
    setResult(null)
    setError(null)
    onClose()
  }

  const runAnalysis = async () => {
    if (!findingId) {
      setError('A canonical finding ID is required.')
      setStep('ERROR')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/proxy/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding_id: findingId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || data?.detail || `Analysis failed (${response.status})`)
      }
      setResult(data)
      setStep('REVIEW')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Configuration analysis failed.')
      setStep('ERROR')
    } finally {
      setLoading(false)
    }
  }

  const requestApproval = async () => {
    if (!findingId) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/proxy/simulate/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding_id: findingId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || data?.detail || `Approval request failed (${response.status})`)
      }
      setResult((current: any) => ({ ...current, approval_request: data.approval_request }))
      setStep('REQUESTED')
      onRefreshFindings?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Approval request failed.')
      setStep('ERROR')
    } finally {
      setLoading(false)
    }
  }

  if (!modalOpen || (!finding && !role)) return null

  return (
    <Dialog open={modalOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-0 bg-slate-50 p-0 sm:max-w-[760px]">
        <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2">
              <Badge className="bg-teal-400/15 text-teal-200 hover:bg-teal-400/15">Configuration Change Case</Badge>
              {result?.mode && <Badge variant="outline" className="border-white/25 text-slate-200">{result.mode.replaceAll('_', ' ')}</Badge>}
            </div>
            <DialogTitle className="text-xl text-white">{finding?.title || role?.name || 'Configuration review'}</DialogTitle>
            <DialogDescription className="text-slate-300">
              Evidence, exact scope, risk, approval, checkpoint, and recovery in one review.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-6">
          {step === 'INTRO' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Resource</div>
                    <div className="mt-1 break-all font-mono text-sm text-slate-900">
                      {finding?.resource || finding?.resourceId || role?.arn || role?.name || 'Unknown'}
                    </div>
                  </div>
                  {finding?.severity && <Badge variant="outline">{finding.severity}</Badge>}
                </div>
                <p className="text-sm leading-6 text-slate-600">
                  This is a read-only analysis. It reloads the finding and live resource state, then asks the resource-specific safety engine for an exact plan. No AWS configuration changes in this step.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button onClick={runAnalysis} disabled={loading} className="bg-teal-700 hover:bg-teal-800">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing…</> : 'Build Change Case'}
                </Button>
              </div>
            </div>
          )}

          {step === 'REVIEW' && (
            <>
              <div className={`rounded-xl border p-4 ${decision.action === 'BLOCK' ? 'border-amber-300 bg-amber-50' : 'border-teal-300 bg-teal-50'}`}>
                <div className="flex items-start gap-3">
                  {decision.action === 'BLOCK'
                    ? <LockKeyhole className="mt-0.5 h-5 w-5 text-amber-700" />
                    : <ShieldCheck className="mt-0.5 h-5 w-5 text-teal-700" />}
                  <div>
                    <div className="font-semibold text-slate-900">
                      {decision.action === 'BLOCK'
                        ? result?.mode === 'VISIBILITY_ONLY'
                          ? 'Visibility only — no change is authorized'
                          : 'Analysis complete — no safe change is authorized'
                        : 'Exact plan built — separate approval required'}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{list(decision.reasons)[0] || explanation.customer_action}</div>
                  </div>
                </div>
              </div>

              <Section icon={<ClipboardCheck className="h-4 w-4" />} title="What this means">
                <div className="space-y-2 text-sm leading-6 text-slate-700">
                  <p><span className="font-medium text-slate-900">Issue:</span> {explanation.issue || finding?.description || 'No issue explanation was returned.'}</p>
                  <p><span className="font-medium text-slate-900">Risk:</span> {explanation.meaning || 'Risk explanation was not computed.'}</p>
                  <p><span className="font-medium text-slate-900">Next:</span> {explanation.customer_action || 'Review the evidence and decision.'}</p>
                </div>
              </Section>

              <Section icon={<ShieldCheck className="h-4 w-4" />} title="Exact proposed change">
                <div className="mb-3 text-sm text-slate-700">{proposed.summary || proposed.claim || result?.simulation?.summary}</div>
                {list(proposed.permissions_to_remove).length > 0 && (
                  <div className="mb-4 max-h-40 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-teal-100">
                    {list(proposed.permissions_to_remove).map((permission, index) => <div key={`${permission}-${index}`}>− {permission}</div>)}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Before</div>
                    {list(proposed.before).length ? list(proposed.before).map((item, index) => <div key={index} className="mb-1 break-all text-xs text-slate-700">{displayValue(item)}</div>) : <div className="text-xs text-slate-500">No exact before-state change is proposed.</div>}
                  </div>
                  <div className="rounded-lg border border-teal-100 bg-teal-50 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700">After</div>
                    {list(proposed.after).length ? list(proposed.after).map((item, index) => <div key={index} className="mb-1 break-all text-xs text-slate-700">{displayValue(item)}</div>) : <div className="text-xs text-slate-500">No mutation.</div>}
                  </div>
                </div>
              </Section>

              <Section icon={<FileClock className="h-4 w-4" />} title="Evidence and confidence">
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge variant="outline">Coverage: {evidence.complete === true ? 'Complete' : evidence.complete === false ? 'Partial' : 'Unknown'}</Badge>
                  {evidence.confidence && <Badge variant="outline">Confidence: {String(evidence.confidence)}</Badge>}
                  {evidence.observation_window_days != null && <Badge variant="outline">{evidence.observation_window_days} observed days</Badge>}
                </div>
                {list(evidence.sources).length > 0 && <p className="text-xs text-slate-600">Sources: {list(evidence.sources).join(', ')}</p>}
                {evidenceCaveats.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-amber-800">
                    {evidenceCaveats.map((caveat, index) => <li key={index}>• {displayValue(caveat)}</li>)}
                  </ul>
                )}
              </Section>

              <Section icon={<Users className="h-4 w-4" />} title="Blast radius and shared use">
                <div className="text-sm text-slate-700">
                  <div>Target: <span className="font-mono text-xs">{resource.name || resource.resource_name || resource.id || finding?.resourceId}</span></div>
                  <div className="mt-1">Known consumers: {list(changeCase.blast_radius?.consumers || changeCase.blast_radius?.shared_substrate).length}</div>
                  {changeCase.blast_radius?.consumers_complete === false || changeCase.blast_radius?.shared_substrate_complete === false
                    ? <div className="mt-1 text-amber-700">The consumer list is context, not an attested complete inventory.</div>
                    : null}
                </div>
              </Section>

              <div className="grid gap-4 sm:grid-cols-2">
                <Section icon={<ShieldCheck className="h-4 w-4" />} title="Rollout and stop conditions">
                  <ol className="space-y-1 text-xs text-slate-700">
                    {list(changeCase.rollout?.steps).map((item, index) => <li key={index}>{index + 1}. {displayValue(item)}</li>)}
                  </ol>
                  {list(changeCase.rollout?.stop_conditions).length > 0 && <div className="mt-3 text-xs font-medium text-red-700">Stops on: {list(changeCase.rollout.stop_conditions).join(' · ')}</div>}
                </Section>
                <Section icon={<RotateCcw className="h-4 w-4" />} title="Snapshot, history, and restore">
                  <div className="space-y-2 text-xs text-slate-700">
                    <p>Rollback: <strong>{changeCase.rollback?.available ? 'Available' : 'Not available'}</strong></p>
                    <p>{changeCase.rollback?.summary || changeCase.rollback?.reason}</p>
                    <p>Checkpoint: {changeCase.history?.checkpoint_timing || changeCase.history?.reason || 'Created at the canonical mutation boundary.'}</p>
                  </div>
                </Section>
              </div>

              <Section icon={<LockKeyhole className="h-4 w-4" />} title="Authorization">
                <div className="text-sm text-slate-700">
                  <div>Status: <strong>{approval.status || (approval.required ? 'Approval required' : 'No approval workflow')}</strong></div>
                  {approval.workflow && <div className="mt-1">Workflow: {approval.workflow.replaceAll('_', ' ')}</div>}
                  {approval.reason && <div className="mt-2 text-amber-700">{approval.reason}</div>}
                </div>
              </Section>

              <div className="flex justify-end gap-2 pb-1">
                <Button variant="outline" onClick={close}>Close</Button>
                {decision.action !== 'BLOCK' && approval.required && approval.available && (
                  <Button onClick={requestApproval} disabled={loading} className="bg-teal-700 hover:bg-teal-800">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Requesting…</> : 'Request approval'}
                  </Button>
                )}
              </div>
            </>
          )}

          {step === 'REQUESTED' && (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-teal-700" />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Approval request created</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                A different authorized operator must approve the exact signed plan. No AWS change has occurred.
              </p>
              {result?.approval_request?.request_id && <div className="mx-auto mt-4 w-fit rounded bg-slate-100 px-3 py-2 font-mono text-xs">{result.approval_request.request_id}</div>}
              <Button className="mt-6" variant="outline" onClick={close}>Done</Button>
            </div>
          )}

          {step === 'ERROR' && (
            <div className="py-8 text-center">
              <AlertCircle className="mx-auto h-9 w-9 text-red-600" />
              <h3 className="mt-3 font-semibold text-slate-900">Change Case could not be completed</h3>
              <p className="mx-auto mt-2 max-w-lg break-words text-sm text-red-700">{error}</p>
              <div className="mt-6 flex justify-center gap-2">
                <Button variant="outline" onClick={close}>Close</Button>
                <Button variant="outline" onClick={() => setStep('INTRO')}>Try again</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
