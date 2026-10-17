/**
 * The account inventory's type table covers EVERY resource_type the backend can serve -- the set captured by executing the
 * backend's own definitions (fixtures/account-inventory-types/resource-types.json, its _provenance) -- and never lets the
 * fuzzy service resolver decide a network type is an EC2 instance.
 */
import { describe, expect, it } from "vitest"
import captured from "@/__tests__/fixtures/account-inventory-types/resource-types.json"
import { INVENTORY_CATEGORY_LABEL, inventoryTypeMeta, knownInventoryType } from "@/lib/inventory-types"
import { SERVICE_TYPE_CONFIG, getServiceMeta } from "@/lib/service-type"

const served: string[] = [...captured.certified.map((c) => c.resource_type), ...captured.kubernetes]

describe("the inventory type table", () => {
  it("names every type the backend serves (30 certified + 18 Kubernetes kinds), each with a real descriptor", () => {
    expect(captured.certified).toHaveLength(30)
    expect(captured.kubernetes).toHaveLength(18)
    for (const type of served) {
      expect(knownInventoryType(type), type).toBe(true)
      const meta = inventoryTypeMeta(type)
      expect(meta.label, type).not.toBe(type)
      expect(meta.service.key, type).not.toBe("Resource")
      expect(INVENTORY_CATEGORY_LABEL[meta.category], type).toBeTruthy()
    }
  })

  it("puts each network type under its own service, where the fuzzy resolver reads them as EC2 instances", () => {
    const expected: Record<string, string> = {
      "ec2:subnet": "Subnet", "ec2:vpc": "VPC", "ec2:route-table": "RouteTable", "ec2:network-interface": "NetworkInterface",
      "ec2:internet-gateway": "InternetGateway", "ec2:nat-gateway": "NATGateway", "ec2:instance": "EC2",
    }
    for (const [type, key] of Object.entries(expected)) {
      expect(inventoryTypeMeta(type).service.key, type).toBe(key)
    }
    expect(getServiceMeta("ec2:subnet").key).toBe("EC2") // why the explicit table exists
    expect(inventoryTypeMeta("organizations:account-policy-context").service.key).toBe("Account")
  })

  it("counts resource-based policies under Identity & access and Kubernetes kinds under Compute", () => {
    expect(inventoryTypeMeta("kms:key-authorization")).toMatchObject({ category: "identity", label: "KMS key policies" })
    expect(inventoryTypeMeta("s3:bucket")).toMatchObject({ category: "data", label: "S3 buckets" })
    expect(inventoryTypeMeta("k8s:clusterrolebinding")).toMatchObject({
      category: "compute", label: "Kubernetes cluster role bindings",
    })
    expect(inventoryTypeMeta("k8s:clusterrolebinding").service).toBe(SERVICE_TYPE_CONFIG.Kubernetes)
  })

  it("shows a type it does not know by its own spelling, never as a guessed service", () => {
    expect(knownInventoryType("dynamodb:table")).toBe(false)
    expect(inventoryTypeMeta("dynamodb:table")).toMatchObject({ label: "dynamodb:table", category: "other" })
    expect(inventoryTypeMeta("dynamodb:table").service.key).toBe("Resource")
    expect(knownInventoryType("k8s:secret")).toBe(false)
  })
})
