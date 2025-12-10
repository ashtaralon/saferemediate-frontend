/**
 * API Service for SafeRemediate Backend
 * Handles all API calls to the backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://saferemediate-backend.onrender.com'

export interface Finding {
  id: string
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
  description: string
  title: string
  resource: string
  resourceType: string
  status: 'open' | 'resolved' | 'dismissed'
  category: string
  discoveredAt: string
  remediation: string
}

export interface FindingsFilters {
  status?: 'open' | 'resolved' | 'dismissed'
  severity?: 'critical' | 'high' | 'medium' | 'low'
  confidenceMin?: number
  limit?: number
  systemName?: string  // ✅ Add systemName filter
}

export interface SimulateFixResponse {
  success: boolean
  message: string
  impact?: {
    affectedResources: number
    riskLevel: string
  }
}

class ApiService {
  private baseUrl: string

  constructor() {
    this.baseUrl = API_BASE_URL
  }

  /**
   * Get all findings with optional filters
   */
  async getFindings(filters: FindingsFilters = {}): Promise<Finding[]> {
    const params = new URLSearchParams()
    
    if (filters.status) params.append('status', filters.status)
    if (filters.severity) params.append('severity', filters.severity)
    if (filters.confidenceMin !== undefined) {
      params.append('confidence_min', filters.confidenceMin.toString())
    }
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.systemName) params.append('systemName', filters.systemName)  // ✅ Add systemName

    // ✅ FIX: Use proxy route instead of direct backend (has timeout handling + fallback)
    const url = `/api/proxy/findings${params.toString() ? `?${params.toString()}` : ''}`
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout for long-running requests
        // Increased to 30s to match proxy route timeout (25s) + buffer
        signal: AbortSignal.timeout(30000), // 30s timeout (proxy has 25s, so 30s gives buffer)
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch findings: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      // ✅ FIX: Better parsing - proxy returns {success, findings, source, count}
      // Backend returns {success, findings, count} or array
      let findingsArray: any[] = []
      
      if (Array.isArray(data)) {
        findingsArray = data
      } else if (data.findings && Array.isArray(data.findings)) {
        findingsArray = data.findings
      } else if (data.recommendations && Array.isArray(data.recommendations)) {
        // Backend might return recommendations key
        findingsArray = data.recommendations
      }
      
      console.log('[ApiService] Findings response:', {
        source: data.source || 'direct',
        count: data.count || findingsArray.length,
        findingsReceived: findingsArray.length
      })
      
      // Normalize findings to ensure all required fields exist
      const normalized = findingsArray.map((f: any) => ({
        id: f.id || f.finding_id || `finding-${Date.now()}-${Math.random()}`,
        type: f.type || 'unknown',
        severity: (f.severity || 'medium').toLowerCase() as 'critical' | 'high' | 'medium' | 'low',
        confidence: f.confidence || 0,
        description: f.description || f.title || 'No description available',
        title: f.title || f.type || 'Security issue',
        resource: f.resource || f.resourceId || 'Unknown resource',
        resourceType: f.resourceType || f.resource_type || 'Unknown',
        status: (f.status || 'open').toLowerCase() as 'open' | 'resolved' | 'dismissed',
        category: f.category || 'Security',
        discoveredAt: f.discoveredAt || f.discovered_at || f.createdAt || new Date().toISOString(),
        remediation: f.remediation || f.recommendation || 'No remediation available',
        systemName: f.systemName || f.system_name || null, // Add systemName for filtering
      }))
      
      console.log('[ApiService] Raw findings:', data)
      console.log('[ApiService] Normalized findings:', normalized)
      
      return normalized
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('Request timed out. The backend is scanning your AWS account, this may take 30-40 seconds.')
      }
      throw error
    }
  }

  /**
   * Get a single finding by ID
   */
  async getFindingById(findingId: string): Promise<Finding | null> {
    const url = `${this.baseUrl}/api/findings/${encodeURIComponent(findingId)}`
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Failed to fetch finding: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[ApiService] Error fetching finding:', error)
      throw error
    }
  }

  /**
   * Simulate fixing a finding
   */
  async simulateFix(findingId: string): Promise<SimulateFixResponse> {
    const url = `${this.baseUrl}/api/simulate`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          finding_id: findingId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || errorData.message || `Failed to simulate fix: ${response.status}`)
      }

      const data = await response.json()
      
      // Transform response to match SimulateFixResponse interface
      return {
        success: true,
        message: data.recommendation || 'Simulation completed successfully',
        impact: {
          affectedResources: data.impact?.affectedResources?.length || 0,
          riskLevel: data.impact?.blastRadius || 'UNKNOWN',
        },
        ...data, // Include all other fields
      }
    } catch (error) {
      console.error('[ApiService] Error simulating fix:', error)
      throw error
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Export singleton instance
export const apiService = new ApiService()()

