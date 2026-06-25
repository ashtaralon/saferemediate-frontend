/** Bug M — VPC ENDPOINTS lane active vs available visual hierarchy.
 *  2026-06-25: tooltip + inline badge clarified per the
 *  pattern_geometry_must_match_label / pattern_visualize_by_negation
 *  audit. The previous copy ("Available to this workload but not on
 *  the active attack path") read ambiguously with the path-filter off,
 *  and especially for foreign-VPC VPCEs that landed in the lane via a
 *  cross-system EC2 — the operator saw an S3 VPCE chip on alon-prod's
 *  map and assumed private routing when the workload they were
 *  inspecting is in a different VPC. */

/** Pithy badge text rendered inline on the chip when the VPCE has no
 *  flow.vpceId referencing it. Visible without hovering. */
export const VPCE_NOT_USED_BADGE = "Not used"

/** Detailed tooltip explaining WHY the VPCE isn't on the flow chain.
 *  Lists the three real reasons in order of frequency. */
export const VPCE_INACTIVE_TOOLTIP =
  "Not used by any observed flow on this map. Either the workload is in a different VPC, the VPCE serves a different AWS service than the resources on this canvas, or no traffic has been observed through it."

/** Path-filter-on variant — narrower scope ("the active attack path"
 *  specifically), since the path filter restricts the canvas to one
 *  chain. */
export const VPCE_INACTIVE_PATH_TOOLTIP =
  "Available to this workload but not on the active attack path."

export interface VpceLaneCounts {
  activeCount: number
  availableCount: number
}

export function countVpceLane(
  vpceIds: readonly string[],
  activeVpceIds: ReadonlySet<string>,
): VpceLaneCounts {
  const activeCount = vpceIds.filter((id) => activeVpceIds.has(id)).length
  return {
    activeCount,
    availableCount: vpceIds.length - activeCount,
  }
}

export function vpceLaneSubtitle(counts: VpceLaneCounts): string {
  return `${counts.activeCount} active · ${counts.availableCount} not used`
}

export function vpceCardChrome(isActive: boolean, pathFilterActive: boolean): string {
  if (pathFilterActive) {
    return isActive ? "bg-muted border-border shadow-md" : "bg-card border-border"
  }
  if (isActive) {
    return "ring-2 ring-violet-400 bg-violet-500/15 border-violet-400/70 shadow-md opacity-100"
  }
  // Inactive: more muted than before (50% opacity, slate-tinted, dashed
  // border) so it visually steps back from active flow chips. The "Not
  // used" badge rendered alongside compensates for the lower visual
  // weight — operator sees the chip exists but it's clearly secondary.
  return "ring-1 ring-slate-400/30 bg-slate-500/5 border-dashed border-slate-400/40 opacity-50"
}

export function vpceCardTitle(
  isActive: boolean,
  pathFilterActive: boolean,
  serviceTitle: string | undefined,
  vpceId: string,
): string {
  if (!isActive) {
    return pathFilterActive ? VPCE_INACTIVE_PATH_TOOLTIP : VPCE_INACTIVE_TOOLTIP
  }
  return serviceTitle ?? vpceId
}
