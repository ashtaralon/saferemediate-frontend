import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = getBackendBaseUrl()

function receiptUnavailable(code: string, message: string, receipt: Record<string, unknown> = {}) {
  // The IAM write may already have happened. An unverified outcome is never
  // permission to retry the mutation; the operator must inspect History.
  return NextResponse.json({
    success: false, blocked: false, code, message,
    retry_safe: false, outcome: "UNKNOWN", ...receipt,
  }, { status: 202 })
}

function exactCurrentCheckpoint(
  listing: any, resourceArn: string, systemName: string,
  snapshotId: string, operationId: string,
): boolean {
  const account = /^arn:aws:iam::([0-9]{12}):role\/.+/.exec(resourceArn)?.[1]
  if (!account || listing?.complete !== true || listing?.scope?.resolved_by !== "server" ||
      listing?.scope?.account_id !== account ||
      typeof listing?.scope?.tenant_id !== "string" || !listing.scope.tenant_id ||
      listing?.selectors?.resource_arn !== resourceArn ||
      listing?.selectors?.system_name !== systemName || !Array.isArray(listing?.snapshots)) return false

  const matches = listing.snapshots.filter((row: any) =>
    row?.resource_arn === resourceArn && row?.system_name === systemName &&
    row?.tenant_id === listing.scope.tenant_id && row?.account_id === account &&
    row?.scope_proof === "PROVEN_TENANT_ACCOUNT" &&
    row?.source === "lifecycle_checkpoint" && row?.state === "VERIFIED" &&
    row?.snapshot_id === snapshotId && row?.operation_id === operationId &&
    row?.current?.code === "CURRENT" && row?.current?.operationId === operationId &&
    row?.rollback_available === true && row?.offer_withheld_reason === null,
  )
  return matches.length === 1
}

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 295_000)

  try {
    const body = await req.json()
    const {
      role_name,
      identity_type,
      resource_id,
      resource_type,
      dry_run = false,  // Changed default to false for direct modify
      create_snapshot = true,
      detach_managed_policies = true,  // Enable by default for managed policies
      detach_all_managed_policies = false,  // Detach ALL policies regardless of overlap
      permissions_to_remove,  // Optional: specific permissions to remove
      resource_arn,
      system_name,
      ...rest
    } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    if (typeof dry_run !== "boolean" || typeof create_snapshot !== "boolean") {
      return NextResponse.json({ success: false, error: "dry_run and create_snapshot must be booleans" }, { status: 422 })
    }

    if (permissions_to_remove !== undefined && !Array.isArray(permissions_to_remove)) {
      return NextResponse.json({ error: "permissions_to_remove must be an array when provided" }, { status: 400 })
    }

    console.log(`[CYNTRO-REMEDIATE] Starting remediation for: ${role_name}`)
    console.log(`[CYNTRO-REMEDIATE] Options: dry_run=${dry_run}, create_snapshot=${create_snapshot}, detach_managed_policies=${detach_managed_policies}, detach_all=${detach_all_managed_policies}`)

    const explicitPermissions = Array.isArray(permissions_to_remove)
      ? Array.from(new Set(
          permissions_to_remove
            .map((perm: unknown) => String(perm || "").trim())
            .filter(Boolean)
        ))
      : null

    if (!dry_run && (!explicitPermissions || explicitPermissions.length === 0)) {
      return NextResponse.json(
        {
          error: "permissions_to_remove is required for live IAM remediation",
          detail: "Refusing to default to the full unused-permission set during execution. Pass the exact permission list chosen by the user.",
        },
        { status: 400 }
      )
    }

    if (!dry_run && (identity_type === "user" || create_snapshot !== true || !system_name ||
        typeof resource_arn !== "string" ||
        !/^arn:aws:iam::[0-9]{12}:role\/.+/.test(resource_arn) ||
        resource_arn.split("/").at(-1) !== role_name)) {
      return NextResponse.json({
        success: false,
        error: "Exact role ARN and system are required for live IAM remediation",
      }, { status: 422 })
    }

    // Live execution: trust the operator's explicit list and skip the
    // gap-analysis pre-fetch entirely. Pre-fetching here was strict overhead
    // (a second hit on a slow Render endpoint) that intermittently 5xx'd
    // under page-load burst and surfaced as "Failed to get role analysis"
    // even though the actual remediate call would have succeeded. The
    // before/after totals returned to the UI only come from the real
    // backend remediation response.
    //
    // Dry runs without an explicit list still need a permission preview;
    // surface that as a clear error instead of silently re-introducing the
    // pre-fetch, since dry-run-without-list isn't a path the modal hits.
    if (!explicitPermissions || explicitPermissions.length === 0) {
      return NextResponse.json(
        { error: "permissions_to_remove is required (dry run preview without an explicit list is not supported)" },
        { status: 400 }
      )
    }
    const permsToRemove = explicitPermissions

    console.log(`[CYNTRO-REMEDIATE] Permissions to remove: ${permsToRemove.length}`)

    // Use the DIRECT IAM remediation endpoint that modifies AWS IAM policies
    // This endpoint:
    // 1. Creates a snapshot before changes
    // 2. Modifies inline policies directly
    // 3. Detaches managed policies if detach_managed_policies=true
    // 4. Updates Neo4j after changes
    const remediatePrefix = identity_type === 'user' ? '/api/iam-users' : '/api/iam-roles'
    const operatorHeaders = await serverDerivedOperatorHeaders(req)
    const res = await fetch(`${BACKEND_URL}${remediatePrefix}/remediate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...operatorHeaders },
      body: JSON.stringify({
        role_name,
        // Carry the exact UI selector through the mounted mutation path.
        // The signed plan remains backend authority; this selector is also
        // checked against its response and scoped History receipt below.
        ...(!dry_run ? { resource_arn, system_name } : {}),
        identity_type: identity_type || 'role',
        permissions_to_remove: permsToRemove,
        dry_run,
        create_snapshot,
        detach_managed_policies,  // CRITICAL: Enables removal of AWS managed policies
        detach_all_managed_policies,  // Detach ALL regardless of permission overlap
        ...rest
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    console.log(`[CYNTRO-REMEDIATE] Response status: ${res.status}`)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[CYNTRO-REMEDIATE] Error: ${res.status} - ${errorText}`)
      let parsed: any = null
      try { parsed = JSON.parse(errorText) } catch { /* plain-text upstream */ }
      const detail = parsed?.detail ?? parsed?.error ?? errorText
      const message = typeof detail === 'string'
        ? detail
        : (detail?.message || detail?.reason || `Remediation failed: ${res.status}`)
      return NextResponse.json({
        success: false,
        error: message,
        detail,
        status: res.status,
        phase: detail?.phase || detail?.block_layer || null,
        operation_id: detail?.operation_id ?? parsed?.operation_id ?? null,
        operation_recorded: detail?.operation_recorded ?? parsed?.operation_recorded ?? null,
      }, { status: res.status })
    }

    const remediateData = await res.json()
    console.log(`[CYNTRO-REMEDIATE] Success response:`, JSON.stringify(remediateData, null, 2))

    // Handle safety gate blocks — pass through the blocked reason clearly
    if (remediateData.blocked) {
      return NextResponse.json({
        success: false,
        blocked: true,
        block_reason: remediateData.block_reason || remediateData.message || "Remediation blocked by safety gate",
        message: remediateData.message || "Remediation blocked",
        action_required: remediateData.action_required,
        confidence: remediateData.confidence,
        warnings: remediateData.warnings || [],
        operation_id: remediateData.operation_id ?? null,
        operation_recorded: remediateData.operation_recorded ?? null,
      })
    }

    const operationId = typeof remediateData.operation_id === "string" && remediateData.operation_id.trim()
      ? remediateData.operation_id : null
    const snapshotId = typeof remediateData.snapshot_id === "string" && remediateData.snapshot_id.trim()
      ? remediateData.snapshot_id : null
    const receipt = {
      operation_id: operationId,
      operation_recorded: remediateData.operation_recorded === true,
      operation_state: remediateData.operation_state ?? null,
      snapshot_id: snapshotId,
    }
    if (!dry_run && (remediateData.success !== true || !operationId || !snapshotId ||
        remediateData.operation_recorded !== true || remediateData.operation_state !== "VERIFIED" ||
        remediateData.role_name !== role_name || remediateData.system_name !== system_name ||
        remediateData.lease_release_error ||
        !Array.isArray(remediateData.recovery_required) || remediateData.recovery_required.length > 0)) {
      return receiptUnavailable("APPLY_RECEIPT_UNVERIFIED",
        "IAM apply outcome is not verified. Inspect scoped History before retrying.", receipt)
    }

    if (!dry_run) {
      try {
        const query = new URLSearchParams({
          resource_arn, system_name, limit: "500", force_refresh: "true",
        })
        const history = await fetch(`${BACKEND_URL}/api/snapshots?${query}`, {
          method: "GET", headers: { Accept: "application/json", ...operatorHeaders },
          cache: "no-store", signal: controller.signal,
        })
        const listing = history.ok ? await history.json() : null
        if (!history.ok || !exactCurrentCheckpoint(listing, resource_arn, system_name, snapshotId!, operationId!)) {
          return receiptUnavailable("APPLY_HISTORY_UNVERIFIED",
            "IAM apply was reported, but its exact current checkpoint is not verified in scoped History. Inspect History before retrying.", receipt)
        }
      } catch {
        return receiptUnavailable("APPLY_HISTORY_UNAVAILABLE",
          "IAM apply was reported, but scoped History could not be read. Inspect History before retrying.", receipt)
      }
    }

    const removedPermissions = typeof remediateData.permissions_removed === "number"
      ? remediateData.permissions_removed : null
    const beforeTotal = typeof remediateData.before_total === "number"
      ? remediateData.before_total : null
    const afterTotal = typeof remediateData.after_total === "number"
      ? remediateData.after_total : null

    const response = {
      dry_run,
      success: remediateData.success === true,
      message: remediateData.message || "IAM remediation verified",
      snapshot_id: snapshotId,
      operation_id: operationId,
      operation_recorded: remediateData.operation_recorded === true,
      operation_state: remediateData.operation_state ?? null,
      resource_arn: dry_run ? null : resource_arn,
      system_name: dry_run ? null : system_name,
      role_name,
      event_id: remediateData.event_id || remediateData.execution_id || null,
      rollback_available: dry_run ? remediateData.rollback_available === true : true,
      remediated_at: remediateData.remediated_at || remediateData.timestamp || null,
      remediated_by: remediateData.remediated_by || null,

      // Direct remediation info (modified in place, no new role)
      permissions_removed: removedPermissions,
      managed_policies_detached: remediateData.managed_policies_detached || [],
      inline_policies_modified: remediateData.inline_policies_modified || [],

      // Steps with status
      steps: remediateData.steps || [],

      // Summary
      summary: {
        before_total: beforeTotal,
        after_total: afterTotal,
        reduction: removedPermissions,
        unused_removed: removedPermissions,
        reduction_percentage: removedPermissions !== null && beforeTotal !== null && beforeTotal > 0
          ? (removedPermissions / beforeTotal) * 100 : null,
      },

      // Raw data for debugging
      raw_response: remediateData
    }

    return NextResponse.json(response)
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  } finally {
    clearTimeout(timeoutId)
  }
}
