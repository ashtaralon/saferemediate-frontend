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
