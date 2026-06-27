"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Home, AlertTriangle, Server, Grid3x3, Fingerprint, Plug, Zap, Split, Bug, Shield, Route, Sparkles, Tag, Trash2, Users, Network, Map } from "lucide-react"
// ThemeToggle import held until dark-mode migration lands:
// import { ThemeToggle } from "@/components/theme-toggle"

interface LeftSidebarNavProps {
  activeItem?: string
  onItemClick?: (item: string) => void
  issuesCount?: number
  pendingTagsCount?: number
}

/** Live narrowing-available count across both shared-resource endpoints.
 *  Per docs/shared-resources-real-data-wiring.md §4 (backend repo):
 *  N = SUM(headline_state === "narrowing_available") across
 *  /api/iam/shared-roles + /api/sg/shared-sgs. Renders 4 today on
 *  alon-prod (3 IAM + 1 SG, empirically verified 2026-06-01). Honest
 *  small number per the spec's substrate-honesty contract. */
function useSharedResourcesActionableCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [iamRes, sgRes] = await Promise.all([
          fetch("/api/proxy/iam/shared-roles?system_name=alon-prod", { cache: "no-store" }),
          fetch("/api/proxy/sg/shared-sgs?system_name=alon-prod", { cache: "no-store" }),
        ])
        if (cancelled) return
        const iamJson = iamRes.ok ? await iamRes.json() : {}
        const sgJson = sgRes.ok ? await sgRes.json() : {}
        const iamRows: Array<{ headline_state?: string }> =
          iamJson.shared_roles ?? iamJson.roles ?? []
        const sgRows: Array<{ narrowing?: { headline_state?: string } }> =
          sgJson.shared_sgs ?? sgJson.sgs ?? []
        const iamNarrowable = iamRows.filter(
          (r) => r.headline_state === "narrowing_available",
        ).length
        const sgNarrowable = sgRows.filter(
          (r) => r.narrowing?.headline_state === "narrowing_available",
        ).length
        if (!cancelled) setCount(iamNarrowable + sgNarrowable)
      } catch {
        // Honest fallback per pattern_no_phantom_capabilities_in_ui —
        // don't fabricate a count if the endpoints fail; leave null,
        // sidebar renders the label without a number.
        if (!cancelled) setCount(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return count
}

export function LeftSidebarNav({
  activeItem = "home",
  onItemClick,
  issuesCount = 0,
  pendingTagsCount = 0,
}: LeftSidebarNavProps) {
  const sharedResourcesCount = useSharedResourcesActionableCount()
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
    { id: "least-privilege", label: "Resource Risk", icon: Shield, href: "/?section=least-privilege" },
    { id: "attack-paths", label: "Attack Paths", icon: Route, href: "/?section=attack-paths" },
    // v2 redesign — coexists with the legacy section above. Operators
    // can toggle while the redesign is being reviewed. Drop the legacy
    // entry once v2 is approved as canonical.
    // 2026-05-30 — removed hardcoded "?system=alon-prod" default. The
    // page handles missing system param by showing the system picker;
    // operators on any customer reach a working state without us
    // pre-selecting a demo system that doesn't exist on their tenant.
    { id: "attack-paths-v2", label: "Attack Paths v2", icon: Route, href: "/attack-paths-v2" },
    // Attacker Map is reachable from inside system detail: Risk → Attacker Map.
    // The top-level sidebar entry was removed because the page routing in
    // app/page.tsx can't hold (selectedSystem, activeSection!=="home") at
    // the same time — see system-detail-dashboard.tsx tab integration.
    { id: "vulnerabilities", label: "Vulnerabilities", icon: Bug, href: "/?section=vulnerabilities" },
    { id: "systems", label: "Systems", icon: Server, href: "/?section=systems" },
    { id: "compliance", label: "Compliance", icon: Grid3x3, href: "/?section=compliance" },
    // Identities removed from sidebar pending backend fix for /api/identities (returns
    // 404 with a 23KB HTML error body). Restore once backend ships the upstream route —
    // there's no graceful empty-state in the identities section today, so the link
    // would show a broken page to a CISO.
    // { id: "identities", label: "Identities", icon: Fingerprint, href: "/?section=identities" },
    // 2026-06-02: Slice 0 IA cleanup re-applied per operator direction.
    // Empirical verification on alon-prod found:
    //   • Legacy /?section=per-resource page calls /api/scan, which
    //     returns 4 SGs and zero IAM roles — phantom-incapability per
    //     pattern_no_phantom_capabilities_in_ui inversion direction.
    //   • Legacy /iam/shared-roles and /sg/shared-sgs are subsumed by
    //     the new /shared-resources merged list view (PR #101) which
    //     uses /api/iam/shared-roles + /api/sg/shared-sgs and renders
    //     real KEEP / NARROW AWAY / INVESTIGATE breakdowns.
    // The three legacy URLs redirect to /shared-resources via
    // next.config.js redirects(), so bookmarks and existing back-links
    // (detail-view "back to list" buttons) land on the working page.
    // Detail routes /iam/shared-roles/by-plan/[plan_id] and
    // /sg/shared-sgs/by-plan/[plan_id] are NOT redirected — they're
    // useful deep-links to plan-specific narrowing proposals.
    // 2026-06-02 (revised): both surfaces kept. Per operator direction —
    // the legacy light per-resource scanner is the canonical day-to-day
    // view; the dark merged-list view is alongside as "V2". Both reachable
    // from the sidebar. The next.config.js redirect that pushed
    // /?section=per-resource → /shared-resources is removed in this commit.
    { id: "per-resource", label: "Shared Resource", icon: Split, href: "/?section=per-resource" },
    { id: "shared-resources", label: "Shared Resources V2", icon: Split, count: sharedResourcesCount ?? undefined, href: "/shared-resources" },
    // Naming aligned with feedback_topology_views_naming (memory) and the page
    // header GraphViewV2 renders. "Dependency Map" was the original sidebar
    // label in PR #72 but it was a fourth name for the same surface — the
    // component, the page header, and the team's shared vocabulary all use
    // "Observed-First Map". Renamed here to stop the drift before it spreads.
    // The route id stays "dependency-map" for URL stability (it's the route
    // path); only the operator-facing label changes.
    { id: "dependency-map", label: "Observed-First Map", icon: Map, href: "/dependency-map?system=alon-prod" },
    { id: "network-lp", label: "Network LP", icon: Network, href: "/network-lp" },
    { id: "pending-tags", label: "Pending Tags", icon: Tag, count: pendingTagsCount, href: "/pending-tags" },
    { id: "orphan-resources", label: "Orphan Resources", icon: Trash2, href: "/orphan-resources" },
    { id: "automation", label: "Automation", icon: Zap, href: "/?section=automation" },
    { id: "integrations", label: "Integrations", icon: Plug, href: "/?section=integrations" },
  ]

  return (
    // relative + z-30 creates a stacking context above the page body so
    // sidebar Links always receive clicks. User reported "stuck on
    // Attack Paths" — couldn't click sidebar to leave. The Attack Paths
    // page renders a full-height container (h-[calc(100vh-4rem)]) with
    // heavy graph viz; if any descendant creates a new stacking context
    // that overlaps the sidebar visually, clicks could land on the
    // overlay instead of the sidebar Link. relative z-30 forces the
    // sidebar's stacking context to win without disturbing layout.
    <div
      className="w-64 min-h-screen border-r relative z-30"
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
          {/* ThemeToggle is held until the dark-mode color migration lands —
              import kept so it's a one-line re-enable. */}
        </div>
      </div>

      {/* Menu Items */}
      <nav className="py-4">
        {/* Topology v0.2 — Triage is still a static mockup (italics), Estate
            has shipped into the live React route /topology/v0.2-estate
            (non-italic, links via Next.js client navigation). */}
        <a
          href="/design/topology-v0.2.html"
          target="_blank"
          rel="noopener noreferrer"
          className="relative w-full flex items-center gap-3 px-6 py-2 text-sm transition-all overflow-hidden"
          style={{
            color: "var(--text-secondary)",
            fontStyle: "italic",
          }}
        >
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: "#00C2A8" }} />
          <span className="whitespace-nowrap">Topology · Triage</span>
          <span
            className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase shrink-0"
            style={{
              background: "rgba(0, 194, 168, 0.15)",
              color: "#00C2A8",
            }}
          >
            v0.2
          </span>
        </a>
        <Link
          href="/topology/v0.2-estate"
          className="relative w-full flex items-center gap-3 px-6 py-2 text-sm transition-all overflow-hidden border-b mb-2"
          style={{
            color: "var(--text-secondary)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: "#00C2A8" }} />
          <span className="whitespace-nowrap">Topology · Estate</span>
          <span
            className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase shrink-0"
            style={{
              background: "rgba(0, 194, 168, 0.15)",
              color: "#00C2A8",
            }}
          >
            v0.2
          </span>
        </Link>

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

          // EMERGENCY ROLLBACK (2026-04-30): user reported being stuck
          // on the Attack Paths tab — could not click sidebar items to
          // navigate elsewhere. Reverted to the original <button onClick>
          // pattern. Sidebar clicks call onItemClick(id) → setActiveSection
          // in app/page.tsx → React state-driven render swap. No router
          // involvement, so no Next.js routing race condition.
          //
          // The discriminator for button-vs-Link: items that map to a
          // sidebar SECTION (managed by activeSection state) render as
          // buttons. Items with their own dedicated Next.js page route
          // (e.g. pending-tags at /pending-tags) render as Links.
          //
          // First version of this revert checked `href.startsWith("/?")`,
          // but Home had `href: "/"` which doesn't match — so Home fell
          // through to the <Link> branch and the URL changed but
          // activeSection didn't update. Now using an explicit set of
          // dedicated-route ids so additions in either direction are
          // unambiguous.
          // shared-roles + shared-sgs removed 2026-06-02 — their sidebar
          // entries were cut and the legacy URLs redirect to
          // /shared-resources via next.config.js.
          const DEDICATED_ROUTE_IDS = new Set(["pending-tags", "orphan-resources", "attack-paths-v2", "dependency-map", "shared-resources", "network-lp"])
          if (!DEDICATED_ROUTE_IDS.has(item.id)) {
            return (
              <button
                key={item.id}
                onClick={() => onItemClick?.(item.id)}
                className={commonClass}
                style={commonStyle}
              >
                {body}
              </button>
            )
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              className={commonClass}
              style={commonStyle}
            >
              {body}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
