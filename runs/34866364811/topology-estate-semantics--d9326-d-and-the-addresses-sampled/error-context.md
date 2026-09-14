# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-semantics-fixture.spec.ts >> external egress continues past the IGW, and says the route is configured and the addresses sampled
- Location: tests/integration/topology-estate-semantics-fixture.spec.ts:38:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('topology-external-destinations-details').getByTestId('topology-external-destination-leg').filter({ hasText: '5 of' })
Expected: 8
Received: 7
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByTestId('topology-external-destinations-details').getByTestId('topology-external-destination-leg').filter({ hasText: '5 of' })
    14 × locator resolved to 7 elements
       - unexpected value "7"

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
            - tab "Network topology" [selected] [ref=e74]
          - group "Map density" [ref=e75]:
            - button "Glance" [ref=e76]
            - button "Inventory" [ref=e77]
          - button "Shared neighbors" [pressed] [ref=e78]
          - button "Open map fullscreen" [ref=e79]:
            - img [ref=e80]
            - text: Map fullscreen
        - generic [ref=e87]:
          - generic [ref=e88]:
            - generic [ref=e89]:
              - generic [ref=e90]: Platform map
              - generic [ref=e91]: 1 VPC · 2 AZ · 6 subnets · 38 resources
            - generic [ref=e92]:
              - generic [ref=e93]: Map lens
              - generic [ref=e94]:
                - button "Architecture" [ref=e95]:
                  - img [ref=e96]
                  - text: Architecture
                - button "Dependencies" [pressed] [ref=e106]:
                  - img [ref=e107]
                  - text: Dependencies
                - button "Attack paths" [ref=e111]:
                  - img [ref=e112]
                  - text: Attack paths
          - generic "Dependency line colors" [ref=e114]:
            - generic [ref=e115]: Flow colors
            - generic [ref=e116]:
              - img [ref=e117]
              - generic [ref=e119]: Service call
            - generic [ref=e120]:
              - img [ref=e121]
              - generic [ref=e123]: AWS data service
            - generic [ref=e124]:
              - img [ref=e125]
              - generic [ref=e127]: VPC endpoint
            - generic [ref=e128]:
              - img [ref=e129]
              - generic [ref=e131]: Internet egress
            - generic [ref=e132]:
              - img [ref=e133]
              - generic [ref=e135]: Database
            - generic [ref=e136]:
              - img [ref=e137]
              - generic [ref=e139]: Exposure / attack
            - generic [ref=e140]: Moving = authoritative observed
            - generic [ref=e144]:
              - img [ref=e145]
              - text: Outlined motion = historical direction
            - generic [ref=e148]:
              - img [ref=e149]
              - text: Solid = configured
            - generic [ref=e150]:
              - img [ref=e151]
              - text: Dashed = inferred / unverified
          - generic [ref=e152]:
            - generic [ref=e153]: Confirmed TCP paths
            - generic [ref=e154]: Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.
          - generic [ref=e156]:
            - generic [ref=e157]: Flow-log coverage
            - generic [ref=e158]: Partly covered
            - generic [ref=e159]: 12 of 12 eligible endpoints covered · 16 unknown · 18 not applicable · generation 7
            - button "Coverage details (2)" [ref=e160]
          - generic [ref=e161]:
            - generic [ref=e162]:
              - img [ref=e164]
              - generic [ref=e169]:
                - generic [ref=e170]: Users
                - generic [ref=e171]: Clients & operators
            - generic [ref=e173]:
              - img [ref=e175]
              - generic [ref=e180]:
                - generic [ref=e181]: Internet
                - generic [ref=e182]: Public path via IGW · alon-prod-igw
          - generic [ref=e183]:
            - generic [ref=e184]: ☁ AWS Cloud · acct 745783559495
            - generic [ref=e185]:
              - generic [ref=e186]: Region · eu-west-1
              - generic [ref=e187]:
                - generic [ref=e188]:
                  - generic [ref=e189]:
                    - generic "vpc-0329e985173bed24f" [ref=e190]: VPC · vpc-0329e985173bed24f
                    - generic "3 of 6 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e191]: SafeRemediate-Test-… ×3
                  - generic [ref=e194]:
                    - generic [ref=e195]:
                      - generic "eu-west-1a" [ref=e196]: Availability Zone · eu-west-1a
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e197]':
                        - generic [ref=e198]:
                          - generic [ref=e199]: Public · SafeRemediate-Test-Public-1
                          - generic [ref=e200]: 10.0.1.0/24
                        - button "high posture score …Frontend-1" [ref=e202]:
                          - generic "high posture score" [ref=e203]
                          - generic [ref=e206]: …Frontend-1
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e207]':
                        - generic [ref=e208]:
                          - generic [ref=e209]: Private · SafeRemediate-Test-Private-App-1
                          - generic [ref=e210]: 10.0.10.0/24
                        - button "quiet posture score PaymentProductionAPI" [ref=e212]:
                          - generic "quiet posture score" [ref=e213]
                          - generic [ref=e216]: PaymentProductionAPI
                      - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e217]':
                        - generic [ref=e218]:
                          - generic [ref=e219]: Data · SafeRemediate-Test-Private-DB-1
                          - generic [ref=e220]: 10.0.20.0/24
                        - button "quiet posture score saferemediate-test-db" [ref=e222]:
                          - generic "quiet posture score" [ref=e223]
                          - generic [ref=e226]: saferemediate-test-db
                    - generic [ref=e227]:
                      - generic "eu-west-1b" [ref=e228]: Availability Zone · eu-west-1b
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e229]':
                        - generic [ref=e230]:
                          - generic [ref=e231]: Public · SafeRemediate-Test-Public-2
                          - generic [ref=e232]: 10.0.2.0/24
                        - button "high posture score …Frontend-2" [ref=e234]:
                          - generic "high posture score" [ref=e235]
                          - generic [ref=e238]: …Frontend-2
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e239]':
                        - generic [ref=e240]:
                          - generic [ref=e241]: Private · SafeRemediate-Test-Private-App-2
                          - generic [ref=e242]: 10.0.11.0/24
                        - generic [ref=e243]:
                          - button "quiet posture score …App-2" [ref=e244]:
                            - generic "quiet posture score" [ref=e245]
                            - generic [ref=e248]: …App-2
                          - button "quiet posture score VPCTrafficGenerator" [ref=e249]:
                            - generic "quiet posture score" [ref=e250]
                            - generic [ref=e253]: VPCTrafficGenerator
                      - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e254]':
                        - generic [ref=e255]:
                          - generic [ref=e256]: Data · SafeRemediate-Test-Private-DB-2
                          - generic [ref=e257]: 10.0.21.0/24
                        - generic [ref=e258]: No workloads
                - generic [ref=e259]:
                  - generic [ref=e260]: VPC boundary
                  - generic [ref=e261]:
                    - generic [ref=e262]: ↑ Internet
                    - generic [ref=e263]:
                      - button "IGW alon-prod-igw" [ref=e264]:
                        - img [ref=e266]
                        - generic [ref=e269]: IGW
                        - generic [ref=e270]: alon-prod-igw
                      - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e271]: "egress: 9 workloads"
                  - generic [ref=e273]:
                    - generic [ref=e274]: Endpoints (4)
                    - generic [ref=e275]:
                      - button "VPCE IF EC2 Messages" [ref=e276]:
                        - img [ref=e278]
                        - generic [ref=e282]: VPCE
                        - generic [ref=e283]: IF
                        - generic [ref=e284]: EC2 Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e285]: "use: not observed"
                    - generic [ref=e286]:
                      - button "VPCE GW Amazon S3" [ref=e287]:
                        - img [ref=e289]
                        - generic [ref=e293]: VPCE
                        - generic [ref=e294]: GW
                        - generic [ref=e295]: Amazon S3
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e296]: "use: 1 workload"
                    - generic [ref=e297]:
                      - button "VPCE IF AWS Systems Manager" [ref=e298]:
                        - img [ref=e300]
                        - generic [ref=e304]: VPCE
                        - generic [ref=e305]: IF
                        - generic [ref=e306]: AWS Systems Manager
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e307]: "use: 3 workloads"
                    - generic [ref=e308]:
                      - button "VPCE IF SSM Messages" [ref=e309]:
                        - img [ref=e311]
                        - generic [ref=e315]: VPCE
                        - generic [ref=e316]: IF
                        - generic [ref=e317]: SSM Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e318]: "use: 1 workload"
                - generic [ref=e319]:
                  - generic [ref=e320]: Outside the VPC
                  - generic [ref=e321]: Destinations observed this generation · NAT → IGW is configured routing
                  - generic [ref=e322]:
                    - generic "S3 — attributed by the flow-log evidence" [ref=e323]:
                      - generic [ref=e324]: S3
                      - generic [ref=e325]: AWS service
                    - generic "3.253.225.145 — an address; the evidence names no service" [ref=e326]:
                      - generic [ref=e327]: 3.253.225.145
                      - generic [ref=e328]: address
                    - generic "3.5.67.254 — an address; the evidence names no service" [ref=e329]:
                      - generic [ref=e330]: 3.5.67.254
                      - generic [ref=e331]: address · 8 workloads
                    - generic "3.5.69.34 — an address; the evidence names no service" [ref=e332]:
                      - generic [ref=e333]: 3.5.69.34
                      - generic [ref=e334]: address · 8 workloads
                    - generic "3.5.72.119 — an address; the evidence names no service" [ref=e335]:
                      - generic [ref=e336]: 3.5.72.119
                      - generic [ref=e337]: address · 8 workloads
                    - generic "3.5.72.73 — an address; the evidence names no service" [ref=e338]:
                      - generic [ref=e339]: 3.5.72.73
                      - generic [ref=e340]: address · 8 workloads
                    - button "+3 more" [ref=e341]
                  - generic [ref=e343]:
                    - generic [ref=e344]:
                      - generic [ref=e345]: 9 workloads
                      - generic [ref=e348]: ▸
                      - generic [ref=e349]:
                        - generic "NAT nat-fixture0a1b2c3d4" [ref=e350]:
                          - text: NAT
                          - generic [ref=e351]: nat-fixture0a1b2c3d4
                        - generic [ref=e354]: ▸
                      - generic [ref=e355]:
                        - generic "IGW igw-03bb3f19b706abbc4" [ref=e356]:
                          - text: IGW
                          - generic [ref=e357]: igw-03bb3f19b706abbc4
                        - generic [ref=e360]: ▸
                    - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [expanded] [ref=e361]:
                      - img [ref=e363]
                      - generic [ref=e368]:
                        - generic [ref=e369]: External destinations
                        - generic [ref=e370]: 9 workloads · up to 2579 distinct · addresses sampled
                - generic [ref=e371]:
                  - generic [ref=e373]: Not in this VPC
                  - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e375]:
                    - generic [ref=e376]: ALB · alon-prod-3tier-alb
                    - generic [ref=e377]: VPC vpc-086bcc2186…
                    - generic [ref=e378]: · payment-production
                - generic [ref=e380]:
                  - generic [ref=e381]:
                    - generic [ref=e382]:
                      - generic [ref=e383]: Lambda runtime (14)
                      - generic [ref=e384]:
                        - text: outside subnet grid · 14 attachment unverified
                        - generic "11 of 14 chips omit this shared prefix" [ref=e385]: · SafeRemediate-… ×11
                      - button "S3 traffic from 1 of 14 functions" [ref=e387]
                    - generic [ref=e389]:
                      - button "quiet posture score alon-prod-continuous-traffic" [ref=e390]:
                        - generic "quiet posture score" [ref=e391]
                        - generic [ref=e394]: alon-prod-continuous-traffic
                      - button "Lambda×13" [ref=e395]:
                        - generic [ref=e399]:
                          - text: Lambda
                          - generic [ref=e400]: ×13
                  - generic [ref=e402]:
                    - generic [ref=e403]:
                      - text: Regional · S3 / DDB (18)
                      - generic "3 of 18 chips omit this shared prefix" [ref=e404]: SafeRemediate-… ×3
                    - generic [ref=e406]:
                      - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e407]:
                        - generic "quiet posture score" [ref=e408]
                        - generic [ref=e411]: alon-demo-data-bucket-745783559495
                      - button "S3×9" [ref=e412]:
                        - generic [ref=e416]:
                          - text: S3
                          - generic [ref=e417]: ×9
                      - button "DynamoDB×8" [ref=e418]:
                        - generic [ref=e422]:
                          - text: DynamoDB
                          - generic [ref=e423]: ×8
          - generic [ref=e424]:
            - button "Diagnostics 14 serverless · 27 flows ▴" [ref=e425]:
              - generic [ref=e426]: Diagnostics
              - generic [ref=e427]: 14 serverless · 27 flows ▴
            - generic [ref=e428]:
              - generic [ref=e429]:
                - generic [ref=e430]: Serverless compute (14)
                - generic [ref=e431]:
                  - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e432]:
                    - generic [ref=e434]:
                      - generic [ref=e436]: AlonIAMTest-traffic-generator
                      - generic [ref=e437]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e438]: "24"
                  - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e439]:
                    - generic [ref=e441]:
                      - generic [ref=e443]: PaymentTrafficGenerator
                      - generic [ref=e444]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e445]: "18"
                  - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e446]:
                    - generic [ref=e448]:
                      - generic [ref=e450]: SafeRemediate-BehaviorAnalyzer
                      - generic [ref=e451]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e452]: "18"
                  - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e453]:
                    - generic [ref=e455]:
                      - generic [ref=e457]: SafeRemediate-ConfidenceScorer
                      - generic [ref=e458]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e459]: "18"
                  - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e460]:
                    - generic [ref=e462]:
                      - generic [ref=e464]: SafeRemediate-CreateCheckpoint
                      - generic [ref=e465]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e466]: "18"
                  - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e467]:
                    - generic [ref=e469]:
                      - generic [ref=e471]: SafeRemediate-PrismaWebhook
                      - generic [ref=e472]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e473]: "18"
                  - button "SafeRemediate-RemediationExecutor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e474]:
                    - generic [ref=e476]:
                      - generic [ref=e478]: SafeRemediate-RemediationExecutor
                      - generic [ref=e479]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e480]: "18"
                  - button "SafeRemediate-RollbackExecutor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e481]:
                    - generic [ref=e483]:
                      - generic [ref=e485]: SafeRemediate-RollbackExecutor
                      - generic [ref=e486]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e487]: "18"
                  - button "SafeRemediate-RollbackMonitor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e488]:
                    - generic [ref=e490]:
                      - generic [ref=e492]: SafeRemediate-RollbackMonitor
                      - generic [ref=e493]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e494]: "18"
                  - button "SafeRemediate-ServiceAwareSimulator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e495]:
                    - generic [ref=e497]:
                      - generic [ref=e499]: SafeRemediate-ServiceAwareSimulator
                      - generic [ref=e500]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e501]: "18"
                  - button "SafeRemediate-ServiceCatalogBuilder Lambda · arn:aws:lambda:eu-west-1 18" [ref=e502]:
                    - generic [ref=e504]:
                      - generic [ref=e506]: SafeRemediate-ServiceCatalogBuilder
                      - generic [ref=e507]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e508]: "18"
                  - button "SafeRemediate-SimulationEngine Lambda · arn:aws:lambda:eu-west-1 18" [ref=e509]:
                    - generic [ref=e511]:
                      - generic [ref=e513]: SafeRemediate-SimulationEngine
                      - generic [ref=e514]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e515]: "18"
                  - button "SafeRemediate-WizWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e516]:
                    - generic [ref=e518]:
                      - generic [ref=e520]: SafeRemediate-WizWebhook
                      - generic [ref=e521]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e522]: "18"
                  - button "alon-prod-continuous-traffic Lambda · arn:aws:lambda:eu-west-1 17" [ref=e523]:
                    - generic [ref=e525]:
                      - generic [ref=e527]: alon-prod-continuous-traffic
                      - generic [ref=e528]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e529]: "17"
              - generic [ref=e530]:
                - generic [ref=e531]:
                  - generic [ref=e532]: Observed traffic — animated arrows above
                  - generic [ref=e533]: 27 flows · 8 internal · 2 edge-service · 4 vpce · 4 database · 9 egress
                - generic [ref=e534]: Listing 17 of 27 — the current lens and selection hide the rest. The counts above are the full evidence.
                - generic [ref=e535]:
                  - generic [ref=e536]:
                    - generic [ref=e537]: alon-prod-continuous-traffic
                    - generic [ref=e538]: →
                    - generic [ref=e539]: alon-demo-data-bucket-745783559495
                    - generic [ref=e540]: ACTUAL_S3_ACCESS
                  - generic [ref=e541]:
                    - generic [ref=e542]: SafeRemediate-Test-App-2
                    - generic [ref=e543]: →
                    - generic [ref=e544]: vpce-0f983779fff3bbae7
                    - generic [ref=e545]: VPCE
                  - generic [ref=e546]:
                    - generic [ref=e547]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e548]: →
                    - generic [ref=e549]: vpce-0f983779fff3bbae7
                    - generic [ref=e550]: VPCE
                  - generic [ref=e551]:
                    - generic [ref=e552]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e553]: →
                    - generic [ref=e554]: vpce-04ffe43eea196bf89
                    - generic [ref=e555]: VPCE
                  - generic [ref=e556]:
                    - generic [ref=e557]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e558]: →
                    - generic [ref=e559]: vpce-0f983779fff3bbae7
                    - generic [ref=e560]: VPCE
                  - generic [ref=e561]:
                    - generic [ref=e562]: SafeRemediate-Test-App-2
                    - generic [ref=e563]: →
                    - generic [ref=e564]: Internet (via IGW)
                    - generic [ref=e565]: egress · 3 (ext 3)
                  - generic [ref=e566]:
                    - generic [ref=e567]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e568]: →
                    - generic [ref=e569]: Internet (via IGW)
                    - generic [ref=e570]: egress · 532 (ext 532 · S3 2)
                  - generic [ref=e571]:
                    - generic [ref=e572]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e573]: →
                    - generic [ref=e574]: Internet (via IGW)
                    - generic [ref=e575]: egress · 588 (ext 588)
                  - generic [ref=e576]:
                    - generic [ref=e577]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e578]: →
                    - generic [ref=e579]: saferemediate-test-db
                    - generic [ref=e580]: RDS · 5432
                  - generic [ref=e581]:
                    - generic [ref=e582]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e583]: →
                    - generic [ref=e584]: saferemediate-test-db
                    - generic [ref=e585]: RDS · 3306
                  - generic [ref=e586]:
                    - generic [ref=e587]: SafeRemediate-Test-App-2
                    - generic [ref=e588]: →
                    - generic [ref=e589]: saferemediate-test-db
                    - generic [ref=e590]: RDS
                  - generic [ref=e591]:
                    - generic [ref=e592]: __igw__
                    - generic [ref=e593]: →
                    - generic [ref=e594]: extdst:s3
                    - generic [ref=e595]: egress
                  - generic [ref=e596]: + 5 more flows
              - generic [ref=e597]:
                - generic [ref=e598]: Encoding
                - generic [ref=e599]:
                  - generic [ref=e602]: Worst (carmine halo + pulse)
                  - generic [ref=e605]: High / elevated (ring only)
                  - generic [ref=e606]:
                    - generic [ref=e607]: ♛
                    - generic [ref=e608]: Crown-jewel halo
                  - generic [ref=e611]: Clean · remediated (teal ring)
                  - generic [ref=e614]: Stale (dimmed)
                  - generic [ref=e617]: Coverage gap (not collected)
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
                - generic: S3 access
              - generic:
                - generic: API
      - complementary [ref=e618]:
        - complementary [ref=e619]:
          - generic [ref=e620]:
            - generic [ref=e621]:
              - heading "Service index" [level=2] [ref=e622]
              - generic [ref=e623]: "38"
            - generic [ref=e624]:
              - img [ref=e625]
              - searchbox "Find service in topology" [ref=e628]
            - button "Filters" [ref=e631]:
              - img [ref=e632]
              - text: Filters
          - list [ref=e634]:
            - listitem [ref=e635]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 0 in · 4 out Jul 9, 11:04 AM" [ref=e636]:
                - generic [ref=e637]:
                  - img [ref=e639]
                  - generic [ref=e641]:
                    - generic [ref=e642]:
                      - generic [ref=e643]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e644]
                    - generic [ref=e646]: EC2 · eu-west-1a · web
                    - generic [ref=e647]:
                      - generic [ref=e648]: 0 in · 4 out
                      - generic [ref=e649]:
                        - img [ref=e650]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e653]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 0 in · 3 out Jul 9, 10:40 AM" [ref=e654]:
                - generic [ref=e655]:
                  - img [ref=e657]
                  - generic [ref=e659]:
                    - generic [ref=e660]:
                      - generic [ref=e661]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e662]
                    - generic [ref=e664]: EC2 · eu-west-1b · app
                    - generic [ref=e665]:
                      - generic [ref=e666]: 0 in · 3 out
                      - generic [ref=e667]:
                        - img [ref=e668]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e671]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 3 in · 0 out Jul 6, 03:05 PM" [ref=e672]:
                - generic [ref=e673]:
                  - img [ref=e675]
                  - generic [ref=e677]:
                    - generic [ref=e678]:
                      - generic [ref=e679]: saferemediate-test-db
                      - generic "Current graph data" [ref=e680]
                    - generic [ref=e682]: RDS · eu-west-1a · data
                    - generic [ref=e683]:
                      - generic [ref=e684]: 3 in · 0 out
                      - generic [ref=e685]:
                        - img [ref=e686]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e689]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 0 in · 3 out Jul 9, 11:04 AM" [ref=e690]:
                - generic [ref=e691]:
                  - img [ref=e693]
                  - generic [ref=e695]:
                    - generic [ref=e696]:
                      - generic [ref=e697]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e698]
                    - generic [ref=e700]: EC2 · eu-west-1b · web
                    - generic [ref=e701]:
                      - generic [ref=e702]: 0 in · 3 out
                      - generic [ref=e703]:
                        - img [ref=e704]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e707]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 1 in · 0 out Jun 25, 08:58 AM" [ref=e708]:
                - generic [ref=e709]:
                  - img [ref=e711]
                  - generic [ref=e713]:
                    - generic [ref=e714]:
                      - generic [ref=e715]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e716]
                    - generic [ref=e718]: S3 · eu-west-1 · regional
                    - generic [ref=e719]:
                      - generic [ref=e720]: 1 in · 0 out
                      - generic [ref=e721]:
                        - img [ref=e722]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e725]:
              - button "alon-prod-continuous-traffic Current graph data Lambda · eu-west-1 · regional 0 in · 1 out Jun 25, 08:58 AM" [ref=e726]:
                - generic [ref=e727]:
                  - img [ref=e729]
                  - generic [ref=e731]:
                    - generic [ref=e732]:
                      - generic [ref=e733]: alon-prod-continuous-traffic
                      - generic "Current graph data" [ref=e734]
                    - generic [ref=e736]: Lambda · eu-west-1 · regional
                    - generic [ref=e737]:
                      - generic [ref=e738]: 0 in · 1 out
                      - generic [ref=e739]:
                        - img [ref=e740]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e743]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e744]:
                - generic [ref=e745]:
                  - img [ref=e747]
                  - generic [ref=e750]:
                    - generic [ref=e751]:
                      - generic [ref=e752]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e753]
                    - generic [ref=e755]: Lambda · eu-west-1 · regional
                    - generic [ref=e756]:
                      - generic [ref=e757]: 0 in · 0 out
                      - generic [ref=e758]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e761]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e762]:
                - generic [ref=e763]:
                  - img [ref=e765]
                  - generic [ref=e768]:
                    - generic [ref=e769]:
                      - generic [ref=e770]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e771]
                    - generic [ref=e773]: S3 · eu-west-1 · regional
                    - generic [ref=e774]:
                      - generic [ref=e775]: 0 in · 0 out
                      - generic [ref=e776]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e779]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e780]:
                - generic [ref=e781]:
                  - img [ref=e783]
                  - generic [ref=e786]:
                    - generic [ref=e787]:
                      - generic [ref=e788]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e789]
                    - generic [ref=e791]: S3 · eu-west-1 · regional
                    - generic [ref=e792]:
                      - generic [ref=e793]: 0 in · 0 out
                      - generic [ref=e794]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e797]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e798]:
                - generic [ref=e799]:
                  - img [ref=e801]
                  - generic [ref=e804]:
                    - generic [ref=e805]:
                      - generic [ref=e806]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e807]
                    - generic [ref=e809]: S3 · eu-west-1 · regional
                    - generic [ref=e810]:
                      - generic [ref=e811]: 0 in · 0 out
                      - generic [ref=e812]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e815]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e816]:
                - generic [ref=e817]:
                  - img [ref=e819]
                  - generic [ref=e822]:
                    - generic [ref=e823]:
                      - generic [ref=e824]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e825]
                    - generic [ref=e827]: S3 · eu-west-1 · regional
                    - generic [ref=e828]:
                      - generic [ref=e829]: 0 in · 0 out
                      - generic [ref=e830]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e833]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e834]:
                - generic [ref=e835]:
                  - img [ref=e837]
                  - generic [ref=e840]:
                    - generic [ref=e841]:
                      - generic [ref=e842]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e843]
                    - generic [ref=e845]: S3 · eu-west-1 · regional
                    - generic [ref=e846]:
                      - generic [ref=e847]: 0 in · 0 out
                      - generic [ref=e848]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e851]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e852]:
                - generic [ref=e853]:
                  - img [ref=e855]
                  - generic [ref=e858]:
                    - generic [ref=e859]:
                      - generic [ref=e860]: cyntrotest2
                      - generic "Current graph data" [ref=e861]
                    - generic [ref=e863]: S3 · eu-west-1 · regional
                    - generic [ref=e864]:
                      - generic [ref=e865]: 0 in · 0 out
                      - generic [ref=e866]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e869]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e870]:
                - generic [ref=e871]:
                  - img [ref=e873]
                  - generic [ref=e876]:
                    - generic [ref=e877]:
                      - generic [ref=e878]: impaciq-findings
                      - generic "Current graph data" [ref=e879]
                    - generic [ref=e881]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e882]:
                      - generic [ref=e883]: 0 in · 0 out
                      - generic [ref=e884]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e887]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e888]:
                - generic [ref=e889]:
                  - img [ref=e891]
                  - generic [ref=e894]:
                    - generic [ref=e895]:
                      - generic [ref=e896]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e897]
                    - generic [ref=e899]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e900]:
                      - generic [ref=e901]: 0 in · 0 out
                      - generic [ref=e902]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e905]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e906]:
                - generic [ref=e907]:
                  - img [ref=e909]
                  - generic [ref=e912]:
                    - generic [ref=e913]:
                      - generic [ref=e914]: impaciq-scan-status
                      - generic "Current graph data" [ref=e915]
                    - generic [ref=e917]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e918]:
                      - generic [ref=e919]: 0 in · 0 out
                      - generic [ref=e920]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e923]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e924]:
                - generic [ref=e925]:
                  - img [ref=e927]
                  - generic [ref=e930]:
                    - generic [ref=e931]:
                      - generic [ref=e932]: least_privilege_role_state
                      - generic "Current graph data" [ref=e933]
                    - generic [ref=e935]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e936]:
                      - generic [ref=e937]: 0 in · 0 out
                      - generic [ref=e938]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e941]:
              - button "PaymentProductionAPI Current graph data Lambda · eu-west-1a · app 0 in · 0 out No runtime timestamp" [ref=e942]:
                - generic [ref=e943]:
                  - img [ref=e945]
                  - generic [ref=e948]:
                    - generic [ref=e949]:
                      - generic [ref=e950]: PaymentProductionAPI
                      - generic "Current graph data" [ref=e951]
                    - generic [ref=e953]: Lambda · eu-west-1a · app
                    - generic [ref=e954]:
                      - generic [ref=e955]: 0 in · 0 out
                      - generic [ref=e956]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e959]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e960]:
                - generic [ref=e961]:
                  - img [ref=e963]
                  - generic [ref=e966]:
                    - generic [ref=e967]:
                      - generic [ref=e968]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e969]
                    - generic [ref=e971]: Lambda · eu-west-1 · regional
                    - generic [ref=e972]:
                      - generic [ref=e973]: 0 in · 0 out
                      - generic [ref=e974]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e977]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e978]:
                - generic [ref=e979]:
                  - img [ref=e981]
                  - generic [ref=e984]:
                    - generic [ref=e985]:
                      - generic [ref=e986]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e987]
                    - generic [ref=e989]: S3 · eu-west-1 · regional
                    - generic [ref=e990]:
                      - generic [ref=e991]: 0 in · 0 out
                      - generic [ref=e992]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e995]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e996]:
                - generic [ref=e997]:
                  - img [ref=e999]
                  - generic [ref=e1002]:
                    - generic [ref=e1003]:
                      - generic [ref=e1004]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e1005]
                    - generic [ref=e1007]: Lambda · eu-west-1 · regional
                    - generic [ref=e1008]:
                      - generic [ref=e1009]: 0 in · 0 out
                      - generic [ref=e1010]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1013]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1014]:
                - generic [ref=e1015]:
                  - img [ref=e1017]
                  - generic [ref=e1020]:
                    - generic [ref=e1021]:
                      - generic [ref=e1022]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e1023]
                    - generic [ref=e1025]: Lambda · eu-west-1 · regional
                    - generic [ref=e1026]:
                      - generic [ref=e1027]: 0 in · 0 out
                      - generic [ref=e1028]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1031]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1032]:
                - generic [ref=e1033]:
                  - img [ref=e1035]
                  - generic [ref=e1038]:
                    - generic [ref=e1039]:
                      - generic [ref=e1040]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e1041]
                    - generic [ref=e1043]: Lambda · eu-west-1 · regional
                    - generic [ref=e1044]:
                      - generic [ref=e1045]: 0 in · 0 out
                      - generic [ref=e1046]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1049]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1050]:
                - generic [ref=e1051]:
                  - img [ref=e1053]
                  - generic [ref=e1056]:
                    - generic [ref=e1057]:
                      - generic [ref=e1058]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e1059]
                    - generic [ref=e1061]: S3 · eu-west-1 · regional
                    - generic [ref=e1062]:
                      - generic [ref=e1063]: 0 in · 0 out
                      - generic [ref=e1064]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1067]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1068]:
                - generic [ref=e1069]:
                  - img [ref=e1071]
                  - generic [ref=e1074]:
                    - generic [ref=e1075]:
                      - generic [ref=e1076]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e1077]
                    - generic [ref=e1079]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1080]:
                      - generic [ref=e1081]: 0 in · 0 out
                      - generic [ref=e1082]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1085]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1086]:
                - generic [ref=e1087]:
                  - img [ref=e1089]
                  - generic [ref=e1092]:
                    - generic [ref=e1093]:
                      - generic [ref=e1094]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e1095]
                    - generic [ref=e1097]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1098]:
                      - generic [ref=e1099]: 0 in · 0 out
                      - generic [ref=e1100]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1103]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1104]:
                - generic [ref=e1105]:
                  - img [ref=e1107]
                  - generic [ref=e1110]:
                    - generic [ref=e1111]:
                      - generic [ref=e1112]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e1113]
                    - generic [ref=e1115]: S3 · eu-west-1 · regional
                    - generic [ref=e1116]:
                      - generic [ref=e1117]: 0 in · 0 out
                      - generic [ref=e1118]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1121]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1122]:
                - generic [ref=e1123]:
                  - img [ref=e1125]
                  - generic [ref=e1128]:
                    - generic [ref=e1129]:
                      - generic [ref=e1130]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e1131]
                    - generic [ref=e1133]: Lambda · eu-west-1 · regional
                    - generic [ref=e1134]:
                      - generic [ref=e1135]: 0 in · 0 out
                      - generic [ref=e1136]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1139]:
              - button "SafeRemediate-RemediationExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1140]:
                - generic [ref=e1141]:
                  - img [ref=e1143]
                  - generic [ref=e1146]:
                    - generic [ref=e1147]:
                      - generic [ref=e1148]: SafeRemediate-RemediationExecutor
                      - generic "Current graph data" [ref=e1149]
                    - generic [ref=e1151]: Lambda · eu-west-1 · regional
                    - generic [ref=e1152]:
                      - generic [ref=e1153]: 0 in · 0 out
                      - generic [ref=e1154]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1157]:
              - button "SafeRemediate-RollbackExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1158]:
                - generic [ref=e1159]:
                  - img [ref=e1161]
                  - generic [ref=e1164]:
                    - generic [ref=e1165]:
                      - generic [ref=e1166]: SafeRemediate-RollbackExecutor
                      - generic "Current graph data" [ref=e1167]
                    - generic [ref=e1169]: Lambda · eu-west-1 · regional
                    - generic [ref=e1170]:
                      - generic [ref=e1171]: 0 in · 0 out
                      - generic [ref=e1172]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1175]:
              - button "SafeRemediate-RollbackMonitor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1176]:
                - generic [ref=e1177]:
                  - img [ref=e1179]
                  - generic [ref=e1182]:
                    - generic [ref=e1183]:
                      - generic [ref=e1184]: SafeRemediate-RollbackMonitor
                      - generic "Current graph data" [ref=e1185]
                    - generic [ref=e1187]: Lambda · eu-west-1 · regional
                    - generic [ref=e1188]:
                      - generic [ref=e1189]: 0 in · 0 out
                      - generic [ref=e1190]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1193]:
              - button "SafeRemediate-ServiceAwareSimulator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1194]:
                - generic [ref=e1195]:
                  - img [ref=e1197]
                  - generic [ref=e1200]:
                    - generic [ref=e1201]:
                      - generic [ref=e1202]: SafeRemediate-ServiceAwareSimulator
                      - generic "Current graph data" [ref=e1203]
                    - generic [ref=e1205]: Lambda · eu-west-1 · regional
                    - generic [ref=e1206]:
                      - generic [ref=e1207]: 0 in · 0 out
                      - generic [ref=e1208]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1211]:
              - button "SafeRemediate-ServiceCatalogBuilder Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1212]:
                - generic [ref=e1213]:
                  - img [ref=e1215]
                  - generic [ref=e1218]:
                    - generic [ref=e1219]:
                      - generic [ref=e1220]: SafeRemediate-ServiceCatalogBuilder
                      - generic "Current graph data" [ref=e1221]
                    - generic [ref=e1223]: Lambda · eu-west-1 · regional
                    - generic [ref=e1224]:
                      - generic [ref=e1225]: 0 in · 0 out
                      - generic [ref=e1226]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1229]:
              - button "SafeRemediate-SimulationEngine Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1230]:
                - generic [ref=e1231]:
                  - img [ref=e1233]
                  - generic [ref=e1236]:
                    - generic [ref=e1237]:
                      - generic [ref=e1238]: SafeRemediate-SimulationEngine
                      - generic "Current graph data" [ref=e1239]
                    - generic [ref=e1241]: Lambda · eu-west-1 · regional
                    - generic [ref=e1242]:
                      - generic [ref=e1243]: 0 in · 0 out
                      - generic [ref=e1244]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1247]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1248]:
                - generic [ref=e1249]:
                  - img [ref=e1251]
                  - generic [ref=e1254]:
                    - generic [ref=e1255]:
                      - generic [ref=e1256]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e1257]
                    - generic [ref=e1259]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1260]:
                      - generic [ref=e1261]: 0 in · 0 out
                      - generic [ref=e1262]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1265]:
              - button "SafeRemediate-WizWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1266]:
                - generic [ref=e1267]:
                  - img [ref=e1269]
                  - generic [ref=e1272]:
                    - generic [ref=e1273]:
                      - generic [ref=e1274]: SafeRemediate-WizWebhook
                      - generic "Current graph data" [ref=e1275]
                    - generic [ref=e1277]: Lambda · eu-west-1 · regional
                    - generic [ref=e1278]:
                      - generic [ref=e1279]: 0 in · 0 out
                      - generic [ref=e1280]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1283]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1284]:
                - generic [ref=e1285]:
                  - img [ref=e1287]
                  - generic [ref=e1290]:
                    - generic [ref=e1291]:
                      - generic [ref=e1292]: sg_state
                      - generic "Current graph data" [ref=e1293]
                    - generic [ref=e1295]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1296]:
                      - generic [ref=e1297]: 0 in · 0 out
                      - generic [ref=e1298]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1301]:
              - button "VPCTrafficGenerator Current graph data Lambda · eu-west-1b · app 0 in · 0 out No runtime timestamp" [ref=e1302]:
                - generic [ref=e1303]:
                  - img [ref=e1305]
                  - generic [ref=e1308]:
                    - generic [ref=e1309]:
                      - generic [ref=e1310]: VPCTrafficGenerator
                      - generic "Current graph data" [ref=e1311]
                    - generic [ref=e1313]: Lambda · eu-west-1b · app
                    - generic [ref=e1314]:
                      - generic [ref=e1315]: 0 in · 0 out
                      - generic [ref=e1316]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1319]:
      - text: Live read from
      - generic [ref=e1320]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1321]
  - dialog [active] [ref=e1323]:
    - paragraph [ref=e1324]: 9 workloads leaving the VPC
    - paragraph [ref=e1325]: "Route is configured (route tables): NAT nat-fixture0a1b2c3d4 → IGW igw-03bb3f19b706abbc4. Counts are observed. The payload names no destination identities, so these addresses are evidence, not an inventory of services."
    - list [ref=e1326]:
      - listitem [ref=e1327]:
        - text: i-0e9b891793b5b2dbd · 3 distinct · all 3 shown
        - generic [ref=e1328]: — 54.217.69.183, 54.217.245.46, 3.253.225.145
      - listitem [ref=e1329]:
        - text: i-0f51b8b7ad29a359b · 532 distinct · 6 of 532 shown
        - generic [ref=e1330]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254, 52.218.0.200
      - listitem [ref=e1331]:
        - text: i-03c72e120ff96216c · 588 distinct · 5 of 588 shown
        - generic [ref=e1332]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1333]:
        - text: i-0aa725bf8ff4c2001 · 927 distinct · 5 of 927 shown
        - generic [ref=e1334]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1335]:
        - text: i-0d4186a6b477dcd55 · 20 distinct · 5 of 20 shown
        - generic [ref=e1336]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1337]:
        - text: i-009a28b5cab755850 · 20 distinct · 5 of 20 shown
        - generic [ref=e1338]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1339]:
        - text: i-0e4edb2adb28e4f16 · 23 distinct · 5 of 23 shown
        - generic [ref=e1340]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1341]:
        - text: i-02a0da7f8373e6c8f · 32 distinct · 5 of 32 shown
        - generic [ref=e1342]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1343]:
        - text: i-0ee29afa0048943e0 · 434 distinct · 5 of 434 shown
        - generic [ref=e1344]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test"
  2   | import { seedAuthCookie } from "./live-auth"
  3   | import {
  4   |   ESTATE_URL,
  5   |   SNAPSHOT,
  6   |   externalEgressSnapshot,
  7   |   noEgressSnapshot,
  8   |   routeSnapshot,
  9   |   triggerBundleSnapshot,
  10  | } from "./topology-fixture"
  11  | 
  12  | /** What the map SAYS, not where it draws it.
  13  |  *
  14  |  *  Independent production UI QA found three claims the Dependencies view made
  15  |  *  that its payload does not support: traffic stopped dead at the IGW, six
  16  |  *  EventBridge rules firing six Lambdas read as twelve relationships, and the
  17  |  *  Lambda -> S3 lane reduced six functions to a bare "x4". Each is a semantic
  18  |  *  defect with correct geometry, so each needs an assertion on the words and
  19  |  *  the counts. The negative cases matter as much: an external node drawn when
  20  |  *  nothing leaves the VPC would be the same class of error in the other
  21  |  *  direction.
  22  |  *
  23  |  *  1512x771 is the viewport the defects were reported at. */
  24  | const VIEWPORT = { width: 1512, height: 771 }
  25  | 
  26  | async function openMap(context: import("@playwright/test").BrowserContext, page: import("@playwright/test").Page, snapshot: typeof SNAPSHOT) {
  27  |   await seedAuthCookie(context)
  28  |   await routeSnapshot(page, snapshot)
  29  |   await page.setViewportSize(VIEWPORT)
  30  |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  31  |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  32  |   await page.getByRole("tab", { name: "Network topology" }).click()
  33  | }
  34  | 
  35  | // ---------------------------------------------------------------------------
  36  | // F3 — the traffic that leaves does not stop at the IGW.
  37  | // ---------------------------------------------------------------------------
  38  | test("external egress continues past the IGW, and says the route is configured and the addresses sampled", async ({
  39  |   context,
  40  |   page,
  41  | }) => {
  42  |   test.setTimeout(120_000)
  43  |   const egress = externalEgressSnapshot()
  44  |   expect(egress.legCount, "the captured payload has egress legs to continue").toBeGreaterThan(0)
  45  |   expect(egress.completeLegs, "one leg's sample covers its whole count").toBe(1)
  46  |   await openMap(context, page, egress.snapshot)
  47  | 
  48  |   const node = page.getByTestId("topology-external-destinations").first()
  49  |   await expect(node).toBeVisible()
  50  |   await expect(node).toHaveAttribute("data-leg-count", String(egress.legCount))
  51  |   await expect(node).toHaveAttribute("data-max-distinct-upper-bound", String(egress.expectedUpperBound))
  52  |   await expect(node).toHaveAttribute("data-unknown-distinct-legs", "0")
  53  |   // Not every sample is complete, so the node may not claim an inventory.
  54  |   await expect(node).toHaveAttribute("data-sample-complete", "false")
  55  |   const summary = node.getByTestId("topology-external-destinations-summary")
  56  |   await expect(summary).toContainText(`up to ${egress.expectedUpperBound} distinct`)
  57  |   await expect(summary).toContainText("addresses sampled")
  58  |   await expect(summary).not.toContainText("addresses complete")
  59  |   await expect(summary).not.toContainText("up to 0 distinct")
  60  | 
  61  |   await node.getByTestId("topology-external-destinations-toggle").click()
  62  |   const details = page.getByTestId("topology-external-destinations-details")
  63  |   await expect(details).toBeVisible()
  64  |   // The hops, in path order, and the honesty about what kind of claim each is.
  65  |   await expect(details).toContainText(egress.hopCaption)
  66  |   await expect(details).toContainText("Route is configured (route tables)")
  67  |   await expect(details).toContainText("Counts are observed")
  68  |   await expect(details).toContainText("names no destination identities")
  69  |   // Never an AWS service identity: the payload's destinations[] is empty.
  70  |   await expect(details).not.toContainText("Amazon S3")
  71  |   await expect(details).not.toContainText("AWS service")
  72  | 
  73  |   const legs = details.getByTestId("topology-external-destination-leg")
  74  |   await expect(legs).toHaveCount(egress.legCount)
  75  |   await expect(legs.filter({ hasText: "all 3 shown" })).toHaveCount(egress.completeLegs)
> 76  |   await expect(legs.filter({ hasText: "5 of" })).toHaveCount(egress.legCount - egress.completeLegs)
      |                                                  ^ Error: expect(locator).toHaveCount(expected) failed
  77  | })
  78  | 
  79  | // ---------------------------------------------------------------------------
  80  | // The chain, not another Internet block. Independent review, 2026-09-14: the
  81  | // node followed the static Internet chip on the same neutral dashed rule that
  82  | // joins Users to Internet, so it read as `Users -> Internet -> another
  83  | // Internet` rather than as the continuation of the workloads' egress.
  84  | // ---------------------------------------------------------------------------
  85  | test("the egress chain names the map's own gateway, so the continuation is the IGW the map draws", async ({
  86  |   context,
  87  |   page,
  88  | }) => {
  89  |   test.setTimeout(120_000)
  90  |   const egress = externalEgressSnapshot()
  91  |   await openMap(context, page, egress.snapshot)
  92  | 
  93  |   const chain = page.getByTestId("topology-external-egress-chain").first()
  94  |   await expect(chain).toBeVisible()
  95  |   await expect(chain).toHaveAttribute("data-workloads", String(egress.legCount))
  96  |   await expect(chain).toHaveAttribute("data-nat-ids", egress.natId)
  97  |   await expect(chain).toHaveAttribute("data-igw-ids", egress.igwId)
  98  |   // It reads as a path, source first: N workloads, then each gateway.
  99  |   await expect(chain.getByTestId("topology-egress-chain-source")).toHaveText(
  100 |     `${egress.legCount} workloads`,
  101 |   )
  102 |   const hops = chain.getByTestId("topology-egress-hop")
  103 |   await expect(hops).toHaveCount(2)
  104 |   await expect(hops.nth(0)).toHaveAttribute("data-hop-kind", "nat")
  105 |   await expect(hops.nth(1)).toHaveAttribute("data-hop-kind", "igw")
  106 | 
  107 |   // THE connection: the gateway the chain names is the gateway chip the map
  108 |   // draws on the VPC boundary, not some other account's.
  109 |   const mapIgws = page.locator('[data-testid="topology-igw-rail-chip"]')
  110 |   const drawnIgwIds = await mapIgws.evaluateAll(els =>
  111 |     els.map(el => el.getAttribute("data-igw-id") ?? ""),
  112 |   )
  113 |   expect(drawnIgwIds.length, "the fixture draws an IGW chip to connect to").toBeGreaterThan(0)
  114 |   expect(drawnIgwIds, "the chain's gateway is one the map actually draws").toContain(egress.igwId)
  115 |   await expect(hops.nth(1)).toHaveAttribute("data-hop-id", egress.igwId)
  116 | 
  117 |   // And it is laid out as a continuation: the chain runs from the Internet
  118 |   // block into the External node, left to right, on one baseline.
  119 |   const geom = await page.evaluate(() => {
  120 |     const box = (sel: string) => {
  121 |       const el = document.querySelector(sel)
  122 |       if (!el) return null
  123 |       const r = el.getBoundingClientRect()
  124 |       return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
  125 |     }
  126 |     return {
  127 |       internet: box('[data-testid="topology-internet-node"]'),
  128 |       chain: box('[data-testid="topology-external-egress-chain"]'),
  129 |       node: box('[data-testid="topology-external-destinations"]'),
  130 |     }
  131 |   })
  132 |   expect(geom.internet, "the Internet block is drawn").not.toBeNull()
  133 |   expect(geom.chain, "the chain is drawn").not.toBeNull()
  134 |   // The chain is the segment BETWEEN the Internet block and the globe, not a
  135 |   // second terminal beside them: it starts after the Internet block (or on a
  136 |   // wrapped row below it at the narrowest widths) and ends inside the node.
  137 |   const afterInternet =
  138 |     geom.chain!.x >= geom.internet!.right - 1 || geom.chain!.y >= geom.internet!.bottom - 1
  139 |   expect(afterInternet, "the chain does not follow the Internet block").toBe(true)
  140 |   expect(geom.chain!.right).toBeLessThanOrEqual(geom.node!.right + 1)
  141 | })
  142 | 
  143 | test("an older generation that recorded no addresses says so rather than promising a sample", async ({
  144 |   context,
  145 |   page,
  146 | }) => {
  147 |   test.setTimeout(120_000)
  148 |   // The captured payload itself: distinct COUNTS on every egress leg, no
  149 |   // egress_breakdown and no sample_hosts at all.
  150 |   await openMap(context, page, SNAPSHOT)
  151 |   const node = page.getByTestId("topology-external-destinations").first()
  152 |   await expect(node).toBeVisible()
  153 |   const summary = node.getByTestId("topology-external-destinations-summary")
  154 |   await expect(summary).toContainText("no addresses recorded")
  155 |   await expect(summary).not.toContainText("addresses sampled")
  156 |   await node.getByTestId("topology-external-destinations-toggle").click()
  157 |   await expect(page.getByTestId("topology-external-destinations-details")).toContainText(
  158 |     "recorded no addresses at all",
  159 |   )
  160 | })
  161 | 
  162 | test("no external destinations node when nothing leaves the VPC", async ({ context, page }) => {
  163 |   test.setTimeout(120_000)
  164 |   const none = noEgressSnapshot()
  165 |   // Guard against passing because the map failed to draw: the payload still
  166 |   // holds its other edges, and the map still renders its cells.
  167 |   expect(none.remainingEdges, "the payload still has non-egress edges").toBeGreaterThan(0)
  168 |   await openMap(context, page, none.snapshot)
  169 |   await expect(page.locator('[data-tier="data"]').first()).toBeVisible()
  170 |   await expect(page.getByTestId("topology-external-destinations")).toHaveCount(0)
  171 |   await expect(page.getByTestId("topology-external-egress-chain")).toHaveCount(0)
  172 | })
  173 | 
  174 | test("a configured route to the gateway is not drawn as observed egress", async ({ context, page }) => {
  175 |   test.setTimeout(120_000)
  176 |   // A route table entry points at the internet gateway too. Admitted, the node
```