# Sources (copied unchanged; do not edit)

**Label: synthetic closed-local.** These are not Neptune or customer data.

Actual HTTP responses of the registered `/api/resource-inventory/list` route with `envelope=true` at Semantic's
local backend candidate `64a258883afa0bd76a4fd1757d2bbf6820904b53` (branch
`decision-layer/m2-full-local-candidate`, never pushed).

Captured by Semantic's probe `test_semantic_s1_s3_slice_bodies.py` (sha256 851ffffa9e89c5a2f3e914de36df706bd11444002fab82efd21972470c8a0891), through the committed
hosted-principal suite's own `hosted` fixture:
- the REAL registered router;
- the REAL `install_auth_boundary` middleware;
- the composed Decision seam and its lifecycle authority.

Before each request the probe replaced the graph substitute with **family-shaped synthetic substitute rows**:
- two per certified alias (`fixture-substitute-*`);
- account `111122223333`, the canonical `resource_type` the real list Cypher filters on.

These bodies prove transport, status, typing, family aliases and field names per family, not real resource values.
The `uncertified-*` bodies are the route's own abstention for aliases outside `CERTIFIED_INVENTORY_TYPES`.
The refusal bodies come from the route's real refusal paths with substitute pointer or row changes (see the probe).

Run details:
- closed environment v2, label `fe-s1s3-bodies-64a25888-r4` (29 passed; the 24 bodies of the earlier r3 capture are byte-identical, r4 adds a ready-empty body for every certified family), verdict CREDENTIAL_FREE_AND_CLOSED;
- each file is `{http, graph_calls, legacy_runs, executes, lifecycle_reads, oidc_calls, substitute_rows, body}`;
- `age_seconds` is a wall-clock marker and `generated_at` is removed.

`s3-bridge-identity-contract.json` records the executed projection bridge key
(`cyntro_data.projection.neo4j.resource_manifest.legacy_endpoint_key`) for an S3 bucket fact. The one legacy
`S3Bucket` node that both the legacy system-resources route and the Decision list read is keyed by `name` = the
bucket name = the Decision item's `resource_id`.

`route-chain.ts` is test support for these bodies. It answers the backend socket with a captured body, and nothing
else is replaced.

sha256:

    09e64581cd3613b56f97318b2913a3db3104d4d1371967019d5b73e4ef935c74  list-503-no-deployment-scope-s3.json
    bff6193a9290f6ea6766033b5d20280ac43076ccf0583dfbae59364510f0a245  list-ready-ec2.json
    b5b10592b69a3bbd999b90e600aa942e815ba82168effefd59ae0d6264a28785  list-ready-empty-ec2.json
    2721d4176e72d57b9f0f43bec2feaff89635d8d95f8697a538cf8e6e769c6bd2  list-ready-empty-iam-policy.json
    5d4cdd4372a155d75be3540f8d320110f1c53818abf464adcfc271c028360e90  list-ready-empty-iam-role.json
    013ec59c591eae57336ce7235914e2a7c0991014461504c2e02819210bd56bc6  list-ready-empty-kms.json
    a3ee1078b101a2766a3162784314fc04433e837e9afe902f35f7a282a8be77a1  list-ready-empty-lambda.json
    a8da5e38e15f42416f2263d3714d44a9d641d0d0688988491253307a90d682d1  list-ready-empty-s3.json
    c55c95f80d18a7e162c7dc3a76e06ee38280317d6c486ae5eb4a3725e43ba45e  list-ready-empty-secret.json
    1bec1e7ab0881f09823e6c65c18dcbf04cf29ff9aeec47d5f51a25173d5fda61  list-ready-empty-sg.json
    b2d485b8d5b6ced5acedfbf57cd6c4bd80efe8d54f17adda6da8272e77219c7f  list-ready-iam-policy.json
    192531f6fe9a121a774d8cae49324aa276533c78ef54bc32093881a3b273f654  list-ready-iam-role.json
    830d69072bb6d56313b4829d754f8cfb3ab479149a29112bd24686f114fc2111  list-ready-kms.json
    cad8fbf248667a19a26e26c1ee7b26875b2176f74f292db2456f1bb08bc9d2fd  list-ready-lambda.json
    c5a3eefaa992a5cab00ddc91707d41cb9d8176d59749552f9a5632600622882e  list-ready-s3.json
    fefec8e3e529e26d3f485f85f2192782cbc312c133d9c0e9a6edeb844de1438a  list-ready-secret.json
    2c89b6561b11525e2138788bb9c41deb3f06310530d45550a45ee4603a6dacd1  list-ready-sg.json
    6b11d5e3162f082f5ce1fc9dbb3e134b632fb5fe0dec754788773fd6da26cc37  list-refused-count-mismatch-s3.json
    b742aac825f9023a0417feff01c55db762bc07d0677d3c4547ada362a92053f6  list-refused-forbidden-sg.json
    0584d307dcad672426a92cd7443827bfe50f91e3f337b7da36cfe9f8f17507e3  list-refused-null-stable-id-iam-role.json
    aa078dbe3238bcb7ed2f98969752e1abad68b82328208b84153bad17cc730ed3  list-refused-null-stable-id-s3.json
    7fb3ab4deefee02dfa70fad0dd39568be07c4f52d9c4275bd75a163fcf97799b  list-refused-null-stable-id-sg.json
    240462c650235cb234643563d56d9953ce71a9af6feffed436b606f76c7b21c4  list-refused-offboarded-s3.json
    5f135fc6f34d71ada92aecb020ce5d002b99a0ef5089a7a25e76e7173495bbef  list-refused-system-outside-scope-s3.json
    83066b0ee8f4790af18cd794f0fd686d119453f3d1297de76be0a00177cb68f6  list-uncertified-dynamodb.json
    c2a92a607d1f0917770322e1f1cf6c02ef45925ad5d307c538c07c1cc2e673b7  list-uncertified-rds.json
    6ccbd4e3eccb400cf361b987c62b80e83cf621a3194051abe18a74da48e9866a  list-uncertified-subnet.json
    11234dc6809e9cac73f09517d63a255aa801c908e9ad0a09585e76d17d15ddaa  list-uncertified-vpc.json
    6f4126f897834e328b7d7fa8fcb0ebbe682b9e0afc00163ec2fe198138bd9c60  s3-bridge-identity-contract.json
