# 📋 הנחיות ל-Cursor: פיצול System Detail Dashboard

## 🎯 המטרה
לפצל את `components/system-detail-dashboard.tsx` (1679 שורות) לקומפוננטות קטנות ומנוהלות בתיקייה `components/system-detail/`.

---

## 📁 מבנה התיקיות החדש

```
components/
  system-detail/
    ├── index.tsx                    # Main component (imports all)
    ├── header.tsx                   # Header with back button, title, badges
    ├── tabs-navigation.tsx          # Tab navigation bar
    ├── overview-tab.tsx             # Overview tab content
    ├── stats-row.tsx                # Health score + severity cards (Critical, High, Medium, Passing)
    ├── gap-analysis-card.tsx        # GAP Analysis card
    ├── system-info-card.tsx         # System Info card
    ├── resource-types-card.tsx      # Resource Types card
    ├── auto-tag-card.tsx            # Auto-Tag Service card
    ├── compliance-card.tsx          # Compliance Status card
    ├── critical-issues-section.tsx  # Critical/High Issues list
    ├── tag-all-modal.tsx            # Tag All Resources modal
    ├── high-findings-modal.tsx      # High Findings modal
    └── types.ts                     # Shared types
```

---

## 🔧 שלבים לביצוע

### 1. צור תיקייה חדשה
```bash
mkdir -p components/system-detail
```

### 2. העתק את הקובץ המקורי (גיבוי)
```bash
cp components/system-detail-dashboard.tsx components/system-detail-dashboard-OLD.tsx
```

### 3. צור את הקבצים החדשים

#### א. `components/system-detail/types.ts`
```typescript
export interface SystemDetailDashboardProps {
  systemName: string
  onBack: () => void
}

export interface GapAnalysis {
  allowed: number
  actual: number
  gap: number
  gapPercent: number
  confidence?: number
}

export interface AutoTagStatus {
  status: "running" | "stopped" | "error"
  totalCycles: number
  actualTrafficCaptured: number
  lastSync: string
}

export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  passing: number
}

export interface ResourceType {
  name: string
  count: number
  icon: any
  color: string
  description: string
}

export interface Issue {
  id: string
  title: string
  severity: "critical" | "high" | "medium" | "low"
  description: string
  selected: boolean
  icon?: string
}
```

#### ב. `components/system-detail/header.tsx`
```typescript
"use client"

import { ArrowLeft, Download, Calendar, AlertTriangle, Tag } from "lucide-react"

interface HeaderProps {
  systemName: string
  severityCounts: { critical: number; high: number; medium: number; passing: number }
  onBack: () => void
  onTagAll: () => void
}

export function Header({ systemName, severityCounts, onBack, onTagAll }: HeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-[1800px] mx-auto px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{systemName}</h1>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                  PRODUCTION
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  MISSION CRITICAL
                </span>
                {severityCounts.critical > 0 && (
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {severityCounts.critical} CRITICAL
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                AWS eu-west-1 • Production environment • Last scan: 2 min ago
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onTagAll}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Tag className="w-4 h-4" />
              Tag All Resources
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              Generate Report
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#2D51DA] text-white rounded-lg hover:bg-[#2343B8] transition-colors">
              <Calendar className="w-4 h-4" />
              Schedule Maintenance
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

#### ג. `components/system-detail/tabs-navigation.tsx`
```typescript
"use client"

interface Tab {
  id: string
  label: string
  icon: any
}

interface TabsNavigationProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function TabsNavigation({ tabs, activeTab, onTabChange }: TabsNavigationProps) {
  return (
    <div className="flex items-center gap-1 mt-6 border-b border-gray-200 -mb-px">
      {tabs.map((tab) => {
        const IconComponent = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[#2D51DA] text-[#2D51DA]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <IconComponent className="w-4 h-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
```

#### ד. `components/system-detail/stats-row.tsx`
```typescript
"use client"

import { AlertTriangle } from "lucide-react"

interface StatsRowProps {
  healthScore: number
  severityCounts: {
    critical: number
    high: number
    medium: number
    passing: number
  }
  totalChecks: number
  onHighClick: () => void
}

export function StatsRow({ healthScore, severityCounts, totalChecks, onHighClick }: StatsRowProps) {
  return (
    <div className="grid grid-cols-5 gap-4 mb-6">
      {/* System Health */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">System Health</p>
        <div className="flex items-center justify-center">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle cx="48" cy="48" r="40" stroke="#E5E7EB" strokeWidth="8" fill="none" />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke={healthScore >= 80 ? "#10B981" : healthScore >= 60 ? "#F59E0B" : "#EF4444"}
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - healthScore / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{healthScore}</span>
              <span className="text-xs text-gray-500">Score</span>
            </div>
          </div>
        </div>
        <div className="text-center mt-3">
          <span
            className={`text-sm font-medium ${
              healthScore >= 80 ? "text-green-600" : healthScore >= 60 ? "text-yellow-600" : "text-red-600"
            }`}
          >
            {healthScore >= 80 ? "HEALTHY" : healthScore >= 60 ? "WARNING" : "CRITICAL"}
          </span>
          <p className="text-xs text-gray-400">{totalChecks} checks</p>
        </div>
      </div>

      {/* Critical */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-2">Critical</p>
        <p className="text-4xl font-bold text-red-500">{severityCounts.critical}</p>
        <p className="text-sm text-gray-500 mt-1">Immediate action required</p>
        <p className="text-xs text-green-600 mt-1">No critical issues</p>
      </div>

      {/* High */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <p className="text-xs font-medium text-orange-500 uppercase tracking-wide mb-2">High</p>
        <button
          onClick={onHighClick}
          className="text-4xl font-bold text-orange-500 hover:text-orange-600 cursor-pointer transition-colors"
          title="Click to view unused permissions"
        >
          {severityCounts.high}
        </button>
        <p className="text-sm text-gray-500 mt-1">Fix within 24 hours</p>
        <p className="text-xs text-orange-500 mt-2">Click to view details</p>
      </div>

      {/* Medium */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <p className="text-xs font-medium text-yellow-500 uppercase tracking-wide mb-2">Medium</p>
        <p className="text-4xl font-bold text-yellow-500">{severityCounts.medium}</p>
        <p className="text-sm text-gray-500 mt-1">Fix within 7 days</p>
        <p className="text-xs text-yellow-500 mt-2">-1 from last scan</p>
      </div>

      {/* Passing */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <p className="text-xs font-medium text-green-500 uppercase tracking-wide mb-2">Passing</p>
        <p className="text-4xl font-bold text-green-500">{severityCounts.passing}</p>
        <p className="text-sm text-gray-500 mt-1">All checks passed</p>
        <p className="text-xs text-green-500 mt-2">+5 from last scan</p>
      </div>
    </div>
  )
}
```

#### ה. `components/system-detail/gap-analysis-card.tsx`
```typescript
"use client"

import { Zap, AlertTriangle, RefreshCw } from "lucide-react"
import type { GapAnalysis } from "./types"

interface GapAnalysisCardProps {
  gapAnalysis: GapAnalysis
  loading: boolean
  error: string | null
  onRetry: () => void
}

export function GapAnalysisCard({ gapAnalysis, loading, error, onRetry }: GapAnalysisCardProps) {
  const actualPercent = gapAnalysis.allowed > 0 ? Math.round((gapAnalysis.actual / gapAnalysis.allowed) * 100) : 0

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">GAP Analysis</h3>
        </div>
        {error ? (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">Error</span>
        ) : (
          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
            {loading ? "Loading..." : `${gapAnalysis.confidence || 99}% confidence`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-600 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">Unable to load GAP Analysis</p>
          <p className="text-xs text-gray-500 mb-3">{error}</p>
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* ALLOWED Bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-500">ALLOWED (IAM Policies)</span>
              <span className="text-sm font-medium text-gray-600">{gapAnalysis.allowed} permissions</span>
            </div>
            <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gray-400 rounded-full" style={{ width: "100%" }}></div>
            </div>
          </div>

          {/* ACTUAL Bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium" style={{ color: "#8B5CF6" }}>
                ACTUAL (Used)
              </span>
              <span className="text-sm font-bold" style={{ color: "#8B5CF6" }}>
                {gapAnalysis.actual} permissions
              </span>
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${actualPercent}%`, backgroundColor: "#8B5CF6" }}
              ></div>
            </div>
          </div>

          {/* GAP Highlight */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-red-700">GAP (Attack Surface)</span>
              <span className="text-sm font-bold text-red-700">{gapAnalysis.gap} unused permissions</span>
            </div>
            <p className="text-xs text-red-600 mt-1">
              {gapAnalysis.gapPercent}% reduction possible by removing unused permissions
            </p>
          </div>
        </>
      )}
    </div>
  )
}
```

#### ו. `components/system-detail/index.tsx` (Main Component)
```typescript
"use client"

import { useState, useEffect, useCallback } from "react"
import { Server, Database, Shield, Network, MessageSquare, BarChart3, Cloud, Camera, History, Map } from "lucide-react"
import { CloudGraphTab } from "../cloud-graph-tab"
import { LeastPrivilegeTab } from "../least-privilege-tab"
import { DependencyMapTab } from "../dependency-map-tab"
import { AllServicesTab } from "../all-services-tab"
import { SimulateFixModal } from "../issues/simulate-fix-modal"
import { SecurityFindingsList } from "../issues/security-findings-list"
import { fetchSecurityFindings } from "@/lib/api-client"
import type { SecurityFinding } from "@/lib/types"

import { Header } from "./header"
import { TabsNavigation } from "./tabs-navigation"
import { StatsRow } from "./stats-row"
import { GapAnalysisCard } from "./gap-analysis-card"
import { OverviewTab } from "./overview-tab"
import type { SystemDetailDashboardProps } from "./types"

// ... (import all other components)

export function SystemDetailDashboard({ systemName, onBack }: SystemDetailDashboardProps) {
  // All state management from original file
  const [activeTab, setActiveTab] = useState("overview")
  // ... (all other state)

  // All useEffects and handlers from original file
  // ...

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "graph", label: "Graph", icon: Cloud },
    { id: "least-privilege", label: "Least Privilege", icon: Shield },
    { id: "dependency-map", label: "Dependency Map", icon: Map },
    { id: "all-services", label: "All Services", icon: Server },
    { id: "snapshots", label: "Snapshots", icon: Camera },
    { id: "timeline", label: "Timeline", icon: History },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        systemName={systemName}
        severityCounts={severityCounts}
        onBack={onBack}
        onTagAll={() => setShowTagModal(true)}
      />

      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <TabsNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </div>

      {activeTab === "overview" && (
        <OverviewTab
          healthScore={healthScore}
          severityCounts={severityCounts}
          totalChecks={totalChecks}
          gapAnalysis={gapAnalysis}
          loadingGap={loadingGap}
          gapError={gapError}
          onGapRetry={fetchGapAnalysis}
          onHighClick={() => setShowHighFindingsModal(true)}
          // ... (pass all other props)
        />
      )}

      {activeTab === "graph" && <CloudGraphTab systemName={systemName} />}
      {activeTab === "least-privilege" && <LeastPrivilegeTab systemName={systemName} />}
      {activeTab === "dependency-map" && <DependencyMapTab systemName={systemName} />}
      {activeTab === "all-services" && <AllServicesTab systemName={systemName} />}
      {/* ... other tabs */}

      {/* Modals */}
      {showTagModal && (
        <TagAllModal
          systemName={systemName}
          // ... (pass props)
          onClose={() => setShowTagModal(false)}
        />
      )}

      {/* ... other modals */}
    </div>
  )
}
```

### 4. עדכן את ה-imports ב-`components/system-detail-dashboard.tsx`
```typescript
// Just re-export from the new location
export { SystemDetailDashboard } from "./system-detail"
```

---

## ✅ צ'קליסט

- [ ] צור תיקייה `components/system-detail/`
- [ ] העתק את הקובץ המקורי ל-`system-detail-dashboard-OLD.tsx`
- [ ] צור את `types.ts` עם כל ה-types
- [ ] צור את `header.tsx`
- [ ] צור את `tabs-navigation.tsx`
- [ ] צור את `stats-row.tsx`
- [ ] צור את `gap-analysis-card.tsx`
- [ ] צור את `system-info-card.tsx`
- [ ] צור את `resource-types-card.tsx`
- [ ] צור את `auto-tag-card.tsx`
- [ ] צור את `compliance-card.tsx`
- [ ] צור את `critical-issues-section.tsx`
- [ ] צור את `overview-tab.tsx` (מכיל את כל הקומפוננטות לעיל)
- [ ] צור את `tag-all-modal.tsx`
- [ ] צור את `high-findings-modal.tsx`
- [ ] צור את `index.tsx` (הקומפוננטה הראשית)
- [ ] עדכן את `components/system-detail-dashboard.tsx` ל-re-export
- [ ] בדוק שהכל עובד
- [ ] Commit & Push

---

## 🚀 פקודות לביצוע

```bash
# 1. צור תיקייה
mkdir -p components/system-detail

# 2. גיבוי
cp components/system-detail-dashboard.tsx components/system-detail-dashboard-OLD.tsx

# 3. צור את הקבצים (עם Cursor)

# 4. בדוק
npm run build

# 5. Commit
git add .
git commit -m "Refactor: Split system-detail-dashboard into smaller components"
git push
```

---

## 💡 טיפים

1. התחל עם `types.ts` - זה יעזור לך להבין את כל ה-props
2. העתק קטעים מהקובץ המקורי לקומפוננטות החדשות
3. ודא שה-state management נשאר ב-`index.tsx` (הקומפוננטה הראשית)
4. השתמש ב-props drilling או Context API כדי להעביר state בין קומפוננטות
5. בדוק כל קומפוננטה בנפרד לפני שתחבר הכל יחד

---

**✅ מוכן להתחיל!** פשוט תעתיק את ההוראות ל-Cursor והוא יעזור לך לבנות את הכל! 🚀







