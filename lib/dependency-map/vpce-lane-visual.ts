/** Bug M — VPC ENDPOINTS lane active vs available visual hierarchy. */

export const VPCE_INACTIVE_TOOLTIP =
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
  return `${counts.activeCount} active · ${counts.availableCount} available in subnet`
}

export function vpceCardChrome(isActive: boolean, pathFilterActive: boolean): string {
  if (pathFilterActive) {
    return isActive ? "bg-muted border-border shadow-md" : "bg-card border-border"
  }
  if (isActive) {
    return "ring-2 ring-violet-400 bg-violet-500/15 border-violet-400/70 shadow-md opacity-100"
  }
  return "ring-1 ring-amber-400/40 bg-amber-500/5 border-dashed border-amber-400/40 opacity-60"
}

export function vpceCardTitle(
  isActive: boolean,
  pathFilterActive: boolean,
  serviceTitle: string | undefined,
  vpceId: string,
): string {
  if (!pathFilterActive && !isActive) return VPCE_INACTIVE_TOOLTIP
  return serviceTitle ?? vpceId
}
