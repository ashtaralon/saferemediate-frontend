import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

const NEO4J_URI = process.env.NEO4J_URI || process.env.NEXT_PUBLIC_NEO4J_URI || ''
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || process.env.NEXT_PUBLIC_NEO4J_USERNAME || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.NEXT_PUBLIC_NEO4J_PASSWORD || ''

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
  allowedOperations: string[]
  observedOperations: string[]
  unusedOperations: string[]
  accessLevel: 'FULL' | 'WRITE' | 'READ' | 'NONE'
  recommendation: string
}

async function runNeo4jQuery(cypher: string): Promise<any[]> {
  if (!NEO4J_URI || !NEO4J_PASSWORD) return []
  try {
    let httpUri = NEO4J_URI
    if (httpUri.startsWith('neo4j+s://')) httpUri = httpUri.replace('neo4j+s://', 'https://')
    else if (httpUri.startsWith('neo4j://')) httpUri = httpUri.replace('neo4j://', 'http://')

    const response = await fetch(`${httpUri}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${NEO4J_USERNAME}:${NEO4J_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statements: [{ statement: cypher }] }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.results?.[0]?.data || []
  } catch { return [] }
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
    const detailRes = await fetch(
      `${BACKEND_URL}/api/identities/detail/${encodeURIComponent(name)}`,
      { cache: "no-store", signal: AbortSignal.timeout(20000) }
    )
    let detail: any = {}
    if (detailRes.ok) detail = await detailRes.json()

    // 2. Get connected data stores from Neo4j
    const connectedStores = await runNeo4jQuery(
      `MATCH (n {name: '${name.replace(/'/g, "\\'")}'})-[r]-(m) WHERE m.type IN ['S3', 'RDS', 'DynamoDB', 'Lambda', 'LambdaFunction', 'KMS', 'Secret', 'SecretsManager'] RETURN m.name AS name, m.type AS type, labels(m) AS labels`
    )

    // 3. Extract permissions and classify by data service
    const allPermissions = detail.permission_analysis?.permissions_analysis || []
    const usedPerms = detail.permission_analysis?.used_permissions || []
    const unusedPerms = detail.permission_analysis?.unused_permissions || []

    // Group permissions by service
    const servicePermissions: Record<string, { allowed: string[]; used: string[]; unused: string[] }> = {}

    for (const perm of allPermissions) {
      const permName = typeof perm === 'string' ? perm : perm.permission || perm.action || ''
      const mapping = PERMISSION_OPERATION_MAP[permName]
      if (!mapping) continue
      if (!DATA_SERVICES.has(mapping.service)) continue

      if (!servicePermissions[mapping.service]) {
        servicePermissions[mapping.service] = { allowed: [], used: [], unused: [] }
      }
      servicePermissions[mapping.service].allowed.push(mapping.operation)

      const isUsed = usedPerms.includes(permName) || (typeof perm !== 'string' && perm.status === 'USED')
      if (isUsed) {
        servicePermissions[mapping.service].used.push(mapping.operation)
      } else {
        servicePermissions[mapping.service].unused.push(mapping.operation)
      }
    }

    // Also check for wildcard permissions
    const hasWildcardS3 = allPermissions.some((p: any) => {
      const name = typeof p === 'string' ? p : p.permission || ''
      return name === 's3:*'
    })
    const hasWildcardRDS = allPermissions.some((p: any) => {
      const name = typeof p === 'string' ? p : p.permission || ''
      return name === 'rds:*' || name === 'rds-data:*'
    })
    const hasWildcardDDB = allPermissions.some((p: any) => {
      const name = typeof p === 'string' ? p : p.permission || ''
      return name === 'dynamodb:*'
    })

    if (hasWildcardS3 && !servicePermissions['S3']) {
      servicePermissions['S3'] = { allowed: ['READ', 'WRITE', 'DELETE', 'LIST'], used: [], unused: ['READ', 'WRITE', 'DELETE', 'LIST'] }
    }
    if (hasWildcardRDS && !servicePermissions['RDS']) {
      servicePermissions['RDS'] = { allowed: ['EXECUTE', 'READ_METADATA', 'MODIFY', 'DELETE', 'SNAPSHOT'], used: [], unused: ['EXECUTE', 'READ_METADATA', 'MODIFY', 'DELETE', 'SNAPSHOT'] }
    }
    if (hasWildcardDDB && !servicePermissions['DynamoDB']) {
      servicePermissions['DynamoDB'] = { allowed: ['READ', 'WRITE', 'DELETE'], used: [], unused: ['READ', 'WRITE', 'DELETE'] }
    }

    // 3b. Query table-level DATA_ACCESS relationships from Neo4j (from RDS query log collector)
    const tableAccessData = await runNeo4jQuery(
      `MATCH (u)-[r:DATA_ACCESS]->(t:DatabaseTable) WHERE u.name = '${name.replace(/'/g, "\\'")}' OR u.name CONTAINS '${name.replace(/'/g, "\\'").split('/').pop()}' RETURN t.name AS table_name, t.database AS database, t.rds_instance AS rds_instance, t.schema AS schema, r.operations AS operations, r.access_count AS count, r.last_seen AS last_seen, r.daily_avg AS daily_avg`
    )

    // Also try matching by database user linked to this identity
    const dbUserTableAccess = await runNeo4jQuery(
      `MATCH (role:Resource {name: '${name.replace(/'/g, "\\'")}'})-[:ASSUMES|USES|CONNECTS_TO*1..3]-(u:DatabaseUser)-[r:DATA_ACCESS]->(t:DatabaseTable) RETURN t.name AS table_name, t.database AS database, t.rds_instance AS rds_instance, t.schema AS schema, r.operations AS operations, r.access_count AS count, r.last_seen AS last_seen, r.daily_avg AS daily_avg`
    )

    // Merge table access results
    const allTableAccess = [...tableAccessData, ...dbUserTableAccess]
    interface TableAccess {
      tableName: string
      database: string
      rdsInstance: string
      schema: string
      operations: string[]
      accessCount: number
      lastSeen: string | null
      dailyAvg: number
    }
    const tableAccessMap = new Map<string, TableAccess>()
    for (const row of allTableAccess) {
      const key = `${row.row?.[2] || ''}:${row.row?.[1] || ''}:${row.row?.[0] || ''}`
      if (!tableAccessMap.has(key)) {
        tableAccessMap.set(key, {
          tableName: row.row?.[0] || 'Unknown',
          database: row.row?.[1] || 'Unknown',
          rdsInstance: row.row?.[2] || 'Unknown',
          schema: row.row?.[3] || 'public',
          operations: row.row?.[4] || [],
          accessCount: row.row?.[5] || 0,
          lastSeen: row.row?.[6] || null,
          dailyAvg: row.row?.[7] || 0,
        })
      }
    }
    const tableAccess = Array.from(tableAccessMap.values())

    // 4. Build data store access profiles
    const dataStores: DataStoreAccess[] = []

    // From Neo4j connected stores
    for (const row of connectedStores) {
      const storeName = row.row?.[0] || 'Unknown'
      const storeType = row.row?.[1] || 'Unknown'
      const serviceKey = storeType === 'LambdaFunction' ? 'Lambda' : storeType === 'Secret' ? 'SecretsManager' : storeType
      const svcPerms = servicePermissions[serviceKey] || { allowed: [], used: [], unused: [] }

      const store: DataStoreAccess = {
        name: storeName,
        type: storeType,
        allowedOperations: [...new Set(svcPerms.allowed)],
        observedOperations: [...new Set(svcPerms.used)],
        unusedOperations: [...new Set(svcPerms.unused)],
        accessLevel: classifyAccessLevel([...new Set(svcPerms.allowed)]),
        recommendation: '',
      }
      store.recommendation = generateRecommendation(store)
      dataStores.push(store)
    }

    // If no connected stores from Neo4j, create virtual entries from permissions
    if (dataStores.length === 0) {
      for (const [service, perms] of Object.entries(servicePermissions)) {
        const store: DataStoreAccess = {
          name: `${service} resources (from permissions)`,
          type: service,
          allowedOperations: [...new Set(perms.allowed)],
          observedOperations: [...new Set(perms.used)],
          unusedOperations: [...new Set(perms.unused)],
          accessLevel: classifyAccessLevel([...new Set(perms.allowed)]),
          recommendation: '',
        }
        store.recommendation = generateRecommendation(store)
        dataStores.push(store)
      }
    }

    // 5. Summary
    const summary = {
      totalDataStores: dataStores.length,
      servicesAccessed: [...new Set(dataStores.map(d => d.type))],
      totalAllowedOps: dataStores.reduce((sum, d) => sum + d.allowedOperations.length, 0),
      totalObservedOps: dataStores.reduce((sum, d) => sum + d.observedOperations.length, 0),
      totalUnusedOps: dataStores.reduce((sum, d) => sum + d.unusedOperations.length, 0),
      hasDestructiveAccess: dataStores.some(d => d.allowedOperations.includes('DELETE') || d.allowedOperations.includes('MODIFY')),
      overallAccessLevel: classifyAccessLevel(dataStores.flatMap(d => d.allowedOperations)),
    }

    return NextResponse.json({ dataStores, tableAccess, summary, servicePermissions })

  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to build data access profile", detail: error.message, dataStores: [], summary: {} },
      { status: 500 }
    )
  }
}
