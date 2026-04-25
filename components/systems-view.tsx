"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { healthLabel } from "@/lib/utils"
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
  systemName?: string
}

export function SystemsView({ systems: propSystems = [], onSystemSelect, systemName }: SystemsViewProps) {
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
      const res = await fetch(`/api/proxy/gap-analysis?systemName=${systemName}`, {
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
  }, [systemName])

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
            
            // Use criticality and environment from backend (Neo4j source of truth)
            const rawCriticality = sys.criticality || "STANDARD"
            const criticalityMap: Record<string, { score: number; label: string }> = {
              "MISSION CRITICAL": { score: 5, label: "MISSION CRITICAL" },
              "CRITICAL": { score: 5, label: "MISSION CRITICAL" },
              "BUSINESS CRITICAL": { score: 4, label: "BUSINESS CRITICAL" },
              "HIGH": { score: 4, label: "BUSINESS CRITICAL" },
              "IMPORTANT": { score: 3, label: "IMPORTANT" },
              "MEDIUM": { score: 3, label: "IMPORTANT" },
              "STANDARD": { score: 2, label: "STANDARD" },
              "LOW": { score: 2, label: "STANDARD" },
            }
            const critInfo = criticalityMap[rawCriticality] || { score: 3, label: rawCriticality }

            return {
              name: systemName,
              criticality: critInfo.score,
              criticalityLabel: critInfo.label,
              environment: sys.environment || "Production",
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
      const cached = localStorage.getItem("cyntro-systems")
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
      localStorage.setItem("cyntro-systems", JSON.stringify(localSystems))
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
        jobId: result.job_id,
        alreadyRunning: result.already_running,
      })

      // This button now unifies with "Sync from AWS" — it kicks off the same
      // 15-step async pipeline (VPC flow logs, CloudTrail, Security Groups,
      // NACLs, S3 access logs, behavioral sync, etc.). No per-system scoping
      // today — sync-all is global.
      toast({
        title: result.already_running ? "Sync already in progress" : "Sync from AWS started",
        description: result.already_running
          ? `A sync job is already running (step ${result.current_step ?? "?"}/15). Watch the Overview card for completion.`
          : `Running the full 15-step data pipeline (VPC flow logs, CloudTrail, SGs, NACLs, S3 access logs, behavioral sync, visibility signals, auto-tagger). Takes several minutes — click Refresh on the Overview card when it's done.`,
      })

      // Refresh systems data after a short delay so any IAM-tag changes surface.
      // The full sync takes minutes — the Overview card's Blast Radius score
      // will update on its next refresh cycle after the job completes.
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

  // ── Panels below KPIs ──
  // Top at-risk: rank by (critical desc, high desc, health asc). Cap at 3.
  const topAtRiskSystems = [...localSystems]
    .sort((a, b) => {
      if (b.critical !== a.critical) return b.critical - a.critical
      if (b.high !== a.high) return b.high - a.high
      return (a.health || 0) - (b.health || 0)
    })
    .slice(0, 3)

  // Environment breakdown: normalize casing, count, keep order by count desc.
  const environmentBreakdown: Array<{ env: string; count: number; color: string }> = (() => {
    const counts = new Map<string, number>()
    for (const s of localSystems) {
      const normalized = (s.environment || "Unknown").trim().toLowerCase()
      const label = normalized.charAt(0).toUpperCase() + normalized.slice(1)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    // Consistent colors per environment
    const envColors: Record<string, string> = {
      Production: "#ef4444",
      Staging: "#f97316",
      Development: "#eab308",
      Dev: "#eab308",
      Test: "#3b82f6",
      Qa: "#3b82f6",
      Unknown: "#6b7280",
    }
    return Array.from(counts.entries())
      .map(([env, count]) => ({ env, count, color: envColors[env] ?? "#8b5cf6" }))
      .sort((a, b) => b.count - a.count)
  })()

  const getCriticalityColor = (criticality: number) => {
    if (criticality >= 5) return "bg-[#ef4444]"
    if (criticality >= 4) return "bg-[#f97316]"
    if (criticality >= 3) return "bg-[#eab308]"
    return "bg-[#22c55e]"
  }

  const getHealthColor = (health: number) => {
    if (health >= 90) return "text-[#22c55e]"
    if (health >= 70) return "text-yellow-600"
    if (health >= 50) return "text-orange-600"
    return "text-[#ef4444]"
  }

  if (localSystems.length === 0 && !isLoadingData) {
    return (
      <div
        className="rounded-lg border p-12"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
      >
        <div className="text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-[#8b5cf620] rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8" style={{ color: "#8b5cf6" }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>No Systems Found</h2>
          <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
            Add your first system to start monitoring security and compliance across your infrastructure.
          </p>

          <div className="relative inline-block" ref={emptyDropdownRef}>
            <button
              onClick={handleAddSystemClick}
              className="inline-flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
              style={{ background: "#8b5cf6" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add System
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isDropdownOpen && (
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 rounded-lg shadow-xl border z-50"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
              >
                <div className="p-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
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
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: "#8b5cf6" }} />
                      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Loading systems...</p>
                    </div>
                  ) : availableSystems.length === 0 ? (
                    <div className="p-4 text-center" style={{ color: "var(--text-muted)" }}>
                      <p className="text-xs">No new systems found</p>
                    </div>
                  ) : (
                    availableSystems.map((sys, idx) => (
                      <button
                        key={idx}
                        onClick={() => addSystemToTable(sys)}
                        className="w-full p-3 text-left hover:bg-white/5 flex items-center justify-between border-b last:border-0 transition-colors"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{sys.SystemName || ""}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {sys.resourceCount || sys.resource_count || 0} resources
                          </p>
                        </div>
                        <Plus className="w-3.5 h-3.5" style={{ color: "#8b5cf6" }} />
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
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Systems Overview</h2>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{localSystems.length} systems monitored across all environments</p>
            <div className="flex items-center gap-2">
              {isScanning ? (
                <div className="flex items-center gap-2" style={{ color: "#8b5cf6" }}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#8b5cf6" }}></span>
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#8b5cf6" }}></span>
                  </span>
                  <span className="text-xs font-medium">Scanning...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#22c55e" }}></span>
                  </span>
                  <span className="text-xs">Next scan in {secondsUntilRefresh}s</span>
                </div>
              )}
            </div>
          </div>
          {gapData.unused > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 bg-[#eab30810] border border-[#eab30840] text-[#eab308] px-3 py-1 rounded-full text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Auto-remediation pending: {gapData.unused} permissions at 99% confidence
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSystemsData()}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 hover:opacity-90"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => handleReingest("all")}
            disabled={isReingesting || isScanning}
            className="inline-flex items-center gap-1.5 border border-[#8b5cf640] bg-[#8b5cf610] hover:bg-[#8b5cf620] text-[#8b5cf6] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            title="Trigger manual resource discovery from AWS. Systems will emerge from tags."
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isReingesting ? "animate-spin" : ""}`} />
            {isReingesting ? "Re-ingesting..." : "Re-ingest Now"}
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={handleAddSystemClick}
              className="inline-flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
              style={{ background: "#8b5cf6" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add System
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isDropdownOpen && (
              <div
                className="absolute top-full right-0 mt-2 w-80 rounded-lg shadow-xl border z-50"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
              >
                <div className="p-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
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
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: "#8b5cf6" }} />
                      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Loading systems...</p>
                    </div>
                  ) : availableSystems.length === 0 ? (
                    <div className="p-4 text-center" style={{ color: "var(--text-muted)" }}>
                      <p className="text-xs">No new systems found</p>
                    </div>
                  ) : (
                    availableSystems.map((sys, idx) => (
                      <button
                        key={idx}
                        onClick={() => addSystemToTable(sys)}
                        className="w-full p-3 text-left hover:bg-white/5 flex items-center justify-between border-b last:border-0 transition-colors"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{sys.SystemName || ""}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {sys.resourceCount || sys.resource_count || 0} resources
                          </p>
                        </div>
                        <Plus className="w-3.5 h-3.5" style={{ color: "#8b5cf6" }} />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:opacity-90"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
          >
            <Download className="w-3.5 h-3.5" />
            Export Report
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search systems..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            />
          </div>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:opacity-90"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
          </button>
        </div>
      </div>

      {/* Systems Table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
      >
        {isLoadingData ? (
          <div className="p-12 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: "#8b5cf6" }} />
            <p className="text-sm mt-4" style={{ color: "var(--text-secondary)" }}>Loading systems from backend...</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>System Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Business Criticality</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Environment</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Health</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Critical</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>High</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Last Scan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Owner</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSystems.map((system, idx) => {
                // Criticality color for translucent chip
                const critColorMap: Record<string, string> = {
                  "bg-[#ef4444]": "#ef4444",
                  "bg-[#f97316]": "#f97316",
                  "bg-[#eab308]": "#eab308",
                  "bg-[#22c55e]": "#22c55e",
                  "bg-[#3b82f6]": "#3b82f6",
                  "bg-[#6b7280]": "#6b7280",
                }
                const critHex = critColorMap[getCriticalityColor(system.criticality)] || "#6b7280"
                const healthColor = getHealthColor(system.health).match(/#[0-9a-fA-F]+/)?.[0] || "#6b7280"
                return (
                  <tr
                    key={idx}
                    className="border-b hover:bg-white/5 transition-colors"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{system.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ background: `${critHex}20`, color: critHex }}
                      >
                        {system.criticalityLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-[#22c55e20] text-[#22c55e]">
                        {system.environment}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold" style={{ color: healthColor }}>
                        {system.health || "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold"
                        style={
                          system.critical > 0
                            ? { background: "#ef444420", color: "#ef4444" }
                            : { background: "var(--bg-primary)", color: "var(--text-muted)" }
                        }
                      >
                        {system.critical}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold"
                        style={
                          system.high > 0
                            ? { background: "#f9731620", color: "#f97316" }
                            : { background: "var(--bg-primary)", color: "var(--text-muted)" }
                        }
                      >
                        {system.high}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{system.total}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{system.lastScan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{system.owner}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewDashboard(system.name)}
                          className="inline-flex items-center gap-1 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
                          style={{ background: "#8b5cf6" }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleReingest("system", system.name)}
                          disabled={isReingesting}
                          className="inline-flex items-center gap-1 border border-[#8b5cf640] bg-[#8b5cf610] hover:bg-[#8b5cf620] text-[#8b5cf6] px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                          title={`Re-ingest resources for ${system.name}. Resources with SystemName=${system.name} tag will be discovered.`}
                        >
                          <RotateCcw className={`w-3 h-3 ${isReingesting ? "animate-spin" : ""}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div
          className="rounded-lg p-4 border"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-5 h-5" style={{ color: "#3b82f6" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total Systems</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{totalSystems}</div>
        </div>

        <div
          className="rounded-lg p-4 border"
          style={{ background: "var(--bg-secondary)", borderColor: "#f9731640" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5" style={{ color: "#f97316" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Mission Critical at Risk</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#f97316" }}>{missionCriticalAtRisk}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Requires immediate attention</div>
        </div>

        <div
          className="rounded-lg p-4 border"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total Critical Issues</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{totalCriticalIssues}</div>
        </div>

        <div
          className="rounded-lg p-4 border"
          style={{ background: "var(--bg-secondary)", borderColor: "#8b5cf640" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5" style={{ color: "#8b5cf6" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Permission Gap</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#8b5cf6" }}>{gapData.unused}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {gapData.allowed} allowed, {gapData.used} used
          </div>
        </div>

        <div
          className="rounded-lg p-4 border"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5" style={{ color: "#22c55e" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Avg Health</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: healthLabel(avgHealthScore).color }}>
            {healthLabel(avgHealthScore).label}
          </div>
        </div>
      </div>

      {/* Insight row: top at-risk systems + environment breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Systems Needing Attention (spans 3 cols) */}
        <div
          className="lg:col-span-3 rounded-lg border p-4"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: "#f97316" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Systems Needing Attention
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                · ranked by criticals, highs, lowest health
              </span>
            </div>
          </div>

          {topAtRiskSystems.length === 0 ? (
            <div
              className="text-center py-8 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              All systems look clean — no findings to rank.
            </div>
          ) : (
            <div className="space-y-2">
              {topAtRiskSystems.map((sys, idx) => {
                const healthColor = getHealthColor(sys.health).match(/#[0-9a-fA-F]+/)?.[0] || "#6b7280"
                const critHex =
                  sys.critical > 0 ? "#ef4444" : sys.high > 0 ? "#f97316" : "#22c55e"
                return (
                  <div
                    key={sys.name + idx}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-white/5 transition-colors"
                    style={{
                      background: "var(--bg-primary)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {/* Rank badge */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: `${critHex}20`, color: critHex }}
                    >
                      {idx + 1}
                    </div>

                    {/* Name + criticality */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {sys.name}
                        </span>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: `${critHex}15`, color: critHex }}
                        >
                          {sys.criticalityLabel}
                        </span>
                      </div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {sys.environment} · {sys.owner} · last scan {sys.lastScan}
                      </div>
                    </div>

                    {/* Health */}
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Health</span>
                      <span className="text-sm font-bold" style={{ color: healthColor }}>
                        {sys.health || "--"}
                      </span>
                    </div>

                    {/* Critical/High pills */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {sys.critical > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: "#ef444420", color: "#ef4444" }}
                          title={`${sys.critical} critical`}
                        >
                          {sys.critical}C
                        </span>
                      )}
                      {sys.high > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: "#f9731620", color: "#f97316" }}
                          title={`${sys.high} high`}
                        >
                          {sys.high}H
                        </span>
                      )}
                    </div>

                    {/* View button */}
                    <button
                      onClick={() => handleViewDashboard(sys.name)}
                      className="inline-flex items-center gap-1 text-white px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-90 shrink-0"
                      style={{ background: "#8b5cf6" }}
                    >
                      View
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Environment Breakdown (spans 2 cols) */}
        <div
          className="lg:col-span-2 rounded-lg border p-4"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4" style={{ color: "#8b5cf6" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Environment Breakdown
            </span>
          </div>

          {environmentBreakdown.length === 0 ? (
            <div
              className="text-center py-8 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              No systems yet.
            </div>
          ) : (
            <>
              {/* Stacked proportional bar */}
              <div
                className="h-2 rounded-full overflow-hidden flex mb-3"
                style={{ background: "var(--bg-primary)" }}
              >
                {environmentBreakdown.map(({ env, count, color }) => {
                  const pct = totalSystems > 0 ? (count / totalSystems) * 100 : 0
                  return (
                    <div
                      key={env}
                      className="h-full"
                      style={{ width: `${pct}%`, background: color }}
                      title={`${env}: ${count} (${pct.toFixed(0)}%)`}
                    />
                  )
                })}
              </div>

              {/* Legend rows */}
              <div className="space-y-1.5">
                {environmentBreakdown.map(({ env, count, color }) => {
                  const pct = totalSystems > 0 ? (count / totalSystems) * 100 : 0
                  return (
                    <div key={env} className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span
                        className="flex-1 truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {env}
                      </span>
                      <span
                        className="font-mono font-semibold shrink-0"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {count}
                      </span>
                      <span
                        className="w-10 text-right font-mono shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Systems Modal — shape-mapped from local state (SystemName → systemName) */}
      {showNewSystemsModal && (
        <NewSystemsModal
          newSystems={newSystems.map((s) => ({
            systemName: s.SystemName,
            resourceCount: s.resourceCount,
            resources: s.resources,
          }))}
          onClose={() => setShowNewSystemsModal(false)}
          onSuccess={() => {
            // Refresh local state after tagging
            fetchSystemsData()
          }}
        />
      )}
    </div>
  )
}
