export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

  try {
    const body = await request.json()
    const { systemName, resourceIds } = body

    console.log("[API Proxy] Auto-tagging system:", systemName, "with", resourceIds?.length || 0, "resources")

    const resources = (resourceIds || []).map((id: string) => ({
      id: id,
      type: id.startsWith("i-")
        ? "EC2Instance"
        : id.startsWith("vpc-")
          ? "VPC"
          : id.startsWith("subnet-")
            ? "Subnet"
            : id.startsWith("sg-")
              ? "SecurityGroup"
              : id.startsWith("rtb-")
                ? "RouteTable"
                : id.startsWith("igw-")
                  ? "InternetGateway"
                  : id.startsWith("nat-")
                    ? "NatGateway"
                    : "Unknown",
    }))

    const response = await fetch(`${backendUrl}/api/auto-tag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        system_name: systemName, // Use system_name instead of systemName to match backend
        resources: resources, // Send resources array instead of resourceIds
      }),
      signal: AbortSignal.timeout(30000),
    })

    console.log("[API Proxy] Auto-tag response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[API Proxy] Auto-tag error:", response.status, errorText)
      return Response.json({ error: `Auto-tagging failed: ${response.status}` }, { status: response.status })
    }

    const data = await response.json()
    console.log("[API Proxy] Auto-tag success, tagged count:", data.tagged_count)

    const results = resources.map((r: any) => ({
      resourceId: r.id,
      success: true,
    }))

    return Response.json({
      success: true,
      taggedCount: data.tagged_count || resources.length,
      results: results,
    })
  } catch (error: any) {
    console.error("[API Proxy] Auto-tag failed:", error.name, error.message)

    return Response.json(
      {
        error: error.message || "Failed to auto-tag system",
        hint: "Verify backend /api/auto-tag endpoint is implemented",
      },
      { status: 500 },
    )
  }
}
