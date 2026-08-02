"use client"

/**
 * Executive | Operations — the two intentional views of Home.
 *
 * Replaces the "Security operations detail" accordion. That accordion was
 * never information architecture; it was temporary storage for cards that
 * had no destination, created when an earlier cut unmounted eleven of them
 * toward pages that did not exist and three ended up mounted NOWHERE.
 *
 * The switch resolves that without deleting anything: every operations card
 * keeps a home, mounted exactly once, and the CISO stops scrolling through
 * plane diagnostics to reach a decision. Dedicated Remediation / Evidence /
 * Activity sections can be built later and cards moved into them one at a
 * time — this view is retired only when its contents have real homes.
 */

export type DashboardView = "executive" | "operations"

export function isDashboardView(v: string | null | undefined): v is DashboardView {
  return v === "executive" || v === "operations"
}

const TABS: Array<{ id: DashboardView; label: string; hint: string }> = [
  {
    id: "executive",
    label: "Executive",
    hint: "Material risk, decisions, evidence confidence, outcomes",
  },
  {
    id: "operations",
    label: "Operations",
    hint: "Findings, evidence sources, LP diagnostics, activity",
  },
]

export function ViewSwitch({
  view,
  onChange,
}: {
  view: DashboardView
  onChange: (v: DashboardView) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
    >
      {TABS.map((t) => {
        const active = t.id === view
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            title={t.hint}
            onClick={() => onChange(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
