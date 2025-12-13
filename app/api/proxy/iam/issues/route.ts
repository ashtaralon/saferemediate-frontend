import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

// Demo IAM issues for fallback
const DEMO_IAM_ISSUES = [
  {
    issue_id: 'iam-issue-001',
    role_name: 'production-lambda-role',
    role_arn: 'arn:aws:iam::123456789012:role/production-lambda-role',
    observed_actions: [
      'logs:PutLogEvents',
      'logs:CreateLogStream',
      's3:GetObject',
      's3:PutObject',
      'dynamodb:GetItem',
      'dynamodb:PutItem'
    ],
    allowed_actions: [
      'logs:*',
      's3:*',
      'dynamodb:*',
      'iam:PassRole',
      'ec2:*',
      'lambda:*',
      'sns:*',
      'sqs:*'
    ],
    unused_actions: [
      'logs:DeleteLogGroup',
      's3:DeleteBucket',
      's3:DeleteObject',
      'dynamodb:DeleteTable',
      'iam:PassRole',
      'ec2:*',
      'lambda:*',
      'sns:*',
      'sqs:*'
    ],
    status: 'OPEN',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    issue_id: 'iam-issue-002',
    role_name: 'cicd-deployment-role',
    role_arn: 'arn:aws:iam::123456789012:role/cicd-deployment-role',
    observed_actions: [
      'cloudformation:CreateStack',
      'cloudformation:UpdateStack',
      'cloudformation:DescribeStacks',
      's3:GetObject',
      's3:PutObject',
      'ecr:GetAuthorizationToken',
      'ecr:BatchGetImage'
    ],
    allowed_actions: [
      'cloudformation:*',
      's3:*',
      'ecr:*',
      'iam:*',
      'lambda:*',
      'apigateway:*',
      'dynamodb:*',
      'rds:*',
      'ec2:*'
    ],
    unused_actions: [
      'cloudformation:DeleteStack',
      's3:DeleteBucket',
      'iam:*',
      'lambda:DeleteFunction',
      'apigateway:*',
      'dynamodb:*',
      'rds:*',
      'ec2:*'
    ],
    status: 'OPEN',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 172800000).toISOString()
  }
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    // Call backend IAM issues endpoint
    const url = status
      ? `${BACKEND_URL}/api/iam/issues?status=${status}`
      : `${BACKEND_URL}/api/iam/issues`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('[IAM Issues] Backend error:', response.status)

      // Return demo issues
      let issues = DEMO_IAM_ISSUES
      if (status) {
        issues = issues.filter(i => i.status === status.toUpperCase())
      }

      return NextResponse.json({
        issues,
        total: issues.length,
        demo_mode: true
      })
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('[IAM Issues] Error:', error)

    return NextResponse.json({
      issues: DEMO_IAM_ISSUES,
      total: DEMO_IAM_ISSUES.length,
      demo_mode: true
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Call backend to create IAM issue
    const response = await fetch(`${BACKEND_URL}/api/iam/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[IAM Issues POST] Backend error:', response.status, errorText)

      // Return demo response
      const issueId = `iam-issue-${Date.now().toString(36)}`
      const observed = new Set(body.observed_actions || [])
      const allowed = new Set(body.allowed_actions || [])
      const unused = [...allowed].filter(a => !observed.has(a))

      return NextResponse.json({
        success: true,
        issue_id: issueId,
        role_name: body.role_arn?.split('/')?.pop() || 'demo-role',
        unused_permissions_count: unused.length,
        status: 'OPEN',
        demo_mode: true
      })
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('[IAM Issues POST] Error:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to create IAM issue',
      demo_mode: true
    }, { status: 500 })
  }
}
