"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, CalendarClock, Clock, Info, Loader2, RefreshCw } from "lucide-react"
import {
  COVERAGE_NOT_RECORDED,
  DIGEST_BASIS_NOTE,
  HISTORY_BEFORE_UNKNOWN,
  basisLabel,
  coverageStatusLabel,
  fetchSourceCoverage,
  formatCoverageInstant,
  formatCoverageRange,
  isDigestBasis,
  sourceLabel,
  type AccountCoverage,
  type SourceCoverage,
  type SourceCoverageResult,
} from "@/lib/observation-coverage"

/**
 * Per account → per source: the exact range Cyntro has verified evidence for.
 * Data: GET /api/proxy/coverage/sources → backend /api/coverage/sources.
 * Nothing here is derived from the browser clock or filled in by default; a
 * field the backend did not send is shown as not recorded.
 */
export function SourceCoveragePanel({ accountId }: { accountId?: string | null }) {
  const [result, setResult] = useState<SourceCoverageResult | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    const next = await fetchSourceCoverage(accountId)
    if (mine !== seq.current) return
    setResult(next)
    setLoading(false)
  }, [accountId])

  useEffect(() => {
    void load()
    return () => {
      seq.current++
    }
  }, [load])

  return (
    <section aria-label="Evidence coverage" className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold">READY means the platform is operational, not that history is complete.</p>
          <p className="text-sky-900">
            Each source below lists the exact range Cyntro has verified. Maps, inventory and recommendations are supported only
            for those ranges. {HISTORY_BEFORE_UNKNOWN} Something not observed during a window has not been shown to be absent.
          </p>
        </div>
      </div>

      {loading && !result ? (
        <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading evidence coverage
        </div>
      ) : result?.kind === "ERROR" ? (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Evidence coverage is unavailable</p>
              <p className="mt-1">{result.message}</p>
            </div>
          </div>
          <button onClick={() => void load()} className="shrink-0 font-semibold">Retry</button>
        </div>
      ) : result?.kind === "NOT_RECORDED" ? (
        <div data-testid="coverage-not-recorded" className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-3 font-semibold text-slate-800">{COVERAGE_NOT_RECORDED}</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
            This install has not published a per-source coverage record. Inventory and maps can still appear as they are
            verified; until coverage is recorded, they are not evidence of complete history.
          </p>
          <ReportMeta generatedAt={result.report.generatedAt} generation={result.report.readModelGeneration} />
        </div>
      ) : result?.kind === "PUBLISHED" ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <ReportMeta generatedAt={result.report.generatedAt} generation={result.report.readModelGeneration} />
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              aria-label="Refresh evidence coverage"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /> Refresh
            </button>
          </div>
          {result.report.accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              {accountId
                ? `No coverage is recorded for account ${accountId} yet.`
                : "No accounts are recorded in the coverage record yet."}
            </div>
          ) : (
            result.report.accounts.map((account) => <AccountCoverageCard key={account.accountId} account={account} />)
          )}
        </div>
      ) : null}
    </section>
  )
}

function ReportMeta({ generatedAt, generation }: { generatedAt: string | null; generation: string | null }) {
  if (!generatedAt && !generation) return null
  return (
    <p className="mt-2 text-xs text-slate-500">
      {generatedAt ? <>Recorded {formatCoverageInstant(generatedAt)}</> : null}
      {generatedAt && generation ? " · " : null}
      {generation ? <>read model generation <span className="font-mono">{generation}</span></> : null}
    </p>
  )
}

function AccountCoverageCard({ account }: { account: AccountCoverage }) {
  return (
    <div data-testid={`coverage-account-${account.accountId}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">AWS account</p>
        <p className="font-mono text-sm font-semibold text-slate-800">{account.accountId}</p>
      </div>
      {account.sources.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No sources are recorded for this account yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {account.sources.map((source, index) => (
            <SourceCoverageRow key={`${source.source}|${source.region ?? ""}|${source.scope ?? ""}|${index}`} source={source} />
          ))}
        </div>
      )}
    </div>
  )
}

function statusStyle(status: string): string {
  if (status === "VERIFIED") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "PARTIAL") return "border-amber-200 bg-amber-50 text-amber-800"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  )
}

function SourceCoverageRow({ source }: { source: SourceCoverage }) {
  const where = [source.region, source.scope].filter(Boolean).join(" · ")
  const verifiedBasis = basisLabel(source.earliestVerifiedBasis)
  const beganBasis = basisLabel(source.sourceBeganBasis)
  const digest = isDigestBasis(source.earliestVerifiedBasis)
  return (
    <div data-testid={`coverage-source-${source.source}`} className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{sourceLabel(source.source)}</span>
        {where ? <span className="text-xs text-slate-500">{where}</span> : null}
        <span className={`ml-auto inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyle(source.status)}`}>
          {coverageStatusLabel(source.status)}
        </span>
      </div>

      {source.status === "NOT_STARTED" && !source.earliestVerifiedAt ? (
        <p className="text-sm text-slate-500">Collection has not started for this source; no range is verified.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Earliest verified">
            {formatCoverageInstant(source.earliestVerifiedAt)}
            {verifiedBasis ? <span className="block text-xs text-slate-500">basis: {verifiedBasis}</span> : null}
          </Field>
          {source.sourceBeganAt ? (
            <Field label="Source began">
              {formatCoverageInstant(source.sourceBeganAt)}
              {beganBasis ? <span className="block text-xs text-slate-500">basis: {beganBasis}</span> : null}
            </Field>
          ) : null}
          <Field label="Verified through">{formatCoverageInstant(source.verifiedThrough)}</Field>
          {source.firstVerifiedCollectionAt ? (
            <Field label="First verified collection">{formatCoverageInstant(source.firstVerifiedCollectionAt)}</Field>
          ) : null}
        </dl>
      )}

      <p data-testid="coverage-history-before" className="flex items-start gap-1.5 text-xs text-slate-600">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span>
          {source.earliestVerifiedAt
            ? <>Before {formatCoverageInstant(source.earliestVerifiedAt)}: unknown. </>
            : <>No verified history yet. </>}
          {HISTORY_BEFORE_UNKNOWN}
          {digest ? <> {DIGEST_BASIS_NOTE}</> : null}
        </span>
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Completed windows ({source.completedWindows.length})
          </p>
          {source.completedWindows.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
              {source.completedWindows.map((window) => (
                <li key={`${window.from}|${window.to}`} className="font-mono">{formatCoverageRange(window.from, window.to)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No completed windows recorded.</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Gaps inside the covered period ({source.gaps.length})
          </p>
          {source.gaps.length ? (
            <ul className="mt-1 space-y-1 text-xs text-amber-900">
              {source.gaps.map((gap) => (
                <li key={`${gap.from}|${gap.to}`} data-testid="coverage-gap">
                  <span className="font-mono">{formatCoverageRange(gap.from, gap.to)}</span>
                  <span className="text-amber-800"> — {gap.reason ?? "reason not recorded"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No gaps recorded inside the covered period.</p>
          )}
        </div>
      </div>
    </div>
  )
}
