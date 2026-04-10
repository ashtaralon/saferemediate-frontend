"use client"

import { useState, useEffect, useCallback } from "react"
import {
  LayoutDashboard,
  Bot,
  User,
  ExternalLink,
  Crown,
  RefreshCw,
  Check,
  Clock,
} from "lucide-react"
import { IdentitiesOverviewTab } from "./identities/identities-overview-tab"
import { NHITab } from "./identities/nhi-tab"
import { HumanIdentitiesTab } from "./identities/human-identities-tab"
import { ThirdPartyTab } from "./identities/third-party-tab"
import { PrivilegedAccessTab } from "./identities/privileged-access-tab"

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, color: "#3b82f6" },
  { id: "nhi", label: "Non-Human (NHI)", icon: Bot, color: "#f59e0b" },
  { id: "human", label: "Human", icon: User, color: "#8b5cf6" },
  { id: "third-party", label: "Third-Party", icon: ExternalLink, color: "#06b6d4" },
  { id: "privileged", label: "Privileged", icon: Crown, color: "#ef4444" },
] as const

type TabId = typeof TABS[number]["id"]

interface IdentitiesSectionProps {
  onRequestRemediation?: (data: any) => void
  systemName?: string
}

export function IdentitiesSection({ onRequestRemediation, systemName }: IdentitiesSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncDone, setSyncDone] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch sync status on mount
  useEffect(() => {
    fetch("/api/proxy/identities/sync/status")
      .then((r) => r.json())
      .then((d) => {
        setLastSync(d.last_sync || null)
        setSyncing(d.syncing || false)
      })
      .catch(() => {})
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncDone(false)
    try {
      await fetch("/api/proxy/identities/sync", { method: "POST" })
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const res = await fetch("/api/proxy/identities/sync/status")
          const d = await res.json()
          if (!d.syncing) {
            clearInterval(poll)
            setSyncing(false)
            setLastSync(d.last_sync)
            setSyncDone(true)
            setRefreshKey((k) => k + 1)
            setTimeout(() => setSyncDone(false), 3000)
          }
        } catch {
          clearInterval(poll)
          setSyncing(false)
        }
      }, 2000)
    } catch {
      setSyncing(false)
    }
  }, [])

  const formatLastSync = (iso: string | null) => {
    if (!iso) return "Never"
    const d = new Date(iso)
    const now = new Date()
    const diffMin = Math.round((now.getTime() - d.getTime()) / 60000)
    if (diffMin < 1) return "Just now"
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHrs = Math.round(diffMin / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    return d.toLocaleDateString()
  }

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <IdentitiesOverviewTab systemName={systemName} onTabChange={(tab) => setActiveTab(tab as TabId)} />
      case "nhi":
        return <NHITab systemName={systemName} onRequestRemediation={onRequestRemediation} />
      case "human":
        return <HumanIdentitiesTab systemName={systemName} onRequestRemediation={onRequestRemediation} />
      case "third-party":
        return <ThirdPartyTab systemName={systemName} onRequestRemediation={onRequestRemediation} />
      case "privileged":
        return <PrivilegedAccessTab systemName={systemName} onRequestRemediation={onRequestRemediation} />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {systemName ? `${systemName} Identities` : "Identity & Access Management"}
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            {systemName
              ? `Discover, classify, and secure all identities connected to ${systemName}`
              : "Discover, classify, and secure all identities — human and non-human — across your cloud environment"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <Clock className="w-3.5 h-3.5" />
            <span>Last sync: {formatLastSync(lastSync)}</span>
            <span className="text-[10px] opacity-60">(auto every 15m)</span>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
            style={{
              background: syncDone ? "#10b981" : "#3b82f6",
              color: "#ffffff",
            }}
          >
            {syncDone ? (
              <>
                <Check className="w-4 h-4" />
                Synced
              </>
            ) : syncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sync Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg border"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all"
              style={{
                background: isActive
                  ? `linear-gradient(135deg, ${tab.color}20, ${tab.color}10)`
                  : "transparent",
                color: isActive ? tab.color : "var(--text-secondary)",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div key={refreshKey}>
        {renderTab()}
      </div>
    </div>
  )
}
