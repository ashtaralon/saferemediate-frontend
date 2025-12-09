import { NextResponse } from "next/server"

// Fallback demo data when backend is unavailable
const FALLBACK_NODES = [
  { id: "lambda-payment", name: "payment-processor", type: "Lambda", SystemName: "payment-system" },
  { id: "lambda-auth", name: "auth-service", type: "Lambda", SystemName: "payment-system" },
  { id: "lambda-user", name: "user-api", type: "Lambda", SystemName: "payment-system" },
  { id: "rds-main", name: "prod-database", type: "RDS", SystemName: "payment-system" },
  { id: "rds-replica", name: "prod-db-replica", type: "RDS", SystemName: "payment-system" },
  { id: "s3-logs", name: "payment-logs", type: "S3", SystemName: "payment-system" },
  { id: "s3-assets", name: "static-assets", type: "S3", SystemName: "payment-system" },
  { id: "sqs-queue", name: "payment-queue", type: "SQS", SystemName: "payment-system" },
  { id: "sns-topic", name: "notifications", type: "SNS", SystemName: "payment-system" },
  { id: "elasticache", name: "cache-cluster", type: "ElastiCache", SystemName: "payment-system" },
  { id: "api-gw", name: "api-gateway", type: "APIGateway", SystemName: "payment-system" },
  { id: "alb-main", name: "prod-load-balancer", type: "ALB", SystemName: "payment-system" },
  { id: "ec2-web-1", name: "web-server-1", type: "EC2", SystemName: "payment-system" },
  { id: "ec2-web-2", name: "web-server-2", type: "EC2", SystemName: "payment-system" },
  { id: "iam-lambda-role", name: "lambda-execution-role", type: "IAM", SystemName: "payment-system" },
  { id: "iam-ec2-role", name: "ec2-instance-role", type: "IAM", SystemName: "payment-system" },
  { id: "vpc-main", name: "prod-vpc", type: "VPC", SystemName: "payment-system" },
  { id: "sg-web", name: "web-security-group", type: "SecurityGroup", SystemName: "payment-system" },
  { id: "sg-db", name: "db-security-group", type: "SecurityGroup", SystemName: "payment-system" },
  { id: "cloudwatch", name: "monitoring", type: "CloudWatch", SystemName: "payment-system" },
]

const FALLBACK_RELATIONSHIPS = [
  // API Gateway -> Lambdas
  { source: "api-gw", target: "lambda-payment", type: "INVOKES" },
  { source: "api-gw", target: "lambda-auth", type: "INVOKES" },
  { source: "api-gw", target: "lambda-user", type: "INVOKES" },
  // ALB -> EC2
  { source: "alb-main", target: "ec2-web-1", type: "ROUTES_TO" },
  { source: "alb-main", target: "ec2-web-2", type: "ROUTES_TO" },
  // Lambdas -> Database
  { source: "lambda-payment", target: "rds-main", type: "QUERIES" },
  { source: "lambda-user", target: "rds-main", type: "QUERIES" },
  { source: "lambda-auth", target: "elasticache", type: "CACHES" },
  // Lambda -> S3
  { source: "lambda-payment", target: "s3-logs", type: "WRITES" },
  // Lambda -> SQS/SNS
  { source: "lambda-payment", target: "sqs-queue", type: "PUBLISHES" },
  { source: "sqs-queue", target: "sns-topic", type: "TRIGGERS" },
  // IAM Roles
  { source: "lambda-payment", target: "iam-lambda-role", type: "ASSUMES_ROLE" },
  { source: "lambda-auth", target: "iam-lambda-role", type: "ASSUMES_ROLE" },
  { source: "lambda-user", target: "iam-lambda-role", type: "ASSUMES_ROLE" },
  { source: "ec2-web-1", target: "iam-ec2-role", type: "ASSUMES_ROLE" },
  { source: "ec2-web-2", target: "iam-ec2-role", type: "ASSUMES_ROLE" },
  // VPC/Security Groups
  { source: "ec2-web-1", target: "sg-web", type: "PROTECTED_BY" },
  { source: "ec2-web-2", target: "sg-web", type: "PROTECTED_BY" },
  { source: "rds-main", target: "sg-db", type: "PROTECTED_BY" },
  { source: "rds-replica", target: "sg-db", type: "PROTECTED_BY" },
  { source: "ec2-web-1", target: "vpc-main", type: "RESIDES_IN" },
  { source: "ec2-web-2", target: "vpc-main", type: "RESIDES_IN" },
  { source: "rds-main", target: "vpc-main", type: "RESIDES_IN" },
  // RDS Replication
  { source: "rds-main", target: "rds-replica", type: "REPLICATES_TO" },
  // Monitoring
  { source: "lambda-payment", target: "cloudwatch", type: "LOGS_TO" },
  { source: "ec2-web-1", target: "cloudwatch", type: "LOGS_TO" },
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
      console.log("[v0] Returning fallback demo data")
      return NextResponse.json({
        success: true,
        fallback: true,
        nodes: FALLBACK_NODES,
        relationships: FALLBACK_RELATIONSHIPS,
      })
    }

    const nodesData = await nodesResponse.json()
    const edgesData = await edgesResponse.json()

    console.log(
      "[v0] Graph data fetched - nodes:",
      nodesData?.nodes?.length || nodesData?.length || 0,
      "edges:",
      edgesData?.edges?.length || edgesData?.length || 0,
    )

    const nodes = nodesData.nodes || nodesData || []
    const relationships = edgesData.edges || edgesData.relationships || edgesData || []

    // If backend returns empty data, use fallback
    if (nodes.length === 0) {
      console.log("[v0] Backend returned empty nodes, using fallback demo data")
      return NextResponse.json({
        success: true,
        fallback: true,
        nodes: FALLBACK_NODES,
        relationships: FALLBACK_RELATIONSHIPS,
      })
    }

    return NextResponse.json({
      success: true,
      nodes,
      relationships,
    })
  } catch (error: any) {
    console.error("[v0] Graph data fetch error:", error.name === 'AbortError' ? 'Request timed out' : error)
    // Return fallback demo data instead of empty arrays
    console.log("[v0] Returning fallback demo data due to error")
    return NextResponse.json({
      success: true,
      fallback: true,
      nodes: FALLBACK_NODES,
      relationships: FALLBACK_RELATIONSHIPS,
    })
  }
}
