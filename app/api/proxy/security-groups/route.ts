import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface SecurityGroupRule {
  id: string
  direction: "inbound" | "outbound"
  protocol: string
  portRange: string
  source: string
  description: string
  used: boolean
  lastUsed?: string
  trafficVolume?: number
  connections?: number
  riskLevel: "critical" | "high" | "medium" | "low"
}

interface SecurityGroup {
  id: string
  name: string
  vpcId: string
  description: string
  rules: SecurityGroupRule[]
  attachedResources: string[]
  totalRules: number
  unusedRules: number
  riskScore: number
}

// Determine risk level based on rule configuration
function calculateRiskLevel(rule: any): "critical" | "high" | "medium" | "low" {
  const source = rule.source || rule.cidr || ""
  const port = rule.portRange || rule.port || ""

  // Critical: SSH/RDP/DB ports open to internet
  if (source === "0.0.0.0/0" || source === "::/0") {
    if (port === "22" || port === "3389") return "critical"
    if (["3306", "5432", "1433", "27017", "6379"].includes(port)) return "critical"
    if (port === "All" || port === "0-65535") return "critical"
    return "high"
  }

  // Medium: Internal ranges with sensitive ports
  if (source.startsWith("10.") || source.startsWith("172.") || source.startsWith("192.168.")) {
    if (["22", "3389", "3306", "5432"].includes(port)) return "medium"
    return "low"
  }

  // Low: Security group references
  if (source.startsWith("sg-")) {
    return "low"
  }

  return "medium"
}

// Transform Neo4j security group data into our format
function transformSecurityGroupData(nodes: any[]): SecurityGroup[] {
  const securityGroups: SecurityGroup[] = []

  for (const node of nodes) {
    // Look for SecurityGroup nodes
    if (node.type === "SecurityGroup" || node.labels?.includes("SecurityGroup") || node.id?.startsWith("sg-")) {
      const rules: SecurityGroupRule[] = []
      let unusedCount = 0

      // Parse inbound rules if available
      const inboundRules = node.properties?.inbound_rules || node.inbound_rules || []
      for (let i = 0; i < inboundRules.length; i++) {
        const r = inboundRules[i]
        // Determine if rule is used based on traffic data (if available)
        const used = r.traffic_volume > 0 || r.connections > 0 || r.used === true
        if (!used) unusedCount++

        rules.push({
          id: `inbound-${i}`,
          direction: "inbound",
          protocol: r.protocol || r.ip_protocol || "TCP",
          portRange: r.port || r.from_port?.toString() || "All",
          source: r.source || r.cidr_ip || r.cidr || "0.0.0.0/0",
          description: r.description || "",
          used,
          lastUsed: used ? "Recently" : "Never",
          trafficVolume: r.traffic_volume || 0,
          connections: r.connections || 0,
          riskLevel: calculateRiskLevel(r),
        })
      }

      // Parse outbound rules if available
      const outboundRules = node.properties?.outbound_rules || node.outbound_rules || []
      for (let i = 0; i < outboundRules.length; i++) {
        const r = outboundRules[i]
        const used = r.traffic_volume > 0 || r.connections > 0 || r.used === true
        if (!used) unusedCount++

        rules.push({
          id: `outbound-${i}`,
          direction: "outbound",
          protocol: r.protocol || r.ip_protocol || "All",
          portRange: r.port || r.from_port?.toString() || "All",
          source: r.destination || r.cidr_ip || r.cidr || "0.0.0.0/0",
          description: r.description || "",
          used,
          lastUsed: used ? "Recently" : "Never",
          trafficVolume: r.traffic_volume || 0,
          connections: r.connections || 0,
          riskLevel: calculateRiskLevel(r),
        })
      }

      // Calculate risk score based on rules
      let riskScore = 0
      for (const rule of rules) {
        if (!rule.used) {
          if (rule.riskLevel === "critical") riskScore += 30
          else if (rule.riskLevel === "high") riskScore += 20
          else if (rule.riskLevel === "medium") riskScore += 10
          else riskScore += 5
        }
      }
      riskScore = Math.min(100, riskScore)

      // Find attached resources
      const attachedResources = node.properties?.attached_resources ||
                               node.attached_resources ||
                               node.properties?.instances || []

      securityGroups.push({
        id: node.id || node.properties?.id || `sg-${Math.random().toString(36).substr(2, 9)}`,
        name: node.name || node.properties?.name || node.properties?.group_name || "Unnamed SG",
        vpcId: node.properties?.vpc_id || node.vpc_id || "vpc-unknown",
        description: node.properties?.description || node.description || "",
        rules,
        attachedResources: Array.isArray(attachedResources) ? attachedResources : [attachedResources],
        totalRules: rules.length,
        unusedRules: unusedCount,
        riskScore,
      })
    }
  }

  return securityGroups
}

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    // First try to fetch from dedicated security groups endpoint
    let response = await fetch(`${backendUrl}/api/security-groups`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.securityGroups && data.securityGroups.length > 0) {
        console.log("[v0] Security groups fetched from dedicated endpoint:", data.securityGroups.length)
        return NextResponse.json({
          success: true,
          securityGroups: data.securityGroups,
          source: "backend",
        })
      }
    }

    // Fallback: try to extract from graph nodes
    response = await fetch(`${backendUrl}/api/graph/nodes`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      const data = await response.json()
      const nodes = data.nodes || data || []

      const securityGroups = transformSecurityGroupData(nodes)

      if (securityGroups.length > 0) {
        console.log("[v0] Security groups extracted from graph nodes:", securityGroups.length)
        return NextResponse.json({
          success: true,
          securityGroups,
          source: "neo4j",
        })
      }
    }

    // No real data - return empty to trigger frontend mock data
    console.log("[v0] No security group data found in backend")
    return NextResponse.json({
      success: true,
      securityGroups: [],
      source: "none",
      message: "No security group data available. Using demo data.",
    })
  } catch (error) {
    console.error("[v0] Security groups fetch error:", error)
    return NextResponse.json({
      success: true,
      securityGroups: [],
      source: "error",
      message: error instanceof Error ? error.message : "Failed to fetch security groups",
    })
  }
}
