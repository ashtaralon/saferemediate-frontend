import { resourceSubtype } from "@/components/attack-paths-v2/build-attacker-architecture"

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
