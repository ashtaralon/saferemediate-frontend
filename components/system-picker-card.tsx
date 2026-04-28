"use client"

import { useEffect, useState } from "react"

interface SystemPickerCardProps {
  onSelect: (system: string) => void
}

/**
 * Inline system selector shown when the home/V2 dashboard has no system in
 * scope yet. Fetches /api/proxy/systems/available and renders a dropdown.
 * On selection, calls onSelect with the chosen system name; the parent route
 * decides whether to update local state, push a URL, etc.
 */
export function SystemPickerCard({ onSelect }: SystemPickerCardProps) {
  const [systems, setSystems] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/proxy/systems/available")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        // Backend may return string[] or Array<{name|system_name, ...}>.
        // Normalize defensively.
        const raw = Array.isArray(d?.systems) ? d.systems : []
        const names: string[] = raw
          .map((s: unknown) =>
            typeof s === "string"
              ? s
              : (s as { name?: string; system_name?: string })?.name ??
                (s as { system_name?: string })?.system_name ??
                ""
          )
          .filter((s: string) => Boolean(s))
        setSystems(names)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message ?? "Failed to load systems")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto mt-12 max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Choose a system</h2>
      <p className="mb-4 text-sm text-slate-600">
        Pick an AWS system to view its security dashboard.
      </p>

      {loading && (
        <div className="text-sm text-slate-500">Loading systems…</div>
      )}

      {!loading && error && (
        <div className="text-sm text-red-600">Failed to load: {error}</div>
      )}

      {!loading && !error && systems.length === 0 && (
        <div className="text-sm text-slate-500">
          No systems available.{" "}
          <button
            type="button"
            onClick={() => onSelect("alon-prod")}
            className="text-blue-600 underline"
          >
            Try alon-prod
          </button>
        </div>
      )}

      {!loading && !error && systems.length > 0 && (
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value)
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="" disabled>
            -- Select a system --
          </option>
          {systems.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
