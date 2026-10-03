// SYNTHETIC TEST INPUT, copied from __tests__/coverage/source-coverage-panel.test.tsx. Not captured live evidence.
export const PUBLISHED = {
  tenant_id: "tenant-a",
  generated_at: "2026-10-01T12:00:00Z",
  read_model_generation: 42,
  status: "PUBLISHED",
  accounts: [
    {
      account_id: "111122223333",
      sources: [
        {
          source: "cloudtrail",
          region: "eu-west-1",
          source_scope: "organization",
          earliest_verified_at: "2026-09-28T10:00:00Z",
          earliest_verified_basis: "FIRST_SIGNED_DIGEST",
          source_began_at: null,
          source_began_basis: null,
          history_before: "UNKNOWN",
          first_verified_collection_at: "2026-09-28T10:05:00Z",
          verified_through: "2026-10-01T11:00:00Z",
          completed_windows: [
            { from: "2026-09-28T10:00:00Z", to: "2026-09-29T03:00:00Z" },
            { from: "2026-09-29T05:00:00Z", to: "2026-10-01T11:00:00Z" },
          ],
          gaps: [{ from: "2026-09-29T03:00:00Z", to: "2026-09-29T05:00:00Z", reason: "digest chain break" }],
          status: "PARTIAL",
        },
      ],
    },
    {
      account_id: "444455556666",
      sources: [
        {
          source: "vpc_flow_logs",
          region: "eu-west-1",
          source_scope: "vpc-0abc",
          earliest_verified_at: "2026-09-30T00:00:00Z",
          earliest_verified_basis: "FIRST_DELIVERED_OBJECT",
          source_began_at: "2026-09-30T00:00:00Z",
          source_began_basis: "FLOW_LOG_CREATED",
          history_before: "UNKNOWN",
          first_verified_collection_at: null,
          verified_through: "2026-10-01T10:00:00Z",
          completed_windows: [{ from: "2026-09-30T00:00:00Z", to: "2026-10-01T10:00:00Z" }],
          gaps: [],
          status: "VERIFIED",
        },
        {
          source: "aws_config",
          region: "eu-west-1",
          source_scope: null,
          earliest_verified_at: null,
          earliest_verified_basis: null,
          source_began_at: null,
          source_began_basis: null,
          history_before: "UNKNOWN",
          first_verified_collection_at: null,
          verified_through: null,
          completed_windows: [],
          gaps: [],
          status: "NOT_STARTED",
        },
      ],
    },
  ],
}

