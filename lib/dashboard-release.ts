const ENABLED_VALUES = new Set(["true", "1", "yes"])

/** Dashboard V3 owns the configurable management report and is the default.
 * An explicit false-like value remains the no-deploy rollback switch. */
export function isDashboardV3Enabled(raw: string | undefined): boolean {
  return ENABLED_VALUES.has((raw ?? "true").trim().toLowerCase())
}

export const DASHBOARD_V3_ENABLED = isDashboardV3Enabled(
  process.env.NEXT_PUBLIC_DASHBOARD_V3,
)
