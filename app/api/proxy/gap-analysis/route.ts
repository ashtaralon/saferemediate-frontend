import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

// Helper function to extract permissions from IAM policy nodes in Neo4j graph
async function fetchRealPermissionsFromGraph(): Promise<string[] | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/graph/nodes`, {
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
    }

    // Remove duplicates and return
    const uniquePermissions = [...new Set(permissions)]
    console.log("[v0] Gap: Extracted", uniquePermissions.length, "unique permissions from graph nodes")
    return uniquePermissions.length > 0 ? uniquePermissions : null
  } catch (error) {
    console.error("[v0] Gap: Error fetching graph nodes:", error)
    return null
  }
}

export async function GET(request: Request) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/traffic/gap/SafeRemediate-Lambda-Remediation-Role`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
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
      console.log("[v0] Gap analysis endpoint returned:", response.status)
    }

    // Gap analysis didn't have permission lists - fetch REAL data from graph nodes
    console.log("[v0] Gap: Fetching real permissions from Neo4j graph nodes...")
    const realPermissions = await fetchRealPermissionsFromGraph()

    if (realPermissions && realPermissions.length > 0) {
      console.log("[v0] Gap: Using", realPermissions.length, "REAL permissions from Neo4j")
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

    // No real data available - return empty with message
    console.log("[v0] Gap: No real permission data found in Neo4j")
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
  } catch (error: any) {
    console.error("[v0] Gap analysis fetch error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to fetch gap analysis data",
      allowed_actions: 0,
      used_actions: 0,
      unused_actions: 0,
      allowed_actions_list: [],
      unused_actions_list: [],
      used_actions_list: [],
    })
  }
}
