import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

// Extract role name from ARN or return as-is
function extractRoleName(roleNameOrArn: string): string {
  if (!roleNameOrArn) return "Unknown"
  // If it's an ARN like arn:aws:iam::123456:role/MyRole, extract MyRole
  if (roleNameOrArn.includes(":role/")) {
    return roleNameOrArn.split(":role/").pop() || roleNameOrArn
  }
  // If it's an instance profile ARN, extract the name
  if (roleNameOrArn.includes(":instance-profile/")) {
    return roleNameOrArn.split(":instance-profile/").pop() || roleNameOrArn
  }
  return roleNameOrArn
}

// Deduplicate resources by resource_name
function dedupeResources(resources: any[]): any[] {
  const seen = new Map<string, any>()
  for (const r of resources) {
    const key = r.resource_name || r.resource_id
    if (!seen.has(key)) {
      // Prefer entries with proper resource_type (EC2Instance, LambdaFunction) over generic "Resource"
      seen.set(key, r)
    } else if (r.resource_type !== "Resource" && seen.get(key).resource_type === "Resource") {
      seen.set(key, r)
    }
  }
  return Array.from(seen.values())
}

export async function GET(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    const roleFilter = req.nextUrl.searchParams.get("role_filter") || ""
    const url = roleFilter
      ? `${BACKEND_URL}/api/scan?role_filter=${encodeURIComponent(roleFilter)}`
      : `${BACKEND_URL}/api/scan`

    const res = await fetch(url, { cache: "no-store", signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return NextResponse.json({ error: `Engine error: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()

    // Deduplicate roles by normalized role name
    const roleMap = new Map<string, any>()
    for (const role of data) {
      const normalizedName = extractRoleName(role.role_name)

      // Skip roles with "Unknown" name or instance profiles without a proper role
      if (normalizedName === "Unknown") continue

      // Deduplicate resources within this role
      const dedupedResources = dedupeResources(role.resources || [])

      // Only include roles with 2+ unique resources (truly shared)
      if (dedupedResources.length < 2) continue

      if (!roleMap.has(normalizedName)) {
        roleMap.set(normalizedName, {
          ...role,
          role_name: normalizedName,
          resources: dedupedResources
        })
      } else {
        // Merge resources from duplicate entries
        const existing = roleMap.get(normalizedName)
        const mergedResources = dedupeResources([...existing.resources, ...dedupedResources])
        existing.resources = mergedResources
        // Keep the entry with more permissions info
        if (role.total_permissions > existing.total_permissions) {
          existing.total_permissions = role.total_permissions
          existing.all_permissions = role.all_permissions
          existing.role_arn = role.role_arn
        }
      }
    }

    const dedupedRoles = Array.from(roleMap.values())
    return NextResponse.json(dedupedRoles)
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
