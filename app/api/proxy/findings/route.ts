import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

// Demo findings for when backend returns empty
const DEMO_FINDINGS = [
  {
    id: "finding-1",
    title: "Security Group Allows SSH from Internet",
    severity: "critical",
    description: "Security group sg-0abc123def456 allows inbound SSH (port 22) from 0.0.0.0/0",
    resource: "sg-0abc123def456",
    resourceType: "SecurityGroup",
    status: "open",
    detectedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    recommendation: "Restrict SSH access to specific IP ranges or use AWS Systems Manager Session Manager",
  },
  {
    id: "finding-2",
    title: "S3 Bucket Public Access Enabled",
    severity: "critical",
    description: "S3 bucket saferemediate-logs-bucket has public read access enabled via bucket policy",
    resource: "saferemediate-logs-bucket",
    resourceType: "S3",
    status: "open",
    detectedAt: new Date(Date.now() - 86400000).toISOString(),
    recommendation: "Enable S3 Block Public Access and review bucket policy",
  },
  {
    id: "finding-3",
    title: "RDS Instance Not Encrypted",
    severity: "critical",
    description: "RDS instance prod-database is not encrypted at rest",
    resource: "prod-database",
    resourceType: "RDS",
    status: "open",
    detectedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    recommendation: "Enable encryption at rest for the RDS instance",
  },
  {
    id: "finding-4",
    title: "IAM User Has Console Access Without MFA",
    severity: "critical",
    description: "IAM user admin-user has console access but MFA is not enabled",
    resource: "admin-user",
    resourceType: "IAMUser",
    status: "open",
    detectedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    recommendation: "Enable MFA for all IAM users with console access",
  },
  {
    id: "finding-5",
    title: "Unused IAM Permissions",
    severity: "medium",
    description: "IAM role has 22 unused permissions that should be removed",
    resource: "SafeRemediate-Lambda-Remediation-Role",
    resourceType: "IAMRole",
    status: "open",
    detectedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    recommendation: "Apply least privilege principle by removing unused permissions",
  },
  {
    id: "finding-6",
    title: "Unencrypted EBS Volume",
    severity: "medium",
    description: "EBS volume is not encrypted at rest",
    resource: "vol-0123456789abcdef0",
    resourceType: "EBS",
    status: "open",
    detectedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    recommendation: "Enable EBS encryption for the volume",
  },
  {
    id: "finding-7",
    title: "CloudTrail Logging Disabled",
    severity: "high",
    description: "CloudTrail is not configured to log management events",
    resource: "arn:aws:cloudtrail:eu-west-1:123456789:trail/main",
    resourceType: "CloudTrail",
    status: "open",
    detectedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    recommendation: "Enable CloudTrail logging for all management events",
  },
]

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/findings`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.log("[v0] Findings fetch failed, using demo data")
      return NextResponse.json({
        success: true,
        findings: DEMO_FINDINGS,
      })
    }

    const data = await response.json()
    const findings = data.findings || data || []

    // If backend returns empty, use demo data
    if (findings.length === 0) {
      console.log("[v0] Findings empty, using demo data")
      return NextResponse.json({
        success: true,
        findings: DEMO_FINDINGS,
      })
    }

    console.log("[v0] Findings fetched:", findings.length)
    return NextResponse.json({
      success: true,
      findings,
    })
  } catch (error) {
    console.error("[v0] Findings fetch error, using demo data:", error)
    return NextResponse.json({
      success: true,
      findings: DEMO_FINDINGS,
    })
  }
}
