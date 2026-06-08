"use client"

/**
 * Account-wide orphan-resources view.
 *
 * Surfaces the Phase 1-4 backend endpoints:
 *   GET /api/security-groups/orphan-detection
 *   GET /api/iam-roles/orphan-detection
 *   GET /api/s3-buckets/orphan-detection
 *   GET /api/iam-policies/orphan-detection
 *
 * The dedicated per-system orphan-services-tab (mounted under each system
 * detail) handles the rich classification flow (graduated thresholds,
 * seasonal pattern detection, etc). This page is the account-wide
 * read-only roll-up so the operator can see every orphan in one place
 * before clicking through to act.
 */

import { OrphanResourcesPanel } from "@/components/orphan-resources-panel"

export default function OrphanResourcesPage() {
  return <OrphanResourcesPanel />
}
