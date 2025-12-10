export interface DemoFinding {
  id: string
  type: 'IAM' | 'SecurityGroup' | 'S3'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  resource: string
  resourceType: string
  description: string
  recommendation: string
  metadata?: {
    allowedCount?: number
    usedCount?: number
    unusedCount?: number
    port?: number
    protocol?: string
  }
}

export const DEMO_FINDINGS: DemoFinding[] = [
  {
    id: 'demo-1',
    type: 'IAM',
    severity: 'high',
    title: 'IAM Role has unused permissions',
    resource: 'arn:aws:iam::745783559495:role/SafeRemediate-Lambda-Remediation-Role',
    resourceType: 'IAMRole',
    description: 'Role has 28 allowed permissions but only 3 are used. 25 permissions (89.3%) are unused and can be removed.',
    recommendation: 'Remove unused permissions to follow least privilege principle',
    metadata: {
      allowedCount: 28,
      usedCount: 3,
      unusedCount: 25
    }
  },
  {
    id: 'demo-2',
    type: 'IAM',
    severity: 'medium',
    title: 'IAM Role overprivileged',
    resource: 'arn:aws:iam::745783559495:role/demo-role',
    resourceType: 'IAMRole',
    description: 'Role has broad permissions that may not be needed for its intended use',
    recommendation: 'Review and restrict permissions to only what is required'
  },
  {
    id: 'demo-3',
    type: 'SecurityGroup',
    severity: 'critical',
    title: 'Security Group allows 0.0.0.0/0',
    resource: 'sg-1234567890abcdef0',
    resourceType: 'SecurityGroup',
    description: 'Security Group allows inbound traffic from 0.0.0.0/0 on port 22 (SSH)',
    recommendation: 'Restrict SSH access to specific IP addresses or remove if not needed',
    metadata: {
      port: 22,
      protocol: 'tcp'
    }
  },
  {
    id: 'demo-4',
    type: 'SecurityGroup',
    severity: 'high',
    title: 'Security Group allows 0.0.0.0/0',
    resource: 'sg-abcdef1234567890',
    resourceType: 'SecurityGroup',
    description: 'Security Group allows inbound traffic from 0.0.0.0/0 on port 443 (HTTPS)',
    recommendation: 'Restrict to specific IP addresses or use WAF for additional protection',
    metadata: {
      port: 443,
      protocol: 'tcp'
    }
  },
  {
    id: 'demo-5',
    type: 'S3',
    severity: 'medium',
    title: 'S3 Bucket has public access',
    resource: 'arn:aws:s3:::demo-bucket',
    resourceType: 'S3Bucket',
    description: 'S3 bucket has public access enabled, exposing data to unauthorized access',
    recommendation: 'Disable public access unless explicitly required for public content'
  },
  {
    id: 'demo-6',
    type: 'S3',
    severity: 'low',
    title: 'S3 Bucket missing encryption',
    resource: 'arn:aws:s3:::another-demo-bucket',
    resourceType: 'S3Bucket',
    description: 'S3 bucket does not have server-side encryption enabled',
    recommendation: 'Enable server-side encryption (SSE) for data at rest protection'
  }
]
