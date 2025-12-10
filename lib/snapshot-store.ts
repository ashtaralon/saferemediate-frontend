/**
 * Snapshot Store - Persistent storage for system snapshots
 * 
 * This module provides:
 * 1. Client-side localStorage persistence (for browser)
 * 2. Backend sync when available
 * 3. In-memory cache for fast access
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SnapshotResources {
  iamRoles: number
  securityGroups: number
  acls: number
  wafRules: number
  vpcConfigs: number
  storageBuckets: number
  computeInstances: number
  secrets: number
}

export interface Snapshot {
  id: string
  systemName: string
  issue_id?: string
  created_at: string
  created_by: string
  reason: string
  type: "manual" | "AUTO PRE-FIX" | "AUTO PRE-RESTORE" | "golden"
  status: "simulated" | "applied" | "ACTIVE" | "APPLIED" | "ROLLED_BACK" | "FAILED"
  resources: SnapshotResources
  changes?: any
  impact_summary?: string
  metadata?: Record<string, any>
}

export interface RestoreOperation {
  id: string
  snapshotId: string
  systemName: string
  status: "pending" | "in_progress" | "completed" | "failed"
  startedAt: string
  completedAt?: string
  selectedCategories: string[]
  progress?: {
    step: number
    totalSteps: number
    currentStep: string
  }
  error?: string
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEY_SNAPSHOTS = "saferemediate_snapshots"
const STORAGE_KEY_RESTORE_OPS = "saferemediate_restore_operations"

// ============================================================================
// STORAGE HELPERS
// ============================================================================

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage
  } catch {
    return null
  }
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  const storage = getStorage()
  if (!storage) return defaultValue
  
  try {
    const item = storage.getItem(key)
    if (!item) return defaultValue
    return JSON.parse(item) as T
  } catch {
    return defaultValue
  }
}

function saveToStorage<T>(key: string, value: T): void {
  const storage = getStorage()
  if (!storage) return
  
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`[snapshot-store] Failed to save to storage:`, error)
  }
}

// ============================================================================
// SNAPSHOT OPERATIONS
// ============================================================================

export function getSnapshots(systemName?: string): Snapshot[] {
  const allSnapshots = loadFromStorage<Snapshot[]>(STORAGE_KEY_SNAPSHOTS, [])
  
  if (systemName) {
    return allSnapshots.filter(s => s.systemName === systemName)
  }
  
  return allSnapshots
}

export function getSnapshotById(snapshotId: string): Snapshot | null {
  const allSnapshots = getSnapshots()
  return allSnapshots.find(s => s.id === snapshotId) || null
}

export function createSnapshot(snapshot: Omit<Snapshot, "id" | "created_at">): Snapshot {
  const newSnapshot: Snapshot = {
    ...snapshot,
    id: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date().toISOString(),
  }
  
  const allSnapshots = getSnapshots()
  allSnapshots.unshift(newSnapshot) // Add to beginning
  saveToStorage(STORAGE_KEY_SNAPSHOTS, allSnapshots)
  
  return newSnapshot
}

export function updateSnapshot(snapshotId: string, updates: Partial<Snapshot>): Snapshot | null {
  const allSnapshots = getSnapshots()
  const index = allSnapshots.findIndex(s => s.id === snapshotId)
  
  if (index === -1) return null
  
  allSnapshots[index] = { ...allSnapshots[index], ...updates }
  saveToStorage(STORAGE_KEY_SNAPSHOTS, allSnapshots)
  
  return allSnapshots[index]
}

export function deleteSnapshot(snapshotId: string): boolean {
  const allSnapshots = getSnapshots()
  const filtered = allSnapshots.filter(s => s.id !== snapshotId)
  
  if (filtered.length === allSnapshots.length) return false
  
  saveToStorage(STORAGE_KEY_SNAPSHOTS, filtered)
  return true
}

// ============================================================================
// RESTORE OPERATIONS
// ============================================================================

export function getRestoreOperations(systemName?: string): RestoreOperation[] {
  const allOps = loadFromStorage<RestoreOperation[]>(STORAGE_KEY_RESTORE_OPS, [])
  
  if (systemName) {
    return allOps.filter(op => op.systemName === systemName)
  }
  
  return allOps
}

export function createRestoreOperation(
  snapshotId: string,
  systemName: string,
  selectedCategories: string[]
): RestoreOperation {
  const operation: RestoreOperation = {
    id: `restore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    snapshotId,
    systemName,
    status: "pending",
    startedAt: new Date().toISOString(),
    selectedCategories,
  }
  
  const allOps = getRestoreOperations()
  allOps.unshift(operation)
  saveToStorage(STORAGE_KEY_RESTORE_OPS, allOps)
  
  return operation
}

export function updateRestoreOperation(
  operationId: string,
  updates: Partial<RestoreOperation>
): RestoreOperation | null {
  const allOps = getRestoreOperations()
  const index = allOps.findIndex(op => op.id === operationId)
  
  if (index === -1) return null
  
  allOps[index] = { ...allOps[index], ...updates }
  saveToStorage(STORAGE_KEY_RESTORE_OPS, allOps)
  
  return allOps[index]
}

// ============================================================================
// SEED DATA (for new systems)
// ============================================================================

export function seedInitialSnapshots(systemName: string): void {
  const existing = getSnapshots(systemName)
  if (existing.length > 0) return // Already seeded
  
  // Create a golden snapshot
  createSnapshot({
    systemName,
    created_by: "system",
    reason: "Initial system state",
    type: "golden",
    status: "ACTIVE",
    resources: {
      iamRoles: 0,
      securityGroups: 0,
      acls: 0,
      wafRules: 0,
      vpcConfigs: 0,
      storageBuckets: 0,
      computeInstances: 0,
      secrets: 0,
    },
  })
}

