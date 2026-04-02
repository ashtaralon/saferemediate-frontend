"use client"

import { useState, useEffect } from "react"
import {
  Network, Globe, Shield, ArrowRightLeft, Wifi, Server,
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react"

interface NetworkPlaneProps {
  identityName: string
  detail: any
  identity: any
  onRemediate: (result: any) => void
}

function formatBytes(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

export function NetworkPlane({ identityName, detail, identity, onRemediate }: NetworkPlaneProps) {
  const [connections, setConnections] = useState<any>(null)
  const [sgAnalysis, setSgAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [applying, setApplying] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackDone, setRollbackDone] = useState(false)
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())

  const toggleRule = (ruleKey: string) => {
    setSelectedRules(prev => {
      const next = new Set(prev)
      if (next.has(ruleKey)) { next.delete(ruleKey) } else { next.add(ruleKey) }
      return next
    })
  }

  // Pre-select unused rules when SG analysis loads
  useEffect(() => {
    if (sgAnalysis?.rules) {
      const unused = new Set<string>()
      sgAnalysis.rules.forEach((r: any, i: number) => {
        const key = `${r.direction || 'ingress'}-${r.port || '*'}-${r.protocol || 'tcp'}-${i}`
        if (r.status === 'UNUSED' || r.recommendation === 'DELETE') unused.add(key)
      })
      setSelectedRules(unused)
    }
  }, [sgAnalysis])

  useEffect(() => {
    fetchNetworkData()
  }, [identityName])

  const fetchNetworkData = async () => {
    setLoading(true)
    try {
      // Fetch behavioral connections (same as dependency map)
      const connRes = await fetch(`/api/proxy/resource-view/${encodeURIComponent(identityName)}/connections`)
      if (connRes.ok) {
        const data = await connRes.json()
        const conns = data.connections || {}

        const BEHAVIORAL_TYPES = new Set(['ACTUAL_TRAFFIC', 'ACTUAL_API_CALL', 'CALLS', 'ACTUAL_S3_ACCESS', 'DATA_ACCESS', 'CONNECTS_TO'])
        const STRUCTURAL_TYPES = new Set(['HAS_POLICY', 'HAS_ROLE', 'HAS_REMEDIATION', 'ASSUMES', 'ATTACHED_TO', 'BELONGS_TO', 'MEMBER_OF', 'HAS_TAG', 'IN_VPC', 'IN_SUBNET', 'HAS_SECURITY_GROUP', 'TAGGED', 'PART_OF', 'MANAGED_BY', 'CONFIG_RELATIONSHIP', 'HAS_NACL', 'APPLIES_TO'])

        const processConn = (c: any, direction: 'inbound' | 'outbound') => ({
          source: direction === 'inbound' ? (c.source?.name || c.source?.id || 'Unknown') : identityName,
          target: direction === 'outbound' ? (c.target?.name || c.target?.id || 'Unknown') : identityName,
          targetType: direction === 'outbound' ? (c.target?.type || '') : (c.source?.type || ''),
          port: c.relationship?.port || '',
          protocol: c.relationship?.protocol || '',
          bytes: c.relationship?.bytes_transferred || c.relationship?.bytes || 0,
          edgeType: c.relationship?.type || c.relationship?.relationship_type || '',
          direction,
        })

        const inbound = (conns.inbound || []).map((c: any) => processConn(c, 'inbound'))
        const outbound = (conns.outbound || []).map((c: any) => processConn(c, 'outbound'))
        const all = [...inbound, ...outbound].filter(c => {
          if (STRUCTURAL_TYPES.has(c.edgeType)) return false
          if (BEHAVIORAL_TYPES.has(c.edgeType)) return true
          return c.bytes > 0 || c.port
        })

        setConnections({
          all,
          totalBytes: all.reduce((s: number, c: any) => s + (c.bytes || 0), 0),
        })
      }

      // Try to fetch SG analysis if we have security group info
      const sgs = detail?.network_reachability?.security_groups || []
      if (sgs.length > 0) {
        const sgId = typeof sgs[0] === 'string' ? sgs[0] : sgs[0].group_id || sgs[0].name
        if (sgId) {
          const sgRes = await fetch(`/api/proxy/sg-least-privilege/${encodeURIComponent(sgId)}/analysis`)
          if (sgRes.ok) setSgAnalysis(await sgRes.json())
        }
      }
    } catch (err) {
      console.error("Error fetching network data:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSimulateSGFix = async () => {
    const sgs = detail?.network_reachability?.security_groups || []
    if (sgs.length === 0 || !sgAnalysis) return
    setSimulating(true)
    try {
      const sgId = typeof sgs[0] === 'string' ? sgs[0] : sgs[0].group_id || sgs[0].name
      const unusedRules = (sgAnalysis.rules || []).filter((r: any) => r.recommendation === 'DELETE' || r.status === 'UNUSED')
      const res = await fetch(`/api/proxy/sg-least-privilege/${encodeURIComponent(sgId)}/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: unusedRules.map((r: any) => ({ rule_id: r.rule_id || r.id, direction: r.direction || 'ingress', port: r.port, protocol: r.protocol, source: r.source || r.cidr })),
          create_snapshot: true,
          dry_run: true,
        }),
      })
      if (res.ok) setSimulationResult(await res.json())
    } catch (err) {
      console.error("SG simulation failed:", err)
    } finally {
      setSimulating(false)
    }
  }

  const handleApplySGFix = async () => {
    const sgs = detail?.network_reachability?.security_groups || []
    if (sgs.length === 0 || !sgAnalysis) return

    setApplying(true)
    try {
      const sgId = typeof sgs[0] === 'string' ? sgs[0] : sgs[0].group_id || sgs[0].name
      const unusedRules = (sgAnalysis.rules || []).filter((r: any) => r.recommendation === 'DELETE' || r.status === 'UNUSED')

      // Step 1: Create pre-remediation snapshot
      const snapRes = await fetch(`/api/proxy/sg-least-privilege/${encodeURIComponent(sgId)}/snapshots`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      })
      if (snapRes.ok) {
        const snapResult = await snapRes.json()
        if (snapResult.snapshot_id) setSnapshotId(snapResult.snapshot_id)
      }

      // Step 2: Apply remediation
      const res = await fetch(`/api/proxy/sg-least-privilege/${encodeURIComponent(sgId)}/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: unusedRules.map((r: any) => ({
            rule_id: r.rule_id || r.id,
            direction: r.direction || 'ingress',
            port: r.port,
            protocol: r.protocol,
            source: r.source || r.cidr,
          })),
          create_snapshot: true,
          dry_run: false,
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.snapshot_id) setSnapshotId(result.snapshot_id)
        onRemediate(result)
      }
    } catch (err) {
      console.error("SG remediation failed:", err)
    } finally {
      setApplying(false)
    }
  }

  const handleRollback = async () => {
    if (!snapshotId) return
    const sgs = detail?.network_reachability?.security_groups || []
    if (sgs.length === 0) return
    setRollingBack(true)
    try {
      const sgId = typeof sgs[0] === 'string' ? sgs[0] : sgs[0].group_id || sgs[0].name
      const res = await fetch(`/api/proxy/sg-least-privilege/${encodeURIComponent(sgId)}/rollback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot_id: snapshotId }),
      })
      if (res.ok) {
        setRollbackDone(true)
        fetchNetworkData()
      }
    } catch (err) {
      console.error("SG rollback failed:", err)
    } finally {
      setRollingBack(false)
    }
  }

  const networkReach = detail?.network_reachability
  const isInternetReachable = networkReach?.is_internet_reachable

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
      {/* Plane Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:opacity-90 transition-opacity"
        style={{ background: "#3b82f608" }}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-5 h-5" style={{ color: "#3b82f6" }} /> : <ChevronRight className="w-5 h-5" style={{ color: "#3b82f6" }} />}
          <Network className="w-5 h-5" style={{ color: "#3b82f6" }} />
          <span className="text-base font-semibold" style={{ color: "var(--text-primary, #0f172a)" }}>Network Plane</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#3b82f615", color: "#3b82f6" }}>Security Groups + Flow Logs</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {isInternetReachable !== undefined && (
            <span className="flex items-center gap-1" style={{ color: isInternetReachable ? '#ef4444' : '#22c55e' }}>
              <Globe className="w-3.5 h-3.5" />
              {isInternetReachable ? 'Internet Exposed' : 'Internal Only'}
            </span>
          )}
          {connections && (
            <>
              <span style={{ color: "var(--text-secondary, #64748b)" }}>{connections.all.length} connections</span>
              {connections.totalBytes > 0 && (
                <span style={{ color: "#22c55e" }}>{formatBytes(connections.totalBytes)}</span>
              )}
            </>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 py-5 space-y-4" style={{ background: "var(--bg-surface, #ffffff)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#3b82f6" }} />
              <span className="ml-2 text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>Loading network analysis...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* Configured (SG Rules) */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
                  <Shield className="w-3.5 h-3.5" /> Configured (Security Groups)
                </h4>
                {sgAnalysis?.rules?.length > 0 ? (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {sgAnalysis.rules.map((rule: any, i: number) => {
                      const isUsed = rule.status === 'USED' || rule.recommendation === 'KEEP'
                      const ruleKey = `${rule.direction || 'ingress'}-${rule.port || '*'}-${rule.protocol || 'tcp'}-${i}`
                      const isSelected = selectedRules.has(ruleKey)
                      return (
                        <label key={i} className="flex items-center gap-3 py-1.5 px-3 rounded text-sm cursor-pointer transition-colors" style={{ background: isSelected ? "#ef444410" : "var(--bg-secondary, #f8fafc)" }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleRule(ruleKey)} className="rounded border-gray-300 text-red-500 focus:ring-red-500" />
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                              background: rule.direction === 'ingress' ? '#3b82f610' : '#f9731610',
                              color: rule.direction === 'ingress' ? '#3b82f6' : '#f97316',
                            }}>{rule.direction === 'ingress' ? 'IN' : 'OUT'}</span>
                            <code className="text-xs font-mono" style={{ color: isSelected ? "#ef4444" : "var(--text-primary, #334155)", textDecoration: isSelected ? 'line-through' : 'none' }}>
                              :{rule.port || '*'}/{rule.protocol || 'tcp'}
                            </code>
                            <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>{rule.source || rule.cidr || '*'}</span>
                          </div>
                          {isUsed ? (
                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>
                              <CheckCircle className="w-3 h-3" /> Traffic
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#ef444415", color: "#ef4444" }}>
                              <XCircle className="w-3 h-3" /> No Traffic
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                ) : networkReach?.security_groups?.length > 0 ? (
                  <div className="space-y-1">
                    {networkReach.security_groups.map((sg: any, i: number) => (
                      <div key={i} className="text-xs font-mono py-1.5 px-3 rounded flex items-center gap-2" style={{ background: "var(--bg-secondary, #f8fafc)", color: "var(--text-primary, #334155)" }}>
                        <Shield className="w-3 h-3" style={{ color: "#f59e0b" }} />
                        {typeof sg === 'string' ? sg : sg.group_id || sg.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs py-2" style={{ color: "var(--text-muted, #94a3b8)" }}>No security group data available</p>
                )}

                {networkReach?.open_ports?.length > 0 && (
                  <div className="mt-2 text-xs p-2 rounded" style={{ background: "#ef444410", color: "#ef4444" }}>
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Open ports: {networkReach.open_ports.join(", ")}
                  </div>
                )}
              </div>

              {/* Observed (Flow Logs / Active Connections) */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Observed (Flow Logs)
                </h4>
                {connections?.all?.length > 0 ? (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {connections.all.map((conn: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded text-sm" style={{ background: "var(--bg-secondary, #f8fafc)" }}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                            background: conn.direction === 'outbound' ? '#f9731615' : '#3b82f615',
                            color: conn.direction === 'outbound' ? '#f97316' : '#3b82f6',
                          }}>{conn.direction === 'outbound' ? '→ OUT' : '← IN'}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: "#8b5cf610", color: "#8b5cf6" }}>
                            {conn.edgeType.replace('ACTUAL_', '').replace('_', ' ')}
                          </span>
                          <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary, #334155)" }}>
                            {conn.direction === 'outbound' ? conn.target : conn.source}
                          </span>
                          {conn.targetType && (
                            <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>{conn.targetType}</span>
                          )}
                        </div>
                        {conn.bytes > 0 && (
                          <span className="text-xs font-mono font-medium ml-2" style={{ color: "#22c55e" }}>{formatBytes(conn.bytes)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Network className="w-6 h-6 mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted, #94a3b8)" }} />
                    <p className="text-xs" style={{ color: "var(--text-muted, #94a3b8)" }}>No observed network traffic for this identity</p>
                  </div>
                )}

                {/* Attached instances */}
                {networkReach?.attached_instances?.length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Attached Compute</span>
                    {networkReach.attached_instances.map((inst: any, i: number) => (
                      <div key={i} className="text-xs font-mono mt-1 flex items-center gap-1.5" style={{ color: "var(--text-primary, #334155)" }}>
                        <Server className="w-3 h-3" style={{ color: "#3b82f6" }} />
                        {typeof inst === 'string' ? inst : inst.instance_id || inst.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SG Remediation Action */}
          {(sgAnalysis?.rules?.length > 0 || selectedRules.size > 0) && selectedRules.size > 0 && (
            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: "var(--border, #e2e8f0)" }}>
              <div className="text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>
                <span className="font-medium" style={{ color: "#ef4444" }}>
                  {selectedRules.size}
                </span> of {sgAnalysis?.rules?.length || 0} SG rule(s) selected for removal
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSimulateSGFix}
                  disabled={simulating}
                  className="px-4 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: "#3b82f640", color: "#3b82f6" }}
                >
                  {simulating ? "Simulating..." : "Simulate Fix"}
                </button>
                <button
                  onClick={handleApplySGFix}
                  disabled={applying}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ background: "#3b82f6" }}
                >
                  {applying ? "Applying..." : "Apply Network Fix"}
                </button>
              </div>
            </div>
          )}

          {/* Simulation Result */}
          {simulationResult && (
            <div className="rounded-lg p-3 border" style={{ background: "#3b82f608", borderColor: "#3b82f630" }}>
              <h4 className="text-xs font-semibold mb-1" style={{ color: "#3b82f6" }}>Network Simulation Result (Dry Run)</h4>
              <pre className="text-xs font-mono overflow-auto max-h-[150px]" style={{ color: "var(--text-primary, #334155)" }}>
                {JSON.stringify(simulationResult, null, 2)}
              </pre>
            </div>
          )}

          {/* Snapshot & Rollback Banner */}
          {snapshotId && !rollbackDone && (
            <div className="rounded-lg p-3 border flex items-center justify-between" style={{ background: "#22c55e08", borderColor: "#22c55e30" }}>
              <div>
                <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: "#22c55e" }}>
                  <CheckCircle className="w-3.5 h-3.5" /> Network Remediation Applied — Snapshot Saved
                </h4>
                <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-secondary, #64748b)" }}>{snapshotId}</p>
              </div>
              <button
                onClick={handleRollback}
                disabled={rollingBack}
                className="px-4 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: "#ef444440", color: "#ef4444" }}
              >
                {rollingBack ? "Rolling back..." : "Rollback SG Rules"}
              </button>
            </div>
          )}
          {rollbackDone && (
            <div className="rounded-lg p-3 border" style={{ background: "#f59e0b08", borderColor: "#f59e0b30" }}>
              <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: "#f59e0b" }}>
                <AlertTriangle className="w-3.5 h-3.5" /> SG Rules Rolled Back Successfully
              </h4>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary, #64748b)" }}>Security group rules restored from snapshot {snapshotId}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
