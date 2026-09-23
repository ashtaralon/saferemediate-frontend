import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { isSameOriginMutation, serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

const BACKEND_URL = getBackendBaseUrl()
type Row = Record<string, unknown>

function object(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null
}

function refusal(status: number, code: string, extra: Row = {}) {
  return NextResponse.json({ detail: { code, ...extra }, success: false }, { status })
}

async function scopedHistory(req: NextRequest, arn: string, system: string): Promise<Response> {
  const target = new URL(`${BACKEND_URL}/api/snapshots`)
  target.searchParams.set("resource_arn", arn)
  target.searchParams.set("system_name", system)
  target.searchParams.set("limit", "500")
  target.searchParams.set("force_refresh", "true")
  return fetch(target, {
    headers: { Accept: "application/json", ...(await serverDerivedOperatorHeaders(req)) },
    cache: "no-store",
  })
}

function matchingHistory(payload: unknown, arn: string, system: string, snapshot: string, operation: string) {
  const list = object(payload)
  const scope = object(list?.scope)
  const selectors = object(list?.selectors)
  const account = /^arn:aws:iam::([0-9]{12}):role\/.+/.exec(arn)?.[1]
  if (!account || list?.complete !== true || scope?.resolved_by !== "server" ||
      scope?.account_id !== account || typeof scope?.tenant_id !== "string" ||
      selectors?.resource_arn !== arn || selectors?.system_name !== system ||
      !Array.isArray(list?.snapshots)) return null
  const matches = list.snapshots.filter((value: unknown) => {
    const row = object(value)
    return row?.snapshot_id === snapshot && row?.operation_id === operation &&
      row?.resource_arn === arn && row?.system_name === system &&
      row?.account_id === account && row?.tenant_id === scope.tenant_id &&
      row?.scope_proof === "PROVEN_TENANT_ACCOUNT" &&
      row?.source === "lifecycle_checkpoint" && row?.state === "VERIFIED"
  })
  return matches.length === 1 ? object(matches[0]) : null
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return refusal(403, "RESTORE_ORIGIN_REFUSED")
  const body = object(await req.json().catch(() => null))
  if (!body || "role_name" in body || "checkpoint_id" in body) {
    return refusal(422, "RESTORE_EXACT_OPERATION_REQUIRED")
  }
  const snapshot = body.snapshot_id
  const operation = body.operation_id
  const arn = body.resource_arn
  const system = body.system_name
  if (![snapshot, operation, arn, system].every(value => typeof value === "string" && value.trim())) {
    return refusal(422, "RESTORE_EXACT_OPERATION_REQUIRED")
  }
  const [snapshotId, forwardOperationId, resourceArn, systemName] =
    [snapshot, operation, arn, system] as string[]
  if (!/^arn:aws:iam::[0-9]{12}:role\/.+/.test(resourceArn) || snapshotId.includes("/")) {
    return refusal(422, "RESTORE_SCOPE_INVALID")
  }

  try {
    const beforeResponse = await scopedHistory(req, resourceArn, systemName)
    const before = await beforeResponse.json().catch(() => null)
    if (!beforeResponse.ok) return NextResponse.json(before ?? { detail: { code: "SNAPSHOT_LIST_UNAVAILABLE" } }, { status: beforeResponse.status })
    const selected = matchingHistory(before, resourceArn, systemName, snapshotId, forwardOperationId)
    const current = object(selected?.current)
    if (!selected || selected.rollback_available !== true || selected.offer_withheld_reason !== null ||
        current?.code !== "CURRENT" || current?.operationId !== forwardOperationId) {
      return refusal(409, "RESTORE_NOT_CURRENT", { snapshot_id: snapshotId, operation_id: forwardOperationId })
    }

    // The backend repeats the authority check under its role lock. The proxy
    // sends one exact checkpoint id and never routes by a display name.
    const response = await fetch(`${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await serverDerivedOperatorHeaders(req)) },
      body: "{}",
      cache: "no-store",
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) return NextResponse.json(result ?? { detail: { code: "RESTORE_BACKEND_UNAVAILABLE" } }, { status: response.status })
    const receipt = object(result)
    const commits = object(receipt?.commit_receipts)
    const outcome = object(commits?.operation_outcome)
    const consumed = object(commits?.checkpoint_consumed)
    const restoreOperationId = receipt?.operation_id
    if (receipt?.success !== true || receipt?.code !== "RESTORE_VERIFIED" ||
        receipt?.source !== "lifecycle_checkpoint" || receipt?.snapshot_id !== snapshotId ||
        receipt?.restores_operation_id !== forwardOperationId ||
        typeof restoreOperationId !== "string" || !restoreOperationId ||
        receipt?.operation_recorded !== true ||
        outcome?.operation_id !== restoreOperationId || consumed?.status !== "ROLLED_BACK") {
      return refusal(202, "RESTORE_RECEIPT_UNVERIFIED", { snapshot_id: snapshotId, operation_id: forwardOperationId })
    }

    const afterResponse = await scopedHistory(req, resourceArn, systemName)
    const after = await afterResponse.json().catch(() => null)
    const history = afterResponse.ok
      ? matchingHistory(after, resourceArn, systemName, snapshotId, forwardOperationId)
      : null
    const restoration = object(history?.restoration)
    if (!history || history.rollback_available !== false ||
        restoration?.validated !== true || restoration?.restoredByOperationId !== restoreOperationId) {
      return refusal(202, "RESTORE_HISTORY_PENDING", {
        snapshot_id: snapshotId, operation_id: forwardOperationId,
        restore_operation_id: restoreOperationId,
      })
    }
    return NextResponse.json({
      success: true, code: "RESTORE_VERIFIED", snapshot_id: snapshotId,
      operation_id: restoreOperationId, restores_operation_id: forwardOperationId,
      operation_recorded: true, commit_receipts: commits,
      history: { current: history.current, restoration },
    }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return refusal(503, "RESTORE_OUTCOME_UNAVAILABLE", { snapshot_id: snapshotId, operation_id: forwardOperationId })
  }
}
