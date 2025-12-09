// Real AWS IAM Roles API - Fetches actual roles from your AWS account
// Install: npm install @aws-sdk/client-iam

import { NextResponse } from "next/server"
import {
  IAMClient,
  ListRolesCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  GetRolePolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
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

interface RoleWithPolicies {
  roleName: string
  roleArn: string
  createDate: string
  description?: string
  attachedPolicies: string[]
  inlinePolicies: string[]
  allPermissions: string[]
}

export async function GET() {
  // Check if AWS is configured
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    return NextResponse.json({
      success: false,
      error: "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local",
      configured: false,
    })
  }

  try {
    const client = getIAMClient()
    const roles: RoleWithPolicies[] = []

    // List all IAM roles
    const listRolesResponse = await client.send(new ListRolesCommand({ MaxItems: 100 }))

    for (const role of listRolesResponse.Roles || []) {
      if (!role.RoleName) continue

      const roleData: RoleWithPolicies = {
        roleName: role.RoleName,
        roleArn: role.Arn || "",
        createDate: role.CreateDate?.toISOString() || "",
        description: role.Description,
        attachedPolicies: [],
        inlinePolicies: [],
        allPermissions: [],
      }

      // Get attached managed policies
      try {
        const attachedPolicies = await client.send(
          new ListAttachedRolePoliciesCommand({ RoleName: role.RoleName })
        )

        for (const policy of attachedPolicies.AttachedPolicies || []) {
          if (policy.PolicyName) {
            roleData.attachedPolicies.push(policy.PolicyName)
          }

          // Get policy document to extract permissions
          if (policy.PolicyArn) {
            try {
              const policyDetails = await client.send(
                new GetPolicyCommand({ PolicyArn: policy.PolicyArn })
              )

              if (policyDetails.Policy?.DefaultVersionId) {
                const policyVersion = await client.send(
                  new GetPolicyVersionCommand({
                    PolicyArn: policy.PolicyArn,
                    VersionId: policyDetails.Policy.DefaultVersionId,
                  })
                )

                if (policyVersion.PolicyVersion?.Document) {
                  const doc = JSON.parse(decodeURIComponent(policyVersion.PolicyVersion.Document))
                  const statements = Array.isArray(doc.Statement) ? doc.Statement : [doc.Statement]

                  for (const stmt of statements) {
                    if (stmt.Effect === "Allow" && stmt.Action) {
                      const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action]
                      roleData.allPermissions.push(...actions)
                    }
                  }
                }
              }
            } catch (e) {
              // Skip policies we can't read (AWS managed policies with restrictions)
            }
          }
        }
      } catch (e) {
        console.error(`Error getting attached policies for ${role.RoleName}:`, e)
      }

      // Get inline policies
      try {
        const inlinePolicies = await client.send(
          new ListRolePoliciesCommand({ RoleName: role.RoleName })
        )

        for (const policyName of inlinePolicies.PolicyNames || []) {
          roleData.inlinePolicies.push(policyName)

          // Get inline policy document
          try {
            const policyDoc = await client.send(
              new GetRolePolicyCommand({
                RoleName: role.RoleName,
                PolicyName: policyName,
              })
            )

            if (policyDoc.PolicyDocument) {
              const doc = JSON.parse(decodeURIComponent(policyDoc.PolicyDocument))
              const statements = Array.isArray(doc.Statement) ? doc.Statement : [doc.Statement]

              for (const stmt of statements) {
                if (stmt.Effect === "Allow" && stmt.Action) {
                  const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action]
                  roleData.allPermissions.push(...actions)
                }
              }
            }
          } catch (e) {
            console.error(`Error getting inline policy ${policyName}:`, e)
          }
        }
      } catch (e) {
        console.error(`Error getting inline policies for ${role.RoleName}:`, e)
      }

      // Deduplicate permissions
      roleData.allPermissions = [...new Set(roleData.allPermissions)]
      roles.push(roleData)
    }

    return NextResponse.json({
      success: true,
      roles,
      count: roles.length,
      source: "aws",
    })
  } catch (error: any) {
    console.error("[AWS IAM] Error fetching roles:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to fetch IAM roles",
      code: error.Code || error.name,
    })
  }
}
