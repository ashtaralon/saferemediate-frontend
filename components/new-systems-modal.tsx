"use client"

import { useState } from "react"
import { Tag, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

interface Resource { id: string; name: string; type: string; source?: "seed" | "derived" }
interface NewSystem { systemName: string; resourceCount: number; resources?: Resource[] }
interface NewSystemsModalProps { newSystems: NewSystem[]; onClose: () => void; onSuccess: () => void }
interface SystemGraphResource { id: string; name: string; type: string; source: "seed" | "derived" }
interface TaggingResult { resourceId: string; success: boolean; error?: string }

// Ported to shadcn <Dialog> with LP-style vocabulary:
//  - Compact typography (text-lg title, text-sm body, text-xs captions)
//  - var(--bg-secondary) / var(--border-subtle) / var(--text-*) tokens
//  - #8b5cf6 accent instead of blue
//  - Translucent 20-alpha chip fills
// Behavior (auto-tag flow, confirm dialog, results) is preserved unchanged.
export function NewSystemsModal({ newSystems, onClose, onSuccess }: NewSystemsModalProps) {
  const [taggingStates, setTaggingStates] = useState<Record<string, boolean>>({})
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    system: NewSystem | null
    fullResources: SystemGraphResource[] | null
    loading: boolean
  }>({ open: false, system: null, fullResources: null, loading: false })
  const [taggingResults, setTaggingResults] = useState<{
    open: boolean
    results: TaggingResult[]
    successCount: number
    totalCount: number
  } | null>(null)
  const { toast } = useToast()

  const handleAutoTagClick = async (system: NewSystem) => {
    setConfirmDialog({ open: true, system, fullResources: null, loading: true })
    try {
      const response = await fetch(
        `/api/proxy/system-graph?systemName=${encodeURIComponent(system.systemName)}`,
      )
      const data = await response.json()
      if (data.success && Array.isArray(data.resources)) {
        const allResources: SystemGraphResource[] = data.resources.map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          source: r.source === "seed" ? "seed" : ("derived" as "seed" | "derived"),
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
    const resourceIds = confirmDialog.fullResources
      .filter((r) => r.source === "derived")
      .map((r) => r.id)
    if (resourceIds.length === 0) {
      toast({ title: "No resources to tag" })
      return
    }

    setTaggingStates((prev) => ({ ...prev, [systemName]: true }))
    setConfirmDialog({ open: false, system: null, fullResources: null, loading: false })

    try {
      const response = await fetch("/api/proxy/auto-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemName, resourceIds }),
      })
      const data = await response.json()
      const results =
        data.results ||
        resourceIds.map((id: string) => ({ resourceId: id, success: true }))
      setTaggingResults({
        open: true,
        results,
        successCount: results.filter((r: any) => r.success).length,
        totalCount: resourceIds.length,
      })
    } catch (error) {
      toast({ variant: "destructive", title: "Failed", description: String(error) })
    } finally {
      setTaggingStates((prev) => ({ ...prev, [systemName]: false }))
    }
  }

  const derivedCount = confirmDialog.fullResources?.filter((r) => r.source === "derived").length || 0
  const seedCount = confirmDialog.fullResources?.filter((r) => r.source === "seed").length || 0

  return (
    <>
      {/* Main: New Systems Discovered */}
      <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              New Systems Discovered
            </DialogTitle>
            <DialogDescription className="text-sm" style={{ color: "var(--text-muted)" }}>
              Found {newSystems.length} system{newSystems.length === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 overflow-y-auto flex-1 space-y-2">
            {newSystems.map((system) => (
              <div
                key={system.systemName}
                className="rounded-lg border p-3 flex justify-between items-center"
                style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {system.systemName}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {system.resourceCount} resources
                  </div>
                </div>
                <button
                  onClick={() => handleAutoTagClick(system)}
                  disabled={taggingStates[system.systemName]}
                  className="inline-flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#8b5cf6" }}
                >
                  {taggingStates[system.systemName] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Tag className="w-3.5 h-3.5" />
                  )}
                  {taggingStates[system.systemName] ? "Tagging..." : "View & Tag"}
                </button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-90"
              style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm auto-tag */}
      {confirmDialog.open && confirmDialog.system && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDialog({ open: false, system: null, fullResources: null, loading: false })
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {confirmDialog.system.systemName}
              </DialogTitle>
              <DialogDescription className="text-sm font-medium" style={{ color: "#8b5cf6" }}>
                {confirmDialog.fullResources?.length || 0} Total Resources
              </DialogDescription>
            </DialogHeader>

            {!confirmDialog.loading && (
              <div
                className="rounded-lg border p-3"
                style={{ background: "#8b5cf610", borderColor: "#8b5cf640" }}
              >
                <div className="text-xs font-semibold mb-2" style={{ color: "#8b5cf6" }}>
                  A7 Patent Discovery Value
                </div>
                <div className="flex gap-6 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
                    <span style={{ color: "var(--text-primary)" }}><strong>{seedCount}</strong></span> Seeds
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#f97316" }} />
                    <span style={{ color: "var(--text-primary)" }}><strong>{derivedCount}</strong></span> Discovered
                  </div>
                </div>
              </div>
            )}

            <div className="py-2 overflow-y-auto flex-1">
              {confirmDialog.loading ? (
                <div className="text-center py-8 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#8b5cf6" }} />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {seedCount > 0 && (
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: "#22c55e" }}>
                        ● Seeds ({seedCount})
                      </div>
                      <div
                        className="rounded-lg p-2 max-h-32 overflow-y-auto space-y-1"
                        style={{ background: "#22c55e10" }}
                      >
                        {confirmDialog.fullResources
                          ?.filter((r) => r.source === "seed")
                          .map((r, i) => (
                            <div
                              key={i}
                              className="text-xs p-2 rounded flex gap-2"
                              style={{ background: "var(--bg-secondary)" }}
                            >
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}
                              >
                                {r.type}
                              </span>
                              <span className="truncate" style={{ color: "var(--text-primary)" }}>
                                {r.name || r.id}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {derivedCount > 0 && (
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: "#f97316" }}>
                        ● Discovered ({derivedCount})
                      </div>
                      <div
                        className="rounded-lg p-2 max-h-32 overflow-y-auto space-y-1"
                        style={{ background: "#f9731610" }}
                      >
                        {confirmDialog.fullResources
                          ?.filter((r) => r.source === "derived")
                          .map((r, i) => (
                            <div
                              key={i}
                              className="text-xs p-2 rounded flex gap-2"
                              style={{ background: "var(--bg-secondary)" }}
                            >
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}
                              >
                                {r.type}
                              </span>
                              <span className="truncate" style={{ color: "var(--text-primary)" }}>
                                {r.name || r.id}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  <div
                    className="rounded-lg border p-3"
                    style={{ background: "#8b5cf610", borderColor: "#8b5cf640" }}
                  >
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Apply tag:{" "}
                      <span className="font-mono font-semibold" style={{ color: "#8b5cf6" }}>
                        SystemName = {confirmDialog.system.systemName}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <button
                onClick={() =>
                  setConfirmDialog({ open: false, system: null, fullResources: null, loading: false })
                }
                className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-90"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAutoTag}
                disabled={confirmDialog.loading || derivedCount === 0}
                className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ background: "#8b5cf6" }}
              >
                <Tag className="w-3.5 h-3.5" />
                Tag All {derivedCount} Discovered Resources
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Tagging Results */}
      {taggingResults && (
        <Dialog open onOpenChange={(open) => { if (!open) { setTaggingResults(null); onSuccess(); onClose() } }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Tagging Results
              </DialogTitle>
              <DialogDescription className="text-sm" style={{ color: "var(--text-muted)" }}>
                Tagged {taggingResults.successCount} of {taggingResults.totalCount}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1 max-h-48 overflow-y-auto py-2">
              {taggingResults.results.map((r, i) => (
                <div
                  key={i}
                  className="text-xs p-2 rounded flex items-center gap-2"
                  style={{
                    background: r.success ? "#22c55e10" : "#ef444410",
                    color: r.success ? "#22c55e" : "#ef4444",
                  }}
                >
                  <span className="font-bold">{r.success ? "✓" : "✗"}</span>
                  <span className="font-mono truncate" style={{ color: "var(--text-primary)" }}>
                    {r.resourceId}
                  </span>
                </div>
              ))}
            </div>

            <DialogFooter>
              <button
                onClick={() => {
                  setTaggingResults(null)
                  onSuccess()
                  onClose()
                }}
                className="inline-flex items-center text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                style={{ background: "#8b5cf6" }}
              >
                Done
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
