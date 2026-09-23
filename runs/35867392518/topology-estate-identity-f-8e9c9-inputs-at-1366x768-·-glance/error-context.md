# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-identity-fixture.spec.ts >> the identity lens is the Network frame with identity inputs at 1366x768 · glance
- Location: tests/integration/topology-estate-identity-fixture.spec.ts:102:7

# Error details

```
Test timeout of 150000ms exceeded.
```

```
Error: locator.click: Test timeout of 150000ms exceeded.
Call log:
  - waiting for getByTestId('topology-estate-density-glance')

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
        - generic [ref=e71]:
          - tablist "Estate view" [ref=e72]:
            - tab "Command map" [ref=e73]
            - tab "Network topology" [ref=e74]
            - tab "Identity & access" [active] [selected] [ref=e75]
          - button "Open map fullscreen" [ref=e76]:
            - img [ref=e77]
            - text: Map fullscreen
        - generic [ref=e84]:
          - generic [ref=e86]:
            - img [ref=e87]
            - generic [ref=e90]:
              - heading "1 role bound to workloads in this scope." [level=2] [ref=e91]
              - paragraph [ref=e92]: Read from the active canonical inventory generation, joined to the hash-verified decision authority (generation 12).
              - generic [ref=e93]:
                - generic [ref=e94]: Read from the canonical generation
                - generic [ref=e95]: "Workload scope: 745783559495 · eu-west-1 · alon-prod"
                - generic [ref=e96]: 14 relationships · 5 identity nodes
                - generic "2 SCP and 1 RCP attachments bound this account from the organization hierarchy (attachments above the account are inherited and still apply)." [ref=e97]:
                  - generic [ref=e98]: In organization o-fixtureorg1
              - generic [ref=e99]:
                - generic [ref=e100]: "Identity graph: account-wide · 745783559495"
                - paragraph [ref=e101]: Matches the inventory tenant, account and generation. These relationships are not filtered by the selected region, system or VPC.
              - generic [ref=e102]:
                - generic [ref=e103]: workload scope matches · 4 fields
                - 'generic "Observed role assumption: No producer records who actually assumed a role. Trust lines are configured permission to assume, never evidence that an assumption happened, and no authentication method is claimed for a role. Principal → data target: No principal-anchored read joins an identity to the data it reaches, so no line runs from a role to a bucket, table or key as \"accesses\". Resource policies are shown on the resource they protect. Effective permission verdict: Configured grants and observed use are shown per role; no allow/deny verdict for a specific target is projected, and a missing SCP, boundary or condition reading never implies allow. Kubernetes RBAC: Service accounts, Roles/ClusterRoles and bindings are not part of the installed identity contract. Nothing here is RBAC, and no cluster binding is drawn." [ref=e104]':
                  - generic [ref=e105]: "not shown: Observed role assumption, Principal → data target +2"
          - generic [ref=e106]:
            - generic [ref=e107]:
              - heading "Identity relationships on the estate canvas" [level=3] [ref=e108]
              - generic [ref=e110]: 1 shown of 1
            - generic [ref=e113]:
              - generic "Identity relationship legend" [ref=e114]:
                - generic [ref=e115]: Colour · kind of access
                - generic "a workload running as a role — instance profile or execution role" [ref=e116]:
                  - generic [ref=e118]: Runs as
                - 'generic "a trust statement: an account, role or * that may assume the role" [ref=e119]':
                  - generic [ref=e121]: May assume
                - generic "a human identity — an IAM user credential or SAML / OIDC federation" [ref=e122]:
                  - generic [ref=e124]: Human identity
                - generic "Secrets Manager and KMS reach" [ref=e125]:
                  - generic [ref=e127]: Secrets & keys
                - generic "S3, DynamoDB and RDS reach" [ref=e128]:
                  - generic [ref=e130]: Data access
                - generic "reach into any other AWS service" [ref=e131]:
                  - generic [ref=e133]: Service reach
                - generic [ref=e134]: Style · evidence
                - generic "a policy, binding or trust fact from the canonical generation — never observed, never moves" [ref=e135]:
                  - img [ref=e136]
                  - generic [ref=e138]: Configured
                - generic "evidence that was read (last used / decided); moves only when a named generation stands behind it" [ref=e139]:
                  - img [ref=e140]
                  - generic [ref=e142]: Observed
                - generic "the producer's own Deny effect on a trust statement — configured state that forbids, never an evaluated verdict" [ref=e143]:
                  - img [ref=e144]
                  - generic [ref=e146]: Denied
                - generic "the producer withheld this reading (a decision not read) — not zero, not allowed, not denied" [ref=e147]:
                  - img [ref=e148]
                  - generic [ref=e150]: Unknown
                - generic "the producer derived this edge from a principal attribute and the far end is a name, not a projected resource" [ref=e151]:
                  - img [ref=e152]
                  - generic [ref=e154]: Name only
                - generic "an observed access edge from the legacy behavioral graph — read, not generation-backed; the Network view draws it the same way; never moves" [ref=e155]:
                  - img [ref=e156]
                  - generic [ref=e158]: Legacy · unverified
                - generic [ref=e159]: Moving = observed with a named generation · a configured or trust line never moves
                - group [ref=e160]:
                  - generic "13 families servable · 13 not on the canonical path" [ref=e161] [cursor=pointer]
              - generic [ref=e162]:
                - generic [ref=e163]: 1 role bound to a workload on this canvas
                - generic [ref=e164]: 1 observed access line from the legacy graph · unverified, never moving
                - generic [ref=e165]: 1 IAM user in the graph, not drawn
                - generic [ref=e166]: 1 protected resource not on this map
                - generic [ref=e167]: 13 relationship families not on the canonical path (see legend)
              - generic [ref=e168]:
                - generic [ref=e169]:
                  - img [ref=e171]
                  - generic [ref=e176]:
                    - generic [ref=e177]: Users
                    - generic [ref=e178]: 1 IAM user in the graph · credential use served
                - generic [ref=e180]:
                  - generic [ref=e181]:
                    - generic [ref=e182]: Trust entrances
                    - generic [ref=e183]: May assume a role here · 1
                  - button "acct 9999…7777 · org management" [ref=e185]:
                    - generic [ref=e188]: acct 9999…7777 · org management
              - generic [ref=e189]:
                - generic [ref=e190]: ☁ AWS Cloud · acct 745783559495
                - generic [ref=e191]:
                  - generic [ref=e192]: Region · eu-west-1
                  - generic [ref=e193]:
                    - generic [ref=e194]:
                      - generic [ref=e195]:
                        - generic "vpc-0329e985173bed24f" [ref=e196]: VPC · vpc-0329e985173bed24f
                        - generic "3 of 6 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e197]: SafeRemediate-Test-… ×3
                      - generic [ref=e200]:
                        - generic [ref=e201]:
                          - generic "eu-west-1a" [ref=e202]: Availability Zone · eu-west-1a
                          - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e203]':
                            - generic [ref=e204]:
                              - generic [ref=e205]: Public · SafeRemediate-Test-Public-1
                              - generic [ref=e206]: 10.0.1.0/24
                            - button "high posture score …Frontend-1" [ref=e208]:
                              - generic "high posture score" [ref=e209]
                              - generic [ref=e212]: …Frontend-1
                          - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e213]':
                            - generic [ref=e214]:
                              - generic [ref=e215]: Private · SafeRemediate-Test-Private-App-1
                              - generic [ref=e216]: 10.0.10.0/24
                            - button "quiet posture score PaymentProductionAPI" [ref=e218]:
                              - generic "quiet posture score" [ref=e219]
                              - generic [ref=e222]: PaymentProductionAPI
                          - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e223]':
                            - generic [ref=e224]:
                              - generic [ref=e225]: Data · SafeRemediate-Test-Private-DB-1
                              - generic [ref=e226]: 10.0.20.0/24
                            - button "quiet posture score saferemediate-test-db" [ref=e228]:
                              - generic "quiet posture score" [ref=e229]
                              - generic [ref=e232]: saferemediate-test-db
                        - generic [ref=e233]:
                          - generic "eu-west-1b" [ref=e234]: Availability Zone · eu-west-1b
                          - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e235]':
                            - generic [ref=e236]:
                              - generic [ref=e237]: Public · SafeRemediate-Test-Public-2
                              - generic [ref=e238]: 10.0.2.0/24
                            - button "high posture score …Frontend-2" [ref=e240]:
                              - generic "high posture score" [ref=e241]
                              - generic [ref=e244]: …Frontend-2
                          - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e245]':
                            - generic [ref=e246]:
                              - generic [ref=e247]: Private · SafeRemediate-Test-Private-App-2
                              - generic [ref=e248]: 10.0.11.0/24
                            - generic [ref=e249]:
                              - button "quiet posture score …App-2" [ref=e250]:
                                - generic "quiet posture score" [ref=e251]
                                - generic [ref=e254]: …App-2
                              - button "quiet posture score VPCTrafficGenerator" [ref=e255]:
                                - generic "quiet posture score" [ref=e256]
                                - generic [ref=e259]: VPCTrafficGenerator
                          - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e260]':
                            - generic [ref=e261]:
                              - generic [ref=e262]: Data · SafeRemediate-Test-Private-DB-2
                              - generic [ref=e263]: 10.0.21.0/24
                            - generic [ref=e264]: No workloads
                    - generic [ref=e265]:
                      - generic [ref=e266]: VPC boundary
                      - generic [ref=e267]:
                        - generic [ref=e268]: ↑ Internet
                        - generic [ref=e269]:
                          - button "IGW alon-prod-igw" [ref=e270]:
                            - img [ref=e272]
                            - generic [ref=e275]: IGW
                            - generic [ref=e276]: alon-prod-igw
                          - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e277]: "egress: not observed"
                      - generic [ref=e279]:
                        - generic [ref=e280]: Endpoints (4)
                        - generic [ref=e281]:
                          - button "VPCE IF EC2 Messages" [ref=e282]:
                            - img [ref=e284]
                            - generic [ref=e288]: VPCE
                            - generic [ref=e289]: IF
                            - generic [ref=e290]: EC2 Messages
                          - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e291]: "use: not observed"
                        - generic [ref=e292]:
                          - button "VPCE GW Amazon S3" [ref=e293]:
                            - img [ref=e295]
                            - generic [ref=e299]: VPCE
                            - generic [ref=e300]: GW
                            - generic [ref=e301]: Amazon S3
                          - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e302]: "use: not observed"
                        - generic [ref=e303]:
                          - button "VPCE IF AWS Systems Manager" [ref=e304]:
                            - img [ref=e306]
                            - generic [ref=e310]: VPCE
                            - generic [ref=e311]: IF
                            - generic [ref=e312]: AWS Systems Manager
                          - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e313]: "use: not observed"
                        - generic [ref=e314]:
                          - button "VPCE IF SSM Messages" [ref=e315]:
                            - img [ref=e317]
                            - generic [ref=e321]: VPCE
                            - generic [ref=e322]: IF
                            - generic [ref=e323]: SSM Messages
                          - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e324]: "use: not observed"
                    - generic [ref=e325]:
                      - generic [ref=e327]: Not in this VPC
                      - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e329]:
                        - generic [ref=e330]: ALB · alon-prod-3tier-alb
                        - generic [ref=e331]: VPC vpc-086bcc2186…
                        - generic [ref=e332]: · payment-production
                    - generic [ref=e334]:
                      - generic [ref=e335]:
                        - generic [ref=e336]:
                          - generic [ref=e337]: Lambda runtime (14)
                          - generic [ref=e338]:
                            - text: outside subnet grid · 14 attachment unverified
                            - generic "11 of 14 chips omit this shared prefix" [ref=e339]: · SafeRemediate-… ×11
                          - button "No recorded S3 traffic from 14 functions" [ref=e341]
                        - generic [ref=e343]:
                          - button "quiet posture score alon-prod-continuous-traffic" [ref=e344]:
                            - generic "quiet posture score" [ref=e345]
                            - generic [ref=e348]: alon-prod-continuous-traffic
                          - button "Lambda×13" [ref=e349]:
                            - generic [ref=e353]:
                              - text: Lambda
                              - generic [ref=e354]: ×13
                      - generic [ref=e356]:
                        - generic [ref=e357]: IAM · Roles (1)
                        - button "Posture not scored web" [ref=e360]:
                          - generic "Posture not scored" [ref=e361]
                          - generic [ref=e364]: web
                      - generic [ref=e366]:
                        - generic [ref=e367]:
                          - text: Regional · S3 / DDB (19)
                          - generic "3 of 19 chips omit this shared prefix" [ref=e368]: SafeRemediate-… ×3
                        - generic [ref=e370]:
                          - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e371]:
                            - generic "quiet posture score" [ref=e372]
                            - generic [ref=e375]: alon-demo-data-bucket-745783559495
                          - button "Posture not scored S3 · any bucket" [ref=e376]:
                            - generic "Posture not scored" [ref=e377]
                            - generic [ref=e380]: S3 · any bucket
                          - button "S3×9" [ref=e381]:
                            - generic [ref=e385]:
                              - text: S3
                              - generic [ref=e386]: ×9
                          - button "DynamoDB×8" [ref=e387]:
                            - generic [ref=e391]:
                              - text: DynamoDB
                              - generic [ref=e392]: ×8
              - generic [ref=e393]:
                - button "Diagnostics 14 serverless ▴" [ref=e394]:
                  - generic [ref=e395]: Diagnostics
                  - generic [ref=e396]: 14 serverless ▴
                - generic [ref=e397]:
                  - generic [ref=e398]:
                    - generic [ref=e399]: Serverless compute (14)
                    - generic [ref=e400]:
                      - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e401]:
                        - generic [ref=e403]:
                          - generic [ref=e405]: AlonIAMTest-traffic-generator
                          - generic [ref=e406]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e407]: "24"
                      - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e408]:
                        - generic [ref=e410]:
                          - generic [ref=e412]: PaymentTrafficGenerator
                          - generic [ref=e413]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e414]: "18"
                      - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e415]:
                        - generic [ref=e417]:
                          - generic [ref=e419]: SafeRemediate-BehaviorAnalyzer
                          - generic [ref=e420]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e421]: "18"
                      - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e422]:
                        - generic [ref=e424]:
                          - generic [ref=e426]: SafeRemediate-ConfidenceScorer
                          - generic [ref=e427]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e428]: "18"
                      - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e429]:
                        - generic [ref=e431]:
                          - generic [ref=e433]: SafeRemediate-CreateCheckpoint
                          - generic [ref=e434]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e435]: "18"
                      - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e436]:
                        - generic [ref=e438]:
                          - generic [ref=e440]: SafeRemediate-PrismaWebhook
                          - generic [ref=e441]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e442]: "18"
                      - button "SafeRemediate-RemediationExecutor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e443]:
                        - generic [ref=e445]:
                          - generic [ref=e447]: SafeRemediate-RemediationExecutor
                          - generic [ref=e448]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e449]: "18"
                      - button "SafeRemediate-RollbackExecutor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e450]:
                        - generic [ref=e452]:
                          - generic [ref=e454]: SafeRemediate-RollbackExecutor
                          - generic [ref=e455]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e456]: "18"
                      - button "SafeRemediate-RollbackMonitor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e457]:
                        - generic [ref=e459]:
                          - generic [ref=e461]: SafeRemediate-RollbackMonitor
                          - generic [ref=e462]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e463]: "18"
                      - button "SafeRemediate-ServiceAwareSimulator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e464]:
                        - generic [ref=e466]:
                          - generic [ref=e468]: SafeRemediate-ServiceAwareSimulator
                          - generic [ref=e469]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e470]: "18"
                      - button "SafeRemediate-ServiceCatalogBuilder Lambda · arn:aws:lambda:eu-west-1 18" [ref=e471]:
                        - generic [ref=e473]:
                          - generic [ref=e475]: SafeRemediate-ServiceCatalogBuilder
                          - generic [ref=e476]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e477]: "18"
                      - button "SafeRemediate-SimulationEngine Lambda · arn:aws:lambda:eu-west-1 18" [ref=e478]:
                        - generic [ref=e480]:
                          - generic [ref=e482]: SafeRemediate-SimulationEngine
                          - generic [ref=e483]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e484]: "18"
                      - button "SafeRemediate-WizWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e485]:
                        - generic [ref=e487]:
                          - generic [ref=e489]: SafeRemediate-WizWebhook
                          - generic [ref=e490]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e491]: "18"
                      - button "alon-prod-continuous-traffic Lambda · arn:aws:lambda:eu-west-1 17" [ref=e492]:
                        - generic [ref=e494]:
                          - generic [ref=e496]: alon-prod-continuous-traffic
                          - generic [ref=e497]: Lambda · arn:aws:lambda:eu-west-1
                        - generic [ref=e498]: "17"
                  - generic [ref=e499]:
                    - generic [ref=e500]: Encoding
                    - generic [ref=e501]:
                      - generic [ref=e504]: Worst (carmine halo + pulse)
                      - generic [ref=e507]: High / elevated (ring only)
                      - generic [ref=e508]:
                        - generic [ref=e509]: ♛
                        - generic [ref=e510]: Crown-jewel halo
                      - generic [ref=e513]: Clean · remediated (teal ring)
                      - generic [ref=e516]: Stale (dimmed)
                      - generic [ref=e519]: Coverage gap (not collected)
              - img:
                - generic:
                  - generic:
                    - generic: instance profile
                - generic:
                  - generic:
                    - generic: may assume · conditioned
                - generic:
                  - generic:
                    - generic: s3 · explicit 1 · used 1
                - generic:
                  - generic:
                    - generic: S3 access · legacy · unverified
          - group [ref=e520]:
            - generic "Evidence — receipts, family coverage, projection hashes" [ref=e521] [cursor=pointer]
      - complementary [ref=e522]:
        - complementary [ref=e523]:
          - generic [ref=e524]:
            - generic [ref=e525]:
              - heading "Service index" [level=2] [ref=e526]
              - generic [ref=e527]: "38"
            - generic [ref=e528]:
              - img [ref=e529]
              - searchbox "Find service in topology" [ref=e532]
            - button "Filters" [ref=e535]:
              - img [ref=e536]
              - text: Filters
          - list [ref=e538]:
            - listitem [ref=e539]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 0 in · 4 out Jul 9, 11:04 AM" [ref=e540]:
                - generic [ref=e541]:
                  - img [ref=e543]
                  - generic [ref=e545]:
                    - generic [ref=e546]:
                      - generic [ref=e547]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e548]
                    - generic [ref=e550]: EC2 · eu-west-1a · web
                    - generic [ref=e551]:
                      - generic [ref=e552]: 0 in · 4 out
                      - generic [ref=e553]:
                        - img [ref=e554]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e557]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 0 in · 3 out Jul 9, 10:40 AM" [ref=e558]:
                - generic [ref=e559]:
                  - img [ref=e561]
                  - generic [ref=e563]:
                    - generic [ref=e564]:
                      - generic [ref=e565]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e566]
                    - generic [ref=e568]: EC2 · eu-west-1b · app
                    - generic [ref=e569]:
                      - generic [ref=e570]: 0 in · 3 out
                      - generic [ref=e571]:
                        - img [ref=e572]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e575]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 3 in · 0 out Jul 6, 03:05 PM" [ref=e576]:
                - generic [ref=e577]:
                  - img [ref=e579]
                  - generic [ref=e581]:
                    - generic [ref=e582]:
                      - generic [ref=e583]: saferemediate-test-db
                      - generic "Current graph data" [ref=e584]
                    - generic [ref=e586]: RDS · eu-west-1a · data
                    - generic [ref=e587]:
                      - generic [ref=e588]: 3 in · 0 out
                      - generic [ref=e589]:
                        - img [ref=e590]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e593]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 0 in · 3 out Jul 9, 11:04 AM" [ref=e594]:
                - generic [ref=e595]:
                  - img [ref=e597]
                  - generic [ref=e599]:
                    - generic [ref=e600]:
                      - generic [ref=e601]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e602]
                    - generic [ref=e604]: EC2 · eu-west-1b · web
                    - generic [ref=e605]:
                      - generic [ref=e606]: 0 in · 3 out
                      - generic [ref=e607]:
                        - img [ref=e608]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e611]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 1 in · 0 out Jun 25, 08:58 AM" [ref=e612]:
                - generic [ref=e613]:
                  - img [ref=e615]
                  - generic [ref=e617]:
                    - generic [ref=e618]:
                      - generic [ref=e619]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e620]
                    - generic [ref=e622]: S3 · eu-west-1 · regional
                    - generic [ref=e623]:
                      - generic [ref=e624]: 1 in · 0 out
                      - generic [ref=e625]:
                        - img [ref=e626]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e629]:
              - button "alon-prod-continuous-traffic Current graph data Lambda · eu-west-1 · regional 0 in · 1 out Jun 25, 08:58 AM" [ref=e630]:
                - generic [ref=e631]:
                  - img [ref=e633]
                  - generic [ref=e635]:
                    - generic [ref=e636]:
                      - generic [ref=e637]: alon-prod-continuous-traffic
                      - generic "Current graph data" [ref=e638]
                    - generic [ref=e640]: Lambda · eu-west-1 · regional
                    - generic [ref=e641]:
                      - generic [ref=e642]: 0 in · 1 out
                      - generic [ref=e643]:
                        - img [ref=e644]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e647]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e648]:
                - generic [ref=e649]:
                  - img [ref=e651]
                  - generic [ref=e654]:
                    - generic [ref=e655]:
                      - generic [ref=e656]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e657]
                    - generic [ref=e659]: Lambda · eu-west-1 · regional
                    - generic [ref=e660]:
                      - generic [ref=e661]: 0 in · 0 out
                      - generic [ref=e662]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e665]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e666]:
                - generic [ref=e667]:
                  - img [ref=e669]
                  - generic [ref=e672]:
                    - generic [ref=e673]:
                      - generic [ref=e674]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e675]
                    - generic [ref=e677]: S3 · eu-west-1 · regional
                    - generic [ref=e678]:
                      - generic [ref=e679]: 0 in · 0 out
                      - generic [ref=e680]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e683]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e684]:
                - generic [ref=e685]:
                  - img [ref=e687]
                  - generic [ref=e690]:
                    - generic [ref=e691]:
                      - generic [ref=e692]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e693]
                    - generic [ref=e695]: S3 · eu-west-1 · regional
                    - generic [ref=e696]:
                      - generic [ref=e697]: 0 in · 0 out
                      - generic [ref=e698]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e701]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e702]:
                - generic [ref=e703]:
                  - img [ref=e705]
                  - generic [ref=e708]:
                    - generic [ref=e709]:
                      - generic [ref=e710]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e711]
                    - generic [ref=e713]: S3 · eu-west-1 · regional
                    - generic [ref=e714]:
                      - generic [ref=e715]: 0 in · 0 out
                      - generic [ref=e716]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e719]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e720]:
                - generic [ref=e721]:
                  - img [ref=e723]
                  - generic [ref=e726]:
                    - generic [ref=e727]:
                      - generic [ref=e728]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e729]
                    - generic [ref=e731]: S3 · eu-west-1 · regional
                    - generic [ref=e732]:
                      - generic [ref=e733]: 0 in · 0 out
                      - generic [ref=e734]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e737]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e738]:
                - generic [ref=e739]:
                  - img [ref=e741]
                  - generic [ref=e744]:
                    - generic [ref=e745]:
                      - generic [ref=e746]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e747]
                    - generic [ref=e749]: S3 · eu-west-1 · regional
                    - generic [ref=e750]:
                      - generic [ref=e751]: 0 in · 0 out
                      - generic [ref=e752]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e755]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e756]:
                - generic [ref=e757]:
                  - img [ref=e759]
                  - generic [ref=e762]:
                    - generic [ref=e763]:
                      - generic [ref=e764]: cyntrotest2
                      - generic "Current graph data" [ref=e765]
                    - generic [ref=e767]: S3 · eu-west-1 · regional
                    - generic [ref=e768]:
                      - generic [ref=e769]: 0 in · 0 out
                      - generic [ref=e770]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e773]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e774]:
                - generic [ref=e775]:
                  - img [ref=e777]
                  - generic [ref=e780]:
                    - generic [ref=e781]:
                      - generic [ref=e782]: impaciq-findings
                      - generic "Current graph data" [ref=e783]
                    - generic [ref=e785]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e786]:
                      - generic [ref=e787]: 0 in · 0 out
                      - generic [ref=e788]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e791]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e792]:
                - generic [ref=e793]:
                  - img [ref=e795]
                  - generic [ref=e798]:
                    - generic [ref=e799]:
                      - generic [ref=e800]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e801]
                    - generic [ref=e803]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e804]:
                      - generic [ref=e805]: 0 in · 0 out
                      - generic [ref=e806]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e809]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e810]:
                - generic [ref=e811]:
                  - img [ref=e813]
                  - generic [ref=e816]:
                    - generic [ref=e817]:
                      - generic [ref=e818]: impaciq-scan-status
                      - generic "Current graph data" [ref=e819]
                    - generic [ref=e821]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e822]:
                      - generic [ref=e823]: 0 in · 0 out
                      - generic [ref=e824]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e827]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e828]:
                - generic [ref=e829]:
                  - img [ref=e831]
                  - generic [ref=e834]:
                    - generic [ref=e835]:
                      - generic [ref=e836]: least_privilege_role_state
                      - generic "Current graph data" [ref=e837]
                    - generic [ref=e839]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e840]:
                      - generic [ref=e841]: 0 in · 0 out
                      - generic [ref=e842]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e845]:
              - button "PaymentProductionAPI Current graph data Lambda · eu-west-1a · app 0 in · 0 out No runtime timestamp" [ref=e846]:
                - generic [ref=e847]:
                  - img [ref=e849]
                  - generic [ref=e852]:
                    - generic [ref=e853]:
                      - generic [ref=e854]: PaymentProductionAPI
                      - generic "Current graph data" [ref=e855]
                    - generic [ref=e857]: Lambda · eu-west-1a · app
                    - generic [ref=e858]:
                      - generic [ref=e859]: 0 in · 0 out
                      - generic [ref=e860]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e863]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e864]:
                - generic [ref=e865]:
                  - img [ref=e867]
                  - generic [ref=e870]:
                    - generic [ref=e871]:
                      - generic [ref=e872]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e873]
                    - generic [ref=e875]: Lambda · eu-west-1 · regional
                    - generic [ref=e876]:
                      - generic [ref=e877]: 0 in · 0 out
                      - generic [ref=e878]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e881]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e882]:
                - generic [ref=e883]:
                  - img [ref=e885]
                  - generic [ref=e888]:
                    - generic [ref=e889]:
                      - generic [ref=e890]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e891]
                    - generic [ref=e893]: S3 · eu-west-1 · regional
                    - generic [ref=e894]:
                      - generic [ref=e895]: 0 in · 0 out
                      - generic [ref=e896]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e899]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e900]:
                - generic [ref=e901]:
                  - img [ref=e903]
                  - generic [ref=e906]:
                    - generic [ref=e907]:
                      - generic [ref=e908]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e909]
                    - generic [ref=e911]: Lambda · eu-west-1 · regional
                    - generic [ref=e912]:
                      - generic [ref=e913]: 0 in · 0 out
                      - generic [ref=e914]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e917]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e918]:
                - generic [ref=e919]:
                  - img [ref=e921]
                  - generic [ref=e924]:
                    - generic [ref=e925]:
                      - generic [ref=e926]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e927]
                    - generic [ref=e929]: Lambda · eu-west-1 · regional
                    - generic [ref=e930]:
                      - generic [ref=e931]: 0 in · 0 out
                      - generic [ref=e932]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e935]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e936]:
                - generic [ref=e937]:
                  - img [ref=e939]
                  - generic [ref=e942]:
                    - generic [ref=e943]:
                      - generic [ref=e944]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e945]
                    - generic [ref=e947]: Lambda · eu-west-1 · regional
                    - generic [ref=e948]:
                      - generic [ref=e949]: 0 in · 0 out
                      - generic [ref=e950]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e953]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e954]:
                - generic [ref=e955]:
                  - img [ref=e957]
                  - generic [ref=e960]:
                    - generic [ref=e961]:
                      - generic [ref=e962]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e963]
                    - generic [ref=e965]: S3 · eu-west-1 · regional
                    - generic [ref=e966]:
                      - generic [ref=e967]: 0 in · 0 out
                      - generic [ref=e968]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e971]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e972]:
                - generic [ref=e973]:
                  - img [ref=e975]
                  - generic [ref=e978]:
                    - generic [ref=e979]:
                      - generic [ref=e980]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e981]
                    - generic [ref=e983]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e984]:
                      - generic [ref=e985]: 0 in · 0 out
                      - generic [ref=e986]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e989]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e990]:
                - generic [ref=e991]:
                  - img [ref=e993]
                  - generic [ref=e996]:
                    - generic [ref=e997]:
                      - generic [ref=e998]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e999]
                    - generic [ref=e1001]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1002]:
                      - generic [ref=e1003]: 0 in · 0 out
                      - generic [ref=e1004]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1007]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1008]:
                - generic [ref=e1009]:
                  - img [ref=e1011]
                  - generic [ref=e1014]:
                    - generic [ref=e1015]:
                      - generic [ref=e1016]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e1017]
                    - generic [ref=e1019]: S3 · eu-west-1 · regional
                    - generic [ref=e1020]:
                      - generic [ref=e1021]: 0 in · 0 out
                      - generic [ref=e1022]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1025]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1026]:
                - generic [ref=e1027]:
                  - img [ref=e1029]
                  - generic [ref=e1032]:
                    - generic [ref=e1033]:
                      - generic [ref=e1034]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e1035]
                    - generic [ref=e1037]: Lambda · eu-west-1 · regional
                    - generic [ref=e1038]:
                      - generic [ref=e1039]: 0 in · 0 out
                      - generic [ref=e1040]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1043]:
              - button "SafeRemediate-RemediationExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1044]:
                - generic [ref=e1045]:
                  - img [ref=e1047]
                  - generic [ref=e1050]:
                    - generic [ref=e1051]:
                      - generic [ref=e1052]: SafeRemediate-RemediationExecutor
                      - generic "Current graph data" [ref=e1053]
                    - generic [ref=e1055]: Lambda · eu-west-1 · regional
                    - generic [ref=e1056]:
                      - generic [ref=e1057]: 0 in · 0 out
                      - generic [ref=e1058]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1061]:
              - button "SafeRemediate-RollbackExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1062]:
                - generic [ref=e1063]:
                  - img [ref=e1065]
                  - generic [ref=e1068]:
                    - generic [ref=e1069]:
                      - generic [ref=e1070]: SafeRemediate-RollbackExecutor
                      - generic "Current graph data" [ref=e1071]
                    - generic [ref=e1073]: Lambda · eu-west-1 · regional
                    - generic [ref=e1074]:
                      - generic [ref=e1075]: 0 in · 0 out
                      - generic [ref=e1076]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1079]:
              - button "SafeRemediate-RollbackMonitor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1080]:
                - generic [ref=e1081]:
                  - img [ref=e1083]
                  - generic [ref=e1086]:
                    - generic [ref=e1087]:
                      - generic [ref=e1088]: SafeRemediate-RollbackMonitor
                      - generic "Current graph data" [ref=e1089]
                    - generic [ref=e1091]: Lambda · eu-west-1 · regional
                    - generic [ref=e1092]:
                      - generic [ref=e1093]: 0 in · 0 out
                      - generic [ref=e1094]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1097]:
              - button "SafeRemediate-ServiceAwareSimulator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1098]:
                - generic [ref=e1099]:
                  - img [ref=e1101]
                  - generic [ref=e1104]:
                    - generic [ref=e1105]:
                      - generic [ref=e1106]: SafeRemediate-ServiceAwareSimulator
                      - generic "Current graph data" [ref=e1107]
                    - generic [ref=e1109]: Lambda · eu-west-1 · regional
                    - generic [ref=e1110]:
                      - generic [ref=e1111]: 0 in · 0 out
                      - generic [ref=e1112]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1115]:
              - button "SafeRemediate-ServiceCatalogBuilder Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1116]:
                - generic [ref=e1117]:
                  - img [ref=e1119]
                  - generic [ref=e1122]:
                    - generic [ref=e1123]:
                      - generic [ref=e1124]: SafeRemediate-ServiceCatalogBuilder
                      - generic "Current graph data" [ref=e1125]
                    - generic [ref=e1127]: Lambda · eu-west-1 · regional
                    - generic [ref=e1128]:
                      - generic [ref=e1129]: 0 in · 0 out
                      - generic [ref=e1130]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1133]:
              - button "SafeRemediate-SimulationEngine Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1134]:
                - generic [ref=e1135]:
                  - img [ref=e1137]
                  - generic [ref=e1140]:
                    - generic [ref=e1141]:
                      - generic [ref=e1142]: SafeRemediate-SimulationEngine
                      - generic "Current graph data" [ref=e1143]
                    - generic [ref=e1145]: Lambda · eu-west-1 · regional
                    - generic [ref=e1146]:
                      - generic [ref=e1147]: 0 in · 0 out
                      - generic [ref=e1148]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1151]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1152]:
                - generic [ref=e1153]:
                  - img [ref=e1155]
                  - generic [ref=e1158]:
                    - generic [ref=e1159]:
                      - generic [ref=e1160]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e1161]
                    - generic [ref=e1163]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1164]:
                      - generic [ref=e1165]: 0 in · 0 out
                      - generic [ref=e1166]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1169]:
              - button "SafeRemediate-WizWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1170]:
                - generic [ref=e1171]:
                  - img [ref=e1173]
                  - generic [ref=e1176]:
                    - generic [ref=e1177]:
                      - generic [ref=e1178]: SafeRemediate-WizWebhook
                      - generic "Current graph data" [ref=e1179]
                    - generic [ref=e1181]: Lambda · eu-west-1 · regional
                    - generic [ref=e1182]:
                      - generic [ref=e1183]: 0 in · 0 out
                      - generic [ref=e1184]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1187]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1188]:
                - generic [ref=e1189]:
                  - img [ref=e1191]
                  - generic [ref=e1194]:
                    - generic [ref=e1195]:
                      - generic [ref=e1196]: sg_state
                      - generic "Current graph data" [ref=e1197]
                    - generic [ref=e1199]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1200]:
                      - generic [ref=e1201]: 0 in · 0 out
                      - generic [ref=e1202]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1205]:
              - button "VPCTrafficGenerator Current graph data Lambda · eu-west-1b · app 0 in · 0 out No runtime timestamp" [ref=e1206]:
                - generic [ref=e1207]:
                  - img [ref=e1209]
                  - generic [ref=e1212]:
                    - generic [ref=e1213]:
                      - generic [ref=e1214]: VPCTrafficGenerator
                      - generic "Current graph data" [ref=e1215]
                    - generic [ref=e1217]: Lambda · eu-west-1b · app
                    - generic [ref=e1218]:
                      - generic [ref=e1219]: 0 in · 0 out
                      - generic [ref=e1220]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1223]:
      - text: Live read from
      - generic [ref=e1224]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1225]
```

# Test source

```ts
  11  |   railHeaderBadgeOverlaps,
  12  |   routeSnapshot,
  13  | } from "./topology-fixture"
  14  | 
  15  | /**
  16  |  * CF01 — the Identity & access lens as a 1:1 twin of the Network view, in a
  17  |  * real browser: the IAM roles lane, the trust entrances in the strip, one
  18  |  * coloured line per kind of access, motion only on observed use, and the
  19  |  * honesty footer — measured at three viewports.
  20  |  *
  21  |  * The identity block is the backend emitter's own v1 + graph fixture
  22  |  * (__tests__/fixtures/estate-identity-access.json, provenance in the file)
  23  |  * remapped onto the captured alon-prod topology snapshot this harness
  24  |  * already serves: same account, region and VPC as the snapshot, the role
  25  |  * bound to one EC2 chip the snapshot draws, plus one outside-account trust
  26  |  * statement so an entrance exists. Fixture data in a test file — the product
  27  |  * never sees it outside the spec.
  28  |  */
  29  | 
  30  | const IDENTITY_FIXTURE = JSON.parse(
  31  |   fs.readFileSync(path.join(process.cwd(), "__tests__/fixtures/estate-identity-access.json"), "utf8"),
  32  | )
  33  | const EMITTER_ACCOUNT = "416651950952"
  34  | const EMITTER_VPC = "vpc-1"
  35  | const OUTSIDE_ACCOUNT = "999988887777"
  36  | 
  37  | /** The EC2 chip in the snapshot's own VPC that the role will run as. */
  38  | function boundWorkload(): { id: string; name: string } {
  39  |   const node = (SNAPSHOT.nodes as Array<{ id: string; name: string; type: string; vpc_id?: string | null }>).find(
  40  |     n => n.type === "EC2" && n.vpc_id === SNAPSHOT.vpc_id,
  41  |   )
  42  |   if (!node) throw new Error("snapshot carries no EC2 chip in its own VPC")
  43  |   return { id: node.id, name: node.name }
  44  | }
  45  | 
  46  | function identitySnapshot() {
  47  |   const account = String(SNAPSHOT.account_id)
  48  |   const region = String(SNAPSHOT.region)
  49  |   const vpc = String(SNAPSHOT.vpc_id)
  50  |   const workload = boundWorkload()
  51  |   const remapped = JSON.parse(
  52  |     JSON.stringify(IDENTITY_FIXTURE.ready).split(EMITTER_ACCOUNT).join(account).split(JSON.stringify(EMITTER_VPC)).join(JSON.stringify(vpc)),
  53  |   )
  54  |   remapped.scope = { customer_id: ORGANIZATION.customer_id, system_name: SYSTEM, account_id: account, region, vpc_id: vpc }
  55  |   remapped.roles = remapped.roles.map((role: { workload_ids: string[] }) => ({ ...role, workload_ids: [workload.id] }))
  56  |   const graph = remapped.identity_graph
  57  |   graph.scope = {
  58  |     level: "account",
  59  |     customer_id: ORGANIZATION.customer_id,
  60  |     account_id: account,
  61  |     inventory_generation: remapped.inventory_authority.generation,
  62  |     region: null,
  63  |     system_name: null,
  64  |     vpc_id: null,
  65  |   }
  66  |   const serviceTrust = graph.edges.find(
  67  |     (edge: { family: string; source: { node_kind: string } }) => edge.family === "ROLE_TRUST_POLICY" && edge.source.node_kind === "service_principal",
  68  |   )
  69  |   if (!serviceTrust) throw new Error("emitter fixture carries no service-principal trust statement to mirror")
  70  |   graph.edges.push({
  71  |     ...serviceTrust,
  72  |     source: {
  73  |       node_kind: "aws_account_principal",
  74  |       arn: `arn:aws:iam::${OUTSIDE_ACCOUNT}:root`,
  75  |       name: `arn:aws:iam::${OUTSIDE_ACCOUNT}:root`,
  76  |       resource_uid: null,
  77  |       resolved: false,
  78  |       unresolved_reason: "ENDPOINT_NOT_A_PROJECTED_RESOURCE",
  79  |     },
  80  |     effect: "Allow",
  81  |     has_conditions: true,
  82  |     is_wildcard_principal: false,
  83  |     principal_kind: "AWS",
  84  |   })
  85  |   graph.edges_total = graph.edges.length
  86  |   return { snapshot: { ...SNAPSHOT, identity_access: remapped }, workload }
  87  | }
  88  | 
  89  | const VIEWPORTS = [
  90  |   { name: "1024x720", width: 1024, height: 720 },
  91  |   { name: "1366x768", width: 1366, height: 768 },
  92  |   { name: "1600x900", width: 1600, height: 900 },
  93  | ] as const
  94  | 
  95  | const KIND_COLOR = { runs_as: "#4338CA", may_assume: "#7C3AED", data: "#1E8E3E" } as const
  96  | 
  97  | async function strokeOf(page: Page, family: string): Promise<string | null> {
  98  |   return page.locator(`g[data-flow-family="${family}"] path[data-flow-line="stroke"]`).first().getAttribute("stroke")
  99  | }
  100 | 
  101 | for (const vp of VIEWPORTS) {
  102 |   test(`the identity lens is the Network frame with identity inputs at ${vp.name} · glance`, async ({ context, page }) => {
  103 |     test.setTimeout(150_000)
  104 |     const { snapshot, workload } = identitySnapshot()
  105 |     await seedAuthCookie(context)
  106 |     await routeSnapshot(page, snapshot)
  107 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  108 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  109 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  110 |     await page.getByRole("tab", { name: "Identity & access" }).click()
> 111 |     await page.getByTestId("topology-estate-density-glance").click()
      |                                                              ^ Error: locator.click: Test timeout of 150000ms exceeded.
  112 | 
  113 |     // --- the SAME frame, with identity inputs --------------------------------
  114 |     await expect(page.getByTestId("topology-vpc-frame").first()).toBeVisible()
  115 |     const lane = page.getByTestId("topology-iam-roles-tier")
  116 |     await expect(lane, `no IAM roles lane at ${vp.name}`).toBeVisible()
  117 |     await expect(lane).toContainText("IAM · Roles (1)")
  118 |     const roleChips = lane.locator("[data-flow-id]")
  119 |     await expect(roleChips).toHaveCount(1)
  120 |     await expect(roleChips.first().locator("img")).toHaveCount(1)
  121 |     await expect(page.locator(`[data-flow-id="${workload.id}"]`).first()).toBeVisible()
  122 |     await expect(page.getByTestId("topology-internet-node")).toHaveCount(0)
  123 | 
  124 |     // --- trust entrances in the strip ----------------------------------------
  125 |     const principals = page.getByTestId("topology-identity-principals")
  126 |     await expect(principals).toContainText("Trust entrances")
  127 |     const entrance = page.locator('[data-testid="topology-identity-principal"]')
  128 |     await expect(entrance).toHaveCount(1)
  129 |     await expect(entrance.first()).toHaveAttribute("data-principal-class", "other_account")
  130 |     await expect(entrance.first()).toContainText("other account")
  131 | 
  132 |     // --- one line per kind of access, colour by kind, motion only on observed --
  133 |     await expect(page.locator('g[data-flow-family="WORKLOAD_USES_ROLE"]')).toHaveCount(1, { timeout: 30_000 })
  134 |     await expect(page.locator('g[data-flow-family="ROLE_TRUST_POLICY"]')).toHaveCount(1)
  135 |     await expect(page.locator('g[data-flow-family="ROLE_ACTION_DECISION"]')).toHaveCount(1)
  136 |     expect(await strokeOf(page, "WORKLOAD_USES_ROLE")).toBe(KIND_COLOR.runs_as)
  137 |     expect(await strokeOf(page, "ROLE_TRUST_POLICY")).toBe(KIND_COLOR.may_assume)
  138 |     expect(await strokeOf(page, "ROLE_ACTION_DECISION")).toBe(KIND_COLOR.data)
  139 |     const runsAs = page.locator('g[data-flow-family="WORKLOAD_USES_ROLE"]').first()
  140 |     await expect(runsAs).toHaveAttribute("data-flow-motion", "none")
  141 |     await expect(runsAs).toHaveAttribute("data-flow-source", workload.id)
  142 |     await expect(runsAs.locator("text").first()).toHaveText("instance profile")
  143 |     const trust = page.locator('g[data-flow-family="ROLE_TRUST_POLICY"]').first()
  144 |     await expect(trust).toHaveAttribute("data-flow-motion", "none")
  145 |     await expect(trust.locator("text").first()).toHaveText("may assume · conditioned")
  146 |     const reach = page.locator('g[data-flow-family="ROLE_ACTION_DECISION"]').first()
  147 |     await expect(reach).toHaveAttribute("data-flow-plane", "observed")
  148 |     await expect(reach).toHaveAttribute("data-flow-motion", "authoritative")
  149 |     await expect(reach.locator('[data-testid="topology-flow-running-track"]')).toHaveCount(1)
  150 |     await expect(reach.locator("text").first()).toHaveText("s3 · explicit 1 · used 1")
  151 |     // The reach ends on a SERVICE anchor, never on a named bucket the row cannot name.
  152 |     await expect(reach).toHaveAttribute("data-flow-target", "__identity:service:s3__")
  153 |     await expect(page.locator('[data-flow-id="__identity:service:s3__"]').first()).toBeVisible()
  154 | 
  155 |     // --- legend and honesty footer -------------------------------------------
  156 |     const legend = page.getByTestId("identity-lens-legend")
  157 |     await expect(legend).toContainText("Colour · kind of access")
  158 |     await expect(legend).toContainText("Style · evidence")
  159 |     await expect(legend).toContainText("Moving = observed with a named generation")
  160 |     const footer = page.getByTestId("identity-twin-footer")
  161 |     await expect(footer).toContainText("1 role bound to a workload on this canvas")
  162 |     await expect(page.getByTestId("topology-flow-legend")).toHaveCount(0)
  163 | 
  164 |     // --- no clipped or overlapping chrome in the lane header, no badge on a header --
  165 |     const defects = await chromeTextDefects(page, '[data-testid="topology-iam-roles-tier"] [data-flow-obstacle="iam-roles-tier-header"]')
  166 |     expect(defects.overlaps, `overlapping lane header text at ${vp.name}`).toEqual([])
  167 |     expect(defects.collapsed, `collapsed lane header text at ${vp.name}`).toEqual([])
  168 |     expect(await railHeaderBadgeOverlaps(page), `a badge sits on a rail header at ${vp.name}`).toEqual([])
  169 | 
  170 |     await page.screenshot({ path: `test-results/estate-identity-default-${vp.name}.png`, fullPage: false })
  171 | 
  172 |     // --- selecting the role: the panel is the shared one --------------------
  173 |     await roleChips.first().click()
  174 |     const panel = page.getByTestId("topology-service-detail-panel")
  175 |     await expect(panel).toBeVisible()
  176 |     await expect(panel).toContainText("Identity & access")
  177 |     await page.screenshot({ path: `test-results/estate-identity-selected-${vp.name}.png`, fullPage: false })
  178 |   })
  179 | }
  180 | 
```