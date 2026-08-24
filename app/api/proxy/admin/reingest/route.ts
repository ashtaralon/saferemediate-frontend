import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"

/**
 * Compatibility proxy for the Neptune-safe "Sync from AWS" pipeline.
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
 *   Both buttons trigger /api/v2/sync/start. The web tier enqueues only;
 *   collection and graph activation run under the dedicated projector role.
 *
 *   The scope/target fields in the request body are accepted for
 *   backwards compatibility but currently ignored. The backend returns the
 *   exact sources refreshed and the lanes that are not connected yet.
 */

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const backendUrl =
    getBackendBaseUrl()

  const startTime = Date.now()

  try {
    // Parse body but ignore fields — the certified managed lane is tenant scoped.
    const body = await request.json().catch(() => ({}))
    const scope = body.scope ?? "all"
    const target = body.target ?? null

    const target_url = `${backendUrl}/api/v2/sync/start`
    console.log("[API Proxy] Re-ingest → v2/sync/start:", {
      scope,
      target,
      target_url,
      note: "scope/target currently ignored — managed refresh is tenant scoped",
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
      console.error("[API Proxy] v2/sync/start failed:", {
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
          // coerceProxyErrorMessage, not `errorData.error || errorData.detail`:
          // FastAPI nests a structured refusal under `detail`, so the bare
          // chain yields an OBJECT and the UI renders "[object Object]".
          error: coerceProxyErrorMessage(
            errorData,
            `Backend returned ${response.status}`,
          ),
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()

    return Response.json({
      success: true,
      job_id: data.job_id,
      status_url: data.status_url,
      message: data.message ?? "Managed AWS refresh queued for the Neptune projector.",
      sources: data.sources ?? [],
      deferred_sources: data.deferred_sources ?? [],
      deduplicated: Boolean(data.deduplicated),
      collectors_run: [],
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
