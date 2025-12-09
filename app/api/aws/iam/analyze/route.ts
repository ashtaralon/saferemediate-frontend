// Analyze IAM Role - Find unused permissions using CloudTrail
// This is the CORE of Least Privilege analysis

import { NextResponse } from "next/server"
import {
  IAMClient,
  GetRolePolicyCommand,
  ListRolePoliciesCommand,
  ListAttachedRolePoliciesCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
} from "@aws-sdk/client-iam"
import {
  CloudTrailClient,
  LookupEventsCommand,
} from "@aws-sdk/client-cloudtrail"

export const dynamic = "force-dynamic"

const getClients = () => {
  const config = {
    region: process.env.AWS_REGION || "eu-west-1",
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        }
      : undefined,
  }
  return {
    iam: new IAMClient(config),
    cloudtrail: new CloudTrailClient(config),
  }
}

// Extract all permissions from a role
async function getRolePermissions(iam: IAMClient, roleName: string): Promise<string[]> {
  const permissions: string[] = []

  // Get inline policies
  try {
    const inlinePolicies = await iam.send(new ListRolePoliciesCommand({ RoleName: roleName }))
    for (const policyName of inlinePolicies.PolicyNames || []) {
      const policy = await iam.send(new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName }))
      if (policy.PolicyDocument) {
        const doc = JSON.parse(decodeURIComponent(policy.PolicyDocument))
        extractActionsFromPolicy(doc, permissions)
      }
    }
  } catch (e) {
    console.error("Error getting inline policies:", e)
  }

  // Get attached managed policies
  try {
    const attachedPolicies = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }))
    for (const policy of attachedPolicies.AttachedPolicies || []) {
      if (policy.PolicyArn) {
        try {
          const policyDetails = await iam.send(new GetPolicyCommand({ PolicyArn: policy.PolicyArn }))
          if (policyDetails.Policy?.DefaultVersionId) {
            const version = await iam.send(new GetPolicyVersionCommand({
              PolicyArn: policy.PolicyArn,
              VersionId: policyDetails.Policy.DefaultVersionId,
            }))
            if (version.PolicyVersion?.Document) {
              const doc = JSON.parse(decodeURIComponent(version.PolicyVersion.Document))
              extractActionsFromPolicy(doc, permissions)
            }
          }
        } catch (e) {
          // Skip AWS managed policies we can't read
        }
      }
    }
  } catch (e) {
    console.error("Error getting attached policies:", e)
  }

  return [...new Set(permissions)]
}

function extractActionsFromPolicy(doc: any, permissions: string[]) {
  const statements = Array.isArray(doc.Statement) ? doc.Statement : [doc.Statement]
  for (const stmt of statements) {
    if (stmt.Effect === "Allow" && stmt.Action) {
      const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action]
      permissions.push(...actions)
    }
  }
}

// Get actually used actions from CloudTrail (last 90 days)
async function getUsedActions(cloudtrail: CloudTrailClient, roleName: string): Promise<string[]> {
  const usedActions: Set<string> = new Set()

  try {
    // Look back 90 days (max CloudTrail lookup)
    const startTime = new Date()
    startTime.setDate(startTime.getDate() - 90)

    let nextToken: string | undefined
    do {
      const response = await cloudtrail.send(new LookupEventsCommand({
        StartTime: startTime,
        EndTime: new Date(),
        LookupAttributes: [
          {
            AttributeKey: "Username",
            AttributeValue: roleName,
          },
        ],
        MaxResults: 50,
        NextToken: nextToken,
      }))

      for (const event of response.Events || []) {
        if (event.EventName && event.EventSource) {
          // Convert EventSource (e.g., "ec2.amazonaws.com") to service prefix (e.g., "ec2")
          const service = event.EventSource.split(".")[0]
          usedActions.add(`${service}:${event.EventName}`)
        }
      }

      nextToken = response.NextToken
    } while (nextToken)
  } catch (e) {
    console.error("Error querying CloudTrail:", e)
  }

  return [...usedActions]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const roleName = searchParams.get("roleName")

  if (!roleName) {
    return NextResponse.json({
      success: false,
      error: "roleName query parameter is required",
    })
  }

  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    return NextResponse.json({
      success: false,
      error: "AWS credentials not configured",
      configured: false,
    })
  }

  try {
    const { iam, cloudtrail } = getClients()

    // Get all allowed permissions from the role
    const allowedActions = await getRolePermissions(iam, roleName)

    // Get actually used actions from CloudTrail
    const usedActions = await getUsedActions(cloudtrail, roleName)

    // Calculate unused (the GAP)
    const unusedActions = allowedActions.filter(
      (action) => !usedActions.some((used) => {
        // Handle wildcards like "s3:*"
        if (action.includes("*")) {
          const pattern = action.replace(/\*/g, ".*")
          return new RegExp(`^${pattern}$`).test(used)
        }
        return action === used
      })
    )

    const gapPercent = allowedActions.length > 0
      ? Math.round((unusedActions.length / allowedActions.length) * 100)
      : 0

    return NextResponse.json({
      success: true,
      role_name: roleName,
      allowed_actions: allowedActions.length,
      used_actions: usedActions.length,
      unused_actions: unusedActions.length,
      gap_percent: gapPercent,
      allowed_actions_list: allowedActions,
      used_actions_list: usedActions,
      unused_actions_list: unusedActions,
      observation_period: "90 days",
      confidence: unusedActions.length > 0 ? 99 : 100,
      source: "aws",
    })
  } catch (error: any) {
    console.error("[AWS IAM Analyze] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to analyze role",
    })
  }
}
