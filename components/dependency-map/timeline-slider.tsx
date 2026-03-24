'use client';

import React, { useCallback, useRef, useState, useMemo } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';

interface TimelineSliderProps {
  currentWindow: '7d' | '30d' | '90d';
  onWindowChange: (window: '7d' | '30d' | '90d') => void;
  timePoint: number; // 0-100 percentage across the window
  onTimePointChange: (point: number) => void;
  events?: Array<{ timestamp: string; type: 'added' | 'removed'; name: string }>;
  isActive: boolean;
  onToggle: () => void;
}

const WINDOW_OPTIONS: Array<{ value: '7d' | '30d' | '90d'; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const WINDOW_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTimeLabels(window: '7d' | '30d' | '90d'): Array<{ pct: number; label: string }> {
  const days = WINDOW_DAYS[window];
  const now = new Date();
  const labelCount = window === '7d' ? 7 : 6;
  const labels: Array<{ pct: number; label: string }> = [];

  for (let i = 0; i <= labelCount; i++) {
    const pct = (i / labelCount) * 100;
    const daysAgo = days - (days * i) / labelCount;
    const date = new Date(now.getTime() - daysAgo * 86400000);
    labels.push({ pct, label: formatDate(date) });
  }

  return labels;
}

function getEventPosition(
  timestamp: string,
  window: '7d' | '30d' | '90d'
): number | null {
  const days = WINDOW_DAYS[window];
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  const eventDate = new Date(timestamp);

  if (eventDate < start || eventDate > now) return null;

  const totalMs = now.getTime() - start.getTime();
  const eventMs = eventDate.getTime() - start.getTime();
  return (eventMs / totalMs) * 100;
}

function getSelectedDate(timePoint: number, window: '7d' | '30d' | '90d'): string {
  const days = WINDOW_DAYS[window];
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  const selectedMs = start.getTime() + (timePoint / 100) * (now.getTime() - start.getTime());
  const selected = new Date(selectedMs);
  return selected.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function TimelineSlider({
  currentWindow,
  onWindowChange,
  timePoint,
  onTimePointChange,
  events = [],
  isActive,
  onToggle,
}: TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);

  const timeLabels = useMemo(() => getTimeLabels(currentWindow), [currentWindow]);

  const positionedEvents = useMemo(
    () =>
      events
        .map((event) => ({
          ...event,
          position: getEventPosition(event.timestamp, currentWindow),
        }))
        .filter((e): e is typeof e & { position: number } => e.position !== null),
    [events, currentWindow]
  );

  const clampPoint = useCallback((value: number) => Math.max(0, Math.min(100, value)), []);

  const getPointFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return timePoint;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      return clampPoint((x / rect.width) * 100);
    },
    [timePoint, clampPoint]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      onTimePointChange(getPointFromClientX(e.clientX));
    },
    [getPointFromClientX, onTimePointChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      onTimePointChange(getPointFromClientX(e.clientX));
    },
    [isDragging, getPointFromClientX, onTimePointChange]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const selectedDate = useMemo(
    () => getSelectedDate(timePoint, currentWindow),
    [timePoint, currentWindow]
  );

  // Collapsed state
  if (!isActive) {
    return (
      <div className="h-10 bg-slate-800/95 border-t border-slate-700 flex items-center px-4">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300
                     transition-all duration-200"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Time Travel</span>
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Expanded state
  return (
    <div className="h-[60px] bg-slate-800/95 border-t border-slate-700 flex items-center px-4 gap-3">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                   bg-emerald-500/20 text-emerald-400 shrink-0
                   transition-all duration-200"
      >
        <Clock className="w-3.5 h-3.5" />
        <span>Time Travel</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Window selector */}
      <div className="flex items-center gap-1 shrink-0">
        {WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onWindowChange(opt.value)}
            className={`
              px-2 py-1 rounded text-[10px] font-medium transition-all duration-150
              ${
                currentWindow === opt.value
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-700 text-slate-500 hover:text-slate-300'
              }
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="flex-1 min-w-0 relative h-10 select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Track line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-600 -translate-y-1/2 rounded-full" />

        {/* Time tick marks and labels */}
        {timeLabels.map((label, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
            style={{ left: `${label.pct}%`, transform: 'translateX(-50%)' }}
          >
            <div className="h-1.5 w-px bg-slate-500 mt-2.5" />
            <span className="text-[8px] text-slate-500 mt-0.5 whitespace-nowrap">
              {label.label}
            </span>
          </div>
        ))}

        {/* Event markers */}
        {positionedEvents.map((event, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group z-10"
            style={{ left: `${event.position}%` }}
            onMouseEnter={() => setHoveredEvent(event.name)}
            onMouseLeave={() => setHoveredEvent(null)}
          >
            <div
              className={`
                w-2 h-2 rotate-45 cursor-pointer
                ${event.type === 'added' ? 'bg-green-500' : 'bg-red-500'}
              `}
            />
            {hoveredEvent === event.name && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-1.5 py-0.5 bg-slate-900 border border-slate-600 rounded text-[8px] text-slate-200 whitespace-nowrap pointer-events-none z-20">
                <span
                  className={
                    event.type === 'added' ? 'text-green-400' : 'text-red-400'
                  }
                >
                  {event.type === 'added' ? '+' : '-'}
                </span>{' '}
                {event.name}
              </div>
            )}
          </div>
        ))}

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20"
          style={{ left: `${timePoint}%` }}
        >
          <div
            className={`
              w-4 h-4 rounded-full bg-emerald-500 border-2 border-emerald-800
              shadow-lg shadow-emerald-500/40
              ${isDragging ? 'cursor-grabbing scale-110' : 'cursor-grab'}
              transition-transform duration-75
            `}
          />
        </div>
      </div>

      {/* Selected date label */}
      <div className="shrink-0 text-right min-w-[80px]">
        <div className="text-[10px] text-slate-500">Selected</div>
        <div className="text-xs text-emerald-400 font-medium whitespace-nowrap">
          {selectedDate}
        </div>
      </div>
    </div>
  );
}
