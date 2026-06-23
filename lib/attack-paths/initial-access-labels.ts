/**
 * Initial-access category display labels + severity rank.
 *
 * This module is a PURE 1:1 mapping over `ConvergencePath.initial_access[].category`.
 * It does NOT regroup, fold, or invent buckets — every category the backend emits
 * gets exactly one entry here, and every chip rendered in the UI traces directly
 * back to the engine's verdict.
 *
 * Why this discipline (per session decision 2026-06-22):
 *   - The engine's taxonomy is the source of truth for what counts as an entry
 *     point. The FE never disagrees with it by hiding a real category under
 *     "Other" or by inventing a category the engine didn't emit.
 *   - Ordering is by SEVERITY rank, never by "first-class vs other." Operators
 *     see worst-first regardless of which categories happen to apply.
 *   - When the backend ships a new category (e.g. when the ECR or EKS collector
 *     lands — tracked in `project_initial_access_classifier_ecr_eks_gap`), it
 *     surfaces automatically with an `Unknown category` chip until a label is
 *     added here. We never silently drop it.
 *
 * Backend source: `classifiers/initial_access_classifier.py`.
 */

import type { ConvergencePath } from "./convergence-types"

export type InitialAccessSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

export interface InitialAccessLabel {
  /** Operator-readable English. Short enough to fit in a row chip. */
  label: string
  /** Severity rank for sort + chip color. */
  severity: InitialAccessSeverity
  /** One-line attacker-perspective explainer for the tooltip. */
  description: string
}

/**
 * 1:1 verbatim from the backend `classifiers/initial_access_classifier.py`.
 * Keys MUST match exactly. New backend categories will fall through to the
 * `UNKNOWN_CATEGORY` placeholder until a label is added here.
 */
export const INITIAL_ACCESS_LABELS: Record<string, InitialAccessLabel> = {
  IMDS_CREDENTIAL_THEFT: {
    label: "EC2 IMDS credential theft",
    severity: "CRITICAL",
    description:
      "An attacker reaching the workload over SSRF / RCE can read IMDSv1 and steal the EC2 instance role's credentials directly.",
  },
  EXPOSED_WORKLOAD_RCE: {
    label: "Public workload RCE",
    severity: "HIGH",
    description:
      "The workload is reachable from the internet (public IP or public ALB/NLB/API Gateway). Compromising it gives the attacker the workload's IAM role.",
  },
  LEAKED_ACCESS_KEY: {
    label: "Leaked access key",
    severity: "HIGH",
    description:
      "A long-lived AWS access key is in scope for this path — git history, CI logs, paste sites, or stolen laptop. The attacker uses it directly.",
  },
  EXPOSED_RDS_SNAPSHOT: {
    label: "Public RDS snapshot",
    severity: "HIGH",
    description:
      "An RDS snapshot is shared with all AWS accounts. The attacker copies the snapshot, restores it in their account, reads the database.",
  },
  CROSS_ACCOUNT_TRUST: {
    label: "Cross-account trust",
    severity: "MEDIUM",
    description:
      "An IAM role on this path trusts an external AWS account (or `*`). The attacker assumes the role from outside the boundary.",
  },
  COGNITO_OR_FEDERATED_IDP: {
    label: "Federated IdP / Cognito",
    severity: "MEDIUM",
    description:
      "A federated identity provider (Cognito, SAML, OIDC) is the entry. The attacker phishes / compromises an IdP user and pivots into AWS.",
  },
  CONSOLE_OR_CLOUDSHELL: {
    label: "Console / CloudShell",
    severity: "MEDIUM",
    description:
      "A human console session or CloudShell environment is the entry. The attacker compromises the operator's browser, MFA fatigue, or device.",
  },
  UNKNOWN: {
    label: "Unclassified",
    severity: "LOW",
    description:
      "The classifier ran but couldn't fit this path's origin into a named category. Treat as unverified — likely an internal-lateral path with no external entry surfaced.",
  },
}

/** Severity → sort rank (higher = worse). Used only for ordering chips
 *  within a single path. Across paths the backend's `priority_score`
 *  already drives the dropdown row order — we don't second-guess that. */
const SEVERITY_RANK: Record<InitialAccessSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

/** Hex accent per severity. Matches Cyntro's SEVERITY_CONFIG so chips
 *  here use the same color story as the rest of the app. */
export const SEVERITY_ACCENT: Record<InitialAccessSeverity, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
}

/** Look up the display label for a category. Returns a stable placeholder
 *  for new backend categories (so a freshly-shipped category renders
 *  honestly as "New: <RAW_VALUE>" instead of crashing or being dropped). */
export function labelForCategory(category: string): InitialAccessLabel {
  return (
    INITIAL_ACCESS_LABELS[category] ?? {
      label: `New: ${category}`,
      severity: "LOW",
      description:
        "Backend emitted a category the frontend label map doesn't know about yet — likely a newly-shipped classifier. Add a label entry to initial-access-labels.ts to render this properly.",
    }
  )
}

/** Resolve the ordered list of (category, label) for a single path,
 *  worst-first by severity. Empty array when:
 *    - path has no `initial_access` array (classifier hasn't run for
 *      this system yet — migration-window state)
 *    - path has an empty `initial_access: []`
 *  The caller renders an empty / "uncategorized" affordance in that case
 *  — we never fabricate a default category. */
export function rankedInitialAccessForPath(
  path: ConvergencePath,
): Array<{ category: string; label: InitialAccessLabel }> {
  const edges = path.initial_access ?? []
  if (edges.length === 0) return []
  const seen = new Set<string>()
  const out: Array<{ category: string; label: InitialAccessLabel }> = []
  for (const e of edges) {
    if (!e.category || seen.has(e.category)) continue
    seen.add(e.category)
    out.push({ category: e.category, label: labelForCategory(e.category) })
  }
  // Worst-first. Stable secondary sort by category name so renders are
  // deterministic when two edges share a severity (e.g. two HIGHs).
  out.sort((a, b) => {
    const dr = SEVERITY_RANK[b.label.severity] - SEVERITY_RANK[a.label.severity]
    if (dr !== 0) return dr
    return a.category.localeCompare(b.category)
  })
  return out
}
