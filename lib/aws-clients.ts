// AWS SDK Clients for Real Data & Remediation
// Install: npm install @aws-sdk/client-iam @aws-sdk/client-ec2 @aws-sdk/client-sts @aws-sdk/client-cloudtrail

import { IAMClient } from "@aws-sdk/client-iam"
import { EC2Client } from "@aws-sdk/client-ec2"
import { STSClient } from "@aws-sdk/client-sts"

// Shared AWS configuration
const awsConfig = {
  region: process.env.AWS_REGION || "eu-west-1",
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      }
    : undefined, // Falls back to default credential provider chain (IAM role, env, profile)
}

// Singleton clients
let iamClient: IAMClient | null = null
let ec2Client: EC2Client | null = null
let stsClient: STSClient | null = null

export function getIAMClient(): IAMClient {
  if (!iamClient) {
    iamClient = new IAMClient(awsConfig)
  }
  return iamClient
}

export function getEC2Client(): EC2Client {
  if (!ec2Client) {
    ec2Client = new EC2Client(awsConfig)
  }
  return ec2Client
}

export function getSTSClient(): STSClient {
  if (!stsClient) {
    stsClient = new STSClient(awsConfig)
  }
  return stsClient
}

// Check if AWS is configured
export function isAWSConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_PROFILE ||
    process.env.AWS_ROLE_ARN
  )
}
