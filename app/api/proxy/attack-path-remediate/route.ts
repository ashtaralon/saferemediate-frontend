import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

/**
 * Unified remediation proxy for attack-path nodes.
 *
 * Accepts:
 *   node_id, node_type, node_name,
 *   resource_id?, dry_run?, create_snapshot?
 *
 * Routes to the correct backend endpoint based on node_type:
 *   IAMRole / IAMUser       -> /api/iam-roles/remediate  (permission pruning)
 *   SecurityGroup           -> /api/safe-remediate/execute (SG rule cleanup)
 *   S3Bucket / S3Prefix     -> /api/s3-remediation/remediate
 *   AccessKey               -> /api/iam-roles/remediate  (key-level)
 *   other                   -> /api/safe-remediate/execute (generic)
 */
export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 290_000)

  try {
    const body = await req.json()
    const {
      node_id,
      node_type,
      node_name,
      resource_id,
      dry_run = true,
      create_snapshot = true,
      permissions_to_remove,
    } = body

    if (!node_id || !node_type) {
      return NextResponse.json(
        { error: "node_id and node_type are required" },
        { status: 400 },
      )
    }

    const nodeTypeLower = (node_type ?? "").toLowerCase()
    console.log(
      `[ATTACK-PATH-REMEDIATE] node=${node_name} type=${node_type} dry_run=${dry_run}`,
    )

    // ── IAM Role / IAM User ──────────────────────────────────────────
    if (
      nodeTypeLower.includes("iamrole") ||
      nodeTypeLower.includes("iam_role") ||
      nodeTypeLower.includes("role") ||
      nodeTypeLower.includes("iamuser") ||
      nodeTypeLower.includes("iam_user")
    ) {
      const isUser =
        nodeTypeLower.includes("user") || nodeTypeLower.includes("iam_user")
      const identity_type = isUser ? "user" : "role"
      const gapPrefix = isUser ? "/api/iam-users" : "/api/iam-roles"
      const role_name =
        node_name ?? node_id?.split("/").pop() ?? node_id

      // 1. Fetch gap analysis
      const gapRes = await fetch(
        `${BACKEND_URL}${gapPrefix}/${encodeURIComponent(role_name)}/gap-analysis?days=90`,
        { signal: controller.signal, cache: "no-store" },
      )

      let unusedPermissions: string[] = []
      let usedPermissions: string[] = []
      let totalPermissions = 0
      if (gapRes.ok) {
        const gapData = await gapRes.json()
        usedPermissions = gapData.used_permissions ?? []
        unusedPermissions = gapData.unused_permissions ?? []
        totalPermissions =
          gapData.summary?.total_permissions ??
          usedPermissions.length + unusedPermissions.length
      }

      const permsToRemove = Array.isArray(permissions_to_remove)
        ? permissions_to_remove
        : unusedPermissions

      // For dry_run just return the preview
      if (dry_run) {
        clearTimeout(timeoutId)
        return NextResponse.json({
          dry_run: true,
          success: true,
          node_id,
          node_type,
          node_name: role_name,
          identity_type,
          service: "IAM",
          total_permissions: totalPermissions,
          used_permissions: usedPermissions.length,
          unused_permissions: unusedPermissions.length,
          permissions_to_remove: permsToRemove,
          preview_message: `Will remove ${permsToRemove.length} unused permissions from ${role_name}`,
        })
      }

      // 2. Execute remediation
      if (permsToRemove.length === 0) {
        clearTimeout(timeoutId)
        return NextResponse.json({
          dry_run: false,
          success: true,
          node_id,
          message: "No unused permissions to remove",
          permissions_removed: 0,
        })
      }

      const remRes = await fetch(
        `${BACKEND_URL}${gapPrefix}/remediate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_name,
            identity_type,
            permissions_to_remove: permsToRemove,
            dry_run: false,
            create_snapshot,
            detach_managed_policies: true,
          }),
          signal: controller.signal,
          cache: "no-store",
        },
      )
      clearTimeout(timeoutId)

      if (!remRes.ok) {
        const errorText = await remRes.text()
        return NextResponse.json(
          { error: `IAM remediation failed: ${remRes.status}`, detail: errorText },
          { status: remRes.status },
        )
      }

      const remData = await remRes.json()

      if (remData.blocked) {
        return NextResponse.json({
          success: false,
          blocked: true,
          block_reason: remData.block_reason ?? remData.message,
          node_id,
        })
      }

      return NextResponse.json({
        dry_run: false,
        success: true,
        node_id,
        node_type,
        service: "IAM",
        message: remData.message ?? `Removed permissions from ${role_name}`,
        snapshot_id: remData.snapshot_id,
        rollback_available: !!remData.snapshot_id,
        permissions_removed:
          remData.permissions_removed ?? remData.total_permissions_removed ?? permsToRemove.length,
        summary: {
          before_total: totalPermissions,
          after_total: Math.max(0, totalPermissions - (remData.permissions_removed ?? permsToRemove.length)),
        },
      })
    }

    // ── Security Group ───────────────────────────────────────────────
    if (
      nodeTypeLower.includes("securitygroup") ||
      nodeTypeLower.includes("security_group") ||
      nodeTypeLower === "sg"
    ) {
      const sgId = resource_id ?? node_id

      if (dry_run) {
        // Preview: show which rules would be removed
        const previewRes = await fetch(
          `${BACKEND_URL}/api/sg-least-privilege/${encodeURIComponent(sgId)}/analysis`,
          { signal: controller.signal, cache: "no-store" },
        )
        clearTimeout(timeoutId)

        const previewData = previewRes.ok ? await previewRes.json() : {}
        return NextResponse.json({
          dry_run: true,
          success: true,
          node_id,
          node_type,
          service: "SecurityGroup",
          sg_id: sgId,
          unused_rules: previewData.unused_rules ?? [],
          overly_permissive_rules: previewData.overly_permissive ?? [],
          preview_message: `Found ${previewData.unused_rules?.length ?? 0} unused rules and ${previewData.overly_permissive?.length ?? 0} overly permissive rules`,
        })
      }

      const sgRes = await fetch(
        `${BACKEND_URL}/api/safe-remediate/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource_id: sgId,
            resource_type: "SecurityGroup",
            create_snapshot,
          }),
          signal: controller.signal,
          cache: "no-store",
        },
      )
      clearTimeout(timeoutId)

      if (!sgRes.ok) {
        const err = await sgRes.text()
        return NextResponse.json(
          { error: `SG remediation failed: ${sgRes.status}`, detail: err },
          { status: sgRes.status },
        )
      }

      const sgData = await sgRes.json()
      return NextResponse.json({
        dry_run: false,
        success: true,
        node_id,
        node_type,
        service: "SecurityGroup",
        message: sgData.message ?? "Security group rules updated",
        snapshot_id: sgData.snapshot_id,
        rollback_available: !!sgData.snapshot_id,
        ...sgData,
      })
    }

    // ── S3 Bucket / S3 Prefix ────────────────────────────────────────
    if (
      nodeTypeLower.includes("s3") ||
      nodeTypeLower.includes("bucket") ||
      nodeTypeLower.includes("prefix")
    ) {
      const bucketName = node_name ?? node_id

      if (dry_run) {
        const s3Res = await fetch(
          `${BACKEND_URL}/api/s3-remediation/${encodeURIComponent(bucketName)}/analysis`,
          { signal: controller.signal, cache: "no-store" },
        )
        clearTimeout(timeoutId)
        const s3Data = s3Res.ok ? await s3Res.json() : {}
        return NextResponse.json({
          dry_run: true,
          success: true,
          node_id,
          node_type,
          service: "S3",
          bucket_name: bucketName,
          public_access: s3Data.public_access ?? false,
          encryption_enabled: s3Data.encryption_enabled ?? null,
          versioning: s3Data.versioning ?? null,
          preview_message: `S3 bucket ${bucketName} analysis complete`,
          ...s3Data,
        })
      }

      const s3Rem = await fetch(
        `${BACKEND_URL}/api/s3-remediation/remediate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket_name: bucketName,
            resource_type: "S3",
            create_snapshot,
          }),
          signal: controller.signal,
          cache: "no-store",
        },
      )
      clearTimeout(timeoutId)

      if (!s3Rem.ok) {
        const err = await s3Rem.text()
        return NextResponse.json(
          { error: `S3 remediation failed: ${s3Rem.status}`, detail: err },
          { status: s3Rem.status },
        )
      }

      const s3Data = await s3Rem.json()
      return NextResponse.json({
        dry_run: false,
        success: true,
        node_id,
        node_type,
        service: "S3",
        message: s3Data.message ?? `Remediated S3 bucket ${bucketName}`,
        snapshot_id: s3Data.snapshot_id,
        rollback_available: !!s3Data.snapshot_id,
        ...s3Data,
      })
    }

    // ── Access Key ──────────────────────────────────────────────────
    if (nodeTypeLower.includes("accesskey") || nodeTypeLower.includes("access_key")) {
      if (dry_run) {
        clearTimeout(timeoutId)
        return NextResponse.json({
          dry_run: true,
          success: true,
          node_id,
          node_type,
          service: "AccessKey",
          preview_message: `Access key ${node_name ?? node_id} — remediation will deactivate the key`,
        })
      }

      // Deactivate via IAM
      const akRes = await fetch(
        `${BACKEND_URL}/api/safe-remediate/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource_id: node_id,
            resource_type: "AccessKey",
            create_snapshot,
          }),
          signal: controller.signal,
          cache: "no-store",
        },
      )
      clearTimeout(timeoutId)

      const akData = akRes.ok ? await akRes.json() : {}
      return NextResponse.json({
        dry_run: false,
        success: akRes.ok,
        node_id,
        node_type,
        service: "AccessKey",
        message: akData.message ?? `Access key remediation ${akRes.ok ? "succeeded" : "failed"}`,
        ...akData,
      })
    }

    // ── Generic fallback ─────────────────────────────────────────────
    if (dry_run) {
      clearTimeout(timeoutId)
      return NextResponse.json({
        dry_run: true,
        success: true,
        node_id,
        node_type,
        service: node_type,
        preview_message: `Remediation preview for ${node_name ?? node_id} (${node_type})`,
      })
    }

    const genericRes = await fetch(
      `${BACKEND_URL}/api/safe-remediate/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_id: node_id,
          resource_type: node_type,
          create_snapshot,
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    )
    clearTimeout(timeoutId)

    const genericData = genericRes.ok ? await genericRes.json() : {}
    return NextResponse.json({
      dry_run: false,
      success: genericRes.ok,
      node_id,
      node_type,
      service: node_type,
      message: genericData.message ?? `Remediation ${genericRes.ok ? "completed" : "failed"}`,
      ...genericData,
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    console.error("[ATTACK-PATH-REMEDIATE] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
