/**
 * Inspector insight layer — turns raw policy JSON and inspector sections
 * into operator-readable summaries. No LLM; deterministic rules only.
 */

export type InsightSeverity = "critical" | "warning" | "info" | "good"

export interface Insight {
  severity: InsightSeverity
  title: string
  detail?: string
  tags?: string[]
}

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  critical: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-slate-50 text-slate-700 border-slate-200",
  good: "bg-emerald-50 text-emerald-800 border-emerald-200",
}

export function insightSeverityClass(severity: InsightSeverity): string {
  return SEVERITY_STYLES[severity]
}

/** Turn API / inspector errors into plain language. */
export function humanizeInspectorError(raw: string, resourceType?: string): Insight[] {
  const msg = raw.trim()
  const lower = msg.toLowerCase()

  if (lower.includes("subnet") && lower.includes("not found")) {
    return [
      {
        severity: "warning",
        title: "Subnet not in graph yet",
        detail:
          "This subnet exists in AWS but Cyntro has not linked it in the behavioral graph. Run sync-all, or ensure the resource opens with its subnet ID (subnet-…) rather than a misrouted ARN.",
      },
    ]
  }

  if (lower.includes("ec2 instance") && lower.includes("subnet/")) {
    return [
      {
        severity: "warning",
        title: "Wrong resource type for this ARN",
        detail:
          "A subnet ARN was sent to the EC2 inspector. Refresh after deploy — the UI should route Subnet resources correctly.",
        tags: [resourceType ?? "Subnet"],
      },
    ]
  }

  if (lower.includes("not found in graph") || lower.includes("not found")) {
    return [
      {
        severity: "info",
        title: "Not in behavioral graph",
        detail:
          "Collectors have not persisted this resource yet, or it was removed. Try Sync from AWS on the system page, then reopen.",
      },
    ]
  }

  if (lower.includes("timed out")) {
    return [
      {
        severity: "warning",
        title: "Inspector timed out",
        detail: "The backend took too long. Retry in a few seconds — large accounts can be slow.",
      },
    ]
  }

  return [
    {
      severity: "warning",
      title: "Could not load configuration",
      detail: msg.replace(/^\{.*\}$/, "").trim() || msg,
    },
  ]
}

function actionToPlain(action: string): string {
  const [svc, op] = action.split(":")
  if (!op) return action
  const svcName: Record<string, string> = {
    logs: "CloudWatch Logs",
    s3: "S3",
    ec2: "EC2",
    iam: "IAM",
    lambda: "Lambda",
    rds: "RDS",
    sns: "SNS",
    sqs: "SQS",
    kms: "KMS",
    dynamodb: "DynamoDB",
    cloudwatch: "CloudWatch",
    ssm: "Systems Manager",
  }
  const verb = op.replace(/([A-Z])/g, " $1").trim().toLowerCase()
  return `${svcName[svc] ?? svc}: ${verb}`
}

function resourceScope(resource: unknown): string {
  if (resource === "*" || (Array.isArray(resource) && resource.includes("*"))) {
    return "any resource (*)"
  }
  if (Array.isArray(resource)) {
    return `${resource.length} specific resource(s)`
  }
  if (typeof resource === "string") {
    return resource.length > 48 ? `${resource.slice(0, 24)}…` : resource
  }
  return "scoped resources"
}

/** One-line summary for an IAM policy statement. */
export function summarizePolicyStatement(stmt: Record<string, unknown>): string {
  const effect = String(stmt.Effect ?? "Allow")
  const actions = stmt.Action
  const actionList = Array.isArray(actions) ? actions : actions ? [actions] : []
  const plainActions = actionList.slice(0, 3).map((a) => actionToPlain(String(a)))
  const more = actionList.length > 3 ? ` +${actionList.length - 3} more` : ""
  const scope = resourceScope(stmt.Resource)
  const prefix = effect === "Deny" ? "Denies" : "Allows"
  if (plainActions.length === 0) {
    return `${prefix} access (${scope})`
  }
  return `${prefix} ${plainActions.join(", ")}${more} on ${scope}`
}

export function insightsFromPolicyStatements(statements: unknown[]): Insight[] {
  const insights: Insight[] = []
  for (const raw of statements) {
    if (!raw || typeof raw !== "object") continue
    const stmt = raw as Record<string, unknown>
    const summary = summarizePolicyStatement(stmt)
    const resource = stmt.Resource
    const isWildcard =
      resource === "*" || (Array.isArray(resource) && resource.includes("*"))
    const effect = stmt.Effect === "Deny" ? "warning" : isWildcard ? "warning" : "info"
    insights.push({
      severity: effect as InsightSeverity,
      title: summary,
      detail: isWildcard && stmt.Effect !== "Deny"
        ? "Wildcard resource scope — review whether this permission is broader than needed."
        : undefined,
    })
  }
  return insights
}

function insightFromRecommendation(rec: Record<string, unknown>): Insight {
  const sev = String(rec.severity ?? "info")
  const severity: InsightSeverity =
    sev === "high" || sev === "critical" ? "critical" : sev === "warning" ? "warning" : "info"
  return {
    severity,
    title: String(rec.message ?? rec.type ?? "Review recommended"),
    tags: rec.type ? [String(rec.type).replace(/_/g, " ")] : undefined,
  }
}

/** EC2 / generic inspector `current` block. */
export function insightsFromCurrentSection(section: Record<string, unknown>): Insight[] {
  const insights: Insight[] = []
  const network = section.network as Record<string, unknown> | undefined
  if (network) {
    const parts: string[] = []
    if (network.vpc_id) parts.push(`VPC ${network.vpc_id}`)
    if (network.subnet_id) parts.push(`subnet ${network.subnet_id}`)
    if (network.private_ip) parts.push(`private IP ${network.private_ip}`)
    if (network.public_ip) {
      parts.push(`public IP ${network.public_ip}`)
      insights.push({
        severity: "warning",
        title: "Instance has a public IP",
        detail: "Confirm security groups restrict inbound access appropriately.",
      })
    } else if (parts.length) {
      insights.push({
        severity: "good",
        title: "Private network placement",
        detail: parts.join(" · "),
      })
    }
  }

  const iamRole = section.iam_role as Record<string, unknown> | undefined
  if (iamRole?.name || iamRole?.arn) {
    insights.push({
      severity: "info",
      title: "Attached IAM role",
      detail: String(iamRole.name ?? iamRole.arn ?? "").split("/").pop(),
    })
  }

  const sgs = section.security_groups as Array<Record<string, unknown>> | undefined
  if (Array.isArray(sgs) && sgs.length > 0) {
    const names = sgs.map((sg) => sg.sg_name || sg.sg_id).filter(Boolean).join(", ")
    insights.push({
      severity: "info",
      title: `${sgs.length} security group(s)`,
      detail: String(names),
    })
  }

  return insights
}

/** Observed activity block (CloudTrail / flow logs). */
export function insightsFromObservedSection(section: Record<string, unknown>): Insight[] {
  if (section.available === false) {
    return [
      {
        severity: "info",
        title: "No activity evidence yet",
        detail: String(section.message ?? "Flow logs or CloudTrail data not available for this window."),
      },
    ]
  }

  const used = section.used_actions as string[] | undefined
  const count = section.used_actions_count as number | undefined
  if (Array.isArray(used) && used.length > 0) {
    const sample = used.slice(0, 4).map(actionToPlain).join(", ")
    const extra = used.length > 4 ? ` and ${used.length - 4} more` : ""
    return [
      {
        severity: "good",
        title: `${count ?? used.length} observed action(s) in ${section.window ?? "30d"}`,
        detail: `${sample}${extra}`,
        tags: ["CloudTrail"],
      },
    ]
  }

  const accessors = section.accessors as unknown[] | undefined
  if (Array.isArray(accessors) && accessors.length > 0) {
    return [
      {
        severity: "good",
        title: `${accessors.length} principal(s) accessed this resource`,
        detail: "See observed access table for principals and actions.",
      },
    ]
  }

  return [
    {
      severity: "info",
      title: "No observed usage in window",
      detail: String(section.message ?? "No CloudTrail or flow activity recorded for this period."),
    },
  ]
}

/** Map inspector section keys to insight cards. */
export function insightsFromInspectorPayload(data: Record<string, unknown>): Insight[] {
  const out: Insight[] = []

  const current = data.current as Record<string, unknown> | undefined
  if (current && typeof current === "object" && !current.message) {
    out.push(...insightsFromCurrentSection(current))
  }

  const observed = data.observed as Record<string, unknown> | undefined
  if (observed && typeof observed === "object") {
    out.push(...insightsFromObservedSection(observed))
  }

  const remove = data.remove as Record<string, unknown> | undefined
  const items = remove?.items
  if (Array.isArray(items)) {
    for (const rec of items) {
      if (rec && typeof rec === "object") {
        out.push(insightFromRecommendation(rec as Record<string, unknown>))
      }
    }
  }

  return out
}
