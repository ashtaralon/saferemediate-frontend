import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60 // Increased to 60 seconds to allow for Render cold starts

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[ResourceView Proxy] Retry attempt ${attempt} for: ${url}`)
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 second timeout

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return response
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === "AbortError" && attempt < retries) {
          console.warn(`[ResourceView Proxy] Timeout on attempt ${attempt + 1}, retrying...`)
          continue
        }
        throw fetchError
      }
    } catch (error: any) {
      if (attempt === retries) {
        throw error
      }
    }
  }
  throw new Error("All retry attempts failed")
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  try {
    const { resourceId } = await params
    const encodedResourceId = encodeURIComponent(resourceId)

    console.log(`[ResourceView Proxy] Fetching connections for: ${resourceId}`)

    // Warm-up request to wake Render if it's sleeping
    try {
      const warmupResponse = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout for warmup
      }).catch(() => null) // Ignore warmup errors
      
      if (warmupResponse?.ok) {
        console.log(`[ResourceView Proxy] Backend is awake`)
      }
    } catch (e) {
      // Warmup failed, continue anyway
      console.log(`[ResourceView Proxy] Warmup skipped, proceeding...`)
    }

    // Main request with retry logic
    const response = await fetchWithRetry(
      `${BACKEND_URL}/api/resource-view/${encodedResourceId}/connections`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(
        `[ResourceView Proxy] Backend error: ${response.status}`,
        errorText
      )
      // Return 200 with empty connections instead of propagating error
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          detail: errorText,
          connections: { inbound: [], outbound: [] },
          inbound_count: 0,
          outbound_count: 0,
        },
        { status: 200 } // Return 200 to prevent UI crashes
      )
    }

    const data = await response.json()
    console.log(
      `[ResourceView Proxy] Success: ${data.inbound_count || 0} inbound, ${data.outbound_count || 0} outbound`
    )

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[ResourceView Proxy] Error:", error)
    
    // Always return 200 with empty connections to prevent UI crashes
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch resource connections",
        timeout: error.name === "AbortError",
        connections: { inbound: [], outbound: [] },
        inbound_count: 0,
        outbound_count: 0,
      },
      { status: 200 } // Return 200 instead of 500 to prevent UI errors
    )
  }
}

