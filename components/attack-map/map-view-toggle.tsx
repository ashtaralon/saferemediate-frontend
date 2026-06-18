"use client"

import type { MapViewVariant } from "@/lib/attack-map/use-map-view-variant"

export interface MapViewToggleProps {
  variant: MapViewVariant
  onChange: (v: MapViewVariant) => void
}

export function MapViewToggle({ variant, onChange }: MapViewToggleProps) {
  const btn = (v: MapViewVariant, label: string, testId: string) => (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={variant === v}
      onClick={() => onChange(v)}
      className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
        variant === v
          ? "bg-background text-foreground shadow-sm border border-border/60"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div
      className="flex items-center gap-2"
      data-testid="map-view-toggle"
      role="group"
      aria-label="Map view"
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground">
        Map view
      </span>
      <div className="flex rounded-lg border border-border bg-muted/50 p-0.5 shadow-inner">
        {btn("classic", "Classic", "map-view-classic")}
        {btn("target", "Grid", "map-view-target")}
        {btn("surface", "Surface", "map-view-surface")}
        {btn("aws", "AWS", "map-view-aws")}
      </div>
    </div>
  )
}
