import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  getBackendBaseUrl()

// The frontend reads graph data only through the backend API; it no longer queries a graph
// database directly. Two things came only from that retired direct query and are not served by
// any backend operation yet: the per-resource data stores an identity is connected to, and its
// table-level access. Until a backend contract serves them, each is reported with an explicit
// status instead of an empty list that would read as "this identity accesses nothing".
// This is an INCOMPLETE migration, tracked as a backend dependency -- not a finished one.
const TABLE_ACCESS_UNAVAILABLE = {
  available: false,
  reason: "TABLE_ACCESS_NOT_SERVED_BY_BACKEND",
} as const

type DataStoresStatus =
  | { available: true; granularity: "service"; source: "backend:/api/identities/detail" }
  | { available: false; reason: "IDENTITY_DETAIL_UNAVAILABLE" | "PERMISSIONS_NOT_COMPUTED" }

function unavailableResponse(reason: "IDENTITY_DETAIL_UNAVAILABLE", httpStatus: number, backendStatus: number | null) {
  const dataStoresStatus: DataStoresStatus = { available: false, reason }
  return NextResponse.json(
    {
      error: reason,
      backendStatus,
      dataStores: [],
      dataStoresStatus,
      tableAccess: [],
      tableAccessStatus: TABLE_ACCESS_UNAVAILABLE,
      summary: {},
      servicePermissions: {},
    },
    { status: httpStatus },
  )
}

// Map IAM permissions to human-readable data operations
const PERMISSION_OPERATION_MAP: Record<string, { operation: string; service: string }> = {
  // S3
  's3:GetObject': { operation: 'READ', service: 'S3' },
  's3:ListBucket': { operation: 'LIST', service: 'S3' },
  's3:ListAllMyBuckets': { operation: 'LIST', service: 'S3' },
  's3:PutObject': { operation: 'WRITE', service: 'S3' },
  's3:DeleteObject': { operation: 'DELETE', service: 'S3' },
  's3:GetBucketPolicy': { operation: 'READ_POLICY', service: 'S3' },
  's3:PutBucketPolicy': { operation: 'WRITE_POLICY', service: 'S3' },
  // RDS
  'rds-data:ExecuteStatement': { operation: 'EXECUTE', service: 'RDS' },
  'rds-data:BatchExecuteStatement': { operation: 'EXECUTE', service: 'RDS' },
  'rds:DescribeDBInstances': { operation: 'READ_METADATA', service: 'RDS' },
  'rds:CreateDBSnapshot': { operation: 'SNAPSHOT', service: 'RDS' },
  'rds:DeleteDBInstance': { operation: 'DELETE', service: 'RDS' },
  'rds:ModifyDBInstance': { operation: 'MODIFY', service: 'RDS' },
  'rds:StopDBInstance': { operation: 'STOP', service: 'RDS' },
  'rds:StartDBInstance': { operation: 'START', service: 'RDS' },
  // DynamoDB
  'dynamodb:GetItem': { operation: 'READ', service: 'DynamoDB' },
  'dynamodb:Query': { operation: 'READ', service: 'DynamoDB' },
  'dynamodb:Scan': { operation: 'READ', service: 'DynamoDB' },
  'dynamodb:PutItem': { operation: 'WRITE', service: 'DynamoDB' },
  'dynamodb:UpdateItem': { operation: 'WRITE', service: 'DynamoDB' },
  'dynamodb:DeleteItem': { operation: 'DELETE', service: 'DynamoDB' },
  'dynamodb:BatchGetItem': { operation: 'READ', service: 'DynamoDB' },
  'dynamodb:BatchWriteItem': { operation: 'WRITE', service: 'DynamoDB' },
  // Lambda (data plane)
  'lambda:InvokeFunction': { operation: 'INVOKE', service: 'Lambda' },
  // KMS
  'kms:Decrypt': { operation: 'DECRYPT', service: 'KMS' },
  'kms:Encrypt': { operation: 'ENCRYPT', service: 'KMS' },
  'kms:GenerateDataKey': { operation: 'ENCRYPT', service: 'KMS' },
  // Secrets Manager
  'secretsmanager:GetSecretValue': { operation: 'READ', service: 'SecretsManager' },
  'secretsmanager:PutSecretValue': { operation: 'WRITE', service: 'SecretsManager' },
}

const DATA_SERVICES = new Set(['S3', 'RDS', 'DynamoDB', 'KMS', 'SecretsManager', 'Lambda'])

interface DataStoreAccess {
  name: string
  type: string
  // "service": derived from the identity's permissions, not a specific resource, so there is no
  // resource to act on -- resourceName is null and per-resource actions must not be offered.
  granularity: "service"
  resourceName: null
  allowedOperations: string[]
  observedOperations: string[]
  unusedOperations: string[]
  accessLevel: 'FULL' | 'WRITE' | 'READ' | 'NONE'
  recommendation: string
}

function classifyAccessLevel(ops: string[]): 'FULL' | 'WRITE' | 'READ' | 'NONE' {
  if (ops.length === 0) return 'NONE'
  const hasDelete = ops.some(o => o === 'DELETE' || o === 'MODIFY' || o === 'STOP')
  const hasWrite = ops.some(o => o === 'WRITE' || o === 'EXECUTE' || o === 'ENCRYPT' || o === 'INVOKE')
  if (hasDelete) return 'FULL'
  if (hasWrite) return 'WRITE'
  return 'READ'
}

function generateRecommendation(store: DataStoreAccess): string {
  if (store.unusedOperations.length === 0 && store.observedOperations.length > 0)
    return `Access pattern matches permissions. No changes needed.`
  if (store.observedOperations.length === 0)
    return `No observed access to ${store.name}. Consider removing all ${store.type} permissions for this resource.`
  if (store.unusedOperations.includes('DELETE') || store.unusedOperations.includes('MODIFY'))
    return `Restrict to ${store.observedOperations.join('+')} only. Remove destructive operations (${store.unusedOperations.filter(o => ['DELETE', 'MODIFY', 'STOP'].includes(o)).join(', ')}).`
  if (store.unusedOperations.length > 0)
    return `Tighten to ${store.observedOperations.join('+')} only. ${store.unusedOperations.length} unused operation(s) can be removed.`
  return `Review access pattern periodically.`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  try {
    // 1. Fetch identity detail (has permissions, damage classification, etc.)
    let detailRes: Response
    try {
      detailRes = await fetch(
        `${BACKEND_URL}/api/identities/detail/${encodeURIComponent(name)}`,
        { cache: "no-store", signal: AbortSignal.timeout(20000) }
      )
    } catch {
      // Unreachable or timed out: never answer as if the identity had no data access.
      return unavailableResponse("IDENTITY_DETAIL_UNAVAILABLE", 502, null)
    }
    if (!detailRes.ok) {
      return unavailableResponse(
        "IDENTITY_DETAIL_UNAVAILABLE",
        detailRes.status === 404 ? 404 : 502,
        detailRes.status,
      )
    }
    const detail: any = await detailRes.json()

    // 2. Extract permissions and classify by data service
    // Backend returns allowed_actions, used_actions, unused_actions as string arrays
    const analysis = detail?.permission_analysis
    const computed = Array.isArray(analysis?.allowed_actions)
    const allPermissions: string[] = computed ? analysis.allowed_actions : []
    const usedPerms: string[] = Array.isArray(analysis?.used_actions) ? analysis.used_actions : []
    // Passed through only as the backend states them; nothing is inferred when they are absent.
    const permissionEvidence = {
      observationDays: typeof analysis?.observation_days === "number" ? analysis.observation_days : null,
      dataSources: Array.isArray(analysis?.data_sources) ? analysis.data_sources : null,
    }

    // Group permissions by service
    const servicePermissions: Record<string, { allowed: string[]; used: string[]; unused: string[] }> = {}

    for (const permName of allPermissions) {
      const mapping = PERMISSION_OPERATION_MAP[permName]
      if (!mapping) continue
      if (!DATA_SERVICES.has(mapping.service)) continue

      if (!servicePermissions[mapping.service]) {
        servicePermissions[mapping.service] = { allowed: [], used: [], unused: [] }
      }
      servicePermissions[mapping.service].allowed.push(mapping.operation)

      if (usedPerms.includes(permName)) {
        servicePermissions[mapping.service].used.push(mapping.operation)
      } else {
        servicePermissions[mapping.service].unused.push(mapping.operation)
      }
    }

    // Also check for wildcard permissions
    const hasWildcardS3 = allPermissions.some((p: string) => p === 's3:*')
    const hasWildcardRDS = allPermissions.some((p: string) => p === 'rds:*' || p === 'rds-data:*')
    const hasWildcardDDB = allPermissions.some((p: string) => p === 'dynamodb:*')

    if (hasWildcardS3 && !servicePermissions['S3']) {
      servicePermissions['S3'] = { allowed: ['READ', 'WRITE', 'DELETE', 'LIST'], used: [], unused: ['READ', 'WRITE', 'DELETE', 'LIST'] }
    }
    if (hasWildcardRDS && !servicePermissions['RDS']) {
      servicePermissions['RDS'] = { allowed: ['EXECUTE', 'READ_METADATA', 'MODIFY', 'DELETE', 'SNAPSHOT'], used: [], unused: ['EXECUTE', 'READ_METADATA', 'MODIFY', 'DELETE', 'SNAPSHOT'] }
    }
    if (hasWildcardDDB && !servicePermissions['DynamoDB']) {
      servicePermissions['DynamoDB'] = { allowed: ['READ', 'WRITE', 'DELETE'], used: [], unused: ['READ', 'WRITE', 'DELETE'] }
    }

    // 3. Build data store access profiles from the backend's permission analysis. Per-resource
    // store names came only from the retired direct graph query, so each entry names the
    // service and says where it came from.
    const dataStores: DataStoreAccess[] = []
    for (const [service, perms] of Object.entries(servicePermissions)) {
      const store: DataStoreAccess = {
        name: `${service} resources (from permissions)`,
        type: service,
        granularity: "service",
        resourceName: null,
        allowedOperations: [...new Set(perms.allowed)],
        observedOperations: [...new Set(perms.used)],
        unusedOperations: [...new Set(perms.unused)],
        accessLevel: classifyAccessLevel([...new Set(perms.allowed)]),
        recommendation: '',
      }
      store.recommendation = generateRecommendation(store)
      dataStores.push(store)
    }

    // 4. Summary
    const summary = {
      totalDataStores: dataStores.length,
      servicesAccessed: [...new Set(dataStores.map(d => d.type))],
      totalAllowedOps: dataStores.reduce((sum, d) => sum + d.allowedOperations.length, 0),
      totalObservedOps: dataStores.reduce((sum, d) => sum + d.observedOperations.length, 0),
      totalUnusedOps: dataStores.reduce((sum, d) => sum + d.unusedOperations.length, 0),
      hasDestructiveAccess: dataStores.some(d => d.allowedOperations.includes('DELETE') || d.allowedOperations.includes('MODIFY')),
      overallAccessLevel: classifyAccessLevel(dataStores.flatMap(d => d.allowedOperations)),
    }

    const dataStoresStatus: DataStoresStatus = computed
      ? { available: true, granularity: "service", source: "backend:/api/identities/detail" }
      : { available: false, reason: "PERMISSIONS_NOT_COMPUTED" }
    return NextResponse.json({
      dataStores,
      dataStoresStatus,
      tableAccess: [],
      tableAccessStatus: TABLE_ACCESS_UNAVAILABLE,
      permissionEvidence,
      summary,
      servicePermissions,
    })

  } catch {
    // e.g. a backend body that is not JSON: still an explicit unavailable, never an empty profile.
    return unavailableResponse("IDENTITY_DETAIL_UNAVAILABLE", 500, null)
  }
}
