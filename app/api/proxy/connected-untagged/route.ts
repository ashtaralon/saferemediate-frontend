import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

/**
 * Fetch resources that are connected to a system in the dependency graph
 * but don't have the SystemName tag set.
 *
 * This implements the A7 Patent "Temporal Maintenance" - detecting new
 * resources that join the system graph but haven't been tagged yet.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")

  if (!systemName) {
    return NextResponse.json(
      { error: "systemName query parameter required" },
      { status: 400 }
    )
  }

  try {
    // Call backend endpoint to get connected but untagged resources
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(
      `${BACKEND_URL}/api/system/${encodeURIComponent(systemName)}/connected-untagged`,
      {
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        success: true,
        systemName,
        resources: data.resources || data.untagged || [],
        count: data.count || (data.resources || data.untagged || []).length,
      })
    }

    // If backend doesn't have this endpoint, try alternative approach
    // Fetch all resources from the system graph and filter on frontend
    console.log(`[connected-untagged] Backend returned ${response.status}, trying expand endpoint`)

    const expandResponse = await fetch(
      `${BACKEND_URL}/api/system/${encodeURIComponent(systemName)}/expand`,
      {
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      }
    )

    if (expandResponse.ok) {
      const expandData = await expandResponse.json()
      const allResources = expandData.resources || []

      // Filter to find resources without SystemName or with different systemName
      const untagged = allResources.filter((r: any) => {
        const resourceSystemName =
          r.SystemName ||
          r.systemName ||
          r.system_name ||
          r.properties?.SystemName ||
          r.properties?.systemName ||
          r.tags?.SystemName ||
          r.tags?.systemName

        return (
          !resourceSystemName ||
          resourceSystemName === "Ungrouped" ||
          resourceSystemName === "NO_SYSTEM" ||
          resourceSystemName === "null"
        )
      })

      return NextResponse.json({
        success: true,
        systemName,
        resources: untagged.map((r: any) => ({
          id: r.id,
          name: r.name || r.id,
          type: r.type || "Resource",
        })),
        count: untagged.length,
      })
    }

    // Fallback: return empty if no data available
    return NextResponse.json({
      success: true,
      systemName,
      resources: [],
      count: 0,
      message: "Backend endpoint not available",
    })
  } catch (error: any) {
    console.error("[connected-untagged] Error:", error)

    // Return empty array on error - don't break the UI
    return NextResponse.json({
      success: false,
      systemName,
      resources: [],
      count: 0,
      error: error.message || "Failed to fetch connected untagged resources",
    })
  }
}
