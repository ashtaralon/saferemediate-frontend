import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const modalSource = readFileSync(
  join(process.cwd(), "components/iam-permission-analysis-modal.tsx"),
  "utf8",
)
const sharedRolesSource = readFileSync(
  join(process.cwd(), "components/iam-shared-roles-list-view.tsx"),
  "utf8",
)

describe("shared IAM role approval handoff", () => {
  it("links the signed simulation to a system-scoped shared-role view", () => {
    expect(modalSource).toContain("system_name=${encodeURIComponent(systemName)}")
    expect(modalSource).toContain("role_ref=${encodeURIComponent(")
    expect(modalSource).toContain("Open Shared Resources")
    expect(sharedRolesSource).toContain('searchParams.get("system_name")')
    expect(sharedRolesSource).toContain('searchParams.get("role_ref")')
    expect(sharedRolesSource).toContain('data-testid={focused ? "focused-shared-role" : undefined}')
  })

  it("shows the impacted consumers returned by the canonical simulation", () => {
    expect(modalSource).toContain('data-testid="shared-role-impact"')
    expect(modalSource).toContain("safetyContext.shared_resource.consumers.map")
    expect(modalSource).toContain("Approval is required for")
  })
})
