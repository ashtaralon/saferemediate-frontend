# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-fullscreen-stacking-fixture.spec.ts >> external-destinations panel is topmost inside map fullscreen at 1600x900
- Location: tests/integration/topology-estate-fullscreen-stacking-fixture.spec.ts:136:7

# Error details

```
Error: the fullscreen layer no longer carries z-index 200

expect(received).toBe(expected) // Object.is equality

Expected: "200"
Received: ""
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
            - tab "Identity & access" [ref=e79]
          - group "Map density" [ref=e80]:
            - button "Glance" [ref=e81]
            - button "Inventory" [ref=e82]
          - button "Shared neighbors" [pressed] [ref=e83]
          - button "Open map fullscreen" [ref=e84]:
            - img [ref=e85]
            - text: Map fullscreen
        - generic [ref=e92]:
          - generic [ref=e93]:
            - generic [ref=e94]:
              - generic [ref=e95]: Platform map
              - generic [ref=e96]: 1 VPC · 2 AZ · 6 subnets · 41 resources
            - generic [ref=e97]:
              - generic [ref=e98]: Map lens
              - generic [ref=e99]:
                - button "Architecture" [ref=e100]:
                  - img [ref=e101]
                  - text: Architecture
                - button "Dependencies" [pressed] [ref=e111]:
                  - img [ref=e112]
                  - text: Dependencies
                - button "Attack paths" [ref=e116]:
                  - img [ref=e117]
                  - text: Attack paths
          - generic "Dependency line colors" [ref=e119]:
            - generic [ref=e120]: Flow colors
            - generic [ref=e121]:
              - img [ref=e122]
              - generic [ref=e124]: Service call
            - generic [ref=e125]:
              - img [ref=e126]
              - generic [ref=e128]: AWS data service
            - generic [ref=e129]:
              - img [ref=e130]
              - generic [ref=e132]: VPC endpoint
            - generic [ref=e133]:
              - img [ref=e134]
              - generic [ref=e136]: Internet egress
            - generic [ref=e137]:
              - img [ref=e138]
              - generic [ref=e140]: Database
            - generic [ref=e141]:
              - img [ref=e142]
              - generic [ref=e144]: Exposure / attack
            - generic [ref=e145]: Moving = authoritative observed
            - generic [ref=e149]:
              - img [ref=e150]
              - text: Outlined motion = historical direction
            - generic [ref=e153]:
              - img [ref=e154]
              - text: Solid = configured
            - generic [ref=e155]:
              - img [ref=e156]
              - text: Dashed = inferred / unverified
          - generic [ref=e157]:
            - generic [ref=e158]: Confirmed TCP paths
            - generic [ref=e159]: Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.
          - generic [ref=e161]:
            - generic [ref=e162]: Flow-log coverage
            - generic [ref=e163]: Partly covered
            - generic [ref=e164]: 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
            - button "Coverage details (2)" [ref=e165]
          - generic [ref=e166]:
            - generic [ref=e167]:
              - img [ref=e169]
              - generic [ref=e174]:
                - generic [ref=e175]: Users
                - generic [ref=e176]: Clients & operators
            - generic [ref=e178]:
              - img [ref=e180]
              - generic [ref=e185]:
                - generic [ref=e186]: Internet
                - generic [ref=e187]: Public path via IGW · alon-prod-igw
          - generic [ref=e188]:
            - generic [ref=e189]: ☁ AWS Cloud · acct 745783559495
            - generic [ref=e190]:
              - generic [ref=e191]: Region · eu-west-1
              - generic [ref=e192]:
                - generic [ref=e193]:
                  - generic [ref=e194]:
                    - generic "vpc-0329e985173bed24f" [ref=e195]: VPC · vpc-0329e985173bed24f
                    - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e196]: SafeRemediate-Test-… ×3
                  - generic [ref=e199]:
                    - generic [ref=e200]:
                      - generic "eu-west-1a" [ref=e201]: Availability Zone · eu-west-1a
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e202]':
                        - generic [ref=e203]:
                          - generic [ref=e204]: Public · SafeRemediate-Test-Public-1
                          - generic [ref=e205]: 10.0.1.0/24
                        - button "high posture score …Frontend-1" [ref=e207]:
                          - generic "high posture score" [ref=e208]
                          - generic [ref=e211]: …Frontend-1
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e212]':
                        - generic [ref=e213]:
                          - generic [ref=e214]: Private · SafeRemediate-Test-Private-App-1
                          - generic [ref=e215]: 10.0.10.0/24
                        - generic [ref=e216]: No workloads
                      - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e217]':
                        - generic [ref=e218]:
                          - generic [ref=e219]: Data · SafeRemediate-Test-Private-DB-1
                          - generic [ref=e220]: 10.0.20.0/24
                        - generic [ref=e221]:
                          - button "quiet posture score saferemediate-test-db" [ref=e222]:
                            - generic "quiet posture score" [ref=e223]
                            - generic [ref=e226]: saferemediate-test-db
                          - button "Posture not scored fixture-neptune-1" [ref=e227]:
                            - generic "Posture not scored" [ref=e228]
                            - generic [ref=e231]: fixture-neptune-1
                    - generic [ref=e232]:
                      - generic "eu-west-1b" [ref=e233]: Availability Zone · eu-west-1b
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e234]':
                        - generic [ref=e235]:
                          - generic [ref=e236]: Public · SafeRemediate-Test-Public-2
                          - generic [ref=e237]: 10.0.2.0/24
                        - button "high posture score …Frontend-2" [ref=e239]:
                          - generic "high posture score" [ref=e240]
                          - generic [ref=e243]: …Frontend-2
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e244]':
                        - generic [ref=e245]:
                          - generic [ref=e246]: Private · SafeRemediate-Test-Private-App-2
                          - generic [ref=e247]: 10.0.11.0/24
                        - button "quiet posture score …App-2" [ref=e249]:
                          - generic "quiet posture score" [ref=e250]
                          - generic [ref=e253]: …App-2
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
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e296]: "use: not observed"
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
                    - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [ref=e361]:
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
                      - generic [ref=e383]: Lambda runtime (6)
                      - generic [ref=e384]:
                        - text: outside subnet grid · 6 attachment unverified
                        - generic "4 of 12 chips omit this shared prefix" [ref=e385]: · SafeRemediate-… ×4
                      - button "S3 traffic from 4 of 6 functions" [ref=e387]
                    - generic [ref=e388]:
                      - generic [ref=e389]: Triggers (6)
                      - generic [ref=e390]:
                        - button "Posture not scored fixture-frequent" [ref=e391]:
                          - generic "Posture not scored" [ref=e392]
                          - generic [ref=e395]: fixture-frequent
                        - button "Posture not scored fixture-every_6h" [ref=e396]:
                          - generic "Posture not scored" [ref=e397]
                          - generic [ref=e400]: fixture-every_6h
                        - button "Posture not scored fixture-daily" [ref=e401]:
                          - generic "Posture not scored" [ref=e402]
                          - generic [ref=e405]: fixture-daily
                        - button "Posture not scored fixture-nightly_burst" [ref=e406]:
                          - generic "Posture not scored" [ref=e407]
                          - generic [ref=e410]: fixture-nightly_burst
                        - button "Posture not scored fixture-weekly" [ref=e411]:
                          - generic "Posture not scored" [ref=e412]
                          - generic [ref=e415]: fixture-weekly
                        - button "Posture not scored fixture-monthly" [ref=e416]:
                          - generic "Posture not scored" [ref=e417]
                          - generic [ref=e420]: fixture-monthly
                    - generic [ref=e422]:
                      - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e423]:
                        - generic "quiet posture score" [ref=e424]
                        - generic [ref=e427]: AlonIAMTest-traffic-generator
                      - button "quiet posture score PaymentTrafficGenerator" [ref=e428]:
                        - generic "quiet posture score" [ref=e429]
                        - generic [ref=e432]: PaymentTrafficGenerator
                      - button "quiet posture score …BehaviorAnalyzer" [ref=e433]:
                        - generic "quiet posture score" [ref=e434]
                        - generic [ref=e437]: …BehaviorAnalyzer
                      - button "quiet posture score …ConfidenceScorer" [ref=e438]:
                        - generic "quiet posture score" [ref=e439]
                        - generic [ref=e442]: …ConfidenceScorer
                      - button "quiet posture score …CreateCheckpoint" [ref=e443]:
                        - generic "quiet posture score" [ref=e444]
                        - generic [ref=e447]: …CreateCheckpoint
                      - button "quiet posture score …PrismaWebhook" [ref=e448]:
                        - generic "quiet posture score" [ref=e449]
                        - generic [ref=e452]: …PrismaWebhook
                  - generic [ref=e454]:
                    - generic [ref=e455]:
                      - text: Regional · S3 / DDB (18)
                      - generic "3 of 18 chips omit this shared prefix" [ref=e456]: SafeRemediate-… ×3
                    - generic [ref=e458]:
                      - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e459]:
                        - generic "quiet posture score" [ref=e460]
                        - generic [ref=e463]: alon-demo-data-bucket-745783559495
                      - button "S3×9" [ref=e464]:
                        - generic [ref=e468]:
                          - text: S3
                          - generic [ref=e469]: ×9
                      - button "DynamoDB×8" [ref=e470]:
                        - generic [ref=e474]:
                          - text: DynamoDB
                          - generic [ref=e475]: ×8
              - button "Logical groups · members carry the placement (6) Show members" [ref=e477]:
                - generic [ref=e478]: Logical groups · members carry the placement (6)
                - generic [ref=e479]: Show members
          - generic [ref=e480]:
            - button "Diagnostics 6 serverless · 51 flows ▴" [ref=e481]:
              - generic [ref=e482]: Diagnostics
              - generic [ref=e483]: 6 serverless · 51 flows ▴
            - generic [ref=e484]:
              - generic [ref=e485]:
                - generic [ref=e486]: Serverless compute (6)
                - generic [ref=e487]:
                  - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e488]:
                    - generic [ref=e490]:
                      - generic [ref=e492]: AlonIAMTest-traffic-generator
                      - generic [ref=e493]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e494]: "24"
                  - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e495]:
                    - generic [ref=e497]:
                      - generic [ref=e499]: PaymentTrafficGenerator
                      - generic [ref=e500]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e501]: "18"
                  - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e502]:
                    - generic [ref=e504]:
                      - generic [ref=e506]: SafeRemediate-BehaviorAnalyzer
                      - generic [ref=e507]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e508]: "18"
                  - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e509]:
                    - generic [ref=e511]:
                      - generic [ref=e513]: SafeRemediate-ConfidenceScorer
                      - generic [ref=e514]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e515]: "18"
                  - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e516]:
                    - generic [ref=e518]:
                      - generic [ref=e520]: SafeRemediate-CreateCheckpoint
                      - generic [ref=e521]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e522]: "18"
                  - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e523]:
                    - generic [ref=e525]:
                      - generic [ref=e527]: SafeRemediate-PrismaWebhook
                      - generic [ref=e528]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e529]: "18"
              - generic [ref=e530]:
                - generic [ref=e531]:
                  - generic [ref=e532]: Observed traffic — animated arrows above
                  - generic [ref=e533]: 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
                - generic [ref=e534]: Listing 42 of 51 — the current lens and selection hide the rest. The counts above are the full evidence.
                - generic [ref=e535]:
                  - generic [ref=e536]:
                    - generic [ref=e537]: SafeRemediate-Test-App-2
                    - generic [ref=e538]: →
                    - generic [ref=e539]: vpce-0f983779fff3bbae7
                    - generic [ref=e540]: VPCE
                  - generic [ref=e541]:
                    - generic [ref=e542]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e543]: →
                    - generic [ref=e544]: vpce-0f983779fff3bbae7
                    - generic [ref=e545]: VPCE
                  - generic [ref=e546]:
                    - generic [ref=e547]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e548]: →
                    - generic [ref=e549]: vpce-04ffe43eea196bf89
                    - generic [ref=e550]: VPCE
                  - generic [ref=e551]:
                    - generic [ref=e552]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e553]: →
                    - generic [ref=e554]: vpce-0f983779fff3bbae7
                    - generic [ref=e555]: VPCE
                  - generic [ref=e556]:
                    - generic [ref=e557]: SafeRemediate-Test-App-2
                    - generic [ref=e558]: →
                    - generic [ref=e559]: Internet (via IGW)
                    - generic [ref=e560]: egress · 3 (ext 3)
                  - generic [ref=e561]:
                    - generic [ref=e562]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e563]: →
                    - generic [ref=e564]: Internet (via IGW)
                    - generic [ref=e565]: egress · 532 (ext 532 · S3 2)
                  - generic [ref=e566]:
                    - generic [ref=e567]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e568]: →
                    - generic [ref=e569]: Internet (via IGW)
                    - generic [ref=e570]: egress · 588 (ext 588)
                  - generic [ref=e571]:
                    - generic [ref=e572]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e573]: →
                    - generic [ref=e574]: saferemediate-test-db
                    - generic [ref=e575]: RDS · 5432
                  - generic [ref=e576]:
                    - generic [ref=e577]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e578]: →
                    - generic [ref=e579]: saferemediate-test-db
                    - generic [ref=e580]: RDS · 3306
                  - generic [ref=e581]:
                    - generic [ref=e582]: SafeRemediate-Test-App-2
                    - generic [ref=e583]: →
                    - generic [ref=e584]: saferemediate-test-db
                    - generic [ref=e585]: RDS
                  - generic [ref=e586]:
                    - generic [ref=e587]: fixture-tg-web
                    - generic [ref=e588]: →
                    - generic [ref=e589]: SafeRemediate-Test-App-2
                    - generic [ref=e590]: TARGETS
                  - generic [ref=e591]:
                    - generic [ref=e592]: fixture-tg-web
                    - generic [ref=e593]: →
                    - generic [ref=e594]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e595]: TARGETS
                  - generic [ref=e596]: + 30 more flows
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
                - generic: Egress · 9 flows
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
      - complementary [ref=e618]:
        - complementary [ref=e619]:
          - generic [ref=e620]:
            - generic [ref=e621]:
              - heading "Service index" [level=2] [ref=e622]
              - generic [ref=e623]: "41"
            - generic [ref=e624]:
              - img [ref=e625]
              - searchbox "Find service in topology" [ref=e628]
            - button "Filters" [ref=e631]:
              - img [ref=e632]
              - text: Filters
          - list [ref=e634]:
            - listitem [ref=e635]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e636]:
                - generic [ref=e637]:
                  - img [ref=e639]
                  - generic [ref=e641]:
                    - generic [ref=e642]:
                      - generic [ref=e643]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e644]
                    - generic [ref=e646]: EC2 · eu-west-1a · web
                    - generic [ref=e647]:
                      - generic [ref=e648]: 3 in · 4 out
                      - generic [ref=e649]:
                        - img [ref=e650]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e653]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e654]:
                - generic [ref=e655]:
                  - img [ref=e657]
                  - generic [ref=e659]:
                    - generic [ref=e660]:
                      - generic [ref=e661]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e662]
                    - generic [ref=e664]: EC2 · eu-west-1b · app
                    - generic [ref=e665]:
                      - generic [ref=e666]: 3 in · 3 out
                      - generic [ref=e667]:
                        - img [ref=e668]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e671]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e672]:
                - generic [ref=e673]:
                  - img [ref=e675]
                  - generic [ref=e677]:
                    - generic [ref=e678]:
                      - generic [ref=e679]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e680]
                    - generic [ref=e682]: EC2 · eu-west-1b · web
                    - generic [ref=e683]:
                      - generic [ref=e684]: 2 in · 3 out
                      - generic [ref=e685]:
                        - img [ref=e686]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e689]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e690]:
                - generic [ref=e691]:
                  - img [ref=e693]
                  - generic [ref=e695]:
                    - generic [ref=e696]:
                      - generic [ref=e697]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e698]
                    - generic [ref=e700]: S3 · eu-west-1 · regional
                    - generic [ref=e701]:
                      - generic [ref=e702]: 4 in · 0 out
                      - generic [ref=e703]:
                        - img [ref=e704]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e707]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e708]:
                - generic [ref=e709]:
                  - img [ref=e711]
                  - generic [ref=e713]:
                    - generic [ref=e714]:
                      - generic [ref=e715]: saferemediate-test-db
                      - generic "Current graph data" [ref=e716]
                    - generic [ref=e718]: RDS · eu-west-1a · data
                    - generic [ref=e719]:
                      - generic [ref=e720]: 4 in · 0 out
                      - generic [ref=e721]:
                        - img [ref=e722]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e725]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e726]:
                - generic [ref=e727]:
                  - img [ref=e729]
                  - generic [ref=e731]:
                    - generic [ref=e732]:
                      - generic [ref=e733]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e734]
                    - generic [ref=e736]: Lambda · eu-west-1 · regional
                    - generic [ref=e737]:
                      - generic [ref=e738]: 2 in · 1 out
                      - generic [ref=e739]:
                        - img [ref=e740]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e743]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e744]:
                - generic [ref=e745]:
                  - img [ref=e747]
                  - generic [ref=e749]:
                    - generic [ref=e750]:
                      - generic [ref=e751]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e752]
                    - generic [ref=e754]: Lambda · eu-west-1 · regional
                    - generic [ref=e755]:
                      - generic [ref=e756]: 2 in · 1 out
                      - generic [ref=e757]:
                        - img [ref=e758]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e761]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e762]:
                - generic [ref=e763]:
                  - img [ref=e765]
                  - generic [ref=e767]:
                    - generic [ref=e768]:
                      - generic [ref=e769]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e770]
                    - generic [ref=e772]: Lambda · eu-west-1 · regional
                    - generic [ref=e773]:
                      - generic [ref=e774]: 2 in · 1 out
                      - generic [ref=e775]:
                        - img [ref=e776]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e779]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e780]:
                - generic [ref=e781]:
                  - img [ref=e783]
                  - generic [ref=e785]:
                    - generic [ref=e786]:
                      - generic [ref=e787]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e788]
                    - generic [ref=e790]: Lambda · eu-west-1 · regional
                    - generic [ref=e791]:
                      - generic [ref=e792]: 2 in · 1 out
                      - generic [ref=e793]:
                        - img [ref=e794]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e797]:
              - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e798]:
                - generic [ref=e799]:
                  - img [ref=e801]
                  - generic [ref=e803]:
                    - generic [ref=e804]:
                      - generic [ref=e805]: fixture-asg-app
                      - generic "Current graph data" [ref=e806]
                    - generic [ref=e808]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e809]:
                      - generic [ref=e810]: 0 in · 2 out
                      - generic [ref=e811]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e814]:
              - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e815]:
                - generic [ref=e816]:
                  - img [ref=e818]
                  - generic [ref=e820]:
                    - generic [ref=e821]:
                      - generic [ref=e822]: fixture-asg-web
                      - generic "Current graph data" [ref=e823]
                    - generic [ref=e825]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e826]:
                      - generic [ref=e827]: 0 in · 2 out
                      - generic [ref=e828]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e831]:
              - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e832]:
                - generic [ref=e833]:
                  - img [ref=e835]
                  - generic [ref=e837]:
                    - generic [ref=e838]:
                      - generic [ref=e839]: fixture-daily
                      - generic "Current graph data" [ref=e840]
                    - generic [ref=e842]: EventBridge · eu-west-1 · regional
                    - generic [ref=e843]:
                      - generic [ref=e844]: 0 in · 2 out
                      - generic [ref=e845]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e848]:
              - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e849]:
                - generic [ref=e850]:
                  - img [ref=e852]
                  - generic [ref=e854]:
                    - generic [ref=e855]:
                      - generic [ref=e856]: fixture-every_6h
                      - generic "Current graph data" [ref=e857]
                    - generic [ref=e859]: EventBridge · eu-west-1 · regional
                    - generic [ref=e860]:
                      - generic [ref=e861]: 0 in · 2 out
                      - generic [ref=e862]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e865]:
              - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e866]:
                - generic [ref=e867]:
                  - img [ref=e869]
                  - generic [ref=e871]:
                    - generic [ref=e872]:
                      - generic [ref=e873]: fixture-frequent
                      - generic "Current graph data" [ref=e874]
                    - generic [ref=e876]: EventBridge · eu-west-1 · regional
                    - generic [ref=e877]:
                      - generic [ref=e878]: 0 in · 2 out
                      - generic [ref=e879]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e882]:
              - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e883]:
                - generic [ref=e884]:
                  - img [ref=e886]
                  - generic [ref=e888]:
                    - generic [ref=e889]:
                      - generic [ref=e890]: fixture-monthly
                      - generic "Current graph data" [ref=e891]
                    - generic [ref=e893]: EventBridge · eu-west-1 · regional
                    - generic [ref=e894]:
                      - generic [ref=e895]: 0 in · 2 out
                      - generic [ref=e896]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e899]:
              - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e900]:
                - generic [ref=e901]:
                  - img [ref=e903]
                  - generic [ref=e905]:
                    - generic [ref=e906]:
                      - generic [ref=e907]: fixture-nightly_burst
                      - generic "Current graph data" [ref=e908]
                    - generic [ref=e910]: EventBridge · eu-west-1 · regional
                    - generic [ref=e911]:
                      - generic [ref=e912]: 0 in · 2 out
                      - generic [ref=e913]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e916]:
              - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e917]:
                - generic [ref=e918]:
                  - img [ref=e920]
                  - generic [ref=e922]:
                    - generic [ref=e923]:
                      - generic [ref=e924]: fixture-tg-app
                      - generic "Current graph data" [ref=e925]
                    - generic [ref=e927]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e928]:
                      - generic [ref=e929]: 0 in · 2 out
                      - generic [ref=e930]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e933]:
              - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e934]:
                - generic [ref=e935]:
                  - img [ref=e937]
                  - generic [ref=e939]:
                    - generic [ref=e940]:
                      - generic [ref=e941]: fixture-tg-web
                      - generic "Current graph data" [ref=e942]
                    - generic [ref=e944]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e945]:
                      - generic [ref=e946]: 0 in · 2 out
                      - generic [ref=e947]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e950]:
              - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e951]:
                - generic [ref=e952]:
                  - img [ref=e954]
                  - generic [ref=e956]:
                    - generic [ref=e957]:
                      - generic [ref=e958]: fixture-weekly
                      - generic "Current graph data" [ref=e959]
                    - generic [ref=e961]: EventBridge · eu-west-1 · regional
                    - generic [ref=e962]:
                      - generic [ref=e963]: 0 in · 2 out
                      - generic [ref=e964]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e967]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e968]:
                - generic [ref=e969]:
                  - img [ref=e971]
                  - generic [ref=e973]:
                    - generic [ref=e974]:
                      - generic [ref=e975]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e976]
                    - generic [ref=e978]: Lambda · eu-west-1 · regional
                    - generic [ref=e979]:
                      - generic [ref=e980]: 2 in · 0 out
                      - generic [ref=e981]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e984]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e985]:
                - generic [ref=e986]:
                  - img [ref=e988]
                  - generic [ref=e990]:
                    - generic [ref=e991]:
                      - generic [ref=e992]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e993]
                    - generic [ref=e995]: Lambda · eu-west-1 · regional
                    - generic [ref=e996]:
                      - generic [ref=e997]: 2 in · 0 out
                      - generic [ref=e998]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1001]:
              - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1002]:
                - generic [ref=e1003]:
                  - img [ref=e1005]
                  - generic [ref=e1007]:
                    - generic [ref=e1008]:
                      - generic [ref=e1009]: fixture-aurora
                      - generic "Current graph data" [ref=e1010]
                    - generic [ref=e1012]: RDS · eu-west-1 · VPC
                    - generic [ref=e1013]:
                      - generic [ref=e1014]: 0 in · 1 out
                      - generic [ref=e1015]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1018]:
              - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1019]:
                - generic [ref=e1020]:
                  - img [ref=e1022]
                  - generic [ref=e1024]:
                    - generic [ref=e1025]:
                      - generic [ref=e1026]: fixture-graph
                      - generic "Current graph data" [ref=e1027]
                    - generic [ref=e1029]: Neptune · eu-west-1 · VPC
                    - generic [ref=e1030]:
                      - generic [ref=e1031]: 0 in · 1 out
                      - generic [ref=e1032]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1035]:
              - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e1036]:
                - generic [ref=e1037]:
                  - img [ref=e1039]
                  - generic [ref=e1041]:
                    - generic [ref=e1042]:
                      - generic [ref=e1043]: fixture-neptune-1
                      - generic "Current graph data" [ref=e1044]
                    - generic [ref=e1046]: Neptune · eu-west-1a · data
                    - generic [ref=e1047]:
                      - generic [ref=e1048]: 1 in · 0 out
                      - generic [ref=e1049]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1052]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1053]:
                - generic [ref=e1054]:
                  - img [ref=e1056]
                  - generic [ref=e1059]:
                    - generic [ref=e1060]:
                      - generic [ref=e1061]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e1062]
                    - generic [ref=e1064]: S3 · eu-west-1 · regional
                    - generic [ref=e1065]:
                      - generic [ref=e1066]: 0 in · 0 out
                      - generic [ref=e1067]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1070]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1071]:
                - generic [ref=e1072]:
                  - img [ref=e1074]
                  - generic [ref=e1077]:
                    - generic [ref=e1078]:
                      - generic [ref=e1079]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e1080]
                    - generic [ref=e1082]: S3 · eu-west-1 · regional
                    - generic [ref=e1083]:
                      - generic [ref=e1084]: 0 in · 0 out
                      - generic [ref=e1085]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1088]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1089]:
                - generic [ref=e1090]:
                  - img [ref=e1092]
                  - generic [ref=e1095]:
                    - generic [ref=e1096]:
                      - generic [ref=e1097]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e1098]
                    - generic [ref=e1100]: S3 · eu-west-1 · regional
                    - generic [ref=e1101]:
                      - generic [ref=e1102]: 0 in · 0 out
                      - generic [ref=e1103]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1106]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1107]:
                - generic [ref=e1108]:
                  - img [ref=e1110]
                  - generic [ref=e1113]:
                    - generic [ref=e1114]:
                      - generic [ref=e1115]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e1116]
                    - generic [ref=e1118]: S3 · eu-west-1 · regional
                    - generic [ref=e1119]:
                      - generic [ref=e1120]: 0 in · 0 out
                      - generic [ref=e1121]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1124]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1125]:
                - generic [ref=e1126]:
                  - img [ref=e1128]
                  - generic [ref=e1131]:
                    - generic [ref=e1132]:
                      - generic [ref=e1133]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e1134]
                    - generic [ref=e1136]: S3 · eu-west-1 · regional
                    - generic [ref=e1137]:
                      - generic [ref=e1138]: 0 in · 0 out
                      - generic [ref=e1139]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1142]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1143]:
                - generic [ref=e1144]:
                  - img [ref=e1146]
                  - generic [ref=e1149]:
                    - generic [ref=e1150]:
                      - generic [ref=e1151]: cyntrotest2
                      - generic "Current graph data" [ref=e1152]
                    - generic [ref=e1154]: S3 · eu-west-1 · regional
                    - generic [ref=e1155]:
                      - generic [ref=e1156]: 0 in · 0 out
                      - generic [ref=e1157]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1160]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1161]:
                - generic [ref=e1162]:
                  - img [ref=e1164]
                  - generic [ref=e1167]:
                    - generic [ref=e1168]:
                      - generic [ref=e1169]: impaciq-findings
                      - generic "Current graph data" [ref=e1170]
                    - generic [ref=e1172]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1173]:
                      - generic [ref=e1174]: 0 in · 0 out
                      - generic [ref=e1175]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1178]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1179]:
                - generic [ref=e1180]:
                  - img [ref=e1182]
                  - generic [ref=e1185]:
                    - generic [ref=e1186]:
                      - generic [ref=e1187]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e1188]
                    - generic [ref=e1190]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1191]:
                      - generic [ref=e1192]: 0 in · 0 out
                      - generic [ref=e1193]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1196]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1197]:
                - generic [ref=e1198]:
                  - img [ref=e1200]
                  - generic [ref=e1203]:
                    - generic [ref=e1204]:
                      - generic [ref=e1205]: impaciq-scan-status
                      - generic "Current graph data" [ref=e1206]
                    - generic [ref=e1208]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1209]:
                      - generic [ref=e1210]: 0 in · 0 out
                      - generic [ref=e1211]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1214]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1215]:
                - generic [ref=e1216]:
                  - img [ref=e1218]
                  - generic [ref=e1221]:
                    - generic [ref=e1222]:
                      - generic [ref=e1223]: least_privilege_role_state
                      - generic "Current graph data" [ref=e1224]
                    - generic [ref=e1226]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1227]:
                      - generic [ref=e1228]: 0 in · 0 out
                      - generic [ref=e1229]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1232]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1233]:
                - generic [ref=e1234]:
                  - img [ref=e1236]
                  - generic [ref=e1239]:
                    - generic [ref=e1240]:
                      - generic [ref=e1241]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e1242]
                    - generic [ref=e1244]: S3 · eu-west-1 · regional
                    - generic [ref=e1245]:
                      - generic [ref=e1246]: 0 in · 0 out
                      - generic [ref=e1247]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1250]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1251]:
                - generic [ref=e1252]:
                  - img [ref=e1254]
                  - generic [ref=e1257]:
                    - generic [ref=e1258]:
                      - generic [ref=e1259]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e1260]
                    - generic [ref=e1262]: S3 · eu-west-1 · regional
                    - generic [ref=e1263]:
                      - generic [ref=e1264]: 0 in · 0 out
                      - generic [ref=e1265]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1268]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1269]:
                - generic [ref=e1270]:
                  - img [ref=e1272]
                  - generic [ref=e1275]:
                    - generic [ref=e1276]:
                      - generic [ref=e1277]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e1278]
                    - generic [ref=e1280]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1281]:
                      - generic [ref=e1282]: 0 in · 0 out
                      - generic [ref=e1283]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1286]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1287]:
                - generic [ref=e1288]:
                  - img [ref=e1290]
                  - generic [ref=e1293]:
                    - generic [ref=e1294]:
                      - generic [ref=e1295]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e1296]
                    - generic [ref=e1298]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1299]:
                      - generic [ref=e1300]: 0 in · 0 out
                      - generic [ref=e1301]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1304]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1305]:
                - generic [ref=e1306]:
                  - img [ref=e1308]
                  - generic [ref=e1311]:
                    - generic [ref=e1312]:
                      - generic [ref=e1313]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e1314]
                    - generic [ref=e1316]: S3 · eu-west-1 · regional
                    - generic [ref=e1317]:
                      - generic [ref=e1318]: 0 in · 0 out
                      - generic [ref=e1319]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1322]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1323]:
                - generic [ref=e1324]:
                  - img [ref=e1326]
                  - generic [ref=e1329]:
                    - generic [ref=e1330]:
                      - generic [ref=e1331]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e1332]
                    - generic [ref=e1334]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1335]:
                      - generic [ref=e1336]: 0 in · 0 out
                      - generic [ref=e1337]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1340]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1341]:
                - generic [ref=e1342]:
                  - img [ref=e1344]
                  - generic [ref=e1347]:
                    - generic [ref=e1348]:
                      - generic [ref=e1349]: sg_state
                      - generic "Current graph data" [ref=e1350]
                    - generic [ref=e1352]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1353]:
                      - generic [ref=e1354]: 0 in · 0 out
                      - generic [ref=e1355]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1358]:
      - text: Live read from
      - generic [ref=e1359]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1360]
```

# Test source

```ts
  60  |   }
  61  |   let node = el
  62  |   let product = 1
  63  |   while (node && node !== document.documentElement) {
  64  |     product *= Number(getComputedStyle(node).opacity)
  65  |     node = node.parentElement
  66  |   }
  67  |   const r = el.getBoundingClientRect()
  68  |   const probes = [
  69  |     ['top', r.left + r.width * 0.5, r.top + 6],
  70  |     ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
  71  |     ['bottom', r.left + r.width * 0.5, r.bottom - 6],
  72  |     ['left', r.left + 6, r.top + r.height * 0.5],
  73  |     ['right', r.right - 6, r.top + r.height * 0.5],
  74  |   ]
  75  |   const covered = []
  76  |   for (const [name, x, y] of probes) {
  77  |     const top = document.elementFromPoint(x, y)
  78  |     if (!top || !(el === top || el.contains(top))) {
  79  |       covered.push({
  80  |         probe: name,
  81  |         x: Math.round(x),
  82  |         y: Math.round(y),
  83  |         hit: top
  84  |           ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 48))
  85  |           : 'nothing',
  86  |       })
  87  |     }
  88  |   }
  89  |   return {
  90  |     hasWrapper: !!wrapper,
  91  |     wrapperZ: zOf(wrapper),
  92  |     contentZ: zOf(el),
  93  |     fullscreenZ: zOf(fs),
  94  |     // The panel is portaled to the body, so it is NOT a descendant of the
  95  |     // fullscreen layer. That is precisely why the z-indexes have to be
  96  |     // compared: if this were ever true, the layer would carry the panel with
  97  |     // it and the numbers would stop mattering.
  98  |     panelInsideFullscreen: !!(fs && wrapper && fs.contains(wrapper)),
  99  |     effectiveOpacity: product,
  100 |     rect: { x: r.left, y: r.top, w: r.width, h: r.height },
  101 |     covered,
  102 |   }
  103 | })()`
  104 | 
  105 | async function probe(page: Page) {
  106 |   return page.evaluate(STACKING_PROBE) as Promise<{
  107 |     hasWrapper: boolean
  108 |     wrapperZ: number | null
  109 |     contentZ: number | null
  110 |     fullscreenZ: number | null
  111 |     panelInsideFullscreen: boolean
  112 |     effectiveOpacity: number
  113 |     rect: { x: number; y: number; w: number; h: number }
  114 |     covered: Array<{ probe: string; x: number; y: number; hit: string }>
  115 |   } | null>
  116 | }
  117 | 
  118 | /** Settle on the same predicate the assertions use, so a screenshot can never
  119 |  *  capture a frame the measurements would have rejected. */
  120 | async function waitForSettledPanel(page: Page, where: string) {
  121 |   try {
  122 |     await page.waitForFunction(
  123 |       `(() => { const s = ${STACKING_PROBE}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  124 |       undefined,
  125 |       { timeout: 10_000 },
  126 |     )
  127 |   } catch {
  128 |     const state = await probe(page)
  129 |     throw new Error(
  130 |       `the panel never settled opaque and on top in fullscreen (${where}): ${JSON.stringify(state)}`,
  131 |     )
  132 |   }
  133 | }
  134 | 
  135 | for (const vp of VIEWPORTS) {
  136 |   test(`external-destinations panel is topmost inside map fullscreen at ${vp.name}`, async ({
  137 |     context,
  138 |     page,
  139 |   }) => {
  140 |     test.setTimeout(150_000)
  141 |     const groups = logicalGroupSnapshot()
  142 |     const triggers = triggerBundleSnapshot(groups.snapshot)
  143 |     const egress = externalEgressSnapshot(triggers.snapshot)
  144 |     await seedAuthCookie(context)
  145 |     await routeSnapshot(page, egress.snapshot)
  146 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  147 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  148 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  149 |     await page.getByRole("tab", { name: "Network topology" }).click()
  150 | 
  151 |     // --- enter the real z-200 layer ----------------------------------------
  152 |     await page.getByTestId("topology-estate-map-enlarge").click()
  153 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  154 |     await expect(fullscreen).toBeVisible()
  155 | 
  156 |     // Anchor the test to the layer it is about. If the fullscreen z-index is
  157 |     // ever changed, this line says so directly instead of leaving a hit test
  158 |     // to fail somewhere further down with a confusing message.
  159 |     const fullscreenZ = await fullscreen.evaluate(el => getComputedStyle(el).zIndex)
> 160 |     expect(fullscreenZ, "the fullscreen layer no longer carries z-index 200").toBe("200")
      |                                                                               ^ Error: the fullscreen layer no longer carries z-index 200
  161 | 
  162 |     // The trigger lives INSIDE that layer; the panel will not.
  163 |     const external = fullscreen.getByTestId("topology-external-destinations")
  164 |     await expect(external).toBeVisible()
  165 |     await expect(external).toHaveAttribute("data-open", "false")
  166 |     await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
  167 |     await page.screenshot({
  168 |       path: `test-results/estate-fullscreen-default-${vp.name}.png`,
  169 |       fullPage: false,
  170 |     })
  171 | 
  172 |     // --- open it and measure the paint order -------------------------------
  173 |     await external.getByTestId("topology-external-destinations-toggle").click()
  174 |     await expect(external).toHaveAttribute("data-open", "true")
  175 |     const panel = page.getByTestId("topology-external-destinations-details")
  176 |     await expect(panel).toHaveCount(1)
  177 |     await expect(panel).toBeVisible()
  178 |     await waitForSettledPanel(page, `${vp.name} · measurement`)
  179 | 
  180 |     const s = await probe(page)
  181 |     expect(s, "the panel is measurable in fullscreen").not.toBeNull()
  182 |     expect(s!.hasWrapper, "Radix no longer wraps the content in a popper wrapper").toBe(true)
  183 |     expect(
  184 |       s!.panelInsideFullscreen,
  185 |       "the panel is portaled into the fullscreen layer now — the z-index comparison below no longer describes the real stacking",
  186 |     ).toBe(false)
  187 | 
  188 |     // The mechanism, asserted rather than trusted: the wrapper's order is the
  189 |     // CONTENT's order, copied inline. If Radix ever stops propagating it, the
  190 |     // wrapper falls back to `auto` and this fails with that fact named.
  191 |     expect(s!.contentZ, `the panel content carries no z-index at ${vp.name}`).not.toBeNull()
  192 |     expect(s!.wrapperZ, `the popper wrapper carries no z-index at ${vp.name}`).not.toBeNull()
  193 |     expect(
  194 |       s!.wrapperZ,
  195 |       `Radix did not copy the content's z-index onto the wrapper at ${vp.name} (content ${s!.contentZ}, wrapper ${s!.wrapperZ})`,
  196 |     ).toBe(s!.contentZ)
  197 | 
  198 |     // The invariant that makes it visible, stated as the comparison rather
  199 |     // than as a magic number, so it keeps holding if either layer moves.
  200 |     expect(s!.fullscreenZ, "the fullscreen layer is measurable").not.toBeNull()
  201 |     expect(
  202 |       s!.wrapperZ!,
  203 |       `the panel's wrapper (${s!.wrapperZ}) is not above the fullscreen layer (${s!.fullscreenZ}) at ${vp.name}`,
  204 |     ).toBeGreaterThan(s!.fullscreenZ!)
  205 | 
  206 |     // The assertion of record. Everything above can be right and the reader
  207 |     // still see the map: this is the one that matches what they experience.
  208 |     expect(
  209 |       s!.covered,
  210 |       `something paints over the panel inside fullscreen at ${vp.name} — an opaque panel under the map is invisible, not translucent: ${JSON.stringify(s!.covered)}`,
  211 |     ).toEqual([])
  212 |     expect(
  213 |       s!.effectiveOpacity,
  214 |       `panel's effective opacity is below 1 in fullscreen at ${vp.name}`,
  215 |     ).toBeGreaterThanOrEqual(0.999)
  216 | 
  217 |     // Contained and legible where it landed — fullscreen has its own chrome
  218 |     // and its own collision boundary, so the embedded measurement does not
  219 |     // carry over.
  220 |     expect(s!.rect.x, `panel off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  221 |     expect(s!.rect.y, `panel off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  222 |     expect(s!.rect.x + s!.rect.w, `panel off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
  223 |     expect(s!.rect.y + s!.rect.h, `panel off the bottom at ${vp.name}`).toBeLessThanOrEqual(
  224 |       vp.height + 1,
  225 |     )
  226 |     expect(s!.rect.w, `panel too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(260)
  227 |     await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)
  228 | 
  229 |     const legible = await panel.evaluate(p => {
  230 |       const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
  231 |       const legs = Array.from(
  232 |         p.querySelectorAll<HTMLElement>('[data-testid="topology-external-destination-leg"]'),
  233 |       )
  234 |       return {
  235 |         captionPx: px(p.querySelector("p")!),
  236 |         minLegPx: Math.min(...legs.map(px)),
  237 |         clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
  238 |       }
  239 |     })
  240 |     expect(legible.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  241 |     expect(legible.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  242 |     expect(legible.clipped, `clipped leg lines at ${vp.name}`).toBe(0)
  243 | 
  244 |     await page.screenshot({
  245 |       path: `test-results/estate-fullscreen-expanded-${vp.name}.png`,
  246 |       fullPage: false,
  247 |     })
  248 | 
  249 |     // The panel closes with its own control and fullscreen still stands: a
  250 |     // popover that tore the layer down would also "pass" every check above.
  251 |     await external.getByTestId("topology-external-destinations-toggle").click()
  252 |     await expect(external).toHaveAttribute("data-open", "false")
  253 |     await expect(fullscreen).toBeVisible()
  254 |   })
  255 | }
  256 | 
```