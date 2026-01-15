import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

/**
 * GET /api/proxy/least-privilege/roles/[roleArn]
 *
 * Fetches detailed LP policy information for a specific IAM role.
 * Returns: permissions, usedPermissions, unusedPermissions, recommendedPermissions
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleArn: string }> }
) {
  const { roleArn } = await params

  if (!roleArn) {
    return NextResponse.json(
      { error: "roleArn is required" },
      { status: 400 }
    )
  }

  // Decode the role ARN (it will be URL encoded)
  const decodedRoleArn = decodeURIComponent(roleArn)

  console.log(`[LP Role Detail Proxy] Fetching LP policy for role: ${decodedRoleArn}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    // The backend expects the roleArn as a path parameter
    const backendUrl = `${BACKEND_URL}/api/least-privilege/roles/${encodeURIComponent(decodedRoleArn)}`
    console.log(`[LP Role Detail Proxy] Calling: ${backendUrl}`)

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[LP Role Detail Proxy] Backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[LP Role Detail Proxy] Success: ${data.roleName}, ${data.permissions?.length || 0} permissions`)

    return NextResponse.json(data, {
      headers: {
        "X-Proxy": "least-privilege-role-detail",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error(`[LP Role Detail Proxy] Error:`, error.message)

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
