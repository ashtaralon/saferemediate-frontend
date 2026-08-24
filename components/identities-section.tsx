"use client"

import { useState } from "react"
import { RefreshEvidenceButton } from "@/components/RefreshEvidenceButton"
import {
  LayoutDashboard,
  Bot,
  User,
  ExternalLink,
  Crown,
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
  const [refreshKey, setRefreshKey] = useState(0)

  // The refresh control owns label, capability, freshness and the round.
  // Identities only needs to know when to refetch — it must never decide for
  // itself that its data is fresh.
  const handleRefreshed = () => setRefreshKey((k) => k + 1)


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
          <RefreshEvidenceButton surface="iam" onRefreshed={handleRefreshed} />
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
