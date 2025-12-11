import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// Map system names to IAM role names
// TODO: In production, this should come from a database or backend API
const SYSTEM_TO_ROLE_MAP: Record<string, string> = {
  "alon-prod": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Test": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda": "SafeRemediate-Lambda-Remediation-Role",
}

function getRoleName(systemName: string): string {
  // Check if we have a mapping, otherwise use the systemName as-is
  return SYSTEM_TO_ROLE_MAP[systemName] || systemName
}

// Demo fallback data when backend is unavailable
function getDemoData(systemName: string) {
  return {
    success: true,
    roles: [
      {
        roleName: "SafeRemediate-Lambda-Remediation-Role",
        roleArn: "arn:aws:iam::123456789012:role/SafeRemediate-Lambda-Remediation-Role",
        allowed: 28,
        used: 6,
        unused: 22,
        gapPercent: 78.57,
        confidence: 95,
        allowed_actions_list: [
          "iam:GetUser", "iam:ListUsers", "iam:CreateUser", "iam:DeleteUser", "iam:UpdateUser",
          "iam:AttachUserPolicy", "iam:DetachUserPolicy", "iam:ListAttachedUserPolicies",
          "iam:GetRole", "iam:ListRoles", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
          "iam:GetPolicy", "iam:ListPolicies", "iam:CreatePolicy", "iam:DeletePolicy", "iam:UpdatePolicy",
          "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
          "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
        ],
        used_actions_list: [
          "iam:GetUser", "iam:ListUsers", "s3:GetObject", "s3:PutObject", "s3:ListBucket", "iam:GetRole",
        ],
        unused_actions_list: [
          "iam:CreateUser", "iam:DeleteUser", "iam:UpdateUser", "iam:AttachUserPolicy", "iam:DetachUserPolicy",
          "iam:ListAttachedUserPolicies", "iam:ListRoles", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
          "iam:GetPolicy", "iam:ListPolicies", "iam:CreatePolicy", "iam:DeletePolicy", "iam:UpdatePolicy",
          "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags", "s3:DeleteObject",
        ],
      },
    ],
    issues: [
      {
        id: "least-privilege-1",
        resourceName: "SafeRemediate-Lambda-Remediation-Role",
        resourceType: "IAMRole",
        systemName: systemName,
        allowedCount: 28,
        usedCount: 6,
        unusedCount: 22,
        gapPercent: 78.57,
        confidence: 95,
        observationDays: 90,
        allowedList: [
          "iam:GetUser", "iam:ListUsers", "iam:CreateUser", "iam:DeleteUser", "iam:UpdateUser",
          "iam:AttachUserPolicy", "iam:DetachUserPolicy", "iam:ListAttachedUserPolicies",
          "iam:GetRole", "iam:ListRoles", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
          "iam:GetPolicy", "iam:ListPolicies", "iam:CreatePolicy", "iam:DeletePolicy", "iam:UpdatePolicy",
          "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
          "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
        ],
        usedList: [
          "iam:GetUser", "iam:ListUsers", "s3:GetObject", "s3:PutObject", "s3:ListBucket", "iam:GetRole",
        ],
        unusedList: [
          "iam:CreateUser", "iam:DeleteUser", "iam:UpdateUser", "iam:AttachUserPolicy", "iam:DetachUserPolicy",
          "iam:ListAttachedUserPolicies", "iam:ListRoles", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
          "iam:GetPolicy", "iam:ListPolicies", "iam:CreatePolicy", "iam:DeletePolicy", "iam:UpdatePolicy",
          "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags", "s3:DeleteObject",
        ],
      },
    ],
    mock: true,
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const res = await fetch(
      `${BACKEND_URL}/api/least-privilege?systemName=${encodeURIComponent(systemName)}`,
      {
        cache: "no-store",
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn(`[proxy] least-privilege backend returned ${res.status}, using fallback`)
      return NextResponse.json(getDemoData(systemName))
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] least-privilege error:", error.message)
    // Return demo data on any error
    return NextResponse.json(getDemoData(systemName))
  }
}
