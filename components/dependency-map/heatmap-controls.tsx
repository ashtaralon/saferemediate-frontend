'use client';

import React from 'react';
import { Flame, Square, Layers } from 'lucide-react';

interface HeatmapControlsProps {
  heatmapMode: boolean;
  onToggleHeatmap: () => void;
  selectedNodeId: string | null;
  hopDepth: number;
  onHopDepthChange: (depth: number) => void;
  showVPCBoundaries: boolean;
  onToggleVPC: () => void;
}

export function HeatmapControls({
  heatmapMode,
  onToggleHeatmap,
  selectedNodeId,
  hopDepth,
  onHopDepthChange,
  showVPCBoundaries,
  onToggleVPC,
}: HeatmapControlsProps) {
  const showDepthSlider = heatmapMode && selectedNodeId !== null;

  return (
    <div className="flex items-center gap-2">
      {/* Heatmap toggle */}
      <button
        onClick={onToggleHeatmap}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          transition-all duration-200
          ${
            heatmapMode
              ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.3)]'
              : 'bg-muted text-foreground hover:bg-accent border border-border'
          }
        `}
        title="Toggle heatmap mode"
      >
        <Flame className="w-3.5 h-3.5" />
        <span>Heatmap</span>
      </button>

      {/* VPC Boundaries toggle */}
      <button
        onClick={onToggleVPC}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          transition-all duration-200
          ${
            showVPCBoundaries
              ? 'bg-green-500/20 text-green-600 dark:text-green-400'
              : 'bg-muted text-foreground hover:bg-accent border border-border'
          }
        `}
        title="Toggle VPC boundaries"
      >
        <Square className="w-3.5 h-3.5" />
        <span>VPC</span>
      </button>

      {/* Dependency depth slider */}
      {showDepthSlider && (
        <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <label className="text-[10px] text-muted-foreground whitespace-nowrap">
            Depth: <span className="text-orange-600 dark:text-orange-400 font-semibold">{hopDepth}</span>{' '}
            {hopDepth === 1 ? 'hop' : 'hops'}
          </label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={hopDepth}
            onChange={(e) => onHopDepthChange(Number(e.target.value))}
            className="w-20 h-1 accent-orange-500 cursor-pointer"
          />
        </div>
      )}

      {/* Heatmap legend - Risk-based */}
      {heatmapMode && (
        <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
          <span className="text-[9px] text-green-600 dark:text-green-400">Safe</span>
          <div
            className="w-16 h-2 rounded-full"
            style={{
              background:
                'linear-gradient(to right, #22c55e, #84cc16, #eab308, #f97316, #ef4444)',
            }}
          />
          <span className="text-[9px] text-red-600 dark:text-red-400">Critical</span>
        </div>
      )}
    </div>
  );
}
