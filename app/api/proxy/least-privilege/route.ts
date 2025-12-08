import { NextResponse } from "next/server"

// Helper function to extract permissions from IAM policy nodes in Neo4j graph
async function fetchRealPermissionsFromGraph(backendUrl: string): Promise<string[] | null> {
  try {
    const response = await fetch(`${backendUrl}/api/graph/nodes`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.log("[v0] Graph nodes fetch failed:", response.status)
      return null
    }

    const data = await response.json()
    const nodes = data.nodes || data || []

    // Find IAMPolicy nodes and extract their actions/permissions
    const permissions: string[] = []
    for (const node of nodes) {
      // Check for IAMPolicy or IAMRole nodes that have policy documents or actions
      if (node.type === "IAMPolicy" || node.labels?.includes("IAMPolicy")) {
        // Extract actions from policy document if available
        if (node.properties?.policy_document) {
          try {
            const policyDoc = typeof node.properties.policy_document === "string"
              ? JSON.parse(node.properties.policy_document)
              : node.properties.policy_document

            for (const statement of policyDoc.Statement || []) {
              const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action]
              permissions.push(...actions.filter((a: string) => a && a !== "*"))
            }
          } catch (e) {
            console.log("[v0] Failed to parse policy document:", e)
          }
        }
        // Also check for actions array directly on the node
        if (node.properties?.actions) {
          const actions = Array.isArray(node.properties.actions)
            ? node.properties.actions
            : [node.properties.actions]
          permissions.push(...actions.filter((a: string) => a && a !== "*"))
        }
      }

      // Also check IAMRole nodes
      if (node.type === "IAMRole" || node.labels?.includes("IAMRole")) {
        if (node.properties?.attached_policies) {
          // These might contain policy ARNs - we can use the names
          const policies = Array.isArray(node.properties.attached_policies)
            ? node.properties.attached_policies
            : [node.properties.attached_policies]
          // Log for debugging
          console.log("[v0] Found IAMRole with policies:", policies.length)
        }
      }
    }

    // Remove duplicates and return
    const uniquePermissions = [...new Set(permissions)]
    console.log("[v0] Extracted", uniquePermissions.length, "unique permissions from graph nodes")
    return uniquePermissions.length > 0 ? uniquePermissions : null
  } catch (error) {
    console.error("[v0] Error fetching graph nodes:", error)
    return null
  }
}

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    // First try gap analysis endpoint
    const response = await fetch(`${backendUrl}/api/traffic/gap/SafeRemediate-Lambda-Remediation-Role`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    let gapData: any = null
    if (response.ok) {
      gapData = await response.json()
      console.log("[v0] Gap analysis API response:", JSON.stringify(gapData).substring(0, 500))

      // If gap analysis has real permission lists, use them
      if (gapData.unused_actions_list && gapData.unused_actions_list.length > 0) {
        return NextResponse.json({
          success: true,
          ...gapData,
        })
      }
    } else {
      console.log("[v0] Gap analysis fetch failed:", response.status)
    }

    // Gap analysis didn't have permission lists - fetch REAL data from graph nodes
    console.log("[v0] Fetching real permissions from Neo4j graph nodes...")
    const realPermissions = await fetchRealPermissionsFromGraph(backendUrl)

    if (realPermissions && realPermissions.length > 0) {
      console.log("[v0] Using", realPermissions.length, "REAL permissions from Neo4j")
      return NextResponse.json({
        success: true,
        role_name: gapData?.role_name || "SafeRemediate-Lambda-Remediation-Role",
        allowed_actions: realPermissions.length,
        used_actions: gapData?.used_actions || 0,
        unused_actions: realPermissions.length - (gapData?.used_actions || 0),
        allowed_actions_list: realPermissions,
        unused_actions_list: realPermissions,
        used_actions_list: gapData?.used_actions_list || [],
        source: "neo4j",
      })
    }

    // No real data available - return error to indicate missing data
    console.log("[v0] No real permission data found in Neo4j")
    return NextResponse.json({
      success: true,
      role_name: "SafeRemediate-Lambda-Remediation-Role",
      allowed_actions: gapData?.allowed_actions || 0,
      used_actions: gapData?.used_actions || 0,
      unused_actions: gapData?.unused_actions || 0,
      allowed_actions_list: [],
      unused_actions_list: [],
      used_actions_list: [],
      message: "No IAM policy data found in Neo4j. Run sync to collect AWS data.",
    })
  } catch (error) {
    console.error("[v0] Least privilege API error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch data",
      allowed_actions: 0,
      used_actions: 0,
      unused_actions: 0,
      allowed_actions_list: [],
      unused_actions_list: [],
      used_actions_list: [],
    })
  }
}
