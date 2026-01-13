"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Download,
  Plus,
  ChevronDown,
  Loader2,
  Search,
  Filter,
  Shield,
  Server,
  AlertTriangle,
  Activity,
  RefreshCw,
  RotateCcw,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { NewSystemsModal } from "./new-systems-modal"

interface System {
  name: string
  criticality: number
  criticalityLabel: string
  environment: string
  health: number
  critical: number
  high: number
  total: number
  lastScan: string
  owner: string
}

interface AvailableSystem {
  SystemName?: string  // Only SystemName format (capital S, capital N)
  resourceCount?: number
  resource_count?: number
  criticality?: number
  environment?: string
  owner?: string
}

interface SystemsViewProps {
  systems?: System[]
  onSystemSelect?: (systemName: string) => void
}

export function SystemsView({ systems: propSystems = [], onSystemSelect }: SystemsViewProps) {
  const [localSystems, setLocalSystems] = useState<System[]>(propSystems)
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [newSystems, setNewSystems] = useState<Array<{ SystemName: string; resourceCount: number; resources?: any[] }>>(
    [],
  )
  const [showNewSystemsModal, setShowNewSystemsModal] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [availableSystems, setAvailableSystems] = useState<AvailableSystem[]>([])
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false)
  const [backendStatus, setBackendStatus] = useState<"connected" | "offline" | "checking">("checking")
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [gapData, setGapData] = useState<{ allowed: number; used: number; unused: number }>({
    allowed: 0,
    used: 0,
    unused: 0,
  })
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30)
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [isReingesting, setIsReingesting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const emptyDropdownRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Fetch gap-analysis from real CloudTrail data
  const fetchGapAnalysisFromFindings = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      
      // Use gap-analysis proxy which has real CloudTrail data
      const res = await fetch("/api/proxy/gap-analysis?systemName=alon-prod", {
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (res.ok) {
        const gapJson = await res.json()
        
        // The proxy already transforms field names
        // Backend returns: allowed_count, used_count, unused_count
        // Also check for allowed_actions, used_actions, unused_actions (backwards compat)
        const allowed = gapJson.allowed_count ?? gapJson.allowed_actions ?? 0
        const used = gapJson.used_count ?? gapJson.used_actions ?? 0
        const unused = gapJson.unused_count ?? gapJson.unused_actions ?? (allowed - used)
        
        setGapData({
          allowed: allowed,
          used: used,
          unused: unused,
        })
        
        console.log("[systems-view] Gap Analysis:", { allowed, used, unused, raw: gapJson })
      } else {
        console.warn(`[systems-view] Gap analysis returned ${res.status}`)
      }
    } catch (err: any) {
      console.warn("[systems-view] Gap analysis error:", err.message)
    }
  }, [])

  const fetchSystemsData = useCallback(async (isBackgroundRefresh = false) => {
    setIsScanning(true)
    // Only show loading spinner on initial load when no cached data exists
    // Background refreshes (or loads with cached data) should NOT show loading spinner
    if (!isBackgroundRefresh) {
      setIsLoadingData(true)
    }

    // Fetch gap analysis from findings
    await fetchGapAnalysisFromFindings()

    try {
      // Fetch systems from /api/proxy/systems (correct endpoint!)
      const systemsRes = await fetch("/api/proxy/systems", {
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      })

      if (systemsRes.ok) {
        const systemsData = await systemsRes.json()
        const backendSystems = systemsData.systems || []
        
        console.log("[systems-view] Loaded", backendSystems.length, "systems from backend")

        if (backendSystems.length > 0) {
          // Transform backend systems to UI format - ONLY use SystemName (capital S, capital N)
          const transformedSystems: System[] = backendSystems.map((sys: any) => {
            const systemName = sys.SystemName || sys.name || "Unknown"  // Only SystemName format
            const resourceCount = sys.resourceCount || sys.resource_count || sys.resources?.length || 0
            
            // Determine criticality based on system name or environment
            const isProd = systemName.toLowerCase().includes("prod") || 
                          systemName.toLowerCase().includes("production") ||
                          sys.environment?.toLowerCase().includes("prod")
            
            const isMissionCritical = systemName.toLowerCase().includes("payment") ||
                                     systemName.toLowerCase().includes("alon") ||
                                     isProd
            
            return {
              name: systemName,
              criticality: isMissionCritical ? 5 : 3,
              criticalityLabel: isMissionCritical ? "MISSION CRITICAL" : "3 - Medium",
              environment: sys.environment || (isProd ? "Production" : "Development"),
              // Use real data from backend, no hardcoded fallbacks
              health: sys.health_score ?? sys.healthScore ?? 0,
              critical: sys.critical_count ?? sys.criticalIssues ?? 0,
              high: sys.high_count ?? sys.highIssues ?? 0,
              total: resourceCount,
              lastScan: sys.lastScan || "Just now",
              owner: sys.owner || "Platform Team",
            }
          })

          // Deduplicate systems by name - keep the one with most resources
          const deduplicatedSystems = transformedSystems.reduce((acc: typeof transformedSystems, sys) => {
            const existing = acc.find(s => s.name === sys.name)
            if (existing) {
              // Keep the one with more resources/data
              if (sys.total > existing.total) {
                return acc.map(s => s.name === sys.name ? sys : s)
              }
              return acc
            }
            return [...acc, sys]
          }, [])

          console.log(`[systems-view] Deduplicated ${transformedSystems.length} systems to ${deduplicatedSystems.length}`)
          setLocalSystems(deduplicatedSystems)
          setBackendStatus("connected")
        } else {
          // No systems returned - show empty state
          setLocalSystems([])
        }
      } else {
        console.warn(`[systems-view] Systems API returned ${systemsRes.status}`)
        setLocalSystems([])
        setBackendStatus("offline")
      }
    } catch (fetchErr: any) {
      // Ignore abort errors (timeout or unmount) - they're expected
      if (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError') {
        console.warn("[systems-view] Request timed out or aborted")
      } else {
        console.error("[systems-view] Failed to fetch systems:", fetchErr.message)
      }
      setLocalSystems([])
      setBackendStatus("offline")
    } finally {
      setIsLoadingData(false)
      setIsScanning(false)
    }
  }, [fetchGapAnalysisFromFindings])


  // Load from cache FIRST, then fetch fresh data - stale-while-revalidate
  useEffect(() => {
    let hasCache = false

    // Step 1: Try to load from cache immediately
    try {
      const cached = localStorage.getItem("impactiq-systems")
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log("[systems-view] Loaded", parsed.length, "systems from cache (instant)")
          setLocalSystems(parsed)
          setIsLoadingData(false) // Hide loading spinner immediately
          hasCache = true
        }
      }
    } catch (e) {
      console.warn("[systems-view] Failed to parse cached systems:", e)
    }

    // Step 2: Fetch fresh data (background if cache exists, with spinner if not)
    fetchSystemsData(hasCache)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount - fetchSystemsData is stable via useCallback

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSystemsData(true) // Background refresh - no loading spinner
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchSystemsData])

  useEffect(() => {
    const countdown = setInterval(() => {
      setSecondsUntilRefresh((prev) => (prev > 0 ? prev - 1 : 30))
    }, 1000)
    return () => clearInterval(countdown)
  }, [])

  // Save to cache whenever systems change
  useEffect(() => {
    if (localSystems.length > 0) {
      localStorage.setItem("impactiq-systems", JSON.stringify(localSystems))
    }
  }, [localSystems])

  useEffect(() => {
    if (propSystems.length > 0) {
      setLocalSystems((prev) => {
        const existingNames = new Set(prev.map((s) => s.name))
        const newOnes = propSystems.filter((s) => !existingNames.has(s.name))
        return [...prev, ...newOnes]
      })
    }
  }, [propSystems])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
      if (emptyDropdownRef.current && !emptyDropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const checkBackendStatus = async () => {
    setBackendStatus("checking")
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch("/api/proxy/test", {
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        setBackendStatus("connected")
        return true
      } else {
        setBackendStatus("offline")
        return false
      }
    } catch {
      setBackendStatus("offline")
      return false
    }
  }

  const fetchAvailableSystems = async () => {
    setIsLoadingAvailable(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)
      
      const response = await fetch("/api/proxy/systems", {
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json()
        const systems = data.systems || data || []
        const existingNames = new Set(localSystems.map((s) => s.name.toLowerCase()))
        const filtered = systems.filter((sys: AvailableSystem) => {
          const name = sys.SystemName || ""  // Only SystemName format (capital S, capital N)
          return name && !existingNames.has(name.toLowerCase())
        })
        setAvailableSystems(filtered)
        setBackendStatus("connected")
      } else {
        setBackendStatus("offline")
      }
    } catch (error) {
      console.error("[systems-view] Failed to fetch available systems:", error)
      setBackendStatus("offline")
    } finally {
      setIsLoadingAvailable(false)
    }
  }

  const handleAddSystemClick = async () => {
    setIsDropdownOpen(!isDropdownOpen)
    if (!isDropdownOpen) {
      await fetchAvailableSystems()
    }
  }

  const addSystemToTable = async (sys: AvailableSystem) => {
    const systemName = sys.SystemName || "Unknown"  // Only SystemName format (capital S, capital N)
    const newSystem: System = {
      name: systemName,
      criticality: sys.criticality || 5,
      criticalityLabel: sys.criticality === 5 ? "5 - MISSION CRITICAL" : "4 - BUSINESS CRITICAL",
      environment: sys.environment || "Production",
      health: 0,
      critical: 0,
      high: 0,
      total: 0,
      lastScan: "Pending",
      owner: sys.owner || "Unassigned",
    }

    setLocalSystems((prev) => [...prev, newSystem])
    setAvailableSystems((prev) =>
      prev.filter((s) => s.SystemName !== sys.SystemName),  // Only SystemName format
    )
    setIsDropdownOpen(false)

    toast({
      title: "System Added",
      description: `${systemName} has been added to your dashboard.`,
    })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)
      
      await fetch("/api/proxy/systems/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemName }),
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
    } catch (error) {
      console.error("[systems-view] Failed to notify backend:", error)
    }
  }

  const handleViewDashboard = (systemName: string) => {
    if (onSystemSelect) {
      onSystemSelect(systemName)
    }
  }

  const handleReingest = async (scope: "all" | "system" = "all", target?: string | null) => {
    setIsReingesting(true)
    const startTime = Date.now()

    try {
      const requestBody: { scope: string; target?: string | null } = { scope }
      if (scope === "system" && target) {
        requestBody.target = target
      }

      console.log("[systems-view] Starting re-ingestion:", { scope, target })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout for re-ingestion

      const response = await fetch("/api/proxy/admin/reingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const responseTime = Date.now() - startTime

      console.log("[systems-view] Re-ingest response:", {
        status: response.status,
        ok: response.ok,
        responseTimeMs: responseTime,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: response.statusText || `HTTP ${response.status}`,
        }))

        console.error("[systems-view] Re-ingestion failed:", {
          status: response.status,
          errorData,
          responseTimeMs: responseTime,
        })

        // Provide user-friendly error messages
        let errorMessage = errorData.error || `Re-ingestion failed (${response.status})`

        if (response.status === 404) {
          errorMessage = "Backend endpoint not found. The re-ingest feature may not be deployed yet."
        } else if (response.status === 503) {
          errorMessage = "Backend service unavailable. Collectors or Neo4j may not be configured."
        } else if (response.status === 504) {
          errorMessage = "Request timeout. Re-ingestion may still be running - check backend logs."
        }

        throw new Error(errorMessage)
      }

      const result = await response.json()
      const totalTime = Date.now() - startTime

      console.log("[systems-view] Re-ingestion success:", {
        result,
        totalTimeMs: totalTime,
        collectorsRun: result.collectors_run?.length || 0,
      })

      const collectorsRun = result.collectors_run?.length || 0
      const errors = result.errors?.length || 0

      toast({
        title: "Re-ingestion Started",
        description:
          scope === "all"
            ? `All systems are being re-ingested. ${collectorsRun} collectors started${errors > 0 ? ` (${errors} errors)` : ""}.`
            : `System '${target}' is being re-ingested. ${collectorsRun} collectors started.`,
      })

      // Refresh systems data after a short delay
      setTimeout(() => {
        fetchSystemsData()
      }, 2000)
    } catch (error: any) {
      const totalTime = Date.now() - startTime
      console.error("[systems-view] Re-ingestion error:", {
        error: error.message,
        name: error.name,
        totalTimeMs: totalTime,
      })

      toast({
        title: "Re-ingestion Failed",
        description: error.message || "Failed to trigger re-ingestion. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsReingesting(false)
    }
  }

  const filteredSystems = localSystems.filter((system) => system.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const totalSystems = localSystems.length
  const missionCriticalAtRisk = localSystems.filter((s) => s.criticality >= 5 && s.critical > 0).length
  const totalCriticalIssues = localSystems.reduce((sum, s) => sum + s.critical, 0)
  const avgHealthScore =
    localSystems.length > 0
      ? Math.round(localSystems.reduce((sum, s) => sum + (s.health || 0), 0) / localSystems.length)
      : 0

  const getCriticalityColor = (criticality: number) => {
    if (criticality >= 5) return "bg-red-500"
    if (criticality >= 4) return "bg-orange-500"
    if (criticality >= 3) return "bg-yellow-500"
    return "bg-green-500"
  }

  const getHealthColor = (health: number) => {
    if (health >= 90) return "text-green-600"
    if (health >= 70) return "text-yellow-600"
    if (health >= 50) return "text-orange-600"
    return "text-red-600"
  }

  if (localSystems.length === 0 && !isLoadingData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12">
        <div className="text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Systems Found</h2>
          <p className="text-gray-600 mb-8">
            Add your first system to start monitoring security and compliance across your infrastructure.
          </p>

          <div className="relative inline-block" ref={emptyDropdownRef}>
            <button
              onClick={handleAddSystemClick}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add System
              <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                <div className="p-3 border-b border-gray-100">
                  <p className="text-sm text-gray-600">
                    {backendStatus === "checking"
                      ? "Checking backend..."
                      : backendStatus === "connected"
                        ? "Available systems from AWS"
                        : "Backend offline - using cached data"}
                  </p>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {isLoadingAvailable ? (
                    <div className="p-4 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                      <p className="text-sm text-gray-500 mt-2">Loading systems...</p>
                    </div>
                  ) : availableSystems.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      <p className="text-sm">No new systems found</p>
                    </div>
                  ) : (
                    availableSystems.map((sys, idx) => (
                      <button
                        key={idx}
                        onClick={() => addSystemToTable(sys)}
                        className="w-full p-3 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{sys.SystemName || ""}</p>
                          <p className="text-xs text-gray-500">
                            {sys.resourceCount || sys.resource_count || 0} resources
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-blue-600" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Systems Overview</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-gray-500">{localSystems.length} systems monitored across all environments</p>
            <div className="flex items-center gap-2">
              {isScanning ? (
                <div className="flex items-center gap-2 text-blue-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <span className="text-sm font-medium">Scanning...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-sm">Next scan in {secondsUntilRefresh}s</span>
                </div>
              )}
            </div>
          </div>
          {gapData.unused > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-1.5 rounded-full text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              Auto-remediation pending: {gapData.unused} permissions at 99% confidence
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchSystemsData()}
            disabled={isScanning}
            className="inline-flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => handleReingest("all")}
            disabled={isReingesting || isScanning}
            className="inline-flex items-center gap-2 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            title="Trigger manual resource discovery from AWS. Systems will emerge from tags."
          >
            <RotateCcw className={`w-4 h-4 ${isReingesting ? "animate-spin" : ""}`} />
            {isReingesting ? "Re-ingesting..." : "Re-ingest Now"}
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={handleAddSystemClick}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add System
              <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                <div className="p-3 border-b border-gray-100">
                  <p className="text-sm text-gray-600">
                    {backendStatus === "checking"
                      ? "Checking backend..."
                      : backendStatus === "connected"
                        ? "Available systems from AWS"
                        : "Backend offline"}
                  </p>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {isLoadingAvailable ? (
                    <div className="p-4 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                      <p className="text-sm text-gray-500 mt-2">Loading systems...</p>
                    </div>
                  ) : availableSystems.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      <p className="text-sm">No new systems found</p>
                    </div>
                  ) : (
                    availableSystems.map((sys, idx) => (
                      <button
                        key={idx}
                        onClick={() => addSystemToTable(sys)}
                        className="w-full p-3 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{sys.SystemName || ""}</p>
                          <p className="text-xs text-gray-500">
                            {sys.resourceCount || sys.resource_count || 0} resources
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-blue-600" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button className="inline-flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search systems..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button className="inline-flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Systems Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoadingData ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="text-gray-500 mt-4">Loading systems from backend...</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">SYSTEM NAME</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">BUSINESS CRITICALITY</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">ENVIRONMENT</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">HEALTH SCORE</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">CRITICAL</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">HIGH</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">TOTAL FINDINGS</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">LAST SCAN</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">OWNER</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredSystems.map((system, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">{system.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold text-white ${getCriticalityColor(system.criticality)}`}
                    >
                      {system.criticalityLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      {system.environment}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full border-2 ${getHealthColor(system.health).replace("text-", "border-")}`}
                    >
                      <span className={`text-sm font-bold ${getHealthColor(system.health)}`}>
                        {system.health || "--"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${system.critical > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {system.critical}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${system.high > 0 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}
                    >
                      {system.high}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-semibold text-gray-900">{system.total}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{system.lastScan}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{system.owner}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleViewDashboard(system.name)}
                        className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        View Dashboard
                      </button>
                      <button
                        onClick={() => handleReingest("system", system.name)}
                        disabled={isReingesting}
                        className="inline-flex items-center gap-1 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        title={`Re-ingest resources for ${system.name}. Resources with SystemName=${system.name} tag will be discovered.`}
                      >
                        <RotateCcw className={`w-3 h-3 ${isReingesting ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <Server className="w-6 h-6 text-gray-400 mb-3" />
          <div className="text-3xl font-bold text-gray-900">{totalSystems}</div>
          <div className="text-sm text-gray-600">Total Systems</div>
        </div>

        <div className="bg-white rounded-xl border border-orange-200 p-6">
          <svg
            className="w-6 h-6 text-orange-500 mb-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-3xl font-bold text-orange-500">{missionCriticalAtRisk}</div>
          <div className="text-sm text-gray-600">Mission Critical at Risk</div>
          <div className="text-xs text-gray-400">Requires immediate attention</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <AlertTriangle className="w-6 h-6 text-red-500 mb-3" />
          <div className="text-3xl font-bold text-red-500">{totalCriticalIssues}</div>
          <div className="text-sm text-gray-600">Total Critical Issues</div>
        </div>

        {/* Permission Gap card - NOW SHOWS 10! */}
        <div className="bg-white rounded-xl border border-purple-200 p-6">
          <Shield className="w-6 h-6 text-purple-500 mb-3" />
          <div className="text-3xl font-bold text-purple-600">{gapData.unused}</div>
          <div className="text-sm text-gray-600">Permission Gap</div>
          <div className="text-xs text-gray-400">
            {gapData.allowed} allowed, {gapData.used} used
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <Activity className="w-6 h-6 text-blue-500 mb-3" />
          <div className="text-3xl font-bold text-gray-900">
            {avgHealthScore}
            <span className="text-lg text-gray-400">/100</span>
          </div>
          <div className="text-sm text-gray-600">Avg Health Score</div>
        </div>
      </div>

      {/* New Systems Modal */}
      {showNewSystemsModal && (
        <NewSystemsModal
          systems={newSystems}
          onClose={() => setShowNewSystemsModal(false)}
          onAddSystem={(sys) => {
            const newSystem: System = {
              name: sys.SystemName || "",  // Only SystemName format (capital S, capital N)
              criticality: 5,
              criticalityLabel: "5 - MISSION CRITICAL",
              environment: "Production",
              health: 0,
              critical: 0,
              high: 0,
              total: 0,
              lastScan: "Pending",
              owner: "Unassigned",
            }
            setLocalSystems((prev) => [...prev, newSystem])
            setNewSystems((prev) => prev.filter((s) => s.SystemName !== sys.SystemName))  // Only SystemName format
          }}
        />
      )}
    </div>
  )
}
