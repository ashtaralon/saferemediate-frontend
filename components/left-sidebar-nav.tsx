"use client"

import Image from "next/image"
import Link from "next/link"
import { Home, AlertTriangle, Server, Grid3x3, Fingerprint, Plug, Zap, Split, Bug, Shield, Route, Sparkles, Tag } from "lucide-react"

interface LeftSidebarNavProps {
  activeItem?: string
  onItemClick?: (item: string) => void
  issuesCount?: number
  pendingTagsCount?: number
}

export function LeftSidebarNav({
  activeItem = "home",
  onItemClick,
  issuesCount = 0,
  pendingTagsCount = 0,
}: LeftSidebarNavProps) {
  // Every item now renders as a real Next.js <Link>. URL is the source of
  // truth for which section is active — that fixes:
  //   - Cmd/Ctrl-click → "Open in new tab" works (was broken: items were buttons)
  //   - Refresh keeps the user's place (was broken: refresh dropped to home)
  //   - Browser back/forward navigates between sections (was broken: URL never changed)
  //   - Sharing a deep link like /?section=attack-paths works
  //   - Screen readers announce items as navigation (was broken: announced as buttons)
  //
  // Items with their own dedicated route (e.g. PendingTags at /pending-tags)
  // keep that route. Everything else uses the section-switcher pattern via
  // ?section=<id> on the root route.
  const menuItems: Array<{
    id: string
    label: string
    icon: any
    count?: number
    href: string
  }> = [
    { id: "home", label: "Home", icon: Home, href: "/" },
    { id: "copilot", label: "Ask Copilot", icon: Sparkles, href: "/?section=copilot" },
    { id: "issues", label: "Issues", icon: AlertTriangle, count: issuesCount, href: "/?section=issues" },
    { id: "least-privilege", label: "Least Privilege", icon: Shield, href: "/?section=least-privilege" },
    { id: "attack-paths", label: "Attack Paths", icon: Route, href: "/?section=attack-paths" },
    { id: "vulnerabilities", label: "Vulnerabilities", icon: Bug, href: "/?section=vulnerabilities" },
    { id: "systems", label: "Systems", icon: Server, href: "/?section=systems" },
    { id: "compliance", label: "Compliance", icon: Grid3x3, href: "/?section=compliance" },
    { id: "identities", label: "Identities", icon: Fingerprint, href: "/?section=identities" },
    { id: "per-resource", label: "Shared Resource", icon: Split, href: "/?section=per-resource" },
    { id: "pending-tags", label: "Pending Tags", icon: Tag, count: pendingTagsCount, href: "/pending-tags" },
    { id: "automation", label: "Automation", icon: Zap, href: "/?section=automation" },
    { id: "integrations", label: "Integrations", icon: Plug, href: "/?section=integrations" },
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
        <div className="flex items-center gap-3">
          <Image
            src="/cyntro-logo.png"
            alt="CYNTRO Logo"
            width={36}
            height={36}
            className="rounded"
          />
          <h1
            className="text-xl font-bold"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            CYNTRO
          </h1>
        </div>
      </div>

      {/* Menu Items */}
      <nav className="py-4">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeItem === item.id

          const body = (
            <>
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>
              )}
              <Icon className="w-5 h-5 relative" />
              <span className="relative">{item.label}</span>
              {item.count ? (
                <span
                  className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.2)" : "rgba(37, 99, 235, 0.1)",
                    color: isActive ? "#ffffff" : "#2563eb",
                  }}
                >
                  {item.count}
                </span>
              ) : null}
            </>
          )

          const commonStyle = {
            background: isActive ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #6366f1 100%)" : "transparent",
            color: isActive ? "#ffffff" : "var(--text-secondary)",
            boxShadow: isActive ? "0 4px 12px -2px rgba(37, 99, 235, 0.3)" : undefined,
          }
          const commonClass = "relative w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all overflow-hidden"

          // All items now render as <Link>. onClick (when provided) still
          // fires before navigation so the parent can run any imperative
          // setup (e.g. clearing a search filter) — but URL update is
          // authoritative and cannot be skipped.
          return (
            <Link
              key={item.id}
              href={item.href}
              className={commonClass}
              style={commonStyle}
              onClick={onItemClick ? () => onItemClick(item.id) : undefined}
            >
              {body}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
