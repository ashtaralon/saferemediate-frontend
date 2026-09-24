export const LP_MUTATION_APPLY_ENABLED = false
export const LP_RESTORE_ENABLED = false

export type HeldMutationState = {
  applyEnabled: false
  restoreEnabled: false
  recoveryProven: false
}

export function heldMutationState(): HeldMutationState {
  return {
    applyEnabled: LP_MUTATION_APPLY_ENABLED,
    restoreEnabled: LP_RESTORE_ENABLED,
    recoveryProven: false,
  }
}

export async function submitHeldLpApply(body: Record<string, unknown>) {
  if (!LP_MUTATION_APPLY_ENABLED) {
    return { ok: false, status: 503, code: "APPLY_HELD", cloud_writes: 0 }
  }
  const response = await fetch("/api/proxy/least-privilege/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}

export async function submitHeldLpRestore(operationId: string) {
  if (!LP_RESTORE_ENABLED) {
    return { ok: false, status: 503, code: "RESTORE_HELD", cloud_writes: 0 }
  }
  const response = await fetch("/api/proxy/least-privilege/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation_id: operationId }),
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}
