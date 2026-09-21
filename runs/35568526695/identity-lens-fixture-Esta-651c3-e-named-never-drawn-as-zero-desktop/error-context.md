# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: identity-lens-fixture.spec.ts >> Estate · Identity & access lens >> absent relationship families are named, never drawn as zero
- Location: tests/integration/identity-lens-fixture.spec.ts:76:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 7
Received: 0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]: Scope
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e11]: Organization
      - combobox "Organization" [ref=e12]:
        - option "cyntro-dev" [selected]
    - generic [ref=e13]:
      - img [ref=e14]
      - generic [ref=e18]: Group
      - combobox "Group" [ref=e19]:
        - option "All account groups" [selected]
    - generic [ref=e20]:
      - img [ref=e21]
      - generic [ref=e23]: Account
      - combobox "Account" [ref=e24]:
        - option "All accounts" [selected]
        - option "ashtaralon · 745783559495"
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e31]: Region
      - combobox "Region" [ref=e32]:
        - option "All regions" [selected]
        - option "eu-west-1"
        - option "global"
        - option "us-east-1"
    - generic [ref=e34]: 1 account in view
  - generic [ref=e35]:
    - banner [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Estate · Topology v0.2 · alon-prod
          - generic [ref=e40]: SafeRemediate-Test-Frontend-1 is LATENT_EXPOSURE — inbound path open, unused (zero public inbound in 365 days). Observed egress to 566 external destinations (365d).
          - generic [ref=e41]: scored 2026-07-09T11:36:31Z · 4 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0329e985173bed24f
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: Evidence computed Jul 9, 2026, 11:36 AM
            - generic [ref=e46]: Live graph
          - button "System stats" [ref=e47]
    - generic [ref=e48]:
      - generic [ref=e49]: Region scope
      - combobox "Region scope" [ref=e50]:
        - option "eu-west-1" [selected]
        - option "global"
        - option "us-east-1"
    - generic [ref=e51]:
      - generic [ref=e52]: VPC scope
      - combobox "VPC scope" [ref=e53]:
        - option "All VPCs · Compare"
        - option "alon-prod-vpc · vpc-0329e985173bed24f (6 workloads)" [selected]
        - option "vpc-086bcc2186fa42c96 · vpc-086bcc2186fa42c96 (8 workloads)"
      - generic [ref=e54]: Subnet-linked compute in tier cells; regional/serverless on the right rail.
    - generic [ref=e55]:
      - generic [ref=e56]: Availability zones
      - button "eu-west-1a" [pressed] [ref=e57]
      - button "eu-west-1b" [pressed] [ref=e58]
    - generic [ref=e59]:
      - generic "EC2 / RDS / LoadBalancer in the selected VPC" [ref=e60]: In this VPC
      - button "EC2 (3)" [pressed] [ref=e61]
      - button "RDS (1)" [pressed] [ref=e62]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e63]: System-wide
      - button "Lambda (16)" [pressed] [ref=e64]
      - button "S3 (10)" [pressed] [ref=e65]
      - button "DynamoDB (8)" [pressed] [ref=e66]
      - button "Show all" [ref=e67]
      - button "Clear all" [ref=e68]
    - generic [ref=e69]:
      - main [ref=e70]:
        - tablist "Estate view" [ref=e72]:
          - tab "Command map" [ref=e73]
          - tab "Network topology" [ref=e74]
          - tab "Identity & access" [selected] [ref=e75]
        - generic [ref=e78]:
          - generic [ref=e80]:
            - img [ref=e81]
            - generic [ref=e84]:
              - heading "1 role bound to workloads in this scope." [level=2] [ref=e85]
              - paragraph [ref=e86]: Read from the active canonical inventory generation, joined to the hash-verified decision authority (generation 12).
              - generic [ref=e87]:
                - generic [ref=e88]: estate-identity-access/v1
                - generic [ref=e89]: status ready
              - generic [ref=e91]:
                - generic [ref=e92]: system_name ✓ alon-prod
                - generic [ref=e93]: account_id ✓ 745783559495
                - generic [ref=e94]: region ✓ eu-west-1
                - generic [ref=e95]: vpc_id ✓ vpc-0329e985173bed24f
                - generic [ref=e96]: customer_id (echoed, not checked) testbed-webshop
          - generic [ref=e97]:
            - generic [ref=e98]:
              - heading "Workload → role → decision" [level=3] [ref=e99]
              - generic [ref=e101]: 1 shown of 1
            - generic [ref=e103]:
              - generic [ref=e104]:
                - group "Relationship plane" [ref=e105]:
                  - button "All" [pressed] [ref=e106]
                  - button "Configured" [ref=e107]
                  - button "Observed" [ref=e108]
                - generic [ref=e109]:
                  - button "Zoom out" [ref=e110]: −
                  - generic [ref=e111]: 100%
                  - button "Zoom in" [ref=e112]: +
                  - button "Fit" [ref=e113]
              - figure "configured — a policy or inventory fact, never observed, never moves observed — evidence read from a named decision generation" [ref=e114]:
                - 'img "Identity map: 3 nodes and 2 directional edges, workload to role to decision authority." [ref=e117]':
                  - generic [ref=e118]: WORKLOAD
                  - generic [ref=e119]: IAM ROLE
                  - generic [ref=e120]: DECISION AUTHORITY
                  - generic [ref=e122]: configured
                  - generic [ref=e124]: observed
                  - 'generic "Workload: i-web — runs as" [ref=e125]':
                    - generic [ref=e127]: i-web
                    - generic [ref=e128]: runs as
                  - 'button "IAM role: web — AROAEXAMPLE" [ref=e129] [cursor=pointer]':
                    - generic [ref=e131]: web
                    - generic [ref=e132]: AROAEXAMPLE
                  - 'generic "Decision authority: 1 actions granted — 1 used · 0 denied-only" [ref=e133]':
                    - generic [ref=e135]: 1 actions granted
                    - generic [ref=e136]: 1 used · 0 denied-only
                - generic [ref=e137]:
                  - generic [ref=e138]:
                    - img [ref=e139]
                    - text: configured — a policy or inventory fact, never observed, never moves
                  - generic [ref=e140]:
                    - img [ref=e141]
                    - text: observed — evidence read from a named decision generation
              - generic [ref=e142]:
                - heading "Relationship families" [level=4] [ref=e143]
                - list [ref=e144]:
                  - listitem [ref=e145]:
                    - generic [ref=e146]: Group membership
                    - generic [ref=e147]: unavailable · group_memberships
                  - listitem [ref=e148]:
                    - generic [ref=e149]: Attached policy / grant
                    - generic [ref=e150]: unavailable · policy_attachments
                  - listitem [ref=e151]:
                    - generic [ref=e152]: Can assume
                    - generic [ref=e153]: unavailable · assume_grants
                  - listitem [ref=e154]:
                    - generic [ref=e155]: Trusts
                    - generic [ref=e156]: unavailable · trust_grants
                  - listitem [ref=e157]:
                    - generic [ref=e158]: Authenticates as
                    - generic [ref=e159]: unavailable · authentications
                  - listitem [ref=e160]:
                    - generic [ref=e161]: Permission / RBAC flow
                    - generic [ref=e162]: unavailable · permission_flows
                  - listitem [ref=e163]:
                    - generic [ref=e164]: Data access
                    - generic [ref=e165]: unavailable · data_accesses
              - group [ref=e166]:
                - generic "Every relationship on this map, as text" [ref=e167] [cursor=pointer]
                - 'table "Directional identity relationships: each row is one edge, from source to target." [ref=e168]':
                  - caption [ref=e169]: "Directional identity relationships: each row is one edge, from source to target."
                  - rowgroup [ref=e170]:
                    - row "From Direction To Family Plane" [ref=e171]:
                      - columnheader "From" [ref=e172]
                      - columnheader "Direction" [ref=e173]
                      - columnheader "To" [ref=e174]
                      - columnheader "Family" [ref=e175]
                      - columnheader "Plane" [ref=e176]
                  - rowgroup [ref=e177]:
                    - row "workload:i-web runs as → role:AROAEXAMPLE WORKLOAD_USES_ROLE configured" [ref=e178]:
                      - cell "workload:i-web" [ref=e179]
                      - cell "runs as →" [ref=e180]
                      - cell "role:AROAEXAMPLE" [ref=e181]
                      - cell "WORKLOAD_USES_ROLE" [ref=e182]
                      - cell "configured" [ref=e183]
                    - row "role:AROAEXAMPLE decided by → decision:AROAEXAMPLE ROLE_ACTION_DECISION observed" [ref=e184]:
                      - cell "role:AROAEXAMPLE" [ref=e185]
                      - cell "decided by →" [ref=e186]
                      - cell "decision:AROAEXAMPLE" [ref=e187]
                      - cell "ROLE_ACTION_DECISION" [ref=e188]
                      - cell "observed" [ref=e189]
          - generic [ref=e190]:
            - heading "Projection authority" [level=3] [ref=e191]
            - generic [ref=e193]:
              - generic [ref=e194]:
                - generic [ref=e195]: Canonical inventory
                - generic [ref=e196]:
                  - generic [ref=e197]:
                    - term [ref=e198]: generation
                    - definition [ref=e199]: "31"
                  - generic [ref=e200]:
                    - term [ref=e201]: source vector
                    - definition [ref=e202]: v1:14eb99d3b2882a6ba82a6755a8927ec454e54c68ee01a9b7fc0116d58f5a0d8d
                  - generic [ref=e203]:
                    - term [ref=e204]: receipt
                    - definition [ref=e205]: v1:14eb99d3b2882a6ba82a6755a8927ec454e54c68ee01a9b7fc0116d58f5a0d8d
                  - generic [ref=e206]:
                    - term [ref=e207]: projected through
                    - definition [ref=e208]: 2026-09-15T07:00:00Z
              - generic [ref=e209]:
                - generic [ref=e210]: Role action decision
                - generic [ref=e211]:
                  - generic [ref=e212]:
                    - term [ref=e213]: generation
                    - definition [ref=e214]: "12"
                  - generic [ref=e215]:
                    - term [ref=e216]: source vector
                    - definition [ref=e217]: v1:14eb99d3b2882a6ba82a6755a8927ec454e54c68ee01a9b7fc0116d58f5a0d8d
                  - generic [ref=e218]:
                    - term [ref=e219]: receipt
                    - definition [ref=e220]: v1:14eb99d3b2882a6ba82a6755a8927ec454e54c68ee01a9b7fc0116d58f5a0d8d
                  - generic [ref=e221]:
                    - term [ref=e222]: projected through
                    - definition [ref=e223]: 2026-09-15T07:00:00Z
          - generic [ref=e224]:
            - heading "Relationship families" [level=3] [ref=e225]
            - paragraph [ref=e226]: What the installed canonical data path can serve. This describes the data path, not this tenant's data, so it is the same whether or not roles were found.
            - list [ref=e227]:
              - listitem [ref=e228]:
                - generic [ref=e229]:
                  - generic [ref=e230]: ASSUMED_ROLE_OBSERVED
                  - generic [ref=e231]: unavailable
                  - generic [ref=e232]: plane not asserted
                  - generic [ref=e233]: CANONICAL_PRODUCER_UNWIRED
                - paragraph [ref=e234]: cyntro_data.projection.neptune_graph.observations.RoleAssumptionProjector is generation-bound and declares plane OBSERVED, but nothing in the tree calls it -- only two re-export lines reference it. No edge of this type is ever written.
              - listitem [ref=e235]:
                - generic [ref=e236]:
                  - generic [ref=e237]: ASSUMES_ROLE
                  - generic [ref=e238]: unavailable
                  - generic [ref=e239]: plane not asserted
                  - generic [ref=e240]: NO_CANONICAL_PRODUCER
                  - generic [ref=e241]: CLASSIFICATION_CONFLICT
                - paragraph [ref=e242]: "Written only by non-generation-bound writers. It is also classified two incompatible ways by installed registries: TOPOLOGY_INVENTORY in unified/evidence/contract.py and Plane.OBSERVED in unified/quality/edge_registry.py. The canonical observed producer that would settle it is the unwired one above."
              - listitem [ref=e243]:
                - generic [ref=e244]:
                  - generic [ref=e245]: ASSUMES_ROLE_ACTUAL
                  - generic [ref=e246]: unavailable
                  - generic [ref=e247]: plane not asserted
                  - generic [ref=e248]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e249]: Written only by non-generation-bound writers, one of them behind a feature flag. Role chaining is commonly source-role to target-role, so a target-anchored view would additionally need incoming traversal, which this contract does not offer.
              - listitem [ref=e250]:
                - generic [ref=e251]:
                  - generic [ref=e252]: CAN_ASSUME
                  - generic [ref=e253]: unavailable
                  - generic [ref=e254]: plane not asserted
                  - generic [ref=e255]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e256]: "Written only by non-generation-bound writers. Not interchangeable with ASSUMES_ROLE or ASSUMES_ROLE_ACTUAL: different producers, different planes, different directions."
              - listitem [ref=e257]:
                - generic [ref=e258]:
                  - generic [ref=e259]: DATA_ACCESS
                  - generic [ref=e260]: unavailable
                  - generic [ref=e261]: plane not asserted
                  - generic [ref=e262]: ASSET_ANCHORED_AUTHORITY_ONLY
                - paragraph [ref=e263]: "The active canonical path is not an edge: it is the versioned BehavioralSummary DATA_ACCESS grain, and its one bounded read (cyntro_data.projection.behavioral_reader.data_access_by_asset_cypher) is ASSET-anchored -- it UNWINDs a caller-supplied $asset_uids list and matches data_asset_uid, with no principal predicate. principal_uid appears only on the way out. Producing role-anchored output would require enumerating the tenant's whole data-asset universe first and filtering after the fact, which is the unbounded scan this contract forbids, and the 2000-row cap would truncate it silently. A principal-anchored bounded read must be added beside it before this family can be served here; it must not be inverted in the consumer."
              - listitem [ref=e264]:
                - generic [ref=e265]:
                  - generic [ref=e266]: HAS_POLICY
                  - generic [ref=e267]: unavailable
                  - generic [ref=e268]: plane not asserted
                  - generic [ref=e269]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e270]: Written only by legacy collectors and demo seeding, none of them generation-bound. Configured grants for a role are served here from the decision authority instead, which is hash-verified.
              - listitem [ref=e271]:
                - generic [ref=e272]:
                  - generic [ref=e273]: IN_ORG
                  - generic [ref=e274]: unavailable
                  - generic [ref=e275]: plane not asserted
                  - generic [ref=e276]: NOT_ROLE_ANCHORED
                  - generic [ref=e277]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e278]: Account/OU placement, not role authority.
              - listitem [ref=e279]:
                - generic [ref=e280]:
                  - generic [ref=e281]: IN_ORG_UNIT
                  - generic [ref=e282]: unavailable
                  - generic [ref=e283]: plane not asserted
                  - generic [ref=e284]: NOT_ROLE_ANCHORED
                  - generic [ref=e285]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e286]: Account/OU placement, not role authority.
              - listitem [ref=e287]:
                - generic [ref=e288]:
                  - generic [ref=e289]: LIMITED_BY_SCP
                  - generic [ref=e290]: unavailable
                  - generic [ref=e291]: plane not asserted
                  - generic [ref=e292]: NOT_ROLE_ANCHORED
                  - generic [ref=e293]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e294]: Organisation-level control attachment. Reaching it needs a bounded account/org path, not a role edge, and its only writer is a non-generation-bound collector.
              - listitem [ref=e295]:
                - generic [ref=e296]:
                  - generic [ref=e297]: MEMBER_OF
                  - generic [ref=e298]: unavailable
                  - generic [ref=e299]: plane not asserted
                  - generic [ref=e300]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e301]: Written only by the Identity Center collector, which is not generation-bound. Distinct from MEMBER_OF_CLUSTER, an RDS topology edge; the two must not be coalesced.
              - listitem [ref=e302]:
                - generic [ref=e303]:
                  - generic [ref=e304]: ROLE_ACTION_DECISION
                  - generic [ref=e305]: available
                  - generic [ref=e306]: configured and observed
                - paragraph [ref=e307]: Accepted only after decision_fetch.verify_generation proves the pinned generation's exact count and set hash, and the conserved role-level open-universe gaps are checked by count and hash.
                - paragraph [ref=e308]: writer cyntro_data.projection.role_action_decision_project · bounded read unified.change_assurance.decision_fetch.fetch_role_decisions
              - listitem [ref=e309]:
                - generic [ref=e310]:
                  - generic [ref=e311]: TARGETS
                  - generic [ref=e312]: unavailable
                  - generic [ref=e313]: plane not asserted
                  - generic [ref=e314]: NOT_ROLE_ANCHORED
                  - generic [ref=e315]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e316]: A workload/resource dependency edge written by event and scheduler collectors, not a role authority edge.
              - listitem [ref=e317]:
                - generic [ref=e318]:
                  - generic [ref=e319]: TRUSTS
                  - generic [ref=e320]: unavailable
                  - generic [ref=e321]: plane not asserted
                  - generic [ref=e322]: NOT_ROLE_ANCHORED
                  - generic [ref=e323]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e324]: "Not a role-outgoing edge at all: it runs from an external principal to a resource-policy grant. Anchoring it on a role returns nothing regardless of generation."
              - listitem [ref=e325]:
                - generic [ref=e326]:
                  - generic [ref=e327]: USES_KMS_KEY
                  - generic [ref=e328]: unavailable
                  - generic [ref=e329]: plane not asserted
                  - generic [ref=e330]: NOT_ROLE_ANCHORED
                  - generic [ref=e331]: NO_CANONICAL_PRODUCER
                - paragraph [ref=e332]: A resource dependency edge, not a role authority edge.
              - listitem [ref=e333]:
                - generic [ref=e334]:
                  - generic [ref=e335]: WORKLOAD_USES_ROLE
                  - generic [ref=e336]: available
                  - generic [ref=e337]: configured
                - paragraph [ref=e338]: Generation-owned canonical binding. The active pointer must declare COMPLETE workload binding coverage with an exact count, an exact set hash and a validated projection receipt before this projection is built at all.
                - paragraph [ref=e339]: writer cyntro_data.projection.inventory_authority_project · bounded read scripts.estate_identity_access._READ_BINDINGS
          - generic [ref=e340]: Read from the estate-identity-access/v1 block on this estate's topology-risk payload. This tab issues no request of its own and performs no graph traversal.
      - complementary [ref=e341]:
        - complementary [ref=e342]:
          - generic [ref=e343]:
            - generic [ref=e344]:
              - heading "Service index" [level=2] [ref=e345]
              - generic [ref=e346]: "38"
            - generic [ref=e347]:
              - img [ref=e348]
              - searchbox "Find service in topology" [ref=e351]
            - button "Filters" [ref=e354]:
              - img [ref=e355]
              - text: Filters
          - list [ref=e357]:
            - listitem [ref=e358]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 0 in · 4 out Jul 9, 11:04 AM" [ref=e359]:
                - generic [ref=e360]:
                  - img [ref=e362]
                  - generic [ref=e364]:
                    - generic [ref=e365]:
                      - generic [ref=e366]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e367]
                    - generic [ref=e369]: EC2 · eu-west-1a · web
                    - generic [ref=e370]:
                      - generic [ref=e371]: 0 in · 4 out
                      - generic [ref=e372]:
                        - img [ref=e373]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e376]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 0 in · 3 out Jul 9, 10:40 AM" [ref=e377]:
                - generic [ref=e378]:
                  - img [ref=e380]
                  - generic [ref=e382]:
                    - generic [ref=e383]:
                      - generic [ref=e384]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e385]
                    - generic [ref=e387]: EC2 · eu-west-1b · app
                    - generic [ref=e388]:
                      - generic [ref=e389]: 0 in · 3 out
                      - generic [ref=e390]:
                        - img [ref=e391]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e394]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 3 in · 0 out Jul 6, 03:05 PM" [ref=e395]:
                - generic [ref=e396]:
                  - img [ref=e398]
                  - generic [ref=e400]:
                    - generic [ref=e401]:
                      - generic [ref=e402]: saferemediate-test-db
                      - generic "Current graph data" [ref=e403]
                    - generic [ref=e405]: RDS · eu-west-1a · data
                    - generic [ref=e406]:
                      - generic [ref=e407]: 3 in · 0 out
                      - generic [ref=e408]:
                        - img [ref=e409]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e412]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 0 in · 3 out Jul 9, 11:04 AM" [ref=e413]:
                - generic [ref=e414]:
                  - img [ref=e416]
                  - generic [ref=e418]:
                    - generic [ref=e419]:
                      - generic [ref=e420]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e421]
                    - generic [ref=e423]: EC2 · eu-west-1b · web
                    - generic [ref=e424]:
                      - generic [ref=e425]: 0 in · 3 out
                      - generic [ref=e426]:
                        - img [ref=e427]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e430]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 1 in · 0 out Jun 25, 08:58 AM" [ref=e431]:
                - generic [ref=e432]:
                  - img [ref=e434]
                  - generic [ref=e436]:
                    - generic [ref=e437]:
                      - generic [ref=e438]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e439]
                    - generic [ref=e441]: S3 · eu-west-1 · regional
                    - generic [ref=e442]:
                      - generic [ref=e443]: 1 in · 0 out
                      - generic [ref=e444]:
                        - img [ref=e445]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e448]:
              - button "alon-prod-continuous-traffic Current graph data Lambda · eu-west-1 · regional 0 in · 1 out Jun 25, 08:58 AM" [ref=e449]:
                - generic [ref=e450]:
                  - img [ref=e452]
                  - generic [ref=e454]:
                    - generic [ref=e455]:
                      - generic [ref=e456]: alon-prod-continuous-traffic
                      - generic "Current graph data" [ref=e457]
                    - generic [ref=e459]: Lambda · eu-west-1 · regional
                    - generic [ref=e460]:
                      - generic [ref=e461]: 0 in · 1 out
                      - generic [ref=e462]:
                        - img [ref=e463]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e466]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e467]:
                - generic [ref=e468]:
                  - img [ref=e470]
                  - generic [ref=e473]:
                    - generic [ref=e474]:
                      - generic [ref=e475]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e476]
                    - generic [ref=e478]: Lambda · eu-west-1 · regional
                    - generic [ref=e479]:
                      - generic [ref=e480]: 0 in · 0 out
                      - generic [ref=e481]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e484]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e485]:
                - generic [ref=e486]:
                  - img [ref=e488]
                  - generic [ref=e491]:
                    - generic [ref=e492]:
                      - generic [ref=e493]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e494]
                    - generic [ref=e496]: S3 · eu-west-1 · regional
                    - generic [ref=e497]:
                      - generic [ref=e498]: 0 in · 0 out
                      - generic [ref=e499]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e502]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e503]:
                - generic [ref=e504]:
                  - img [ref=e506]
                  - generic [ref=e509]:
                    - generic [ref=e510]:
                      - generic [ref=e511]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e512]
                    - generic [ref=e514]: S3 · eu-west-1 · regional
                    - generic [ref=e515]:
                      - generic [ref=e516]: 0 in · 0 out
                      - generic [ref=e517]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e520]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e521]:
                - generic [ref=e522]:
                  - img [ref=e524]
                  - generic [ref=e527]:
                    - generic [ref=e528]:
                      - generic [ref=e529]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e530]
                    - generic [ref=e532]: S3 · eu-west-1 · regional
                    - generic [ref=e533]:
                      - generic [ref=e534]: 0 in · 0 out
                      - generic [ref=e535]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e538]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e539]:
                - generic [ref=e540]:
                  - img [ref=e542]
                  - generic [ref=e545]:
                    - generic [ref=e546]:
                      - generic [ref=e547]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e548]
                    - generic [ref=e550]: S3 · eu-west-1 · regional
                    - generic [ref=e551]:
                      - generic [ref=e552]: 0 in · 0 out
                      - generic [ref=e553]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e556]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e557]:
                - generic [ref=e558]:
                  - img [ref=e560]
                  - generic [ref=e563]:
                    - generic [ref=e564]:
                      - generic [ref=e565]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e566]
                    - generic [ref=e568]: S3 · eu-west-1 · regional
                    - generic [ref=e569]:
                      - generic [ref=e570]: 0 in · 0 out
                      - generic [ref=e571]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e574]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e575]:
                - generic [ref=e576]:
                  - img [ref=e578]
                  - generic [ref=e581]:
                    - generic [ref=e582]:
                      - generic [ref=e583]: cyntrotest2
                      - generic "Current graph data" [ref=e584]
                    - generic [ref=e586]: S3 · eu-west-1 · regional
                    - generic [ref=e587]:
                      - generic [ref=e588]: 0 in · 0 out
                      - generic [ref=e589]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e592]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e593]:
                - generic [ref=e594]:
                  - img [ref=e596]
                  - generic [ref=e599]:
                    - generic [ref=e600]:
                      - generic [ref=e601]: impaciq-findings
                      - generic "Current graph data" [ref=e602]
                    - generic [ref=e604]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e605]:
                      - generic [ref=e606]: 0 in · 0 out
                      - generic [ref=e607]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e610]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e611]:
                - generic [ref=e612]:
                  - img [ref=e614]
                  - generic [ref=e617]:
                    - generic [ref=e618]:
                      - generic [ref=e619]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e620]
                    - generic [ref=e622]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e623]:
                      - generic [ref=e624]: 0 in · 0 out
                      - generic [ref=e625]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e628]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e629]:
                - generic [ref=e630]:
                  - img [ref=e632]
                  - generic [ref=e635]:
                    - generic [ref=e636]:
                      - generic [ref=e637]: impaciq-scan-status
                      - generic "Current graph data" [ref=e638]
                    - generic [ref=e640]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e641]:
                      - generic [ref=e642]: 0 in · 0 out
                      - generic [ref=e643]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e646]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e647]:
                - generic [ref=e648]:
                  - img [ref=e650]
                  - generic [ref=e653]:
                    - generic [ref=e654]:
                      - generic [ref=e655]: least_privilege_role_state
                      - generic "Current graph data" [ref=e656]
                    - generic [ref=e658]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e659]:
                      - generic [ref=e660]: 0 in · 0 out
                      - generic [ref=e661]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e664]:
              - button "PaymentProductionAPI Current graph data Lambda · eu-west-1a · app 0 in · 0 out No runtime timestamp" [ref=e665]:
                - generic [ref=e666]:
                  - img [ref=e668]
                  - generic [ref=e671]:
                    - generic [ref=e672]:
                      - generic [ref=e673]: PaymentProductionAPI
                      - generic "Current graph data" [ref=e674]
                    - generic [ref=e676]: Lambda · eu-west-1a · app
                    - generic [ref=e677]:
                      - generic [ref=e678]: 0 in · 0 out
                      - generic [ref=e679]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e682]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e683]:
                - generic [ref=e684]:
                  - img [ref=e686]
                  - generic [ref=e689]:
                    - generic [ref=e690]:
                      - generic [ref=e691]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e692]
                    - generic [ref=e694]: Lambda · eu-west-1 · regional
                    - generic [ref=e695]:
                      - generic [ref=e696]: 0 in · 0 out
                      - generic [ref=e697]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e700]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e701]:
                - generic [ref=e702]:
                  - img [ref=e704]
                  - generic [ref=e707]:
                    - generic [ref=e708]:
                      - generic [ref=e709]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e710]
                    - generic [ref=e712]: S3 · eu-west-1 · regional
                    - generic [ref=e713]:
                      - generic [ref=e714]: 0 in · 0 out
                      - generic [ref=e715]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e718]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e719]:
                - generic [ref=e720]:
                  - img [ref=e722]
                  - generic [ref=e725]:
                    - generic [ref=e726]:
                      - generic [ref=e727]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e728]
                    - generic [ref=e730]: Lambda · eu-west-1 · regional
                    - generic [ref=e731]:
                      - generic [ref=e732]: 0 in · 0 out
                      - generic [ref=e733]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e736]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e737]:
                - generic [ref=e738]:
                  - img [ref=e740]
                  - generic [ref=e743]:
                    - generic [ref=e744]:
                      - generic [ref=e745]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e746]
                    - generic [ref=e748]: Lambda · eu-west-1 · regional
                    - generic [ref=e749]:
                      - generic [ref=e750]: 0 in · 0 out
                      - generic [ref=e751]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e754]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e755]:
                - generic [ref=e756]:
                  - img [ref=e758]
                  - generic [ref=e761]:
                    - generic [ref=e762]:
                      - generic [ref=e763]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e764]
                    - generic [ref=e766]: Lambda · eu-west-1 · regional
                    - generic [ref=e767]:
                      - generic [ref=e768]: 0 in · 0 out
                      - generic [ref=e769]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e772]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e773]:
                - generic [ref=e774]:
                  - img [ref=e776]
                  - generic [ref=e779]:
                    - generic [ref=e780]:
                      - generic [ref=e781]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e782]
                    - generic [ref=e784]: S3 · eu-west-1 · regional
                    - generic [ref=e785]:
                      - generic [ref=e786]: 0 in · 0 out
                      - generic [ref=e787]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e790]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e791]:
                - generic [ref=e792]:
                  - img [ref=e794]
                  - generic [ref=e797]:
                    - generic [ref=e798]:
                      - generic [ref=e799]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e800]
                    - generic [ref=e802]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e803]:
                      - generic [ref=e804]: 0 in · 0 out
                      - generic [ref=e805]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e808]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e809]:
                - generic [ref=e810]:
                  - img [ref=e812]
                  - generic [ref=e815]:
                    - generic [ref=e816]:
                      - generic [ref=e817]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e818]
                    - generic [ref=e820]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e821]:
                      - generic [ref=e822]: 0 in · 0 out
                      - generic [ref=e823]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e826]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e827]:
                - generic [ref=e828]:
                  - img [ref=e830]
                  - generic [ref=e833]:
                    - generic [ref=e834]:
                      - generic [ref=e835]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e836]
                    - generic [ref=e838]: S3 · eu-west-1 · regional
                    - generic [ref=e839]:
                      - generic [ref=e840]: 0 in · 0 out
                      - generic [ref=e841]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e844]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e845]:
                - generic [ref=e846]:
                  - img [ref=e848]
                  - generic [ref=e851]:
                    - generic [ref=e852]:
                      - generic [ref=e853]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e854]
                    - generic [ref=e856]: Lambda · eu-west-1 · regional
                    - generic [ref=e857]:
                      - generic [ref=e858]: 0 in · 0 out
                      - generic [ref=e859]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e862]:
              - button "SafeRemediate-RemediationExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e863]:
                - generic [ref=e864]:
                  - img [ref=e866]
                  - generic [ref=e869]:
                    - generic [ref=e870]:
                      - generic [ref=e871]: SafeRemediate-RemediationExecutor
                      - generic "Current graph data" [ref=e872]
                    - generic [ref=e874]: Lambda · eu-west-1 · regional
                    - generic [ref=e875]:
                      - generic [ref=e876]: 0 in · 0 out
                      - generic [ref=e877]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e880]:
              - button "SafeRemediate-RollbackExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e881]:
                - generic [ref=e882]:
                  - img [ref=e884]
                  - generic [ref=e887]:
                    - generic [ref=e888]:
                      - generic [ref=e889]: SafeRemediate-RollbackExecutor
                      - generic "Current graph data" [ref=e890]
                    - generic [ref=e892]: Lambda · eu-west-1 · regional
                    - generic [ref=e893]:
                      - generic [ref=e894]: 0 in · 0 out
                      - generic [ref=e895]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e898]:
              - button "SafeRemediate-RollbackMonitor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e899]:
                - generic [ref=e900]:
                  - img [ref=e902]
                  - generic [ref=e905]:
                    - generic [ref=e906]:
                      - generic [ref=e907]: SafeRemediate-RollbackMonitor
                      - generic "Current graph data" [ref=e908]
                    - generic [ref=e910]: Lambda · eu-west-1 · regional
                    - generic [ref=e911]:
                      - generic [ref=e912]: 0 in · 0 out
                      - generic [ref=e913]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e916]:
              - button "SafeRemediate-ServiceAwareSimulator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e917]:
                - generic [ref=e918]:
                  - img [ref=e920]
                  - generic [ref=e923]:
                    - generic [ref=e924]:
                      - generic [ref=e925]: SafeRemediate-ServiceAwareSimulator
                      - generic "Current graph data" [ref=e926]
                    - generic [ref=e928]: Lambda · eu-west-1 · regional
                    - generic [ref=e929]:
                      - generic [ref=e930]: 0 in · 0 out
                      - generic [ref=e931]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e934]:
              - button "SafeRemediate-ServiceCatalogBuilder Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e935]:
                - generic [ref=e936]:
                  - img [ref=e938]
                  - generic [ref=e941]:
                    - generic [ref=e942]:
                      - generic [ref=e943]: SafeRemediate-ServiceCatalogBuilder
                      - generic "Current graph data" [ref=e944]
                    - generic [ref=e946]: Lambda · eu-west-1 · regional
                    - generic [ref=e947]:
                      - generic [ref=e948]: 0 in · 0 out
                      - generic [ref=e949]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e952]:
              - button "SafeRemediate-SimulationEngine Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e953]:
                - generic [ref=e954]:
                  - img [ref=e956]
                  - generic [ref=e959]:
                    - generic [ref=e960]:
                      - generic [ref=e961]: SafeRemediate-SimulationEngine
                      - generic "Current graph data" [ref=e962]
                    - generic [ref=e964]: Lambda · eu-west-1 · regional
                    - generic [ref=e965]:
                      - generic [ref=e966]: 0 in · 0 out
                      - generic [ref=e967]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e970]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e971]:
                - generic [ref=e972]:
                  - img [ref=e974]
                  - generic [ref=e977]:
                    - generic [ref=e978]:
                      - generic [ref=e979]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e980]
                    - generic [ref=e982]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e983]:
                      - generic [ref=e984]: 0 in · 0 out
                      - generic [ref=e985]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e988]:
              - button "SafeRemediate-WizWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e989]:
                - generic [ref=e990]:
                  - img [ref=e992]
                  - generic [ref=e995]:
                    - generic [ref=e996]:
                      - generic [ref=e997]: SafeRemediate-WizWebhook
                      - generic "Current graph data" [ref=e998]
                    - generic [ref=e1000]: Lambda · eu-west-1 · regional
                    - generic [ref=e1001]:
                      - generic [ref=e1002]: 0 in · 0 out
                      - generic [ref=e1003]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1006]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1007]:
                - generic [ref=e1008]:
                  - img [ref=e1010]
                  - generic [ref=e1013]:
                    - generic [ref=e1014]:
                      - generic [ref=e1015]: sg_state
                      - generic "Current graph data" [ref=e1016]
                    - generic [ref=e1018]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1019]:
                      - generic [ref=e1020]: 0 in · 0 out
                      - generic [ref=e1021]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1024]:
              - button "VPCTrafficGenerator Current graph data Lambda · eu-west-1b · app 0 in · 0 out No runtime timestamp" [ref=e1025]:
                - generic [ref=e1026]:
                  - img [ref=e1028]
                  - generic [ref=e1031]:
                    - generic [ref=e1032]:
                      - generic [ref=e1033]: VPCTrafficGenerator
                      - generic "Current graph data" [ref=e1034]
                    - generic [ref=e1036]: Lambda · eu-west-1b · app
                    - generic [ref=e1037]:
                      - generic [ref=e1038]: 0 in · 0 out
                      - generic [ref=e1039]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1042]:
      - text: Live read from
      - generic [ref=e1043]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1044]
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test"
  2   | 
  3   | import { seedAuthCookie } from "./live-auth"
  4   | import { ESTATE_URL, identitySnapshot, routeSnapshot } from "./topology-fixture"
  5   | 
  6   | /**
  7   |  * The Identity & access lens, at the three widths a reader actually uses.
  8   |  *
  9   |  * Deliberately its own spec rather than an extension of the topology ones:
  10  |  * those assert the Network topology lens and its geometry, and repurposing
  11  |  * them would change what they prove. This one navigates by the lens deep link,
  12  |  * so it never depends on which view the page opens by default -- that default
  13  |  * is the network product's to choose, not this spec's to assume.
  14  |  *
  15  |  * Runs under the desktop, tablet and mobile projects (playwright.config.ts).
  16  |  * The same assertions run at every width: the map is the tab's primary
  17  |  * content, the shared viewport controls are present, and nothing is fabricated
  18  |  * where the producer sent nothing.
  19  |  */
  20  | 
  21  | const IDENTITY_URL = `${ESTATE_URL}&lens=identity`
  22  | 
  23  | test.describe("Estate · Identity & access lens", () => {
  24  |   test.beforeEach(async ({ context, page }) => {
  25  |     test.setTimeout(120_000)
  26  |     await seedAuthCookie(context)
  27  |     // The estate snapshot WITH an identity projection: without one the tab
  28  |     // correctly reports the projection absent and there is no map to assert on.
  29  |     await routeSnapshot(page, identitySnapshot() as never)
  30  |   })
  31  | 
  32  |   test("the deep link opens the identity lens with the map as its primary content", async ({ page }) => {
  33  |     await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
  34  | 
  35  |     const tab = page.getByTestId("estate-identity-access")
  36  |     await expect(tab).toBeVisible({ timeout: 60_000 })
  37  | 
  38  |     // The lens the URL asked for, not the page default.
  39  |     await expect(page.getByTestId("topology-estate-view-identity")).toHaveAttribute(
  40  |       "aria-selected", "true",
  41  |     )
  42  | 
  43  |     // Primary content: the map precedes the evidence sections in the document,
  44  |     // which is the order a screen reader announces and the order a reader sees.
  45  |     const order = await page.evaluate(() => {
  46  |       const root = document.querySelector('[data-testid="estate-identity-access"]')
  47  |       if (!root) return null
  48  |       const map = root.querySelector('[data-testid="identity-map"]')
  49  |       const receipts = root.querySelector('[data-testid="identity-receipts"], [data-testid="identity-receipts-none"]')
  50  |       if (!map || !receipts) return null
  51  |       // Node.DOCUMENT_POSITION_FOLLOWING === 4
  52  |       return (map.compareDocumentPosition(receipts) & 4) === 4 ? "map-first" : "map-after"
  53  |     })
  54  |     expect(order).toBe("map-first")
  55  |   })
  56  | 
  57  |   test("the shared viewport controls are on the identity map", async ({ page }) => {
  58  |     await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
  59  |     await expect(page.getByTestId("estate-identity-access")).toBeVisible({ timeout: 60_000 })
  60  | 
  61  |     const controls = page.getByTestId("identity-map-controls")
  62  |     await expect(controls).toBeVisible()
  63  |     await expect(page.getByTestId("identity-map-zoom-in")).toBeVisible()
  64  |     await expect(page.getByTestId("identity-map-zoom-out")).toBeVisible()
  65  |     await expect(page.getByTestId("identity-map-fit")).toBeVisible()
  66  | 
  67  |     // The readout is relative to fit, so it starts at 100% and rises on zoom in.
  68  |     const readout = page.getByTestId("identity-map-zoom-readout")
  69  |     await expect(readout).toHaveText("100%")
  70  |     await page.getByTestId("identity-map-zoom-in").click()
  71  |     await expect(readout).not.toHaveText("100%")
  72  |     await page.getByTestId("identity-map-fit").click()
  73  |     await expect(readout).toHaveText("100%")
  74  |   })
  75  | 
  76  |   test("absent relationship families are named, never drawn as zero", async ({ page }) => {
  77  |     await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
  78  |     await expect(page.getByTestId("estate-identity-access")).toBeVisible({ timeout: 60_000 })
  79  | 
  80  |     const families = page.getByTestId("identity-map-taxonomy-family")
  81  |     const count = await families.count()
  82  |     // The contract declares seven; all of them are reported one way or another.
> 83  |     expect(count).toBe(7)
      |                   ^ Error: expect(received).toBe(expected) // Object.is equality
  84  |     for (let i = 0; i < count; i++) {
  85  |       const state = await families.nth(i).getAttribute("data-state")
  86  |       expect(["present", "unavailable"]).toContain(state)
  87  |       if (state === "unavailable") {
  88  |         // It says which payload key would carry it -- not "0".
  89  |         await expect(families.nth(i)).toContainText("unavailable")
  90  |         await expect(families.nth(i)).not.toContainText("0 edges")
  91  |       }
  92  |     }
  93  |   })
  94  | 
  95  |   test("the map stays readable without horizontal page scroll", async ({ page }) => {
  96  |     await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
  97  |     await expect(page.getByTestId("estate-identity-access")).toBeVisible({ timeout: 60_000 })
  98  | 
  99  |     // The canvas may pan inside its own frame; the PAGE must not scroll
  100 |     // sideways at any width. This is the assertion the desktop-only suite
  101 |     // could never make.
  102 |     const overflow = await page.evaluate(() =>
  103 |       document.documentElement.scrollWidth - document.documentElement.clientWidth,
  104 |     )
  105 |     expect(overflow).toBeLessThanOrEqual(1)
  106 | 
  107 |     // The text reading of the same graph is always in the DOM, which is what
  108 |     // keeps the lens usable where three lanes cannot fit.
  109 |     await expect(page.getByTestId("identity-map-fallback")).toBeAttached()
  110 |   })
  111 | })
  112 | 
```