import { NextResponse } from "next/server"

// Demo data with S3 buckets and EC2-S3 traffic simulation
const DEMO_NODES = [
  // EC2 Instances
  { id: "i-0df88ac8208f7607a", name: "SafeRemediate-Test-App-1", type: "EC2", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", private_ip: "10.0.10.231", state: "running" },
  { id: "i-0e9b891793b5b2dbd", name: "SafeRemediate-Test-App-2", type: "EC2", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", private_ip: "10.0.11.58", state: "running" },
  { id: "i-0f51b8b7ad29a359b", name: "SafeRemediate-Test-Frontend-1", type: "EC2", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", public_ip: "34.252.223.67", private_ip: "10.0.1.182", state: "running" },
  { id: "i-03c72e120ff96216c", name: "SafeRemediate-Test-Frontend-2", type: "EC2", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", public_ip: "54.171.73.9", private_ip: "10.0.2.15", state: "running" },

  // S3 Buckets (simulated)
  { id: "saferemediate-logs-bucket", name: "saferemediate-logs-bucket", type: "S3", SystemName: "alon-prod", region: "eu-west-1" },
  { id: "saferemediate-data-bucket", name: "saferemediate-data-bucket", type: "S3", SystemName: "alon-prod", region: "eu-west-1" },

  // Security Groups
  { id: "sg-02a2ccfe185765527", name: "saferemediate-test-app-sg", type: "SecurityGroup", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", description: "Security group for Application Tier" },
  { id: "sg-0f8fadc0579ff6845", name: "saferemediate-test-db-sg", type: "SecurityGroup", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", description: "Security group for Database Tier" },
  { id: "sg-06a6f52b72976da16", name: "saferemediate-test-alb-sg", type: "SecurityGroup", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", description: "Security group for Application Load Balancer" },

  // VPC
  { id: "vpc-0329e985173bed24f", name: "Payment-Production-VPC", type: "VPC", SystemName: "alon-prod", cidr_block: "10.0.0.0/16", state: "available" },

  // Subnets
  { id: "subnet-0d193156d09dfe931", name: "SafeRemediate-Test-Public-1", type: "Subnet", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", cidr_block: "10.0.1.0/24", public: true },
  { id: "subnet-0ce8a751c9557e86b", name: "SafeRemediate-Test-Public-2", type: "Subnet", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", cidr_block: "10.0.2.0/24", public: true },
  { id: "subnet-0a61618a91d149f83", name: "SafeRemediate-Test-Private-App-1", type: "Subnet", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", cidr_block: "10.0.10.0/24", public: false },
  { id: "subnet-0ac239d3cb41262ea", name: "SafeRemediate-Test-Private-App-2", type: "Subnet", SystemName: "alon-prod", vpc_id: "vpc-0329e985173bed24f", cidr_block: "10.0.11.0/24", public: false },

  // RDS
  { id: "arn:aws:rds:eu-west-1:745783559495:db:saferemediate-test-db", name: "saferemediate-test-db", type: "RDSInstance", identifier: "saferemediate-test-db", engine: "postgres", status: "available" },

  // Internet Gateway
  { id: "igw-03bb3f19b706abbc4", name: "igw-03bb3f19b706abbc4", type: "InternetGateway", SystemName: "alon-prod" },
]

const DEMO_RELATIONSHIPS = [
  // EC2 to Security Group relationships
  { source: "i-0df88ac8208f7607a", target: "sg-02a2ccfe185765527", type: "HAS_SECURITY_GROUP" },
  { source: "i-0e9b891793b5b2dbd", target: "sg-02a2ccfe185765527", type: "HAS_SECURITY_GROUP" },
  { source: "i-0f51b8b7ad29a359b", target: "sg-02a2ccfe185765527", type: "HAS_SECURITY_GROUP" },
  { source: "i-03c72e120ff96216c", target: "sg-02a2ccfe185765527", type: "HAS_SECURITY_GROUP" },

  // EC2 to VPC
  { source: "i-0df88ac8208f7607a", target: "vpc-0329e985173bed24f", type: "IN_VPC" },
  { source: "i-0e9b891793b5b2dbd", target: "vpc-0329e985173bed24f", type: "IN_VPC" },
  { source: "i-0f51b8b7ad29a359b", target: "vpc-0329e985173bed24f", type: "IN_VPC" },
  { source: "i-03c72e120ff96216c", target: "vpc-0329e985173bed24f", type: "IN_VPC" },

  // EC2 to Subnet
  { source: "i-0df88ac8208f7607a", target: "subnet-0a61618a91d149f83", type: "IN_SUBNET" },
  { source: "i-0e9b891793b5b2dbd", target: "subnet-0ac239d3cb41262ea", type: "IN_SUBNET" },
  { source: "i-0f51b8b7ad29a359b", target: "subnet-0d193156d09dfe931", type: "IN_SUBNET" },
  { source: "i-03c72e120ff96216c", target: "subnet-0ce8a751c9557e86b", type: "IN_SUBNET" },

  // Security Group to VPC
  { source: "sg-02a2ccfe185765527", target: "vpc-0329e985173bed24f", type: "IN_VPC" },
  { source: "sg-0f8fadc0579ff6845", target: "vpc-0329e985173bed24f", type: "IN_VPC" },
  { source: "sg-06a6f52b72976da16", target: "vpc-0329e985173bed24f", type: "IN_VPC" },

  // RDS to Security Group
  { source: "arn:aws:rds:eu-west-1:745783559495:db:saferemediate-test-db", target: "sg-0f8fadc0579ff6845", type: "SECURED_BY" },

  // VPC to Internet Gateway
  { source: "vpc-0329e985173bed24f", target: "igw-03bb3f19b706abbc4", type: "HAS_IGW" },

  // ============================================
  // SIMULATED S3 TRAFFIC (ACTUAL runtime traffic)
  // ============================================

  // App-1: Only READS from logs bucket (read-only access)
  { source: "i-0df88ac8208f7607a", target: "saferemediate-logs-bucket", type: "ACTUAL_READS" },

  // App-2: Only WRITES to data bucket (write-only access, e.g., backup/export)
  { source: "i-0e9b891793b5b2dbd", target: "saferemediate-data-bucket", type: "ACTUAL_WRITES" },

  // Frontend-1: READS and WRITES (modify access - e.g., user uploads/downloads)
  { source: "i-0f51b8b7ad29a359b", target: "saferemediate-data-bucket", type: "ACTUAL_READS" },
  { source: "i-0f51b8b7ad29a359b", target: "saferemediate-data-bucket", type: "ACTUAL_WRITES" },

  // EC2 to RDS traffic
  { source: "i-0df88ac8208f7607a", target: "arn:aws:rds:eu-west-1:745783559495:db:saferemediate-test-db", type: "ACTUAL_QUERIES" },
  { source: "i-0e9b891793b5b2dbd", target: "arn:aws:rds:eu-west-1:745783559495:db:saferemediate-test-db", type: "ACTUAL_QUERIES" },
]

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

    // Fetch nodes and edges in parallel
    const [nodesResponse, edgesResponse] = await Promise.all([
      fetch(`${backendUrl}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
      fetch(`${backendUrl}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
    ])

    clearTimeout(timeoutId)

    if (!nodesResponse.ok || !edgesResponse.ok) {
      console.error("[v0] Graph data fetch failed - nodes:", nodesResponse.status, "edges:", edgesResponse.status)
      // Return demo data with S3 traffic simulation
      return NextResponse.json({
        success: true,
        nodes: DEMO_NODES,
        relationships: DEMO_RELATIONSHIPS,
        isDemo: true,
      })
    }

    const nodesData = await nodesResponse.json()
    const edgesData = await edgesResponse.json()

    const nodes = nodesData.nodes || nodesData || []
    const relationships = edgesData.edges || edgesData.relationships || edgesData || []

    console.log(
      "[v0] Graph data fetched - nodes:",
      nodes.length,
      "edges:",
      relationships.length,
    )

    // If backend returns empty data, use demo data
    if (nodes.length === 0 && relationships.length === 0) {
      console.log("[v0] Backend returned empty data, using demo data with S3 traffic")
      return NextResponse.json({
        success: true,
        nodes: DEMO_NODES,
        relationships: DEMO_RELATIONSHIPS,
        isDemo: true,
      })
    }

    return NextResponse.json({
      success: true,
      nodes,
      relationships,
    })
  } catch (error: any) {
    console.error("[v0] Graph data fetch error:", error.name === 'AbortError' ? 'Request timed out' : error)
    // Return demo data with S3 traffic simulation instead of empty data
    return NextResponse.json({
      success: true,
      nodes: DEMO_NODES,
      relationships: DEMO_RELATIONSHIPS,
      isDemo: true,
    })
  }
}
