// Auto-snapshot utility for safe remediation
// Creates a snapshot before any remediation action

export interface RemediationContext {
  triggeredBy: string
  remediationType: "IAM" | "SecurityGroup" | "S3" | "RDS" | "Other"
  targetResource: string
  action: string
  reason: string
  issueId?: string
  issueSeverity?: "critical" | "high" | "medium" | "low"
  confidence: number
}

export interface AutoSnapshot {
  id: string
  name: string
  date: string
  remediationContext: RemediationContext & { rollbackAvailable: boolean }
}

/**
 * Creates an automatic snapshot before remediation
 * Call this BEFORE performing any remediation action
 */
export async function createAutoSnapshot(
  systemName: string,
  context: RemediationContext
): Promise<{ success: boolean; snapshot?: AutoSnapshot; error?: string }> {
  try {
    const response = await fetch("/api/snapshots/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemName,
        remediationContext: {
          ...context,
          rollbackAvailable: true,
        },
      }),
    })

    const data = await response.json()

    if (data.success) {
      console.log("[AutoSnapshot] Created snapshot:", data.snapshot?.id)
      return {
        success: true,
        snapshot: data.snapshot,
      }
    }

    return {
      success: false,
      error: data.error || "Failed to create snapshot",
    }
  } catch (error: any) {
    console.error("[AutoSnapshot] Error:", error)
    return {
      success: false,
      error: error.message || "Failed to create snapshot",
    }
  }
}

/**
 * Performs rollback to a previous snapshot
 */
export async function rollbackToSnapshot(
  snapshotId: string,
  systemName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/snapshots/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapshotId,
        systemName,
      }),
    })

    const data = await response.json()
    return data
  } catch (error: any) {
    console.error("[Rollback] Error:", error)
    return {
      success: false,
      error: error.message || "Failed to rollback",
    }
  }
}

/**
 * Gets all available snapshots for rollback
 */
export async function getAvailableRollbacks(
  systemName: string
): Promise<AutoSnapshot[]> {
  try {
    const response = await fetch(`/api/snapshots/auto?systemName=${encodeURIComponent(systemName)}`)
    const data = await response.json()
    return data.snapshots || []
  } catch (error) {
    console.error("[Rollback] Error fetching snapshots:", error)
    return []
  }
}
