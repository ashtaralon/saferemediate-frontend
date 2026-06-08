import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"

export async function GET() {
  const backendUrl = getBackendBaseUrl()

  try {
    console.log("[API Proxy] Fetching systems from:", `${backendUrl}/api/systems/discovered/complete`)

    const response = await fetch(`${backendUrl}/api/systems/discovered/complete`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    })

    console.log("[API Proxy] Backend response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[API Proxy] Backend error:", response.status, errorText)
      return Response.json({ error: `Backend returned ${response.status}: ${errorText}` }, { status: response.status })
    }

    const data = await response.json()
    console.log("[API Proxy] Successfully fetched systems")
    return Response.json(data)
  } catch (error: any) {
    console.error("[API Proxy] Fetch failed:")
    console.error("[API Proxy] Error name:", error.name)
    console.error("[API Proxy] Error message:", error.message)
    console.error("[API Proxy] Error code:", error.code)

    return Response.json(
      {
        error: error.message || "Failed to connect to backend",
        errorName: error.name,
        errorCode: error.code,
        hint:
          error.name === "AbortError"
            ? "Backend connection timed out while loading discovered systems"
            : "Failed to connect to the configured backend for discovered systems",
      },
      { status: 500 },
    )
  }
}
