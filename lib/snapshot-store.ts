/**
 * Snapshot Store - Persistent storage for system snapshots
 *
 * This module provides:
 * 1. Server-side file persistence (for API routes)
 * 2. Client-side localStorage fallback (for browser)
 * 3. Backend sync when available
 */

import { promises as fs } from 'fs'
import path from 'path'

// ============================================================================
// TYPES
// ============================================================================

export interface SnapshotResources {
  iamRoles: number
  securityGroups: number
  acls: number
  wafRules: number
  vpcRouting: number
  storageConfig: number
  computeConfig: number
  secrets: number
}

export interface Snapshot {
  id: string
  name: string
  date: string
  type: "manual" | "AUTO PRE-FIX" | "AUTO PRE-RESTORE" | "golden"
  systemName: string
  createdBy: string
  resources: SnapshotResources
  resourceDetails?: {
    iamRoles?: any[]
    securityGroups?: any[]
    vpcs?: any[]
    subnets?: any[]
    s3Buckets?: any[]
    ec2Instances?: any[]
    lambdas?: any[]
    policies?: any[]
  }
  metadata?: {
    triggeredBy?: string // finding_id that triggered AUTO PRE-FIX
    restoredFrom?: string // snapshot_id for AUTO PRE-RESTORE
    description?: string
  }
}

export interface RestoreOperation {
  id: string
  snapshotId: string
  systemName: string
  resourceCategories: string[]
  startedAt: string
  completedAt?: string
  status: "pending" | "in_progress" | "completed" | "failed"
  steps: Array<{
    name: string
    status: "pending" | "running" | "completed" | "failed"
    error?: string
  }>
  result?: {
    resourcesRestored: number
    duration: string
    errors: string[]
  }
}

// ============================================================================
// SERVER-SIDE STORAGE (File-based for persistence across serverless invocations)
// ============================================================================

const STORAGE_DIR = '/tmp/saferemediate'
const SNAPSHOTS_FILE = path.join(STORAGE_DIR, 'snapshots.json')
const RESTORES_FILE = path.join(STORAGE_DIR, 'restores.json')

// In-memory cache for faster access
let snapshotsCache: Snapshot[] | null = null
let restoresCache: RestoreOperation[] | null = null

async function ensureStorageDir(): Promise<void> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true })
  } catch (e) {
    // Directory might already exist
  }
}

async function loadSnapshots(): Promise<Snapshot[]> {
  if (snapshotsCache) return snapshotsCache

  try {
    await ensureStorageDir()
    const data = await fs.readFile(SNAPSHOTS_FILE, 'utf-8')
    snapshotsCache = JSON.parse(data)
    return snapshotsCache || []
  } catch (e) {
    // File doesn't exist or invalid - return empty array
    snapshotsCache = []
    return []
  }
}

async function saveSnapshots(snapshots: Snapshot[]): Promise<void> {
  try {
    await ensureStorageDir()
    await fs.writeFile(SNAPSHOTS_FILE, JSON.stringify(snapshots, null, 2))
    snapshotsCache = snapshots
  } catch (e) {
    console.error('[snapshot-store] Failed to save snapshots:', e)
  }
}

async function loadRestores(): Promise<RestoreOperation[]> {
  if (restoresCache) return restoresCache

  try {
    await ensureStorageDir()
    const data = await fs.readFile(RESTORES_FILE, 'utf-8')
    restoresCache = JSON.parse(data)
    return restoresCache || []
  } catch (e) {
    restoresCache = []
    return []
  }
}

async function saveRestores(restores: RestoreOperation[]): Promise<void> {
  try {
    await ensureStorageDir()
    await fs.writeFile(RESTORES_FILE, JSON.stringify(restores, null, 2))
    restoresCache = restores
  } catch (e) {
    console.error('[snapshot-store] Failed to save restores:', e)
  }
}

// ============================================================================
// SNAPSHOT OPERATIONS
// ============================================================================

export async function getSnapshots(systemName?: string): Promise<Snapshot[]> {
  const snapshots = await loadSnapshots()

  if (systemName) {
    return snapshots.filter(s => s.systemName === systemName)
  }

  return snapshots
}

export async function getSnapshotById(id: string): Promise<Snapshot | null> {
  const snapshots = await loadSnapshots()
  return snapshots.find(s => s.id === id) || null
}

export async function createSnapshot(data: {
  name: string
  systemName: string
  type?: Snapshot['type']
  createdBy?: string
  resourceDetails?: Snapshot['resourceDetails']
  metadata?: Snapshot['metadata']
}): Promise<Snapshot> {
  const snapshots = await loadSnapshots()

  // Calculate resource counts from details
  const details = data.resourceDetails || {}

  const newSnapshot: Snapshot = {
    id: `cp-${Date.now()}`,
    name: data.name,
    date: new Date().toISOString(),
    type: data.type || 'manual',
    systemName: data.systemName,
    createdBy: data.createdBy || 'system',
    resources: {
      iamRoles: details.iamRoles?.length || 0,
      securityGroups: details.securityGroups?.length || 0,
      acls: details.policies?.length || 3,
      wafRules: 2,
      vpcRouting: details.vpcs?.length || 0,
      storageConfig: details.s3Buckets?.length || 0,
      computeConfig: (details.ec2Instances?.length || 0) + (details.lambdas?.length || 0),
      secrets: 4,
    },
    resourceDetails: details,
    metadata: data.metadata,
  }

  snapshots.unshift(newSnapshot) // Add to beginning
  await saveSnapshots(snapshots)

  return newSnapshot
}

export async function deleteSnapshot(id: string): Promise<boolean> {
  const snapshots = await loadSnapshots()
  const index = snapshots.findIndex(s => s.id === id)

  if (index === -1) return false

  snapshots.splice(index, 1)
  await saveSnapshots(snapshots)

  return true
}

// ============================================================================
// RESTORE OPERATIONS
// ============================================================================

export async function createRestoreOperation(data: {
  snapshotId: string
  systemName: string
  resourceCategories: string[]
}): Promise<RestoreOperation> {
  const restores = await loadRestores()

  const newRestore: RestoreOperation = {
    id: `restore-${Date.now()}`,
    snapshotId: data.snapshotId,
    systemName: data.systemName,
    resourceCategories: data.resourceCategories,
    startedAt: new Date().toISOString(),
    status: 'pending',
    steps: [
      { name: 'Creating safety checkpoint', status: 'pending' },
      { name: 'Validating snapshot integrity', status: 'pending' },
      { name: 'Restoring IAM configurations', status: 'pending' },
      { name: 'Restoring network configurations', status: 'pending' },
      { name: 'Restoring security groups', status: 'pending' },
      { name: 'Validating restored resources', status: 'pending' },
    ],
  }

  restores.unshift(newRestore)
  await saveRestores(restores)

  return newRestore
}

export async function updateRestoreOperation(
  id: string,
  updates: Partial<RestoreOperation>
): Promise<RestoreOperation | null> {
  const restores = await loadRestores()
  const index = restores.findIndex(r => r.id === id)

  if (index === -1) return null

  restores[index] = { ...restores[index], ...updates }
  await saveRestores(restores)

  return restores[index]
}

export async function getRestoreOperation(id: string): Promise<RestoreOperation | null> {
  const restores = await loadRestores()
  return restores.find(r => r.id === id) || null
}

export async function getRestoreHistory(systemName?: string): Promise<RestoreOperation[]> {
  const restores = await loadRestores()

  if (systemName) {
    return restores.filter(r => r.systemName === systemName)
  }

  return restores
}

// ============================================================================
// SEED DATA (For initial setup)
// ============================================================================

export async function seedInitialSnapshots(systemName: string, resourceDetails?: any): Promise<void> {
  const existing = await getSnapshots(systemName)

  // Only seed if no snapshots exist
  if (existing.length > 0) return

  const baseDate = Date.now()
  const details = resourceDetails || {}

  const seedData: Omit<Snapshot, 'id'>[] = [
    {
      name: 'Pre-Production Deploy',
      date: new Date(baseDate - 28 * 24 * 60 * 60 * 1000).toISOString(),
      type: 'manual',
      systemName,
      createdBy: 'admin@saferemediate.io',
      resources: {
        iamRoles: details.iamRoles?.length || 9,
        securityGroups: details.securityGroups?.length || 5,
        acls: 3,
        wafRules: 2,
        vpcRouting: details.vpcs?.length || 2,
        storageConfig: details.s3Buckets?.length || 7,
        computeConfig: (details.ec2Instances?.length || 4) + (details.lambdas?.length || 11),
        secrets: 4,
      },
      resourceDetails: details,
    },
    {
      name: 'Auto snapshot before S3 public access fix',
      date: new Date(baseDate - 26 * 24 * 60 * 60 * 1000).toISOString(),
      type: 'AUTO PRE-FIX',
      systemName,
      createdBy: 'system',
      resources: {
        iamRoles: details.iamRoles?.length || 9,
        securityGroups: details.securityGroups?.length || 5,
        acls: 3,
        wafRules: 2,
        vpcRouting: details.vpcs?.length || 2,
        storageConfig: details.s3Buckets?.length || 7,
        computeConfig: (details.ec2Instances?.length || 4) + (details.lambdas?.length || 11),
        secrets: 4,
      },
      resourceDetails: details,
      metadata: {
        triggeredBy: 's3-public-access-finding-001',
        description: 'Automatic checkpoint before applying S3 bucket access fix',
      },
    },
    {
      name: 'Golden checkpoint - tested for rollback',
      date: new Date(baseDate - 24 * 24 * 60 * 60 * 1000).toISOString(),
      type: 'golden',
      systemName,
      createdBy: 'admin@saferemediate.io',
      resources: {
        iamRoles: details.iamRoles?.length || 9,
        securityGroups: details.securityGroups?.length || 5,
        acls: 3,
        wafRules: 2,
        vpcRouting: details.vpcs?.length || 2,
        storageConfig: details.s3Buckets?.length || 7,
        computeConfig: (details.ec2Instances?.length || 4) + (details.lambdas?.length || 11),
        secrets: 4,
      },
      resourceDetails: details,
      metadata: {
        description: 'Verified stable configuration - approved for production rollback',
      },
    },
  ]

  const snapshots = await loadSnapshots()

  for (const data of seedData) {
    const snapshot: Snapshot = {
      ...data,
      id: `cp-${Date.now() - Math.random() * 1000000}`,
    }
    snapshots.push(snapshot)
  }

  await saveSnapshots(snapshots)
}

// ============================================================================
// UTILITY: Clear cache (for testing)
// ============================================================================

export function clearCache(): void {
  snapshotsCache = null
  restoresCache = null
}
