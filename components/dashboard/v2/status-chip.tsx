import * as React from "react"
import { cn } from "@/lib/utils"

type Tone = "neutral" | "red" | "amber" | "blue" | "green"

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  red: "bg-red-50 text-red-700 border-red-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function StatusChip({ tone = "neutral", className, children, ...rest }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
