/**
 * IAM-role writes are refused here. They belong on the guarded Apply transaction.
 * Security-group changes stay on that family's own execute path.
 */

export type IamShadowRemediationRequest = {
  role_name: string
  annotation?: string
  resource_id?: string
  resource_type?: string
  permissions?: string[]
}

export type IamShadowRemediationResult = {
  success?: boolean
  mode?: string
  shadow_record_id?: string
  role_name?: string
  error?: string
  detail?: string
}

export type IamShadowRecord = {
  id?: string
  role_name?: string
  mode?: string
  created_at?: string
  annotation?: string
}

export async function postIamShadowRemediation(
  req: IamShadowRemediationRequest,
): Promise<IamShadowRemediationResult> {
  const family = String(req.resource_type || "iam-role")
  if (family === "security-group" || family === "sg") {
    return {
      success: false,
      error: "SECURITY_GROUP_FAMILY_SEPARATE",
      detail: "Security-group remediation stays on its own execute path.",
    }
  }
  return {
    success: false,
    error: "IAM_ROLE_WRITE_OUTSIDE_TRANSACTION",
    detail: "IAM-role changes go through the guarded Apply transaction only.",
  }
}

export async function fetchIamShadowRecords(params: {
  role_name?: string
  hours?: number
  limit?: number
}): Promise<{ count: number; records: IamShadowRecord[] }> {
  const q = new URLSearchParams()
  if (params.role_name) q.set("role_name", params.role_name)
  if (params.hours != null) q.set("hours", String(params.hours))
  if (params.limit != null) q.set("limit", String(params.limit))
  const res = await fetch(`/api/proxy/remediation/shadow-records?${q.toString()}`, {
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as {
    count?: number
    records?: IamShadowRecord[]
    error?: string
    detail?: string
  }
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Shadow records fetch failed (${res.status})`)
  }
  return { count: data.count ?? 0, records: data.records ?? [] }
}

export function useIAMRemediation() {
  return {
    executeShadow: postIamShadowRemediation,
    listShadowRecords: fetchIamShadowRecords,
  }
}
