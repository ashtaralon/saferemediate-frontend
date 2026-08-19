"use client"

type Props = {
  adapter?: string | null
}

export function TerraformExecutionChip({ adapter }: Props) {
  const registered = adapter === "customer_pipeline"
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
      title={
        registered
          ? "This IAM policy is owned by a registered Terraform workspace. Remediation uses the customer pipeline."
          : "No Terraform ownership binding. Register the repo from Integrations → Terraform."
      }
      style={{
        background: registered ? "#10b98120" : "#64748b20",
        color: registered ? "#10b981" : "#94a3b8",
      }}
    >
      {registered ? "customer_pipeline" : "unregistered"}
    </span>
  )
}
