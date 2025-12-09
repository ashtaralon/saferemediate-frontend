// Real AWS Security Groups - Fetch actual SGs from your AWS account

import { NextResponse } from "next/server"
import {
  EC2Client,
  DescribeSecurityGroupsCommand,
  DescribeNetworkInterfacesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2"

export const dynamic = "force-dynamic"

const getEC2Client = () => {
  return new EC2Client({
    region: process.env.AWS_REGION || "eu-west-1",
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        }
      : undefined,
  })
}

interface SGRule {
  id: string
  direction: "inbound" | "outbound"
  protocol: string
  portRange: string
  source: string
  description: string
  riskLevel: "critical" | "high" | "medium" | "low"
  // For remediation - we need the actual AWS rule data
  awsRule: any
}

interface SecurityGroup {
  id: string
  name: string
  vpcId: string
  description: string
  rules: SGRule[]
  attachedResources: string[]
  totalRules: number
  riskScore: number
}

function calculateRiskLevel(rule: any, direction: string): "critical" | "high" | "medium" | "low" {
  const cidr = rule.CidrIpv4 || rule.CidrIpv6 || ""
  const isOpenToInternet = cidr === "0.0.0.0/0" || cidr === "::/0"
  const fromPort = rule.FromPort
  const toPort = rule.ToPort

  // Critical: SSH/RDP/DB open to internet
  if (isOpenToInternet && direction === "inbound") {
    if (fromPort === 22 || toPort === 22) return "critical" // SSH
    if (fromPort === 3389 || toPort === 3389) return "critical" // RDP
    if ([3306, 5432, 1433, 27017, 6379].includes(fromPort)) return "critical" // DBs
    if (fromPort === -1 && toPort === -1) return "critical" // All ports
    return "high"
  }

  // Medium: Internal with sensitive ports
  if (!isOpenToInternet && [22, 3389, 3306, 5432].includes(fromPort)) {
    return "medium"
  }

  // Low: Security group reference or restricted
  if (rule.ReferencedGroupInfo?.GroupId) return "low"

  return "low"
}

function formatPortRange(fromPort?: number, toPort?: number, protocol?: string): string {
  if (protocol === "-1") return "All"
  if (fromPort === undefined || fromPort === -1) return "All"
  if (fromPort === toPort) return fromPort.toString()
  return `${fromPort}-${toPort}`
}

function formatProtocol(protocol?: string): string {
  if (!protocol || protocol === "-1") return "All"
  if (protocol === "6") return "TCP"
  if (protocol === "17") return "UDP"
  if (protocol === "1") return "ICMP"
  return protocol.toUpperCase()
}

export async function GET() {
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    return NextResponse.json({
      success: false,
      error: "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local",
      configured: false,
    })
  }

  try {
    const client = getEC2Client()
    const securityGroups: SecurityGroup[] = []

    // Get all security groups
    const sgResponse = await client.send(new DescribeSecurityGroupsCommand({}))

    // Get instances to find attached resources
    const instancesResponse = await client.send(new DescribeInstancesCommand({}))
    const instanceSGMap: Record<string, string[]> = {}

    for (const reservation of instancesResponse.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const instanceName = instance.Tags?.find(t => t.Key === "Name")?.Value || instance.InstanceId || ""
        for (const sg of instance.SecurityGroups || []) {
          if (sg.GroupId) {
            if (!instanceSGMap[sg.GroupId]) instanceSGMap[sg.GroupId] = []
            instanceSGMap[sg.GroupId].push(`${instanceName} (${instance.InstanceId})`)
          }
        }
      }
    }

    for (const sg of sgResponse.SecurityGroups || []) {
      const rules: SGRule[] = []
      let riskScore = 0

      // Process inbound rules
      for (let i = 0; i < (sg.IpPermissions?.length || 0); i++) {
        const perm = sg.IpPermissions![i]

        // Each permission can have multiple IP ranges
        for (const ipRange of perm.IpRanges || []) {
          const riskLevel = calculateRiskLevel({ ...perm, CidrIpv4: ipRange.CidrIp }, "inbound")

          if (riskLevel === "critical") riskScore += 30
          else if (riskLevel === "high") riskScore += 20
          else if (riskLevel === "medium") riskScore += 10

          rules.push({
            id: `inbound-${i}-${ipRange.CidrIp}`,
            direction: "inbound",
            protocol: formatProtocol(perm.IpProtocol),
            portRange: formatPortRange(perm.FromPort, perm.ToPort, perm.IpProtocol),
            source: ipRange.CidrIp || "Unknown",
            description: ipRange.Description || "",
            riskLevel,
            awsRule: { ...perm, targetCidr: ipRange.CidrIp },
          })
        }

        // Security group references
        for (const sgRef of perm.UserIdGroupPairs || []) {
          rules.push({
            id: `inbound-${i}-${sgRef.GroupId}`,
            direction: "inbound",
            protocol: formatProtocol(perm.IpProtocol),
            portRange: formatPortRange(perm.FromPort, perm.ToPort, perm.IpProtocol),
            source: sgRef.GroupId || "Unknown SG",
            description: sgRef.Description || "",
            riskLevel: "low",
            awsRule: { ...perm, targetSG: sgRef.GroupId },
          })
        }
      }

      // Process outbound rules
      for (let i = 0; i < (sg.IpPermissionsEgress?.length || 0); i++) {
        const perm = sg.IpPermissionsEgress![i]

        for (const ipRange of perm.IpRanges || []) {
          rules.push({
            id: `outbound-${i}-${ipRange.CidrIp}`,
            direction: "outbound",
            protocol: formatProtocol(perm.IpProtocol),
            portRange: formatPortRange(perm.FromPort, perm.ToPort, perm.IpProtocol),
            source: ipRange.CidrIp || "Unknown",
            description: ipRange.Description || "",
            riskLevel: "low",
            awsRule: { ...perm, targetCidr: ipRange.CidrIp },
          })
        }
      }

      securityGroups.push({
        id: sg.GroupId || "",
        name: sg.GroupName || "",
        vpcId: sg.VpcId || "",
        description: sg.Description || "",
        rules,
        attachedResources: instanceSGMap[sg.GroupId || ""] || [],
        totalRules: rules.length,
        riskScore: Math.min(100, riskScore),
      })
    }

    // Sort by risk score (highest first)
    securityGroups.sort((a, b) => b.riskScore - a.riskScore)

    return NextResponse.json({
      success: true,
      securityGroups,
      count: securityGroups.length,
      source: "aws",
    })
  } catch (error: any) {
    console.error("[AWS Security Groups] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to fetch security groups",
    })
  }
}
