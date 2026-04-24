/**
 * Re-ingest proxy — unified with the "Sync from AWS" pipeline.
 *
 * Historical note (now obsolete):
 *   This route used to call POST /api/admin/reingest, which was broken
 *   in production (NameError: AUTO_TAGGER_ROUTER_AVAILABLE) AND narrower
 *   than intended — it only re-pulled IAM roles + ran auto-tagger (1 of
 *   15 collector steps). Result: "Re-ingest Now" and "Sync from AWS"
 *   pointed at two different pipelines with very different reliability
 *   and scope.
 *
 * Current behavior:
 *   Both buttons now trigger the same /api/collectors/sync-all/start
 *   async job — 15 steps covering VPC flow logs, CloudTrail, Security
 *   Groups, NACLs, S3 access logs, RDS query logs, behavioral sync,
 *   visibility signals, and auto-tagging.
 *
 *   The scope/target fields in the request body are accepted for
 *   backwards compatibility but currently ignored — the sync-all
 *   endpoint is global only. Per-system narrowing requires a backend
 *   filter that doesn't exist yet.
 */

export const dynamic = "force-dynamic"

const DAYS = 2 // Matches what SyncFromAWSButton sends

export async function POST(request: Request) {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_API_URL ||
    "https://saferemediate-backend-f.onrender.com"

  const startTime = Date.now()

  try {
    // Parse body but ignore fields — sync-all doesn't filter by scope yet.
    const body = await request.json().catch(() => ({}))
    const scope = body.scope ?? "all"
    const target = body.target ?? null

    const target_url = `${backendUrl}/api/collectors/sync-all/start?days=${DAYS}`
    console.log("[API Proxy] Re-ingest → sync-all/start:", {
      scope,
      target,
      target_url,
      note: "scope/target currently ignored — sync-all is global",
    })

    const fetchStart = Date.now()
    const response = await fetch(target_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000), // 30s to start the job — the job itself runs for minutes
    })
    const fetchTimeMs = Date.now() - fetchStart

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[API Proxy] sync-all/start failed:", {
        status: response.status,
        errorText: errorText.slice(0, 500),
        fetchTimeMs,
      })
      let errorData: any
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText || response.statusText }
      }
      return Response.json(
        {
          success: false,
          error: errorData.error || errorData.detail || `Backend returned ${response.status}`,
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()

    // Normalize response to the shape handleReingest() already consumes,
    // plus pass through job_id so the caller can optionally poll.
    // sync-all returns either {success:true, job_id, message} on new jobs,
    // or {success:false, existing_job_id, ...} if one is already running.
    if (!data.success && data.existing_job_id) {
      return Response.json({
        success: true,
        already_running: true,
        job_id: data.existing_job_id,
        current_step: data.current_step,
        message: data.message ?? "A sync job is already running",
        collectors_run: [], // historical shape for toast
        _debug: { fetchTimeMs, totalTimeMs: Date.now() - startTime },
      })
    }

    return Response.json({
      success: true,
      job_id: data.job_id,
      status_url: data.status_url,
      message: data.message ?? "Full 15-step sync job started. Takes several minutes.",
      collectors_run: [], // historical shape — real progress comes from polling status_url
      _debug: { fetchTimeMs, totalTimeMs: Date.now() - startTime },
    })
  } catch (error: any) {
    const totalTimeMs = Date.now() - startTime
    console.error("[API Proxy] Re-ingest error:", {
      error: error.message,
      name: error.name,
      totalTimeMs,
    })

    let errorMessage = error.message || "Failed to trigger re-ingestion"
    let statusCode = 500

    if (error.name === "AbortError" || error.message?.includes("timeout")) {
      errorMessage = "Request timeout starting sync job. Render may be cold-starting — try again in ~15s."
      statusCode = 504
    } else if (error.message?.includes("fetch failed") || error.message?.includes("ECONNREFUSED")) {
      errorMessage = `Cannot connect to backend at ${backendUrl}`
      statusCode = 503
    }

    return Response.json(
      {
        success: false,
        error: errorMessage,
        _debug: { errorName: error.name, totalTimeMs },
      },
      { status: statusCode },
    )
  }
}
