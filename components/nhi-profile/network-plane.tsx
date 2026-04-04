"use client"

import { useState, useEffect } from "react"
import {
  Network, Globe, Shield, ArrowRightLeft, Wifi, Server,
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Wrench,
} from "lucide-react"
import dynamic from "next/dynamic"

const SGLeastPrivilegeModal = dynamic(() => import("../sg-least-privilege-modal"), { ssr: false })

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
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [showSGModal, setShowSGModal] = useState(false)
  const [sgId, setSgId] = useState<string>('')
  const [sgName, setSgName] = useState<string>('')

  useEffect(() => {
    fetchNetworkData()
  }, [identityName])

  const fetchNetworkData = async () => {
    setLoading(true)
    try {
      // Use observed_traffic from identity detail (backend traverses role→instances→ACTUAL_TRAFFIC)
      const observedTraffic = detail?.network_reachability?.observed_traffic || []

      const allConns = observedTraffic.map((t: any) => ({
        source: t.direction === 'inbound' ? (t.peer || 'Unknown') : (t.instance || identityName),
        target: t.direction === 'outbound' ? (t.peer || 'Unknown') : (t.instance || identityName),
        targetType: t.peer_type || 'NetworkEndpoint',
        port: t.port || '',
        protocol: t.protocol || '',
        bytes: t.bytes || 0,
        edgeType: 'ACTUAL_TRAFFIC',
        direction: t.direction || 'outbound',
      }))

      // Deduplicate by source+target+port+protocol
      const seen = new Set<string>()
      const deduped = allConns.filter((c: any) => {
        const key = `${c.source}|${c.target}|${c.port}|${c.protocol}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setConnections({ all: deduped, totalBytes: deduped.reduce((s: number, c: any) => s + (c.bytes || 0), 0) })

      // Find SG ID for the remediate modal
      const sgs = detail?.network_reachability?.security_groups || []
      if (sgs.length > 0) {
        const sg = sgs[0]
        const id = typeof sg === 'string' ? sg : sg.group_id || sg.name || ''
        const name = typeof sg === 'string' ? sg : sg.name || sg.group_id || ''
        setSgId(id)
        setSgName(name)
      }
    } catch (err) {
      console.error("Error fetching network data:", err)
    } finally {
      setLoading(false)
    }
  }

  const networkReach = detail?.network_reachability
  const isInternetReachable = networkReach?.is_internet_reachable

  return (
    <>
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
                {connections.totalBytes > 0 && <span style={{ color: "#22c55e" }}>{formatBytes(connections.totalBytes)}</span>}
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
                {/* Configured (SG / Attached Resources) */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
                    <Shield className="w-3.5 h-3.5" /> Configured
                  </h4>
                  {networkReach?.attached_instances?.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Attached Compute</span>
                      {networkReach.attached_instances.map((inst: any, i: number) => (
                        <div key={i} className="text-xs font-mono mt-1 flex items-center gap-1.5" style={{ color: "var(--text-primary, #334155)" }}>
                          <Server className="w-3 h-3" style={{ color: "#3b82f6" }} />
                          {typeof inst === 'string' ? inst : inst.instance_id || inst.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {networkReach?.security_groups?.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Security Groups</span>
                      {networkReach.security_groups.map((sg: any, i: number) => (
                        <div key={i} className="text-xs font-mono mt-1 flex items-center gap-1.5" style={{ color: "var(--text-primary, #334155)" }}>
                          <Shield className="w-3 h-3" style={{ color: "#f59e0b" }} />
                          {typeof sg === 'string' ? sg : sg.group_id || sg.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {!networkReach?.attached_instances?.length && !networkReach?.security_groups?.length && (
                    <p className="text-xs" style={{ color: "var(--text-muted, #94a3b8)" }}>No attached resources</p>
                  )}
                  {networkReach?.open_ports?.length > 0 && (
                    <div className="mt-2 text-xs p-2 rounded" style={{ background: "#ef444410", color: "#ef4444" }}>
                      <AlertTriangle className="w-3 h-3 inline mr-1" /> Open ports: {networkReach.open_ports.join(", ")}
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
                          </div>
                          {conn.bytes > 0 && <span className="text-xs font-mono font-medium ml-2" style={{ color: "#22c55e" }}>{formatBytes(conn.bytes)}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs py-4" style={{ color: "var(--text-muted, #94a3b8)" }}>No observed traffic</p>
                  )}
                </div>
              </div>
            )}

            {/* Remediate Button — opens existing SG Least Privilege Modal */}
            {sgId && (
              <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                <div className="text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>
                  Security Group: <span className="font-mono">{sgName || sgId}</span>
                </div>
                <button
                  onClick={() => setShowSGModal(true)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 flex items-center gap-2"
                  style={{ background: "#3b82f6" }}
                >
                  <Wrench className="w-4 h-4" /> Remediate Network Rules
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Existing SG Least Privilege Modal */}
      {showSGModal && sgId && (
        <SGLeastPrivilegeModal
          sgId={sgId}
          sgName={sgName}
          systemName={identity?.system_name || detail?.basic_info?.system_name || ''}
          isOpen={showSGModal}
          onClose={() => setShowSGModal(false)}
          onRemediate={() => onRemediate({ plane: 'network' })}
        />
      )}
    </>
  )
}
