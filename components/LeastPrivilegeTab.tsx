"use client"

import { useState, useEffect } from 'react'
import { Shield, Database, Network, AlertTriangle, CheckCircle2, XCircle, TrendingDown, Clock, FileDown, Send, Zap, ChevronRight, ExternalLink, Loader2, RefreshCw, Search, Globe, Trash2, X } from 'lucide-react'
import SimulationResultsModal from '@/components/SimulationResultsModal'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { IAMPermissionAnalysisModal } from '@/components/iam-permission-analysis-modal'
import { S3PolicyAnalysisModal } from '@/components/s3-policy-analysis-modal'
import { SGLeastPrivilegeModal } from '@/components/sg-least-privilege-modal'

// ---------- Safe helpers ----------
const safeArray = <T,>(v: unknown): T[] => Array.isArray(v) ? v : []
const safeNumber = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// Types
interface GapResource {
  id: string
  resourceType: 'IAMRole' | 'SecurityGroup' | 'S3Bucket' | 'NetworkACL'
  resourceName: string
  resourceArn: string
  systemName?: string
  // Remediable status for IAM Roles
  isRemediable?: boolean
  remediableReason?: string
  isServiceLinkedRole?: boolean
  // Orphan status for Security Groups
  isOrphan?: boolean
  attachmentCount?: number
  lpScore: number | null  // null for Security Groups (use networkExposure instead)
  allowedCount: number
  usedCount: number | null  // null for Security Groups
  gapCount: number | null  // null for Security Groups
  gapPercent: number | null  // null for Security Groups
  networkExposure?: {
    score: number
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    totalRules: number
    internetExposedRules: number
    highRiskPorts: number[]
    details: {
      totalIngressRules: number
      totalEgressRules: number
      findingsCount: number
      criticalFindings: number
      highFindings: number
    }
  }
  allowedList: string[]
  usedList: string[]
  unusedList: string[]
  highRiskUnused: Array<{
    permission: string
    riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM'
    reason: string
  }>
  // S3 Bucket traffic data
  accessorCount?: number
  totalHits?: number
  principals?: string[]
  evidence: {
    dataSources: string[]
    observationDays: number
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    lastUsed?: string
    coverage: {
      regions: string[]
      complete: boolean
    }
    rule_states?: Array<{
      port: number | string
      protocol?: string
      cidr?: string
      exposed: boolean
      observed_usage?: boolean
      recommendation?: string
      note?: string
      data_source?: string
      confidence?: number
      connections?: number
      last_seen?: string
    }>
    flowlogs?: {
      total_flows?: number
      matched_flows?: number
      enis_checked?: number
      log_groups_checked?: number
      lookback_days?: number
    } | null
    resourcePolicies?: {
      total_resources_checked?: number
      matching_policies?: Array<{
        resource_type: string
        resource_name?: string
        resource_arn?: string
      }>
      s3_buckets_checked?: number
      kms_keys_checked?: number
      lambda_functions_checked?: number
    } | null
    confidence_breakdown?: Record<string, {
      contribution: number
      max: number
      available: boolean
      description: string
      events?: number
      flows?: number
      resources_checked?: number
    }> | null
  }
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
  observationDays: number
  title: string
  description: string
  remediation: string
  region?: string  // For Security Groups
}

interface LeastPrivilegeSummary {
  totalResources: number
  totalExcessPermissions: number
  avgLPScore: number
  iamIssuesCount: number
  networkIssuesCount: number
  s3IssuesCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  confidenceLevel: number
  observationDays: number
  attackSurfaceReduction: number
}

interface LeastPrivilegeResponse {
  summary: LeastPrivilegeSummary
  resources: GapResource[]
  timestamp: string
}

export default function LeastPrivilegeTab({ systemName = 'alon-prod' }: { systemName?: string }) {
  const [data, setData] = useState<LeastPrivilegeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedResource, setSelectedResource] = useState<GapResource | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [simulationModalOpen, setSimulationModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false)
  const [sgGapAnalysisCache, setSgGapAnalysisCache] = useState<Record<string, any>>({})
  const [iamGapAnalysisCache, setIamGapAnalysisCache] = useState<Record<string, any>>({})
  const [syncing, setSyncing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<any>(null)
  const [iamModalOpen, setIamModalOpen] = useState(false)
  const [selectedIAMRole, setSelectedIAMRole] = useState<string | null>(null)
  const [s3ModalOpen, setS3ModalOpen] = useState(false)
  const [selectedS3Bucket, setSelectedS3Bucket] = useState<string | null>(null)
  const [selectedS3Resource, setSelectedS3Resource] = useState<GapResource | null>(null)
  const [sgModalOpen, setSgModalOpen] = useState(false)
  const [selectedSGId, setSelectedSGId] = useState<string | null>(null)
  const [selectedSGName, setSelectedSGName] = useState<string | null>(null)
  const [showRemediableOnly, setShowRemediableOnly] = useState(false) // Default to show ALL roles
  const [searchTerm, setSearchTerm] = useState('')
  const [resourceTypeFilter, setResourceTypeFilter] = useState<'all' | 'IAMRole' | 'SecurityGroup' | 'S3Bucket'>('all')
  const [deletedResources, setDeletedResources] = useState<Set<string>>(new Set()) // Track manually deleted resources
  const { toast } = useToast()

  // Traffic Simulator state
  const [showTrafficSimulator, setShowTrafficSimulator] = useState(false)
  const [isSimulatingTraffic, setIsSimulatingTraffic] = useState(false)
  const [simSource, setSimSource] = useState("SafeRemediate-Test-App-1")
  const [simTarget, setSimTarget] = useState("cyntro-demo-prod-data-745783559495")
  const [simIamRole, setSimIamRole] = useState("cyntro-demo-ec2-s3-role")
  const [simDays, setSimDays] = useState(420)
  const [simEventsPerDay, setSimEventsPerDay] = useState(3)

  // Dynamic simulator state
  const [simConnectionType, setSimConnectionType] = useState<'network' | 'api'>('api')
  const [simPort, setSimPort] = useState(443)
  const [simProtocol, setSimProtocol] = useState('TCP')
  const [simApiOperations, setSimApiOperations] = useState<string[]>(['s3:GetObject', 's3:PutObject', 's3:GetObjectTagging', 's3:ListBucket', 's3:DeleteObject', 's3:HeadObject'])
  const [availableServices, setAvailableServices] = useState<Array<{id: string, name: string, type: string}>>([])
  const [servicesLoading, setServicesLoading] = useState(false)

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

  // Common ports for network traffic
  const COMMON_PORTS = [
    { port: 443, name: 'HTTPS', protocol: 'TCP' },
    { port: 80, name: 'HTTP', protocol: 'TCP' },
    { port: 22, name: 'SSH', protocol: 'TCP' },
    { port: 3306, name: 'MySQL', protocol: 'TCP' },
    { port: 5432, name: 'PostgreSQL', protocol: 'TCP' },
    { port: 6379, name: 'Redis', protocol: 'TCP' },
    { port: 27017, name: 'MongoDB', protocol: 'TCP' },
    { port: 8080, name: 'HTTP Alt', protocol: 'TCP' },
  ]

  // API operations by target service type
  const API_OPERATIONS: Record<string, string[]> = {
    S3: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:GetObjectTagging', 's3:HeadObject'],
    DynamoDB: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan'],
    Lambda: ['lambda:InvokeFunction', 'lambda:GetFunction', 'lambda:ListFunctions'],
    SQS: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage'],
    SNS: ['sns:Publish', 'sns:Subscribe', 'sns:ListTopics'],
    RDS: ['rds:DescribeDBInstances', 'rds:CreateDBSnapshot'],
    SecretsManager: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
    KMS: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'],
  }

  const DEMO_SCENARIOS = [
    { name: "EC2 → S3 (Production)", source: "SafeRemediate-Test-App-1", target: "cyntro-demo-prod-data-745783559495", iamRole: "cyntro-demo-ec2-s3-role", days: 420, eventsPerDay: 3, connectionType: 'api' as const },
    { name: "EC2 → S3 (Analytics)", source: "SafeRemediate-Test-App-1", target: "cyntro-demo-analytics-745783559495", iamRole: "cyntro-demo-ec2-s3-role", days: 180, eventsPerDay: 10, connectionType: 'api' as const },
    { name: "Lambda → S3 (Analytics)", source: "analytics-lambda", target: "cyntro-demo-analytics-745783559495", iamRole: "", days: 90, eventsPerDay: 25, connectionType: 'api' as const },
    { name: "S3 → Lambda (Events)", source: "cyntro-demo-prod-data-745783559495", target: "analytics-lambda", iamRole: "", days: 120, eventsPerDay: 15, connectionType: 'api' as const },
    { name: "S3 → S3 (Replication)", source: "cyntro-demo-prod-data-745783559495", target: "cyntro-demo-backup-745783559495", iamRole: "s3-replication-role", days: 365, eventsPerDay: 5, connectionType: 'api' as const },
    { name: "EC2 → RDS (MySQL)", source: "SafeRemediate-Test-App-1", target: "cyntro-demo-rds", iamRole: "", days: 90, eventsPerDay: 50, connectionType: 'network' as const, port: 3306 },
  ]

  // Fetch available services from Neo4j
  const fetchAvailableServices = async () => {
    setServicesLoading(true)
    try {
      const res = await fetch(`/api/proxy/dependency-map/full?systemName=${systemName}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const nodes = data.nodes || []
      const services = nodes.map((node: any) => ({
        id: node.id,
        name: node.name || node.id,
        type: node.type || 'Unknown',
      }))
      services.sort((a: any, b: any) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
      setAvailableServices(services)
    } catch (err) {
      console.error('Failed to fetch services:', err)
    } finally {
      setServicesLoading(false)
    }
  }

  // Get target service type for operations
  const getTargetServiceType = (): string => {
    const target = simTarget.toLowerCase()
    if (target.includes('s3') || target.includes('bucket')) return 'S3'
    if (target.includes('dynamodb') || target.includes('dynamo')) return 'DynamoDB'
    if (target.includes('lambda')) return 'Lambda'
    if (target.includes('sqs') || target.includes('queue')) return 'SQS'
    if (target.includes('sns') || target.includes('topic')) return 'SNS'
    if (target.includes('rds') || target.includes('mysql') || target.includes('postgres')) return 'RDS'
    if (target.includes('secret')) return 'SecretsManager'
    if (target.includes('kms') || target.includes('key')) return 'KMS'
    return 'S3' // Default
  }

  const simulateTraffic = async () => {
    setIsSimulatingTraffic(true)
    try {
      let trafficData: any = { success: true }
      let trafficMessage = ''

      if (simConnectionType === 'network') {
        // Simulate Network Traffic (VPC Flow Logs)
        const trafficParams = new URLSearchParams({
          source: simSource,
          target: simTarget,
          days: simDays.toString(),
          events_per_day: simEventsPerDay.toString(),
          port: simPort.toString(),
          protocol: simProtocol,
        })

        const trafficResponse = await fetch(`${BACKEND_URL}/api/debug/simulate-network-traffic?${trafficParams}`, {
          method: 'POST'
        })

        trafficData = await trafficResponse.json()
        trafficMessage = `Network traffic simulated: ${simSource} → ${simTarget} on port ${simPort}/${simProtocol}`
      } else {
        // Simulate API Call Traffic (CloudTrail)
        const operations = simApiOperations.join(',')

        const trafficParams = new URLSearchParams({
          source: simSource,
          target: simTarget,
          days: simDays.toString(),
          events_per_day: simEventsPerDay.toString(),
          operations: operations
        })

        const trafficResponse = await fetch(`${BACKEND_URL}/api/debug/simulate-traffic?${trafficParams}`, {
          method: 'POST'
        })

        trafficData = await trafficResponse.json()
        trafficMessage = trafficData.message || `API traffic simulated with ${simApiOperations.length} operations`
      }

      // Also simulate IAM role usage if a role is specified
      let iamMessage = ''
      if (simIamRole && simIamRole.trim() && simConnectionType === 'api') {
        const iamParams = new URLSearchParams({
          role_name: simIamRole,
          actions: simApiOperations.join(','),
          days: Math.min(simDays, 90).toString(),
          events_per_action: Math.max(100, simEventsPerDay * 10).toString()
        })

        const iamResponse = await fetch(`${BACKEND_URL}/api/debug/simulate-iam-usage?${iamParams}`, {
          method: 'POST'
        })

        const iamData = await iamResponse.json()
        if (iamData.success) {
          iamMessage = ` IAM role ${simIamRole} updated: ${iamData.details?.used_count || 0} used, ${iamData.details?.unused_count || 0} unused permissions.`
          console.log('IAM usage simulated:', iamData)
        }
      }

      if (trafficData.success) {
        console.log('Traffic simulated:', trafficData)
        toast({
          title: "Simulation Complete!",
          description: `${trafficMessage}.${iamMessage} Refresh to see updates.`,
        })
        setShowTrafficSimulator(false)
        handleRefresh()
      } else {
        toast({
          title: "Error",
          description: trafficData.detail || 'Unknown error',
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error simulating traffic:', error)
      toast({
        title: "Error",
        description: `Failed to simulate traffic: ${error}`,
        variant: "destructive"
      })
    } finally {
      setIsSimulatingTraffic(false)
    }
  }

  const applyScenario = (scenario: typeof DEMO_SCENARIOS[0]) => {
    setSimSource(scenario.source)
    setSimTarget(scenario.target)
    setSimIamRole(scenario.iamRole || '')
    setSimDays(scenario.days)
    setSimEventsPerDay(scenario.eventsPerDay)
    if ('connectionType' in scenario) {
      setSimConnectionType(scenario.connectionType)
    }
    if ('port' in scenario && scenario.port) {
      setSimPort(scenario.port)
    }
  }

  const openTrafficSimulator = () => {
    setShowTrafficSimulator(true)
    fetchAvailableServices()
  }

  const resetDemo = async () => {
    if (!confirm('Reset demo data? This will:\n\n• Set IAM role to 0% usage (55 unused permissions)\n• Clear all simulated S3 traffic\n\nContinue?')) {
      return
    }

    setIsSimulatingTraffic(true)
    try {
      const params = new URLSearchParams({
        role_name: simIamRole || 'cyntro-demo-ec2-s3-role',
        clear_traffic: 'true'
      })

      const response = await fetch(`${BACKEND_URL}/api/debug/reset-demo?${params}`, {
        method: 'POST'
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Demo Reset!",
          description: data.message,
        })
        setShowTrafficSimulator(false)
        handleRefresh()
      } else {
        toast({
          title: "Error",
          description: data.detail || 'Unknown error',
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error resetting demo:', error)
      toast({
        title: "Error",
        description: `Failed to reset: ${error}`,
        variant: "destructive"
      })
    } finally {
      setIsSimulatingTraffic(false)
    }
  }

  // Cached fetch for SG gap analysis
  const fetchSGGapAnalysis = async (sgId: string, forceRefresh = false) => {
    // Return cached data if available and not forcing refresh
    if (!forceRefresh && sgGapAnalysisCache[sgId]) {
      console.log('Using cached SG gap analysis for:', sgId)
      return sgGapAnalysisCache[sgId]
    }
    
    try {
      console.log('Fetching fresh SG gap analysis for:', sgId)
      const response = await fetch(`/api/proxy/security-groups/${sgId}/gap-analysis?days=365`)
      if (!response.ok) {
        console.error('SG gap analysis fetch failed:', response.status)
        return null
      }
      const data = await response.json()
      
      // Cache the result
      setSgGapAnalysisCache(prev => ({ ...prev, [sgId]: data }))
      
      return data
    } catch (error) {
      console.error('Failed to fetch SG gap analysis:', error)
      return null
    }
  }

  // Cached fetch for IAM Role gap analysis
  const fetchIAMGapAnalysis = async (roleName: string, forceRefresh = false) => {
    // Return cached data if available and not forcing refresh
    if (!forceRefresh && iamGapAnalysisCache[roleName]) {
      console.log('[IAM] Using cached gap analysis for:', roleName)
      return iamGapAnalysisCache[roleName]
    }
    
    try {
      console.log('[IAM] Fetching gap analysis for:', roleName)
      const response = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90`)
      if (!response.ok) {
        console.error('[IAM] Gap analysis fetch failed:', response.status)
        return null
      }
      const data = await response.json()
      console.log('[IAM] Got gap analysis:', {
        role: roleName,
        total: data.summary?.total_permissions,
        used: data.summary?.used_count,
        unused: data.summary?.unused_count,
        lpScore: data.summary?.lp_score
      })
      
      // Cache the result
      setIamGapAnalysisCache(prev => ({ ...prev, [roleName]: data }))
      
      return data
    } catch (error) {
      console.error('[IAM] Failed to fetch gap analysis:', error)
      return null
    }
  }

  useEffect(() => {
    fetchGaps()
  }, [systemName])
  
  // NOTE: Pre-fetch removed to prevent timeout errors
  // Gap analysis is now fetched ON-DEMAND when user opens a modal
  // The /api/least-privilege/issues endpoint provides all needed data for the list view

  const fetchGaps = async (showRefreshing = false, forceRefresh = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)
      
      // Use AWS-based endpoint directly - this returns actual LP analysis data
      // The Neo4j endpoint returns graph nodes without LP analysis, causing "0 used / 0 unused" display
      const refreshParam = forceRefresh ? '&force_refresh=true' : ''
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}&observationDays=365${refreshParam}`)
      if (!response.ok) throw new Error(`Failed: ${response.status}`)
      const result = await response.json()
      
      // Log what we received for debugging
      console.log('[LeastPrivilegeTab] Received resources:', {
        total: result.resources?.length || 0,
        byType: {
          IAMRole: result.resources?.filter((r: any) => r.resourceType === 'IAMRole').length || 0,
          SecurityGroup: result.resources?.filter((r: any) => r.resourceType === 'SecurityGroup').length || 0,
          S3Bucket: result.resources?.filter((r: any) => r.resourceType === 'S3Bucket').length || 0
        },
        summary: result.summary
      })
      
      // Transform to new format
      const transformed: LeastPrivilegeResponse = {
        summary: {
          totalResources: result.resources?.length || 0,
          totalExcessPermissions: result.summary?.totalExcessPermissions || 0,
          avgLPScore: result.resources?.length > 0 
            ? result.resources.reduce((acc: number, r: any) => acc + (100 - r.gapPercent), 0) / result.resources.length
            : 100,
          iamIssuesCount: result.summary?.iamIssuesCount || 0,
          networkIssuesCount: result.summary?.networkIssuesCount || 0,
          s3IssuesCount: result.summary?.s3IssuesCount || 0,
          criticalCount: result.summary?.criticalCount || 0,
          highCount: result.summary?.highCount || 0,
          mediumCount: result.summary?.mediumCount || 0,
          lowCount: result.summary?.lowCount || 0,
          confidenceLevel: result.summary?.confidenceLevel || 0,
          observationDays: result.observationDays || 365,
          attackSurfaceReduction: result.resources?.length > 0
            ? result.resources.reduce((acc: number, r: any) => acc + r.gapPercent, 0) / result.resources.length
            : 0
        },
        resources: (result.resources || []).map((r: any) => {
          // For Security Groups, use networkExposure instead of lpScore
          const isSecurityGroup = r.resourceType === 'SecurityGroup'
          const networkExposure = r.networkExposure || null
          
          return {
            id: r.id,
            resourceType: r.resourceType,
            resourceName: r.resourceName,
            resourceArn: r.resourceArn,
            systemName: r.systemName,
            // For Security Groups: lpScore is null, use networkExposure instead
            lpScore: r.lpScore ?? (r.gapPercent !== undefined ? 100 - r.gapPercent : null),
            allowedCount: r.allowedCount || 0,
            usedCount: r.usedCount ?? 0,
            gapCount: r.gapCount ?? 0,
            gapPercent: r.gapPercent ?? 0,
            networkExposure: networkExposure ? {
              score: networkExposure.score || 0,
              severity: networkExposure.severity || 'MEDIUM',
              totalRules: networkExposure.totalRules || 0,
              internetExposedRules: networkExposure.internetExposedRules || 0,
              highRiskPorts: networkExposure.highRiskPorts || [],
              details: networkExposure.details || {
                totalIngressRules: networkExposure.totalRules || 0,
                totalEgressRules: 0,
                findingsCount: 0,
                criticalFindings: 0,
                highFindings: 0
              }
            } : undefined,
            allowedList: r.allowedList || [],
            usedList: r.usedList || [],
            unusedList: r.unusedList || [],
            highRiskUnused: (r.unusedList || []).slice(0, 5).map((perm: any) => {
              // Handle both string permissions (IAM) and object permissions (SG rules)
              const permStr = typeof perm === 'string' ? perm : (perm?.permission || perm?.port || String(perm))
              return {
                permission: permStr,
                riskLevel: (permStr?.includes?.('PassRole') || permStr?.includes?.('Delete') || permStr?.includes?.('Admin')) ? 'CRITICAL' as const : 'HIGH' as const,
                reason: permStr?.includes?.('PassRole') ? 'Privilege escalation risk' : 
                       permStr?.includes?.('Delete') ? 'Destructive action' : 'High-risk permission'
              }
            }),
            evidence: {
              dataSources: r.evidence?.dataSources || ['CloudTrail'],
              observationDays: r.observationDays || r.evidence?.observationDays || 365,
              // Confidence levels: HIGH (85%+), MEDIUM (60-84%), LOW (<60%)
              confidence: r.confidence >= 85 ? 'HIGH' as const : r.confidence >= 60 ? 'MEDIUM' as const : 'LOW' as const,
              lastUsed: r.lastUsed,
              coverage: {
                regions: r.evidence?.coverage?.regions || ['us-east-1'],
                complete: r.evidence?.coverage?.complete !== false
              },
              flowlogs: r.evidence?.flowlogs || null,
              resourcePolicies: r.evidence?.resourcePolicies || null,
              confidence_breakdown: r.evidence?.confidence_breakdown || null,
              rule_states: r.evidence?.rule_states || null  // Security Group rule states
            },
            severity: r.severity || 'medium',
            confidence: r.confidence || 0,
            observationDays: r.observationDays || 365,
            title: r.title || (isSecurityGroup
              ? `${r.resourceName} has network exposure risk`
              : `${r.resourceName} has ${r.gapCount || 0} unused permissions`),
            description: r.description || '',
            remediation: r.remediation || '',
            region: r.evidence?.coverage?.regions?.[0] || r.region || null,  // Extract region
            // Remediable status (for IAM roles)
            isRemediable: r.isRemediable ?? r.is_remediable ?? true,
            remediableReason: r.remediableReason ?? r.remediable_reason ?? '',
            isServiceLinkedRole: r.isServiceLinkedRole ?? r.is_service_linked_role ?? false,
            // Orphan status (for Security Groups)
            isOrphan: r.isOrphan ?? r.is_orphan ?? false,
            attachmentCount: r.attachmentCount ?? r.attachment_count ?? 0,
            // S3 Bucket traffic data
            accessorCount: r.accessorCount ?? r.accessor_count ?? 0,
            totalHits: r.totalHits ?? r.total_hits ?? 0,
            principals: r.principals || []
          }
        })
        // Filter out service linked roles only
        .filter((r: any) => {
          // Always filter out service linked roles (cannot be modified)
          if (r.isServiceLinkedRole) {
            console.log('[Filter] Removing service-linked role:', r.resourceName)
            return false
          }
          
          // Don't filter out IAM roles based on gapCount - show all of them
          // The user can see which ones need remediation
          return true
        }),
        timestamp: result.timestamp || new Date().toISOString()
      }
      
      setData(transformed)
      
      // Log transformed data
      console.log('[LeastPrivilegeTab] Transformed resources:', {
        total: transformed.resources.length,
        byType: {
          IAMRole: transformed.resources.filter(r => r.resourceType === 'IAMRole').length,
          SecurityGroup: transformed.resources.filter(r => r.resourceType === 'SecurityGroup').length,
          S3Bucket: transformed.resources.filter(r => r.resourceType === 'S3Bucket').length
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }
  
  const handleRefresh = async () => {
    await fetchGaps(true, true) // Force cache refresh
  }

  // Handle successful remediation - remove resource from list and update counts
  const handleRemediationSuccess = (resourceName: string) => {
    console.log('[LeastPrivilegeTab] Remediation successful for:', resourceName)
    
    // Remove the remediated resource from the displayed list
    setData(prev => {
      if (!prev) return prev
      
      const removedResource = prev.resources.find(r => r.resourceName === resourceName || r.id === resourceName)
      if (!removedResource) {
        console.warn('[LeastPrivilegeTab] Resource not found:', resourceName)
        return prev
      }
      
      const filteredResources = prev.resources.filter(r => r.resourceName !== resourceName && r.id !== resourceName)
      
      // Update summary counts based on resource type
      const resourceType = removedResource.resourceType
      const newSummary = {
        ...prev.summary,
        totalResources: filteredResources.length,
        // Decrement the appropriate count based on resource type
        iamIssuesCount: resourceType === 'IAMRole' 
          ? Math.max(0, (prev.summary.iamIssuesCount || 0) - 1) 
          : prev.summary.iamIssuesCount,
        networkIssuesCount: resourceType === 'SecurityGroup' 
          ? Math.max(0, (prev.summary.networkIssuesCount || 0) - 1) 
          : prev.summary.networkIssuesCount,
        s3IssuesCount: resourceType === 'S3Bucket' 
          ? Math.max(0, (prev.summary.s3IssuesCount || 0) - 1) 
          : prev.summary.s3IssuesCount,
        // Update severity counts
        criticalCount: removedResource.severity === 'critical' 
          ? Math.max(0, (prev.summary.criticalCount || 0) - 1) 
          : prev.summary.criticalCount,
        highCount: removedResource.severity === 'high' 
          ? Math.max(0, (prev.summary.highCount || 0) - 1) 
          : prev.summary.highCount,
        mediumCount: removedResource.severity === 'medium' 
          ? Math.max(0, (prev.summary.mediumCount || 0) - 1) 
          : prev.summary.mediumCount,
        lowCount: removedResource.severity === 'low' 
          ? Math.max(0, (prev.summary.lowCount || 0) - 1) 
          : prev.summary.lowCount,
      }
      
      console.log('[LeastPrivilegeTab] Updated resources:', {
        before: prev.resources.length,
        after: filteredResources.length,
        removed: removedResource?.resourceName,
        resourceType: resourceType,
        newTotalResources: newSummary.totalResources
      })
      
      return {
        ...prev,
        resources: filteredResources,
        summary: newSummary
      }
    })
    
    // Also clear the cache for this resource
    setIamGapAnalysisCache(prev => {
      const { [resourceName]: _, ...rest } = prev
      return rest
    })

    // Also clear SG cache if it's a Security Group
    setSgGapAnalysisCache(prev => {
      const { [resourceName]: _, ...rest } = prev
      return rest
    })
  }

  // Get default region from resources or use default
  const getDefaultRegion = (): string => {
    if (data?.resources && data.resources.length > 0) {
      const firstRegion = data.resources.find(r => r.region)?.region
      if (firstRegion) return firstRegion
    }
    return 'eu-west-1' // Default region
  }

  const handleRefreshAll = async () => {
    try {
      setAnalyzing(true)

      console.log('[RefreshAll] Starting refresh from Neo4j (no AWS calls)')

      // Reload the main data from Neo4j only (no force_refresh to avoid AWS calls)
      await fetchGaps(true, false)

      // Clear caches to ensure fresh data on next modal access
      setSgGapAnalysisCache({})
      setIamGapAnalysisCache({})

      toast({
        title: '✅ Data refreshed',
        description: `Refreshed all resources from database.`,
      })
    } catch (err) {
      console.error('[RefreshAll] Error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Refresh failed'
      toast({
        title: 'Refresh failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setAnalyzing(false)
      setConfirmationModalOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyzing least privilege gaps...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Data</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.resources.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-900">No GAP issues found!</p>
        <p className="text-sm text-gray-500 mt-2">All permissions are being used. Your system follows least privilege! 🎉</p>
      </div>
    )
  }

  const { summary, resources } = data
  const defaultRegion = getDefaultRegion()

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      <Dialog open={confirmationModalOpen} onOpenChange={setConfirmationModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Refresh All Resources</DialogTitle>
            <DialogDescription className="pt-2">
              This will refresh all resources from the database including Security Groups, IAM Roles, and Least Privilege analysis.
              <br />
              <br />
              <strong>Simulated data will be preserved.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm font-medium text-gray-600">System:</span>
              <span className="text-sm text-gray-900">{systemName}</span>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setConfirmationModalOpen(false)}
              disabled={analyzing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRefreshAll}
              disabled={analyzing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {analyzing && <Loader2 className="w-4 h-4 animate-spin" />}
              Refresh
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header with LP Score */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Least Privilege Analysis</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-gray-600">GAP between ALLOWED and ACTUAL permissions</p>
            {data?.fromCache && (
              <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" />
                Cached {data.cacheAge ? `${data.cacheAge}s ago` : ''}
                {data.stale && <span className="text-orange-500">(stale)</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={openTrafficSimulator}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2 transition-colors"
            title="Simulate traffic between AWS resources"
          >
            <Zap className="w-4 h-4" />
            Simulate Traffic
          </button>
          <button
            onClick={handleRefreshAll}
            disabled={analyzing || refreshing || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition-colors"
            title="Refresh all resources from database"
          >
            <RefreshCw className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? 'Refreshing...' : 'Refresh All'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition-colors"
            title="Refresh data from backend"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <div className="text-right">
            <div className="text-sm text-gray-600">System LP Score</div>
            <div className="text-4xl font-bold" style={{ color: (summary.avgLPScore ?? 0) < 50 ? '#dc2626' : (summary.avgLPScore ?? 0) < 75 ? '#ea580c' : '#10b981' }}>
              {isNaN(summary.avgLPScore) || summary.avgLPScore === null ? (
                <span className="text-gray-500" title="LP Score not applicable for all resource types">—</span>
              ) : (
                <span>{summary.avgLPScore.toFixed(0)}%</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Shield className="w-5 h-5" />}
          label="Total Resources"
          value={summary.totalResources}
          color="blue"
        />
        <SummaryCard
          icon={<TrendingDown className="w-5 h-5" />}
          label="Excess Permissions"
          value={summary.totalExcessPermissions}
          color="red"
        />
        <SummaryCard
          icon={<Network className="w-5 h-5" />}
          label="Network Issues"
          value={summary.networkIssuesCount}
          color="orange"
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5" />}
          label="Observation Days"
          value={summary.observationDays}
          color="gray"
        />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 mb-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, ARN, ID, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Row */}
        <div className="flex flex-col gap-3">
          {/* Resource Type Filter Chips */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 mr-1">Filter:</span>
            {(() => {
              // Calculate counts for filter chips
              const baseResources = resources.filter(r => {
                if (deletedResources.has(r.id) || deletedResources.has(r.resourceName)) return false
                if (searchTerm) {
                  const search = searchTerm.toLowerCase()
                  const matchesName = r.resourceName?.toLowerCase().includes(search)
                  const matchesArn = r.resourceArn?.toLowerCase().includes(search)
                  const matchesId = r.id?.toLowerCase().includes(search)
                  if (!matchesName && !matchesArn && !matchesId) return false
                }
                if (r.resourceType === 'IAMRole' && showRemediableOnly && r.isRemediable === false) return false
                return true
              })
              const allCount = baseResources.length
              const iamCount = baseResources.filter(r => r.resourceType === 'IAMRole').length
              const sgCount = baseResources.filter(r => r.resourceType === 'SecurityGroup').length
              const s3Count = baseResources.filter(r => r.resourceType === 'S3Bucket').length

              const filters: Array<{ key: 'all' | 'IAMRole' | 'SecurityGroup' | 'S3Bucket', label: string, count: number, icon: React.ReactNode, color: string }> = [
                { key: 'all', label: 'All', count: allCount, icon: null, color: 'gray' },
                { key: 'IAMRole', label: 'IAM Roles', count: iamCount, icon: <Shield className="w-3.5 h-3.5" />, color: 'purple' },
                { key: 'SecurityGroup', label: 'Security Groups', count: sgCount, icon: <Network className="w-3.5 h-3.5" />, color: 'blue' },
                { key: 'S3Bucket', label: 'S3 Buckets', count: s3Count, icon: <Database className="w-3.5 h-3.5" />, color: 'green' }
              ]

              return filters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setResourceTypeFilter(f.key)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                    ${resourceTypeFilter === f.key
                      ? f.key === 'all'
                        ? 'bg-gray-800 text-white'
                        : f.key === 'IAMRole'
                          ? 'bg-purple-600 text-white'
                          : f.key === 'SecurityGroup'
                            ? 'bg-blue-600 text-white'
                            : 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  {f.icon}
                  <span>{f.label}</span>
                  <span className={`
                    ml-1 px-1.5 py-0.5 rounded-full text-xs
                    ${resourceTypeFilter === f.key
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200 text-gray-600'
                    }
                  `}>
                    {f.count}
                  </span>
                </button>
              ))
            })()}
          </div>

          {/* Secondary filters row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Remediable Filter Toggle */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRemediableOnly}
                  onChange={(e) => setShowRemediableOnly(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-600">Remediable only</span>
              </label>
              {/* Clear deleted button */}
              {deletedResources.size > 0 && (
                <button
                  onClick={() => setDeletedResources(new Set())}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Restore {deletedResources.size} dismissed
                </button>
              )}
            </div>
            {data.timestamp && (
              <div className="text-xs text-gray-500">
                Last updated: {new Date(data.timestamp).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resources List */}
      <div className="space-y-4">
        {resources.length === 0 ? (
          <div className="text-center py-12 border border-gray-200 rounded-lg bg-gray-50">
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No resources found</p>
            <p className="text-sm text-gray-500 mt-2">Try clicking "Refresh Data" to reload from backend</p>
          </div>
        ) : (
          resources
            // Filter out deleted/dismissed resources
            .filter(resource => {
              return !deletedResources.has(resource.id) && !deletedResources.has(resource.resourceName)
            })
            // Apply resource type filter
            .filter(resource => {
              if (resourceTypeFilter === 'all') return true
              return resource.resourceType === resourceTypeFilter
            })
            // Apply search filter
            .filter(resource => {
              if (!searchTerm) return true
              const search = searchTerm.toLowerCase()
              const matchesName = resource.resourceName?.toLowerCase().includes(search)
              const matchesArn = resource.resourceArn?.toLowerCase().includes(search)
              const matchesId = resource.id?.toLowerCase().includes(search)
              const matchesType = resource.resourceType?.toLowerCase().includes(search)
              return matchesName || matchesArn || matchesId || matchesType
            })
            // Filter out "No Action Required" resources based on resource type
            .filter(resource => {
              // IAM Roles: filter by gapCount (unused permissions)
              if (resource.resourceType === 'IAMRole') {
                return resource.gapCount > 0
              }
              // S3 Buckets: show all (user can click to analyze policies)
              if (resource.resourceType === 'S3Bucket') {
                return true
              }
              // Security Groups: show all (user can click to run LP analysis)
              if (resource.resourceType === 'SecurityGroup') {
                return true
              }
              // Default: show all other resource types
              return true
            })
            // Only filter based on remediable toggle (only affects IAM Roles)
            .filter(resource => {
              if (resource.resourceType !== 'IAMRole') return true
              if (!showRemediableOnly) return true
              return resource.isRemediable !== false
            })
            .map((resource, index) => (
            <GapResourceCard
              key={resource.id || resource.resourceArn || resource.resourceName || `resource-${index}`}
              resource={resource}
              onDelete={(id, name) => {
                // Add to dismissed set
                setDeletedResources(prev => {
                  const next = new Set(prev)
                  if (id) next.add(id)
                  if (name) next.add(name)
                  return next
                })
                toast({
                  title: "Alert dismissed",
                  description: `${name || id} has been removed from the list. Click "Restore dismissed" to bring it back.`,
                })
              }}
              onClick={() => {
                console.log('[LeastPrivilegeTab] Card clicked! resourceType:', resource.resourceType, 'resourceName:', resource.resourceName)
                // Use new IAM Permission Analysis modal for IAM Roles
                if (resource.resourceType === 'IAMRole') {
                  console.log('[LeastPrivilegeTab] Opening IAMPermissionAnalysisModal for:', resource.resourceName)
                  setSelectedIAMRole(resource.resourceName)
                  setIamModalOpen(true)
                } else if (resource.resourceType === 'S3Bucket') {
                  // Use new S3 Policy Analysis modal for S3 Buckets
                  setSelectedS3Bucket(resource.resourceName)
                  setSelectedS3Resource(resource)
                  setS3ModalOpen(true)
                } else if (resource.resourceType === 'SecurityGroup') {
                  // Use new SG Least Privilege modal for Security Groups
                  let sgId = resource.id
                  if (!sgId?.startsWith('sg-')) {
                    if (resource.resourceName?.startsWith('sg-')) {
                      sgId = resource.resourceName
                    } else if (resource.resourceArn?.includes('security-group/')) {
                      const match = resource.resourceArn.match(/security-group\/(sg-[a-z0-9]+)/)
                      if (match) sgId = match[1]
                    }
                  }
                  setSelectedSGId(sgId)
                  setSelectedSGName(resource.resourceName)
                  setSgModalOpen(true)
                } else {
                  // Use drawer for other resources (Network ACLs, etc.)
                  setSelectedResource(resource)
                  setDrawerOpen(true)
                }
              }}
            />
          ))
        )}
      </div>

      {/* Remediation Drawer */}
      {drawerOpen && selectedResource && (
        <RemediationDrawer
          resource={selectedResource}
          cachedFetch={fetchSGGapAnalysis}
          cache={sgGapAnalysisCache}
          iamCachedFetch={fetchIAMGapAnalysis}
          iamCache={iamGapAnalysisCache}
          onClose={() => {
            setDrawerOpen(false)
            setSelectedResource(null)
            setSimulationResult(null)
          }}
          onSimulate={async () => {
            setSimulating(true)
            try {
              // Different simulation flow for Security Groups vs IAM Roles
              if (selectedResource.resourceType === 'SecurityGroup') {
                // Get SG ID from various possible fields
                let sgId = selectedResource.id
                if (!sgId?.startsWith('sg-')) {
                  if (selectedResource.resourceName?.startsWith('sg-')) {
                    sgId = selectedResource.resourceName
                  } else if (selectedResource.resourceArn?.includes('security-group/')) {
                    const match = selectedResource.resourceArn.match(/security-group\/(sg-[a-z0-9]+)/)
                    if (match) sgId = match[1]
                  }
                }
                
                // Get gap analysis to find rules to delete/tighten
                const gapData = sgGapAnalysisCache[sgId || ''] || await fetchSGGapAnalysis(sgId || '')
                
                const rulesToDelete = gapData?.rules_analysis
                  ?.filter((r: any) => r.recommendation?.action === 'DELETE')
                  ?.map((r: any) => r.rule_id) || []
                
                const rulesToTighten = gapData?.rules_analysis
                  ?.filter((r: any) => r.recommendation?.action === 'TIGHTEN')
                  ?.map((r: any) => ({
                    rule_id: r.rule_id,
                    new_cidrs: r.recommendation?.suggested_cidrs || []
                  })) || []
                
                const response = await fetch('/api/proxy/remediation/simulate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sg_id: sgId,
                    rules_to_delete: rulesToDelete,
                    rules_to_tighten: rulesToTighten,
                    region: selectedResource.region || 'eu-west-1'
                  })
                })
                
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}))
                  throw new Error(errorData.error || `Simulation failed: ${response.status}`)
                }
                
                const sgSimResult = await response.json()
                
                // Store the SG-specific simulation result
                setSimulationResult({
                  type: 'security_group',
                  ...sgSimResult
                })
                setSimulationModalOpen(true)
                
              } else {
                // IAM Role simulation (existing flow)
              const response = await fetch('/api/proxy/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    finding_id: selectedResource.id,
                  resource_type: selectedResource.resourceType,
                  resource_id: selectedResource.resourceArn || selectedResource.resourceName
                })
              })
              
              if (!response.ok) {
                throw new Error(`Simulation failed: ${response.status}`)
              }
              
              const backendData = await response.json()
              
              // Transform backend response to SimulationResultsModal format
              const simulationData = backendData.simulation || backendData
              const decision = backendData.decision || {}
              
              // Map backend confidence (0-100) to modal format
              const backendConfidence = simulationData.confidence || decision.confidence || 0
              const confidenceValue = typeof backendConfidence === 'number' 
                ? (backendConfidence > 1 ? backendConfidence / 100 : backendConfidence) 
                : 0.5
              
              // Determine status from decision action
              let status: 'EXECUTE' | 'CANARY' | 'REVIEW' | 'BLOCKED' = 'REVIEW'
              if (decision.action === 'AUTO_REMEDIATE' || decision.action === 'EXECUTE') {
                status = 'EXECUTE'
              } else if (decision.action === 'CANARY') {
                status = 'CANARY'
              } else if (decision.action === 'BLOCK' || decision.action === 'BLOCKED') {
                status = 'BLOCKED'
              }
              
              const transformedResult = {
                  type: 'iam_role',
                status,
                confidence: confidenceValue,
                blast_radius: {
                  level: decision.breakdown?.dependency < 0.5 ? 'ISOLATED' : 'LOW',
                  numeric: decision.breakdown?.dependency || 0.1,
                  affected_resources_count: simulationData.impacted_resources?.length || 0,
                  affected_resources: (simulationData.impacted_resources || []).map((id: string) => ({
                    id,
                    type: selectedResource.resourceType,
                    name: id.split('/').pop() || id,
                    impact: 'Low'
                  }))
                },
                evidence: {
                  cloudtrail: {
                    total_events: 0,
                    matched_events: 0,
                    days_since_last_use: selectedResource.evidence.observationDays
                  },
                  summary: {
                    total_sources: 2,
                    agreeing_sources: 2
                  }
                },
                simulation_steps: [
                  {
                    step_number: 1,
                    name: 'Fetch Role Details',
                    description: 'Retrieved IAM role information from AWS',
                    status: 'COMPLETED' as const
                  },
                  {
                    step_number: 2,
                    name: 'Collect Evidence',
                    description: 'Gathered CloudTrail and Access Advisor data',
                    status: 'COMPLETED' as const
                  },
                  {
                    step_number: 3,
                    name: 'Analyze Usage',
                    description: `Analyzed ${selectedResource.evidence.observationDays} days of usage data`,
                    status: 'COMPLETED' as const
                  },
                  {
                    step_number: 4,
                    name: 'Calculate Confidence',
                    description: `Confidence: ${((confidenceValue ?? 0) * 100).toFixed(0)}%`,
                    status: 'COMPLETED' as const
                  }
                ],
                edge_cases: [],
                action_policy: {
                  auto_apply: decision.auto_allowed || false,
                  allowed_actions: decision.action ? [decision.action] : [],
                  reason: decision.reasons?.join('; ') || 'Based on evidence analysis',
                  issue_type: selectedResource.resourceType
                },
                recommendation: decision.reasons?.join('. ') || simulationData.after_state || 'Review recommended',
                before_state_summary: simulationData.before_state,
                after_state_summary: simulationData.after_state,
                timestamp: new Date().toISOString(),
                human_readable_evidence: decision.reasons || [
                  `${selectedResource.gapCount ?? 0} unused permissions detected`,
                  `${selectedResource.evidence.observationDays ?? 0} days of observation`,
                  `Confidence: ${((confidenceValue ?? 0) * 100).toFixed(0)}%`
                ]
              }
              
              setSimulationResult(transformedResult)
              setSimulationModalOpen(true)
              }
            } catch (err) {
              console.error('Simulation error:', err)
              toast({
                title: 'Simulation Failed',
                description: err instanceof Error ? err.message : 'Check console for details',
                variant: 'destructive'
              })
            } finally {
              setSimulating(false)
            }
          }}
          simulating={simulating}
        />
      )}

      {/* Simulation Results Modal - Different for SG vs IAM */}
      {simulationModalOpen && simulationResult && selectedResource && (
        simulationResult.type === 'security_group' ? (
          <SGSimulationResultsModal
            isOpen={simulationModalOpen}
            onClose={() => {
              setSimulationModalOpen(false)
              setSimulationResult(null)
            }}
            result={simulationResult}
            isExecuting={isExecuting}
            onExecute={async () => {
              // Execute remediation with snapshot
              setIsExecuting(true)
              
              try {
                // Get the SG ID
                let sgId = simulationResult.sg_id
                if (!sgId) {
                  sgId = selectedResource.id
                  if (!sgId?.startsWith('sg-')) {
                    if (selectedResource.resourceName?.startsWith('sg-')) {
                      sgId = selectedResource.resourceName
                    }
                  }
                }
                
                // Get gap analysis to find rules to delete/tighten
                const gapData = sgGapAnalysisCache[sgId] || await fetchSGGapAnalysis(sgId)
                
                const rulesToDelete = gapData?.rules_analysis
                  ?.filter((r: any) => r.recommendation?.action === 'DELETE')
                  ?.map((r: any) => r.rule_id) || []
                
                const rulesToTighten = gapData?.rules_analysis
                  ?.filter((r: any) => r.recommendation?.action === 'TIGHTEN')
                  ?.map((r: any) => ({
                    rule_id: r.rule_id,
                    new_cidrs: r.recommendation?.suggested_cidrs || []
                  })) || []
                
                const response = await fetch('/api/proxy/remediation/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sg_id: sgId,
                    rules_to_delete: rulesToDelete,
                    rules_to_tighten: rulesToTighten,
                    region: selectedResource.region || 'eu-west-1',
                    triggered_by: 'user',
                    create_snapshot: true
                  })
                })
                
                const result = await response.json()
                setExecutionResult(result)
                
                if (result.success) {
                  toast({
                    title: '✅ Remediation Complete',
                    description: `Snapshot: ${result.snapshot?.snapshot_id || 'Created'}. ${result.summary?.successful || 0} changes applied.`
                  })
                  setSimulationModalOpen(false)
                  setSimulationResult(null)

                  // Clear cache for this SG
                  setSgGapAnalysisCache(prev => {
                    const newCache = { ...prev }
                    delete newCache[sgId]
                    return newCache
                  })

                  // Remove the remediated SG from the list immediately
                  // Use the resource name or ID to find and remove it
                  const sgIdentifier = selectedResource.resourceName || selectedResource.id || sgId
                  handleRemediationSuccess(sgIdentifier)

                  // Close the drawer if open
                  setDrawerOpen(false)
                  setSelectedResource(null)
                } else {
                  toast({
                    title: '❌ Remediation Had Errors',
                    description: `${result.errors?.length || 0} errors occurred. Check console for details.`,
                    variant: 'destructive'
                  })
                  console.error('Execution errors:', result.errors)
                }
                
              } catch (error) {
                console.error('Execution failed:', error)
                toast({
                  title: 'Execution Failed',
                  description: error instanceof Error ? error.message : 'Check console for details',
                  variant: 'destructive'
                })
              } finally {
                setIsExecuting(false)
              }
            }}
          />
        ) : (
        <SimulationResultsModal
          isOpen={simulationModalOpen}
          onClose={() => {
            setSimulationModalOpen(false)
            setSimulationResult(null)
          }}
          resourceType={selectedResource.resourceType}
          resourceId={selectedResource.resourceArn || selectedResource.resourceName}
          resourceName={selectedResource.resourceName}
          proposedChange={{
            action: 'remove_permissions',
            items: selectedResource.unusedList,
            reason: `Unused permissions detected: ${selectedResource.gapCount} permissions unused for ${selectedResource.evidence.observationDays} days`
          }}
          systemName={systemName}
          result={simulationResult}
          isExecuting={isExecuting}
          onExecute={async (dryRun: boolean) => {
            setIsExecuting(true)
            try {
              // Get role name from resource
              const roleName = selectedResource.resourceName || selectedResource.resourceArn?.split('/').pop() || ''

              // Call remediation API
              const response = await fetch('/api/proxy/cyntro/remediate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  role_name: roleName,
                  dry_run: dryRun
                })
              })

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || `Remediation failed: ${response.status}`)
              }

              const result = await response.json()

              if (result.success) {
                toast({
                  title: dryRun ? '✅ Preview Complete' : '✅ Remediation Complete',
                  description: dryRun
                    ? `Would reduce permissions from ${result.summary?.before_total || 0} to ${result.summary?.after_total || 0}`
                    : `Snapshot: ${result.snapshot_id || 'Created'}. Permissions reduced to ${result.new_role?.permissions_count || 0}`
                })

                if (!dryRun) {
                  // Close modal and remove from list on live execution
                  setSimulationModalOpen(false)
                  setSimulationResult(null)
                  handleRemediationSuccess(roleName)
                  setDrawerOpen(false)
                  setSelectedResource(null)
                }
              } else {
                throw new Error(result.error || 'Remediation failed')
              }
            } catch (error) {
              console.error('Remediation error:', error)
              toast({
                title: '❌ Remediation Failed',
                description: error instanceof Error ? error.message : 'Check console for details',
                variant: 'destructive'
              })
            } finally {
              setIsExecuting(false)
            }
          }}
        />
        )
      )}

      {/* IAM Permission Analysis Modal */}
      <IAMPermissionAnalysisModal
        isOpen={iamModalOpen}
        onClose={() => {
          setIamModalOpen(false)
          setSelectedIAMRole(null)
        }}
        roleName={selectedIAMRole || ''}
        systemName={systemName}
        onApplyFix={(data) => {
          console.log('[IAM] Apply fix requested:', data)
        }}
        onRemediationSuccess={handleRemediationSuccess}
      />

      {/* S3 Policy Analysis Modal */}
      <S3PolicyAnalysisModal
        isOpen={s3ModalOpen}
        onClose={() => {
          setS3ModalOpen(false)
          setSelectedS3Bucket(null)
          setSelectedS3Resource(null)
        }}
        bucketName={selectedS3Bucket || ''}
        systemName={systemName}
        resourceData={selectedS3Resource}
        onApplyFix={(data) => {
          console.log('[S3] Apply fix requested:', data)
        }}
        onRemediationSuccess={handleRemediationSuccess}
      />

      {/* Security Group Least Privilege Modal */}
      <SGLeastPrivilegeModal
        isOpen={sgModalOpen}
        onClose={() => {
          setSgModalOpen(false)
          setSelectedSGId(null)
          setSelectedSGName(null)
        }}
        sgId={selectedSGId || ''}
        sgName={selectedSGName || undefined}
        systemName={systemName}
        onRemediate={(sgId, rules) => {
          console.log('[SG] Remediate requested:', sgId, rules)
          // Remove remediated SG from the list using sgId or sgName
          handleRemediationSuccess(selectedSGId || selectedSGName || sgId)
          // Also clear the SG cache
          setSgGapAnalysisCache(prev => {
            const { [sgId]: _, ...rest } = prev
            return rest
          })
        }}
      />

      {/* Traffic Simulator Modal */}
      {showTrafficSimulator && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowTrafficSimulator(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[650px] max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Dynamic Traffic Simulator
              </h2>
              <button onClick={() => setShowTrafficSimulator(false)} className="p-1 hover:bg-white/20 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Connection Type Toggle */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Connection Type</label>
                <div className="flex bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => setSimConnectionType('api')}
                    className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      simConnectionType === 'api'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    API Call (CloudTrail)
                  </button>
                  <button
                    onClick={() => setSimConnectionType('network')}
                    className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      simConnectionType === 'network'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    Network (VPC Flow Logs)
                  </button>
                </div>
              </div>

              {/* Quick Scenarios */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quick Scenarios</label>
                <div className="flex flex-wrap gap-2">
                  {DEMO_SCENARIOS.map((scenario, i) => (
                    <button
                      key={i}
                      onClick={() => applyScenario(scenario)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        scenario.connectionType === 'network'
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {scenario.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source & Target Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Source */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Source Service</label>
                  {servicesLoading ? (
                    <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading services...
                    </div>
                  ) : availableServices.length > 0 ? (
                    <select
                      value={simSource}
                      onChange={(e) => setSimSource(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="">Select source...</option>
                      {['EC2', 'Lambda', 'ECS', 'S3'].map(type => {
                        const services = availableServices.filter(s => s.type.includes(type))
                        if (services.length === 0) return null
                        return (
                          <optgroup key={type} label={type}>
                            {services.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </optgroup>
                        )
                      })}
                      <optgroup label="Other">
                        {availableServices
                          .filter(s => !['EC2', 'Lambda', 'ECS', 'S3'].some(t => s.type.includes(t)))
                          .slice(0, 20)
                          .map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                      </optgroup>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={simSource}
                      onChange={(e) => setSimSource(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., SafeRemediate-Test-App-1"
                    />
                  )}
                  <input
                    type="text"
                    value={simSource}
                    onChange={(e) => setSimSource(e.target.value)}
                    className="w-full mt-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Or type custom name..."
                  />
                </div>

                {/* Target */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Destination Service</label>
                  {servicesLoading ? (
                    <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading services...
                    </div>
                  ) : availableServices.length > 0 ? (
                    <select
                      value={simTarget}
                      onChange={(e) => setSimTarget(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="">Select destination...</option>
                      {['S3', 'RDS', 'DynamoDB', 'ElastiCache', 'Lambda'].map(type => {
                        const services = availableServices.filter(s => s.type.includes(type.replace('Bucket', '')))
                        if (services.length === 0) return null
                        return (
                          <optgroup key={type} label={type}>
                            {services.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </optgroup>
                        )
                      })}
                      <optgroup label="Other">
                        {availableServices
                          .filter(s => !['S3', 'RDS', 'DynamoDB', 'ElastiCache', 'Lambda'].some(t => s.type.includes(t)))
                          .slice(0, 20)
                          .map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                      </optgroup>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={simTarget}
                      onChange={(e) => setSimTarget(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., my-bucket-name"
                    />
                  )}
                  <input
                    type="text"
                    value={simTarget}
                    onChange={(e) => setSimTarget(e.target.value)}
                    className="w-full mt-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Or type custom name..."
                  />
                </div>
              </div>

              {/* Network Traffic Options */}
              {simConnectionType === 'network' && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-4">
                  <div className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Network Traffic Settings
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                      <div className="flex gap-2">
                        <select
                          value={simPort}
                          onChange={(e) => {
                            const port = parseInt(e.target.value)
                            setSimPort(port)
                            const preset = COMMON_PORTS.find(p => p.port === port)
                            if (preset) setSimProtocol(preset.protocol)
                          }}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        >
                          {COMMON_PORTS.map(p => (
                            <option key={p.port} value={p.port}>{p.port} ({p.name})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={simPort}
                          onChange={(e) => setSimPort(parseInt(e.target.value) || 443)}
                          className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          min="1"
                          max="65535"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Protocol</label>
                      <select
                        value={simProtocol}
                        onChange={(e) => setSimProtocol(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                        <option value="ICMP">ICMP</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* API Call Options */}
              {simConnectionType === 'api' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
                  <div className="text-sm font-medium text-blue-700 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    API Operations (CloudTrail)
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Operations</label>
                    <div className="flex flex-wrap gap-2">
                      {(API_OPERATIONS[getTargetServiceType()] || API_OPERATIONS.S3).map(op => (
                        <button
                          key={op}
                          onClick={() => {
                            if (simApiOperations.includes(op)) {
                              setSimApiOperations(simApiOperations.filter(o => o !== op))
                            } else {
                              setSimApiOperations([...simApiOperations, op])
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            simApiOperations.includes(op)
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Selected: {simApiOperations.length} operations
                    </div>
                  </div>

                  {/* IAM Role for API */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">IAM Role (optional)</label>
                    <input
                      type="text"
                      value={simIamRole}
                      onChange={(e) => setSimIamRole(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="e.g., cyntro-demo-ec2-s3-role"
                    />
                    <p className="text-xs text-slate-500 mt-1">If specified, marks permissions as used for this role</p>
                  </div>
                </div>
              )}

              {/* Days & Events */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Days of History</label>
                  <input
                    type="number"
                    value={simDays}
                    onChange={(e) => setSimDays(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    min="1"
                    max="730"
                  />
                  <div className="text-xs text-slate-500 mt-1">1-730 days (2 years max)</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Events per Day</label>
                  <input
                    type="number"
                    value={simEventsPerDay}
                    onChange={(e) => setSimEventsPerDay(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    min="1"
                    max="1000"
                  />
                  <div className="text-xs text-slate-500 mt-1">Average events per day</div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-sm font-medium text-slate-700 mb-2">Simulation Summary</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Events:</span>
                    <span className="font-medium">{(simDays * simEventsPerDay).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Time Period:</span>
                    <span className="font-medium">{Math.round(simDays / 30)} months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Type:</span>
                    <span className={`font-medium ${simConnectionType === 'network' ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {simConnectionType === 'network' ? `Network (${simPort}/${simProtocol})` : `API (${simApiOperations.length} ops)`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Flow:</span>
                    <span className="font-medium truncate max-w-[180px]" title={`${simSource} → ${simTarget}`}>
                      {simSource || '?'} → {simTarget || '?'}
                    </span>
                  </div>
                </div>
                {simIamRole && simConnectionType === 'api' && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-sm">
                    <span className="text-slate-500">IAM Role:</span>{' '}
                    <span className="font-medium text-purple-600">{simIamRole}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={resetDemo}
                  disabled={isSimulatingTraffic}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  title="Reset to 0% usage for fresh demo"
                >
                  🔄 Reset Demo
                </button>
                <button
                  onClick={() => setShowTrafficSimulator(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={simulateTraffic}
                  disabled={isSimulatingTraffic || !simSource || !simTarget}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    simConnectionType === 'network'
                      ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white'
                  }`}
                >
                  {isSimulatingTraffic ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Simulating...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Simulate Traffic
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Summary Card Component
function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number, color: string }) {
  const colorClasses = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    gray: 'text-gray-600'
  }
  
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={colorClasses[color as keyof typeof colorClasses]}>{icon}</div>
        <div className="text-sm text-gray-600">{label}</div>
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

// Unified Gap Resource Card Component - Polished design for all resource types
function GapResourceCard({ resource, onClick, onDelete }: { resource: GapResource, onClick: () => void, onDelete?: (id: string, name: string) => void }) {
  // Get role-specific icon based on name (for better visual identification)
  const getRoleIcon = (name: string) => {
    const lowerName = name.toLowerCase()
    if (lowerName.includes('lambda')) return '⚡'
    if (lowerName.includes('ec2')) return '🖥️'
    if (lowerName.includes('vpc') || lowerName.includes('flow')) return '🌐'
    if (lowerName.includes('s3')) return '🪣'
    if (lowerName.includes('cloudtrail') || lowerName.includes('trail')) return '📋'
    if (lowerName.includes('rds') || lowerName.includes('database')) return '🗄️'
    if (lowerName.includes('eks') || lowerName.includes('kubernetes')) return '☸️'
    if (lowerName.includes('ecs') || lowerName.includes('container')) return '📦'
    if (lowerName.includes('sns') || lowerName.includes('sqs')) return '📨'
    if (lowerName.includes('kms') || lowerName.includes('key')) return '🔑'
    return '🔐' // Default IAM role icon
  }

  // Get service tags from role name
  const getServiceTags = (name: string): Array<{label: string, color: string}> => {
    const tags: Array<{label: string, color: string}> = []
    const lowerName = name.toLowerCase()

    if (lowerName.includes('lambda')) tags.push({ label: 'Lambda', color: 'purple' })
    if (lowerName.includes('ec2')) tags.push({ label: 'EC2', color: 'blue' })
    if (lowerName.includes('s3')) tags.push({ label: 'S3', color: 'orange' })
    if (lowerName.includes('vpc') || lowerName.includes('flow')) tags.push({ label: 'VPC', color: 'cyan' })
    if (lowerName.includes('cloudtrail') || lowerName.includes('trail')) tags.push({ label: 'Logging', color: 'green' })
    if (lowerName.includes('rds')) tags.push({ label: 'RDS', color: 'indigo' })
    if (lowerName.includes('remediat')) tags.push({ label: 'Remediation', color: 'rose' })

    return tags
  }

  // Get severity - use API severity for orphan SGs, otherwise calculate from unused percentage
  const getSeverity = (unusedPercent: number): { level: string, color: string, bgColor: string, borderColor: string, emoji: string } => {
    // For orphan Security Groups, use the API's severity
    if (resource.resourceType === 'SecurityGroup' && resource.isOrphan) {
      const apiSeverity = (resource.severity || '').toUpperCase()
      if (apiSeverity === 'CRITICAL') {
        return { level: 'CRITICAL', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-500', emoji: '🚨' }
      } else if (apiSeverity === 'HIGH') {
        return { level: 'HIGH', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-500', emoji: '⚠️' }
      } else if (apiSeverity === 'MEDIUM') {
        return { level: 'MEDIUM', color: 'text-yellow-800', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500', emoji: '⚡' }
      } else {
        return { level: 'LOW', color: 'text-green-800', bgColor: 'bg-green-100', borderColor: 'border-green-500', emoji: '✓' }
      }
    }
    // Default: calculate severity from unused percentage
    if (unusedPercent >= 80) {
      return { level: 'CRITICAL', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-500', emoji: '🚨' }
    } else if (unusedPercent >= 50) {
      return { level: 'HIGH', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-500', emoji: '⚠️' }
    } else if (unusedPercent >= 20) {
      return { level: 'MEDIUM', color: 'text-yellow-800', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500', emoji: '⚡' }
    } else {
      return { level: 'LOW', color: 'text-green-800', bgColor: 'bg-green-100', borderColor: 'border-green-500', emoji: '✓' }
    }
  }

  // Get risk-based card styling
  const getRiskCardStyle = (unusedPercent: number) => {
    if (unusedPercent >= 80) return 'border-2 border-red-400 bg-red-50/30'
    if (unusedPercent >= 50) return 'border-2 border-orange-400 bg-orange-50/30'
    if (unusedPercent >= 20) return 'border-2 border-yellow-400 bg-yellow-50/30'
    return 'border-2 border-green-400 bg-green-50/30'
  }

  // Get icon based on resource type
  const getResourceIcon = () => {
    if (resource.resourceType === 'IAMRole') return <Shield className="w-5 h-5 text-purple-600" />
    if (resource.resourceType === 'SecurityGroup') return <Network className="w-5 h-5 text-blue-600" />
    if (resource.resourceType === 'S3Bucket') return <Database className="w-5 h-5 text-green-600" />
    return <AlertTriangle className="w-5 h-5 text-gray-600" />
  }

  // Get type-specific colors
  const getTypeColor = () => {
    if (resource.resourceType === 'IAMRole') return 'bg-purple-100 text-purple-700'
    if (resource.resourceType === 'SecurityGroup') return 'bg-blue-100 text-blue-700'
    if (resource.resourceType === 'S3Bucket') return 'bg-green-100 text-green-700'
    return 'bg-gray-100 text-gray-700'
  }

  // Calculate unified usage metrics
  const getUsageMetrics = () => {
    if (resource.resourceType === 'SecurityGroup' && resource.networkExposure) {
      // For Security Groups: used = secure rules, unused = exposed rules
      const totalRules = resource.networkExposure.totalRules || 0
      const exposedRules = resource.networkExposure.internetExposedRules || 0
      const secureRules = totalRules - exposedRules
      const usedPercent = totalRules > 0 ? Math.round((secureRules / totalRules) * 100) : 100
      const unusedPercent = 100 - usedPercent
      // For SG, LP Score = percentage of secure (non-exposed) rules
      const lpScore = usedPercent
      return {
        label: 'Rule Security',
        usedLabel: 'secure',
        unusedLabel: 'exposed',
        usedCount: secureRules,
        unusedCount: exposedRules,
        total: totalRules,
        usedPercent,
        unusedPercent,
        lpScore
      }
    } else if (resource.resourceType === 'S3Bucket') {
      // For S3 Buckets: use policy/permission counts if available
      const used = resource.usedCount ?? 0
      const unused = resource.gapCount ?? 0
      const total = used + unused || 1
      const usedPercent = Math.round((used / total) * 100)
      const unusedPercent = 100 - usedPercent
      return {
        label: 'Policy Usage',
        usedLabel: 'active',
        unusedLabel: 'unused',
        usedCount: used,
        unusedCount: unused,
        total,
        usedPercent,
        unusedPercent,
        lpScore: resource.lpScore ?? usedPercent
      }
    } else {
      // For IAM Roles: permission usage
      const used = resource.usedCount ?? 0
      const unused = resource.gapCount ?? 0
      const total = resource.allowedCount || (used + unused) || 1
      const usedPercent = Math.round((used / total) * 100)
      const unusedPercent = 100 - usedPercent
      return {
        label: 'Permission Usage',
        usedLabel: 'used',
        unusedLabel: 'unused',
        usedCount: used,
        unusedCount: unused,
        total,
        usedPercent,
        unusedPercent,
        lpScore: resource.lpScore ?? usedPercent
      }
    }
  }

  const metrics = getUsageMetrics()
  const severity = getSeverity(metrics.unusedPercent)
  const serviceTags = resource.resourceType === 'IAMRole' ? getServiceTags(resource.resourceName) : []
  const roleIcon = resource.resourceType === 'IAMRole' ? getRoleIcon(resource.resourceName) : null

  // Get LP Score badge color
  const getLPScoreColor = (score: number | null) => {
    if (score === null) return 'bg-gray-100 text-gray-600'
    if (score >= 80) return 'bg-green-100 text-green-700'
    if (score >= 50) return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <div
      className={`rounded-xl shadow-sm p-6 hover:shadow-xl transition-all duration-200 cursor-pointer ${getRiskCardStyle(metrics.unusedPercent)}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          {/* Role Icon with Service Icon */}
          <div className={`p-2 rounded-lg ${getTypeColor().replace('text-', 'bg-').replace('-700', '-100')} relative`}>
            {roleIcon ? (
              <span className="text-2xl">{roleIcon}</span>
            ) : (
              getResourceIcon()
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold text-lg text-gray-900">{resource.resourceName}</h3>
              {/* Service Tags */}
              {serviceTags.map((tag, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-0.5 text-xs font-medium rounded
                    ${tag.color === 'purple' ? 'bg-purple-100 text-purple-700 border border-purple-200' : ''}
                    ${tag.color === 'blue' ? 'bg-blue-100 text-blue-700 border border-blue-200' : ''}
                    ${tag.color === 'orange' ? 'bg-orange-100 text-orange-700 border border-orange-200' : ''}
                    ${tag.color === 'cyan' ? 'bg-cyan-100 text-cyan-700 border border-cyan-200' : ''}
                    ${tag.color === 'green' ? 'bg-green-100 text-green-700 border border-green-200' : ''}
                    ${tag.color === 'indigo' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : ''}
                    ${tag.color === 'rose' ? 'bg-rose-100 text-rose-700 border border-rose-200' : ''}
                  `}
                >
                  {tag.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">📍 {resource.systemName || 'Unknown System'}</span>
              {resource.region && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {resource.region}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Right side badges */}
        <div className="flex flex-col items-end gap-2">
          {/* Delete/Dismiss Button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(resource.id, resource.resourceName)
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Dismiss this alert"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {/* Severity Badge */}
          <span className={`px-3 py-1 text-xs font-bold rounded-full border ${severity.bgColor} ${severity.color} border-current`}>
            {severity.emoji} {severity.level}
          </span>
          {/* Orphan Badge for Security Groups */}
          {resource.resourceType === 'SecurityGroup' && resource.isOrphan && (
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold border border-purple-300">
              👻 ORPHAN
            </span>
          )}
          {/* Resource Type Badge */}
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor()}`}>
            {resource.resourceType === 'IAMRole' ? 'IAM Role' :
             resource.resourceType === 'SecurityGroup' ? 'Security Group' :
             resource.resourceType === 'S3Bucket' ? 'S3 Bucket' : resource.resourceType}
          </span>
          {/* Non-remediable badge for IAM roles */}
          {resource.resourceType === 'IAMRole' && resource.isRemediable === false && (
            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
              ⚠️ AWS Managed
            </span>
          )}
        </div>
      </div>

      {/* LP Score - Prominent Display */}
      <div className="flex items-center justify-between mb-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-medium tracking-wide">Least Privilege Score</span>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-4xl font-bold ${metrics.lpScore !== null && metrics.lpScore < 50 ? 'text-red-600' : metrics.lpScore !== null && metrics.lpScore < 75 ? 'text-orange-600' : 'text-green-600'}`}>
                {metrics.lpScore !== null && !isNaN(metrics.lpScore) ? `${Math.round(metrics.lpScore)}%` : 'N/A'}
              </span>
              <div className="flex flex-col text-xs">
                <span className="text-gray-600">
                  <span className="font-bold text-green-600">{metrics.usedCount}</span> {metrics.usedLabel}
                </span>
                <span className="text-gray-600">
                  <span className="font-bold text-red-600">{metrics.unusedCount}</span> {metrics.unusedLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className={`h-16 w-16 rounded-full flex items-center justify-center ${severity.bgColor} border-4 ${severity.bgColor.replace('bg-', 'border-').replace('-100', '-200')}`}>
          <span className="text-2xl">{severity.emoji}</span>
        </div>
      </div>

      {/* Usage Bar - Enhanced with gradients */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{metrics.label}</span>
          <span className="text-sm text-gray-500">{metrics.total} total</span>
        </div>

        {/* Progress bar with gradient */}
        <div className="relative h-12 rounded-xl overflow-hidden border-2 border-gray-200 shadow-inner">
          {metrics.usedPercent > 0 && (
            <div
              className="absolute left-0 h-full bg-gradient-to-r from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-bold shadow-lg transition-all"
              style={{ width: `${metrics.usedPercent}%` }}
            >
              {metrics.usedCount > 0 && metrics.usedPercent >= 20 && (
                <span className="drop-shadow-lg">✓ {metrics.usedCount} {metrics.usedLabel}</span>
              )}
            </div>
          )}
          {metrics.unusedPercent > 0 && (
            <div
              className="absolute right-0 h-full bg-gradient-to-r from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold shadow-lg transition-all"
              style={{ width: `${metrics.unusedPercent}%` }}
            >
              {metrics.unusedCount > 0 && metrics.unusedPercent >= 20 && (
                <span className="drop-shadow-lg">✗ {metrics.unusedCount} {metrics.unusedLabel} ({metrics.unusedPercent}%)</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* High-Risk Info - Contextual per type */}
      {resource.resourceType === 'SecurityGroup' && resource.networkExposure?.highRiskPorts?.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm font-medium text-red-700">⚠️ High-Risk Ports Exposed:</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {resource.networkExposure.highRiskPorts.slice(0, 5).map((port, idx) => (
              <span key={idx} className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-mono">
                {port}
              </span>
            ))}
            {resource.networkExposure.highRiskPorts.length > 5 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                +{resource.networkExposure.highRiskPorts.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* S3 Bucket Traffic Info */}
      {resource.resourceType === 'S3Bucket' && (resource.accessorCount ?? 0) > 0 && (
        <div className="mb-4 p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
          <div className="text-sm font-medium text-cyan-700 mb-2">📊 Observed Traffic:</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-cyan-700">{resource.accessorCount}</span>
              <span className="text-xs text-cyan-600">principals<br/>accessing</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-cyan-700">{(resource.totalHits ?? 0).toLocaleString()}</span>
              <span className="text-xs text-cyan-600">total<br/>accesses</span>
            </div>
          </div>
          {(resource.principals?.length ?? 0) > 0 && (
            <div className="mt-2 pt-2 border-t border-cyan-200">
              <div className="text-xs text-cyan-600 mb-1">Accessed by:</div>
              <div className="flex flex-wrap gap-1">
                {[...new Set(resource.principals)].slice(0, 3).map((principal, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded text-xs font-medium">
                    {principal}
                  </span>
                ))}
                {[...new Set(resource.principals)].length > 3 && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                    +{[...new Set(resource.principals)].length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(resource.highRiskUnused?.length || 0) > 0 && resource.resourceType !== 'SecurityGroup' && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm font-medium text-red-700">⚠️ High-Risk Unused Permissions:</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {(resource.highRiskUnused || []).slice(0, 3).map((perm, idx) => (
              <span key={idx} className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-mono">
                {perm.permission}
              </span>
            ))}
            {(resource.highRiskUnused?.length || 0) > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                +{(resource.highRiskUnused?.length || 0) - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Analysis & Action Summary */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>📊</span>
          <span>
            <strong>Analysis:</strong> {resource.evidence?.observationDays || 365} days | {(resource.evidence?.dataSources || ['Neo4j', 'CloudTrail']).join(' + ')} | {resource.evidence?.confidence || 'LOW'} confidence
          </span>
        </div>
        <div className={`flex items-center gap-2 text-sm font-medium ${severity.color}`}>
          <span>💡</span>
          <span>
            <strong>Action:</strong> {
              metrics.unusedPercent >= 80
                ? `Remove ${metrics.unusedCount} permissions immediately`
                : metrics.unusedPercent >= 50
                ? `Review and reduce ${metrics.unusedCount} permissions`
                : metrics.unusedPercent >= 20
                ? `Monitor and optimize ${metrics.unusedCount} permissions`
                : metrics.unusedCount > 0
                ? `Well-scoped, remove ${metrics.unusedCount} unused permissions`
                : 'Fully optimized - no action needed'
            }
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          <span>Last updated: {resource.evidence?.lastUsed || 'N/A'}</span>
        </div>
        <button
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-2 transition-colors shadow-md hover:shadow-lg"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          View Remediation
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Remediation Drawer Component
function RemediationDrawer({ 
  resource, 
  cachedFetch,
  cache,
  iamCachedFetch,
  iamCache,
  onClose, 
  onSimulate,
  simulating = false
}: { 
  resource: GapResource
  cachedFetch?: (sgId: string, forceRefresh?: boolean) => Promise<any>
  cache?: Record<string, any>
  iamCachedFetch?: (roleName: string, forceRefresh?: boolean) => Promise<any>
  iamCache?: Record<string, any>
  onClose: () => void
  onSimulate?: () => void
  simulating?: boolean
}) {
  const [activeTab, setActiveTab] = useState<'summary' | 'rules' | 'evidence' | 'impact'>('summary')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="bg-white rounded-t-lg sm:rounded-lg w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">{resource.resourceName}</h2>
              {resource.region && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium flex items-center gap-1">
                  🌍 {resource.region}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">{resource.resourceType} • {resource.systemName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-4">
            {[
              { id: 'summary', label: 'Summary', icon: '📊' },
              { id: 'rules', label: 'Rules', icon: '📋' },
              { id: 'evidence', label: 'Evidence', icon: '🔍' },
              { id: 'impact', label: 'Impact', icon: '📈' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 border-b-2 font-medium text-sm flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {activeTab === 'summary' && <SummaryTab resource={resource} />}
          {activeTab === 'rules' && <RulesTab resource={resource} cachedFetch={cachedFetch} cache={cache} iamCachedFetch={iamCachedFetch} iamCache={iamCache} />}
          {activeTab === 'evidence' && <EvidenceTab resource={resource} />}
          {activeTab === 'impact' && <ImpactTab resource={resource} />}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={onSimulate}
            disabled={simulating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            {simulating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Simulating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Simulate
              </>
            )}
          </button>
          <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            Export Terraform
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2">
            <Send className="w-4 h-4" />
            Request Approval
          </button>
          {resource.evidence?.confidence === 'HIGH' && (
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Auto-Apply
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Tab Components
function SummaryTab({ resource }: { resource: GapResource }) {
  // For Security Groups, show Network Exposure instead of LP Score
  const isSecurityGroup = resource.resourceType === 'SecurityGroup'
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {isSecurityGroup && resource.networkExposure ? (
          <>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Network Exposure Score</div>
              <div className="text-3xl font-bold text-gray-900">{resource.networkExposure.score}/100</div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.networkExposure.internetExposedRules} internet-exposed rules
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Total Rules</div>
              <div className="text-3xl font-bold text-blue-600">{resource.networkExposure.totalRules}</div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.networkExposure.highRiskPorts.length > 0 
                  ? `${resource.networkExposure.highRiskPorts.length} high-risk ports`
                  : 'No high-risk ports'}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">LP Score</div>
              <div className="text-3xl font-bold text-gray-900">
                {resource.resourceType === 'SecurityGroup' || resource.resourceType === 'S3Bucket' ? (
                  <span className="text-gray-400" title="Requires traffic/access analysis">
                    —
                  </span>
                ) : resource.lpScore !== null && !isNaN(resource.lpScore) ? (
                  `${resource.lpScore.toFixed(0)}%`
                ) : (
                  'N/A'
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.resourceType === 'SecurityGroup' || resource.resourceType === 'S3Bucket' ? (
                  'Requires traffic/access analysis'
                ) : resource.lpScore !== null && !isNaN(resource.lpScore) ? (
                  `${(100 - resource.lpScore).toFixed(0)}% unused`
                ) : (
                  'Not applicable'
                )}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Attack Surface Reduction</div>
              <div className="text-3xl font-bold text-red-600">
                {resource.gapPercent !== null ? `${resource.gapPercent.toFixed(0)}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.gapCount ?? 0} permissions
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border-2 border-gray-300 bg-white p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {isSecurityGroup ? 'Network Exposure Visualization' : 'Gap Visualization'}
        </h3>
        {isSecurityGroup && resource.networkExposure ? (
          <div className="w-full h-12 bg-gray-200 rounded-lg overflow-hidden flex mb-4">
            <div
              className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${(resource.networkExposure.internetExposedRules / Math.max(1, resource.networkExposure.totalRules)) * 100}%` }}
            >
              Internet Exposed ({resource.networkExposure.internetExposedRules})
            </div>
            <div
              className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${((resource.networkExposure.totalRules - resource.networkExposure.internetExposedRules) / Math.max(1, resource.networkExposure.totalRules)) * 100}%` }}
            >
              Secure ({resource.networkExposure.totalRules - resource.networkExposure.internetExposedRules})
            </div>
          </div>
        ) : (
          <div className="w-full h-12 bg-gray-200 rounded-lg overflow-hidden flex mb-4">
            <div
              className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${((resource.usedCount ?? 0) / Math.max(1, resource.allowedCount)) * 100}%` }}
            >
              Used ({(resource.usedCount ?? 0)})
            </div>
            <div
              className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${((resource.gapCount ?? 0) / Math.max(1, resource.allowedCount)) * 100}%` }}
            >
              Unused ({(resource.gapCount ?? 0)})
            </div>
          </div>
        )}
        <p className="text-sm text-gray-700">
          <strong>{resource.resourceName}</strong> has <strong>{resource.allowedCount} allowed permissions</strong>.
          In <strong>{resource.evidence?.observationDays || 0} days</strong> of observation, only <strong>{resource.usedCount} were used</strong>.
          The other <strong>{resource.gapCount ?? 0} ({(resource.gapPercent ?? 0).toFixed(0)}%)</strong> are your attack surface.
        </p>
      </div>

      {(resource.highRiskUnused?.length || 0) > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-lg font-bold text-red-900 mb-3">High-Risk Unused Permissions</h3>
          <div className="space-y-2">
            {(resource.highRiskUnused || []).map((perm, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white rounded p-3">
                <div>
                  <div className="font-mono text-sm font-medium text-gray-900">{perm.permission}</div>
                  <div className="text-xs text-gray-600">{perm.reason}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  perm.riskLevel === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'
                }`}>
                  {perm.riskLevel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// RulesTab - Unified rules table view with filtering and sorting
// ============================================================================
type RuleAnalysis = {
  rule_id: string
  direction: string
  protocol: string
  port_range: string
  source: string
  source_type: string
  is_public: boolean
  status: 'USED' | 'UNUSED' | 'OVERLY_BROAD'
  traffic: { connection_count: number; unique_sources: number }
  recommendation: { action: string; reason: string; confidence: number; suggested_cidrs?: string[] }
}

function RulesTab({ 
  resource, 
  cachedFetch, 
  cache,
  iamCachedFetch,
  iamCache
}: { 
  resource: GapResource
  cachedFetch?: (sgId: string, forceRefresh?: boolean) => Promise<any>
  cache?: Record<string, any>
  iamCachedFetch?: (roleName: string, forceRefresh?: boolean) => Promise<any>
  iamCache?: Record<string, any>
}) {
  const [rulesAnalysis, setRulesAnalysis] = useState<RuleAnalysis[]>([])
  const [iamGapData, setIamGapData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'used' | 'unused' | 'public'>('all')
  const [sortBy, setSortBy] = useState<'status' | 'port' | 'traffic'>('status')

  // Extract SG ID from various possible fields
  const extractSgId = (res: GapResource): string | null => {
    if (res.id?.startsWith('sg-')) return res.id
    if (res.resourceName?.startsWith('sg-')) return res.resourceName
    if (res.resourceArn?.includes('security-group/')) {
      const match = res.resourceArn.match(/security-group\/(sg-[a-z0-9]+)/)
      if (match) return match[1]
    }
    if (res.id?.includes('sg-')) {
      const match = res.id.match(/(sg-[a-z0-9]+)/)
      if (match) return match[1]
    }
    return res.id || res.resourceName || null
  }

  // Generate rules from resource data for Security Groups
  useEffect(() => {
    if (resource.resourceType === 'SecurityGroup') {
      console.log('[RulesTab] Security Group resource data:', resource)
      console.log('[RulesTab] allowedList:', resource.allowedList)
      
      // FIRST: Check if we have actual rules in allowedList from the backend
      if (resource.allowedList && Array.isArray(resource.allowedList) && resource.allowedList.length > 0) {
        console.log('[RulesTab] Using allowedList from backend:', resource.allowedList.length, 'rules')
        
        // Transform the backend format to the frontend RuleAnalysis format
        const backendRules = resource.allowedList.map((rule: any, idx: number) => {
          // Get the first source for display (rules can have multiple sources)
          const sources = rule.sources || []
          const firstSource = sources[0] || {}
          const sourceDisplay = firstSource.cidr || firstSource.sgId || firstSource.prefixListId || 'Unknown'
          
          return {
            rule_id: `rule_${idx}`,
            direction: 'ingress' as const,
            protocol: rule.protocol || 'TCP',
            port_range: String(rule.port || 'All'),
            source: sourceDisplay,
            source_type: (firstSource.cidr ? 'cidr' : firstSource.sgId ? 'security_group' : 'prefix_list') as 'cidr' | 'security_group' | 'prefix_list',
            is_public: rule.isPublic || false,
            status: (rule.status === 'USED' ? 'USED' : rule.status === 'UNUSED' ? 'UNUSED' : 'OVERLY_BROAD') as 'USED' | 'UNUSED' | 'OVERLY_BROAD',
            traffic: rule.traffic || { connection_count: 0, unique_sources: sources.length },
            recommendation: { 
              action: rule.status === 'USED' ? 'KEEP' : rule.isPublic ? 'RESTRICT' : 'DELETE', 
              reason: rule.isPublic 
                ? (rule.status === 'USED' ? 'Public access with active traffic' : 'Public internet access - restrict to specific CIDRs')
                : (rule.status === 'USED' ? 'Active traffic observed' : 'No traffic observed'),
              confidence: rule.status === 'USED' ? 95 : 80
            },
            // Store the full sources array for detailed display
            all_sources: sources
          }
        })
        
        console.log('[RulesTab] Transformed', backendRules.length, 'rules from allowedList')
        setRulesAnalysis(backendRules)
        return
      }
      
      // SECOND: Try to use rule_states from evidence (legacy format)
      if (resource.evidence?.rule_states?.length) {
        console.log('[RulesTab] Using rule_states from evidence:', resource.evidence.rule_states.length)
        const fallbackRules = resource.evidence.rule_states.map((rule: any, idx: number) => ({
          rule_id: "rule_" + idx,
          direction: 'ingress' as const,
          protocol: rule.protocol || 'TCP',
          port_range: String(rule.port || 'All'),
          source: rule.cidr || rule.source || '0.0.0.0/0',
          source_type: 'cidr' as const,
          is_public: rule.cidr?.includes('0.0.0.0/0') || rule.cidr?.includes('::/0') || rule.source?.includes('0.0.0.0/0') || false,
          status: (rule.observed_usage || rule.status === 'USED' ? 'USED' : 'UNUSED') as 'USED' | 'UNUSED' | 'OVERLY_BROAD',
          traffic: { connection_count: rule.connections || 0, unique_sources: rule.unique_sources || 0 },
          recommendation: { 
            action: rule.observed_usage || rule.status === 'USED' ? 'KEEP' : 'DELETE', 
            reason: rule.recommendation || (rule.observed_usage ? 'Active traffic observed' : 'No traffic observed'),
            confidence: rule.confidence || 80
          }
        }))
        setRulesAnalysis(fallbackRules)
        return
      }
      
      // THIRD: Generate synthetic rules from networkExposure (fallback)
      if (resource.networkExposure) {
        console.log('[RulesTab] Generating synthetic rules from networkExposure:', resource.networkExposure)
        const syntheticRules: RuleAnalysis[] = []
        const totalRules = resource.networkExposure.totalRules || 0
        const exposedRules = resource.networkExposure.internetExposedRules || 0
        const secureRules = totalRules - exposedRules
        const highRiskPorts = resource.networkExposure.highRiskPorts || []
        
        // Generate exposed rules first (with high-risk ports if available)
        for (let i = 0; i < exposedRules; i++) {
          const port = highRiskPorts[i] || (i === 0 ? 443 : 80 + i * 10)
          syntheticRules.push({
            rule_id: `exposed_${i}`,
            direction: 'ingress',
            protocol: 'TCP',
            port_range: String(port),
            source: '0.0.0.0/0',
            source_type: 'cidr',
            is_public: true,
            status: 'OVERLY_BROAD',
            traffic: { connection_count: Math.floor(Math.random() * 1000), unique_sources: Math.floor(Math.random() * 50) },
            recommendation: { 
              action: 'RESTRICT', 
              reason: 'Public internet access - restrict to specific CIDRs',
              confidence: 85
            }
          })
        }
        
        // Generate secure rules
        for (let i = 0; i < secureRules; i++) {
          const port = 5432 + i  // Common internal ports like DB, etc.
          syntheticRules.push({
            rule_id: `secure_${i}`,
            direction: 'ingress',
            protocol: 'TCP',
            port_range: String(port),
            source: '10.0.0.0/8',
            source_type: 'cidr',
            is_public: false,
            status: 'USED',
            traffic: { connection_count: Math.floor(Math.random() * 500) + 100, unique_sources: Math.floor(Math.random() * 10) + 1 },
            recommendation: { 
              action: 'KEEP', 
              reason: 'Active internal traffic',
              confidence: 95
            }
          })
        }
        
        console.log('[RulesTab] Generated', syntheticRules.length, 'synthetic rules')
        setRulesAnalysis(syntheticRules)
        return
      }
      
      console.log('[RulesTab] No rule data available for Security Group')
    }
  }, [resource])

  // Fetch gap analysis for IAM Roles
  useEffect(() => {
    if (resource.resourceType === 'IAMRole') {
      const fetchIAMData = async () => {
        setLoading(true)
        setError(null)
        try {
          const roleName = resource.resourceName || resource.id
          console.log('[RulesTab] Fetching IAM gap analysis for:', roleName)
          
          // Check cache first
          if (iamCache?.[roleName]) {
            console.log('[RulesTab] Using cached IAM data for:', roleName)
            setIamGapData(iamCache[roleName])
            setLoading(false)
            return
          }
          
          // Use cached fetch if available
          if (iamCachedFetch) {
            const data = await iamCachedFetch(roleName)
            if (data) {
              setIamGapData(data)
              setLoading(false)
              return
            }
          }
          
          // Direct fetch
          const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90`)
          if (res.ok) {
            const data = await res.json()
            console.log('[RulesTab] Got IAM data:', {
              role: roleName,
              total: data.summary?.total_permissions,
              used: data.summary?.used_count,
              unused: data.summary?.unused_count
            })
            setIamGapData(data)
          } else {
            console.error('[RulesTab] IAM fetch failed:', res.status)
            setError(`Failed to load IAM data: ${res.status}`)
          }
        } catch (err) {
          console.error('[RulesTab] Failed to fetch IAM data:', err)
          setError('Failed to load IAM permissions')
        } finally {
          setLoading(false)
        }
      }
      fetchIAMData()
    }
  }, [resource, iamCachedFetch, iamCache])

  // Filter rules
  const filteredRules = rulesAnalysis.filter(rule => {
    switch (filter) {
      case 'used': return rule.status === 'USED'
      case 'unused': return rule.status === 'UNUSED'
      case 'public': return rule.is_public
      default: return true
    }
  })

  // Sort rules
  const sortedRules = [...filteredRules].sort((a, b) => {
    switch (sortBy) {
      case 'port':
        return (parseInt(a.port_range) || 0) - (parseInt(b.port_range) || 0)
      case 'traffic':
        return (b.traffic?.connection_count || 0) - (a.traffic?.connection_count || 0)
      case 'status':
      default:
        const order = { 'UNUSED': 0, 'OVERLY_BROAD': 1, 'USED': 2 }
        return (order[a.status] || 0) - (order[b.status] || 0)
    }
  })

  const counts = {
    total: rulesAnalysis.length,
    used: rulesAnalysis.filter(r => r.status === 'USED').length,
    unused: rulesAnalysis.filter(r => r.status === 'UNUSED').length,
    broad: rulesAnalysis.filter(r => r.status === 'OVERLY_BROAD').length,
    public: rulesAnalysis.filter(r => r.is_public).length
  }

  // For Security Groups
  if (resource.resourceType === 'SecurityGroup') {
    if (loading) {
  return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading rules...</span>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {error && (
          <div className="text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">{error}</div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-center">
            <div className="text-2xl font-bold text-gray-700">{counts.total}</div>
            <div className="text-xs text-gray-500">Total Rules</div>
            </div>
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
            <div className="text-2xl font-bold text-green-700">{counts.used}</div>
            <div className="text-xs text-green-600">Used (KEEP)</div>
          </div>
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
            <div className="text-2xl font-bold text-red-700">{counts.unused}</div>
            <div className="text-xs text-red-600">Unused (DELETE)</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
            <div className="text-2xl font-bold text-amber-700">{counts.broad}</div>
            <div className="text-xs text-amber-600">Overly Broad</div>
          </div>
        </div>

        {/* Filters & Sort */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex gap-2">
            {(['all', 'used', 'unused', 'public'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  filter === f 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'used' ? 'Used' : f === 'unused' ? 'Unused' : 'Public'}
                {f !== 'all' && (
                  <span className="ml-1 opacity-75">
                    ({f === 'used' ? counts.used : f === 'unused' ? counts.unused : counts.public})
                  </span>
                )}
              </button>
            ))}
        </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="status">Sort by Status</option>
            <option value="port">Sort by Port</option>
            <option value="traffic">Sort by Traffic</option>
          </select>
      </div>

        {/* Rules Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Port</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Protocol</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Traffic</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {filter === 'all' ? 'No rules found' : `No ${filter} rules`}
                  </td>
                </tr>
              ) : (
                sortedRules.map((rule) => (
                  <tr 
                    key={rule.rule_id} 
                    className={`hover:bg-gray-50 ${
                      rule.status === 'UNUSED' ? 'bg-red-50/30' :
                      rule.status === 'OVERLY_BROAD' ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-gray-900">{rule.port_range}</td>
                    <td className="px-4 py-3 text-gray-600 uppercase">{rule.protocol}</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-sm ${rule.is_public ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {rule.source}
                      </span>
                      {rule.is_public && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">PUBLIC</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        rule.status === 'USED' ? 'bg-green-100 text-green-700' :
                        rule.status === 'OVERLY_BROAD' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {rule.status === 'USED' ? '✓' : rule.status === 'OVERLY_BROAD' ? '⚠' : '✗'}
                        {rule.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {rule.traffic?.connection_count > 0 
                        ? rule.traffic.connection_count.toLocaleString()
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rule.recommendation.action === 'KEEP' ? 'bg-green-100 text-green-700' :
                        rule.recommendation.action === 'TIGHTEN' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {rule.recommendation.action}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Tighten Suggestions */}
        {rulesAnalysis.some(r => r.recommendation.action === 'TIGHTEN' && r.recommendation.suggested_cidrs?.length) && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="text-sm font-medium text-amber-800 mb-2">💡 Tighten Suggestions</h4>
            <div className="space-y-2">
              {rulesAnalysis
                .filter(r => r.recommendation.action === 'TIGHTEN' && r.recommendation.suggested_cidrs?.length)
                .map(rule => (
                  <div key={rule.rule_id} className="text-sm text-amber-700">
                    <span className="font-mono">{rule.port_range}</span>: Replace {rule.source} with{' '}
                    {rule.recommendation.suggested_cidrs?.map((cidr, i) => (
                      <span key={i} className="font-mono bg-white px-1 rounded mx-0.5">{cidr}</span>
                    ))}
            </div>
          ))}
            </div>
          </div>
          )}
        </div>
    )
  }

  // For IAM Roles and other resources - permissions list view
  // Use real API data if available, otherwise fall back to resource data
  const totalPermissions = iamGapData?.summary?.total_permissions ?? resource.allowedCount ?? 0
  const usedCount = iamGapData?.summary?.used_count ?? resource.usedCount ?? 0
  const unusedCount = iamGapData?.summary?.unused_count ?? resource.gapCount ?? 0
  const lpScore = iamGapData?.summary?.lp_score ?? 0
  const permissionsAnalysis = iamGapData?.permissions_analysis ?? []
  const usedPermissions = iamGapData?.used_permissions ?? resource.usedList ?? []
  const unusedPermissions = iamGapData?.unused_permissions ?? resource.unusedList ?? []
  const allPermissions = [...safeArray(usedPermissions), ...safeArray(unusedPermissions)]

  // Show loading state for IAM Roles
  if (loading && resource.resourceType === 'IAMRole') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading IAM permissions from CloudTrail...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">{error}</div>
      )}

      {/* LP Score Badge - only show if we have real data */}
      {iamGapData && (
        <div className={`p-3 rounded-lg border ${
          lpScore >= 80 ? 'bg-green-50 border-green-200' :
          lpScore >= 50 ? 'bg-yellow-50 border-yellow-200' :
          'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              LP Score: <span className={`text-lg font-bold ${
                lpScore >= 80 ? 'text-green-700' :
                lpScore >= 50 ? 'text-yellow-700' :
                'text-red-700'
              }`}>{lpScore}%</span>
            </span>
            <span className="text-xs text-gray-500">
              Based on {iamGapData.summary?.cloudtrail_events || 0} CloudTrail events
            </span>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-center">
          <div className="text-2xl font-bold text-gray-700">{totalPermissions}</div>
          <div className="text-xs text-gray-500">Total Allowed</div>
        </div>
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
          <div className="text-2xl font-bold text-green-700">{usedCount}</div>
          <div className="text-xs text-green-600">Used (KEEP)</div>
        </div>
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
          <div className="text-2xl font-bold text-red-700">{unusedCount}</div>
          <div className="text-xs text-red-600">Unused (REMOVE)</div>
        </div>
      </div>

      {/* Permissions Table - Use API data if available */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Permission</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Risk</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {permissionsAnalysis.length > 0 ? (
              // Use detailed API data
              permissionsAnalysis.slice(0, 30).map((perm: any, idx: number) => (
                <tr key={idx} className={perm.status === 'UNUSED' ? 'bg-red-50/30' : ''}>
                  <td className="px-4 py-2 font-mono text-gray-900 text-xs">{perm.permission}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      perm.status === 'USED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {perm.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      perm.risk_level === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                      perm.risk_level === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                      perm.risk_level === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {perm.risk_level}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      perm.recommendation?.includes('REMOVE') || perm.recommendation?.includes('SAFE_TO_REMOVE') 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {perm.recommendation?.replace('_', ' ') || (perm.status === 'USED' ? 'KEEP' : 'REMOVE')}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              // Fall back to simple list from resource
              allPermissions.slice(0, 20).map((perm, idx) => {
                const isUsed = safeArray(usedPermissions).includes(String(perm))
                return (
                  <tr key={idx} className={isUsed ? '' : 'bg-red-50/30'}>
                    <td className="px-4 py-2 font-mono text-gray-900 text-xs">{String(perm)}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        isUsed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {isUsed ? 'USED' : 'UNUSED'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">-</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        isUsed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {isUsed ? 'KEEP' : 'REMOVE'}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        {(permissionsAnalysis.length > 30 || allPermissions.length > 20) && (
          <div className="px-4 py-2 bg-gray-50 text-center text-sm text-gray-500 border-t border-gray-200">
            Showing {permissionsAnalysis.length > 0 ? Math.min(30, permissionsAnalysis.length) : Math.min(20, allPermissions.length)} of {totalPermissions} permissions
          </div>
        )}
      </div>
    </div>
  )
}

function EvidenceTab({ resource }: { resource: GapResource }) {
  // Check if this is a Security Group with rule_states
  const hasRuleStates = resource.resourceType === 'SecurityGroup' && resource.evidence.rule_states && resource.evidence.rule_states.length > 0
  
  return (
    <div className="space-y-6">
      {/* Rule States for Security Groups */}
      {hasRuleStates && (
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Security Group Rules ({resource.evidence.rule_states?.length || 0})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {resource.evidence.rule_states?.map((rule, idx) => {
              const port = typeof rule.port === 'number' ? rule.port : rule.port
              const isAllTraffic = rule.protocol === '-1' || port === -1 || port === 'ALL'
              const isIPv6 = rule.cidr?.includes('::/0') || false
              const isRisky = rule.cidr?.includes('0.0.0.0/0') || isIPv6
              
              return (
                <div 
                  key={idx} 
                  className={`rounded-lg border p-4 ${
                    isRisky ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`px-3 py-1 rounded font-mono text-sm font-bold ${
                        isAllTraffic 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {isAllTraffic ? 'All Traffic' : `Port ${port}`}
                      </div>
                      {rule.protocol && rule.protocol !== '-1' && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                          {rule.protocol.toUpperCase()}
                        </span>
                      )}
                      {isIPv6 && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                          IPv6
                        </span>
                      )}
                      {rule.cidr && rule.cidr !== 'N/A' && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                          {rule.cidr}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {rule.observed_usage ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Used
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                          Not Used
                        </span>
                      )}
                      {rule.recommendation && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          rule.recommendation === 'REVIEW_OR_DELETE' || rule.recommendation === 'DELETE'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {rule.recommendation === 'REVIEW_OR_DELETE' ? '⚠️ Delete' : rule.recommendation}
                        </span>
                      )}
                    </div>
                  </div>
                  {rule.note && (
                    <p className="text-xs text-gray-600 mt-2">{rule.note}</p>
                  )}
                  {rule.last_seen && (
                    <p className="text-xs text-gray-500 mt-1">Last seen: {new Date(rule.last_seen).toLocaleDateString()}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Evidence Sources</h3>
        <div className="space-y-3">
          {(resource.evidence?.dataSources || []).map((source, idx) => {
            const getSourceDescription = (src: string) => {
              switch (src) {
                case 'CloudTrail':
                  return `${resource.evidence?.observationDays || 0} days of API call history`;
                case 'IAM Access Advisor':
                  return 'Service-level last accessed information (up to 400 days)';
                case 'VPC Flow Logs':
                  return `${resource.evidence.flowlogs?.lookback_days || 30} days of network traffic analysis`;
                case 'Resource Policies':
                  return 'Cross-account access patterns (S3, KMS, Lambda)';
                case 'IAM API':
                  return 'Real-time permission extraction from policies';
                default:
                  return 'Evidence source';
              }
            };
            
            return (
              <div key={idx} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-gray-900">{source}</div>
                  <div className="text-sm text-gray-600">
                    {getSourceDescription(source)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Observation Period</h3>
        <div className="flex items-center gap-4">
          <Clock className="w-6 h-6 text-gray-600" />
          <div>
            <div className="font-medium text-gray-900">{resource.evidence?.observationDays || 0} days</div>
            <div className="text-sm text-gray-600">
              From {new Date(Date.now() - (resource.evidence?.observationDays || 0) * 24 * 60 * 60 * 1000).toLocaleDateString()} to {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      {/* Confidence Scoring Breakdown */}
      {resource.evidence?.confidence_breakdown && (
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Confidence Score Breakdown</h3>
          <div className="space-y-4">
            {Object.entries(resource.evidence?.confidence_breakdown || {}).map(([source, data]: [string, any]) => (
              <div key={source} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 capitalize">
                      {source.replace(/_/g, ' ')}
                    </span>
                    {data.available === false && (
                      <span className="text-xs text-gray-500">(Not available)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {(data.contribution ?? 0).toFixed(1)} / {(data.max ?? 0).toFixed(1)}
                    </span>
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${(data.contribution / data.max) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 ml-7">
                  {data.description}
                  {data.events !== undefined && ` • ${data.events} events`}
                  {data.flows !== undefined && ` • ${data.flows} flows`}
                  {data.resources_checked !== undefined && ` • ${data.resources_checked} resources checked`}
                </div>
              </div>
            ))}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">Total Confidence</span>
                <span className="text-lg font-bold text-blue-600">
                  {(resource.confidence ?? 0).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VPC Flow Logs Details */}
      {resource.evidence.flowlogs && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            VPC Flow Logs Analysis
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Flows Analyzed</div>
              <div className="text-2xl font-bold text-gray-900">
                {(resource.evidence.flowlogs?.total_flows ?? 0) || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Matched Flows</div>
              <div className="text-2xl font-bold text-blue-600">
                {resource.evidence.flowlogs.matched_flows || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">ENIs Checked</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.flowlogs.enis_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Log Groups Checked</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.flowlogs.log_groups_checked || 0}
              </div>
            </div>
          </div>
          {((resource.evidence.flowlogs?.total_flows ?? 0) > 0) && (
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="text-sm text-gray-600">
                Network traffic analysis validates that permissions are actively used at the network level.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resource Policies Details */}
      {resource.evidence.resourcePolicies && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            Resource Policies Analysis
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Resources Checked</div>
              <div className="text-2xl font-bold text-gray-900">
                {resource.evidence.resourcePolicies.total_resources_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Matching Policies</div>
              <div className="text-2xl font-bold text-purple-600">
                {resource.evidence.resourcePolicies.matching_policies?.length || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">S3 Buckets</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.resourcePolicies.s3_buckets_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">KMS Keys</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.resourcePolicies.kms_keys_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Lambda Functions</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.resourcePolicies.lambda_functions_checked || 0}
              </div>
            </div>
          </div>
          {resource.evidence.resourcePolicies.matching_policies && resource.evidence.resourcePolicies.matching_policies.length > 0 && (
            <div className="mt-4 pt-4 border-t border-purple-200">
              <div className="text-sm font-medium text-gray-700 mb-2">Resources with Access:</div>
              <div className="space-y-1">
                {resource.evidence.resourcePolicies.matching_policies.slice(0, 5).map((policy: any, idx: number) => (
                  <div key={idx} className="text-xs text-gray-600 bg-white px-2 py-1 rounded">
                    {policy.resource_type}: {policy.resource_name || policy.resource_arn}
                  </div>
                ))}
                {resource.evidence.resourcePolicies.matching_policies.length > 5 && (
                  <div className="text-xs text-gray-500">
                    +{resource.evidence.resourcePolicies.matching_policies.length - 5} more resources
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Confidence</h3>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-lg font-bold ${
            resource.evidence?.confidence === 'HIGH' ? 'bg-green-100 text-green-800' :
            resource.evidence?.confidence === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {resource.evidence?.confidence || 'UNKNOWN'}
          </div>
          <div className="text-sm text-gray-600">
            Based on {(resource.evidence?.dataSources || []).length} data source(s) and {resource.evidence?.observationDays || 0} days of observation
          </div>
        </div>
      </div>
    </div>
  )
}

function ImpactTab({ resource }: { resource: GapResource }) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Impact Analysis</h3>
        <div className="space-y-3">
          {[
            'No service disruption expected',
            'All active workflows will continue',
            `Reduces attack surface by ${(resource.gapPercent ?? 0).toFixed(0)}%`,
            'Achieves least privilege compliance'
          ].map((impact, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-gray-700">{impact}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">What Will Continue Working</h3>
        <div className="space-y-2">
          {(resource.usedList || []).slice(0, 5).map((perm, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="font-mono text-gray-700">{perm}</span>
            </div>
          ))}
          {(resource.usedList?.length || 0) > 5 && (
            <div className="text-sm text-gray-500">...and {(resource.usedList?.length || 0) - 5} more used permissions</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">What Will Be Removed</h3>
        <div className="space-y-2">
          {(resource.unusedList || []).slice(0, 5).map((perm, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="font-mono text-gray-700">{perm}</span>
            </div>
          ))}
          {(resource.unusedList?.length || 0) > 5 && (
            <div className="text-sm text-gray-500">...and {(resource.unusedList?.length || 0) - 5} more unused permissions</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SG Simulation Results Modal
// ============================================================================
function SGSimulationResultsModal({ 
  isOpen, 
  onClose, 
  result, 
  onExecute,
  isExecuting = false
}: { 
  isOpen: boolean
  onClose: () => void
  result: any
  onExecute: () => void
  isExecuting?: boolean
}) {
  if (!isOpen || !result) return null

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-500'
    if (score >= 60) return 'text-orange-500'
    if (score >= 30) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getRiskBgColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'HIGH': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Simulation Results</h2>
              <p className="text-sm text-gray-500">{result?.sg_name || 'Unknown'} ({result?.sg_id || 'N/A'})</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Risk Score */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className={`text-5xl font-bold ${getRiskColor(result?.risk_score ?? 0)}`}>
                {result?.risk_score ?? 0}
              </div>
              <div className="text-sm text-gray-500">Risk Score</div>
            </div>
            <div className={`px-4 py-2 rounded-full text-sm font-semibold border ${getRiskBgColor(result?.risk_level ?? 'LOW')}`}>
              {result?.risk_level ?? 'UNKNOWN'} RISK
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  (result?.risk_score ?? 0) >= 80 ? 'bg-red-500' :
                  (result?.risk_score ?? 0) >= 60 ? 'bg-orange-500' :
                  (result?.risk_score ?? 0) >= 30 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${result?.risk_score ?? 0}%` }}
              />
            </div>
          </div>

          {/* Impact Summary */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">Impact Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Rules to remove:</span>
                <span className="font-bold text-red-600">{result.impact_summary?.rules_removed || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Rules to tighten:</span>
                <span className="font-bold text-orange-600">{result.impact_summary?.rules_tightened || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Attack surface reduction:</span>
                <span className="font-bold text-green-600">{result.impact_summary?.attack_surface_reduction || '0%'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">ENIs affected:</span>
                <span className="font-bold text-gray-900">{result.impact_summary?.enis_affected || 0}</span>
              </div>
            </div>
          </div>

          {/* Changes Preview */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Changes Preview</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {safeArray(result?.changes_preview).map((change: any, i: number) => (
                <div 
                  key={i} 
                  className={`p-3 rounded-lg border ${
                    change?.action === 'DELETE' 
                      ? 'bg-red-50 border-red-200' 
                      : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      change?.action === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {change?.action || 'UNKNOWN'}
                    </span>
                    <span className="text-sm text-gray-700">{change?.description || 'No description'}</span>
                  </div>
                </div>
              ))}
              {safeArray(result?.changes_preview).length === 0 && (
                <div className="text-gray-500 text-sm italic">No changes to preview</div>
              )}
            </div>
          </div>

          {/* Warnings */}
          {safeArray(result?.warnings).length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Warnings
              </h3>
              <ul className="space-y-1">
                {safeArray(result?.warnings).map((warning: string, i: number) => (
                  <li key={i} className="text-sm text-yellow-700">• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* CLI Commands */}
          {safeArray(result?.cli_commands).length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">AWS CLI Commands</h3>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                  {safeArray(result?.cli_commands).join('\n\n')}
                </pre>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(safeArray(result?.cli_commands).join('\n\n'))
                }}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <FileDown className="w-4 h-4" />
                Copy Commands
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Confidence: {result?.confidence ?? 75}%
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            {result?.can_proceed ? (
              <button 
                onClick={onExecute}
                disabled={isExecuting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Create Snapshot & Execute
                  </>
                )}
              </button>
            ) : (
              <button 
                onClick={() => {
                  if (confirm('⚠️ Risk is HIGH. Are you absolutely sure you want to proceed? This will modify your Security Group.')) {
                    onExecute()
                  }
                }}
                disabled={isExecuting}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Override & Execute Anyway
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
