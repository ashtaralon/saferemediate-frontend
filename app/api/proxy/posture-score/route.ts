import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

/**
 * Org-wide posture-score aggregate.
 *
 * Sibling of /api/proxy/posture-score/[systemName] that returns a single
 * weighted-average score across ALL systems. Called by the home dashboard
 * when no system is selected — replaces the previous 404-HTML "Evidence
 * unavailable" card with a real aggregate.
 *
 * Honesty contract:
 *   - score = sum(health_score_i * resourceCount_i) / sum(resourceCount_i)
 *     across systems where health_score is a number AND resourceCount > 0.
 *   - dimensions: {} — per-dimension breakdown is not aggregable across
 *     systems with the data /api/systems gives us; cards will skip those.
 *   - top_issues: [] — same reason.
 *
 * If /api/systems errors or returns no systems with scores, surface an
 * honest 502 / "no scoreable systems" — never fabricate.
 */
export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/systems`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "systems_endpoint_unavailable",
          message: `Backend /api/systems returned ${res.status}`,
          backend_status: res.status,
        },
        { status: 502 },
      )
    }

    const data = await res.json()
    const systems: any[] = Array.isArray(data?.systems) ? data.systems : []

    // Filter to systems we can actually score: numeric health_score, positive
    // resource count. Anything else can't contribute to a weighted average.
    const scoreable = systems.filter(
      (s) =>
        typeof s.health_score === "number" &&
        typeof s.resourceCount === "number" &&
        s.resourceCount > 0,
    )

    if (scoreable.length === 0) {
      return NextResponse.json(
        {
          error: "no_scoreable_systems",
          message:
            "No systems carry both a health_score and a positive resourceCount yet — graph likely still populating.",
          system_count: systems.length,
        },
        { status: 200 },
      )
    }

    const totalResources = scoreable.reduce(
      (sum, s) => sum + s.resourceCount,
      0,
    )
    const weightedSum = scoreable.reduce(
      (sum, s) => sum + s.health_score * s.resourceCount,
      0,
    )
    const overall_score = weightedSum / totalResources
    const grade = overall_score >= 90
      ? "A"
      : overall_score >= 80
        ? "B"
        : overall_score >= 70
          ? "C"
          : overall_score >= 60
            ? "D"
            : "F"

    return NextResponse.json({
      system_name: null,
      overall_score: Math.round(overall_score * 100) / 100,
      grade,
      dimensions: {}, // see contract above — not aggregable from this source
      top_issues: [],
      window_days: null,
      resources_analyzed: totalResources,
      system_count: scoreable.length,
      source: "aggregate_health_score",
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "aggregate_failed",
        message: error?.message ?? "Failed to compute org-wide posture aggregate",
      },
      { status: 500 },
    )
  }
}
