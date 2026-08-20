import { describe, expect, it } from 'vitest'

import {
  isVisibilityOnlyResource,
  supportsConfigurationChangeCase,
} from '@/components/LeastPrivilegeTab'
import { customerSafeError } from '@/lib/customer-error'

describe('configuration Change Case routing', () => {
  it('routes finding-bound IAM and SG rows to the canonical review', () => {
    expect(supportsConfigurationChangeCase({ resourceType: 'IAMRole', findingId: 'iam-1' })).toBe(true)
    expect(supportsConfigurationChangeCase({ resourceType: 'SecurityGroup', findingId: 'sg-1' })).toBe(true)
    expect(supportsConfigurationChangeCase({ resourceType: 'S3Bucket', findingId: 's3-1' })).toBe(false)
  })

  it('keeps AWS-managed roles and default security groups visibility-only', () => {
    expect(isVisibilityOnlyResource({
      resourceType: 'SecurityGroup',
      resourceName: 'default',
    })).toBe(true)
    expect(isVisibilityOnlyResource({
      resourceType: 'IAMRole',
      resourceName: 'AWSServiceRoleForSecurityHub',
      isServiceLinkedRole: true,
    })).toBe(true)
  })

  it('removes raw AWS identity details from customer-facing failures', () => {
    const safe = customerSafeError(
      'UnauthorizedOperation: arn:aws:iam::745783559495:user/internal is not authorized to perform ec2:DescribeSecurityGroups',
    )
    expect(safe).toContain('Live AWS configuration could not be verified')
    expect(safe).not.toContain('arn:aws:iam')
    expect(safe).not.toContain('UnauthorizedOperation')
  })
})
