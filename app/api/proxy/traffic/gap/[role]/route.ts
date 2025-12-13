import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

// Demo IAM data by role name
const DEMO_GAP_DATA: Record<string, any> = {
  'production-lambda-role': {
    allowed_actions: 37,
    used_actions: 6,
    unused_actions: 31,
    unused_actions_list: [
      'dynamodb:DeleteItem', 'dynamodb:DeleteTable', 'dynamodb:CreateTable', 'dynamodb:Scan',
      'sns:Publish', 'sns:CreateTopic', 'sns:DeleteTopic', 'sns:Subscribe',
      'sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:CreateQueue', 'sqs:DeleteQueue',
      'ec2:DescribeInstances', 'ec2:StartInstances', 'ec2:StopInstances', 'ec2:CreateSnapshot',
      'ec2:DeleteSnapshot', 'ec2:TerminateInstances',
      'iam:GetRole', 'iam:PassRole', 'iam:CreateRole', 'iam:DeleteRole',
      'iam:AttachRolePolicy', 'iam:DetachRolePolicy',
      'logs:DeleteLogGroup', 'logs:DescribeLogGroups',
      's3:DeleteObject', 's3:DeleteBucket', 's3:PutBucketPolicy', 's3:GetBucketPolicy'
    ],
    statistics: {
      confidence: 94,
      remediation_potential: '84%',
      observation_days: 90
    }
  },
  'cicd-deployment-role': {
    allowed_actions: 45,
    used_actions: 8,
    unused_actions: 37,
    unused_actions_list: [
      'iam:CreateRole', 'iam:DeleteRole', 'iam:AttachRolePolicy', 'iam:DetachRolePolicy',
      'iam:PassRole', 'iam:GetRole',
      'lambda:CreateFunction', 'lambda:DeleteFunction', 'lambda:UpdateFunctionCode',
      'lambda:InvokeFunction', 'lambda:GetFunction',
      'ec2:DescribeInstances', 'ec2:StartInstances', 'ec2:StopInstances',
      'ec2:CreateSnapshot', 'ec2:DeleteSnapshot', 'ec2:TerminateInstances',
      'rds:DescribeDBInstances', 'rds:CreateDBInstance', 'rds:DeleteDBInstance', 'rds:ModifyDBInstance',
      'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:Scan',
      'dynamodb:DeleteItem', 'dynamodb:DeleteTable', 'dynamodb:CreateTable'
    ],
    statistics: {
      confidence: 88,
      remediation_potential: '82%',
      observation_days: 90
    }
  },
  'SafeRemediate-Lambda-Remediation-Role': {
    allowed_actions: 28,
    used_actions: 4,
    unused_actions: 24,
    unused_actions_list: [
      'iam:CreateRole', 'iam:DeleteRole', 'iam:AttachRolePolicy', 'iam:DetachRolePolicy',
      'iam:PassRole', 'iam:GetRole', 'iam:ListRoles', 'iam:UpdateRole',
      's3:DeleteBucket', 's3:PutBucketPolicy', 's3:DeleteObject', 's3:PutBucketAcl',
      'ec2:TerminateInstances', 'ec2:DeleteSnapshot', 'ec2:CreateSnapshot',
      'lambda:DeleteFunction', 'lambda:CreateFunction', 'lambda:UpdateFunctionCode',
      'logs:DeleteLogGroup', 'logs:DeleteLogStream',
      'dynamodb:DeleteTable', 'dynamodb:CreateTable',
      'sns:DeleteTopic', 'sqs:DeleteQueue'
    ],
    statistics: {
      confidence: 95,
      remediation_potential: '86%',
      observation_days: 90
    }
  }
}

// Default demo data for unknown roles
const DEFAULT_GAP_DATA = {
  allowed_actions: 32,
  used_actions: 5,
  unused_actions: 27,
  unused_actions_list: [
    'iam:PassRole', 'iam:CreateRole', 'iam:DeleteRole',
    's3:DeleteBucket', 's3:DeleteObject',
    'ec2:TerminateInstances', 'ec2:DeleteSnapshot',
    'lambda:DeleteFunction', 'lambda:CreateFunction',
    'dynamodb:DeleteTable', 'dynamodb:CreateTable',
    'logs:DeleteLogGroup', 'logs:CreateLogGroup',
    'sns:CreateTopic', 'sns:DeleteTopic',
    'sqs:CreateQueue', 'sqs:DeleteQueue',
    'kms:CreateKey', 'kms:ScheduleKeyDeletion',
    'rds:DeleteDBInstance', 'rds:CreateDBInstance'
  ],
  statistics: {
    confidence: 90,
    remediation_potential: '84%',
    observation_days: 90
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { role: string } }
) {
  const role = params.role

  try {
    // Try to call the backend first
    const response = await fetch(`${BACKEND_URL}/api/traffic/gap/${encodeURIComponent(role)}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    })

    if (response.ok) {
      const data = await response.json()
      // Check if backend returned meaningful data
      if (data.allowed_actions > 0 || data.used_actions > 0) {
        return NextResponse.json(data)
      }
    }
  } catch (error) {
    console.log('[Traffic Gap] Backend unavailable, using demo data')
  }

  // Return demo data
  const demoData = DEMO_GAP_DATA[role] || DEFAULT_GAP_DATA

  console.log(`[Traffic Gap] Returning demo data for role: ${role}`)

  return NextResponse.json(demoData)
}
