import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const source = fs.readFileSync(
  path.join(process.cwd(), "components/dependency-map/traffic-flow-map.tsx"),
  "utf8",
)

describe("Attack Map instance-profile details", () => {
  it("keeps instance profiles distinct from IAM roles in the details contract", () => {
    expect(source).toContain("| 'instance_profile'")
    expect(source).not.toContain("type: type === 'instance_profile' ? 'iam_role' : type")
    expect(source).toContain("type,")
  })

  it("uses the path-local EC2 to profile to role binding", () => {
    expect(source).toContain("if (serviceType === 'instance_profile')")
    expect(source).toContain("flow.instanceProfileId === service.id")
    expect(source).toContain("relationship: 'ATTACHED_FROM'")
    expect(source).toContain("relationship: 'BINDS_ROLE'")
  })

  it("renders an honest instance-profile label", () => {
    expect(source).toContain("serviceType === 'instance_profile' ? 'instance profile'")
  })
})
