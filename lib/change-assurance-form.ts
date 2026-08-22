export type ParameterOption = {
  value: string | Record<string, unknown>
  source: string
  label: string
  rule_id?: string
}

export type ParameterOptionsPayload = {
  parameter_options?: Record<string, ParameterOption[]>
  coverage?: Record<string, string>
  required_parameters?: string[]
}

export function requiredParameterKeys(
  capability: { required_parameters?: string[]; required_parameters_by_action?: Record<string, string[]> } | undefined,
  action: string,
): string[] {
  if (!capability) return []
  return capability.required_parameters_by_action?.[action] || capability.required_parameters || []
}

export function buildChangeParameters(input: {
  capability?: { required_parameters?: string[]; required_parameters_by_action?: Record<string, string[]> } | null
  action: string
  selectedPermissions: string[]
  selectedPolicyArns: string[]
  selectedPolicyNames: string[]
  selectedStatementIds: string[]
  selectedRuleIds: string[]
  ruleOptions: ParameterOption[]
  vpcId: string
  bucketName: string
  policyChangeJson: string
  customParametersJson: string
}): Record<string, unknown> {
  if (!input.capability) {
    const parsed = JSON.parse(input.customParametersJson || '{}')
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Parameters must be a JSON object')
    }
    return parsed
  }

  const keys = requiredParameterKeys(input.capability, input.action)
  const out: Record<string, unknown> = {}
  if (keys.includes('permissions')) out.permissions = [...input.selectedPermissions]
  if (keys.includes('policy_arns')) out.policy_arns = [...input.selectedPolicyArns]
  if (keys.includes('policy_names')) out.policy_names = [...input.selectedPolicyNames]
  if (keys.includes('statement_ids')) out.statement_ids = [...input.selectedStatementIds]
  if (keys.includes('vpc_id')) out.vpc_id = input.vpcId.trim()
  if (keys.includes('bucket_name')) out.bucket_name = input.bucketName.trim()
  if (keys.includes('rules')) {
    const selected = new Set(input.selectedRuleIds)
    out.rules = input.ruleOptions
      .filter(item => selected.has(item.rule_id || item.label))
      .map(item => (typeof item.value === 'object' ? item.value : { rule_id: item.rule_id || item.label }))
  }
  if (keys.includes('policy_change')) {
    const parsed = JSON.parse(input.policyChangeJson || '{}')
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('policy_change must be a JSON object')
    }
    out.policy_change = parsed
  }
  return out
}

export function buildAnalyzePayload(input: {
  customerId?: string | null
  accountId?: string | null
  region?: string | null
  systemName: string
  resourceType: string
  resourceId: string
  action: string
  reason: string
  requestedBy: string
  parameters: Record<string, unknown>
}) {
  return {
    scope: {
      customer_id: input.customerId || undefined,
      account_id: input.accountId && input.accountId !== 'all' ? input.accountId : undefined,
      region: input.region && input.region !== 'all' ? input.region : undefined,
      system_name: input.systemName || undefined,
    },
    change: {
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      action: input.action,
      reason: input.reason,
      parameters: input.parameters,
      source: 'CUSTOMER_AUTHORED',
    },
    requested_by: input.requestedBy,
  }
}

export function toggleSelection(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}
