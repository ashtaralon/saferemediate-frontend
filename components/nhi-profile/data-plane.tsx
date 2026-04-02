"use client"

import { useState, useEffect } from "react"
import {
  Database, HardDrive, Key, Lock, Eye, PenTool, Trash2,
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, Workflow, AlertTriangle,
} from "lucide-react"

interface DataPlaneProps {
  identityName: string
  detail: any
  identity: any
  onRemediate: (result: any) => void
}

const OP_COLORS: Record<string, string> = {
  READ: '#22c55e', LIST: '#3b82f6', WRITE: '#f97316', DELETE: '#ef4444',
  EXECUTE: '#a855f7', MODIFY: '#ef4444', ENCRYPT: '#a855f7', DECRYPT: '#3b82f6',
  INVOKE: '#06b6d4', SNAPSHOT: '#3b82f6', READ_METADATA: '#6b7280',
  SELECT: '#22c55e', INSERT: '#3b82f6', UPDATE: '#f97316',
  READ_POLICY: '#6b7280', WRITE_POLICY: '#f97316', START: '#22c55e', STOP: '#ef4444',
}

const ACCESS_LEVEL_COLORS: Record<string, string> = { FULL: '#ef4444', WRITE: '#f97316', READ: '#22c55e', NONE: '#6b7280' }
const TYPE_ICONS: Record<string, any> = { S3: HardDrive, RDS: Database, DynamoDB: Database, Lambda: Workflow, KMS: Lock, SecretsManager: Key }

export function DataPlane({ identityName, detail, identity, onRemediate }: DataPlaneProps) {
  const [dataAccess, setDataAccess] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [applying, setApplying] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackDone, setRollbackDone] = useState(false)
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set())

  const toggleOp = (key: string) => {
    setSelectedOps(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  // Pre-select unused operations when data loads
  useEffect(() => {
    if (dataAccess?.dataStores) {
      const unused = new Set<string>()
      dataAccess.dataStores.forEach((store: any) => {
        (store.unusedOperations || []).forEach((op: string) => {
          unused.add(`${store.name}:${op}`)
        })
      })
      setSelectedOps(unused)
    }
  }, [dataAccess])

  useEffect(() => {
    fetchDataAccess()
  }, [identityName])

  const fetchDataAccess = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/proxy/identities/${encodeURIComponent(identityName)}/data-access`)
      if (res.ok) setDataAccess(await res.json())
    } catch (err) {
      console.error("Error fetching data access:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSimulateS3Fix = async (bucketName: string) => {
    setSimulating(true)
    try {
      const res = await fetch("/api/proxy/s3-buckets/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          create_checkpoint: true,
          dry_run: true,
        }),
      })
      if (res.ok) setSimulationResult(await res.json())
    } catch (err) {
      console.error("S3 simulation failed:", err)
    } finally {
      setSimulating(false)
    }
  }

  const handleApplyS3Fix = async (bucketName: string) => {
    setApplying(true)
    try {
      const res = await fetch("/api/proxy/s3-buckets/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          create_checkpoint: true,
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.checkpoint_id) setSnapshotId(result.checkpoint_id)
        onRemediate(result)
      }
    } catch (err) {
      console.error("S3 remediation failed:", err)
    } finally {
      setApplying(false)
    }
  }

  const handleRollback = async () => {
    if (!snapshotId) return
    setRollingBack(true)
    try {
      const s3Store = dataAccess?.dataStores?.find((s: any) => s.type === 'S3')
      const res = await fetch("/api/proxy/s3-buckets/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint_id: snapshotId, bucket_name: s3Store?.name || '' }),
      })
      if (res.ok) {
        setRollbackDone(true)
        fetchDataAccess()
      }
    } catch (err) {
      console.error("S3 rollback failed:", err)
    } finally {
      setRollingBack(false)
    }
  }

  const dataStores = dataAccess?.dataStores || []
  const tableAccess = dataAccess?.tableAccess || []
  const hasData = dataStores.length > 0 || tableAccess.length > 0

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
      {/* Plane Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:opacity-90 transition-opacity"
        style={{ background: "#22c55e08" }}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-5 h-5" style={{ color: "#22c55e" }} /> : <ChevronRight className="w-5 h-5" style={{ color: "#22c55e" }} />}
          <Database className="w-5 h-5" style={{ color: "#22c55e" }} />
          <span className="text-base font-semibold" style={{ color: "var(--text-primary, #0f172a)" }}>Data Plane</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>S3 + RDS + DynamoDB</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {dataAccess?.summary && (
            <>
              <span style={{ color: "var(--text-secondary, #64748b)" }}>{dataAccess.summary.totalDataStores || 0} data store(s)</span>
              <span style={{ color: "#22c55e" }}>{dataAccess.summary.totalObservedOps || 0} observed</span>
              <span style={{ color: "var(--text-secondary, #64748b)" }}>/ {dataAccess.summary.totalAllowedOps || 0} allowed</span>
              {dataAccess.summary.hasDestructiveAccess && (
                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#ef444420", color: "#ef4444" }}>Destructive</span>
              )}
            </>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 py-5 space-y-4" style={{ background: "var(--bg-surface, #ffffff)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#22c55e" }} />
              <span className="ml-2 text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>Loading data access analysis...</span>
            </div>
          ) : hasData ? (
            <>
              {/* Data Store Cards (IAM-level) */}
              {dataStores.map((store: any, idx: number) => {
                const StoreIcon = TYPE_ICONS[store.type] || Database
                return (
                  <div key={idx} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-secondary, #f8fafc)" }}>
                      <div className="flex items-center gap-2">
                        <StoreIcon className="w-4 h-4" style={{ color: "#22c55e" }} />
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary, #334155)" }}>{store.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-primary, #f1f5f9)", color: "var(--text-muted, #94a3b8)" }}>{store.type}</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                        background: `${ACCESS_LEVEL_COLORS[store.accessLevel] || '#6b7280'}20`,
                        color: ACCESS_LEVEL_COLORS[store.accessLevel] || '#6b7280',
                      }}>{store.accessLevel} ACCESS</span>
                    </div>

                    <div className="p-4 space-y-1">
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted, #94a3b8)" }}>Operations — select unused to remove</span>
                      {store.allowedOperations?.map((op: string) => {
                        const isUsed = store.observedOperations?.includes(op)
                        const opKey = `${store.name}:${op}`
                        const isSelected = selectedOps.has(opKey)
                        return (
                          <label key={op} className="flex items-center gap-3 py-1 px-3 rounded text-sm cursor-pointer transition-colors" style={{ background: isSelected ? "#ef444410" : "var(--bg-secondary, #f8fafc)" }}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOp(opKey)} className="rounded border-gray-300 text-red-500 focus:ring-red-500" />
                            <span className="text-xs font-medium flex-1" style={{ color: isSelected ? "#ef4444" : OP_COLORS[op] || '#6b7280', textDecoration: isSelected ? 'line-through' : 'none' }}>{op}</span>
                            {isUsed ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>Observed</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#ef444415", color: "#ef4444" }}>Unused</span>
                            )}
                          </label>
                        )
                      })}
                      {(!store.allowedOperations || store.allowedOperations.length === 0) && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>No operations detected</span>
                      )}
                    </div>

                    {/* Unused + Recommendation */}
                    {(store.unusedOperations?.length > 0 || store.recommendation) && (
                      <div className="px-4 pb-3">
                        {store.unusedOperations?.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mb-1.5">
                            <span className="text-[10px]" style={{ color: "#ef4444" }}>Unused:</span>
                            {store.unusedOperations.map((op: string) => (
                              <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium line-through" style={{ background: "#ef444410", color: "#ef4444" }}>{op}</span>
                            ))}
                          </div>
                        )}
                        {store.recommendation && (
                          <div className="text-xs p-2 rounded" style={{ background: "#f59e0b08", color: "#f59e0b" }}>
                            {store.recommendation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Table-Level Access (from RDS query logs) */}
              {tableAccess.length > 0 && (
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                  <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--bg-secondary, #f8fafc)" }}>
                    <Database className="w-4 h-4" style={{ color: "#3b82f6" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary, #334155)" }}>Table-Level Access</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>From RDS Query Logs</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                    {tableAccess.map((t: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium" style={{ color: "var(--text-primary, #334155)" }}>
                            {t.schema !== 'public' ? `${t.schema}.` : ''}{t.tableName}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>({t.database})</span>
                          {t.viaDbUser && (
                            <span className="text-[10px] px-1 py-0.5 rounded font-mono" style={{ background: "#3b82f610", color: "#3b82f6" }}>via: {t.viaDbUser}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(t.operations || []).map((op: string) => (
                            <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                              background: `${OP_COLORS[op] || '#6b7280'}15`,
                              color: OP_COLORS[op] || '#6b7280',
                            }}>{op}</span>
                          ))}
                          {t.accessCount > 0 && <span className="text-[10px]" style={{ color: "var(--text-muted, #94a3b8)" }}>{t.accessCount.toLocaleString()} calls</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Remediation Action */}
              {selectedOps.size > 0 && (
                <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: "var(--border, #e2e8f0)" }}>
                  <div className="text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>
                    <span className="font-medium" style={{ color: "#ef4444" }}>
                      {selectedOps.size}
                    </span> data operation(s) selected for removal
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const s3Store = dataStores.find((s: any) => s.type === 'S3')
                        if (s3Store) handleSimulateS3Fix(s3Store.name)
                      }}
                      disabled={simulating}
                      className="px-4 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ borderColor: "#22c55e40", color: "#22c55e" }}
                    >
                      {simulating ? "Simulating..." : "Simulate Fix"}
                    </button>
                    <button
                      onClick={() => {
                        const s3Store = dataStores.find((s: any) => s.type === 'S3')
                        if (s3Store) handleApplyS3Fix(s3Store.name)
                      }}
                      disabled={applying}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ background: "#22c55e" }}
                    >
                      {applying ? "Applying..." : "Apply Data Fix"}
                    </button>
                  </div>
                </div>
              )}

              {/* Simulation Result */}
              {simulationResult && (
                <div className="rounded-lg p-3 border" style={{ background: "#22c55e08", borderColor: "#22c55e30" }}>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: "#22c55e" }}>Data Simulation Result (Dry Run)</h4>
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
                      <CheckCircle className="w-3.5 h-3.5" /> Data Remediation Applied — Checkpoint Saved
                    </h4>
                    <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-secondary, #64748b)" }}>{snapshotId}</p>
                  </div>
                  <button
                    onClick={handleRollback}
                    disabled={rollingBack}
                    className="px-4 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ borderColor: "#ef444440", color: "#ef4444" }}
                  >
                    {rollingBack ? "Rolling back..." : "Rollback Data Policy"}
                  </button>
                </div>
              )}
              {rollbackDone && (
                <div className="rounded-lg p-3 border" style={{ background: "#f59e0b08", borderColor: "#f59e0b30" }}>
                  <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: "#f59e0b" }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Data Policy Rolled Back Successfully
                  </h4>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary, #64748b)" }}>S3 bucket policy restored from checkpoint {snapshotId}</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted, #94a3b8)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted, #94a3b8)" }}>No data store access detected</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted, #94a3b8)" }}>This identity may not have S3, RDS, or DynamoDB permissions</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
