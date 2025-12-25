/**
 * Least Privilege Store (Zustand)
 * 
 * Global state management for the Least Privilege tab.
 * Handles role selection, simulation, and enforcement.
 */

import { create } from 'zustand'

// ============================================================================
// TYPES
// ============================================================================

export interface Role {
  arn: string
  name: string
  accountId: string
  systemName: string
  lpScore: number
  totalPermissions: number
  usedPermissions: number
  unusedPermissions: number
  lastActivity?: string
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
}

export interface SimulationResult {
  status: 'SAFE' | 'CAUTION' | 'RISKY' | 'BLOCKED'
  reachabilityPreserved: number
  criticalPathsAffected: string[]
  permissionsTested: number
  permissionsSafe: number
  permissionsRisky: number
  servicesTested: string[]
  servicesImpacted: string[]
  warnings: string[]
  errors: string[]
  blockingIssues: string[]
  simulationConfidence: number
  safeToApply: boolean
  requiresCanary: boolean
  requiresApproval: boolean
}

export interface EnforcementResult {
  id: string
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'ROLLED_BACK'
  changesApplied: {
    permissionsRemoved: string[]
    resourcesNarrowed: string[]
    conditionsAdded: string[]
  }
  snapshotId?: string
  executedAt: string
  executionDuration: number
  rollbackAvailable: boolean
  errors: string[]
  warnings: string[]
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface LeastPrivilegeStore {
  // State
  selectedRoleArn: string | null
  roles: Role[]
  currentSimulation: SimulationResult | null
  currentEnforcement: EnforcementResult | null
  isSimulating: boolean
  isEnforcing: boolean
  isLoadingRoles: boolean
  error: string | null
  
  // Actions
  selectRole: (roleArn: string) => void
  clearSelection: () => void
  setRoles: (roles: Role[]) => void
  runSimulation: (roleArn: string, permissions: string[]) => Promise<SimulationResult>
  enforce: (roleArn: string, permissions: string[]) => Promise<EnforcementResult>
  clearSimulation: () => void
  clearEnforcement: () => void
  setError: (error: string | null) => void
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

const api = {
  async simulateRemoval(roleArn: string, permissions: string[]): Promise<SimulationResult> {
    const response = await fetch('/api/proxy/least-privilege/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityArn: roleArn,
        affectedPermissions: permissions,
        changeType: 'REMOVE_PERMISSIONS',
        validateCriticalPaths: true,
        validateDependencies: true,
      })
    })
    
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Simulation failed (${response.status}): ${errorBody || response.statusText}`)
    }
    
    return response.json()
  },
  
  async enforceRemediation(roleArn: string, permissions: string[]): Promise<EnforcementResult> {
    const response = await fetch('/api/proxy/least-privilege/enforce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityArn: roleArn,
        changeType: 'REMOVE_PERMISSIONS',
        affectedPermissions: permissions,
        requireSnapshot: true,
        requireSimulation: true,
        executionMode: 'AUTO',
      })
    })
    
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Enforcement failed (${response.status}): ${errorBody || response.statusText}`)
    }
    
    return response.json()
  },
  
  async getRoles(systemName: string): Promise<Role[]> {
    const response = await fetch(
      `/api/proxy/least-privilege/identities?systemName=${encodeURIComponent(systemName)}`
    )
    
    if (!response.ok) {
      throw new Error(`Failed to fetch roles: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.identities || []
  }
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

export const useLeastPrivilegeStore = create<LeastPrivilegeStore>((set, get) => ({
  // Initial State
  selectedRoleArn: null,
  roles: [],
  currentSimulation: null,
  currentEnforcement: null,
  isSimulating: false,
  isEnforcing: false,
  isLoadingRoles: false,
  error: null,
  
  // Actions
  selectRole: (roleArn: string) => {
    set({ 
      selectedRoleArn: roleArn,
      currentSimulation: null, // Clear previous simulation
      currentEnforcement: null, // Clear previous enforcement
      error: null
    })
  },
  
  clearSelection: () => {
    set({ 
      selectedRoleArn: null,
      currentSimulation: null,
      currentEnforcement: null,
      error: null
    })
  },
  
  setRoles: (roles: Role[]) => {
    set({ roles, error: null })
  },
  
  runSimulation: async (roleArn: string, permissions: string[]) => {
    set({ isSimulating: true, error: null })
    
    try {
      const result = await api.simulateRemoval(roleArn, permissions)
      set({ 
        currentSimulation: result,
        isSimulating: false
      })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Simulation failed'
      set({ 
        error: errorMessage,
        isSimulating: false,
        currentSimulation: null
      })
      throw error
    }
  },
  
  enforce: async (roleArn: string, permissions: string[]) => {
    set({ isEnforcing: true, error: null })
    
    try {
      const result = await api.enforceRemediation(roleArn, permissions)
      set({ 
        currentEnforcement: result,
        isEnforcing: false
      })
      
      // Refresh roles after successful enforcement
      const state = get()
      if (state.roles.length > 0) {
        const systemName = state.roles[0]?.systemName
        if (systemName) {
          const updatedRoles = await api.getRoles(systemName)
          set({ roles: updatedRoles })
        }
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Enforcement failed'
      set({ 
        error: errorMessage,
        isEnforcing: false,
        currentEnforcement: null
      })
      throw error
    }
  },
  
  clearSimulation: () => {
    set({ currentSimulation: null })
  },
  
  clearEnforcement: () => {
    set({ currentEnforcement: null })
  },
  
  setError: (error: string | null) => {
    set({ error })
  }
}))

// ============================================================================
// SELECTORS (for optimized re-renders)
// ============================================================================

export const selectSelectedRole = (state: LeastPrivilegeStore) => {
  const { selectedRoleArn, roles } = state
  if (!selectedRoleArn) return null
  return roles.find(role => role.arn === selectedRoleArn)
}

export const selectRolesByRiskLevel = (state: LeastPrivilegeStore, riskLevel: string) => {
  return state.roles.filter(role => role.riskLevel === riskLevel)
}

export const selectRolesByLPScore = (state: LeastPrivilegeStore, minScore: number, maxScore: number) => {
  return state.roles.filter(role => role.lpScore >= minScore && role.lpScore <= maxScore)
}

export const selectIsLoading = (state: LeastPrivilegeStore) => {
  return state.isSimulating || state.isEnforcing || state.isLoadingRoles
}
