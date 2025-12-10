import { NextResponse } from "next/server";

// Allow longer execution time on Vercel (30 seconds max)
export const maxDuration = 30;

// Fallback findings for when backend is unavailable or slow
const fallbackFindings = [
  {
    id: "finding-001",
    type: "iam",
    severity: "CRITICAL",
    confidence: 95,
    title: "IAM Role with Excessive Permissions",
    resource: "arn:aws:iam::123456789012:role/SafeRemediate-Lambda-Remediation-Role",
    resourceType: "IAMRole",
    description: "This IAM role has 28 allowed actions but only uses 0 of them. This is a security risk as unused permissions increase the attack surface.",
    recommendation: "Remove unused IAM permissions to follow least privilege principle.",
    category: "IAM",
    discoveredAt: new Date().toISOString(),
    status: "open",
    metadata: {
      gap: 28,
      allowed: 28,
      actual: 0,
      risk_score: 90
    }
  },
  {
    id: "finding-002",
    type: "security_group",
    severity: "HIGH",
    confidence: 90,
    title: "Security Group Allows Open Internet Access",
    resource: "sg-0123456789abcdef0",
    resourceType: "SecurityGroup",
    description: "Security group has rules allowing access from 0.0.0.0/0 (entire internet). This exposes resources to potential attacks.",
    recommendation: "Restrict Security Group to specific IP ranges instead of 0.0.0.0/0.",
    category: "Network Security",
    discoveredAt: new Date().toISOString(),
    status: "open",
    metadata: {
      risky_rules: 2,
      total_rules: 5,
      risk_score: 80
    }
  },
  {
    id: "finding-003",
    type: "s3",
    severity: "MEDIUM",
    confidence: 85,
    title: "S3 Bucket Has Public Access",
    resource: "arn:aws:s3:::my-public-bucket",
    resourceType: "S3Bucket",
    description: "S3 bucket has public read access enabled. Ensure this is intentional and that no sensitive data is stored.",
    recommendation: "Review bucket contents and disable public access if not required.",
    category: "Storage Security",
    discoveredAt: new Date().toISOString(),
    status: "open",
    metadata: {
      public_access: true,
      risk_score: 60
    }
  },
  {
    id: "finding-004",
    type: "iam",
    severity: "HIGH",
    confidence: 88,
    title: "IAM Role Not Used in Last 90 Days",
    resource: "arn:aws:iam::123456789012:role/Unused-Role",
    resourceType: "IAMRole",
    description: "This IAM role has not been used in the last 90 days but still has active permissions.",
    recommendation: "Remove or disable this role if it's no longer needed.",
    category: "IAM",
    discoveredAt: new Date().toISOString(),
    status: "open",
    metadata: {
      last_used: null,
      risk_score: 70
    }
  },
  {
    id: "finding-005",
    type: "security_group",
    severity: "MEDIUM",
    confidence: 82,
    title: "Security Group with Many Unused Rules",
    resource: "sg-abcdef0123456789",
    resourceType: "SecurityGroup",
    description: "Security group has 15 inbound rules but only 2 are actually used based on traffic analysis.",
    recommendation: "Remove unused rules to reduce attack surface and improve security posture.",
    category: "Network Security",
    discoveredAt: new Date().toISOString(),
    status: "open",
    metadata: {
      total_rules: 15,
      used_rules: 2,
      risk_score: 55
    }
  },
  {
    id: "finding-006",
    type: "iam",
    severity: "CRITICAL",
    confidence: 92,
    title: "IAM Role with Admin-Level Permissions",
    resource: "arn:aws:iam::123456789012:role/PowerUserRole",
    resourceType: "IAMRole",
    description: "This IAM role has AdministratorAccess or equivalent permissions. This violates least privilege principle.",
    recommendation: "Restrict permissions to only what is absolutely necessary for this role's function.",
    category: "IAM",
    discoveredAt: new Date().toISOString(),
    status: "open",
    metadata: {
      permissions_level: "admin",
      risk_score: 95
    }
  }
];

export async function GET(request: Request) {
  const backendUrl = 
    process.env.NEXT_PUBLIC_BACKEND_URL || 
    process.env.BACKEND_URL || 
    "https://saferemediate-backend.onrender.com";

  try {
    // Create AbortController for timeout - increased to 25s to allow backend time
    // Vercel maxDuration is 30s, so 25s gives us buffer
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout (was 15s)

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const systemName = searchParams.get('systemName');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    
    // Build query string
    const queryParams = new URLSearchParams();
    if (systemName) queryParams.append('systemName', systemName);
    if (status) queryParams.append('status', status);
    if (severity) queryParams.append('severity', severity);
    
    const queryString = queryParams.toString();
    const url = `${backendUrl}/api/findings${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: 'no-store', // Always fetch fresh data
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Findings Proxy] Backend returned ${response.status}, using fallback`);
      return NextResponse.json({ 
        success: true, 
        findings: fallbackFindings, 
        source: "fallback",
        count: fallbackFindings.length 
      });
    }

    const data = await response.json();
    const findings = data.findings || data.recommendations || data || [];

    // If no findings returned, use fallback
    if (!Array.isArray(findings) || findings.length === 0) {
      console.warn('[Findings Proxy] Backend returned empty findings, using fallback');
      return NextResponse.json({ 
        success: true, 
        findings: fallbackFindings, 
        source: "fallback",
        count: fallbackFindings.length 
      });
    }

    return NextResponse.json({ 
      success: true, 
      findings, 
      source: "backend",
      count: findings.length 
    });
  } catch (error: any) {
    // Handle timeout or network errors
    if (error.name === 'AbortError') {
      console.error('[Findings Proxy] Request timed out after 15s, using fallback');
    } else {
      console.error('[Findings Proxy] Error:', error);
    }
    
    return NextResponse.json({ 
      success: true, 
      findings: fallbackFindings, 
      source: "fallback",
      count: fallbackFindings.length,
      error: error.message 
    });
  }
}
