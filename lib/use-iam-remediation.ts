/**
 * Canonical IAM shadow / execute remediation — single path for LP surfaces.
 * POST /api/proxy/remediation/execute → backend /api/remediation/execute
 * (mode=shadow persists ShadowIAMRemediation; legacy iam-roles/remediate does not).
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
  const res = await fetch("/api/proxy/remediation/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role_name: req.role_name,
      mode: "shadow",
      dry_run: false,
      create_snapshot: true,
      annotation: req.annotation,
      resource_id: req.resource_id,
      resource_type: req.resource_type,
      permissions: req.permissions,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as IamShadowRemediationResult & {
    detail?: string
  }
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Shadow remediation failed (${res.status})`)
  }
  return data
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
