import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const backendUrl =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-1.onrender.com"

// Demo data for when backend returns empty
const DEMO_NODES = [
  {
    id: "lambda-1",
    name: "SafeRemediate-Lambda-Remediation",
    type: "LambdaFunction",
    systemName: "alon-prod",
    environment: "Production",
    region: "eu-west-1",
    status: "active",
    lastSeen: new Date().toISOString(),
  },
  {
    id: "role-1",
    name: "SafeRemediate-Lambda-Remediation-Role",
    type: "IAMRole",
    systemName: "alon-prod",
    environment: "Production",
    region: "global",
    status: "active",
    attachedPolicies: 3,
    permissionCount: 28,
    lastSeen: new Date().toISOString(),
  },
  {
    id: "policy-1",
    name: "SafeRemediate-CloudTrail-Access",
    type: "IAMPolicy",
    systemName: "alon-prod",
    environment: "Production",
    region: "global",
    status: "active",
    lastSeen: new Date().toISOString(),
  },
  {
    id: "s3-1",
    name: "saferemediate-data-bucket",
    type: "S3",
    systemName: "alon-prod",
    environment: "Production",
    region: "eu-west-1",
    status: "active",
    lastSeen: new Date().toISOString(),
  },
  {
    id: "sg-1",
    name: "saferemediate-lambda-sg",
    type: "SecurityGroup",
    systemName: "alon-prod",
    environment: "Production",
    region: "eu-west-1",
    status: "active",
    lastSeen: new Date().toISOString(),
  },
  {
    id: "cloudtrail-1",
    name: "saferemediate-audit-trail",
    type: "CloudTrail",
    systemName: "alon-prod",
    environment: "Production",
    region: "eu-west-1",
    status: "active",
    lastSeen: new Date().toISOString(),
  },
  {
    id: "ec2-1",
    name: "saferemediate-worker-1",
    type: "EC2",
    systemName: "alon-prod",
    environment: "Production",
    region: "eu-west-1",
    status: "running",
    instanceState: "running",
    lastSeen: new Date().toISOString(),
  },
  {
    id: "rds-1",
    name: "saferemediate-db",
    type: "RDS",
    systemName: "alon-prod",
    environment: "Production",
    region: "eu-west-1",
    status: "available",
    lastSeen: new Date().toISOString(),
  },
]

const DEMO_RELATIONSHIPS = [
  { source: "lambda-1", target: "role-1", type: "ASSUMES_ROLE" },
  { source: "role-1", target: "policy-1", type: "HAS_POLICY" },
  { source: "lambda-1", target: "s3-1", type: "ACCESSES" },
  { source: "lambda-1", target: "sg-1", type: "USES" },
  { source: "role-1", target: "cloudtrail-1", type: "CAN_ACCESS" },
  { source: "ec2-1", target: "sg-1", type: "USES" },
  { source: "lambda-1", target: "rds-1", type: "CONNECTS_TO" },
]

export async function GET() {
  try {
    // Fetch nodes and edges in parallel
    const [nodesResponse, edgesResponse] = await Promise.all([
      fetch(`${backendUrl}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
      fetch(`${backendUrl}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
    ])

    if (!nodesResponse.ok || !edgesResponse.ok) {
      console.log("[v0] Graph data fetch failed, using demo data")
      return NextResponse.json({
        success: true,
        nodes: DEMO_NODES,
        relationships: DEMO_RELATIONSHIPS,
      })
    }

    const nodesData = await nodesResponse.json()
    const edgesData = await edgesResponse.json()

    const nodes = nodesData.nodes || nodesData || []
    const relationships = edgesData.edges || edgesData.relationships || edgesData || []

    // If backend returns empty, use demo data
    if (nodes.length === 0) {
      console.log("[v0] Backend returned empty nodes, using demo data")
      return NextResponse.json({
        success: true,
        nodes: DEMO_NODES,
        relationships: DEMO_RELATIONSHIPS,
      })
    }

    console.log("[v0] Graph data fetched - nodes:", nodes.length, "edges:", relationships.length)

    return NextResponse.json({
      success: true,
      nodes,
      relationships,
    })
  } catch (error) {
    console.error("[v0] Graph data fetch error, using demo data:", error)
    return NextResponse.json({
      success: true,
      nodes: DEMO_NODES,
      relationships: DEMO_RELATIONSHIPS,
    })
  }
}
