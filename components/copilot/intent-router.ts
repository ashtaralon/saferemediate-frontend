/**
 * Intent Router
 * =============
 *
 * Maps a canonical question id → the exact proxy URL + query params that
 * will answer it. The LLM copilot eventually calls this to pick a tool,
 * but even without LLM the saved-question gallery uses it to route clicks.
 *
 * Design rule: every question must resolve to ONE envelope-wrapped endpoint
 * we already trust. No "multi-step plans" yet — that's what the aggregator
 * endpoint is for.
 */

export type QueryFamily = "gap_analysis" | "exposure" | "history" | "aggregator"

export interface CanonicalQuestion {
  id: string
  label: string
  hint: string
  family: QueryFamily
  route: (ctx: IntentContext) => IntentRoute
}

export interface IntentContext {
  systemName?: string
  roleName?: string
  bucketName?: string
  windowDays?: number
}

export interface IntentRoute {
  url: string
  method: "GET"
  family: QueryFamily
  resultHeadline: string
}

const withEnvelope = (path: string, extra: Record<string, string | number | undefined> = {}) => {
  const params = new URLSearchParams({ envelope: "true" })
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      params.set(k, String(v))
    }
  }
  return `${path}?${params.toString()}`
}

export const CANONICAL_QUESTIONS: CanonicalQuestion[] = [
  {
    id: "top-unused-iam",
    label: "Which IAM roles have the most unused permissions?",
    hint: "Fleet-wide IAM gap ranking",
    family: "aggregator",
    route: (ctx) => ({
      url: withEnvelope("/api/proxy/remediation-candidates", {
        system: ctx.systemName,
        resource_type: "IAMRole",
        limit: 25,
      }),
      method: "GET",
      family: "aggregator",
      resultHeadline: "Top IAM roles by unused permissions",
    }),
  },
  {
    id: "unused-on-role",
    label: "Show me everything unused on a role",
    hint: "Per-role IAM gap-analysis",
    family: "gap_analysis",
    route: (ctx) => ({
      url: withEnvelope(
        `/api/proxy/iam-roles/${encodeURIComponent(ctx.roleName ?? "")}/gap-analysis`,
        { days: 365 }
      ),
      method: "GET",
      family: "gap_analysis",
      resultHeadline: `Gap analysis for ${ctx.roleName ?? "role"}`,
    }),
  },
  {
    id: "broad-s3",
    label: "Which S3 buckets have overly-broad policies?",
    hint: "Fleet-wide S3 gap ranking",
    family: "aggregator",
    route: (ctx) => ({
      url: withEnvelope("/api/proxy/remediation-candidates", {
        system: ctx.systemName,
        resource_type: "S3Bucket",
        limit: 25,
      }),
      method: "GET",
      family: "aggregator",
      resultHeadline: "Top S3 buckets by policy breadth",
    }),
  },
  {
    id: "blast-radius",
    label: "What's the blast radius if a system is breached?",
    hint: "Exposure view anchored on crown jewels",
    family: "exposure",
    route: (ctx) => ({
      url: withEnvelope("/api/proxy/crown-jewels/protection-plan", {
        systemName: ctx.systemName,
        observationDays: 365,
      }),
      method: "GET",
      family: "exposure",
      resultHeadline: `Crown-jewel exposure for ${ctx.systemName ?? "system"}`,
    }),
  },
  {
    id: "paths-to-jewels",
    label: "Which attack paths reach our crown jewels?",
    hint: "Same endpoint as blast radius; surfaces paths section",
    family: "exposure",
    route: (ctx) => ({
      url: withEnvelope("/api/proxy/crown-jewels/protection-plan", {
        systemName: ctx.systemName,
      }),
      method: "GET",
      family: "exposure",
      resultHeadline: "Attack paths to crown jewels",
    }),
  },
  {
    id: "recent-changes",
    label: "What changed in the last 7 days?",
    hint: "Remediation timeline, 7-day window",
    family: "history",
    route: (ctx) => {
      const end = new Date()
      const start = new Date()
      start.setDate(end.getDate() - (ctx.windowDays ?? 7))
      return {
        url: withEnvelope("/api/proxy/remediation-history/timeline", {
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
        }),
        method: "GET",
        family: "history",
        resultHeadline: `Remediation activity (last ${ctx.windowDays ?? 7} days)`,
      }
    },
  },
  {
    id: "safe-to-apply",
    label: "What can I safely remediate right now?",
    hint: "Candidates with can_auto_apply=true",
    family: "aggregator",
    route: (ctx) => ({
      url: withEnvelope("/api/proxy/remediation-candidates", {
        system: ctx.systemName,
        limit: 50,
      }),
      method: "GET",
      family: "aggregator",
      resultHeadline: "Candidates ranked by safety",
    }),
  },
  {
    id: "highest-risk",
    label: "What's the highest-risk thing I should fix today?",
    hint: "Top-1 candidate by confidence + unused count",
    family: "aggregator",
    route: (ctx) => ({
      url: withEnvelope("/api/proxy/remediation-candidates", {
        system: ctx.systemName,
        limit: 10,
      }),
      method: "GET",
      family: "aggregator",
      resultHeadline: "Highest-risk candidates",
    }),
  },
]

export function resolveIntent(
  questionId: string,
  ctx: IntentContext
): IntentRoute | null {
  const q = CANONICAL_QUESTIONS.find((x) => x.id === questionId)
  if (!q) return null
  return q.route(ctx)
}
