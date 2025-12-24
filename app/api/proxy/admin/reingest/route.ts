export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

  const startTime = Date.now()

  try {
    const body = await request.json()
    const { scope, target } = body

    console.log("[API Proxy] Re-ingest request:", {
      scope,
      target,
      backendUrl: `${backendUrl}/api/admin/reingest`,
      timestamp: new Date().toISOString(),
    })

    const fetchStartTime = Date.now()
    const response = await fetch(`${backendUrl}/api/admin/reingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope, target }),
      signal: AbortSignal.timeout(60000), // 60s timeout
    })

    const fetchTime = Date.now() - fetchStartTime

    console.log("[API Proxy] Backend response:", {
      status: response.status,
      statusText: response.statusText,
      fetchTimeMs: fetchTime,
      headers: Object.fromEntries(response.headers.entries()),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[API Proxy] Re-ingest failed:", {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500), // Limit error text length
        url: `${backendUrl}/api/admin/reingest`,
        fetchTimeMs: fetchTime,
      })

      // Try to parse error as JSON, fallback to text
      let errorData
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
          url: `${backendUrl}/api/admin/reingest`,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    const totalTime = Date.now() - startTime

    console.log("[API Proxy] Re-ingest success:", {
      scope: data.scope,
      collectorsRun: data.collectors_run?.length || 0,
      errors: data.errors?.length || 0,
      totalTimeMs: totalTime,
      fetchTimeMs: fetchTime,
    })

    return Response.json({
      success: true,
      ...data,
      _debug: {
        fetchTimeMs: fetchTime,
        totalTimeMs: totalTime,
        backendUrl: `${backendUrl}/api/admin/reingest`,
      },
    })
  } catch (error: any) {
    const totalTime = Date.now() - startTime

    console.error("[API Proxy] Re-ingest error:", {
      error: error.message,
      stack: error.stack?.substring(0, 500),
      name: error.name,
      totalTimeMs: totalTime,
      backendUrl: `${backendUrl}/api/admin/reingest`,
    })

    // Handle specific error types
    let errorMessage = error.message || "Failed to trigger re-ingestion"
    let statusCode = 500

    if (error.name === "AbortError" || error.message?.includes("timeout")) {
      errorMessage = "Request timeout - re-ingestion may still be running on the backend"
      statusCode = 504 // Gateway Timeout
    } else if (error.message?.includes("fetch failed") || error.message?.includes("ECONNREFUSED")) {
      errorMessage = `Cannot connect to backend at ${backendUrl} - is it running?`
      statusCode = 503 // Service Unavailable
    }

    return Response.json(
      {
        success: false,
        error: errorMessage,
        _debug: {
          errorName: error.name,
          totalTimeMs: totalTime,
          backendUrl: `${backendUrl}/api/admin/reingest`,
        },
      },
      { status: statusCode },
    )
  }
}

