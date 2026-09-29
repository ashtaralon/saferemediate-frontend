"use client"

/**
 * Shows the serving generation the API actually returned.
 * A missing field stays blank. This component does not invent a version.
 */

const STATUS_LABEL: Record<string, string> = {
  populated: "Populated",
  empty: "Empty",
  not_recorded: "Not recorded",
  unavailable: "Unavailable",
}

export function semanticReadFields(payload: unknown): {
  status: string | null
  generation: string | null
} | null {
  if (!payload || typeof payload !== "object") return null
  const body = payload as Record<string, unknown>
  const status = typeof body.semantic_status === "string" ? body.semantic_status : null
  const generation = typeof body.graph_version === "string"
    ? body.graph_version
    : typeof body.source_generation === "string"
      ? body.source_generation
      : null
  if (!status && !generation) return null
  return { status, generation }
}

export function isSemanticHold(payload: unknown): boolean {
  const fields = semanticReadFields(payload)
  return fields?.status === "not_recorded" || fields?.status === "unavailable"
}

export function SemanticReadStatus({ payload }: { payload: unknown }) {
  const fields = semanticReadFields(payload)
  if (!fields) return null
  const label = fields.status ? (STATUS_LABEL[fields.status] ?? fields.status) : null
  return (
    <p className="text-[11px] text-slate-500" data-testid="semantic-read-status">
      {label ? <span data-testid="semantic-read-status-value">{label}</span> : null}
      {label && fields.generation ? " · " : null}
      {fields.generation ? (
        <span className="font-mono" data-testid="semantic-read-generation">{fields.generation}</span>
      ) : null}
    </p>
  )
}
