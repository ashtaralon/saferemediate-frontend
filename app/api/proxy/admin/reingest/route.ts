export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

  try {
    const body = await request.json()
    const { scope, target } = body

    console.log("[API Proxy] Re-ingest request:", { scope, target })

    const response = await fetch(`${backendUrl}/api/admin/reingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope, target }),
      signal: AbortSignal.timeout(60000), // 60s timeout
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[API Proxy] Re-ingest failed:", response.status, errorText)
      return Response.json(
        {
          success: false,
          error: errorText || `Backend returned ${response.status}`,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    console.log("[API Proxy] Re-ingest success:", data)

    return Response.json({
      success: true,
      ...data,
    })
  } catch (error: any) {
    console.error("[API Proxy] Re-ingest error:", error)
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to trigger re-ingestion",
      },
      { status: 500 },
    )
  }
}

