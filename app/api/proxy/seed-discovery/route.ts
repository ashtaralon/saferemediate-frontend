import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

/**
 * A7 Patent: Seed-Based Dependency Graph Propagation
 *
 * This endpoint implements the core discovery algorithm from the A7 patent:
 * "Automated Discovery and Temporal Maintenance of Logical System Boundaries
 * in Cloud Infrastructure Using Seed-Based Dependency Graph Propagation"
 *
 * Input:
 * - systemName: The logical system identifier
 * - seedResourceIds: 1-5 seed resources to start traversal from
 * - traversalConfig: Configuration for the graph traversal
 *
 * Output:
 * - seeds: The original seed resources
 * - discovered: Resources found through dependency graph traversal
 * - sharedResources: Resources that belong to multiple systems
 * - confidenceScore: Overall confidence in the discovery result
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { systemName, seedResourceIds, traversalConfig } = body

    if (!systemName) {
      return NextResponse.json(
        { error: "systemName is required" },
        { status: 400 }
      )
    }

    if (!seedResourceIds || !Array.isArray(seedResourceIds) || seedResourceIds.length === 0) {
      return NextResponse.json(
        { error: "At least one seed resource is required" },
        { status: 400 }
      )
    }

    if (seedResourceIds.length > 5) {
      return NextResponse.json(
        { error: "Maximum 5 seed resources allowed per A7 patent specification" },
        { status: 400 }
      )
    }

    console.log(`[A7 Discovery] Starting seed-based discovery for system: ${systemName}`)
    console.log(`[A7 Discovery] Seeds: ${seedResourceIds.join(", ")}`)

    // Call backend A7 discovery endpoint
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      const response = await fetch(`${BACKEND_URL}/api/system/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          system_name: systemName,
          seed_resource_ids: seedResourceIds,
          traversal_config: {
            max_depth: traversalConfig?.maxDepth || 5,
            membership_threshold: traversalConfig?.membershipThreshold || 0.6,
            edge_types: traversalConfig?.edgeTypes || [
              "IAM_ASSUMES",
              "IAM_PERMISSION",
              "NETWORK_TRAFFIC",
              "NETWORK_USES",
              "DATA_ACCESS",
              "DATA_CONTAINS",
              "CONFIG_REFERENCES",
              "INVOKES",
            ],
            include_shared: true,
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        console.log(`[A7 Discovery] Backend returned: ${data.total_count || 0} resources`)

        return NextResponse.json({
          success: true,
          result: {
            systemName: data.system_name || systemName,
            seeds: (data.seeds || []).map((r: any) => ({
              id: r.id,
              name: r.name || r.id,
              type: r.type,
              source: "seed",
              membershipScore: 1.0,
            })),
            discovered: (data.discovered || []).map((r: any) => ({
              id: r.id,
              name: r.name || r.id,
              type: r.type,
              source: "derived",
              membershipScore: r.membership_score || r.score || 0.8,
              edgeTypes: r.edge_types || [],
              discoveryPath: r.discovery_path || [],
            })),
            sharedResources: (data.shared || []).map((r: any) => ({
              id: r.id,
              name: r.name || r.id,
              type: r.type,
              source: "derived",
              membershipScore: r.membership_score || r.score || 0.7,
              isShared: true,
              sharedWith: r.shared_with || [],
              edgeTypes: r.edge_types || [],
            })),
            totalCount: data.total_count || 0,
            traversalDepth: data.traversal_depth || 3,
            confidenceScore: data.confidence_score || 0.85,
          },
        })
      }

      // If backend fails, fall through to fallback
      console.warn(`[A7 Discovery] Backend returned ${response.status}, using fallback`)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      console.warn(`[A7 Discovery] Backend error: ${fetchError.message}, using fallback`)
    }

    // Fallback: Generate demo discovery result based on seed types
    // This allows the frontend to work even when backend is not available
    const fallbackResult = generateFallbackDiscovery(systemName, seedResourceIds)

    return NextResponse.json({
      success: true,
      fallback: true,
      result: fallbackResult,
    })
  } catch (error: any) {
    console.error("[A7 Discovery] Error:", error)
    return NextResponse.json(
      { error: error.message || "Discovery failed" },
      { status: 500 }
    )
  }
}

/**
 * Generate a fallback discovery result for demo/development purposes
 * This simulates the A7 patent algorithm behavior
 */
function generateFallbackDiscovery(systemName: string, seedResourceIds: string[]) {
  const seeds = seedResourceIds.map((id) => {
    const type = inferResourceType(id)
    return {
      id,
      name: generateResourceName(id, type),
      type,
      source: "seed" as const,
      membershipScore: 1.0,
    }
  })

  const discovered: any[] = []
  const sharedResources: any[] = []

  // For each seed, discover related resources based on typical AWS relationships
  seeds.forEach((seed, idx) => {
    const type = seed.type.toLowerCase()

    // IAM relationships (all compute resources have IAM roles)
    if (type.includes("ec2") || type.includes("lambda") || type.includes("ecs") || type.includes("eks")) {
      discovered.push({
        id: `role-${systemName}-${idx}`,
        name: `${systemName}-execution-role-${idx}`,
        type: "IAMRole",
        source: "derived",
        membershipScore: 0.95,
        edgeTypes: ["IAM_ASSUMES"],
        discoveryPath: [seed.id],
      })

      discovered.push({
        id: `policy-${systemName}-${idx}`,
        name: `${systemName}-policy-${idx}`,
        type: "IAMPolicy",
        source: "derived",
        membershipScore: 0.92,
        edgeTypes: ["IAM_PERMISSION"],
        discoveryPath: [seed.id, `role-${systemName}-${idx}`],
      })
    }

    // Network relationships
    if (type.includes("ec2") || type.includes("rds") || type.includes("lambda") || type.includes("elb")) {
      discovered.push({
        id: `sg-${systemName}-${idx}`,
        name: `${systemName}-security-group-${idx}`,
        type: "SecurityGroup",
        source: "derived",
        membershipScore: 0.88,
        edgeTypes: ["NETWORK_USES"],
        discoveryPath: [seed.id],
      })
    }

    // Data relationships
    if (type.includes("lambda") || type.includes("ec2") || type.includes("ecs")) {
      discovered.push({
        id: `s3-${systemName}-data-${idx}`,
        name: `${systemName}-data-bucket`,
        type: "S3Bucket",
        source: "derived",
        membershipScore: 0.82,
        edgeTypes: ["DATA_ACCESS"],
        discoveryPath: [seed.id],
      })
    }

    // Database connections
    if (type.includes("lambda") || type.includes("ec2") || type.includes("ecs")) {
      discovered.push({
        id: `rds-${systemName}-${idx}`,
        name: `${systemName}-database`,
        type: "RDSInstance",
        source: "derived",
        membershipScore: 0.85,
        edgeTypes: ["DATA_ACCESS"],
        discoveryPath: [seed.id],
      })
    }
  })

  // Add shared resources (VPC, logging, etc.)
  sharedResources.push({
    id: `vpc-shared-${systemName.split("-")[0]}`,
    name: "production-vpc",
    type: "VPC",
    source: "derived",
    membershipScore: 0.75,
    isShared: true,
    sharedWith: ["other-system-1", "other-system-2"],
    edgeTypes: ["NETWORK_CONTAINS"],
  })

  sharedResources.push({
    id: "role-cloudwatch-logs",
    name: "CloudWatchLogsRole",
    type: "IAMRole",
    source: "derived",
    membershipScore: 0.68,
    isShared: true,
    sharedWith: ["logging-infrastructure"],
    edgeTypes: ["IAM_ASSUMES"],
  })

  // Deduplicate discovered resources
  const uniqueDiscovered = discovered.filter(
    (r, index, self) => index === self.findIndex((t) => t.id === r.id)
  )

  return {
    systemName,
    seeds,
    discovered: uniqueDiscovered,
    sharedResources,
    totalCount: seeds.length + uniqueDiscovered.length + sharedResources.length,
    traversalDepth: 3,
    confidenceScore: 0.87,
  }
}

/**
 * Infer resource type from resource ID patterns
 */
function inferResourceType(id: string): string {
  const lowerid = id.toLowerCase()
  if (lowerid.startsWith("i-")) return "EC2Instance"
  if (lowerid.startsWith("vpc-")) return "VPC"
  if (lowerid.startsWith("subnet-")) return "Subnet"
  if (lowerid.startsWith("sg-")) return "SecurityGroup"
  if (lowerid.startsWith("rtb-")) return "RouteTable"
  if (lowerid.startsWith("igw-")) return "InternetGateway"
  if (lowerid.startsWith("nat-")) return "NatGateway"
  if (lowerid.startsWith("eni-")) return "NetworkInterface"
  if (lowerid.includes("rds") || lowerid.includes("database")) return "RDSInstance"
  if (lowerid.includes("lambda")) return "Lambda"
  if (lowerid.includes("s3") || lowerid.includes("bucket")) return "S3Bucket"
  if (lowerid.includes("role")) return "IAMRole"
  if (lowerid.includes("policy")) return "IAMPolicy"
  if (lowerid.includes("api") || lowerid.includes("gateway")) return "APIGateway"
  if (lowerid.includes("elb") || lowerid.includes("alb") || lowerid.includes("nlb")) return "LoadBalancer"
  if (lowerid.includes("ecs") || lowerid.includes("cluster")) return "ECSCluster"
  if (lowerid.includes("eks")) return "EKSCluster"
  if (lowerid.includes("dynamo")) return "DynamoDBTable"
  if (lowerid.includes("sqs") || lowerid.includes("queue")) return "SQSQueue"
  if (lowerid.includes("sns") || lowerid.includes("topic")) return "SNSTopic"
  return "Resource"
}

/**
 * Generate a human-readable resource name from ID
 */
function generateResourceName(id: string, type: string): string {
  // If ID looks like a name already, use it
  if (!id.startsWith("i-") && !id.startsWith("vpc-") && !id.startsWith("sg-")) {
    return id.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }
  return `${type}-${id.slice(-8)}`
}
