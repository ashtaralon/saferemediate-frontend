"use client"

/**
 * Estate Map · Other-VPC overflow line.
 *
 * When the canvas is scoped to a single VPC, the backend still reports how many
 * of THIS system's workloads live in other VPCs (`out_of_scope_workloads`). We
 * render ONE honest chrome line — never a fake workload card — so the scoped
 * canvas never implies it is the whole system. Clicking switches to the
 * All VPCs · Compare view (the existing scope handler).
 *
 * The backend already excludes null-vpc_id ghosts from `count`; the FE renders
 * `count` verbatim and never recomputes.
 */

import { Layers } from "lucide-react"
import type { OutOfScopeWorkloads } from "./types"

export function OutOfScopeOverflowLine({
  systemName,
  outOfScope,
  onOpenCompare,
}: {
  systemName: string
  outOfScope: OutOfScopeWorkloads | null | undefined
  onOpenCompare: () => void
}) {
  const count = outOfScope?.count ?? 0
  if (count <= 0) return null

  const vpcCount = outOfScope?.by_vpc?.length ?? 0
  const samples = (outOfScope?.sample_names ?? []).filter(Boolean).slice(0, 3)
  const sampleHint = samples.length > 0 ? ` — e.g. ${samples.join(", ")}` : ""
  const vpcHint = vpcCount > 0 ? ` across ${vpcCount} other VPC${vpcCount === 1 ? "" : "s"}` : ""

  return (
    <button
      type="button"
      onClick={onOpenCompare}
      data-testid="topology-out-of-scope-overflow"
      data-out-of-scope-count={count}
      title={`${count} ${systemName} workload${count === 1 ? "" : "s"}${vpcHint} are outside this VPC${sampleHint}. Click to open All VPCs · Compare.`}
      className="w-full flex items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors hover:bg-[#F0FDFA]"
      style={{ borderColor: "#CBD5E1", background: "#FFFFFF" }}
    >
      <span
        className="inline-flex items-center justify-center rounded shrink-0"
        style={{ width: 22, height: 22, background: "#E6FBF7", color: "#0E8B7A" }}
        aria-hidden
      >
        <Layers className="h-3.5 w-3.5" />
      </span>
      <span className="text-[12px] min-w-0 flex-1" style={{ color: "#1A2330" }}>
        <span className="font-semibold tabular-nums">{count}</span>{" "}
        <span className="font-semibold">{systemName}</span> workload
        {count === 1 ? "" : "s"} in other VPCs
        {vpcCount > 0 ? (
          <span style={{ color: "#5A6B7A" }}> · {vpcCount} VPC{vpcCount === 1 ? "" : "s"}</span>
        ) : null}
      </span>
      <span
        className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
        style={{ color: "#0E8B7A" }}
      >
        View all VPCs →
      </span>
    </button>
  )
}
