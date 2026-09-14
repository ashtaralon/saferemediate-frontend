"use client"

/**
 * Orphan-resources view.
 *
 * None of the four detection endpoints this view knows about can be presented
 * today, and the page issues no request at all:
 *   GET /api/iam-roles/orphan-detection         refused at the serving boundary
 *   GET /api/s3-buckets/orphan-detection        refused at the serving boundary
 *   GET /api/iam-policies/orphan-detection      refused at the serving boundary
 *   GET /api/security-groups/orphan-detection   graph-backed inputs, but its
 *                                               findings are selected and
 *                                               graded by the legacy
 *                                               determine_status_and_severity
 *                                               calculator; P4D.4 must migrate
 *                                               that judgement first
 *
 * Were the SG read presentable, its scope would be deployment-bound rather
 * than account-wide: `resolve_system_name(None)` resolves one system from the
 * deployment's tenant pin and refuses rather than guessing.
 *
 * The dedicated per-system orphan-services-tab (mounted under each system
 * detail) handles the rich classification flow (graduated thresholds,
 * seasonal pattern detection, etc). This page is the read-only roll-up. It is
 * informational, and at present it presents nothing: no finding it could show
 * is a fact it is entitled to state, and no quarantine or delete route can be
 * honoured from here. `lib/orphan-availability.ts` carries both matrices and
 * the proof behind each entry.
 */

import { OrphanResourcesPanel } from "@/components/orphan-resources-panel"

export default function OrphanResourcesPage() {
  return <OrphanResourcesPanel />
}
