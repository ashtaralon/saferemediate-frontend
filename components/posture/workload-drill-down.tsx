"use client"

import { useEffect } from "react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import {
  DEPENDENCY_TIER_META,
  VERDICT_META,
  type PostureWorkloadDetailResponse,
  type WorkloadSummary,
} from "./posture-types"
import { RecommendationsPanel } from "./recommendations-panel"

interface Props {
  workload: WorkloadSummary
  onClose: () => void
}

const SECTION_CLASS = "rounded-md border border-zinc-800 bg-zinc-950/70 p-4"

export function WorkloadDrillDown({ workload, onClose }: Props) {
  const { data, isStale, cachedAt, loading, error, retry } =
    useCachedFetch<PostureWorkloadDetailResponse>(
      `/api/proxy/posture-visibility/workloads/${encodeURIComponent(workload.id)}`,
      {
        cacheKey: `posture-detail:${workload.id}`,
        maxStaleMs: 15 * 60 * 1000,
      },
    )

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const meta = VERDICT_META[workload.posture_verdict] || VERDICT_META.CORRECT
  const evidence = data?.evidence

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[640px] max-w-[100vw] flex-col gap-4 overflow-y-auto border-l border-zinc-800 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {meta.priorityCode} · {meta.label}
          </div>
          <h2 className="mt-1 truncate text-xl font-semibold text-zinc-100">
            {workload.name}
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            {workload.system_name || "—"} · {workload.vpc_id || "—"} · {workload.subnet_id || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-800 px-2 py-1 text-[12px] text-zinc-400 hover:bg-zinc-900"
          aria-label="Close drill-down"
        >
          Close
        </button>
      </div>

      <p className="text-[13px] leading-relaxed text-zinc-300">
        {meta.oneLiner}.
      </p>

      {isStale && (
        <div className="rounded-md border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200">
          Showing cached drill-down{cachedAt ? ` from ${new Date(cachedAt).toLocaleTimeString()}` : ""} while a refresh runs.
        </div>
      )}

      {loading && !data && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-6 text-center text-[12px] text-zinc-400">
          Loading reachability evidence…
        </div>
      )}

      {error && !data && (
        <div className="rounded-md border border-red-800/60 bg-red-950/40 px-3 py-3 text-[12px] text-red-200">
          {error}
          <button
            type="button"
            onClick={retry}
            className="ml-3 rounded border border-red-700 px-2 py-0.5 text-[11px] hover:bg-red-900/60"
          >
            Retry
          </button>
        </div>
      )}

      {data && evidence && (
        <>
          <section className={SECTION_CLASS}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Direct paths · {evidence.direct_paths.length}
            </h3>
            {evidence.direct_paths.length === 0 ? (
              <p className="text-[12px] text-zinc-500">
                No public IP + IGW route + permissive SG combination found.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {evidence.direct_paths.map((p, i) => (
                  <li
                    key={`${p.eni_id || "eni"}-${i}`}
                    className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-[12px] text-zinc-200"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
                      <span className="text-cyan-300">ENI {p.eni_id || "—"}</span>
                      <span>→</span>
                      <span className="text-amber-300">
                        {p.public_ip ? `public ${p.public_ip}` : p.eip_allocation_id ? `EIP ${p.eip_allocation_id}` : "no public ip"}
                      </span>
                      <span>→</span>
                      <span>Subnet {p.subnet_id || "—"}{p.subnet_is_public ? " (public)" : ""}</span>
                      <span>→</span>
                      <span className="text-emerald-300">IGW {p.igw_id || "—"}</span>
                      <span>→</span>
                      <span className="text-red-300">SG {p.permissive_sg_id || "—"} ({p.permissive_sg_port || "any"})</span>
                    </div>
                    {p.nacl_blocks && (
                      <div className="mt-1 text-[11px] text-emerald-400">
                        NACL {p.nacl_id} blocks this path — exposure mitigated.
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={SECTION_CLASS}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Load-balancer chains · {evidence.lb_chains.length}
            </h3>
            {evidence.lb_chains.length === 0 ? (
              <p className="text-[12px] text-zinc-500">
                No internet-facing load balancer targets this workload.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {evidence.lb_chains.map((c, i) => (
                  <li
                    key={`${c.lb_arn}-${i}`}
                    className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-[12px] text-zinc-200"
                  >
                    <div className="font-mono text-[11px] text-amber-300">
                      {c.lb_scheme} {c.lb_type} · {c.lb_name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
                      <span className="text-cyan-300">{c.lb_arn}</span>
                      <span>→</span>
                      <span>Listener SG {c.listener_sg_id || "—"}{c.listener_port ? `:${c.listener_port}` : ""}</span>
                      <span>→</span>
                      <span className="text-red-300">target group {c.target_group_arn || "—"}</span>
                      <span>→</span>
                      <span>this workload</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={SECTION_CLASS}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Observed inbound · 365 days
            </h3>
            <p className="text-[12px] text-zinc-200">
              {evidence.observed_inbound_from_public_365d ? (
                <>
                  <span className="font-semibold text-red-300">Inbound observed</span> from{" "}
                  {evidence.observed_inbound_unique_sources_365d} distinct public source
                  {evidence.observed_inbound_unique_sources_365d === 1 ? "" : "s"}.
                </>
              ) : (
                <span className="text-emerald-300">
                  No inbound from public IPs in the last 365 days — path is latent.
                </span>
              )}
            </p>
          </section>

          {evidence.sensitivity_evidence.length > 0 && (
            <section className={SECTION_CLASS}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Sensitivity signals
              </h3>
              <ul className="flex flex-wrap gap-2 text-[11px]">
                {evidence.sensitivity_evidence.map((s, i) => (
                  <li key={i} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200">
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {evidence.internet_dependency && (
            <section className={SECTION_CLASS}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Internet dependency · {evidence.internet_dependency.observation_window_days}d
              </h3>
              <p className="text-[13px] text-zinc-200">
                <span className="font-semibold">
                  {DEPENDENCY_TIER_META[evidence.internet_dependency.tier].label}
                </span>{" "}
                <span className="text-zinc-400">
                  · {evidence.internet_dependency.distinct_destination_count} distinct destinations
                  {evidence.internet_dependency.aws_via_nat_count > 0 &&
                    ` (${evidence.internet_dependency.aws_via_nat_count} AWS via NAT, ${evidence.internet_dependency.non_aws_count} other)`}
                </span>
              </p>
              <p className="mt-1 text-[12px] text-zinc-400">
                {DEPENDENCY_TIER_META[evidence.internet_dependency.tier].oneLiner}.
              </p>

              {evidence.internet_dependency.aws_services_via_nat.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    AWS services contacted via NAT
                  </div>
                  <ul className="mt-1 flex flex-wrap gap-2 text-[11px]">
                    {evidence.internet_dependency.aws_services_via_nat.map((s) => {
                      const covered = evidence.internet_dependency!.aws_services_with_vpce.includes(s)
                      return (
                        <li
                          key={s}
                          className={
                            covered
                              ? "rounded border border-emerald-700 bg-emerald-950/40 px-2 py-1 text-emerald-200"
                              : "rounded border border-amber-700 bg-amber-950/40 px-2 py-1 text-amber-200"
                          }
                          title={covered ? "VPC Endpoint exists" : "No VPCE — candidate to add one"}
                        >
                          {s} {covered ? "· VPCE ✓" : "· VPCE gap"}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {evidence.internet_dependency.vpce_gap_services.length > 0 && (
                <p className="mt-3 text-[12px] text-amber-200">
                  Recommendation: add VPC Endpoints for{" "}
                  <span className="font-semibold">
                    {evidence.internet_dependency.vpce_gap_services.join(", ")}
                  </span>{" "}
                  in this VPC, then close the NAT egress for the matching CIDRs.
                </p>
              )}

              {evidence.internet_dependency.sample_destinations.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                    Sample destinations ({evidence.internet_dependency.sample_destinations.length})
                  </summary>
                  <ul className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
                    {evidence.internet_dependency.sample_destinations.map((ip) => (
                      <li key={ip} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                        {ip}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          <RecommendationsPanel workloadId={workload.id} />
        </>
      )}
    </aside>
  )
}
