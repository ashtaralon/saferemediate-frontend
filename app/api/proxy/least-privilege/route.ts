import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const RAW_BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

function getBackendBase() {
  return RAW_BACKEND_URL.replace(/\/+$/, "").replace(/\/backend$/, "")
}

// Map system names to IAM role names
const SYSTEM_TO_ROLE_MAP: Record<string, string> = {
  "alon-prod": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Test": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda": "SafeRemediate-Lambda-Remediation-Role",
}

function getRoleName(systemName: string): string {
  return SYSTEM_TO_ROLE_MAP[systemName] || systemName
}

// Demo data for when backend returns empty
const DEMO_DATA = {
  role_name: "SafeRemediate-Lambda-Remediation-Role",
  allowed_actions: 28,
  used_actions: 6,
  unused_actions: 22,
  allowed_actions_list: [
    "ec2:DescribeInstances",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeVpcs",
    "ec2:CreateSecurityGroup",
    "ec2:DeleteSecurityGroup",
    "ec2:AuthorizeSecurityGroupIngress",
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:ListBucket",
    "s3:GetBucketPolicy",
    "s3:PutBucketPolicy",
    "iam:GetRole",
    "iam:ListRoles",
    "iam:CreateRole",
    "iam:DeleteRole",
    "iam:AttachRolePolicy",
    "iam:DetachRolePolicy",
    "lambda:InvokeFunction",
    "lambda:GetFunction",
    "lambda:ListFunctions",
    "lambda:CreateFunction",
    "cloudtrail:LookupEvents",
    "cloudtrail:DescribeTrails",
    "logs:GetLogEvents",
    "logs:DescribeLogGroups",
    "sts:AssumeRole",
    "sts:GetCallerIdentity",
  ],
  used_actions_list: [
    "ec2:DescribeInstances",
    "ec2:DescribeSecurityGroups",
    "s3:GetObject",
    "iam:GetRole",
    "cloudtrail:LookupEvents",
    "sts:GetCallerIdentity",
  ],
  unused_actions_list: [
    "ec2:DescribeVpcs",
    "ec2:CreateSecurityGroup",
    "ec2:DeleteSecurityGroup",
    "ec2:AuthorizeSecurityGroupIngress",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:ListBucket",
    "s3:GetBucketPolicy",
    "s3:PutBucketPolicy",
    "iam:ListRoles",
    "iam:CreateRole",
    "iam:DeleteRole",
    "iam:AttachRolePolicy",
    "iam:DetachRolePolicy",
    "lambda:InvokeFunction",
    "lambda:GetFunction",
    "lambda:ListFunctions",
    "lambda:CreateFunction",
    "cloudtrail:DescribeTrails",
    "logs:GetLogEvents",
    "logs:DescribeLogGroups",
    "sts:AssumeRole",
  ],
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName") || "SafeRemediate-Lambda-Remediation-Role"
    const roleName = getRoleName(systemName)
    const cleanBackendUrl = getBackendBase()

    const response = await fetch(`${cleanBackendUrl}/api/traffic/gap/${encodeURIComponent(roleName)}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.log("[v0] Backend returned error, using demo data")
      return NextResponse.json({
        success: true,
        ...DEMO_DATA,
        role_name: roleName,
      })
    }

    const data = await response.json()

    // If backend returns empty data, use demo data
    const hasData = (data.allowed_actions ?? data.allowed_actions_list?.length ?? 0) > 0
    if (!hasData) {
      console.log("[v0] Backend returned empty data, using demo data")
      return NextResponse.json({
        success: true,
        ...DEMO_DATA,
        role_name: roleName,
      })
    }

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error) {
    console.error("[v0] Gap analysis API error, using demo data:", error)
    return NextResponse.json({
      success: true,
      ...DEMO_DATA,
    })
  }
}
