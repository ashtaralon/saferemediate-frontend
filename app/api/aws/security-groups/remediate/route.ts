// REAL Security Group Remediation - Actually removes rules from AWS
// This modifies your AWS account - watch it happen in AWS Console!

import { NextResponse } from "next/server"
import {
  EC2Client,
  RevokeSecurityGroupIngressCommand,
  RevokeSecurityGroupEgressCommand,
  DescribeSecurityGroupsCommand,
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

export async function POST(request: Request) {
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    return NextResponse.json({
      success: false,
      error: "AWS credentials not configured",
    })
  }

  try {
    const body = await request.json()
    const { securityGroupId, ruleId, direction, protocol, portRange, source, awsRule } = body

    if (!securityGroupId) {
      return NextResponse.json({ success: false, error: "securityGroupId is required" })
    }

    const client = getEC2Client()

    // Parse port range
    let fromPort: number | undefined
    let toPort: number | undefined

    if (portRange && portRange !== "All") {
      if (portRange.includes("-")) {
        const [from, to] = portRange.split("-")
        fromPort = parseInt(from)
        toPort = parseInt(to)
      } else {
        fromPort = parseInt(portRange)
        toPort = fromPort
      }
    }

    // Convert protocol back to AWS format
    let ipProtocol = "-1" // All
    if (protocol === "TCP") ipProtocol = "tcp"
    else if (protocol === "UDP") ipProtocol = "udp"
    else if (protocol === "ICMP") ipProtocol = "icmp"

    // Build the IP permission to revoke
    const ipPermission: any = {
      IpProtocol: ipProtocol,
    }

    if (fromPort !== undefined) ipPermission.FromPort = fromPort
    if (toPort !== undefined) ipPermission.ToPort = toPort

    // Determine if source is CIDR or Security Group
    if (source.startsWith("sg-")) {
      ipPermission.UserIdGroupPairs = [{ GroupId: source }]
    } else {
      ipPermission.IpRanges = [{ CidrIp: source }]
    }

    let result

    if (direction === "inbound") {
      // Revoke inbound rule
      result = await client.send(new RevokeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [ipPermission],
      }))
    } else {
      // Revoke outbound rule
      result = await client.send(new RevokeSecurityGroupEgressCommand({
        GroupId: securityGroupId,
        IpPermissions: [ipPermission],
      }))
    }

    // Verify the rule was removed
    const verifyResponse = await client.send(new DescribeSecurityGroupsCommand({
      GroupIds: [securityGroupId],
    }))

    const sg = verifyResponse.SecurityGroups?.[0]
    const remainingRules = direction === "inbound"
      ? sg?.IpPermissions?.length || 0
      : sg?.IpPermissionsEgress?.length || 0

    return NextResponse.json({
      success: true,
      message: `Removed ${direction} rule from ${securityGroupId}`,
      ruleRemoved: {
        direction,
        protocol,
        portRange,
        source,
      },
      remainingRules,
      source: "aws",
      // AWS Console link to verify
      verifyUrl: `https://${process.env.AWS_REGION || "eu-west-1"}.console.aws.amazon.com/ec2/home?region=${process.env.AWS_REGION || "eu-west-1"}#SecurityGroup:groupId=${securityGroupId}`,
    })
  } catch (error: any) {
    console.error("[AWS SG Remediate] Error:", error)

    // Handle specific AWS errors
    if (error.Code === "InvalidPermission.NotFound") {
      return NextResponse.json({
        success: false,
        error: "Rule not found - it may have already been removed",
      })
    }

    return NextResponse.json({
      success: false,
      error: error.message || "Failed to remove security group rule",
      code: error.Code,
    })
  }
}

// Bulk remediation - remove multiple rules at once
export async function DELETE(request: Request) {
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    return NextResponse.json({
      success: false,
      error: "AWS credentials not configured",
    })
  }

  try {
    const body = await request.json()
    const { securityGroupId, rules } = body

    if (!securityGroupId || !rules || !Array.isArray(rules)) {
      return NextResponse.json({
        success: false,
        error: "securityGroupId and rules array are required",
      })
    }

    const client = getEC2Client()
    const results: any[] = []

    // Group rules by direction
    const inboundRules: any[] = []
    const outboundRules: any[] = []

    for (const rule of rules) {
      const ipPermission: any = {
        IpProtocol: rule.protocol === "All" ? "-1" : rule.protocol.toLowerCase(),
      }

      if (rule.portRange && rule.portRange !== "All") {
        if (rule.portRange.includes("-")) {
          const [from, to] = rule.portRange.split("-")
          ipPermission.FromPort = parseInt(from)
          ipPermission.ToPort = parseInt(to)
        } else {
          ipPermission.FromPort = parseInt(rule.portRange)
          ipPermission.ToPort = parseInt(rule.portRange)
        }
      }

      if (rule.source.startsWith("sg-")) {
        ipPermission.UserIdGroupPairs = [{ GroupId: rule.source }]
      } else {
        ipPermission.IpRanges = [{ CidrIp: rule.source }]
      }

      if (rule.direction === "inbound") {
        inboundRules.push(ipPermission)
      } else {
        outboundRules.push(ipPermission)
      }
    }

    // Revoke inbound rules
    if (inboundRules.length > 0) {
      try {
        await client.send(new RevokeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: inboundRules,
        }))
        results.push({ direction: "inbound", count: inboundRules.length, success: true })
      } catch (e: any) {
        results.push({ direction: "inbound", count: inboundRules.length, success: false, error: e.message })
      }
    }

    // Revoke outbound rules
    if (outboundRules.length > 0) {
      try {
        await client.send(new RevokeSecurityGroupEgressCommand({
          GroupId: securityGroupId,
          IpPermissions: outboundRules,
        }))
        results.push({ direction: "outbound", count: outboundRules.length, success: true })
      } catch (e: any) {
        results.push({ direction: "outbound", count: outboundRules.length, success: false, error: e.message })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Removed ${rules.length} rules from ${securityGroupId}`,
      results,
      source: "aws",
      verifyUrl: `https://${process.env.AWS_REGION || "eu-west-1"}.console.aws.amazon.com/ec2/home?region=${process.env.AWS_REGION || "eu-west-1"}#SecurityGroup:groupId=${securityGroupId}`,
    })
  } catch (error: any) {
    console.error("[AWS SG Bulk Remediate] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to remove security group rules",
    })
  }
}
