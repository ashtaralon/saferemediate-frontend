"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Shield, Play, CheckCircle, RotateCcw, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { fetchSecurityFindings, simulateRemediation, executeRemediation, rollbackRemediation, triggerScan, getScanStatus, type SecurityFinding, type SimulationResult } from "@/lib/api-client"

interface SimulationState {
  [findingId: string]: {
    loading: boolean
    simulation?: SimulationResult
    executed?: boolean
    snapshotId?: string
    error?: string
  }
}

export function IssuesSection({ stats, systemsAtRisk, totalCritical, missionCriticalCount }: any) {
  const [findings, setFindings] = useState<SecurityFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState<string>("")
  const [simulations, setSimulations] = useState<SimulationState>({})
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)

  useEffect(() => { loadFindings() }, [])

  const loadFindings = async () => {
    setLoading(true)
    const data = await fetchSecurityFindings()
    setFindings(data)
    setLoading(false)
  }

  const handleScan = async () => {
    setScanning(true)
    setScanStatus("Starting scan...")
    const result = await triggerScan(30)
    if (result.success) {
      const pollInterval = setInterval(async () => {
        const status = await getScanStatus()
        setScanStatus(`Scanning: ${status.roles_scanned || 0}/${status.total_roles || '?'} roles`)
        if (status.status === 'completed') {
          clearInterval(pollInterval)
          setScanning(false)
          setScanStatus("")
          loadFindings()
        }
      }, 2000)
    } else {
      setScanning(false)
      setScanStatus("Scan failed")
    }
  }

  const handleSimulate = async (findingId: string) => {
    setSimulations(prev => ({ ...prev, [findingId]: { loading: true } }))
    const result = await simulateRemediation(findingId)
    setSimulations(prev => ({
      ...prev,
      [findingId]: result ? { loading: false, simulation: result } : { loading: false, error: "Simulation failed" }
    }))
  }

  const handleExecute = async (findingId: string) => {
    const sim = simulations[findingId]?.simulation
    if (!sim) return
    setSimulations(prev => ({ ...prev, [findingId]: { ...prev[findingId], loading: true } }))
    const result = await executeRemediation(findingId)
    if (result.success) {
      setSimulations(prev => ({
        ...prev,
        [findingId]: { ...prev[findingId], loading: false, executed: true, snapshotId: result.snapshot_id }
      }))
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, status: 'remediated' } : f))
    } else {
      setSimulations(prev => ({ ...prev, [findingId]: { ...prev[findingId], loading: false, error: result.error } }))
    }
  }

  const handleRollback = async (findingId: string) => {
    const snapshotId = simulations[findingId]?.snapshotId
    if (!snapshotId) return
    setSimulations(prev => ({ ...prev, [findingId]: { ...prev[findingId], loading: true } }))
    const result = await rollbackRemediation(findingId, snapshotId)
    if (result.success) {
      setSimulations(prev => ({ ...prev, [findingId]: { loading: false } }))
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, status: 'open' } : f))
    } else {
      setSimulations(prev => ({ ...prev, [findingId]: { ...prev[findingId], loading: false, error: result.error } }))
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-600 text-white'
      case 'high': return 'bg-orange-500 text-white'
      case 'medium': return 'bg-yellow-500 text-black'
      case 'low': return 'bg-blue-500 text-white'
      default: return 'bg-gray-500 text-white'
    }
  }

  const counts = {
    critical: findings.filter(f => f.severity.toLowerCase() === 'critical').length,
    high: findings.filter(f => f.severity.toLowerCase() === 'high').length,
    medium: findings.filter(f => f.severity.toLowerCase() === 'medium').length,
    low: findings.filter(f => f.severity.toLowerCase() === 'low').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading security findings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Security Issues</h2>
          <div className="flex gap-2">
            <Badge className="bg-red-100 text-red-700">{counts.critical} Critical</Badge>
            <Badge className="bg-orange-100 text-orange-700">{counts.high} High</Badge>
            <Badge className="bg-yellow-100 text-yellow-700">{counts.medium} Medium</Badge>
            <Badge className="bg-blue-100 text-blue-700">{counts.low} Low</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {scanStatus && <span className="text-sm text-gray-500">{scanStatus}</span>}
          <Button onClick={handleScan} disabled={scanning} variant="outline">
            {scanning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning...</> : <><Shield className="h-4 w-4 mr-2" />Run Scan</>}
          </Button>
          <Button onClick={loadFindings} variant="ghost" size="sm">Refresh</Button>
        </div>
      </div>

      {findings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Security Issues</h3>
            <p className="text-gray-500 text-center max-w-md">Run a scan to check for vulnerabilities.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {findings.map((finding) => {
            const simState = simulations[finding.id]
            const isExpanded = expandedFinding === finding.id

            return (
              <Card key={finding.id} className={`transition-all ${simState?.executed ? 'border-green-300 bg-green-50/30' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={getSeverityColor(finding.severity)}>{finding.severity.toUpperCase()}</Badge>
                        {simState?.executed ? <Badge className="bg-green-600 text-white">REMEDIATED</Badge> : 
                         simState?.simulation ? <Badge className="bg-blue-600 text-white">SIMULATED</Badge> : 
                         <Badge variant="outline">OPEN</Badge>}
                        <span className="text-xs text-gray-400">{finding.category}</span>
                      </div>
                      <CardTitle className="text-lg">{finding.title}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{finding.description}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 border-t">
                    <div className="grid grid-cols-2 gap-4 py-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Resource</p>
                        <p className="text-sm font-mono truncate">{finding.resourceId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Type</p>
                        <p className="text-sm">{finding.resourceType}</p>
                      </div>
                      {finding.unused_actions && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-500 uppercase mb-2">Unused Permissions ({finding.unused_actions_count})</p>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                            {finding.unused_actions.slice(0, 10).map((action, i) => (
                              <code key={i} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded">{action}</code>
                            ))}
                            {finding.unused_actions.length > 10 && <span className="text-xs text-gray-500">+{finding.unused_actions.length - 10} more</span>}
                          </div>
                        </div>
                      )}
                    </div>

                    {simState?.simulation && !simState.executed && (
                      <div className="bg-blue-50 rounded-lg p-4 mb-4">
                        <h4 className="font-semibold text-blue-900 mb-2">Simulation Preview</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div><p className="text-blue-700">Impact</p><p className="font-semibold">{simState.simulation.impact.blast_radius}</p></div>
                          <div><p className="text-blue-700">Risk</p><p className="font-semibold">{simState.simulation.impact.risk_level}</p></div>
                          <div><p className="text-blue-700">Recommendation</p><p className="font-semibold text-green-600">{simState.simulation.recommendation}</p></div>
                        </div>
                      </div>
                    )}

                    {simState?.error && <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">{simState.error}</div>}

                    <div className="flex items-center gap-3 pt-2">
                      {!simState?.executed && !simState?.simulation && (
                        <Button onClick={() => handleSimulate(finding.id)} disabled={simState?.loading} className="bg-blue-600 hover:bg-blue-700">
                          {simState?.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Simulate Fix
                        </Button>
                      )}
                      {simState?.simulation && !simState.executed && (
                        <Button onClick={() => handleExecute(finding.id)} disabled={simState?.loading} className="bg-green-600 hover:bg-green-700">
                          {simState?.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}Apply Fix
                        </Button>
                      )}
                      {simState?.executed && simState.snapshotId && (
                        <Button onClick={() => handleRollback(finding.id)} disabled={simState?.loading} variant="outline" className="border-orange-500 text-orange-600">
                          {simState?.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}Rollback
                        </Button>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">Discovered: {new Date(finding.discoveredAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
