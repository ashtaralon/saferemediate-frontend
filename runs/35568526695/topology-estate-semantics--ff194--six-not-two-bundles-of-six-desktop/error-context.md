# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-semantics-fixture.spec.ts >> six rules firing six functions are one bundle of six, not two bundles of six
- Location: tests/integration/topology-estate-semantics-fixture.spec.ts:207:5

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 1
Received length: 0
Received array:  []
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
      - button "S3 (10)" [pressed] [ref=e64]
      - button "DynamoDB (8)" [pressed] [ref=e65]
      - button "Lambda (6)" [pressed] [ref=e66]
      - button "EventBridge (6)" [pressed] [ref=e67]
      - button "Show all" [ref=e68]
      - button "Clear all" [ref=e69]
    - generic [ref=e70]:
      - main [ref=e71]:
        - generic [ref=e72]:
          - tablist "Estate view" [ref=e73]:
            - tab "Command map" [ref=e74]
            - tab "Network topology" [selected] [ref=e75]
            - tab "Identity & access" [ref=e76]
          - group "Map density" [ref=e77]:
            - button "Glance" [ref=e78]
            - button "Inventory" [ref=e79]
          - button "Shared neighbors" [pressed] [ref=e80]
          - button "Open map fullscreen" [ref=e81]:
            - img [ref=e82]
            - text: Map fullscreen
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]:
              - generic [ref=e92]: Platform map
              - generic [ref=e93]: 1 VPC · 2 AZ · 6 subnets · 34 resources
            - generic [ref=e94]:
              - generic [ref=e95]: Map lens
              - generic [ref=e96]:
                - button "Architecture" [ref=e97]:
                  - img [ref=e98]
                  - text: Architecture
                - button "Dependencies" [pressed] [ref=e108]:
                  - img [ref=e109]
                  - text: Dependencies
                - button "Attack paths" [ref=e113]:
                  - img [ref=e114]
                  - text: Attack paths
          - generic "Dependency line colors" [ref=e116]:
            - generic [ref=e117]: Flow colors
            - generic [ref=e118]:
              - img [ref=e119]
              - generic [ref=e121]: Service call
            - generic [ref=e122]:
              - img [ref=e123]
              - generic [ref=e125]: AWS data service
            - generic [ref=e126]:
              - img [ref=e127]
              - generic [ref=e129]: VPC endpoint
            - generic [ref=e130]:
              - img [ref=e131]
              - generic [ref=e133]: Internet egress
            - generic [ref=e134]:
              - img [ref=e135]
              - generic [ref=e137]: Database
            - generic [ref=e138]:
              - img [ref=e139]
              - generic [ref=e141]: Exposure / attack
            - generic [ref=e142]: Moving = authoritative observed
            - generic [ref=e146]:
              - img [ref=e147]
              - text: Outlined motion = historical direction
            - generic [ref=e150]:
              - img [ref=e151]
              - text: Solid = configured
            - generic [ref=e152]:
              - img [ref=e153]
              - text: Dashed = inferred / unverified
          - generic [ref=e154]:
            - generic [ref=e155]: Confirmed TCP paths
            - generic [ref=e156]: Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.
          - generic [ref=e158]:
            - generic [ref=e159]: Flow-log coverage
            - generic [ref=e160]: Partly covered
            - generic [ref=e161]: 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
            - button "Coverage details (2)" [ref=e162]
          - generic [ref=e163]:
            - generic [ref=e164]:
              - img [ref=e166]
              - generic [ref=e171]:
                - generic [ref=e172]: Users
                - generic [ref=e173]: Clients & operators
            - generic [ref=e175]:
              - img [ref=e177]
              - generic [ref=e182]:
                - generic [ref=e183]: Internet
                - generic [ref=e184]: Public path via IGW · alon-prod-igw
          - generic [ref=e185]:
            - generic [ref=e186]: ☁ AWS Cloud · acct 745783559495
            - generic [ref=e187]:
              - generic [ref=e188]: Region · eu-west-1
              - generic [ref=e189]:
                - generic [ref=e190]:
                  - generic [ref=e191]:
                    - generic "vpc-0329e985173bed24f" [ref=e192]: VPC · vpc-0329e985173bed24f
                    - generic "3 of 4 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e193]: SafeRemediate-Test-… ×3
                  - generic [ref=e196]:
                    - generic [ref=e197]:
                      - generic "eu-west-1a" [ref=e198]: Availability Zone · eu-west-1a
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e199]':
                        - generic [ref=e200]:
                          - generic [ref=e201]: Public · SafeRemediate-Test-Public-1
                          - generic [ref=e202]: 10.0.1.0/24
                        - button "high posture score …Frontend-1" [ref=e204]:
                          - generic "high posture score" [ref=e205]
                          - generic [ref=e208]: …Frontend-1
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e209]':
                        - generic [ref=e210]:
                          - generic [ref=e211]: Private · SafeRemediate-Test-Private-App-1
                          - generic [ref=e212]: 10.0.10.0/24
                        - generic [ref=e213]: No workloads
                      - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e214]':
                        - generic [ref=e215]:
                          - generic [ref=e216]: Data · SafeRemediate-Test-Private-DB-1
                          - generic [ref=e217]: 10.0.20.0/24
                        - button "quiet posture score saferemediate-test-db" [ref=e219]:
                          - generic "quiet posture score" [ref=e220]
                          - generic [ref=e223]: saferemediate-test-db
                    - generic [ref=e224]:
                      - generic "eu-west-1b" [ref=e225]: Availability Zone · eu-west-1b
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e226]':
                        - generic [ref=e227]:
                          - generic [ref=e228]: Public · SafeRemediate-Test-Public-2
                          - generic [ref=e229]: 10.0.2.0/24
                        - button "high posture score …Frontend-2" [ref=e231]:
                          - generic "high posture score" [ref=e232]
                          - generic [ref=e235]: …Frontend-2
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e236]':
                        - generic [ref=e237]:
                          - generic [ref=e238]: Private · SafeRemediate-Test-Private-App-2
                          - generic [ref=e239]: 10.0.11.0/24
                        - button "quiet posture score …App-2" [ref=e241]:
                          - generic "quiet posture score" [ref=e242]
                          - generic [ref=e245]: …App-2
                      - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e246]':
                        - generic [ref=e247]:
                          - generic [ref=e248]: Data · SafeRemediate-Test-Private-DB-2
                          - generic [ref=e249]: 10.0.21.0/24
                        - generic [ref=e250]: No workloads
                - generic [ref=e251]:
                  - generic [ref=e252]: VPC boundary
                  - generic [ref=e253]:
                    - generic [ref=e254]: ↑ Internet
                    - generic [ref=e255]:
                      - button "IGW alon-prod-igw" [ref=e256]:
                        - img [ref=e258]
                        - generic [ref=e261]: IGW
                        - generic [ref=e262]: alon-prod-igw
                      - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e263]: "egress: 9 workloads"
                  - generic [ref=e265]:
                    - generic [ref=e266]: Endpoints (4)
                    - generic [ref=e267]:
                      - button "VPCE IF EC2 Messages" [ref=e268]:
                        - img [ref=e270]
                        - generic [ref=e274]: VPCE
                        - generic [ref=e275]: IF
                        - generic [ref=e276]: EC2 Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e277]: "use: not observed"
                    - generic [ref=e278]:
                      - button "VPCE GW Amazon S3" [ref=e279]:
                        - img [ref=e281]
                        - generic [ref=e285]: VPCE
                        - generic [ref=e286]: GW
                        - generic [ref=e287]: Amazon S3
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e288]: "use: not observed"
                    - generic [ref=e289]:
                      - button "VPCE IF AWS Systems Manager" [ref=e290]:
                        - img [ref=e292]
                        - generic [ref=e296]: VPCE
                        - generic [ref=e297]: IF
                        - generic [ref=e298]: AWS Systems Manager
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e299]: "use: 3 workloads"
                    - generic [ref=e300]:
                      - button "VPCE IF SSM Messages" [ref=e301]:
                        - img [ref=e303]
                        - generic [ref=e307]: VPCE
                        - generic [ref=e308]: IF
                        - generic [ref=e309]: SSM Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e310]: "use: 1 workload"
                - generic [ref=e311]:
                  - generic [ref=e312]: Outside the VPC
                  - generic [ref=e313]: Destinations observed this generation · NAT → IGW is configured routing
                  - generic [ref=e315]:
                    - generic [ref=e316]: Unknown destinations
                    - generic [ref=e317]: 9 workloads · up to 2601 distinct · no addresses recorded
                  - generic [ref=e319]:
                    - generic [ref=e320]:
                      - generic [ref=e321]: 9 workloads
                      - generic [ref=e324]: ▸
                      - generic [ref=e325]:
                        - generic "IGW — this generation does not name the gateway" [ref=e326]: IGW
                        - generic [ref=e329]: ▸
                    - button "External destinations 9 workloads · up to 2601 distinct · no addresses recorded" [ref=e330]:
                      - img [ref=e332]
                      - generic [ref=e337]:
                        - generic [ref=e338]: External destinations
                        - generic [ref=e339]: 9 workloads · up to 2601 distinct · no addresses recorded
                - generic [ref=e340]:
                  - generic [ref=e342]: Not in this VPC
                  - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e344]:
                    - generic [ref=e345]: ALB · alon-prod-3tier-alb
                    - generic [ref=e346]: VPC vpc-086bcc2186…
                    - generic [ref=e347]: · payment-production
                - generic [ref=e349]:
                  - generic [ref=e350]:
                    - generic [ref=e351]:
                      - generic [ref=e352]: Lambda runtime (6)
                      - generic [ref=e353]:
                        - text: outside subnet grid · 6 attachment unverified
                        - generic "4 of 12 chips omit this shared prefix" [ref=e354]: · SafeRemediate-… ×4
                      - button "S3 traffic from 4 of 6 functions" [ref=e356]
                    - generic [ref=e357]:
                      - generic [ref=e358]: Triggers (6)
                      - generic [ref=e359]:
                        - button "Posture not scored fixture-frequent" [ref=e360]:
                          - generic "Posture not scored" [ref=e361]
                          - generic [ref=e364]: fixture-frequent
                        - button "Posture not scored fixture-every_6h" [ref=e365]:
                          - generic "Posture not scored" [ref=e366]
                          - generic [ref=e369]: fixture-every_6h
                        - button "Posture not scored fixture-daily" [ref=e370]:
                          - generic "Posture not scored" [ref=e371]
                          - generic [ref=e374]: fixture-daily
                        - button "Posture not scored fixture-nightly_burst" [ref=e375]:
                          - generic "Posture not scored" [ref=e376]
                          - generic [ref=e379]: fixture-nightly_burst
                        - button "Posture not scored fixture-weekly" [ref=e380]:
                          - generic "Posture not scored" [ref=e381]
                          - generic [ref=e384]: fixture-weekly
                        - button "Posture not scored fixture-monthly" [ref=e385]:
                          - generic "Posture not scored" [ref=e386]
                          - generic [ref=e389]: fixture-monthly
                    - generic [ref=e391]:
                      - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e392]:
                        - generic "quiet posture score" [ref=e393]
                        - generic [ref=e396]: AlonIAMTest-traffic-generator
                      - button "quiet posture score PaymentTrafficGenerator" [ref=e397]:
                        - generic "quiet posture score" [ref=e398]
                        - generic [ref=e401]: PaymentTrafficGenerator
                      - button "quiet posture score …BehaviorAnalyzer" [ref=e402]:
                        - generic "quiet posture score" [ref=e403]
                        - generic [ref=e406]: …BehaviorAnalyzer
                      - button "quiet posture score …ConfidenceScorer" [ref=e407]:
                        - generic "quiet posture score" [ref=e408]
                        - generic [ref=e411]: …ConfidenceScorer
                      - button "quiet posture score …CreateCheckpoint" [ref=e412]:
                        - generic "quiet posture score" [ref=e413]
                        - generic [ref=e416]: …CreateCheckpoint
                      - button "quiet posture score …PrismaWebhook" [ref=e417]:
                        - generic "quiet posture score" [ref=e418]
                        - generic [ref=e421]: …PrismaWebhook
                  - generic [ref=e423]:
                    - generic [ref=e424]:
                      - text: Regional · S3 / DDB (18)
                      - generic "3 of 18 chips omit this shared prefix" [ref=e425]: SafeRemediate-… ×3
                    - generic [ref=e427]:
                      - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e428]:
                        - generic "quiet posture score" [ref=e429]
                        - generic [ref=e432]: alon-demo-data-bucket-745783559495
                      - button "S3×9" [ref=e433]:
                        - generic [ref=e437]:
                          - text: S3
                          - generic [ref=e438]: ×9
                      - button "DynamoDB×8" [ref=e439]:
                        - generic [ref=e443]:
                          - text: DynamoDB
                          - generic [ref=e444]: ×8
          - generic [ref=e445]:
            - button "Diagnostics 6 serverless · 41 flows ▴" [ref=e446]:
              - generic [ref=e447]: Diagnostics
              - generic [ref=e448]: 6 serverless · 41 flows ▴
            - generic [ref=e449]:
              - generic [ref=e450]:
                - generic [ref=e451]: Serverless compute (6)
                - generic [ref=e452]:
                  - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e453]:
                    - generic [ref=e455]:
                      - generic [ref=e457]: AlonIAMTest-traffic-generator
                      - generic [ref=e458]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e459]: "24"
                  - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e460]:
                    - generic [ref=e462]:
                      - generic [ref=e464]: PaymentTrafficGenerator
                      - generic [ref=e465]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e466]: "18"
                  - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e467]:
                    - generic [ref=e469]:
                      - generic [ref=e471]: SafeRemediate-BehaviorAnalyzer
                      - generic [ref=e472]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e473]: "18"
                  - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e474]:
                    - generic [ref=e476]:
                      - generic [ref=e478]: SafeRemediate-ConfidenceScorer
                      - generic [ref=e479]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e480]: "18"
                  - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e481]:
                    - generic [ref=e483]:
                      - generic [ref=e485]: SafeRemediate-CreateCheckpoint
                      - generic [ref=e486]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e487]: "18"
                  - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e488]:
                    - generic [ref=e490]:
                      - generic [ref=e492]: SafeRemediate-PrismaWebhook
                      - generic [ref=e493]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e494]: "18"
              - generic [ref=e495]:
                - generic [ref=e496]:
                  - generic [ref=e497]: Observed traffic — animated arrows above
                  - generic [ref=e498]: 41 flows · 20 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
                - generic [ref=e499]: Listing 27 of 41 — the current lens and selection hide the rest. The counts above are the full evidence.
                - generic [ref=e500]:
                  - generic [ref=e501]:
                    - generic [ref=e502]: SafeRemediate-Test-App-2
                    - generic [ref=e503]: →
                    - generic [ref=e504]: vpce-0f983779fff3bbae7
                    - generic [ref=e505]: VPCE
                  - generic [ref=e506]:
                    - generic [ref=e507]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e508]: →
                    - generic [ref=e509]: vpce-0f983779fff3bbae7
                    - generic [ref=e510]: VPCE
                  - generic [ref=e511]:
                    - generic [ref=e512]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e513]: →
                    - generic [ref=e514]: vpce-04ffe43eea196bf89
                    - generic [ref=e515]: VPCE
                  - generic [ref=e516]:
                    - generic [ref=e517]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e518]: →
                    - generic [ref=e519]: vpce-0f983779fff3bbae7
                    - generic [ref=e520]: VPCE
                  - generic [ref=e521]:
                    - generic [ref=e522]: SafeRemediate-Test-App-2
                    - generic [ref=e523]: →
                    - generic [ref=e524]: Internet (via IGW)
                    - generic [ref=e525]: egress · 25 dest
                  - generic [ref=e526]:
                    - generic [ref=e527]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e528]: →
                    - generic [ref=e529]: Internet (via IGW)
                    - generic [ref=e530]: egress · 532 dest
                  - generic [ref=e531]:
                    - generic [ref=e532]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e533]: →
                    - generic [ref=e534]: Internet (via IGW)
                    - generic [ref=e535]: egress · 588 dest
                  - generic [ref=e536]:
                    - generic [ref=e537]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e538]: →
                    - generic [ref=e539]: saferemediate-test-db
                    - generic [ref=e540]: RDS · 5432
                  - generic [ref=e541]:
                    - generic [ref=e542]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e543]: →
                    - generic [ref=e544]: saferemediate-test-db
                    - generic [ref=e545]: RDS · 3306
                  - generic [ref=e546]:
                    - generic [ref=e547]: SafeRemediate-Test-App-2
                    - generic [ref=e548]: →
                    - generic [ref=e549]: saferemediate-test-db
                    - generic [ref=e550]: RDS
                  - generic [ref=e551]:
                    - generic [ref=e552]: fixture-frequent
                    - generic [ref=e553]: →
                    - generic [ref=e554]: AlonIAMTest-traffic-generator
                    - generic [ref=e555]: TARGETS
                  - generic [ref=e556]:
                    - generic [ref=e557]: fixture-every_6h
                    - generic [ref=e558]: →
                    - generic [ref=e559]: PaymentTrafficGenerator
                    - generic [ref=e560]: TARGETS
                  - generic [ref=e561]: + 15 more flows
              - generic [ref=e562]:
                - generic [ref=e563]: Encoding
                - generic [ref=e564]:
                  - generic [ref=e567]: Worst (carmine halo + pulse)
                  - generic [ref=e570]: High / elevated (ring only)
                  - generic [ref=e571]:
                    - generic [ref=e572]: ♛
                    - generic [ref=e573]: Crown-jewel halo
                  - generic [ref=e576]: Clean · remediated (teal ring)
                  - generic [ref=e579]: Stale (dimmed)
                  - generic [ref=e582]: Coverage gap (not collected)
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
                - generic: Egress · 4 flows
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
      - complementary [ref=e583]:
        - complementary [ref=e584]:
          - generic [ref=e585]:
            - generic [ref=e586]:
              - heading "Service index" [level=2] [ref=e587]
              - generic [ref=e588]: "34"
            - generic [ref=e589]:
              - img [ref=e590]
              - searchbox "Find service in topology" [ref=e593]
            - button "Filters" [ref=e596]:
              - img [ref=e597]
              - text: Filters
          - list [ref=e599]:
            - listitem [ref=e600]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e601]:
                - generic [ref=e602]:
                  - img [ref=e604]
                  - generic [ref=e606]:
                    - generic [ref=e607]:
                      - generic [ref=e608]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e609]
                    - generic [ref=e611]: S3 · eu-west-1 · regional
                    - generic [ref=e612]:
                      - generic [ref=e613]: 4 in · 0 out
                      - generic [ref=e614]:
                        - img [ref=e615]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e618]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 0 in · 4 out Jul 9, 11:04 AM" [ref=e619]:
                - generic [ref=e620]:
                  - img [ref=e622]
                  - generic [ref=e624]:
                    - generic [ref=e625]:
                      - generic [ref=e626]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e627]
                    - generic [ref=e629]: EC2 · eu-west-1a · web
                    - generic [ref=e630]:
                      - generic [ref=e631]: 0 in · 4 out
                      - generic [ref=e632]:
                        - img [ref=e633]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e636]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e637]:
                - generic [ref=e638]:
                  - img [ref=e640]
                  - generic [ref=e642]:
                    - generic [ref=e643]:
                      - generic [ref=e644]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e645]
                    - generic [ref=e647]: Lambda · eu-west-1 · regional
                    - generic [ref=e648]:
                      - generic [ref=e649]: 2 in · 1 out
                      - generic [ref=e650]:
                        - img [ref=e651]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e654]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e655]:
                - generic [ref=e656]:
                  - img [ref=e658]
                  - generic [ref=e660]:
                    - generic [ref=e661]:
                      - generic [ref=e662]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e663]
                    - generic [ref=e665]: Lambda · eu-west-1 · regional
                    - generic [ref=e666]:
                      - generic [ref=e667]: 2 in · 1 out
                      - generic [ref=e668]:
                        - img [ref=e669]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e672]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e673]:
                - generic [ref=e674]:
                  - img [ref=e676]
                  - generic [ref=e678]:
                    - generic [ref=e679]:
                      - generic [ref=e680]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e681]
                    - generic [ref=e683]: Lambda · eu-west-1 · regional
                    - generic [ref=e684]:
                      - generic [ref=e685]: 2 in · 1 out
                      - generic [ref=e686]:
                        - img [ref=e687]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e690]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e691]:
                - generic [ref=e692]:
                  - img [ref=e694]
                  - generic [ref=e696]:
                    - generic [ref=e697]:
                      - generic [ref=e698]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e699]
                    - generic [ref=e701]: Lambda · eu-west-1 · regional
                    - generic [ref=e702]:
                      - generic [ref=e703]: 2 in · 1 out
                      - generic [ref=e704]:
                        - img [ref=e705]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e708]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 0 in · 3 out Jul 9, 10:40 AM" [ref=e709]:
                - generic [ref=e710]:
                  - img [ref=e712]
                  - generic [ref=e714]:
                    - generic [ref=e715]:
                      - generic [ref=e716]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e717]
                    - generic [ref=e719]: EC2 · eu-west-1b · app
                    - generic [ref=e720]:
                      - generic [ref=e721]: 0 in · 3 out
                      - generic [ref=e722]:
                        - img [ref=e723]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e726]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 3 in · 0 out Jul 6, 03:05 PM" [ref=e727]:
                - generic [ref=e728]:
                  - img [ref=e730]
                  - generic [ref=e732]:
                    - generic [ref=e733]:
                      - generic [ref=e734]: saferemediate-test-db
                      - generic "Current graph data" [ref=e735]
                    - generic [ref=e737]: RDS · eu-west-1a · data
                    - generic [ref=e738]:
                      - generic [ref=e739]: 3 in · 0 out
                      - generic [ref=e740]:
                        - img [ref=e741]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e744]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 0 in · 3 out Jul 9, 11:04 AM" [ref=e745]:
                - generic [ref=e746]:
                  - img [ref=e748]
                  - generic [ref=e750]:
                    - generic [ref=e751]:
                      - generic [ref=e752]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e753]
                    - generic [ref=e755]: EC2 · eu-west-1b · web
                    - generic [ref=e756]:
                      - generic [ref=e757]: 0 in · 3 out
                      - generic [ref=e758]:
                        - img [ref=e759]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e762]:
              - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e763]:
                - generic [ref=e764]:
                  - img [ref=e766]
                  - generic [ref=e768]:
                    - generic [ref=e769]:
                      - generic [ref=e770]: fixture-daily
                      - generic "Current graph data" [ref=e771]
                    - generic [ref=e773]: EventBridge · eu-west-1 · regional
                    - generic [ref=e774]:
                      - generic [ref=e775]: 0 in · 2 out
                      - generic [ref=e776]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e779]:
              - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e780]:
                - generic [ref=e781]:
                  - img [ref=e783]
                  - generic [ref=e785]:
                    - generic [ref=e786]:
                      - generic [ref=e787]: fixture-every_6h
                      - generic "Current graph data" [ref=e788]
                    - generic [ref=e790]: EventBridge · eu-west-1 · regional
                    - generic [ref=e791]:
                      - generic [ref=e792]: 0 in · 2 out
                      - generic [ref=e793]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e796]:
              - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e797]:
                - generic [ref=e798]:
                  - img [ref=e800]
                  - generic [ref=e802]:
                    - generic [ref=e803]:
                      - generic [ref=e804]: fixture-frequent
                      - generic "Current graph data" [ref=e805]
                    - generic [ref=e807]: EventBridge · eu-west-1 · regional
                    - generic [ref=e808]:
                      - generic [ref=e809]: 0 in · 2 out
                      - generic [ref=e810]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e813]:
              - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e814]:
                - generic [ref=e815]:
                  - img [ref=e817]
                  - generic [ref=e819]:
                    - generic [ref=e820]:
                      - generic [ref=e821]: fixture-monthly
                      - generic "Current graph data" [ref=e822]
                    - generic [ref=e824]: EventBridge · eu-west-1 · regional
                    - generic [ref=e825]:
                      - generic [ref=e826]: 0 in · 2 out
                      - generic [ref=e827]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e830]:
              - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e831]:
                - generic [ref=e832]:
                  - img [ref=e834]
                  - generic [ref=e836]:
                    - generic [ref=e837]:
                      - generic [ref=e838]: fixture-nightly_burst
                      - generic "Current graph data" [ref=e839]
                    - generic [ref=e841]: EventBridge · eu-west-1 · regional
                    - generic [ref=e842]:
                      - generic [ref=e843]: 0 in · 2 out
                      - generic [ref=e844]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e847]:
              - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e848]:
                - generic [ref=e849]:
                  - img [ref=e851]
                  - generic [ref=e853]:
                    - generic [ref=e854]:
                      - generic [ref=e855]: fixture-weekly
                      - generic "Current graph data" [ref=e856]
                    - generic [ref=e858]: EventBridge · eu-west-1 · regional
                    - generic [ref=e859]:
                      - generic [ref=e860]: 0 in · 2 out
                      - generic [ref=e861]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e864]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e865]:
                - generic [ref=e866]:
                  - img [ref=e868]
                  - generic [ref=e870]:
                    - generic [ref=e871]:
                      - generic [ref=e872]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e873]
                    - generic [ref=e875]: Lambda · eu-west-1 · regional
                    - generic [ref=e876]:
                      - generic [ref=e877]: 2 in · 0 out
                      - generic [ref=e878]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e881]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e882]:
                - generic [ref=e883]:
                  - img [ref=e885]
                  - generic [ref=e887]:
                    - generic [ref=e888]:
                      - generic [ref=e889]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e890]
                    - generic [ref=e892]: Lambda · eu-west-1 · regional
                    - generic [ref=e893]:
                      - generic [ref=e894]: 2 in · 0 out
                      - generic [ref=e895]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e898]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e899]:
                - generic [ref=e900]:
                  - img [ref=e902]
                  - generic [ref=e905]:
                    - generic [ref=e906]:
                      - generic [ref=e907]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e908]
                    - generic [ref=e910]: S3 · eu-west-1 · regional
                    - generic [ref=e911]:
                      - generic [ref=e912]: 0 in · 0 out
                      - generic [ref=e913]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e916]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e917]:
                - generic [ref=e918]:
                  - img [ref=e920]
                  - generic [ref=e923]:
                    - generic [ref=e924]:
                      - generic [ref=e925]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e926]
                    - generic [ref=e928]: S3 · eu-west-1 · regional
                    - generic [ref=e929]:
                      - generic [ref=e930]: 0 in · 0 out
                      - generic [ref=e931]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e934]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e935]:
                - generic [ref=e936]:
                  - img [ref=e938]
                  - generic [ref=e941]:
                    - generic [ref=e942]:
                      - generic [ref=e943]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e944]
                    - generic [ref=e946]: S3 · eu-west-1 · regional
                    - generic [ref=e947]:
                      - generic [ref=e948]: 0 in · 0 out
                      - generic [ref=e949]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e952]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e953]:
                - generic [ref=e954]:
                  - img [ref=e956]
                  - generic [ref=e959]:
                    - generic [ref=e960]:
                      - generic [ref=e961]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e962]
                    - generic [ref=e964]: S3 · eu-west-1 · regional
                    - generic [ref=e965]:
                      - generic [ref=e966]: 0 in · 0 out
                      - generic [ref=e967]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e970]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e971]:
                - generic [ref=e972]:
                  - img [ref=e974]
                  - generic [ref=e977]:
                    - generic [ref=e978]:
                      - generic [ref=e979]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e980]
                    - generic [ref=e982]: S3 · eu-west-1 · regional
                    - generic [ref=e983]:
                      - generic [ref=e984]: 0 in · 0 out
                      - generic [ref=e985]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e988]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e989]:
                - generic [ref=e990]:
                  - img [ref=e992]
                  - generic [ref=e995]:
                    - generic [ref=e996]:
                      - generic [ref=e997]: cyntrotest2
                      - generic "Current graph data" [ref=e998]
                    - generic [ref=e1000]: S3 · eu-west-1 · regional
                    - generic [ref=e1001]:
                      - generic [ref=e1002]: 0 in · 0 out
                      - generic [ref=e1003]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1006]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1007]:
                - generic [ref=e1008]:
                  - img [ref=e1010]
                  - generic [ref=e1013]:
                    - generic [ref=e1014]:
                      - generic [ref=e1015]: impaciq-findings
                      - generic "Current graph data" [ref=e1016]
                    - generic [ref=e1018]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1019]:
                      - generic [ref=e1020]: 0 in · 0 out
                      - generic [ref=e1021]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1024]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1025]:
                - generic [ref=e1026]:
                  - img [ref=e1028]
                  - generic [ref=e1031]:
                    - generic [ref=e1032]:
                      - generic [ref=e1033]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e1034]
                    - generic [ref=e1036]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1037]:
                      - generic [ref=e1038]: 0 in · 0 out
                      - generic [ref=e1039]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1042]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1043]:
                - generic [ref=e1044]:
                  - img [ref=e1046]
                  - generic [ref=e1049]:
                    - generic [ref=e1050]:
                      - generic [ref=e1051]: impaciq-scan-status
                      - generic "Current graph data" [ref=e1052]
                    - generic [ref=e1054]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1055]:
                      - generic [ref=e1056]: 0 in · 0 out
                      - generic [ref=e1057]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1060]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1061]:
                - generic [ref=e1062]:
                  - img [ref=e1064]
                  - generic [ref=e1067]:
                    - generic [ref=e1068]:
                      - generic [ref=e1069]: least_privilege_role_state
                      - generic "Current graph data" [ref=e1070]
                    - generic [ref=e1072]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1073]:
                      - generic [ref=e1074]: 0 in · 0 out
                      - generic [ref=e1075]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1078]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1079]:
                - generic [ref=e1080]:
                  - img [ref=e1082]
                  - generic [ref=e1085]:
                    - generic [ref=e1086]:
                      - generic [ref=e1087]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e1088]
                    - generic [ref=e1090]: S3 · eu-west-1 · regional
                    - generic [ref=e1091]:
                      - generic [ref=e1092]: 0 in · 0 out
                      - generic [ref=e1093]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1096]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1097]:
                - generic [ref=e1098]:
                  - img [ref=e1100]
                  - generic [ref=e1103]:
                    - generic [ref=e1104]:
                      - generic [ref=e1105]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e1106]
                    - generic [ref=e1108]: S3 · eu-west-1 · regional
                    - generic [ref=e1109]:
                      - generic [ref=e1110]: 0 in · 0 out
                      - generic [ref=e1111]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1114]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1115]:
                - generic [ref=e1116]:
                  - img [ref=e1118]
                  - generic [ref=e1121]:
                    - generic [ref=e1122]:
                      - generic [ref=e1123]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e1124]
                    - generic [ref=e1126]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1127]:
                      - generic [ref=e1128]: 0 in · 0 out
                      - generic [ref=e1129]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1132]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1133]:
                - generic [ref=e1134]:
                  - img [ref=e1136]
                  - generic [ref=e1139]:
                    - generic [ref=e1140]:
                      - generic [ref=e1141]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e1142]
                    - generic [ref=e1144]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1145]:
                      - generic [ref=e1146]: 0 in · 0 out
                      - generic [ref=e1147]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1150]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1151]:
                - generic [ref=e1152]:
                  - img [ref=e1154]
                  - generic [ref=e1157]:
                    - generic [ref=e1158]:
                      - generic [ref=e1159]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e1160]
                    - generic [ref=e1162]: S3 · eu-west-1 · regional
                    - generic [ref=e1163]:
                      - generic [ref=e1164]: 0 in · 0 out
                      - generic [ref=e1165]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1168]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1169]:
                - generic [ref=e1170]:
                  - img [ref=e1172]
                  - generic [ref=e1175]:
                    - generic [ref=e1176]:
                      - generic [ref=e1177]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e1178]
                    - generic [ref=e1180]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1181]:
                      - generic [ref=e1182]: 0 in · 0 out
                      - generic [ref=e1183]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1186]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1187]:
                - generic [ref=e1188]:
                  - img [ref=e1190]
                  - generic [ref=e1193]:
                    - generic [ref=e1194]:
                      - generic [ref=e1195]: sg_state
                      - generic "Current graph data" [ref=e1196]
                    - generic [ref=e1198]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1199]:
                      - generic [ref=e1200]: 0 in · 0 out
                      - generic [ref=e1201]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1204]:
      - text: Live read from
      - generic [ref=e1205]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1206]
```

# Test source

```ts
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
  177 |   // would report a perimeter crossing on the evidence that a route exists,
  178 |   // under a caption saying the counts are observed.
  179 |   const none = noEgressSnapshot()
  180 |   const withRoute = {
  181 |     ...none.snapshot,
  182 |     traffic_edges: [
  183 |       ...none.snapshot.traffic_edges,
  184 |       {
  185 |         edge_class: "egress",
  186 |         source_id: "rtb-fixture0a1b2c3d4",
  187 |         target_id: "__igw__",
  188 |         port: null,
  189 |         protocol: "ROUTES_TO",
  190 |         last_seen: null,
  191 |         external_destinations: 12,
  192 |         evidence_type: "configured",
  193 |         evidence_source: "aws_configuration",
  194 |         authority_state: "configured",
  195 |         path_basis: "configured_route",
  196 |       },
  197 |     ],
  198 |   }
  199 |   await openMap(context, page, withRoute)
  200 |   await expect(page.locator('[data-tier="data"]').first()).toBeVisible()
  201 |   await expect(page.getByTestId("topology-external-destinations")).toHaveCount(0)
  202 | })
  203 | 
  204 | // ---------------------------------------------------------------------------
  205 | // F4 — one relationship, drawn once, counted in connections.
  206 | // ---------------------------------------------------------------------------
  207 | test("six rules firing six functions are one bundle of six, not two bundles of six", async ({
  208 |   context,
  209 |   page,
  210 | }) => {
  211 |   test.setTimeout(120_000)
  212 |   const triggers = triggerBundleSnapshot()
  213 |   expect(triggers.expectedPairs).toBe(6)
  214 |   expect(triggers.expectedEdgeRows).toBe(12)
  215 |   await openMap(context, page, triggers.snapshot)
  216 | 
  217 |   // Every badge that stands for a collapsed trunk word.
  218 |   const collapsed = page.locator('[data-testid="topology-flow-badge"][data-bundle-spellings]')
  219 |   await expect(collapsed.first()).toBeVisible({ timeout: 30_000 })
  220 |   // Matched on the COUNTS, not on a spelling order: which of the two the badge
  221 |   // prints follows payload edge order, and pinning that order here would make
  222 |   // this test assert the fixture's array literal instead of the collapse.
  223 |   const mirrored = page.locator(
  224 |     `[data-testid="topology-flow-badge"][data-bundle-pairs="${triggers.expectedPairs}"]` +
  225 |       `[data-bundle-edges="${triggers.expectedEdgeRows}"]`,
  226 |   )
  227 |   await expect(mirrored, "one badge speaks for both spellings").toHaveCount(1)
  228 |   const spellings = ((await mirrored.getAttribute("data-bundle-spellings")) ?? "").split(",")
  229 |   expect([...spellings].sort()).toEqual(["TARGETS", "TRIGGERS"])
  230 |   const [printed, twin] = spellings
  231 | 
  232 |   // The duplication itself: no second badge repeats the same relationship.
  233 |   await expect(
  234 |     page.locator(`[data-testid="topology-flow-badge"][data-bundle-spellings="${twin}"]`),
  235 |     `${twin} never gets a badge of its own once it is a twin of ${printed}`,
  236 |   ).toHaveCount(0)
  237 |   // The DRAWN words only: a badge group also contains its <title>, and the
  238 |   // title is where the twin spelling is supposed to live, so reading the group
  239 |   // would find it in exactly the place this change put it.
  240 |   const drawn = await page
  241 |     .locator('[data-testid="topology-flow-badge"][data-bundle-spellings] text')
  242 |     .allTextContents()
  243 |   expect(
  244 |     drawn.filter(t => t.includes(twin)),
  245 |     `trunk badges read ${JSON.stringify(drawn)}`,
  246 |   ).toHaveLength(0)
> 247 |   expect(drawn.filter(t => t.trim() === `${printed} \u00d7${triggers.expectedPairs}`)).toHaveLength(1)
      |                                                                                        ^ Error: expect(received).toHaveLength(expected)
  248 | 
  249 |   // The twin spelling and the row count survive, on demand, in the title.
  250 |   const title = (await mirrored.locator("title").textContent()) ?? ""
  251 |   expect(title).toContain(`also recorded as ${twin}`)
  252 |   expect(title).toContain("12 edge rows in the graph for 6 connections")
  253 | })
  254 | 
  255 | test("the Lambda lane states S3 traffic from 4 of 6, names the four, and records no action", async ({
  256 |   context,
  257 |   page,
  258 | }) => {
  259 |   test.setTimeout(120_000)
  260 |   const triggers = triggerBundleSnapshot()
  261 |   expect(triggers.s3Functions).toHaveLength(4)
  262 |   expect(triggers.lambdas).toHaveLength(6)
  263 |   await openMap(context, page, triggers.snapshot)
  264 | 
  265 |   const panel = page.getByTestId("topology-lambda-s3-coverage").first()
  266 |   await expect(panel).toBeVisible()
  267 |   await expect(panel).toHaveAttribute("data-with-traffic", "4")
  268 |   await expect(panel).toHaveAttribute("data-total", "6")
  269 |   await expect(panel).toHaveAttribute("data-no-actions-recorded", "true")
  270 |   const toggle = panel.getByTestId("topology-lambda-s3-coverage-toggle")
  271 |   await expect(toggle).toHaveText("S3 traffic from 4 of 6 functions")
  272 |   await expect(panel.getByTestId("topology-lambda-s3-coverage-details")).toBeHidden()
  273 | 
  274 |   await toggle.click()
  275 |   const names = panel.getByTestId("topology-lambda-s3-coverage-function")
  276 |   await expect(names).toHaveCount(4)
  277 |   for (const fn of triggers.s3Functions) {
  278 |     await expect(panel.locator(`[data-function-id="${fn.id}"]`)).toHaveCount(1)
  279 |   }
  280 |   // The two without an edge are not named as having traffic.
  281 |   for (const fn of triggers.lambdas.slice(4)) {
  282 |     await expect(panel.locator(`[data-function-id="${fn.id}"]`)).toHaveCount(0)
  283 |   }
  284 |   await expect(panel).toContainText("2 functions have no recorded S3 edge")
  285 |   // observed_actions is empty on all four: say so, never name an operation.
  286 |   await expect(panel.getByTestId("topology-lambda-s3-no-actions")).toContainText(
  287 |     "No specific S3 actions were recorded",
  288 |   )
  289 |   await expect(panel).not.toContainText("GetObject")
  290 |   await expect(panel).not.toContainText("PutObject")
  291 | })
  292 | 
```