# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-egress-map-fixture.spec.ts >> the IGW continues into the external lane at 1512x771 · inventory
- Location: tests/integration/topology-estate-egress-map-fixture.spec.ts:148:9

# Error details

```
Error: the external lane overlaps data-tier cell 1 at 1512x771·inventory

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 4743
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
      - button "RDS (2)" [pressed] [ref=e62]
      - button "Neptune (2)" [pressed] [ref=e63]
      - button "TargetGroup (2)" [pressed] [ref=e64]
      - button "AutoScalingGroup (2)" [pressed] [ref=e65]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e66]: System-wide
      - button "S3 (10)" [pressed] [ref=e67]
      - button "DynamoDB (8)" [pressed] [ref=e68]
      - button "Lambda (6)" [pressed] [ref=e69]
      - button "EventBridge (6)" [pressed] [ref=e70]
      - button "Show all" [ref=e71]
      - button "Clear all" [ref=e72]
    - generic [ref=e73]:
      - main [ref=e74]:
        - generic [ref=e75]:
          - tablist "Estate view" [ref=e76]:
            - tab "Command map" [ref=e77]
            - tab "Network topology" [selected] [ref=e78]
          - group "Map density" [ref=e79]:
            - button "Glance" [ref=e80]
            - button "Inventory" [active] [ref=e81]
          - button "Shared neighbors" [pressed] [ref=e82]
          - button "Open map fullscreen" [ref=e83]:
            - img [ref=e84]
            - text: Map fullscreen
        - generic [ref=e91]:
          - generic [ref=e92]:
            - generic [ref=e93]:
              - generic [ref=e94]: Platform map
              - generic [ref=e95]: 1 VPC · 2 AZ · 6 subnets · 41 resources
            - generic [ref=e96]:
              - generic [ref=e97]: Map lens
              - generic [ref=e98]:
                - button "Architecture" [ref=e99]:
                  - img [ref=e100]
                  - text: Architecture
                - button "Dependencies" [pressed] [ref=e110]:
                  - img [ref=e111]
                  - text: Dependencies
                - button "Attack paths" [ref=e115]:
                  - img [ref=e116]
                  - text: Attack paths
          - generic "Dependency line colors" [ref=e118]:
            - generic [ref=e119]: Flow colors
            - generic [ref=e120]:
              - img [ref=e121]
              - generic [ref=e123]: Service call
            - generic [ref=e124]:
              - img [ref=e125]
              - generic [ref=e127]: AWS data service
            - generic [ref=e128]:
              - img [ref=e129]
              - generic [ref=e131]: VPC endpoint
            - generic [ref=e132]:
              - img [ref=e133]
              - generic [ref=e135]: Internet egress
            - generic [ref=e136]:
              - img [ref=e137]
              - generic [ref=e139]: Database
            - generic [ref=e140]:
              - img [ref=e141]
              - generic [ref=e143]: Exposure / attack
            - generic [ref=e144]: Moving = authoritative observed
            - generic [ref=e148]:
              - img [ref=e149]
              - text: Outlined motion = historical direction
            - generic [ref=e152]:
              - img [ref=e153]
              - text: Solid = configured
            - generic [ref=e154]:
              - img [ref=e155]
              - text: Dashed = inferred / unverified
          - generic [ref=e156]:
            - generic [ref=e157]: Confirmed TCP paths
            - generic [ref=e158]: Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.
          - generic [ref=e160]:
            - generic [ref=e161]: Flow-log coverage
            - generic [ref=e162]: Partly covered
            - generic [ref=e163]: 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
            - button "Coverage details (2)" [ref=e164]
          - generic [ref=e165]:
            - generic [ref=e166]:
              - img [ref=e168]
              - generic [ref=e173]:
                - generic [ref=e174]: Users
                - generic [ref=e175]: Clients & operators
            - generic [ref=e177]:
              - img [ref=e179]
              - generic [ref=e184]:
                - generic [ref=e185]: Internet
                - generic [ref=e186]: Public path via IGW · alon-prod-igw
          - generic [ref=e187]:
            - generic [ref=e188]: ☁ AWS Cloud · acct 745783559495
            - generic [ref=e189]:
              - generic [ref=e190]: Region · eu-west-1
              - generic [ref=e191]:
                - generic [ref=e192]:
                  - generic [ref=e193]:
                    - generic "vpc-0329e985173bed24f" [ref=e194]: VPC · vpc-0329e985173bed24f
                    - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e195]: SafeRemediate-Test-… ×3
                  - generic [ref=e197]:
                    - generic [ref=e201]:
                      - generic "eu-west-1a" [ref=e202]
                      - generic "eu-west-1b" [ref=e203]
                    - generic [ref=e204]:
                      - generic [ref=e205]:
                        - generic [ref=e206]: WEB TIER
                        - generic [ref=e208]:
                          - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e209]':
                            - generic [ref=e210]:
                              - generic [ref=e211]: Public · SafeRemediate-Test-Public-1
                              - generic [ref=e212]: 10.0.1.0/24
                            - button "high posture score …Frontend-1" [ref=e214]:
                              - generic "high posture score" [ref=e215]
                              - generic [ref=e218]: …Frontend-1
                          - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e219]':
                            - generic [ref=e220]:
                              - generic [ref=e221]: Public · SafeRemediate-Test-Public-2
                              - generic [ref=e222]: 10.0.2.0/24
                            - button "high posture score …Frontend-2" [ref=e224]:
                              - generic "high posture score" [ref=e225]
                              - generic [ref=e228]: …Frontend-2
                      - generic [ref=e229]:
                        - generic [ref=e230]: APPLICATION TIER
                        - generic [ref=e232]:
                          - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e233]':
                            - generic [ref=e234]:
                              - generic [ref=e235]: Private · SafeRemediate-Test-Private-App-1
                              - generic [ref=e236]: 10.0.10.0/24
                            - generic [ref=e237]: No workloads
                          - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e238]':
                            - generic [ref=e239]:
                              - generic [ref=e240]: Private · SafeRemediate-Test-Private-App-2
                              - generic [ref=e241]: 10.0.11.0/24
                            - button "quiet posture score …App-2" [ref=e243]:
                              - generic "quiet posture score" [ref=e244]
                              - generic [ref=e247]: …App-2
                      - generic [ref=e248]:
                        - generic [ref=e249]: DATABASE TIER
                        - generic [ref=e251]:
                          - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e252]':
                            - generic [ref=e253]:
                              - generic [ref=e254]: Data · SafeRemediate-Test-Private-DB-1
                              - generic [ref=e255]: 10.0.20.0/24
                            - generic [ref=e256]:
                              - button "quiet posture score saferemediate-test-db" [ref=e257]:
                                - generic "quiet posture score" [ref=e258]
                                - generic [ref=e261]: saferemediate-test-db
                              - button "Posture not scored fixture-neptune-1" [ref=e262]:
                                - generic "Posture not scored" [ref=e263]
                                - generic [ref=e266]: fixture-neptune-1
                          - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e267]':
                            - generic [ref=e268]:
                              - generic [ref=e269]: Data · SafeRemediate-Test-Private-DB-2
                              - generic [ref=e270]: 10.0.21.0/24
                            - generic [ref=e271]: No workloads
                    - generic [ref=e272]:
                      - generic [ref=e273]: IAM CP
                      - generic [ref=e274]:
                        - generic [ref=e275]: IAM · Control plane
                        - generic [ref=e276]:
                          - generic [ref=e277]: Roles attached to this VPC
                          - generic [ref=e278]: derived from instance-profile + USES_ROLE edges · 12 roles · 2 critical gaps · 6 recomputing
                        - generic [ref=e279]:
                          - generic [ref=e280]:
                            - generic "AlonIAMTest" [ref=e281]
                            - generic [ref=e283]: 1/1 unused
                            - generic [ref=e284]: recomputing · usage edges present, scalar stale
                            - generic [ref=e285]:
                              - generic [ref=e286]: AlonIAMTest-traffic-generator
                              - generic [ref=e287]: USES_ROLE
                          - generic [ref=e288]:
                            - generic "cyntro-demo-ec2-s3-role-least-privilege" [ref=e289]
                            - generic [ref=e291]: 6/6 unused
                            - generic [ref=e292]: recomputing · usage edges present, scalar stale
                            - generic [ref=e293]:
                              - generic [ref=e294]: SafeRemediate-Test-App-2
                              - generic [ref=e295]: USES_ROLE
                          - generic [ref=e296]:
                            - generic "cyntro-demo-ec2-s3-role-lp-202602081638" [ref=e297]
                            - generic [ref=e299]: 6/6 unused
                            - generic [ref=e300]: recomputing · usage edges present, scalar stale
                            - generic [ref=e301]:
                              - generic [ref=e302]: SafeRemediate-Test-App-2
                              - generic [ref=e303]: USES_ROLE
                          - generic [ref=e304]:
                            - generic "cyntro-demo-ec2-s3-role-lp-202602081656" [ref=e305]
                            - generic [ref=e307]: 6/6 unused
                            - generic [ref=e308]: recomputing · usage edges present, scalar stale
                            - generic [ref=e309]:
                              - generic [ref=e310]: SafeRemediate-Test-App-2
                              - generic [ref=e311]: USES_ROLE
                          - generic [ref=e312]:
                            - generic "alon-prod-3tier-app-role" [ref=e313]
                            - generic [ref=e315]: 23/27 unused
                            - generic [ref=e316]: 85% gap · never remediated
                          - generic [ref=e317]:
                            - generic "alon-prod-3tier-web-role" [ref=e318]
                            - generic [ref=e320]: 23/27 unused
                            - generic [ref=e321]: 85% gap · never remediated
                          - generic [ref=e322]:
                            - generic "cyntro-demo-cmk-consumer" [ref=e323]
                            - generic [ref=e325]: 5/7 unused
                            - generic [ref=e326]: 71% gap · never remediated
                          - generic [ref=e327]:
                            - generic "SafeRemediate-Lambda-Remediation-Role" [ref=e328]
                            - generic [ref=e330]: 6/10 unused
                            - generic [ref=e331]: 60% gap · remediation 2026-04-04
                            - generic [ref=e332]:
                              - generic [ref=e333]: PaymentTrafficGenerator
                              - generic [ref=e334]: SafeRemediate-BehaviorAnalyzer
                              - generic [ref=e335]: SafeRemediate-ConfidenceScorer
                              - generic [ref=e336]: + 2 more
                              - generic [ref=e337]: USES_ROLE · shared
                          - generic [ref=e338]:
                            - generic "cyntro-demo-ec2-s3-role" [ref=e339]
                            - generic [ref=e341]: 4/7 unused
                            - generic [ref=e342]: 57% gap · never remediated
                            - generic [ref=e343]:
                              - generic [ref=e344]: SafeRemediate-Test-App-2
                              - generic [ref=e345]: via instance profile · USES_ROLE · shared
                          - generic [ref=e346]:
                            - generic "alon-demo-ec2-role" [ref=e347]
                            - generic [ref=e349]: 25/46 unused
                            - generic [ref=e350]: 54% gap · remediation 2026-05-24
                          - generic [ref=e351]:
                            - generic "CyntroEC2S3Role" [ref=e352]
                            - generic [ref=e354]: 0/0 actions
                            - generic [ref=e355]: recomputing · usage edges present, scalar stale
                            - generic [ref=e356]:
                              - generic [ref=e357]: SafeRemediate-Test-Frontend-2
                              - generic [ref=e358]: via instance profile · USES_ROLE · shared
                          - generic [ref=e359]:
                            - generic "cyntro-demo-frontend-ssm-role" [ref=e360]
                            - generic [ref=e362]: 0/0 actions
                            - generic [ref=e363]: recomputing · usage edges present, scalar stale
                            - generic [ref=e364]:
                              - generic [ref=e365]: SafeRemediate-Test-Frontend-1
                              - generic [ref=e366]: via instance profile · USES_ROLE · shared
                - generic [ref=e367]:
                  - generic [ref=e368]: VPC boundary
                  - generic [ref=e369]:
                    - generic [ref=e370]: ↑ Internet
                    - generic [ref=e371]:
                      - button "IGW alon-prod-igw" [ref=e372]:
                        - img [ref=e374]
                        - generic [ref=e377]: IGW
                        - generic [ref=e378]: alon-prod-igw
                      - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e379]: "egress: 9 workloads"
                  - generic [ref=e381]:
                    - generic [ref=e382]: Endpoints (4)
                    - generic [ref=e383]:
                      - button "VPCE IF EC2 Messages" [ref=e384]:
                        - img [ref=e386]
                        - generic [ref=e390]: VPCE
                        - generic [ref=e391]: IF
                        - generic [ref=e392]: EC2 Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e393]: "use: not observed"
                    - generic [ref=e394]:
                      - button "VPCE GW Amazon S3" [ref=e395]:
                        - img [ref=e397]
                        - generic [ref=e401]: VPCE
                        - generic [ref=e402]: GW
                        - generic [ref=e403]: Amazon S3
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e404]: "use: not observed"
                    - generic [ref=e405]:
                      - button "VPCE IF AWS Systems Manager" [ref=e406]:
                        - img [ref=e408]
                        - generic [ref=e412]: VPCE
                        - generic [ref=e413]: IF
                        - generic [ref=e414]: AWS Systems Manager
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e415]: "use: 3 workloads"
                    - generic [ref=e416]:
                      - button "VPCE IF SSM Messages" [ref=e417]:
                        - img [ref=e419]
                        - generic [ref=e423]: VPCE
                        - generic [ref=e424]: IF
                        - generic [ref=e425]: SSM Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e426]: "use: 1 workload"
                - generic [ref=e427]:
                  - generic [ref=e428]: Outside the VPC
                  - generic [ref=e429]: Destinations observed this generation · NAT → IGW is configured routing
                  - generic [ref=e430]:
                    - generic "S3 — attributed by the flow-log evidence" [ref=e431]:
                      - generic [ref=e432]: S3
                      - generic [ref=e433]: AWS service
                    - generic "3.253.225.145 — an address; the evidence names no service" [ref=e434]:
                      - generic [ref=e435]: 3.253.225.145
                      - generic [ref=e436]: address
                    - generic "3.5.67.254 — an address; the evidence names no service" [ref=e437]:
                      - generic [ref=e438]: 3.5.67.254
                      - generic [ref=e439]: address · 8 workloads
                    - generic "3.5.69.34 — an address; the evidence names no service" [ref=e440]:
                      - generic [ref=e441]: 3.5.69.34
                      - generic [ref=e442]: address · 8 workloads
                    - generic "3.5.72.119 — an address; the evidence names no service" [ref=e443]:
                      - generic [ref=e444]: 3.5.72.119
                      - generic [ref=e445]: address · 8 workloads
                    - generic "3.5.72.73 — an address; the evidence names no service" [ref=e446]:
                      - generic [ref=e447]: 3.5.72.73
                      - generic [ref=e448]: address · 8 workloads
                    - button "+3 more" [ref=e449]
                  - generic [ref=e451]:
                    - generic [ref=e452]:
                      - generic [ref=e453]: 9 workloads
                      - generic [ref=e456]: ▸
                      - generic [ref=e457]:
                        - generic "NAT nat-fixture0a1b2c3d4" [ref=e458]:
                          - text: NAT
                          - generic [ref=e459]: nat-fixture0a1b2c3d4
                        - generic [ref=e462]: ▸
                      - generic [ref=e463]:
                        - generic "IGW igw-03bb3f19b706abbc4" [ref=e464]:
                          - text: IGW
                          - generic [ref=e465]: igw-03bb3f19b706abbc4
                        - generic [ref=e468]: ▸
                    - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [ref=e469]:
                      - img [ref=e471]
                      - generic [ref=e476]:
                        - generic [ref=e477]: External destinations
                        - generic [ref=e478]: 9 workloads · up to 2579 distinct · addresses sampled
                - generic [ref=e479]:
                  - generic [ref=e481]: Not in this VPC
                  - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e483]:
                    - generic [ref=e484]: ALB · alon-prod-3tier-alb
                    - generic [ref=e485]: VPC vpc-086bcc2186…
                    - generic [ref=e486]: · payment-production
                - generic [ref=e488]:
                  - generic [ref=e489]:
                    - generic [ref=e490]:
                      - generic [ref=e491]: Lambda runtime (6)
                      - generic [ref=e492]:
                        - text: outside subnet grid · 6 attachment unverified
                        - generic "4 of 12 chips omit this shared prefix" [ref=e493]: · SafeRemediate-… ×4
                      - button "S3 traffic from 4 of 6 functions" [ref=e495]
                    - generic [ref=e496]:
                      - generic [ref=e497]: Triggers (6)
                      - generic [ref=e498]:
                        - button "Posture not scored fixture-frequent" [ref=e499]:
                          - generic "Posture not scored" [ref=e500]
                          - generic [ref=e503]: fixture-frequent
                        - button "Posture not scored fixture-every_6h" [ref=e504]:
                          - generic "Posture not scored" [ref=e505]
                          - generic [ref=e508]: fixture-every_6h
                        - button "Posture not scored fixture-daily" [ref=e509]:
                          - generic "Posture not scored" [ref=e510]
                          - generic [ref=e513]: fixture-daily
                        - button "Posture not scored fixture-nightly_burst" [ref=e514]:
                          - generic "Posture not scored" [ref=e515]
                          - generic [ref=e518]: fixture-nightly_burst
                        - button "Posture not scored fixture-weekly" [ref=e519]:
                          - generic "Posture not scored" [ref=e520]
                          - generic [ref=e523]: fixture-weekly
                        - button "Posture not scored fixture-monthly" [ref=e524]:
                          - generic "Posture not scored" [ref=e525]
                          - generic [ref=e528]: fixture-monthly
                    - generic [ref=e530]:
                      - button "quiet posture score AlonIAMTest-traffic-generator Lambda" [ref=e531]:
                        - generic "quiet posture score" [ref=e532]
                        - generic [ref=e535]: AlonIAMTest-traffic-generator
                        - generic [ref=e536]: Lambda
                      - button "quiet posture score PaymentTrafficGenerator Lambda" [ref=e537]:
                        - generic "quiet posture score" [ref=e538]
                        - generic [ref=e541]: PaymentTrafficGenerator
                        - generic [ref=e542]: Lambda
                      - button "quiet posture score …BehaviorAnalyzer Lambda" [ref=e543]:
                        - generic "quiet posture score" [ref=e544]
                        - generic [ref=e547]: …BehaviorAnalyzer
                        - generic [ref=e548]: Lambda
                      - button "quiet posture score …ConfidenceScorer Lambda" [ref=e549]:
                        - generic "quiet posture score" [ref=e550]
                        - generic [ref=e553]: …ConfidenceScorer
                        - generic [ref=e554]: Lambda
                      - button "quiet posture score …CreateCheckpoint Lambda" [ref=e555]:
                        - generic "quiet posture score" [ref=e556]
                        - generic [ref=e559]: …CreateCheckpoint
                        - generic [ref=e560]: Lambda
                      - button "quiet posture score …PrismaWebhook Lambda" [ref=e561]:
                        - generic "quiet posture score" [ref=e562]
                        - generic [ref=e565]: …PrismaWebhook
                        - generic [ref=e566]: Lambda
                  - generic [ref=e568]:
                    - generic [ref=e569]:
                      - text: Regional · S3 / DDB (18)
                      - generic "3 of 18 chips omit this shared prefix" [ref=e570]: SafeRemediate-… ×3
                    - generic [ref=e572]:
                      - button "quiet posture score …Executions DynamoDB" [ref=e573]:
                        - generic "quiet posture score" [ref=e574]
                        - generic [ref=e577]: …Executions
                        - generic [ref=e578]: DynamoDB
                      - button "quiet posture score …Findings DynamoDB" [ref=e579]:
                        - generic "quiet posture score" [ref=e580]
                        - generic [ref=e583]: …Findings
                        - generic [ref=e584]: DynamoDB
                      - button "quiet posture score …Simulations DynamoDB" [ref=e585]:
                        - generic "quiet posture score" [ref=e586]
                        - generic [ref=e589]: …Simulations
                        - generic [ref=e590]: DynamoDB
                      - button "quiet posture score alon-demo-data-bucket-745783559495 S3" [ref=e591]:
                        - generic "quiet posture score" [ref=e592]
                        - generic [ref=e595]: alon-demo-data-bucket-745783559495
                        - generic [ref=e596]: S3
                      - button "quiet posture score aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth S3" [ref=e597]:
                        - generic "quiet posture score" [ref=e598]
                        - generic [ref=e601]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                        - generic [ref=e602]: S3
                      - button "quiet posture score cyntro-demo-analytics-745783559495 S3" [ref=e603]:
                        - generic "quiet posture score" [ref=e604]
                        - generic [ref=e607]: cyntro-demo-analytics-745783559495
                        - generic [ref=e608]: S3
                      - button "quiet posture score cyntro-demo-eu S3" [ref=e609]:
                        - generic "quiet posture score" [ref=e610]
                        - generic [ref=e613]: cyntro-demo-eu
                        - generic [ref=e614]: S3
                      - button "quiet posture score cyntro-demo-prod-data-745783559495 S3" [ref=e615]:
                        - generic "quiet posture score" [ref=e616]
                        - generic [ref=e619]: cyntro-demo-prod-data-745783559495
                        - generic [ref=e620]: S3
                      - button "quiet posture score cyntronewtestbucket S3" [ref=e621]:
                        - generic "quiet posture score" [ref=e622]
                        - generic [ref=e625]: cyntronewtestbucket
                        - generic [ref=e626]: S3
                      - button "quiet posture score cyntrotest2 S3" [ref=e627]:
                        - generic "quiet posture score" [ref=e628]
                        - generic [ref=e631]: cyntrotest2
                        - generic [ref=e632]: S3
                      - button "quiet posture score impaciq-findings DynamoDB" [ref=e633]:
                        - generic "quiet posture score" [ref=e634]
                        - generic [ref=e637]: impaciq-findings
                        - generic [ref=e638]: DynamoDB
                      - button "quiet posture score impaciq-remediation-history DynamoDB" [ref=e639]:
                        - generic "quiet posture score" [ref=e640]
                        - generic [ref=e643]: impaciq-remediation-history
                        - generic [ref=e644]: DynamoDB
                      - button "quiet posture score impaciq-scan-status DynamoDB" [ref=e645]:
                        - generic "quiet posture score" [ref=e646]
                        - generic [ref=e649]: impaciq-scan-status
                        - generic [ref=e650]: DynamoDB
                      - button "quiet posture score least_privilege_role_state DynamoDB" [ref=e651]:
                        - generic "quiet posture score" [ref=e652]
                        - generic [ref=e655]: least_privilege_role_state
                        - generic [ref=e656]: DynamoDB
                      - button "quiet posture score saferemediate-access-logs-745783559495 S3" [ref=e657]:
                        - generic "quiet posture score" [ref=e658]
                        - generic [ref=e661]: saferemediate-access-logs-745783559495
                        - generic [ref=e662]: S3
                      - button "quiet posture score saferemediate-demo-cloudtrail-745783559495 S3" [ref=e663]:
                        - generic "quiet posture score" [ref=e664]
                        - generic [ref=e667]: saferemediate-demo-cloudtrail-745783559495
                        - generic [ref=e668]: S3
                      - button "quiet posture score saferemediate-logs-745783559495 S3" [ref=e669]:
                        - generic "quiet posture score" [ref=e670]
                        - generic [ref=e673]: saferemediate-logs-745783559495
                        - generic [ref=e674]: S3
                      - button "quiet posture score sg_state DynamoDB" [ref=e675]:
                        - generic "quiet posture score" [ref=e676]
                        - generic [ref=e679]: sg_state
                        - generic [ref=e680]: DynamoDB
              - button "Logical groups · members carry the placement (6) Show members" [ref=e682]:
                - generic [ref=e683]: Logical groups · members carry the placement (6)
                - generic [ref=e684]: Show members
          - generic [ref=e685]:
            - button "Diagnostics 6 serverless · 51 flows ▴" [ref=e686]:
              - generic [ref=e687]: Diagnostics
              - generic [ref=e688]: 6 serverless · 51 flows ▴
            - generic [ref=e689]:
              - generic [ref=e690]:
                - generic [ref=e691]: Serverless compute (6)
                - generic [ref=e692]:
                  - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e693]:
                    - generic [ref=e695]:
                      - generic [ref=e697]: AlonIAMTest-traffic-generator
                      - generic [ref=e698]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e699]: "24"
                  - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e700]:
                    - generic [ref=e702]:
                      - generic [ref=e704]: PaymentTrafficGenerator
                      - generic [ref=e705]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e706]: "18"
                  - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e707]:
                    - generic [ref=e709]:
                      - generic [ref=e711]: SafeRemediate-BehaviorAnalyzer
                      - generic [ref=e712]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e713]: "18"
                  - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e714]:
                    - generic [ref=e716]:
                      - generic [ref=e718]: SafeRemediate-ConfidenceScorer
                      - generic [ref=e719]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e720]: "18"
                  - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e721]:
                    - generic [ref=e723]:
                      - generic [ref=e725]: SafeRemediate-CreateCheckpoint
                      - generic [ref=e726]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e727]: "18"
                  - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e728]:
                    - generic [ref=e730]:
                      - generic [ref=e732]: SafeRemediate-PrismaWebhook
                      - generic [ref=e733]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e734]: "18"
              - generic [ref=e735]:
                - generic [ref=e736]:
                  - generic [ref=e737]: Observed traffic — animated arrows above
                  - generic [ref=e738]: 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
                - generic [ref=e739]: Listing 42 of 51 — the current lens and selection hide the rest. The counts above are the full evidence.
                - generic [ref=e740]:
                  - generic [ref=e741]:
                    - generic [ref=e742]: SafeRemediate-Test-App-2
                    - generic [ref=e743]: →
                    - generic [ref=e744]: vpce-0f983779fff3bbae7
                    - generic [ref=e745]: VPCE
                  - generic [ref=e746]:
                    - generic [ref=e747]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e748]: →
                    - generic [ref=e749]: vpce-0f983779fff3bbae7
                    - generic [ref=e750]: VPCE
                  - generic [ref=e751]:
                    - generic [ref=e752]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e753]: →
                    - generic [ref=e754]: vpce-04ffe43eea196bf89
                    - generic [ref=e755]: VPCE
                  - generic [ref=e756]:
                    - generic [ref=e757]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e758]: →
                    - generic [ref=e759]: vpce-0f983779fff3bbae7
                    - generic [ref=e760]: VPCE
                  - generic [ref=e761]:
                    - generic [ref=e762]: SafeRemediate-Test-App-2
                    - generic [ref=e763]: →
                    - generic [ref=e764]: Internet (via IGW)
                    - generic [ref=e765]: egress · 3 (ext 3)
                  - generic [ref=e766]:
                    - generic [ref=e767]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e768]: →
                    - generic [ref=e769]: Internet (via IGW)
                    - generic [ref=e770]: egress · 532 (ext 532 · S3 2)
                  - generic [ref=e771]:
                    - generic [ref=e772]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e773]: →
                    - generic [ref=e774]: Internet (via IGW)
                    - generic [ref=e775]: egress · 588 (ext 588)
                  - generic [ref=e776]:
                    - generic [ref=e777]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e778]: →
                    - generic [ref=e779]: saferemediate-test-db
                    - generic [ref=e780]: RDS · 5432
                  - generic [ref=e781]:
                    - generic [ref=e782]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e783]: →
                    - generic [ref=e784]: saferemediate-test-db
                    - generic [ref=e785]: RDS · 3306
                  - generic [ref=e786]:
                    - generic [ref=e787]: SafeRemediate-Test-App-2
                    - generic [ref=e788]: →
                    - generic [ref=e789]: saferemediate-test-db
                    - generic [ref=e790]: RDS
                  - generic [ref=e791]:
                    - generic [ref=e792]: fixture-tg-web
                    - generic [ref=e793]: →
                    - generic [ref=e794]: SafeRemediate-Test-App-2
                    - generic [ref=e795]: TARGETS
                  - generic [ref=e796]:
                    - generic [ref=e797]: fixture-tg-web
                    - generic [ref=e798]: →
                    - generic [ref=e799]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e800]: TARGETS
                  - generic [ref=e801]: + 30 more flows
              - generic [ref=e802]:
                - generic [ref=e803]: Encoding
                - generic [ref=e804]:
                  - generic [ref=e807]: Worst (carmine halo + pulse)
                  - generic [ref=e810]: High / elevated (ring only)
                  - generic [ref=e811]:
                    - generic [ref=e812]: ♛
                    - generic [ref=e813]: Crown-jewel halo
                  - generic [ref=e816]: Clean · remediated (teal ring)
                  - generic [ref=e819]: Stale (dimmed)
                  - generic [ref=e822]: Coverage gap (not collected)
          - img:
            - generic:
              - generic:
                - generic: VPCE · 4 flows
            - generic:
              - generic:
                - generic: Egress · 9 flows
            - generic:
              - generic:
                - generic: RDS · 5432
            - generic:
              - generic:
                - generic: RDS · 3306
            - generic:
              - generic:
                - generic: RDS
            - generic:
              - generic:
                - generic: 3 flows
            - generic:
              - generic:
                - generic: 3 flows
            - generic:
              - generic:
                - generic: 2 flows
            - generic:
              - generic:
                - generic: MEMBER_OF_CLUSTER
            - generic:
              - generic:
                - generic: MEMBER_OF_CLUSTER
            - generic:
              - generic:
                - generic: TARGETS ×6
            - generic:
              - generic:
                - generic: S3 access ×4
              - generic:
                - generic: API
              - generic:
                - generic: API
              - generic:
                - generic: API
              - generic:
                - generic: API
      - complementary [ref=e823]:
        - complementary [ref=e824]:
          - generic [ref=e825]:
            - generic [ref=e826]:
              - heading "Service index" [level=2] [ref=e827]
              - generic [ref=e828]: "41"
            - generic [ref=e829]:
              - img [ref=e830]
              - searchbox "Find service in topology" [ref=e833]
            - button "Filters" [ref=e836]:
              - img [ref=e837]
              - text: Filters
          - list [ref=e839]:
            - listitem [ref=e840]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e841]:
                - generic [ref=e842]:
                  - img [ref=e844]
                  - generic [ref=e846]:
                    - generic [ref=e847]:
                      - generic [ref=e848]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e849]
                    - generic [ref=e851]: EC2 · eu-west-1a · web
                    - generic [ref=e852]:
                      - generic [ref=e853]: 3 in · 4 out
                      - generic [ref=e854]:
                        - img [ref=e855]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e858]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e859]:
                - generic [ref=e860]:
                  - img [ref=e862]
                  - generic [ref=e864]:
                    - generic [ref=e865]:
                      - generic [ref=e866]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e867]
                    - generic [ref=e869]: EC2 · eu-west-1b · app
                    - generic [ref=e870]:
                      - generic [ref=e871]: 3 in · 3 out
                      - generic [ref=e872]:
                        - img [ref=e873]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e876]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e877]:
                - generic [ref=e878]:
                  - img [ref=e880]
                  - generic [ref=e882]:
                    - generic [ref=e883]:
                      - generic [ref=e884]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e885]
                    - generic [ref=e887]: EC2 · eu-west-1b · web
                    - generic [ref=e888]:
                      - generic [ref=e889]: 2 in · 3 out
                      - generic [ref=e890]:
                        - img [ref=e891]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e894]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e895]:
                - generic [ref=e896]:
                  - img [ref=e898]
                  - generic [ref=e900]:
                    - generic [ref=e901]:
                      - generic [ref=e902]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e903]
                    - generic [ref=e905]: S3 · eu-west-1 · regional
                    - generic [ref=e906]:
                      - generic [ref=e907]: 4 in · 0 out
                      - generic [ref=e908]:
                        - img [ref=e909]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e912]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e913]:
                - generic [ref=e914]:
                  - img [ref=e916]
                  - generic [ref=e918]:
                    - generic [ref=e919]:
                      - generic [ref=e920]: saferemediate-test-db
                      - generic "Current graph data" [ref=e921]
                    - generic [ref=e923]: RDS · eu-west-1a · data
                    - generic [ref=e924]:
                      - generic [ref=e925]: 4 in · 0 out
                      - generic [ref=e926]:
                        - img [ref=e927]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e930]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e931]:
                - generic [ref=e932]:
                  - img [ref=e934]
                  - generic [ref=e936]:
                    - generic [ref=e937]:
                      - generic [ref=e938]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e939]
                    - generic [ref=e941]: Lambda · eu-west-1 · regional
                    - generic [ref=e942]:
                      - generic [ref=e943]: 2 in · 1 out
                      - generic [ref=e944]:
                        - img [ref=e945]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e948]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e949]:
                - generic [ref=e950]:
                  - img [ref=e952]
                  - generic [ref=e954]:
                    - generic [ref=e955]:
                      - generic [ref=e956]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e957]
                    - generic [ref=e959]: Lambda · eu-west-1 · regional
                    - generic [ref=e960]:
                      - generic [ref=e961]: 2 in · 1 out
                      - generic [ref=e962]:
                        - img [ref=e963]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e966]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e967]:
                - generic [ref=e968]:
                  - img [ref=e970]
                  - generic [ref=e972]:
                    - generic [ref=e973]:
                      - generic [ref=e974]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e975]
                    - generic [ref=e977]: Lambda · eu-west-1 · regional
                    - generic [ref=e978]:
                      - generic [ref=e979]: 2 in · 1 out
                      - generic [ref=e980]:
                        - img [ref=e981]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e984]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e985]:
                - generic [ref=e986]:
                  - img [ref=e988]
                  - generic [ref=e990]:
                    - generic [ref=e991]:
                      - generic [ref=e992]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e993]
                    - generic [ref=e995]: Lambda · eu-west-1 · regional
                    - generic [ref=e996]:
                      - generic [ref=e997]: 2 in · 1 out
                      - generic [ref=e998]:
                        - img [ref=e999]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e1002]:
              - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e1003]:
                - generic [ref=e1004]:
                  - img [ref=e1006]
                  - generic [ref=e1008]:
                    - generic [ref=e1009]:
                      - generic [ref=e1010]: fixture-asg-app
                      - generic "Current graph data" [ref=e1011]
                    - generic [ref=e1013]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e1014]:
                      - generic [ref=e1015]: 0 in · 2 out
                      - generic [ref=e1016]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1019]:
              - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e1020]:
                - generic [ref=e1021]:
                  - img [ref=e1023]
                  - generic [ref=e1025]:
                    - generic [ref=e1026]:
                      - generic [ref=e1027]: fixture-asg-web
                      - generic "Current graph data" [ref=e1028]
                    - generic [ref=e1030]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e1031]:
                      - generic [ref=e1032]: 0 in · 2 out
                      - generic [ref=e1033]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1036]:
              - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1037]:
                - generic [ref=e1038]:
                  - img [ref=e1040]
                  - generic [ref=e1042]:
                    - generic [ref=e1043]:
                      - generic [ref=e1044]: fixture-daily
                      - generic "Current graph data" [ref=e1045]
                    - generic [ref=e1047]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1048]:
                      - generic [ref=e1049]: 0 in · 2 out
                      - generic [ref=e1050]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1053]:
              - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1054]:
                - generic [ref=e1055]:
                  - img [ref=e1057]
                  - generic [ref=e1059]:
                    - generic [ref=e1060]:
                      - generic [ref=e1061]: fixture-every_6h
                      - generic "Current graph data" [ref=e1062]
                    - generic [ref=e1064]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1065]:
                      - generic [ref=e1066]: 0 in · 2 out
                      - generic [ref=e1067]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1070]:
              - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1071]:
                - generic [ref=e1072]:
                  - img [ref=e1074]
                  - generic [ref=e1076]:
                    - generic [ref=e1077]:
                      - generic [ref=e1078]: fixture-frequent
                      - generic "Current graph data" [ref=e1079]
                    - generic [ref=e1081]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1082]:
                      - generic [ref=e1083]: 0 in · 2 out
                      - generic [ref=e1084]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1087]:
              - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1088]:
                - generic [ref=e1089]:
                  - img [ref=e1091]
                  - generic [ref=e1093]:
                    - generic [ref=e1094]:
                      - generic [ref=e1095]: fixture-monthly
                      - generic "Current graph data" [ref=e1096]
                    - generic [ref=e1098]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1099]:
                      - generic [ref=e1100]: 0 in · 2 out
                      - generic [ref=e1101]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1104]:
              - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1105]:
                - generic [ref=e1106]:
                  - img [ref=e1108]
                  - generic [ref=e1110]:
                    - generic [ref=e1111]:
                      - generic [ref=e1112]: fixture-nightly_burst
                      - generic "Current graph data" [ref=e1113]
                    - generic [ref=e1115]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1116]:
                      - generic [ref=e1117]: 0 in · 2 out
                      - generic [ref=e1118]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1121]:
              - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e1122]:
                - generic [ref=e1123]:
                  - img [ref=e1125]
                  - generic [ref=e1127]:
                    - generic [ref=e1128]:
                      - generic [ref=e1129]: fixture-tg-app
                      - generic "Current graph data" [ref=e1130]
                    - generic [ref=e1132]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e1133]:
                      - generic [ref=e1134]: 0 in · 2 out
                      - generic [ref=e1135]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1138]:
              - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e1139]:
                - generic [ref=e1140]:
                  - img [ref=e1142]
                  - generic [ref=e1144]:
                    - generic [ref=e1145]:
                      - generic [ref=e1146]: fixture-tg-web
                      - generic "Current graph data" [ref=e1147]
                    - generic [ref=e1149]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e1150]:
                      - generic [ref=e1151]: 0 in · 2 out
                      - generic [ref=e1152]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1155]:
              - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1156]:
                - generic [ref=e1157]:
                  - img [ref=e1159]
                  - generic [ref=e1161]:
                    - generic [ref=e1162]:
                      - generic [ref=e1163]: fixture-weekly
                      - generic "Current graph data" [ref=e1164]
                    - generic [ref=e1166]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1167]:
                      - generic [ref=e1168]: 0 in · 2 out
                      - generic [ref=e1169]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1172]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1173]:
                - generic [ref=e1174]:
                  - img [ref=e1176]
                  - generic [ref=e1178]:
                    - generic [ref=e1179]:
                      - generic [ref=e1180]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e1181]
                    - generic [ref=e1183]: Lambda · eu-west-1 · regional
                    - generic [ref=e1184]:
                      - generic [ref=e1185]: 2 in · 0 out
                      - generic [ref=e1186]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1189]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1190]:
                - generic [ref=e1191]:
                  - img [ref=e1193]
                  - generic [ref=e1195]:
                    - generic [ref=e1196]:
                      - generic [ref=e1197]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e1198]
                    - generic [ref=e1200]: Lambda · eu-west-1 · regional
                    - generic [ref=e1201]:
                      - generic [ref=e1202]: 2 in · 0 out
                      - generic [ref=e1203]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1206]:
              - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1207]:
                - generic [ref=e1208]:
                  - img [ref=e1210]
                  - generic [ref=e1212]:
                    - generic [ref=e1213]:
                      - generic [ref=e1214]: fixture-aurora
                      - generic "Current graph data" [ref=e1215]
                    - generic [ref=e1217]: RDS · eu-west-1 · VPC
                    - generic [ref=e1218]:
                      - generic [ref=e1219]: 0 in · 1 out
                      - generic [ref=e1220]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1223]:
              - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1224]:
                - generic [ref=e1225]:
                  - img [ref=e1227]
                  - generic [ref=e1229]:
                    - generic [ref=e1230]:
                      - generic [ref=e1231]: fixture-graph
                      - generic "Current graph data" [ref=e1232]
                    - generic [ref=e1234]: Neptune · eu-west-1 · VPC
                    - generic [ref=e1235]:
                      - generic [ref=e1236]: 0 in · 1 out
                      - generic [ref=e1237]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1240]:
              - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e1241]:
                - generic [ref=e1242]:
                  - img [ref=e1244]
                  - generic [ref=e1246]:
                    - generic [ref=e1247]:
                      - generic [ref=e1248]: fixture-neptune-1
                      - generic "Current graph data" [ref=e1249]
                    - generic [ref=e1251]: Neptune · eu-west-1a · data
                    - generic [ref=e1252]:
                      - generic [ref=e1253]: 1 in · 0 out
                      - generic [ref=e1254]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1257]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1258]:
                - generic [ref=e1259]:
                  - img [ref=e1261]
                  - generic [ref=e1264]:
                    - generic [ref=e1265]:
                      - generic [ref=e1266]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e1267]
                    - generic [ref=e1269]: S3 · eu-west-1 · regional
                    - generic [ref=e1270]:
                      - generic [ref=e1271]: 0 in · 0 out
                      - generic [ref=e1272]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1275]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1276]:
                - generic [ref=e1277]:
                  - img [ref=e1279]
                  - generic [ref=e1282]:
                    - generic [ref=e1283]:
                      - generic [ref=e1284]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e1285]
                    - generic [ref=e1287]: S3 · eu-west-1 · regional
                    - generic [ref=e1288]:
                      - generic [ref=e1289]: 0 in · 0 out
                      - generic [ref=e1290]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1293]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1294]:
                - generic [ref=e1295]:
                  - img [ref=e1297]
                  - generic [ref=e1300]:
                    - generic [ref=e1301]:
                      - generic [ref=e1302]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e1303]
                    - generic [ref=e1305]: S3 · eu-west-1 · regional
                    - generic [ref=e1306]:
                      - generic [ref=e1307]: 0 in · 0 out
                      - generic [ref=e1308]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1311]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1312]:
                - generic [ref=e1313]:
                  - img [ref=e1315]
                  - generic [ref=e1318]:
                    - generic [ref=e1319]:
                      - generic [ref=e1320]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e1321]
                    - generic [ref=e1323]: S3 · eu-west-1 · regional
                    - generic [ref=e1324]:
                      - generic [ref=e1325]: 0 in · 0 out
                      - generic [ref=e1326]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1329]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1330]:
                - generic [ref=e1331]:
                  - img [ref=e1333]
                  - generic [ref=e1336]:
                    - generic [ref=e1337]:
                      - generic [ref=e1338]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e1339]
                    - generic [ref=e1341]: S3 · eu-west-1 · regional
                    - generic [ref=e1342]:
                      - generic [ref=e1343]: 0 in · 0 out
                      - generic [ref=e1344]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1347]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1348]:
                - generic [ref=e1349]:
                  - img [ref=e1351]
                  - generic [ref=e1354]:
                    - generic [ref=e1355]:
                      - generic [ref=e1356]: cyntrotest2
                      - generic "Current graph data" [ref=e1357]
                    - generic [ref=e1359]: S3 · eu-west-1 · regional
                    - generic [ref=e1360]:
                      - generic [ref=e1361]: 0 in · 0 out
                      - generic [ref=e1362]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1365]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1366]:
                - generic [ref=e1367]:
                  - img [ref=e1369]
                  - generic [ref=e1372]:
                    - generic [ref=e1373]:
                      - generic [ref=e1374]: impaciq-findings
                      - generic "Current graph data" [ref=e1375]
                    - generic [ref=e1377]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1378]:
                      - generic [ref=e1379]: 0 in · 0 out
                      - generic [ref=e1380]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1383]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1384]:
                - generic [ref=e1385]:
                  - img [ref=e1387]
                  - generic [ref=e1390]:
                    - generic [ref=e1391]:
                      - generic [ref=e1392]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e1393]
                    - generic [ref=e1395]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1396]:
                      - generic [ref=e1397]: 0 in · 0 out
                      - generic [ref=e1398]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1401]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1402]:
                - generic [ref=e1403]:
                  - img [ref=e1405]
                  - generic [ref=e1408]:
                    - generic [ref=e1409]:
                      - generic [ref=e1410]: impaciq-scan-status
                      - generic "Current graph data" [ref=e1411]
                    - generic [ref=e1413]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1414]:
                      - generic [ref=e1415]: 0 in · 0 out
                      - generic [ref=e1416]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1419]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1420]:
                - generic [ref=e1421]:
                  - img [ref=e1423]
                  - generic [ref=e1426]:
                    - generic [ref=e1427]:
                      - generic [ref=e1428]: least_privilege_role_state
                      - generic "Current graph data" [ref=e1429]
                    - generic [ref=e1431]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1432]:
                      - generic [ref=e1433]: 0 in · 0 out
                      - generic [ref=e1434]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1437]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1438]:
                - generic [ref=e1439]:
                  - img [ref=e1441]
                  - generic [ref=e1444]:
                    - generic [ref=e1445]:
                      - generic [ref=e1446]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e1447]
                    - generic [ref=e1449]: S3 · eu-west-1 · regional
                    - generic [ref=e1450]:
                      - generic [ref=e1451]: 0 in · 0 out
                      - generic [ref=e1452]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1455]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1456]:
                - generic [ref=e1457]:
                  - img [ref=e1459]
                  - generic [ref=e1462]:
                    - generic [ref=e1463]:
                      - generic [ref=e1464]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e1465]
                    - generic [ref=e1467]: S3 · eu-west-1 · regional
                    - generic [ref=e1468]:
                      - generic [ref=e1469]: 0 in · 0 out
                      - generic [ref=e1470]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1473]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1474]:
                - generic [ref=e1475]:
                  - img [ref=e1477]
                  - generic [ref=e1480]:
                    - generic [ref=e1481]:
                      - generic [ref=e1482]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e1483]
                    - generic [ref=e1485]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1486]:
                      - generic [ref=e1487]: 0 in · 0 out
                      - generic [ref=e1488]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1491]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1492]:
                - generic [ref=e1493]:
                  - img [ref=e1495]
                  - generic [ref=e1498]:
                    - generic [ref=e1499]:
                      - generic [ref=e1500]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e1501]
                    - generic [ref=e1503]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1504]:
                      - generic [ref=e1505]: 0 in · 0 out
                      - generic [ref=e1506]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1509]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1510]:
                - generic [ref=e1511]:
                  - img [ref=e1513]
                  - generic [ref=e1516]:
                    - generic [ref=e1517]:
                      - generic [ref=e1518]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e1519]
                    - generic [ref=e1521]: S3 · eu-west-1 · regional
                    - generic [ref=e1522]:
                      - generic [ref=e1523]: 0 in · 0 out
                      - generic [ref=e1524]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1527]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1528]:
                - generic [ref=e1529]:
                  - img [ref=e1531]
                  - generic [ref=e1534]:
                    - generic [ref=e1535]:
                      - generic [ref=e1536]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e1537]
                    - generic [ref=e1539]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1540]:
                      - generic [ref=e1541]: 0 in · 0 out
                      - generic [ref=e1542]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1545]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1546]:
                - generic [ref=e1547]:
                  - img [ref=e1549]
                  - generic [ref=e1552]:
                    - generic [ref=e1553]:
                      - generic [ref=e1554]: sg_state
                      - generic "Current graph data" [ref=e1555]
                    - generic [ref=e1557]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1558]:
                      - generic [ref=e1559]: 0 in · 0 out
                      - generic [ref=e1560]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1563]:
      - text: Live read from
      - generic [ref=e1564]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1565]
```

# Test source

```ts
  154 |       const triggers = triggerBundleSnapshot(groups.snapshot)
  155 |       const egress = externalEgressSnapshot(triggers.snapshot)
  156 |       await seedAuthCookie(context)
  157 |       await routeSnapshot(page, egress.snapshot)
  158 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  159 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  160 |       await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  161 |       await page.getByRole("tab", { name: "Network topology" }).click()
  162 |       await page.getByTestId(`topology-estate-density-${density}`).click()
  163 | 
  164 |       // --- DEFAULT state: the lane is on the canvas without a click ---------
  165 |       const lane = page.getByTestId("topology-external-destinations-lane")
  166 |       await expect(lane, "the external-destination lane is not drawn by default").toBeVisible()
  167 |       const nodeCount = Number(await lane.getAttribute("data-node-count"))
  168 |       expect(nodeCount, `no destination node drawn at ${vp.name}·${density}`).toBeGreaterThan(0)
  169 |       await expect(lane).toHaveAttribute("data-gateway-id", egress.igwId)
  170 |       expect(Number(await lane.getAttribute("data-total-named"))).toBe(egress.expectedNamed)
  171 | 
  172 |       // Identity, not decoration: exactly one node carries the payload's
  173 |       // attribution and every other drawn node stays an address.
  174 |       expect(Number(await lane.getAttribute("data-attributed-count"))).toBe(1)
  175 |       const attributed = lane.locator('[data-identity="aws_service"]')
  176 |       await expect(attributed).toHaveCount(1)
  177 |       await expect(attributed).toContainText(egress.attributedService)
  178 |       const addresses = lane.locator('[data-identity="address"]')
  179 |       expect(await addresses.count()).toBeGreaterThan(0)
  180 | 
  181 |       // Two provenances, never merged into one claim.
  182 |       const provenance = page.getByTestId("topology-external-destinations-provenance")
  183 |       await expect(provenance).toContainText("observed")
  184 |       await expect(provenance).toContainText("configured routing")
  185 | 
  186 |       // --- the acceptance: a DRAWN edge, gateway chip to destination chip ---
  187 |       await expect
  188 |         .poll(
  189 |           async () => {
  190 |             const g = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
  191 |               paths: Array<{ target: string }>
  192 |             }
  193 |             return g.paths.length
  194 |           },
  195 |           {
  196 |             timeout: 20_000,
  197 |             message: `no IGW → external-destination edge is drawn at ${vp.name}·${density}`,
  198 |           },
  199 |         )
  200 |         .toBeGreaterThan(0)
  201 | 
  202 |       const geo = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
  203 |         hasOverlay: boolean
  204 |         hasIgw: boolean
  205 |         igwRect: Rect | null
  206 |         paths: Array<{ target: string; start: { x: number; y: number }; end: { x: number; y: number }; length: number }>
  207 |         destinations: Array<{ flowId: string; identity: string; rect: Rect }>
  208 |       }
  209 |       expect(geo.hasOverlay, "the flow overlay is drawn").toBe(true)
  210 |       expect(geo.hasIgw, "the in-map IGW chip is drawn").toBe(true)
  211 |       expect(geo.igwRect, "the IGW chip has a rect to leave from").not.toBeNull()
  212 | 
  213 |       const byId = new Map(geo.destinations.map(d => [d.flowId, d.rect]))
  214 |       const landed = geo.paths.filter(p => {
  215 |         const dst = byId.get(p.target)
  216 |         if (!dst) return false
  217 |         // Either orientation: the overlay routes right-to-left when the
  218 |         // destination sits left of the gateway at a narrow viewport.
  219 |         const forward = near(p.start, geo.igwRect!) && near(p.end, dst)
  220 |         const reverse = near(p.end, geo.igwRect!) && near(p.start, dst)
  221 |         return forward || reverse
  222 |       })
  223 |       expect(
  224 |         landed.length,
  225 |         `a gateway→destination path is drawn but neither end lands on the chips at ${vp.name}·${density}: ${JSON.stringify(
  226 |           { igw: geo.igwRect, paths: geo.paths, destinations: geo.destinations },
  227 |         )}`,
  228 |       ).toBeGreaterThan(0)
  229 |       // A zero-length or hairline path would satisfy "an edge exists" while
  230 |       // drawing nothing a reader can see.
  231 |       expect(Math.max(...landed.map(p => p.length)), "the drawn continuation is a hairline").toBeGreaterThan(8)
  232 | 
  233 |       // --- containment: past the boundary, clear of the tiers it must not hide
  234 |       const laneRect = (await rectOf(lane))!
  235 |       const boundaryRect = await rectOf(page.getByTestId("topology-vpc-boundary-column"))
  236 |       if (boundaryRect) {
  237 |         expect(
  238 |           laneRect.left,
  239 |           `the external lane is not outside the VPC boundary at ${vp.name}·${density}`,
  240 |         ).toBeGreaterThanOrEqual(boundaryRect.right - 1)
  241 |       }
  242 |       const canvas = (await rectOf(page.getByTestId("topology-region-fill-grid")))!
  243 |       expect(laneRect.right, `lane spills out of the canvas at ${vp.name}·${density}`).toBeLessThanOrEqual(
  244 |         canvas.right + 1,
  245 |       )
  246 |       const dataCells = page.locator('[data-tier="data"]')
  247 |       const cells = await dataCells.count()
  248 |       for (let i = 0; i < cells; i++) {
  249 |         const cell = await rectOf(dataCells.nth(i))
  250 |         if (!cell) continue
  251 |         expect(
  252 |           overlap(laneRect, cell),
  253 |           `the external lane overlaps data-tier cell ${i} at ${vp.name}·${density}`,
> 254 |         ).toBe(0)
      |           ^ Error: the external lane overlaps data-tier cell 1 at 1512x771·inventory
  255 |       }
  256 |       const rail = await rectOf(page.getByTestId("topology-edge-services-rail"))
  257 |       if (rail) {
  258 |         expect(
  259 |           overlap(laneRect, rail),
  260 |           `the external lane overlaps the services rail at ${vp.name}·${density}`,
  261 |         ).toBe(0)
  262 |       }
  263 |       // Readable, not a 6px sliver.
  264 |       expect(laneRect.right - laneRect.left, `lane too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(120)
  265 | 
  266 |       await page.screenshot({
  267 |         path: `test-results/estate-egress-map-default-${density}-${vp.name}.png`,
  268 |         fullPage: false,
  269 |       })
  270 | 
  271 |       // --- ON DEMAND: the bounded set says what it withheld -----------------
  272 |       const hidden = Number(await lane.getAttribute("data-hidden-count"))
  273 |       expect(hidden, "the fixture draws more destinations than the bound").toBeGreaterThan(0)
  274 |       const more = page.getByTestId("topology-external-destinations-more")
  275 |       await expect(more).toBeVisible()
  276 |       await expect(more).toContainText(`+${hidden}`)
  277 |       await more.click()
  278 |       await waitTopmost(page, "topology-external-destinations-more-details", `${vp.name}·${density}`)
  279 |       await page.keyboard.press("Escape")
  280 | 
  281 |       // The per-leg evidence detail, in the lane rather than the top strip.
  282 |       const external = page.getByTestId("topology-external-destinations")
  283 |       await expect(external).toHaveAttribute("data-open", "false")
  284 |       await external.getByTestId("topology-external-destinations-toggle").click()
  285 |       await expect(external).toHaveAttribute("data-open", "true")
  286 |       await waitTopmost(page, "topology-external-destinations-details", `${vp.name}·${density}`)
  287 |       await expect(
  288 |         page.getByTestId("topology-external-destinations-details").getByTestId("topology-external-destination-leg"),
  289 |       ).toHaveCount(egress.legCount)
  290 | 
  291 |       await page.screenshot({
  292 |         path: `test-results/estate-egress-map-expanded-${density}-${vp.name}.png`,
  293 |         fullPage: false,
  294 |       })
  295 |     })
  296 |   }
  297 | }
  298 | 
  299 | test("no lane, and no gateway continuation, when nothing leaves the VPC", async ({
  300 |   context,
  301 |   page,
  302 | }) => {
  303 |   // The negative that keeps every assertion above honest: a spec that only
  304 |   // ever sees a payload WITH egress cannot tell "drew the evidence" from
  305 |   // "always draws a lane".
  306 |   test.setTimeout(120_000)
  307 |   const empty = noEgressSnapshot()
  308 |   await seedAuthCookie(context)
  309 |   await routeSnapshot(page, empty.snapshot)
  310 |   await page.setViewportSize({ width: 1600, height: 900 })
  311 |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  312 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  313 |   await page.getByRole("tab", { name: "Network topology" }).click()
  314 |   // The map itself still rendered — otherwise this passes on a blank page.
  315 |   await expect(page.getByTestId("topology-region-fill-grid")).toBeVisible()
  316 |   await expect(page.getByTestId("topology-external-destinations-lane")).toHaveCount(0)
  317 |   await expect(page.getByTestId("topology-external-destination-node")).toHaveCount(0)
  318 |   const geo = (await page.evaluate(CONTINUATION_GEOMETRY)) as { paths: unknown[] }
  319 |   expect(geo.paths, "a gateway→destination edge was drawn with no egress in the payload").toEqual([])
  320 | })
  321 | 
```