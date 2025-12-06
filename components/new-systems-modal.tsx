"use client"

import { useState, useEffect } from "react"
import { X, Tag, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiGet, apiPost } from "@/lib/api-client"

interface Resource { id: string; name: string; type: string; source?: "seed" | "derived" }
interface NewSystem { systemName: string; resourceCount: number; resources?: Resource[] }
interface NewSystemsModalProps { newSystems: NewSystem[]; onClose: () => void; onSuccess: () => void }
interface SystemGraphResource { id: string; name: string; type: string; source: "seed" | "derived" }
interface TaggingResult { resourceId: string; success: boolean; error?: string }

export function NewSystemsModal({ newSystems, onClose, onSuccess }: NewSystemsModalProps) {
  const [taggingStates, setTaggingStates] = useState<Record<string, boolean>>({})
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; system: NewSystem | null; fullResources: SystemGraphResource[] | null; loading: boolean }>({ open: false, system: null, fullResources: null, loading: false })
  const [taggingResults, setTaggingResults] = useState<{ open: boolean; results: TaggingResult[]; successCount: number; totalCount: number } | null>(null)
  const { toast } = useToast()

  const handleAutoTagClick = async (system: NewSystem) => {
    setConfirmDialog({ open: true, system, fullResources: null, loading: true })
    try {
      const data = await apiGet(`/system-graph?systemName=${encodeURIComponent(system.systemName)}`)
      if (data.success && data.resources) {
        const allResources: SystemGraphResource[] = data.resources.map((r: any) => ({
          id: r.id, name: r.name, type: r.type,
          source: (r.source === "seed") ? "seed" : "derived" as "seed" | "derived"
        }))
        setConfirmDialog({ open: true, system, fullResources: allResources, loading: false })
      }
    } catch (error) {
      setConfirmDialog({ open: true, system, fullResources: [], loading: false })
    }
  }

  const handleConfirmAutoTag = async () => {
    if (!confirmDialog.system || !confirmDialog.fullResources) return
    const systemName = confirmDialog.system.systemName
    const resourceIds = confirmDialog.fullResources.filter(r => r.source === "derived").map(r => r.id)
    if (resourceIds.length === 0) { toast({ title: "No resources to tag" }); return }
    
    setTaggingStates(prev => ({ ...prev, [systemName]: true }))
    setConfirmDialog({ open: false, system: null, fullResources: null, loading: false })
    
    try {
      const data = await apiPost("/api/auto-tag", { systemName, resourceIds })
      const results = data.results || resourceIds.map((id: string) => ({ resourceId: id, success: true }))
      setTaggingResults({ open: true, results, successCount: results.filter((r: any) => r.success).length, totalCount: resourceIds.length })
    } catch (error) {
      toast({ variant: "destructive", title: "Failed", description: String(error) })
    } finally {
      setTaggingStates(prev => ({ ...prev, [systemName]: false }))
    }
  }

  const derivedCount = confirmDialog.fullResources?.filter(r => r.source === "derived").length || 0
  const seedCount = confirmDialog.fullResources?.filter(r => r.source === "seed").length || 0

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
          <div className="p-6 border-b flex-shrink-0 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">New Systems Discovered</h2>
              <p className="text-gray-600">Found {newSystems.length} system(s)</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-6 h-6" /></button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">
            {newSystems.map(system => (
              <div key={system.systemName} className="border rounded-xl p-4 mb-4 flex justify-between items-center">
                <div>
                  <div className="font-semibold">{system.systemName}</div>
                  <div className="text-sm text-gray-600">{system.resourceCount} resources</div>
                </div>
                <button onClick={() => handleAutoTagClick(system)} disabled={taggingStates[system.systemName]}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  <Tag className="w-4 h-4" />{taggingStates[system.systemName] ? "Tagging..." : "View & Tag"}
                </button>
              </div>
            ))}
          </div>
          <div className="p-6 border-t bg-gray-50 flex-shrink-0">
            <button onClick={onClose} className="w-full py-3 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300">Close</button>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmDialog.open && confirmDialog.system && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-6 border-b flex-shrink-0">
              <h3 className="text-xl font-bold">{confirmDialog.system.systemName}</h3>
              <p className="text-blue-600 font-semibold">{confirmDialog.fullResources?.length || 0} Total Resources</p>
              {!confirmDialog.loading && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="font-semibold text-blue-800 mb-2">🎯 A7 Patent Discovery Value</div>
                  <div className="flex gap-8">
                    <div><span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span><strong>{seedCount}</strong> Seeds</div>
                    <div><span className="inline-block w-3 h-3 bg-orange-500 rounded-full mr-2"></span><strong>{derivedCount}</strong> Discovered</div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {confirmDialog.loading ? <div className="text-center py-8">Loading...</div> : (
                <div className="space-y-4">
                  {seedCount > 0 && (
                    <div>
                      <div className="font-semibold text-green-800 mb-2">● Seeds ({seedCount})</div>
                      <div className="bg-green-50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                        {confirmDialog.fullResources?.filter(r => r.source === "seed").map((r, i) => (
                          <div key={i} className="text-sm p-2 bg-white rounded flex gap-2">
                            <span className="px-2 py-0.5 bg-gray-200 rounded text-xs">{r.type}</span>
                            <span className="truncate">{r.name || r.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {derivedCount > 0 && (
                    <div>
                      <div className="font-semibold text-orange-800 mb-2">● Discovered ({derivedCount})</div>
                      <div className="bg-orange-50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                        {confirmDialog.fullResources?.filter(r => r.source === "derived").map((r, i) => (
                          <div key={i} className="text-sm p-2 bg-white rounded flex gap-2">
                            <span className="px-2 py-0.5 bg-gray-200 rounded text-xs">{r.type}</span>
                            <span className="truncate">{r.name || r.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm">Apply tag: <span className="font-mono font-bold text-blue-900">SystemName = {confirmDialog.system.systemName}</span></p>
                  </div>
                </div>
              )}
            </div>
            {/* BUTTONS - Always visible */}
            <div className="p-6 border-t bg-gray-50 flex-shrink-0 flex gap-3">
              <button onClick={() => setConfirmDialog({ open: false, system: null, fullResources: null, loading: false })}
                className="flex-1 py-3 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300">Cancel</button>
              <button onClick={handleConfirmAutoTag} disabled={confirmDialog.loading || derivedCount === 0}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                <Tag className="w-4 h-4" />Tag All {derivedCount} Discovered Resources
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {taggingResults && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-2">Tagging Results</h3>
            <p className="text-gray-600 mb-4">Tagged {taggingResults.successCount} of {taggingResults.totalCount}</p>
            <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
              {taggingResults.results.map((r, i) => (
                <div key={i} className={`text-sm p-2 rounded ${r.success ? "bg-green-50" : "bg-red-50"}`}>
                  {r.success ? "✓" : "✗"} {r.resourceId}
                </div>
              ))}
            </div>
            <button onClick={() => { setTaggingResults(null); onSuccess(); onClose(); }}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold">Done</button>
          </div>
        </div>
      )}
    </>
  )
}
