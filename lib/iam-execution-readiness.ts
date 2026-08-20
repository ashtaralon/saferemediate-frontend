import type { SimulateFixSafety } from "@/lib/types"

export const ACK_SHORT_OBSERVATION_WINDOW = "short_observation_window"
export const ACK_TERRAFORM_DIRECT_APPLY = "terraform_ownership_direct_apply"

export type IamExecutionReadiness = {
  directAwsApplyAllowed: boolean
  directApplyOverridable: boolean
  adapterLabel: string
  headline: string
  detail: string
}

export type ProceedAnywayHold = {
  id: string
  label: string
}

export type ProceedAnywayContext = {
  reasons: string[]
  acknowledgedTags: string[]
  confirmations: ProceedAnywayHold[]
}

const PIPELINE_ADAPTERS = new Set(["customer_pipeline", "cyntro_managed_terraform"])

function bindingBlocksOverride(status: string | null | undefined): boolean {
  return status === "active" || status === "bound" || status === "registered"
}

export function iamExecutionReadiness(
  safety: Pick<
    SimulateFixSafety,
    "execution_adapter" | "execution_status" | "iac_binding_status" | "iac_managed"
  > | null | undefined,
): IamExecutionReadiness {
  const adapter = safety?.execution_adapter || "unknown"
  if (adapter === "aws_api" && safety?.iac_managed !== true) {
    return {
      directAwsApplyAllowed: true,
      directApplyOverridable: false,
      adapterLabel: "AWS API",
      headline: "Cyntro mutation worker",
      detail: "The mutation boundary will recheck the live AWS policy hash before applying.",
    }
  }
  if (adapter === "customer_pipeline") {
    return {
      directAwsApplyAllowed: false,
      directApplyOverridable: false,
      adapterLabel: "Customer Terraform pipeline",
      headline: safety?.execution_status === "artifact_required"
        ? "Terraform patch required"
        : "Customer pipeline",
      detail: "Cyntro will bind the exact repository after-document, validate the Terraform plan, then wait for apply, recollection, and Neptune verification.",
    }
  }
  if (adapter === "cyntro_managed_terraform") {
    return {
      directAwsApplyAllowed: false,
      directApplyOverridable: false,
      adapterLabel: "Cyntro-managed Terraform",
      headline: "Terraform worker required",
      detail: "This change must execute in an isolated Terraform worker, never through direct AWS apply in the browser.",
    }
  }
  const unregistered = safety?.iac_binding_status === "unregistered"
    || safety?.iac_binding_status === "unavailable"
    || !safety?.iac_binding_status
  return {
    directAwsApplyAllowed: false,
    directApplyOverridable: unregistered && !PIPELINE_ADAPTERS.has(adapter) && !bindingBlocksOverride(safety?.iac_binding_status),
    adapterLabel: "Terraform PR only",
    headline: "Ownership onboarding incomplete",
    detail: safety?.iac_binding_status === "unregistered"
      ? "Register the repository, workspace, resource address, state serial, and base commit before Cyntro can generate an exact PR. Preview remains available. You can proceed anyway through the AWS mutation path after confirming."
      : "Direct apply is unavailable until the execution adapter and Terraform ownership binding are complete and unambiguous. You can proceed anyway after confirming if ownership is not yet registered.",
  }
}

export function iamDataReadinessCopy(
  safety: Pick<
    SimulateFixSafety,
    "data_layer_complete" | "time_requirement_only" | "data_layer_gaps"
  >,
): { label: string; detail: string } {
  if (safety.data_layer_complete === true) {
    return safety.time_requirement_only
      ? { label: "Data layer complete", detail: "Only additional observation time is required." }
      : { label: "Data layer complete", detail: "Required telemetry sources and collector-run proof are present." }
  }
  const gaps = safety.data_layer_gaps || []
  return {
    label: "Data layer incomplete",
    detail: gaps.length
      ? `Missing or unhealthy: ${gaps.join(", ")}.`
      : "Cyntro cannot yet prove that all required telemetry and collector runs are present.",
  }
}

export function lpProceedAnywayHolds(
  safety: Pick<
    SimulateFixSafety,
    | "execution_adapter"
    | "execution_status"
    | "iac_binding_status"
    | "iac_managed"
    | "time_requirement_only"
    | "observation_days"
    | "unsafe_reasons"
  > | null | undefined,
): ProceedAnywayContext {
  const reasons: string[] = []
  const acknowledgedTags: string[] = []
  const confirmations: ProceedAnywayHold[] = []
  const observationReason = (safety?.unsafe_reasons ?? []).find((reason) =>
    /observation window/i.test(reason),
  )
  if (safety?.time_requirement_only || observationReason) {
    const days = safety?.observation_days
    reasons.push(
      observationReason
      || `Observation window ${days ?? "unknown"}d is below the mutation floor.`,
    )
    acknowledgedTags.push(ACK_SHORT_OBSERVATION_WINDOW)
    confirmations.push({
      id: ACK_SHORT_OBSERVATION_WINDOW,
      label: `I understand there ${typeof days === "number" ? `are only ${days} days` : "is less than the required window"} of observed usage and I still want to apply this change.`,
    })
  }

  const readiness = iamExecutionReadiness(safety)
  if (readiness.directApplyOverridable) {
    const tfReason = (safety?.unsafe_reasons ?? []).find((reason) =>
      /terraform/i.test(reason),
    )
    reasons.push(tfReason || readiness.detail)
    acknowledgedTags.push(ACK_TERRAFORM_DIRECT_APPLY)
    confirmations.push({
      id: ACK_TERRAFORM_DIRECT_APPLY,
      label: "I understand Terraform ownership is not fully registered. Apply will use the Cyntro AWS mutation path, not a Terraform PR.",
    })
  }

  return { reasons, acknowledgedTags, confirmations }
}
