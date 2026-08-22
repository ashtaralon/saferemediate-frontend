import { describe, expect, it } from 'vitest'

import {
  buildAnalyzePayload,
  buildChangeParameters,
  requiredParameterKeys,
  toggleSelection,
} from '@/lib/change-assurance-form'

describe('change assurance form contracts', () => {
  it('builds managed permission-removal payloads from selected evidence options', () => {
    const parameters = buildChangeParameters({
      capability: {
        required_parameters: ['permissions'],
        required_parameters_by_action: { PERMISSION_REMOVAL: ['permissions'] },
      },
      action: 'PERMISSION_REMOVAL',
      selectedPermissions: ['s3:ListBucket', 'kms:DescribeKey'],
      selectedPolicyArns: [],
      selectedPolicyNames: [],
      selectedStatementIds: [],
      selectedRuleIds: [],
      ruleOptions: [],
      vpcId: '',
      bucketName: '',
      policyChangeJson: '{}',
      customParametersJson: '{}',
    })
    expect(parameters).toEqual({
      permissions: ['s3:ListBucket', 'kms:DescribeKey'],
    })
  })

  it('maps selected SG rule ids back to evidence-backed rule objects', () => {
    const parameters = buildChangeParameters({
      capability: {
        required_parameters: ['rules'],
        required_parameters_by_action: { SG_RULE_DELETE: ['rules'] },
      },
      action: 'SG_RULE_DELETE',
      selectedPermissions: [],
      selectedPolicyArns: [],
      selectedPolicyNames: [],
      selectedStatementIds: [],
      selectedRuleIds: ['ingress-0'],
      ruleOptions: [
        { value: { rule_id: 'ingress-0', protocol: 'tcp' }, source: 'inbound_rules', label: 'ingress-0', rule_id: 'ingress-0' },
        { value: { rule_id: 'ingress-1', protocol: 'udp' }, source: 'inbound_rules', label: 'ingress-1', rule_id: 'ingress-1' },
      ],
      vpcId: '',
      bucketName: '',
      policyChangeJson: '{}',
      customParametersJson: '{}',
    })
    expect(parameters).toEqual({
      rules: [{ rule_id: 'ingress-0', protocol: 'tcp' }],
    })
  })

  it('keeps custom-change parameters as an object and rejects arrays', () => {
    expect(() => buildChangeParameters({
      capability: null,
      action: 'wafv2:UpdateWebACL',
      selectedPermissions: [],
      selectedPolicyArns: [],
      selectedPolicyNames: [],
      selectedStatementIds: [],
      selectedRuleIds: [],
      ruleOptions: [],
      vpcId: '',
      bucketName: '',
      policyChangeJson: '{}',
      customParametersJson: '[]',
    })).toThrow(/JSON object/)
  })

  it('scopes analyze payloads to customer/account/region/system without inventing all-scope ids', () => {
    expect(buildAnalyzePayload({
      customerId: 'testbed-webshop',
      accountId: 'all',
      region: 'eu-west-1',
      systemName: 'payments',
      resourceType: 'IAMRole',
      resourceId: 'arn:aws:iam::123456789012:role/app',
      action: 'PERMISSION_REMOVAL',
      reason: 'Remove unused permissions after evidence review.',
      requestedBy: 'ops@example.com',
      parameters: { permissions: ['s3:ListBucket'] },
    })).toEqual({
      scope: {
        customer_id: 'testbed-webshop',
        account_id: undefined,
        region: 'eu-west-1',
        system_name: 'payments',
      },
      change: {
        resource_type: 'IAMRole',
        resource_id: 'arn:aws:iam::123456789012:role/app',
        action: 'PERMISSION_REMOVAL',
        reason: 'Remove unused permissions after evidence review.',
        parameters: { permissions: ['s3:ListBucket'] },
        source: 'CUSTOMER_AUTHORED',
      },
      requested_by: 'ops@example.com',
    })
  })

  it('resolves action-specific required keys and toggles multi-select state', () => {
    expect(requiredParameterKeys({
      required_parameters: ['permissions'],
      required_parameters_by_action: {
        POLICY_DETACH: ['policy_arns'],
      },
    }, 'POLICY_DETACH')).toEqual(['policy_arns'])
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b'])
  })
})
