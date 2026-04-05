"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Search,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  Cloud,
  Shield,
  Box,
  Layers,
  Network,
  HardDrive,
  Key,
  FileText,
  User,
  Eye,
  Activity,
  RefreshCw,
  Unplug,
  Trash2,
  Archive,
  AlertTriangle,
  Clock,
  Calendar,
  XCircle,
  BellOff,
  Filter,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  X,
  CheckCircle2,
  Loader2,
  Copy,
  Terminal,
  CheckSquare,
  Square,
  ClipboardList,
} from "lucide-react"

interface SecurityFactor {
  factor: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  detail: string
}

interface OrphanResource {
  id: string
  name: string
  type: string
  region: string
  status: string
  lastSeen: string
  lastUsedBy: string | null
  idleDays: number
  attachedResources: number
  riskLevel: "HIGH" | "MEDIUM" | "LOW"
  confidence: "HIGH" | "MEDIUM" | "LOW"
  recommendation: "DELETE" | "DECOMMISSION" | "REVIEW" | "ARCHIVE"
  recommendationReason: string
  estimatedMonthlyCost: number
  isSeasonal: boolean
  seasonalPattern: string | null
  nextExpectedRun: string | null
  properties: Record<string, any>
  securityRiskScore: number
  securityFactors: SecurityFactor[]
  isInternetFacing: boolean
  hasEncryption: boolean | null
  totalPermissions: number
}

interface OrphanSummary {
  total: number
  seasonalCount: number
  estimatedMonthlySavings: number
  highRisk: number
  mediumRisk: number
  lowRisk: number
}

interface SafetyScore {
  score: number
  breakdown: Record<string, { value: any; score: number; weight: number }>
  recommendation: "SAFE" | "CAUTION" | "RISKY"
  warnings: string[]
}

interface RemediationStep {
  id: string
  title: string
  cli: string
  consoleSteps: string
}

interface RemediationState {
  safetyScore: SafetyScore | null
  checkedSteps: Set<string>
  status: "idle" | "assessed" | "remediating" | "done" | "dismissed"
}

// ═══════════════════════════════════════════════════════════════
// REMEDIATION STEPS PER RESOURCE TYPE
// Real AWS CLI commands — user executes these manually
// ═══════════════════════════════════════════════════════════════
const REMEDIATION_STEPS: Record<string, (name: string) => RemediationStep[]> = {
  EC2Instance: (name) => [
    { id: "ec2-stop", title: "Stop the instance", cli: `aws ec2 stop-instances --instance-ids $(aws ec2 describe-instances --filters "Name=tag:Name,Values=${name}" --query "Reservations[].Instances[].InstanceId" --output text)`, consoleSteps: "EC2 > Instances > Select instance > Instance State > Stop" },
    { id: "ec2-sg", title: "Remove security group access", cli: `# Get instance SG, then revoke all inbound rules\naws ec2 describe-instances --filters "Name=tag:Name,Values=${name}" --query "Reservations[].Instances[].SecurityGroups[].GroupId" --output text`, consoleSteps: "EC2 > Instances > Select > Security > Security Groups > Edit inbound rules > Remove all" },
    { id: "ec2-role", title: "Detach IAM instance profile", cli: `aws ec2 describe-iam-instance-profile-associations --filters "Name=instance-id,Values=<INSTANCE_ID>" --query "IamInstanceProfileAssociations[].AssociationId" --output text\n# Then: aws ec2 disassociate-iam-instance-profile --association-id <ASSOC_ID>`, consoleSteps: "EC2 > Instances > Select > Actions > Security > Modify IAM Role > Remove" },
  ],
  RDSInstance: (name) => [
    { id: "rds-stop", title: "Stop the database instance", cli: `aws rds stop-db-instance --db-instance-identifier ${name.toLowerCase()}`, consoleSteps: "RDS > Databases > Select > Actions > Stop" },
    { id: "rds-public", title: "Disable public accessibility", cli: `aws rds modify-db-instance --db-instance-identifier ${name.toLowerCase()} --no-publicly-accessible`, consoleSteps: "RDS > Databases > Select > Modify > Connectivity > Public access: No" },
    { id: "rds-sg", title: "Remove security group access", cli: `# Move to a restrictive SG with no inbound rules\naws rds modify-db-instance --db-instance-identifier ${name.toLowerCase()} --vpc-security-group-ids <DENY_ALL_SG_ID>`, consoleSteps: "RDS > Databases > Select > Modify > Connectivity > VPC security group > Select deny-all SG" },
  ],
  S3Bucket: (name) => [
    { id: "s3-public", title: "Block all public access", cli: `aws s3api put-public-access-block --bucket ${name} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`, consoleSteps: "S3 > Bucket > Permissions > Block Public Access > Edit > Block all" },
    { id: "s3-policy", title: "Add deny-all bucket policy", cli: `aws s3api put-bucket-policy --bucket ${name} --policy '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Principal":"*","Action":"s3:*","Resource":["arn:aws:s3:::${name}","arn:aws:s3:::${name}/*"],"Condition":{"StringNotEquals":{"aws:PrincipalAccount":"YOUR_ACCOUNT_ID"}}}]}'`, consoleSteps: "S3 > Bucket > Permissions > Bucket policy > Edit > Paste deny-all policy" },
    { id: "s3-encrypt", title: "Enable default encryption", cli: `aws s3api put-bucket-encryption --bucket ${name} --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'`, consoleSteps: "S3 > Bucket > Properties > Default encryption > Edit > SSE-S3" },
  ],
  LambdaFunction: (name) => [
    { id: "lambda-concurrency", title: "Set concurrency to 0 (disable invocations)", cli: `aws lambda put-function-concurrency --function-name ${name} --reserved-concurrent-executions 0`, consoleSteps: "Lambda > Functions > Select > Configuration > Concurrency > Edit > Set to 0" },
    { id: "lambda-triggers", title: "Remove event triggers", cli: `aws lambda list-event-source-mappings --function-name ${name}\n# Then: aws lambda delete-event-source-mapping --uuid <UUID> for each`, consoleSteps: "Lambda > Functions > Select > Configuration > Triggers > Remove all triggers" },
  ],
  IAMRole: (name) => [
    { id: "iam-deny", title: "Attach deny-all inline policy", cli: `aws iam put-role-policy --role-name ${name} --policy-name DenyAll-Quarantine --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Action":"*","Resource":"*"}]}'`, consoleSteps: "IAM > Roles > Select > Permissions > Add inline policy > JSON > Deny */*" },
    { id: "iam-detach", title: "Detach all managed policies", cli: `aws iam list-attached-role-policies --role-name ${name}\n# Then: aws iam detach-role-policy --role-name ${name} --policy-arn <ARN> for each`, consoleSteps: "IAM > Roles > Select > Permissions > Remove each managed policy" },
  ],
  IAMPolicy: (name) => [
    { id: "policy-list", title: "List all policy attachments", cli: `aws iam list-entities-for-policy --policy-arn arn:aws:iam::YOUR_ACCOUNT:policy/${name}`, consoleSteps: "IAM > Policies > Select > Policy usage > See attached entities" },
    { id: "policy-detach", title: "Detach from all roles/users/groups", cli: `# Detach from each entity listed above\naws iam detach-role-policy --role-name <ROLE> --policy-arn <ARN>\naws iam detach-user-policy --user-name <USER> --policy-arn <ARN>`, consoleSteps: "IAM > Policies > Select > Policy usage > Detach from each entity" },
  ],
  SecurityGroup: (name) => [
    { id: "sg-backup", title: "Document current rules (backup)", cli: `aws ec2 describe-security-groups --filters "Name=group-name,Values=${name}" --output json > sg-backup-${name}.json`, consoleSteps: "EC2 > Security Groups > Select > Copy/screenshot all inbound & outbound rules" },
    { id: "sg-revoke", title: "Remove all inbound rules", cli: `SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${name}" --query "SecurityGroups[0].GroupId" --output text)\naws ec2 revoke-security-group-ingress --group-id $SG_ID --security-group-rule-ids $(aws ec2 describe-security-group-rules --filter "Name=group-id,Values=$SG_ID" --query "SecurityGroupRules[?!IsEgress].SecurityGroupRuleId" --output text)`, consoleSteps: "EC2 > Security Groups > Select > Inbound rules > Edit > Remove all rules > Save" },
  ],
  SQSQueue: (name) => [
    { id: "sqs-deny", title: "Add deny-all queue policy", cli: `aws sqs set-queue-attributes --queue-url $(aws sqs get-queue-url --queue-name ${name} --query QueueUrl --output text) --attributes '{"Policy":"{\\"Version\\":\\"2012-10-17\\",\\"Statement\\":[{\\"Effect\\":\\"Deny\\",\\"Principal\\":\\"*\\",\\"Action\\":\\"SQS:*\\",\\"Resource\\":\\"*\\"}]}"}'`, consoleSteps: "SQS > Select queue > Access policy > Edit > Add Deny * statement" },
  ],
  DynamoDBTable: (name) => [
    { id: "dynamo-encrypt", title: "Enable encryption at rest", cli: `aws dynamodb update-table --table-name ${name} --sse-specification Enabled=true`, consoleSteps: "DynamoDB > Tables > Select > Additional settings > Encryption > Manage encryption > AWS owned key" },
    { id: "dynamo-restrict", title: "Restrict IAM access to table", cli: `# Add deny policy on roles that access this table\n# Target ARN: arn:aws:dynamodb:REGION:ACCOUNT:table/${name}`, consoleSteps: "IAM > Find roles accessing this table > Add inline deny policy for this table ARN" },
  ],
}

function getRemediationSteps(resourceType: string, resourceName: string): RemediationStep[] {
  const fn = REMEDIATION_STEPS[resourceType]
  if (fn) return fn(resourceName)
  // Fallback for unknown types
  return [{ id: "generic-review", title: "Review resource in AWS Console", cli: `# No specific CLI command — review ${resourceName} (${resourceType}) manually`, consoleSteps: "Open AWS Console > Navigate to the service > Find and review the resource" }]
}

interface OrphanServicesTabProps {
  systemName: string
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  EC2: Server, EC2Instance: Server, Lambda: Cloud, LambdaFunction: Cloud,
  S3: HardDrive, S3Bucket: HardDrive, RDS: Database, RDSInstance: Database,
  DynamoDB: Database, DynamoDBTable: Database, ECS: Box, EKS: Box,
  VPC: Network, Subnet: Network,
  LoadBalancer: Layers, ALB: Layers, NLB: Layers, IAMRole: Key, IAMPolicy: FileText,
  IAMUser: User, SecurityGroup: Shield, CloudTrail: Eye, CloudWatch: Activity,
  SQSQueue: Layers, StepFunction: Activity, EventBridge: Activity,
  default: Box,
}

const SERVICE_COLORS: Record<string, string> = {
  EC2: "bg-[#f9731620] text-[#f97316]", EC2Instance: "bg-[#f9731620] text-[#f97316]",
  Lambda: "bg-[#f9731620] text-[#f97316]", LambdaFunction: "bg-[#f9731620] text-[#f97316]",
  S3: "bg-[#22c55e20] text-[#22c55e]", S3Bucket: "bg-[#22c55e20] text-[#22c55e]",
  RDS: "bg-[#3b82f620] text-[#3b82f6]", RDSInstance: "bg-[#3b82f620] text-[#3b82f6]",
  DynamoDB: "bg-[#8b5cf615] text-[#7c3aed]", DynamoDBTable: "bg-[#8b5cf615] text-[#7c3aed]",
  ECS: "bg-cyan-100 text-cyan-700", EKS: "bg-cyan-100 text-cyan-700",
  LoadBalancer: "bg-teal-100 text-teal-700", IAMRole: "bg-[#ef444420] text-[#ef4444]",
  IAMPolicy: "bg-[#ef444420] text-[#ef4444]", IAMUser: "bg-[#ef444420] text-[#ef4444]",
  SecurityGroup: "bg-pink-100 text-pink-700",
  SQSQueue: "bg-teal-100 text-teal-700", StepFunction: "bg-[#8b5cf615] text-[#7c3aed]",
  EventBridge: "bg-[#f9731620] text-[#f97316]",
  default: "bg-gray-100 text-[var(--foreground,#374151)]",
}

const COMPUTE_DATA_TYPES = [
  "EC2", "EC2Instance", "Lambda", "LambdaFunction", "RDS", "RDSInstance",
  "S3", "S3Bucket", "DynamoDB", "DynamoDBTable",
  "ECS", "EKS", "LoadBalancer", "ALB", "NLB", "ElasticIP", "NAT", "NATGateway",
  "SQSQueue", "StepFunction", "EventBridge",
]

const IDENTITY_SECURITY_TYPES = [
  "IAMRole", "IAMPolicy", "IAMUser", "SecurityGroup",
]

const RISK_COLORS = {
  HIGH: "bg-[#ef444420] text-[#ef4444] border-[#ef444440]",
  MEDIUM: "bg-[#f9731620] text-[#f97316] border-[#f9731640]",
  LOW: "bg-[#eab30820] text-[#eab308] border-[#eab30840]",
}

const CONFIDENCE_COLORS = {
  HIGH: "text-[#22c55e]",
  MEDIUM: "text-[#f97316]",
  LOW: "text-[#6b7280]",
}

const RECOMMENDATION_CONFIG = {
  DELETE: { icon: Trash2, color: "bg-[#ef4444] text-white", label: "Delete" },
  DECOMMISSION: { icon: XCircle, color: "bg-[#f97316] text-white", label: "Decommission" },
  REVIEW: { icon: Eye, color: "bg-[#3b82f6] text-white", label: "Review" },
  ARCHIVE: { icon: Archive, color: "bg-[#8b5cf6] text-white", label: "Archive" },
}

const REMEDIATION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bgColor: string }> = {
  assessed: { label: "Assessed", color: "text-[#3b82f6]", icon: ShieldAlert, bgColor: "bg-[#3b82f610]" },
  remediating: { label: "Remediating", color: "text-[#f97316]", icon: ClipboardList, bgColor: "bg-[#f9731610]" },
  done: { label: "Remediated", color: "text-[#22c55e]", icon: CheckCircle2, bgColor: "bg-[#22c55e10]" },
}

export function OrphanServicesTab({ systemName }: OrphanServicesTabProps) {
  const [orphans, setOrphans] = useState<OrphanResource[]>([])
  const [seasonal, setSeasonal] = useState<OrphanResource[]>([])
  const [summary, setSummary] = useState<OrphanSummary>({ total: 0, seasonalCount: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [riskFilter, setRiskFilter] = useState<string>("ALL")
  const [typeFilter, setTypeFilter] = useState<string>("ALL")
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["orphans", "seasonal"]))

  // Remediation state
  const [remediationStates, setRemediationStates] = useState<Record<string, RemediationState>>({})
  const [activeModal, setActiveModal] = useState<{ orphan: OrphanResource; phase: "loading" | "assessment" | "checklist"; safetyScore: SafetyScore | null; error: string | null } | null>(null)

  // Load saved remediation state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`remediation-${systemName}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        // Restore Set from array
        const restored: Record<string, RemediationState> = {}
        for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
          restored[k] = { ...v, checkedSteps: new Set(v.checkedSteps || []) }
        }
        setRemediationStates(restored)
      }
    } catch { /* ignore */ }
  }, [systemName])

  // Persist remediation state to localStorage
  const saveRemediationState = (states: Record<string, RemediationState>) => {
    setRemediationStates(states)
    try {
      const serializable: Record<string, any> = {}
      for (const [k, v] of Object.entries(states)) {
        serializable[k] = { ...v, checkedSteps: Array.from(v.checkedSteps) }
      }
      localStorage.setItem(`remediation-${systemName}`, JSON.stringify(serializable))
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchOrphanServices()
  }, [systemName])

  const fetchOrphanServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/proxy/orphan-services/${encodeURIComponent(systemName)}`)
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)
      const data = await response.json()
      setOrphans(data.orphans || [])
      setSeasonal(data.seasonal || [])
      setSummary(data.summary || { total: 0, seasonalCount: 0, estimatedMonthlySavings: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 })
    } catch (err: any) {
      console.error("[OrphanServices] Fetch error:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Risk Assessment (pre-check with real safety score) ---
  const runAssessment = async (orphan: OrphanResource) => {
    setActiveModal({ orphan, phase: "loading", safetyScore: null, error: null })
    try {
      const response = await fetch('/api/proxy/quarantine/pre-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceName: orphan.name,
          resourceType: orphan.type,
          systemName,
          idleDays: orphan.idleDays,
          connections: orphan.attachedResources,
          recentCloudTrailEvents: 0,
          recentFlowLogHits: 0,
        }),
      })
      if (!response.ok) {
        const errBody = await response.text()
        let errMsg = `Server error (${response.status})`
        try { errMsg = JSON.parse(errBody).error || JSON.parse(errBody).detail || errMsg } catch {}
        throw new Error(errMsg)
      }
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setActiveModal({ orphan, phase: "assessment", safetyScore: data.safetyScore, error: null })
      // Update remediation state
      const newStates = { ...remediationStates }
      if (!newStates[orphan.id]) {
        newStates[orphan.id] = { safetyScore: data.safetyScore, checkedSteps: new Set(), status: "assessed" }
      } else {
        newStates[orphan.id] = { ...newStates[orphan.id], safetyScore: data.safetyScore, status: newStates[orphan.id].status === "done" ? "done" : "assessed" }
      }
      saveRemediationState(newStates)
    } catch (err: any) {
      setActiveModal({ orphan, phase: "assessment", safetyScore: null, error: err.message || "Unknown error" })
    }
  }

  // --- Open remediation checklist ---
  const openChecklist = (orphan: OrphanResource) => {
    const state = remediationStates[orphan.id]
    setActiveModal({ orphan, phase: "checklist", safetyScore: state?.safetyScore || null, error: null })
    // Initialize or transition state
    const newStates = { ...remediationStates }
    if (!state) {
      // First time opening checklist — create state
      newStates[orphan.id] = { safetyScore: null, checkedSteps: new Set(), status: "remediating" }
    } else if (state.status !== "done") {
      newStates[orphan.id] = { ...state, status: "remediating" }
    }
    saveRemediationState(newStates)
  }

  // --- Toggle a checklist step ---
  const toggleStep = (orphanId: string, stepId: string) => {
    const state = remediationStates[orphanId] || { safetyScore: null, checkedSteps: new Set<string>(), status: "remediating" as const }
    const newChecked = new Set(state.checkedSteps)
    if (newChecked.has(stepId)) newChecked.delete(stepId)
    else newChecked.add(stepId)
    const newStates = { ...remediationStates, [orphanId]: { ...state, checkedSteps: newChecked, status: "remediating" as const } }
    saveRemediationState(newStates)
  }

  // --- Mark as fully remediated ---
  const markDone = (orphanId: string) => {
    const state = remediationStates[orphanId]
    if (!state) return
    const newStates = { ...remediationStates, [orphanId]: { ...state, status: "done" as const } }
    saveRemediationState(newStates)
    setActiveModal(null)
  }

  // --- Copy to clipboard ---
  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch {}
  }

  const filteredOrphans = useMemo(() => {
    return orphans.filter((o) => {
      if (dismissedIds.has(o.id)) return false
      if (riskFilter !== "ALL" && o.riskLevel !== riskFilter) return false
      if (typeFilter !== "ALL") {
        const typeUpper = o.type.toUpperCase()
        if (typeFilter === "COMPUTE" && !COMPUTE_DATA_TYPES.some(t => typeUpper.includes(t.toUpperCase()))) return false
        if (typeFilter === "IDENTITY" && !IDENTITY_SECURITY_TYPES.some(t => typeUpper.includes(t.toUpperCase()))) return false
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return o.name.toLowerCase().includes(q) || o.type.toLowerCase().includes(q) || o.region.toLowerCase().includes(q)
      }
      return true
    })
  }, [orphans, dismissedIds, riskFilter, typeFilter, searchQuery])

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const dismissOrphan = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id))
  }

  const formatDate = (iso: string) => {
    if (!iso || iso === "1970-01-01T00:00:00.000Z") return "Unknown"
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  }

  const formatDateTime = (iso: string) => {
    if (!iso) return "—"
    return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  const getIcon = (type: string) => SERVICE_ICONS[type] || SERVICE_ICONS.default
  const getColor = (type: string) => SERVICE_COLORS[type] || SERVICE_COLORS.default

  // --- Safety Score Gauge ---
  const SafetyGauge = ({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) => {
    const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444"
    const label = score >= 75 ? "Safe" : score >= 50 ? "Caution" : "Risky"
    const radius = size === "lg" ? 45 : 20
    const stroke = size === "lg" ? 8 : 4
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (score / 100) * circumference
    const viewSize = (radius + stroke) * 2

    return (
      <div className="flex flex-col items-center gap-1">
        <svg width={viewSize} height={viewSize} className="transform -rotate-90">
          <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-500" />
        </svg>
        <div className="absolute flex flex-col items-center" style={{ marginTop: size === "lg" ? radius - 8 : radius - 4 }}>
          <span className={`${size === "lg" ? "text-2xl" : "text-sm"} font-bold`} style={{ color }}>{score}</span>
        </div>
        {size === "lg" && <span className="text-xs font-medium" style={{ color }}>{label}</span>}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-[#8b5cf6] animate-spin" />
        <span className="ml-3 text-slate-600">Scanning for orphan services...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] bg-red-50 rounded-xl">
        <AlertTriangle className="w-10 h-10 text-[#ef4444] mb-3" />
        <p className="text-[#ef4444] font-medium">Failed to load orphan services</p>
        <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">{error}</p>
        <button onClick={fetchOrphanServices} className="mt-4 px-4 py-2 bg-[#8b5cf6] text-white rounded-lg text-sm hover:bg-[#7c3aed] transition-colors">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats Bar */}
      <div className="bg-gray-50 rounded-xl p-5 border border-[var(--border,#e5e7eb)]">
        <div className="flex gap-3 w-[30%] min-w-[420px]">
          <div className="flex-1 bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)] text-center">
            <Unplug className="w-4 h-4 mx-auto mb-1 text-[#8b5cf6]" />
            <div className="text-lg font-bold text-[var(--foreground,#111827)]">{summary.total}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Orphans</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#f9731640] text-center">
            <ShieldOff className="w-4 h-4 mx-auto mb-1 text-[#f97316]" />
            <div className="text-lg font-bold text-[#f97316]">{summary.mediumRisk}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Medium Risk</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#ef444440] text-center">
            <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-[#ef4444]" />
            <div className="text-lg font-bold text-[#ef4444]">{summary.highRisk}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">High Risk</div>
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 border border-[#22c55e40] text-center">
            <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-[#22c55e]" />
            <div className="text-lg font-bold text-[#22c55e]">{Object.values(remediationStates).filter(s => s.status === "done").length}</div>
            <div className="text-[10px] text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Remediated</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground,#9ca3af)]" />
          <input
            type="text"
            placeholder="Search orphan services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border,#e5e7eb)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf620] focus:border-[#8b5cf6]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="text-sm border border-[var(--border,#e5e7eb)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf620]"
          >
            <option value="ALL">All Risk Levels</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="LOW">Low Risk</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-sm border border-[var(--border,#e5e7eb)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf620]"
          >
            <option value="ALL">All Types</option>
            <option value="COMPUTE">Compute & Data</option>
            <option value="IDENTITY">Identity & Security</option>
          </select>
        </div>
        <button
          onClick={() => { fetchOrphanServices(); fetchQuarantineRecords() }}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Rescan
        </button>
      </div>

      {/* Orphan Services Section */}
      <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] overflow-hidden">
        <button
          onClick={() => toggleSection("orphans")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {expandedSections.has("orphans") ? <ChevronDown className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" /> : <ChevronRight className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" />}
            <Unplug className="w-5 h-5 text-[#ef4444]" />
            <span className="font-semibold text-[var(--foreground,#111827)]">Orphan Services</span>
            <span className="text-sm text-[var(--muted-foreground,#6b7280)]">({filteredOrphans.length})</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground,#6b7280)]">
            <ShieldAlert className="w-4 h-4 text-[#f97316]" />
            {summary.highRisk} high · {summary.mediumRisk} medium · {summary.lowRisk} low risk
          </div>
        </button>

        {expandedSections.has("orphans") && (
          <div className="border-t border-[var(--border,#e5e7eb)]">
            {filteredOrphans.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted-foreground,#6b7280)]">
                <Unplug className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No orphan services found</p>
                <p className="text-sm mt-1">All services in this system are actively connected</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border,#e5e7eb)]">
                {filteredOrphans.map((orphan) => {
                  const Icon = getIcon(orphan.type)
                  const colorClass = getColor(orphan.type)
                  const riskClass = RISK_COLORS[orphan.riskLevel]
                  const recConfig = RECOMMENDATION_CONFIG[orphan.recommendation]
                  const RecIcon = recConfig.icon
                  const isExpanded = expandedCards.has(orphan.id)
                  const remState = remediationStates[orphan.id]
                  const remStatus = remState?.status || "idle"
                  const remConfig = REMEDIATION_STATUS_CONFIG[remStatus]

                  return (
                    <div key={orphan.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Card Header */}
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer"
                        onClick={() => toggleCard(orphan.id)}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--foreground,#111827)] truncate">{orphan.name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-[var(--muted-foreground,#6b7280)]">{orphan.type}</span>
                            {remConfig && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${remConfig.bgColor} ${remConfig.color} flex items-center gap-1`}>
                                <remConfig.icon className="w-3 h-3" />
                                {remConfig.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted-foreground,#6b7280)]">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{orphan.lastSeen ? `${orphan.idleDays}d idle` : `${orphan.idleDays}d idle (no activity ever)`}</span>
                            <span>{orphan.region}</span>
                            {orphan.lastUsedBy && <span>Last used by: {orphan.lastUsedBy}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {orphan.isInternetFacing && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#ef444415] text-[#ef4444] border border-[#ef444430] flex items-center gap-1">
                              <Network className="w-3 h-3" />Internet
                            </span>
                          )}
                          {orphan.securityFactors?.some(f => f.severity === 'CRITICAL') && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#ef444415] text-[#ef4444] border border-[#ef444430] flex items-center gap-1">
                              <ShieldOff className="w-3 h-3" />Critical
                            </span>
                          )}
                          {orphan.estimatedMonthlyCost > 0 && (
                            <span className="text-xs font-medium text-[#22c55e] bg-[#22c55e10] px-2 py-1 rounded">
                              ${orphan.estimatedMonthlyCost}/mo
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${riskClass}`}>
                            {orphan.riskLevel}
                          </span>
                          <span className={`text-xs font-medium px-2 py-1 rounded ${recConfig.color}`}>
                            <RecIcon className="w-3 h-3 inline mr-1" />
                            {recConfig.label}
                          </span>
                        </div>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" /> : <ChevronRight className="w-4 h-4 text-[var(--muted-foreground,#6b7280)]" />}
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 ml-[52px]">
                          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                            {/* Detail Grid */}
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Last Active</div>
                                <div className={`font-medium ${orphan.lastSeen ? 'text-[var(--foreground,#111827)]' : 'text-[#ef4444]'}`}>{orphan.lastSeen ? formatDate(orphan.lastSeen) : 'No activity detected'}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Idle Duration</div>
                                <div className="font-medium text-[var(--foreground,#111827)]">{orphan.lastSeen ? `${orphan.idleDays} days since last activity` : 'No activity ever recorded'}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Connections</div>
                                <div className={`font-medium ${orphan.attachedResources === 0 ? 'text-[#ef4444]' : 'text-[var(--foreground,#111827)]'}`}>{orphan.attachedResources === 0 ? 'None — completely isolated' : `${orphan.attachedResources} ${orphan.attachedResources === 1 ? 'resource' : 'resources'}`}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Evidence Sources</div>
                                <div className="font-medium text-[var(--foreground,#111827)]">{orphan.lastSeen ? 'CloudTrail · Flow Logs · Access Advisor' : 'No evidence found in any source'}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted-foreground,#6b7280)] text-xs">Confidence</div>
                                <div className={`font-medium ${CONFIDENCE_COLORS[orphan.confidence]}`}>{orphan.confidence} — {!orphan.lastSeen ? 'No activity across any evidence plane' : orphan.idleDays >= 180 ? `${Math.floor(orphan.idleDays / 30)}+ months since last activity` : `${orphan.idleDays} days since last observed activity`}</div>
                              </div>
                            </div>

                            {/* Security Risk Factors */}
                            {orphan.securityFactors && orphan.securityFactors.length > 0 && (
                              <div className="bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)]">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide flex items-center gap-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    Security Risk Factors
                                  </h4>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                    orphan.securityRiskScore >= 50 ? 'bg-[#ef444420] text-[#ef4444]' :
                                    orphan.securityRiskScore >= 25 ? 'bg-[#f9731620] text-[#f97316]' :
                                    'bg-[#eab30820] text-[#eab308]'
                                  }`}>
                                    Risk Score: {orphan.securityRiskScore}/100
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {orphan.securityFactors.map((factor, i) => (
                                    <div key={i} className={`flex items-start gap-2 text-xs p-1.5 rounded ${
                                      factor.severity === 'CRITICAL' ? 'bg-[#ef444408]' :
                                      factor.severity === 'HIGH' ? 'bg-[#f9731608]' :
                                      'bg-[#eab30808]'
                                    }`}>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                        factor.severity === 'CRITICAL' ? 'bg-[#ef4444] text-white' :
                                        factor.severity === 'HIGH' ? 'bg-[#f97316] text-white' :
                                        'bg-[#eab308] text-white'
                                      }`}>{factor.severity}</span>
                                      <span className="text-[var(--foreground,#111827)]">{factor.detail}</span>
                                    </div>
                                  ))}
                                </div>
                                {orphan.hasEncryption === false && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs text-[#f97316]">
                                    <ShieldOff className="w-3 h-3" />
                                    No encryption at rest detected
                                  </div>
                                )}
                                {orphan.hasEncryption === true && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs text-[#22c55e]">
                                    <ShieldCheck className="w-3 h-3" />
                                    Encryption at rest enabled
                                  </div>
                                )}
                              </div>
                            )}

                            {/* No security factors - show clean status */}
                            {(!orphan.securityFactors || orphan.securityFactors.length === 0) && (
                              <div className="bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)]">
                                <div className="flex items-center gap-2 text-xs text-[#22c55e]">
                                  <ShieldCheck className="w-4 h-4" />
                                  <span className="font-medium">No security exposure detected</span>
                                  <span className="text-[var(--muted-foreground,#6b7280)]">— not internet-facing, no public SGs, permissions within bounds</span>
                                </div>
                              </div>
                            )}

                            {/* Recommendation */}
                            <div className="bg-white rounded-lg p-3 border border-[var(--border,#e5e7eb)]">
                              <div className="flex items-start gap-2">
                                <RecIcon className={`w-4 h-4 mt-0.5 ${orphan.recommendation === 'DELETE' ? 'text-[#ef4444]' : orphan.recommendation === 'DECOMMISSION' ? 'text-[#f97316]' : 'text-[#3b82f6]'}`} />
                                <div>
                                  <div className="text-sm font-medium text-[var(--foreground,#111827)]">Recommendation: {recConfig.label}</div>
                                  <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">{orphan.recommendationReason}</p>
                                </div>
                              </div>
                            </div>

                            {/* Remediation Actions */}
                            <div className="flex items-center gap-2 pt-1">
                              {remStatus === "done" ? (
                                <>
                                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#22c55e10] text-[#22c55e] rounded-lg border border-[#22c55e30] font-medium">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Remediated
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openChecklist(orphan) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                                  >
                                    <ClipboardList className="w-3 h-3" />
                                    View Steps
                                  </button>
                                </>
                              ) : remStatus === "remediating" ? (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openChecklist(orphan) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#f97316] text-white rounded-lg hover:bg-[#ea580c] transition-colors"
                                  >
                                    <ClipboardList className="w-3 h-3" />
                                    Continue Remediation
                                  </button>
                                  <span className="text-[10px] text-[var(--muted-foreground,#6b7280)]">
                                    {remState?.checkedSteps.size || 0}/{getRemediationSteps(orphan.type, orphan.name).length} steps done
                                  </span>
                                </>
                              ) : remStatus === "assessed" ? (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openChecklist(orphan) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors"
                                  >
                                    <ClipboardList className="w-3 h-3" />
                                    View Remediation Plan
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); dismissOrphan(orphan.id) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                                  >
                                    <BellOff className="w-3 h-3" />
                                    Dismiss
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); runAssessment(orphan) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors"
                                  >
                                    <ShieldAlert className="w-3 h-3" />
                                    Assess Risk
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openChecklist(orphan) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#8b5cf630] text-[#8b5cf6] rounded-lg hover:bg-[#8b5cf610] transition-colors"
                                  >
                                    <ClipboardList className="w-3 h-3" />
                                    Remediation Plan
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); dismissOrphan(orphan.id) }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-100 transition-colors text-[var(--muted-foreground,#6b7280)]"
                                  >
                                    <BellOff className="w-3 h-3" />
                                    Dismiss
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seasonal Services Section */}
      {seasonal.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] overflow-hidden">
          <button
            onClick={() => toggleSection("seasonal")}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {expandedSections.has("seasonal") ? <ChevronDown className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" /> : <ChevronRight className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" />}
              <Calendar className="w-5 h-5 text-[#3b82f6]" />
              <span className="font-semibold text-[var(--foreground,#111827)]">Seasonal Services</span>
              <span className="text-sm text-[var(--muted-foreground,#6b7280)]">({seasonal.length})</span>
            </div>
            <span className="text-xs text-[#3b82f6] bg-[#3b82f610] px-2 py-1 rounded">Periodic usage pattern detected</span>
          </button>

          {expandedSections.has("seasonal") && (
            <div className="border-t border-[var(--border,#e5e7eb)] divide-y divide-[var(--border,#e5e7eb)]">
              {seasonal.map((svc) => {
                const Icon = getIcon(svc.type)
                const colorClass = getColor(svc.type)
                return (
                  <div key={svc.id} className="flex items-center gap-4 p-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--foreground,#111827)] truncate">{svc.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-[var(--muted-foreground,#6b7280)]">{svc.type}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted-foreground,#6b7280)]">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{svc.seasonalPattern}</span>
                        <span>Last active: {formatDate(svc.lastSeen)}</span>
                        {svc.nextExpectedRun && <span className="text-[#3b82f6]">Next: {formatDate(svc.nextExpectedRun)}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-[#3b82f6] bg-[#3b82f610] px-2 py-1 rounded font-medium">
                      {svc.seasonalPattern}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ======= ASSESSMENT + REMEDIATION MODAL ======= */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border,#e5e7eb)]">
              <div className="flex items-center gap-3">
                {activeModal.phase === "checklist" ? <ClipboardList className="w-6 h-6 text-[#8b5cf6]" /> : <ShieldAlert className="w-6 h-6 text-[#8b5cf6]" />}
                <div>
                  <h3 className="font-semibold text-[var(--foreground,#111827)]">
                    {activeModal.phase === "checklist" ? "Remediation Plan" : "Risk Assessment"}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground,#6b7280)]">{activeModal.orphan.name} ({activeModal.orphan.type})</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeModal.phase === "assessment" && activeModal.safetyScore && (
                  <button
                    onClick={() => {
                      setActiveModal({ ...activeModal, phase: "checklist" })
                      // Transition to remediating
                      const state = remediationStates[activeModal.orphan.id]
                      if (state && state.status !== "done") {
                        saveRemediationState({ ...remediationStates, [activeModal.orphan.id]: { ...state, status: "remediating" } })
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors"
                  >
                    <ClipboardList className="w-3 h-3" />
                    View Plan
                  </button>
                )}
                {activeModal.phase === "checklist" && activeModal.safetyScore && (
                  <button
                    onClick={() => setActiveModal({ ...activeModal, phase: "assessment" })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border,#e5e7eb)] rounded-lg hover:bg-gray-50 transition-colors text-[var(--muted-foreground,#6b7280)]"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    Assessment
                  </button>
                )}
                <button onClick={() => setActiveModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-[var(--muted-foreground,#6b7280)]" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Loading */}
              {activeModal.phase === "loading" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-10 h-10 text-[#8b5cf6] animate-spin mb-3" />
                  <p className="text-sm text-[var(--muted-foreground,#6b7280)]">Running risk assessment...</p>
                </div>
              )}

              {/* Error */}
              {activeModal.phase === "assessment" && !activeModal.safetyScore && activeModal.error && (
                <div className="text-center py-8">
                  <AlertTriangle className="w-10 h-10 text-[#ef4444] mx-auto mb-3" />
                  <p className="text-sm font-medium text-[#ef4444] mb-2">Assessment failed</p>
                  <p className="text-xs text-[var(--muted-foreground,#6b7280)] mb-4 px-4 py-2 bg-[#ef444410] rounded-lg mx-4">{activeModal.error}</p>
                  <button onClick={() => runAssessment(activeModal.orphan)} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed]">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                </div>
              )}

              {/* Assessment View */}
              {activeModal.phase === "assessment" && activeModal.safetyScore && (
                <>
                  <div className="flex items-center justify-center py-4 relative">
                    <SafetyGauge score={activeModal.safetyScore.score} />
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      activeModal.safetyScore.recommendation === "SAFE" ? "bg-[#22c55e20] text-[#22c55e]" :
                      activeModal.safetyScore.recommendation === "CAUTION" ? "bg-[#f9731620] text-[#f97316]" :
                      "bg-[#ef444420] text-[#ef4444]"
                    }`}>
                      {activeModal.safetyScore.recommendation === "SAFE" ? "Safe to Remediate" :
                       activeModal.safetyScore.recommendation === "CAUTION" ? "Proceed with Caution" :
                       "High Risk — Review Carefully"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Score Breakdown</h4>
                    {Object.entries(activeModal.safetyScore.breakdown).map(([key, data]) => (
                      <div key={key} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[var(--foreground,#111827)] capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className="text-[var(--muted-foreground,#6b7280)]">{data.score}/100 ({Math.round(data.weight * 100)}% weight)</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${data.score >= 70 ? "bg-[#22c55e]" : data.score >= 40 ? "bg-[#f97316]" : "bg-[#ef4444]"}`} style={{ width: `${data.score}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {activeModal.safetyScore.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide">Warnings</h4>
                      {activeModal.safetyScore.warnings.map((warning, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-[#f9731610] rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#f97316] mt-0.5 shrink-0" />
                          <span className="text-xs text-[#f97316]">{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Remediation Checklist View */}
              {activeModal.phase === "checklist" && (() => {
                const steps = getRemediationSteps(activeModal.orphan.type, activeModal.orphan.name)
                const state = remediationStates[activeModal.orphan.id]
                const checked = state?.checkedSteps || new Set<string>()
                const allDone = steps.every(s => checked.has(s.id))

                return (
                  <>
                    <div className="bg-[#8b5cf608] border border-[#8b5cf620] rounded-lg p-3">
                      <div className="flex items-center gap-2 text-xs text-[#8b5cf6]">
                        <Terminal className="w-4 h-4" />
                        <span className="font-medium">Manual AWS actions required</span>
                      </div>
                      <p className="text-[11px] text-[var(--muted-foreground,#6b7280)] mt-1">
                        Execute these steps in your AWS Console or CLI. Check each step as you complete it.
                      </p>
                    </div>

                    {/* Progress */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#8b5cf6] rounded-full transition-all duration-300"
                          style={{ width: `${steps.length > 0 ? (checked.size / steps.length) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-[var(--muted-foreground,#6b7280)]">{checked.size}/{steps.length}</span>
                    </div>

                    {/* Steps */}
                    <div className="space-y-3">
                      {steps.map((step, i) => {
                        const isDone = checked.has(step.id)
                        return (
                          <div key={step.id} className={`rounded-lg border ${isDone ? 'border-[#22c55e30] bg-[#22c55e05]' : 'border-[var(--border,#e5e7eb)] bg-white'} overflow-hidden`}>
                            <div
                              className="flex items-start gap-3 p-3 cursor-pointer"
                              onClick={() => toggleStep(activeModal.orphan.id, step.id)}
                            >
                              {isDone
                                ? <CheckSquare className="w-5 h-5 text-[#22c55e] shrink-0 mt-0.5" />
                                : <Square className="w-5 h-5 text-[var(--muted-foreground,#9ca3af)] shrink-0 mt-0.5" />
                              }
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-[var(--muted-foreground,#6b7280)] bg-gray-100 w-5 h-5 rounded-full flex items-center justify-center">{i + 1}</span>
                                  <span className={`text-sm font-medium ${isDone ? 'text-[#22c55e] line-through' : 'text-[var(--foreground,#111827)]'}`}>{step.title}</span>
                                </div>
                                <p className="text-[11px] text-[var(--muted-foreground,#6b7280)] mt-1">{step.consoleSteps}</p>
                              </div>
                            </div>
                            {/* CLI command */}
                            <div className="border-t border-[var(--border,#e5e7eb)] bg-[#1e1e2e] px-3 py-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-[#6b7280] font-medium flex items-center gap-1"><Terminal className="w-3 h-3" /> AWS CLI</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); copyToClipboard(step.cli) }}
                                  className="text-[10px] text-[#6b7280] hover:text-white flex items-center gap-1 transition-colors"
                                >
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                              </div>
                              <pre className="text-[11px] text-[#e2e8f0] font-mono whitespace-pre-wrap break-all leading-relaxed">{step.cli}</pre>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Mark as Done */}
                    {allDone && (
                      <button
                        onClick={() => markDone(activeModal.orphan.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm bg-[#22c55e] text-white rounded-lg hover:bg-[#16a34a] transition-colors font-medium"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Mark as Remediated
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
