// REAL IAM Remediation - Actually removes permissions from AWS
// This modifies your AWS account - use with caution!

import { NextResponse } from "next/server"
import {
  IAMClient,
  GetRolePolicyCommand,
  PutRolePolicyCommand,
  ListRolePoliciesCommand,
  DeleteRolePolicyCommand,
} from "@aws-sdk/client-iam"

export const dynamic = "force-dynamic"

const getIAMClient = () => {
  return new IAMClient({
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
    const { roleName, permission, action, permissions } = body

    if (!roleName) {
      return NextResponse.json({ success: false, error: "roleName is required" })
    }

    const client = getIAMClient()
    const results: any[] = []

    // Handle single permission or array
    const permissionsToRemove = permissions || (permission ? [permission] : [])

    if (permissionsToRemove.length === 0) {
      return NextResponse.json({ success: false, error: "No permissions specified to remove" })
    }

    // Get all inline policies for this role
    const inlinePolicies = await client.send(new ListRolePoliciesCommand({ RoleName: roleName }))

    for (const policyName of inlinePolicies.PolicyNames || []) {
      try {
        // Get current policy document
        const policyResponse = await client.send(
          new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
        )

        if (!policyResponse.PolicyDocument) continue

        const policyDoc = JSON.parse(decodeURIComponent(policyResponse.PolicyDocument))
        let modified = false

        // Process each statement
        const newStatements = []
        for (const stmt of policyDoc.Statement || []) {
          if (stmt.Effect !== "Allow" || !stmt.Action) {
            newStatements.push(stmt)
            continue
          }

          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action]
          const remainingActions = actions.filter(
            (a: string) => !permissionsToRemove.includes(a)
          )

          if (remainingActions.length === 0) {
            // All actions removed from this statement - skip it entirely
            modified = true
            results.push({
              policy: policyName,
              statement: "removed",
              actionsRemoved: actions,
            })
          } else if (remainingActions.length < actions.length) {
            // Some actions removed
            modified = true
            stmt.Action = remainingActions.length === 1 ? remainingActions[0] : remainingActions
            newStatements.push(stmt)
            results.push({
              policy: policyName,
              actionsRemoved: actions.filter((a: string) => !remainingActions.includes(a)),
              actionsRemaining: remainingActions,
            })
          } else {
            newStatements.push(stmt)
          }
        }

        if (modified) {
          if (newStatements.length === 0) {
            // No statements left - delete the policy entirely
            await client.send(
              new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
            )
            results.push({
              policy: policyName,
              action: "deleted",
              reason: "No statements remaining after remediation",
            })
          } else {
            // Update the policy with remaining statements
            policyDoc.Statement = newStatements
            await client.send(
              new PutRolePolicyCommand({
                RoleName: roleName,
                PolicyName: policyName,
                PolicyDocument: JSON.stringify(policyDoc),
              })
            )
            results.push({
              policy: policyName,
              action: "updated",
              statementsRemaining: newStatements.length,
            })
          }
        }
      } catch (e: any) {
        results.push({
          policy: policyName,
          error: e.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      roleName,
      permissionsRemoved: permissionsToRemove,
      results,
      message: `Removed ${permissionsToRemove.length} permission(s) from ${roleName}`,
      source: "aws",
      // Important: Tell user to verify in AWS Console
      verifyUrl: `https://${process.env.AWS_REGION || "eu-west-1"}.console.aws.amazon.com/iam/home#/roles/${roleName}`,
    })
  } catch (error: any) {
    console.error("[AWS IAM Remediate] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to remediate",
    })
  }
}
