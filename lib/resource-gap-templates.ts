/**
 * Resource Gap Card Template Registry
 *
 * Contains template configurations for all supported resource types.
 * Each template defines how to display gap analysis for that resource type.
 */

import {
  ResourceGapTemplate,
  ResourceType,
  TemplateRegistry,
  HeaderConfig,
  SummaryConfig,
  SectionConfig,
  MetricsBannerConfig,
  BlastRadiusConfig,
  RecommendationsConfig,
} from '@/types/resource-gap-template'

// ============================================================================
// Shared Configurations
// ============================================================================

const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  showLastSeen: true,
  showPlaneChips: true,
  showConfidenceLabel: true,
  planes: [
    { id: 'configured', label: 'Configured', color: '#3b82f6', description: 'What rules/permissions are configured' },
    { id: 'observed', label: 'Observed', color: '#10b981', description: 'What was actually used in traffic/logs' },
    { id: 'changed', label: 'Changed', color: '#f59e0b', description: 'Recent configuration changes' },
    { id: 'authorized', label: 'Authorized', color: '#8b5cf6', description: 'What is approved/authorized' },
  ],
  confidenceThresholds: {
    high: 80,
    medium: 50,
    low: 0,
  },
}

const DEFAULT_RECOMMENDATIONS_CONFIG: RecommendationsConfig = {
  title: 'Recommendations',
  showSimulateButton: true,
  showRemediateButton: true,
  groupByAction: true,
  sortBySeverity: true,
  actions: [
    { action: 'KEEP', label: 'Keep', buttonLabel: 'Keep', color: '#10b981', icon: 'check' },
    { action: 'DELETE', label: 'Delete', buttonLabel: 'Delete', color: '#ef4444', icon: 'trash', confirmMessage: 'Are you sure you want to delete this rule?' },
    { action: 'TIGHTEN', label: 'Tighten', buttonLabel: 'Tighten', color: '#f59e0b', icon: 'shield' },
    { action: 'REVIEW', label: 'Review', buttonLabel: 'Review', color: '#6b7280', icon: 'eye' },
    { action: 'REPLACE', label: 'Replace', buttonLabel: 'Replace', color: '#dc2626', icon: 'refresh', requiresSimulation: true, confirmMessage: 'This will remove the rule entirely. Confirm?' },
  ],
}

// ============================================================================
// RDS Instance Template
// ============================================================================

const RDS_TEMPLATE: ResourceGapTemplate = {
  resourceType: 'RDS',
  displayName: 'RDS Database',
  description: 'Gap analysis for RDS database security group rules',
  category: 'network',

  dataMapping: {
    rulesPath: 'analysis.rules',
    summaryPath: 'analysis.summary',
    recommendationsPath: 'analysis.recommendations',
    metricsPath: 'analysis.summary.gap_metrics',
  },

  header: {
    ...DEFAULT_HEADER_CONFIG,
    planes: [
      { id: 'configured', label: 'Configured', color: '#3b82f6', description: 'Security group rules attached to RDS' },
      { id: 'observed', label: 'VPC Flow Logs', color: '#10b981', description: 'Actual database connections observed' },
      { id: 'changed', label: 'Config Changes', color: '#f59e0b', description: 'Recent SG rule modifications' },
      { id: 'authorized', label: 'Authorized', color: '#8b5cf6', description: 'Approved database access patterns' },
    ],
  },

  summary: {
    layout: 'row',
    boxes: [
      { id: 'used', label: 'Used Rules', valueKey: 'summary.used_rules', color: 'green', format: 'number' },
      { id: 'unobserved', label: 'Unobserved', valueKey: 'summary.unobserved_rules', color: 'yellow', format: 'number' },
      { id: 'overly_broad', label: 'Overly Broad', valueKey: 'summary.overly_broad_rules', color: 'red', format: 'number' },
      { id: 'confidence', label: 'Confidence', valueKey: 'summary.average_confidence', color: 'blue', format: 'percentage' },
    ],
  },

  sections: [
    {
      id: 'whats_used',
      title: "What's Actually Used",
      type: 'rules_list',
      statusFilter: ['USED'],
      emptyMessage: 'No rules with observed traffic',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 1,
      icon: 'check-circle',
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: true,
        portLabel: 'Port',
        sourceLabel: 'Source CIDR',
        connectionLabel: 'Connections (30d)',
      },
      statusBadges: [
        { status: 'USED', label: 'ACTIVE', sublabel: '{connections} connections', bgColor: '#dcfce7', textColor: '#166534', borderColor: '#86efac' },
      ],
    },
    {
      id: 'gap_unobserved',
      title: 'Gap - Unobserved (30d)',
      type: 'rules_list',
      statusFilter: ['UNOBSERVED'],
      emptyMessage: 'No unobserved database ports - great!',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 2,
      icon: 'alert-triangle',
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: false,
        portLabel: 'Port',
        sourceLabel: 'Source CIDR',
        connectionLabel: '0 Connections',
      },
      statusBadges: [
        { status: 'UNOBSERVED', label: '0 CONNECTIONS', sublabel: 'Recommend removal', bgColor: '#fef3c7', textColor: '#92400e', borderColor: '#fcd34d' },
      ],
    },
    {
      id: 'overly_broad',
      title: 'Overly Broad Rules',
      type: 'rules_list',
      statusFilter: ['OVERLY_BROAD'],
      emptyMessage: 'No overly broad rules found',
      collapsible: true,
      defaultCollapsed: true,
      showCount: true,
      priority: 3,
      icon: 'shield-alert',
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: true,
        portLabel: 'Port',
        sourceLabel: 'Source CIDR',
        connectionLabel: 'Connections',
      },
      statusBadges: [
        { status: 'OVERLY_BROAD', label: 'OVERLY BROAD', sublabel: 'Tighten recommended', bgColor: '#fed7aa', textColor: '#ea580c', borderColor: '#fdba74' },
      ],
    },
  ],

  metricsBanner: {
    title: 'Gap Metrics',
    bgColor: '#fef3c7',
    showObservationPeriod: true,
    metrics: [
      { id: 'configured', label: 'Configured Ports', valueKey: 'gap_metrics.configured_ports', format: 'number' },
      { id: 'observed', label: 'Observed Ports', valueKey: 'gap_metrics.observed_ports', format: 'number' },
      { id: 'unobserved', label: 'Unobserved Ports', valueKey: 'gap_metrics.unobserved_ports', format: 'number', highlight: true },
      { id: 'gap_pct', label: 'Gap %', valueKey: 'gap_metrics.gap_percentage', format: 'percentage', highlight: true },
    ],
  },

  blastRadius: {
    enabled: true,
    title: 'Blast Radius',
    trackNeighborTypes: ['EC2Instance', 'LambdaFunction', 'ECSService'],
    impactMessageTemplate: '{count} flows will continue to work',
    showVisualization: true,
  },

  recommendations: {
    ...DEFAULT_RECOMMENDATIONS_CONFIG,
    title: 'Database Security Recommendations',
  },

  specificConfig: {
    databasePorts: {
      postgresql: 5432,
      mysql: 3306,
      mariadb: 3306,
      oracle: 1521,
      sqlserver: 1433,
      'aurora-mysql': 3306,
      'aurora-postgresql': 5432,
      redshift: 5439,
    },
    unobservedPolicy: {
      action: 'REPLACE',
      priority: 'CRITICAL',
    },
    observationDays: 30,
    confidenceBoost: 15,
  },
}

// ============================================================================
// EC2 Instance Template
// ============================================================================

const EC2_TEMPLATE: ResourceGapTemplate = {
  resourceType: 'EC2',
  displayName: 'EC2 Instance',
  description: 'Gap analysis for EC2 security group rules',
  category: 'network',

  dataMapping: {
    rulesPath: 'analysis.rules',
    summaryPath: 'analysis.summary',
    recommendationsPath: 'analysis.recommendations',
    metricsPath: 'analysis.summary.gap_metrics',
  },

  header: {
    ...DEFAULT_HEADER_CONFIG,
    planes: [
      { id: 'configured', label: 'Configured', color: '#3b82f6', description: 'Security group rules attached to instance' },
      { id: 'observed', label: 'VPC Flow Logs', color: '#10b981', description: 'Actual network traffic observed' },
      { id: 'changed', label: 'Config Changes', color: '#f59e0b', description: 'Recent SG rule modifications' },
      { id: 'authorized', label: 'Authorized', color: '#8b5cf6', description: 'Approved access patterns' },
    ],
  },

  summary: {
    layout: 'row',
    boxes: [
      { id: 'used', label: 'Used Rules', valueKey: 'summary.used_rules', color: 'green', format: 'number' },
      { id: 'unused', label: 'Unused', valueKey: 'summary.unused_rules', color: 'red', format: 'number' },
      { id: 'overly_broad', label: 'Overly Broad', valueKey: 'summary.overly_broad_rules', color: 'yellow', format: 'number' },
      { id: 'public', label: 'Public Rules', valueKey: 'summary.public_rules', color: 'red', format: 'number' },
    ],
  },

  sections: [
    {
      id: 'whats_used',
      title: "What's Actually Used",
      type: 'rules_list',
      statusFilter: ['USED'],
      emptyMessage: 'No rules with observed traffic',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 1,
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: true,
        portLabel: 'Port',
        sourceLabel: 'Source',
        connectionLabel: 'Connections',
      },
      statusBadges: [
        { status: 'USED', label: 'ACTIVE', bgColor: '#dcfce7', textColor: '#166534' },
      ],
    },
    {
      id: 'unused',
      title: 'Unused Rules',
      type: 'rules_list',
      statusFilter: ['UNUSED', 'UNOBSERVED'],
      emptyMessage: 'All rules are being used',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 2,
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: false,
      },
      statusBadges: [
        { status: 'UNUSED', label: 'UNUSED', bgColor: '#fee2e2', textColor: '#991b1b' },
        { status: 'UNOBSERVED', label: '0 CONNECTIONS', bgColor: '#fef3c7', textColor: '#92400e' },
      ],
    },
    {
      id: 'overly_broad',
      title: 'Overly Broad Rules',
      type: 'rules_list',
      statusFilter: ['OVERLY_BROAD'],
      emptyMessage: 'No overly broad rules',
      collapsible: true,
      defaultCollapsed: true,
      showCount: true,
      priority: 3,
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: true,
      },
      statusBadges: [
        { status: 'OVERLY_BROAD', label: 'TOO BROAD', bgColor: '#fed7aa', textColor: '#ea580c' },
      ],
    },
  ],

  metricsBanner: {
    title: 'Network Gap Analysis',
    bgColor: '#eff6ff',
    showObservationPeriod: true,
    metrics: [
      { id: 'total', label: 'Total Rules', valueKey: 'summary.total_rules', format: 'number' },
      { id: 'used', label: 'Used', valueKey: 'summary.used_rules', format: 'number' },
      { id: 'unused', label: 'Unused', valueKey: 'summary.unused_rules', format: 'number', highlight: true },
      { id: 'risk', label: 'Risk Score', valueKey: 'summary.risk_score', format: 'number' },
    ],
  },

  blastRadius: {
    enabled: true,
    title: 'Blast Radius',
    trackNeighborTypes: ['EC2Instance', 'RDSInstance', 'ELB', 'ALB'],
    impactMessageTemplate: '{count} resources will be affected',
    showVisualization: true,
  },

  recommendations: DEFAULT_RECOMMENDATIONS_CONFIG,

  specificConfig: {
    observationDays: 30,
  },
}

// ============================================================================
// IAM Role/User Template
// ============================================================================

const IAM_TEMPLATE: ResourceGapTemplate = {
  resourceType: 'IAM',
  displayName: 'IAM Role/User',
  description: 'Gap analysis for IAM permissions and policies',
  category: 'permissions',

  dataMapping: {
    rulesPath: 'analysis.permissions',
    summaryPath: 'analysis.summary',
    recommendationsPath: 'analysis.recommendations',
    metricsPath: 'analysis.summary.permission_metrics',
  },

  header: {
    ...DEFAULT_HEADER_CONFIG,
    planes: [
      { id: 'configured', label: 'Configured', color: '#3b82f6', description: 'Attached IAM policies and permissions' },
      { id: 'observed', label: 'CloudTrail', color: '#10b981', description: 'Actions actually invoked' },
      { id: 'changed', label: 'Policy Changes', color: '#f59e0b', description: 'Recent policy modifications' },
      { id: 'authorized', label: 'Authorized', color: '#8b5cf6', description: 'Approved permissions' },
    ],
  },

  summary: {
    layout: 'row',
    boxes: [
      { id: 'used', label: 'Used Permissions', valueKey: 'summary.used_permissions', color: 'green', format: 'number' },
      { id: 'unused', label: 'Unused', valueKey: 'summary.unused_permissions', color: 'red', format: 'number' },
      { id: 'admin', label: 'Admin Actions', valueKey: 'summary.admin_permissions', color: 'red', format: 'number' },
      { id: 'confidence', label: 'Confidence', valueKey: 'summary.average_confidence', color: 'blue', format: 'percentage' },
    ],
  },

  sections: [
    {
      id: 'used_permissions',
      title: 'Used Permissions',
      type: 'permissions_list',
      statusFilter: ['USED'],
      emptyMessage: 'No permissions have been used',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 1,
      ruleDisplay: {
        showPort: false,
        showProtocol: false,
        showSource: true,
        showDestination: true,
        showConnections: true,
        showLastUsed: true,
        sourceLabel: 'Action',
        connectionLabel: 'Invocations',
      },
      statusBadges: [
        { status: 'USED', label: 'USED', bgColor: '#dcfce7', textColor: '#166534' },
      ],
    },
    {
      id: 'unused_permissions',
      title: 'Unused Permissions',
      type: 'permissions_list',
      statusFilter: ['UNUSED', 'UNOBSERVED'],
      emptyMessage: 'All permissions are being used - great!',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 2,
      ruleDisplay: {
        showPort: false,
        showProtocol: false,
        showSource: true,
        showDestination: true,
        showConnections: true,
        showLastUsed: false,
        sourceLabel: 'Action',
        connectionLabel: '0 Invocations',
      },
      statusBadges: [
        { status: 'UNUSED', label: 'NEVER USED', bgColor: '#fee2e2', textColor: '#991b1b' },
        { status: 'UNOBSERVED', label: 'NOT OBSERVED', bgColor: '#fef3c7', textColor: '#92400e' },
      ],
    },
    {
      id: 'admin_permissions',
      title: 'Admin/Dangerous Permissions',
      type: 'permissions_list',
      statusFilter: ['OVERLY_BROAD'],
      emptyMessage: 'No admin permissions found',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 3,
      ruleDisplay: {
        showPort: false,
        showProtocol: false,
        showSource: true,
        showDestination: true,
        showConnections: true,
        showLastUsed: true,
        sourceLabel: 'Action',
        connectionLabel: 'Invocations',
      },
      statusBadges: [
        { status: 'OVERLY_BROAD', label: 'ADMIN', bgColor: '#fee2e2', textColor: '#991b1b' },
      ],
    },
  ],

  metricsBanner: {
    title: 'Permission Gap Metrics',
    bgColor: '#f5f3ff',
    showObservationPeriod: true,
    metrics: [
      { id: 'configured', label: 'Configured Actions', valueKey: 'permission_metrics.configured_actions', format: 'number' },
      { id: 'observed', label: 'Observed Actions', valueKey: 'permission_metrics.observed_actions', format: 'number' },
      { id: 'gap', label: 'Gap %', valueKey: 'permission_metrics.gap_percentage', format: 'percentage', highlight: true },
      { id: 'risk', label: 'Privilege Score', valueKey: 'summary.privilege_score', format: 'number' },
    ],
  },

  blastRadius: {
    enabled: true,
    title: 'Access Scope',
    trackNeighborTypes: ['S3Bucket', 'DynamoDBTable', 'LambdaFunction', 'EC2Instance'],
    impactMessageTemplate: '{count} resources can be accessed',
    showVisualization: true,
  },

  recommendations: {
    ...DEFAULT_RECOMMENDATIONS_CONFIG,
    title: 'Least Privilege Recommendations',
    actions: [
      { action: 'KEEP', label: 'Keep', buttonLabel: 'Keep', color: '#10b981' },
      { action: 'DELETE', label: 'Remove Permission', buttonLabel: 'Remove', color: '#ef4444', confirmMessage: 'Remove this permission?' },
      { action: 'TIGHTEN', label: 'Add Conditions', buttonLabel: 'Tighten', color: '#f59e0b' },
      { action: 'REVIEW', label: 'Review', buttonLabel: 'Review', color: '#6b7280' },
      { action: 'REPLACE', label: 'Replace Policy', buttonLabel: 'Replace', color: '#dc2626', requiresSimulation: true },
    ],
  },

  specificConfig: {
    permissionCategories: ['Read', 'Write', 'Admin', 'Delete', 'List', 'Create', 'Update'],
    observationDays: 90,
    confidenceBoost: 10,
  },
}

// ============================================================================
// S3 Bucket Template
// ============================================================================

const S3_TEMPLATE: ResourceGapTemplate = {
  resourceType: 'S3',
  displayName: 'S3 Bucket',
  description: 'Gap analysis for S3 bucket policies and access',
  category: 'policies',

  dataMapping: {
    rulesPath: 'analysis.policy_statements',
    summaryPath: 'analysis.summary',
    recommendationsPath: 'analysis.recommendations',
    metricsPath: 'analysis.summary.access_metrics',
  },

  header: {
    ...DEFAULT_HEADER_CONFIG,
    planes: [
      { id: 'configured', label: 'Bucket Policy', color: '#3b82f6', description: 'S3 bucket policy statements' },
      { id: 'observed', label: 'S3 Access Logs', color: '#10b981', description: 'Actual access patterns observed' },
      { id: 'changed', label: 'Policy Changes', color: '#f59e0b', description: 'Recent bucket policy changes' },
      { id: 'authorized', label: 'Authorized', color: '#8b5cf6', description: 'Approved access patterns' },
    ],
  },

  summary: {
    layout: 'row',
    boxes: [
      { id: 'statements', label: 'Policy Statements', valueKey: 'summary.total_statements', color: 'blue', format: 'number' },
      { id: 'public', label: 'Public Access', valueKey: 'summary.public_statements', color: 'red', format: 'number' },
      { id: 'unused', label: 'Unused Statements', valueKey: 'summary.unused_statements', color: 'yellow', format: 'number' },
      { id: 'risk', label: 'Risk Score', valueKey: 'summary.risk_score', color: 'gray', format: 'number' },
    ],
  },

  sections: [
    {
      id: 'used_access',
      title: 'Active Access Patterns',
      type: 'policy_list',
      statusFilter: ['USED'],
      emptyMessage: 'No active access patterns observed',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 1,
      ruleDisplay: {
        showPort: false,
        showProtocol: false,
        showSource: true,
        showDestination: true,
        showConnections: true,
        showLastUsed: true,
        sourceLabel: 'Principal',
        connectionLabel: 'Requests',
      },
      statusBadges: [
        { status: 'USED', label: 'ACTIVE', bgColor: '#dcfce7', textColor: '#166534' },
      ],
    },
    {
      id: 'public_access',
      title: 'Public Access Statements',
      type: 'policy_list',
      statusFilter: ['OVERLY_BROAD'],
      emptyMessage: 'No public access - great!',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 2,
      ruleDisplay: {
        showPort: false,
        showProtocol: false,
        showSource: true,
        showDestination: true,
        showConnections: true,
        showLastUsed: true,
        sourceLabel: 'Principal',
        connectionLabel: 'Requests',
      },
      statusBadges: [
        { status: 'OVERLY_BROAD', label: 'PUBLIC', bgColor: '#fee2e2', textColor: '#991b1b' },
      ],
    },
    {
      id: 'unused_statements',
      title: 'Unused Policy Statements',
      type: 'policy_list',
      statusFilter: ['UNUSED', 'UNOBSERVED'],
      emptyMessage: 'All statements are being used',
      collapsible: true,
      defaultCollapsed: true,
      showCount: true,
      priority: 3,
      ruleDisplay: {
        showPort: false,
        showProtocol: false,
        showSource: true,
        showDestination: true,
        showConnections: true,
        showLastUsed: false,
        sourceLabel: 'Principal',
        connectionLabel: '0 Requests',
      },
      statusBadges: [
        { status: 'UNUSED', label: 'UNUSED', bgColor: '#fee2e2', textColor: '#991b1b' },
        { status: 'UNOBSERVED', label: 'NOT OBSERVED', bgColor: '#fef3c7', textColor: '#92400e' },
      ],
    },
  ],

  metricsBanner: {
    title: 'S3 Access Gap Metrics',
    bgColor: '#fef9c3',
    showObservationPeriod: true,
    metrics: [
      { id: 'statements', label: 'Policy Statements', valueKey: 'summary.total_statements', format: 'number' },
      { id: 'principals', label: 'Unique Principals', valueKey: 'access_metrics.unique_principals', format: 'number' },
      { id: 'unused', label: 'Unused Statements', valueKey: 'summary.unused_statements', format: 'number', highlight: true },
      { id: 'public', label: 'Public Statements', valueKey: 'summary.public_statements', format: 'number', highlight: true },
    ],
  },

  blastRadius: {
    enabled: true,
    title: 'Data Exposure',
    trackNeighborTypes: ['IAMRole', 'IAMUser', 'LambdaFunction', 'EC2Instance'],
    impactMessageTemplate: '{count} principals can access this bucket',
    showVisualization: false,
  },

  recommendations: {
    ...DEFAULT_RECOMMENDATIONS_CONFIG,
    title: 'S3 Policy Recommendations',
    actions: [
      { action: 'KEEP', label: 'Keep Statement', buttonLabel: 'Keep', color: '#10b981' },
      { action: 'DELETE', label: 'Remove Statement', buttonLabel: 'Remove', color: '#ef4444', confirmMessage: 'Remove this policy statement?' },
      { action: 'TIGHTEN', label: 'Restrict Principal', buttonLabel: 'Tighten', color: '#f59e0b' },
      { action: 'REVIEW', label: 'Review', buttonLabel: 'Review', color: '#6b7280' },
    ],
  },

  specificConfig: {
    accessPatterns: ['GetObject', 'PutObject', 'DeleteObject', 'ListBucket', 's3:*'],
    observationDays: 30,
  },
}

// ============================================================================
// Security Group Template (Generic)
// ============================================================================

const SECURITY_GROUP_TEMPLATE: ResourceGapTemplate = {
  resourceType: 'SecurityGroup',
  displayName: 'Security Group',
  description: 'Gap analysis for security group rules',
  category: 'network',

  dataMapping: {
    rulesPath: 'analysis.rules',
    summaryPath: 'analysis.summary',
    recommendationsPath: 'analysis.recommendations',
    metricsPath: 'analysis.summary.gap_metrics',
  },

  header: DEFAULT_HEADER_CONFIG,

  summary: {
    layout: 'row',
    boxes: [
      { id: 'used', label: 'Used Rules', valueKey: 'summary.used_rules', color: 'green', format: 'number' },
      { id: 'unused', label: 'Unused', valueKey: 'summary.unused_rules', color: 'red', format: 'number' },
      { id: 'unobserved', label: 'Unobserved', valueKey: 'summary.unobserved_rules', color: 'yellow', format: 'number' },
      { id: 'overly_broad', label: 'Overly Broad', valueKey: 'summary.overly_broad_rules', color: 'yellow', format: 'number' },
    ],
  },

  sections: [
    {
      id: 'whats_used',
      title: "What's Actually Used",
      type: 'rules_list',
      statusFilter: ['USED'],
      emptyMessage: 'No rules with observed traffic',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 1,
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: true,
      },
      statusBadges: [
        { status: 'USED', label: 'ACTIVE', bgColor: '#dcfce7', textColor: '#166534' },
      ],
    },
    {
      id: 'gap_unobserved',
      title: 'Gap - Unobserved',
      type: 'rules_list',
      statusFilter: ['UNOBSERVED'],
      emptyMessage: 'No unobserved rules',
      collapsible: true,
      defaultCollapsed: false,
      showCount: true,
      priority: 2,
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: false,
      },
      statusBadges: [
        { status: 'UNOBSERVED', label: '0 CONNECTIONS', bgColor: '#fef3c7', textColor: '#92400e' },
      ],
    },
    {
      id: 'unused',
      title: 'Unused Rules',
      type: 'rules_list',
      statusFilter: ['UNUSED'],
      emptyMessage: 'No unused rules',
      collapsible: true,
      defaultCollapsed: true,
      showCount: true,
      priority: 3,
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: false,
      },
      statusBadges: [
        { status: 'UNUSED', label: 'UNUSED', bgColor: '#fee2e2', textColor: '#991b1b' },
      ],
    },
    {
      id: 'overly_broad',
      title: 'Overly Broad Rules',
      type: 'rules_list',
      statusFilter: ['OVERLY_BROAD'],
      emptyMessage: 'No overly broad rules',
      collapsible: true,
      defaultCollapsed: true,
      showCount: true,
      priority: 4,
      ruleDisplay: {
        showPort: true,
        showProtocol: true,
        showSource: true,
        showDestination: false,
        showConnections: true,
        showLastUsed: true,
      },
      statusBadges: [
        { status: 'OVERLY_BROAD', label: 'TOO BROAD', bgColor: '#fed7aa', textColor: '#ea580c' },
      ],
    },
  ],

  metricsBanner: {
    title: 'Gap Metrics',
    bgColor: '#eff6ff',
    showObservationPeriod: true,
    metrics: [
      { id: 'configured', label: 'Configured', valueKey: 'gap_metrics.configured_ports', format: 'number' },
      { id: 'observed', label: 'Observed', valueKey: 'gap_metrics.observed_ports', format: 'number' },
      { id: 'unobserved', label: 'Unobserved', valueKey: 'gap_metrics.unobserved_ports', format: 'number', highlight: true },
      { id: 'gap_pct', label: 'Gap %', valueKey: 'gap_metrics.gap_percentage', format: 'percentage', highlight: true },
    ],
  },

  blastRadius: {
    enabled: true,
    title: 'Blast Radius',
    trackNeighborTypes: ['EC2Instance', 'RDSInstance', 'LambdaFunction', 'ECSService'],
    impactMessageTemplate: '{count} resources use this security group',
    showVisualization: true,
  },

  recommendations: DEFAULT_RECOMMENDATIONS_CONFIG,
}

// ============================================================================
// Template Registry
// ============================================================================

export const RESOURCE_GAP_TEMPLATES: TemplateRegistry = {
  RDS: RDS_TEMPLATE,
  EC2: EC2_TEMPLATE,
  IAM: IAM_TEMPLATE,
  S3: S3_TEMPLATE,
  Lambda: EC2_TEMPLATE,  // Lambda uses similar network analysis as EC2
  ECS: EC2_TEMPLATE,     // ECS uses similar network analysis as EC2
  SecurityGroup: SECURITY_GROUP_TEMPLATE,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get template configuration for a resource type
 */
export function getResourceTemplate(resourceType: ResourceType): ResourceGapTemplate {
  const template = RESOURCE_GAP_TEMPLATES[resourceType]
  if (!template) {
    console.warn(`No template found for resource type: ${resourceType}, using SecurityGroup template`)
    return SECURITY_GROUP_TEMPLATE
  }
  return template
}

/**
 * Merge custom template overrides with base template
 */
export function mergeTemplateConfig(
  base: ResourceGapTemplate,
  overrides: Partial<ResourceGapTemplate>
): ResourceGapTemplate {
  return {
    ...base,
    ...overrides,
    header: { ...base.header, ...overrides.header },
    summary: { ...base.summary, ...overrides.summary },
    sections: overrides.sections || base.sections,
    metricsBanner: overrides.metricsBanner || base.metricsBanner,
    blastRadius: overrides.blastRadius || base.blastRadius,
    recommendations: { ...base.recommendations, ...overrides.recommendations },
    specificConfig: { ...base.specificConfig, ...overrides.specificConfig },
  }
}

/**
 * Get value from nested object path
 * e.g., getNestedValue(obj, 'summary.gap_metrics.gap_percentage')
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, part) => acc?.[part], obj)
}

/**
 * Format a value based on format type
 */
export function formatValue(value: any, format?: string): string {
  if (value === null || value === undefined) return '-'

  switch (format) {
    case 'percentage':
      return `${Math.round(value)}%`
    case 'days':
      return `${value}d`
    case 'number':
    default:
      return typeof value === 'number' ? value.toLocaleString() : String(value)
  }
}
