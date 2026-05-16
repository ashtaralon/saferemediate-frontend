"use client"

import { useCallback, useState } from "react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import type {
  PostureExecuteResponse,
  PostureRecommendation,
  PostureRecommendationsResponse,
} from "./posture-types"

interface Props {
  workloadId: string
}

const SECTION_CLASS = "rounded-md border border-zinc-800 bg-zinc-950/70 p-4"

const ACTION_LABEL: Record<PostureRecommendation["action"], string> = {
  SG_RULE_DELETE_PUBLIC_INGRESS: "Close public ingress",
  ADD_VPC_ENDPOINT: "Add VPC Endpoint",
  MOVE_WORKLOAD_TO_PRIVATE: "Move to private subnet",
  REMOVE_PUBLIC_IP: "Remove public IP",
  CLOSE_NAT_EGRESS: "Close NAT egress",
}

interface PerProposalState {
  stage?: string
  status?: string
  error?: string
  pipelineId?: string
  snapshotId?: string | null
  loading?: boolean
}

export function RecommendationsPanel({ workloadId }: Props) {
  const { data, isStale, loading, error, retry } =
    useCachedFetch<PostureRecommendationsResponse>(
      `/api/proxy/posture-visibility/workloads/${encodeURIComponent(workloadId)}/recommendations`,
      {
        cacheKey: `posture-recs:${workloadId}`,
        maxStaleMs: 5 * 60 * 1000,
      },
    )
  const [proposalState, setProposalState] = useState<Record<string, PerProposalState>>({})

  const executeOne = useCallback(
    async (rec: PostureRecommendation, maxStage: "SIMULATE" | "FULL") => {
      setProposalState((s) => ({
        ...s,
        [rec.proposal_id]: { ...s[rec.proposal_id], loading: true, error: undefined },
      }))
      try {
        const res = await fetch("/api/proxy/posture-visibility/proposals/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal_id: rec.proposal_id,
            action: rec.action,
            resource_type: rec.resource_type,
            resource_id: rec.resource_id,
            parameters: rec.parameters,
            max_stage: maxStage,
            requested_by: "posture-ui",
          }),
        })
        const body: PostureExecuteResponse | { error: string } = await res.json()
        if (!res.ok || "error" in body) {
          setProposalState((s) => ({
            ...s,
            [rec.proposal_id]: {
              loading: false,
              error: "error" in body ? body.error : `HTTP ${res.status}`,
            },
          }))
          return
        }
        const cr = (body.change_results || [])[0]
        setProposalState((s) => ({
          ...s,
          [rec.proposal_id]: {
            loading: false,
            stage: body.stage,
            status: body.status,
            pipelineId: body.pipeline_id,
            snapshotId: cr?.snapshot_id ?? null,
            error: cr?.error || (body.errors?.length ? body.errors.join("; ") : undefined),
          },
        }))
      } catch (e: any) {
        setProposalState((s) => ({
          ...s,
          [rec.proposal_id]: { loading: false, error: e?.message || String(e) },
        }))
      }
    },
    [],
  )

  if (loading && !data) {
    return (
      <section className={SECTION_CLASS}>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Recommended actions
        </h3>
        <p className="text-[12px] text-zinc-500">Loading recommendations…</p>
      </section>
    )
  }
  if (error && !data) {
    return (
      <section className={SECTION_CLASS}>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Recommended actions
        </h3>
        <p className="text-[12px] text-red-200">
          {error}
          <button
            type="button"
            onClick={retry}
            className="ml-3 rounded border border-red-700 px-2 py-0.5 text-[11px] hover:bg-red-900/60"
          >
            Retry
          </button>
        </p>
      </section>
    )
  }
  if (!data) return null
  if (data.recommendations.length === 0) {
    return (
      <section className={SECTION_CLASS}>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Recommended actions
        </h3>
        <p className="text-[12px] text-emerald-200">
          No remediations recommended — workload is contained and dependencies are covered.
        </p>
      </section>
    )
  }

  return (
    <section className={SECTION_CLASS}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        Recommended actions · {data.recommendations.length}
        {isStale && <span className="ml-2 text-amber-300">(cached)</span>}
      </h3>
      <ul className="flex flex-col gap-3">
        {data.recommendations.map((rec) => {
          const st = proposalState[rec.proposal_id] || {}
          const isExecuted = !!st.status && !st.error
          return (
            <li
              key={rec.proposal_id}
              className={`rounded border ${
                rec.auto_eligible ? "border-zinc-800" : "border-amber-900/60"
              } bg-zinc-900/60 p-3`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        rec.auto_eligible ? "bg-emerald-700 text-emerald-50" : "bg-amber-800 text-amber-100"
                      }`}
                    >
                      {rec.auto_eligible ? "Auto" : "Manual"}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">
                      {ACTION_LABEL[rec.action] || rec.action}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-zinc-100">{rec.summary}</div>
                  <p className="mt-1 text-[12px] text-zinc-400">{rec.rationale}</p>
                  {rec.manual_reason && (
                    <p className="mt-1 text-[11px] text-amber-200">{rec.manual_reason}</p>
                  )}
                </div>
                {rec.auto_eligible && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      disabled={st.loading || isExecuted}
                      onClick={() => executeOne(rec, "SIMULATE")}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Simulate
                    </button>
                    <button
                      type="button"
                      disabled={st.loading || isExecuted}
                      onClick={() => {
                        if (!confirm(`Execute ${rec.summary}? This mutates AWS.`)) return
                        executeOne(rec, "FULL")
                      }}
                      className="rounded border border-red-700 bg-red-950/40 px-2 py-0.5 text-[11px] text-red-100 hover:bg-red-900/40 disabled:opacity-50"
                    >
                      Execute
                    </button>
                  </div>
                )}
              </div>

              {st.loading && (
                <p className="mt-2 text-[11px] text-zinc-400">Running pipeline…</p>
              )}
              {st.error && (
                <p className="mt-2 text-[11px] text-red-200">Error: {st.error}</p>
              )}
              {st.status && !st.error && (
                <div className="mt-2 text-[11px] text-zinc-300">
                  <span className="text-zinc-500">Stage:</span> {st.stage} ·{" "}
                  <span className="text-zinc-500">Status:</span>{" "}
                  <span className={st.status === "COMPLETED" ? "text-emerald-300" : "text-zinc-200"}>
                    {st.status}
                  </span>
                  {st.snapshotId && (
                    <>
                      {" "}· <span className="text-zinc-500">Snapshot:</span>{" "}
                      <code className="font-mono text-[10px] text-zinc-200">{st.snapshotId}</code>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
