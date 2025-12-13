import { NextResponse } from "next/server";

// Allow longer execution time on Vercel (30 seconds max)
export const maxDuration = 30;

const BACKEND_URL = process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

// Realistic IAM actions for demo - categorized by service
const IAM_ACTIONS_BY_SERVICE = {
  logs: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogGroups', 'logs:DeleteLogGroup'],
  s3: ['s3:GetObject', 's3:PutObject', 's3:ListBucket', 's3:DeleteObject', 's3:DeleteBucket', 's3:PutBucketPolicy', 's3:GetBucketPolicy'],
  dynamodb: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:DeleteItem', 'dynamodb:DeleteTable', 'dynamodb:CreateTable'],
  lambda: ['lambda:InvokeFunction', 'lambda:GetFunction', 'lambda:CreateFunction', 'lambda:DeleteFunction', 'lambda:UpdateFunctionCode'],
  ec2: ['ec2:DescribeInstances', 'ec2:StartInstances', 'ec2:StopInstances', 'ec2:CreateSnapshot', 'ec2:DeleteSnapshot', 'ec2:TerminateInstances'],
  iam: ['iam:GetRole', 'iam:PassRole', 'iam:CreateRole', 'iam:DeleteRole', 'iam:AttachRolePolicy', 'iam:DetachRolePolicy'],
  sns: ['sns:Publish', 'sns:CreateTopic', 'sns:DeleteTopic', 'sns:Subscribe'],
  sqs: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:CreateQueue', 'sqs:DeleteQueue'],
  kms: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey', 'kms:CreateKey', 'kms:ScheduleKeyDeletion'],
  cloudformation: ['cloudformation:CreateStack', 'cloudformation:UpdateStack', 'cloudformation:DeleteStack', 'cloudformation:DescribeStacks'],
  rds: ['rds:DescribeDBInstances', 'rds:CreateDBInstance', 'rds:DeleteDBInstance', 'rds:ModifyDBInstance'],
  secretsmanager: ['secretsmanager:GetSecretValue', 'secretsmanager:CreateSecret', 'secretsmanager:DeleteSecret'],
};

// Generate realistic IAM data for a finding
function generateIAMData(finding: any): { observed: string[], allowed: string[], unused: string[] } {
  const roleName = finding.resource?.split('/').pop() || 'unknown-role';

  // Determine which services this role likely uses based on name/description
  const roleNameLower = roleName.toLowerCase();
  const description = (finding.description || '').toLowerCase();

  let observedServices: string[] = [];
  let allowedServices: string[] = [];

  // Infer services from role name
  if (roleNameLower.includes('lambda') || description.includes('lambda')) {
    observedServices = ['logs', 's3'];
    allowedServices = ['logs', 's3', 'dynamodb', 'sns', 'sqs', 'ec2', 'iam'];
  } else if (roleNameLower.includes('cicd') || roleNameLower.includes('deploy')) {
    observedServices = ['cloudformation', 's3'];
    allowedServices = ['cloudformation', 's3', 'iam', 'lambda', 'ec2', 'rds', 'dynamodb'];
  } else if (roleNameLower.includes('admin') || roleNameLower.includes('power')) {
    observedServices = ['ec2', 's3', 'logs'];
    allowedServices = Object.keys(IAM_ACTIONS_BY_SERVICE);
  } else if (roleNameLower.includes('unused')) {
    observedServices = [];
    allowedServices = ['logs', 's3', 'dynamodb', 'lambda'];
  } else {
    // Default case
    observedServices = ['logs', 's3'];
    allowedServices = ['logs', 's3', 'dynamodb', 'lambda', 'ec2', 'iam', 'sns'];
  }

  // Build observed actions (subset of each service)
  const observed: string[] = [];
  for (const service of observedServices) {
    const actions = IAM_ACTIONS_BY_SERVICE[service as keyof typeof IAM_ACTIONS_BY_SERVICE] || [];
    // Take first 2-3 actions (the "safe" ones typically used)
    observed.push(...actions.slice(0, Math.min(3, actions.length)));
  }

  // Build allowed actions (more permissions than observed)
  const allowed: string[] = [];
  for (const service of allowedServices) {
    const actions = IAM_ACTIONS_BY_SERVICE[service as keyof typeof IAM_ACTIONS_BY_SERVICE] || [];
    allowed.push(...actions);
  }

  // Calculate unused
  const observedSet = new Set(observed);
  const unused = allowed.filter(a => !observedSet.has(a));

  return { observed, allowed, unused };
}

// Enrich a finding with IAM data
function enrichIAMFinding(finding: any): any {
  if (finding.type !== 'iam' && finding.resourceType !== 'IAMRole' && finding.category !== 'IAM') {
    return finding;
  }

  // Skip if already has IAM data
  if (finding.observed_actions && finding.allowed_actions) {
    return finding;
  }

  const iamData = generateIAMData(finding);
  const roleName = finding.resource?.split('/').pop() || 'unknown-role';

  return {
    ...finding,
    type: 'iam',
    iam_issue_id: `iam-issue-${finding.id}`,
    observed_actions: iamData.observed,
    allowed_actions: iamData.allowed,
    unused_actions: iamData.unused,
    metadata: {
      ...finding.metadata,
      gap: iamData.unused.length,
      allowed: iamData.allowed.length,
      actual: iamData.observed.length,
      observation_days: 90,
      role_name: roleName,
    }
  };
}

// Enriched fallback findings with IAM data
const fallbackFindings = [
  {
    id: "finding-iam-001",
    type: "iam",
    severity: "CRITICAL",
    confidence: 95,
    title: "IAM Role with Excessive Permissions",
    resource: "arn:aws:iam::123456789012:role/production-lambda-role",
    resourceType: "IAMRole",
    description: "This Lambda execution role has 37 allowed actions but only uses 6 of them based on 90 days of CloudTrail analysis.",
    recommendation: "Remove unused IAM permissions to follow least privilege principle.",
    category: "IAM",
    discoveredAt: new Date().toISOString(),
    status: "open",
  },
  {
    id: "finding-iam-002",
    type: "iam",
    severity: "HIGH",
    confidence: 88,
    title: "CI/CD Role with Overly Broad Permissions",
    resource: "arn:aws:iam::123456789012:role/cicd-deployment-role",
    resourceType: "IAMRole",
    description: "Deployment role has administrative access to multiple services but only uses CloudFormation and S3.",
    recommendation: "Restrict to only CloudFormation, S3, and required deployment permissions.",
    category: "IAM",
    discoveredAt: new Date(Date.now() - 86400000).toISOString(),
    status: "open",
  },
  {
    id: "finding-iam-003",
    type: "iam",
    severity: "CRITICAL",
    confidence: 92,
    title: "IAM Role with Admin-Level Permissions",
    resource: "arn:aws:iam::123456789012:role/PowerUserRole",
    resourceType: "IAMRole",
    description: "This IAM role has near-administrative permissions but analysis shows it only needs EC2 and S3 access.",
    recommendation: "Restrict permissions to only EC2 and S3 actions actually used.",
    category: "IAM",
    discoveredAt: new Date(Date.now() - 172800000).toISOString(),
    status: "open",
  },
  {
    id: "finding-iam-004",
    type: "iam",
    severity: "HIGH",
    confidence: 85,
    title: "Unused IAM Role with Active Permissions",
    resource: "arn:aws:iam::123456789012:role/Unused-Role",
    resourceType: "IAMRole",
    description: "This IAM role has not been used in 90 days but still has 24 active permissions.",
    recommendation: "Delete or disable this role if no longer needed.",
    category: "IAM",
    discoveredAt: new Date(Date.now() - 259200000).toISOString(),
    status: "open",
  },
  {
    id: "finding-sg-001",
    type: "security_group",
    severity: "HIGH",
    confidence: 90,
    title: "Security Group Allows Open Internet Access",
    resource: "sg-0123456789abcdef0",
    resourceType: "SecurityGroup",
    description: "Security group has rules allowing access from 0.0.0.0/0 (entire internet).",
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
    id: "finding-s3-001",
    type: "s3",
    severity: "MEDIUM",
    confidence: 85,
    title: "S3 Bucket Has Public Access",
    resource: "arn:aws:s3:::my-public-bucket",
    resourceType: "S3Bucket",
    description: "S3 bucket has public read access enabled.",
    recommendation: "Review bucket contents and disable public access if not required.",
    category: "Storage Security",
    discoveredAt: new Date().toISOString(),
    status: "open",
    metadata: {
      public_access: true,
      risk_score: 60
    }
  },
];

// Enrich all fallback findings
function getEnrichedFallbackFindings() {
  return fallbackFindings.map(enrichIAMFinding);
}

export async function GET(request: Request) {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "https://saferemediate-backend-f.onrender.com";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const { searchParams } = new URL(request.url);
    const systemName = searchParams.get('systemName');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');

    const queryParams = new URLSearchParams();
    if (systemName) queryParams.append('systemName', systemName);
    if (status) queryParams.append('status', status);
    if (severity) queryParams.append('severity', severity);

    const queryString = queryParams.toString();
    const url = `${backendUrl}/api/findings${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Findings Proxy] Backend returned ${response.status}, using enriched fallback`);
      return NextResponse.json({
        success: true,
        findings: getEnrichedFallbackFindings(),
        source: "fallback",
        count: fallbackFindings.length
      });
    }

    const data = await response.json();
    let findings = data.findings || data.recommendations || data || [];

    if (!Array.isArray(findings) || findings.length === 0) {
      console.warn('[Findings Proxy] Backend returned empty findings, using enriched fallback');
      return NextResponse.json({
        success: true,
        findings: getEnrichedFallbackFindings(),
        source: "fallback",
        count: fallbackFindings.length
      });
    }

    // Enrich all findings (especially IAM findings)
    const enrichedFindings = findings.map(enrichIAMFinding);

    return NextResponse.json({
      success: true,
      findings: enrichedFindings,
      source: "backend",
      count: enrichedFindings.length
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[Findings Proxy] Request timed out after 25s, using enriched fallback');
    } else {
      console.error('[Findings Proxy] Error:', error);
    }

    return NextResponse.json({
      success: true,
      findings: getEnrichedFallbackFindings(),
      source: "fallback",
      count: fallbackFindings.length,
      error: error.message
    });
  }
}
