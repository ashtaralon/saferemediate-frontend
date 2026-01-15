import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

/**
 * POST /api/proxy/simulation/preview
 *
 * Preview the impact of applying least-privilege changes to a role.
 * Uses the existing /api/least-privilege/simulate endpoint.
 *
 * Request body:
 * {
 *   role_arn: string,              // ARN of the IAM role
 *   remove_actions: string[],      // List of actions to remove
 *   recommended_permissions?: any[] // Optional: permissions to keep (if not provided, we'll fetch current - remove_actions)
 * }
 *
 * Response (transformed to match expected format):
 * {
 *   roleArn: string,
 *   removeActions: string[],
 *   permissionsToRemove: Permission[],
 *   impactAnalysis: object,
 *   warnings: string[],
 *   confidence: number,
 *   safeToRemove: boolean
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { role_arn, remove_actions, recommended_permissions } = body

    if (!role_arn) {
      return NextResponse.json(
        { error: "role_arn is required" },
        { status: 400 }
      )
    }

    if (!remove_actions || !Array.isArray(remove_actions) || remove_actions.length === 0) {
      return NextResponse.json(
        { error: "remove_actions must be a non-empty array of actions" },
        { status: 400 }
      )
    }

    console.log(`[Simulation Preview Proxy] Previewing removal of ${remove_actions.length} actions from role: ${role_arn}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    // First, get current permissions if recommended_permissions not provided
    let recommendedPerms = recommended_permissions
    if (!recommendedPerms) {
      // Fetch current role details to get all permissions
      const roleDetailUrl = `${BACKEND_URL}/api/least-privilege/roles/${encodeURIComponent(role_arn)}`
      console.log(`[Simulation Preview Proxy] Fetching role details from: ${roleDetailUrl}`)

      try {
        const roleRes = await fetch(roleDetailUrl, {
          cache: "no-store",
          signal: controller.signal,
          headers: { "Accept": "application/json" },
        })

        if (roleRes.ok) {
          const roleData = await roleRes.json()
          const allPermissions = roleData.permissions || []
          // Calculate recommended = current - remove_actions
          recommendedPerms = allPermissions.filter((p: any) =>
            !remove_actions.includes(p.action)
          )
        } else {
          // If we can't get permissions, create minimal structure
          recommendedPerms = []
        }
      } catch (e) {
        console.warn("[Simulation Preview Proxy] Could not fetch role details, using empty recommended:", e)
        recommendedPerms = []
      }
    }

    // Call the least-privilege simulate endpoint
    const backendUrl = `${BACKEND_URL}/api/least-privilege/simulate`
    console.log(`[Simulation Preview Proxy] Calling: ${backendUrl}`)

    const res = await fetch(backendUrl, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        roleArn: role_arn,
        recommendedPermissions: recommendedPerms,
        dryRun: true,
      }),
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[Simulation Preview Proxy] Backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()

    // Transform response to match expected format
    const transformedResponse = {
      roleArn: data.roleArn || role_arn,
      removeActions: remove_actions,
      currentPermissions: data.currentPermissions || [],
      recommendedPermissions: data.recommendedPermissions || recommendedPerms,
      permissionsToRemove: data.permissionsToRemove || [],
      impactAnalysis: data.impactAnalysis || {},
      warnings: data.warnings || [],
      confidence: data.confidence || 0.7,
      // Consider safe if no warnings or low impact
      safeToRemove: (data.warnings?.length || 0) === 0 &&
        (data.impactAnalysis?.permissionsRemoved || 0) < (data.currentPermissions?.length || 1) * 0.5,
      brokenCalls: [], // This endpoint doesn't return broken calls like the preview endpoint would
      brokenCount: 0,
    }

    console.log(`[Simulation Preview Proxy] Success: ${transformedResponse.permissionsToRemove.length} permissions to remove, confidence=${transformedResponse.confidence}`)

    return NextResponse.json(transformedResponse, {
      headers: {
        "X-Proxy": "simulation-preview",
      },
    })
  } catch (error: any) {
    console.error(`[Simulation Preview Proxy] Error:`, error.message)

    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout", detail: "Backend took too long to respond" },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
