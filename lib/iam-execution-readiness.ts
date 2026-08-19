import type { SimulateFixSafety } from "@/lib/types"

export type IamExecutionReadiness = {
  directAwsApplyAllowed: boolean
  adapterLabel: string
  headline: string
  detail: string
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
      adapterLabel: "AWS API",
      headline: "Cyntro mutation worker",
      detail: "The mutation boundary will recheck the live AWS policy hash before applying.",
    }
  }
  if (adapter === "customer_pipeline") {
    return {
      directAwsApplyAllowed: false,
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
      adapterLabel: "Cyntro-managed Terraform",
      headline: "Terraform worker required",
      detail: "This change must execute in an isolated Terraform worker, never through direct AWS apply in the browser.",
    }
  }
  return {
    directAwsApplyAllowed: false,
    adapterLabel: "Terraform PR only",
    headline: "Ownership onboarding incomplete",
    detail: safety?.iac_binding_status === "unregistered"
      ? "Register the repository, workspace, resource address, state serial, and base commit before Cyntro can generate an exact PR. Preview remains available."
      : "Direct apply is unavailable until the execution adapter and Terraform ownership binding are complete and unambiguous.",
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
