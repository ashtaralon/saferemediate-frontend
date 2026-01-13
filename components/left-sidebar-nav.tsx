"use client"

import { Home, AlertTriangle, Server, Grid3x3, Key, Plug, Zap, GitBranch } from "lucide-react"

interface LeftSidebarNavProps {
  activeItem?: string
  onItemClick?: (item: string) => void
  issuesCount?: number
}

export function LeftSidebarNav({ activeItem = "home", onItemClick, issuesCount = 0 }: LeftSidebarNavProps) {
  const menuItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "flows", label: "Flows", icon: GitBranch },
    { id: "issues", label: "Issues", icon: AlertTriangle, count: issuesCount },
    { id: "systems", label: "Systems", icon: Server },
    { id: "compliance", label: "Compliance", icon: Grid3x3 },
    { id: "identities", label: "Identities", icon: Key },
    { id: "automation", label: "Automation", icon: Zap },
    { id: "integrations", label: "Integrations", icon: Plug },
  ]

  return (
    <div
      className="w-64 min-h-screen border-r"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="px-6 py-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-lg flex items-center justify-center text-xl overflow-hidden bg-gradient-blue">
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none"></div>
            🛡️
          </div>
          <h1 className="text-xl font-bold text-gradient-blue">ImpactIQ</h1>
        </div>
      </div>

      {/* Menu Items */}
      <nav className="py-4">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeItem === item.id

          return (
            <button
              key={item.id}
              onClick={() => onItemClick?.(item.id)}
              className="relative w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all overflow-hidden"
              style={{
                background: isActive ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #6366f1 100%)" : "transparent",
                color: isActive ? "#ffffff" : "var(--text-secondary)",
                boxShadow: isActive ? "0 4px 12px -2px rgba(37, 99, 235, 0.3)" : undefined,
              }}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>
              )}
              <Icon className="w-5 h-5 relative" />
              <span className="relative">{item.label}</span>
              {item.count && (
                <span
                  className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.2)" : "rgba(37, 99, 235, 0.1)",
                    color: isActive ? "#ffffff" : "#2563eb",
                  }}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
