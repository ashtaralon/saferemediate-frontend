/**
 * The Resource Risk drawer's Preview request, dispatched by the row's REAL resource type.
 *
 * Which types have a drawer Preview is decided by one table, LP_DRAWER_PREVIEW_SUPPORT
 * (lib/lp-review-routing.ts). A type without one gets `{ kind: "unsupported" }` and NO request:
 * the drawer used to send every non-Security-Group row to the IAM simulate-fix as `IAMRole`.
 */
import {
  resolveLPDrawerPreview,
  type LPDrawerPreviewDispatch,
  type LPPreviewCapability,
} from "@/lib/lp-review-routing"

export type LPDrawerPreviewRow = {
  id: string
  resourceType: string
  resourceName: string
  resourceArn?: string | null
  systemName?: string | null
  region?: string | null
  findingId?: string | null
}

export type LPDrawerPreviewRequest =
  | { kind: "unsupported"; dispatch: Extract<LPDrawerPreviewDispatch, { supported: false }> }
  | { kind: "security_group"; sgId: string; response: Response }
  | { kind: "iam_role"; response: Response }

export type LPDrawerPreviewContext = {
  capabilities?: ReadonlyArray<LPPreviewCapability> | null
  /** The page-level system, used when the row carries none. */
  systemName?: string | null
  /** Cached SG gap analysis (LeastPrivilegeTab.fetchSGGapAnalysis). */
  sgGapAnalysis: (sgId: string) => Promise<any>
}

/** Copy for a type the drawer cannot Preview. Names the type; never implies another type's Preview ran. */
export function lpDrawerPreviewUnsupportedCopy(
  dispatch: Extract<LPDrawerPreviewDispatch, { supported: false }>,
): { title: string; body: string } {
  return {
    title: `Preview not supported for ${dispatch.resourceType}`,
    body:
      dispatch.reason === "BACKEND_PREVIEW_UNSUPPORTED"
        ? `This deployment does not offer a Preview for ${dispatch.resourceType}. Nothing was simulated.`
        : `The Resource Risk drawer has no Preview for ${dispatch.resourceType}. Nothing was simulated.`,
  }
}

function securityGroupId(row: LPDrawerPreviewRow): string {
  let sgId = row.id
  if (!sgId?.startsWith("sg-")) {
    if (row.resourceName?.startsWith("sg-")) {
      sgId = row.resourceName
    } else if (row.resourceArn?.includes("security-group/")) {
      const match = row.resourceArn.match(/security-group\/(sg-[a-z0-9]+)/)
      if (match) sgId = match[1]
    }
  }
  return sgId || ""
}

/** The IAM simulate-fix body. Only ever built for a row whose type dispatched to the IAM Preview. */
export function iamSimulateFixBody(row: LPDrawerPreviewRow, systemName: string) {
  return {
    resource_type: "IAMRole",
    resource_id: row.resourceName || row.resourceArn?.split("/").pop() || row.id,
    system_name: systemName,
    finding_id: row.findingId,
  }
}

export async function requestLPDrawerPreview(
  row: LPDrawerPreviewRow,
  context: LPDrawerPreviewContext,
): Promise<LPDrawerPreviewRequest> {
  const dispatch = resolveLPDrawerPreview(row.resourceType, context.capabilities)
  if (!dispatch.supported) return { kind: "unsupported", dispatch }

  if (dispatch.preview === "sg-remediation-simulate") {
    const sgId = securityGroupId(row)
    const gapData = await context.sgGapAnalysis(sgId)
    // A failed gap-analysis read (null) is not "no rules to change": simulating
    // an empty rule set would preview a clean no-op for an SG never analysed.
    if (!gapData) throw new Error("Failed to load analysis")
    const rulesToDelete = gapData?.rules_analysis
      ?.filter((r: any) => r.recommendation?.action === "DELETE")
      ?.map((r: any) => r.rule_id) || []
    const rulesToTighten = gapData?.rules_analysis
      ?.filter((r: any) => r.recommendation?.action === "TIGHTEN")
      ?.map((r: any) => ({
        rule_id: r.rule_id,
        new_cidrs: r.recommendation?.suggested_cidrs || [],
      })) || []
    const response = await fetch("/api/proxy/remediation/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sg_id: sgId,
        rules_to_delete: rulesToDelete,
        rules_to_tighten: rulesToTighten,
        region: row.region || "eu-west-1",
      }),
    })
    return { kind: "security_group", sgId, response }
  }

  const effectiveSystemName = row.systemName || context.systemName
  if (!effectiveSystemName) {
    throw new Error("System context is missing — cannot verify safety for this role. Refresh the page or select a system.")
  }
  const response = await fetch("/api/proxy/least-privilege/simulate-fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(iamSimulateFixBody(row, effectiveSystemName)),
  })
  return { kind: "iam_role", response }
}
