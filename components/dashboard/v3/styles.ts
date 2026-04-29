/**
 * V3 dashboard design tokens.
 *
 * Locked in `project_dashboard_v3_design_language.md`:
 *   - Editorial typography: tiny uppercase label → optional descriptor →
 *     big bold number → small unit → trend delta → muted top-driver line.
 *   - Muted palette (slate / sage / soft red / cool indigo).
 *   - Low icon density. The number is the protagonist.
 */

export const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"

export const descriptorClass = "text-[12px] text-slate-500"

export const heroNumberClass =
  "text-[44px] font-bold leading-none tracking-tight text-slate-900"

export const numberClass =
  "text-[32px] font-bold leading-none tracking-tight text-slate-900"

export const unitClass = "text-sm font-medium text-slate-400"

export const trendUpGood = "text-emerald-600"
export const trendDownGood = "text-emerald-600"
export const trendUpBad = "text-rose-600"
export const trendDownBad = "text-rose-600"
export const trendNeutral = "text-slate-500"

export const sectionClass =
  "rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"

export const dottedNotWiredClass =
  "rounded-[14px] border border-dashed border-slate-300 bg-slate-50 p-5"

/**
 * Category accent — applied as a 3px left border on a Section.
 * Use sparingly; one per card max. Provides visual rhythm without
 * crossing into decoration.
 */
export const accentByCategory: Record<
  "brss" | "bloat" | "permissions" | "network" | "data" | "evidence" | "activity" | "queue",
  string
> = {
  brss: "border-l-[3px] border-l-indigo-500",
  bloat: "border-l-[3px] border-l-amber-500",
  permissions: "border-l-[3px] border-l-violet-500",
  network: "border-l-[3px] border-l-blue-500",
  data: "border-l-[3px] border-l-teal-500",
  evidence: "border-l-[3px] border-l-slate-400",
  activity: "border-l-[3px] border-l-emerald-500",
  queue: "border-l-[3px] border-l-emerald-500",
}

/**
 * Tinted score pill — wraps a score number in a subtle colored
 * background per tier. Reads at-a-glance better than text-only.
 */
export function scorePillClass(score: number): string {
  if (score >= 75) return "rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700"
  if (score >= 50) return "rounded-md bg-amber-50 px-2 py-0.5 text-amber-700"
  if (score > 0) return "rounded-md bg-rose-50 px-2 py-0.5 text-rose-700"
  return "rounded-md bg-slate-100 px-2 py-0.5 text-slate-500"
}

/**
 * Status dot — fixed-size colored circle. Used in Recent Activity
 * timeline and Evidence Health source rows.
 */
export const statusDotClass =
  "inline-block h-2 w-2 rounded-full shrink-0"

export const dotEmerald = "bg-emerald-500"
export const dotAmber = "bg-amber-500"
export const dotRose = "bg-rose-500"
export const dotSlate = "bg-slate-300"

/**
 * Score → color band.
 * 0-49 = rose, 50-74 = amber, 75-100 = emerald.
 * Deliberately muted variants — never bright.
 */
export function scoreToneClass(score: number): string {
  if (score >= 75) return "text-emerald-700"
  if (score >= 50) return "text-amber-700"
  if (score > 0) return "text-rose-600"
  return "text-slate-400"
}

/**
 * Semantic delta arrow rule — green = improvement regardless of arrow direction.
 *   - lowerIsBetter=true: down arrow + delta < 0 → green
 *   - lowerIsBetter=false: up arrow + delta > 0 → green
 */
export function deltaTone(delta: number, lowerIsBetter: boolean): string {
  if (delta === 0) return trendNeutral
  const isImprovement = lowerIsBetter ? delta < 0 : delta > 0
  return isImprovement ? "text-emerald-600" : "text-rose-600"
}
