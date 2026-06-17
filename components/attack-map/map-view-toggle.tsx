"use client"

import type { MapViewVariant } from "@/lib/attack-map/use-map-view-variant"

export interface MapViewToggleProps {
  variant: MapViewVariant
  onChange: (v: MapViewVariant) => void
}

export function MapViewToggle({ variant, onChange }: MapViewToggleProps) {
  return (
    <div
      className="flex items-center gap-2"
      data-testid="map-view-toggle"
      role="group"
      aria-label="Map view"
    >
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        Map
      </span>
      <div className="flex rounded-lg border border-border bg-muted/50 p-0.5 shadow-inner">
        <button
          type="button"
          data-testid="map-view-classic"
          aria-pressed={variant === "classic"}
          onClick={() => onChange("classic")}
          className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
            variant === "classic"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Classic
        </button>
        <button
          type="button"
          data-testid="map-view-target"
          aria-pressed={variant === "target"}
          onClick={() => onChange("target")}
          className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
            variant === "target"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Grid
        </button>
        <button
          type="button"
          data-testid="map-view-aws"
          aria-pressed={variant === "aws"}
          onClick={() => onChange("aws")}
          className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
            variant === "aws"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          AWS
        </button>
      </div>
    </div>
  )
}
