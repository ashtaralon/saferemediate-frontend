import {
  buildAttackerArchitecture,
  resourceSubtype,
} from "@/components/attack-paths-v2/build-attacker-architecture"

describe("resourceSubtype", () => {
  it("maps KMSKey to kms", () => {
    expect(resourceSubtype("KMSKey")).toBe("kms")
    expect(resourceSubtype("kms")).toBe("kms")
  })

  it("maps Secrets Manager types to secret", () => {
    expect(resourceSubtype("SecretsManagerSecret")).toBe("secret")
    expect(resourceSubtype("Secret")).toBe("secret")
  })

  it("keeps existing storage mappings", () => {
    expect(resourceSubtype("S3Bucket")).toBe("storage")
    expect(resourceSubtype("DynamoDBTable")).toBe("dynamodb")
    expect(resourceSubtype("RDSInstance")).toBe("database")
  })
})

describe("buildAttackerArchitecture", () => {
  it("keeps the selected RDS cluster clickable when canvas nodes omit the terminal", () => {
    const architecture = buildAttackerArchitecture(
      { nodes: [], laterals_by_node: {} } as any,
      {
        id: "path-rds",
        crown_jewel_id: "arn:aws:rds:eu-west-1:1:cluster:orders",
        nodes: [],
        edges: [],
        severity: { overall_score: 55 },
        path_kind: "identity",
        hop_count: 3,
      } as any,
      {
        id: "arn:aws:rds:eu-west-1:1:cluster:orders",
        name: "orders",
        type: "RDSCluster",
        severity: "HIGH",
        path_count: 1,
        highest_risk_score: 55,
        is_internet_exposed: false,
        data_classification: null,
        priority_score: 55,
      },
    )

    expect(architecture.resources).toEqual([
      expect.objectContaining({
        id: "arn:aws:rds:eu-west-1:1:cluster:orders",
        name: "orders",
        type: "database",
        isCrownJewel: true,
      }),
    ])
  })
})
