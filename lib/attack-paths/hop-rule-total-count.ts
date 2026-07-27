import type { ConvergenceHop } from "@/lib/attack-paths/convergence-types"

/**
 * Read rule/permission total from a convergence hop when coverage allows.
 * NOT_COLLECTED / UNKNOWN → null (never invent 0).
 */
export function hopRuleTotalCount(hop: ConvergenceHop): number | null {
  const coverage = hop.rules_coverage ?? null
  if (coverage === "NOT_COLLECTED" || coverage === "UNKNOWN") {
    return null
  }

  if (typeof hop.rule_count === "number" && Number.isFinite(hop.rule_count)) {
    if (coverage === "COLLECTED" || coverage == null) {
      return hop.rule_count
    }
  }

  const anyHop = hop as ConvergenceHop & {
    total_rules?: unknown
    properties?: Record<string, unknown> | null
  }
  const props = hop.key_properties || anyHop.properties || null
  const raw =
    (typeof anyHop.total_rules === "number" ? anyHop.total_rules : null) ??
    (props && typeof props.total_rules === "number" ? props.total_rules : null) ??
    (props && typeof props.allowed_actions_count === "number"
      ? props.allowed_actions_count
      : null)
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null
}
