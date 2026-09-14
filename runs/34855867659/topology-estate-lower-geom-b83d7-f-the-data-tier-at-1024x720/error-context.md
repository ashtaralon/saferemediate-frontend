# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-lower-geometry-fixture.spec.ts >> lower estate sections stay clear of the data tier at 1024x720
- Location: tests/integration/topology-estate-lower-geometry-fixture.spec.ts:115:7

# Error details

```
Error: panel is translucent at 1024x720

expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0.112979
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
    - main [ref=e74]:
      - generic [ref=e75]:
        - tablist "Estate view" [ref=e76]:
          - tab "Command map" [ref=e77]
          - tab "Network topology" [selected] [ref=e78]
        - group "Map density" [ref=e79]:
          - button "Glance" [ref=e80]
          - button "Inventory" [ref=e81]
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
            - generic [ref=e188]:
              - generic [ref=e189]: 9 workloads
              - generic [ref=e192]: ▸
              - generic [ref=e193]:
                - generic "NAT nat-fixture0a1b2c3d4" [ref=e194]:
                  - text: NAT
                  - generic [ref=e195]: nat-fixture0a1b2c3d4
                - generic [ref=e198]: ▸
              - generic [ref=e199]:
                - generic "IGW igw-03bb3f19b706abbc4" [ref=e200]:
                  - text: IGW
                  - generic [ref=e201]: igw-03bb3f19b706abbc4
                - generic [ref=e204]: ▸
            - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [expanded] [ref=e205]:
              - img [ref=e207]
              - generic [ref=e212]:
                - generic [ref=e213]: External destinations
                - generic [ref=e214]: 9 workloads · up to 2579 distinct · addresses sampled
        - generic [ref=e215]:
          - generic [ref=e216]: ☁ AWS Cloud · acct 745783559495
          - generic [ref=e217]:
            - generic [ref=e218]: Region · eu-west-1
            - generic [ref=e219]:
              - generic [ref=e220]:
                - generic [ref=e221]:
                  - generic "vpc-0329e985173bed24f" [ref=e222]: VPC · vpc-0329e985173bed24f
                  - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e223]: SafeRemediate-Test-… ×3
                - generic [ref=e226]:
                  - generic [ref=e227]:
                    - generic "eu-west-1a" [ref=e228]: Availability Zone · eu-west-1a
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e229]':
                      - generic [ref=e230]:
                        - generic [ref=e231]: Public · SafeRemediate-Test-Public-1
                        - generic [ref=e232]: 10.0.1.0/24
                      - button "high posture score …Frontend-1" [ref=e234]:
                        - generic "high posture score" [ref=e235]
                        - generic [ref=e238]: …Frontend-1
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e239]':
                      - generic [ref=e240]:
                        - generic [ref=e241]: Private · SafeRemediate-Test-Private-App-1
                        - generic [ref=e242]: 10.0.10.0/24
                      - generic [ref=e243]: No workloads
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e244]':
                      - generic [ref=e245]:
                        - generic [ref=e246]: Data · SafeRemediate-Test-Private-DB-1
                        - generic [ref=e247]: 10.0.20.0/24
                      - generic [ref=e248]:
                        - button "quiet posture score saferemediate-test-db" [ref=e249]:
                          - generic "quiet posture score" [ref=e250]
                          - generic [ref=e253]: saferemediate-test-db
                        - button "Posture not scored fixture-neptune-1" [ref=e254]:
                          - generic "Posture not scored" [ref=e255]
                          - generic [ref=e258]: fixture-neptune-1
                  - generic [ref=e259]:
                    - generic "eu-west-1b" [ref=e260]: Availability Zone · eu-west-1b
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e261]':
                      - generic [ref=e262]:
                        - generic [ref=e263]: Public · SafeRemediate-Test-Public-2
                        - generic [ref=e264]: 10.0.2.0/24
                      - button "high posture score …Frontend-2" [ref=e266]:
                        - generic "high posture score" [ref=e267]
                        - generic [ref=e270]: …Frontend-2
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e271]':
                      - generic [ref=e272]:
                        - generic [ref=e273]: Private · SafeRemediate-Test-Private-App-2
                        - generic [ref=e274]: 10.0.11.0/24
                      - button "quiet posture score …App-2" [ref=e276]:
                        - generic "quiet posture score" [ref=e277]
                        - generic [ref=e280]: …App-2
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e281]':
                      - generic [ref=e282]:
                        - generic [ref=e283]: Data · SafeRemediate-Test-Private-DB-2
                        - generic [ref=e284]: 10.0.21.0/24
                      - generic [ref=e285]: No workloads
              - generic [ref=e286]:
                - generic [ref=e287]: VPC boundary
                - generic [ref=e288]:
                  - generic [ref=e289]: ↑ Internet
                  - generic [ref=e290]:
                    - button "IGW alon-prod-igw" [ref=e291]:
                      - img [ref=e293]
                      - generic [ref=e296]: IGW
                      - generic [ref=e297]: alon-prod-igw
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e298]: "egress: 9 workloads"
                - generic [ref=e300]:
                  - generic [ref=e301]: Endpoints (4)
                  - generic [ref=e302]:
                    - button "VPCE IF EC2 Messages" [ref=e303]:
                      - img [ref=e305]
                      - generic [ref=e309]: VPCE
                      - generic [ref=e310]: IF
                      - generic [ref=e311]: EC2 Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e312]: "use: not observed"
                  - generic [ref=e313]:
                    - button "VPCE GW Amazon S3" [ref=e314]:
                      - img [ref=e316]
                      - generic [ref=e320]: VPCE
                      - generic [ref=e321]: GW
                      - generic [ref=e322]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e323]: "use: not observed"
                  - generic [ref=e324]:
                    - button "VPCE IF AWS Systems Manager" [ref=e325]:
                      - img [ref=e327]
                      - generic [ref=e331]: VPCE
                      - generic [ref=e332]: IF
                      - generic [ref=e333]: AWS Systems Manager
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e334]: "use: 3 workloads"
                  - generic [ref=e335]:
                    - button "VPCE IF SSM Messages" [ref=e336]:
                      - img [ref=e338]
                      - generic [ref=e342]: VPCE
                      - generic [ref=e343]: IF
                      - generic [ref=e344]: SSM Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e345]: "use: 1 workload"
              - generic [ref=e346]:
                - generic [ref=e348]: Not in this VPC
                - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e350]:
                  - generic [ref=e351]: ALB · alon-prod-3tier-alb
                  - generic [ref=e352]: VPC vpc-086bcc2186…
                  - generic [ref=e353]: · payment-production
              - generic [ref=e355]:
                - generic [ref=e356]:
                  - generic [ref=e357]:
                    - generic [ref=e358]: Lambda runtime (6)
                    - generic [ref=e359]:
                      - text: outside subnet grid · 6 attachment unverified
                      - generic "4 of 12 chips omit this shared prefix" [ref=e360]: · SafeRemediate-… ×4
                    - button "S3 traffic from 4 of 6 functions" [ref=e362]
                  - generic [ref=e363]:
                    - generic [ref=e364]: Triggers (6)
                    - generic [ref=e365]:
                      - button "Posture not scored fixture-frequent" [ref=e366]:
                        - generic "Posture not scored" [ref=e367]
                        - generic [ref=e370]: fixture-frequent
                      - button "Posture not scored fixture-every_6h" [ref=e371]:
                        - generic "Posture not scored" [ref=e372]
                        - generic [ref=e375]: fixture-every_6h
                      - button "Posture not scored fixture-daily" [ref=e376]:
                        - generic "Posture not scored" [ref=e377]
                        - generic [ref=e380]: fixture-daily
                      - button "Posture not scored fixture-nightly_burst" [ref=e381]:
                        - generic "Posture not scored" [ref=e382]
                        - generic [ref=e385]: fixture-nightly_burst
                      - button "Posture not scored fixture-weekly" [ref=e386]:
                        - generic "Posture not scored" [ref=e387]
                        - generic [ref=e390]: fixture-weekly
                      - button "Posture not scored fixture-monthly" [ref=e391]:
                        - generic "Posture not scored" [ref=e392]
                        - generic [ref=e395]: fixture-monthly
                  - generic [ref=e397]:
                    - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e398]:
                      - generic "quiet posture score" [ref=e399]
                      - generic [ref=e402]: AlonIAMTest-traffic-generator
                    - button "quiet posture score PaymentTrafficGenerator" [ref=e403]:
                      - generic "quiet posture score" [ref=e404]
                      - generic [ref=e407]: PaymentTrafficGenerator
                    - button "quiet posture score …BehaviorAnalyzer" [ref=e408]:
                      - generic "quiet posture score" [ref=e409]
                      - generic [ref=e412]: …BehaviorAnalyzer
                    - button "quiet posture score …ConfidenceScorer" [ref=e413]:
                      - generic "quiet posture score" [ref=e414]
                      - generic [ref=e417]: …ConfidenceScorer
                    - button "quiet posture score …CreateCheckpoint" [ref=e418]:
                      - generic "quiet posture score" [ref=e419]
                      - generic [ref=e422]: …CreateCheckpoint
                    - button "quiet posture score …PrismaWebhook" [ref=e423]:
                      - generic "quiet posture score" [ref=e424]
                      - generic [ref=e427]: …PrismaWebhook
                - generic [ref=e429]:
                  - generic [ref=e430]:
                    - text: Regional · S3 / DDB (18)
                    - generic "3 of 18 chips omit this shared prefix" [ref=e431]: SafeRemediate-… ×3
                  - generic [ref=e433]:
                    - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e434]:
                      - generic "quiet posture score" [ref=e435]
                      - generic [ref=e438]: alon-demo-data-bucket-745783559495
                    - button "S3×9" [ref=e439]:
                      - generic [ref=e443]:
                        - text: S3
                        - generic [ref=e444]: ×9
                    - button "DynamoDB×8" [ref=e445]:
                      - generic [ref=e449]:
                        - text: DynamoDB
                        - generic [ref=e450]: ×8
            - generic [ref=e451]:
              - button "Logical groups · members carry the placement (6) Hide members" [expanded] [ref=e452]:
                - generic [ref=e453]: Logical groups · members carry the placement (6)
                - generic [ref=e454]: Hide members
              - generic [ref=e455]:
                - generic [ref=e456]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
                - generic [ref=e457]:
                  - button "Posture not scored fixture-tg-web" [ref=e458]:
                    - generic "Posture not scored" [ref=e459]
                    - generic [ref=e462]: fixture-tg-web
                  - generic [ref=e463]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e464]:
                    - button "SafeRemediate-Test-App-2" [ref=e465]
                    - button "SafeRemediate-Test-Frontend-1" [ref=e466]
                - generic [ref=e467]:
                  - button "Posture not scored fixture-tg-app" [ref=e468]:
                    - generic "Posture not scored" [ref=e469]
                    - generic [ref=e472]: fixture-tg-app
                  - generic [ref=e473]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e474]:
                    - button "SafeRemediate-Test-Frontend-1" [ref=e475]
                    - button "SafeRemediate-Test-Frontend-2" [ref=e476]
                - generic [ref=e477]:
                  - button "Posture not scored fixture-asg-web" [ref=e478]:
                    - generic "Posture not scored" [ref=e479]
                    - generic [ref=e482]: fixture-asg-web
                  - generic [ref=e483]: VPC vpc-0329e985173bed24f · spans eu-west-1b
                  - generic [ref=e484]:
                    - button "SafeRemediate-Test-Frontend-2" [ref=e485]
                    - button "SafeRemediate-Test-App-2" [ref=e486]
                - generic [ref=e487]:
                  - button "Posture not scored fixture-asg-app" [ref=e488]:
                    - generic "Posture not scored" [ref=e489]
                    - generic [ref=e492]: fixture-asg-app
                  - generic [ref=e493]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e494]:
                    - button "SafeRemediate-Test-App-2" [ref=e495]
                    - button "SafeRemediate-Test-Frontend-1" [ref=e496]
                - generic [ref=e497]:
                  - button "Posture not scored fixture-aurora" [ref=e498]:
                    - generic "Posture not scored" [ref=e499]
                    - generic [ref=e502]: fixture-aurora
                  - generic [ref=e503]: VPC vpc-0329e985173bed24f · spans eu-west-1a
                  - button "saferemediate-test-db" [ref=e505]
                - generic [ref=e506]:
                  - button "Posture not scored fixture-graph" [ref=e507]:
                    - generic "Posture not scored" [ref=e508]
                    - generic [ref=e511]: fixture-graph
                  - generic [ref=e512]: VPC vpc-0329e985173bed24f · spans eu-west-1a
                  - button "fixture-neptune-1" [ref=e514]
        - generic [ref=e515]:
          - button "Diagnostics 6 serverless · 51 flows ▴" [ref=e516]:
            - generic [ref=e517]: Diagnostics
            - generic [ref=e518]: 6 serverless · 51 flows ▴
          - generic [ref=e519]:
            - generic [ref=e520]:
              - generic [ref=e521]: Serverless compute (6)
              - generic [ref=e522]:
                - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e523]:
                  - generic [ref=e525]:
                    - generic [ref=e527]: AlonIAMTest-traffic-generator
                    - generic [ref=e528]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e529]: "24"
                - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e530]:
                  - generic [ref=e532]:
                    - generic [ref=e534]: PaymentTrafficGenerator
                    - generic [ref=e535]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e536]: "18"
                - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e537]:
                  - generic [ref=e539]:
                    - generic [ref=e541]: SafeRemediate-BehaviorAnalyzer
                    - generic [ref=e542]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e543]: "18"
                - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e544]:
                  - generic [ref=e546]:
                    - generic [ref=e548]: SafeRemediate-ConfidenceScorer
                    - generic [ref=e549]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e550]: "18"
                - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e551]:
                  - generic [ref=e553]:
                    - generic [ref=e555]: SafeRemediate-CreateCheckpoint
                    - generic [ref=e556]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e557]: "18"
                - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e558]:
                  - generic [ref=e560]:
                    - generic [ref=e562]: SafeRemediate-PrismaWebhook
                    - generic [ref=e563]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e564]: "18"
            - generic [ref=e565]:
              - generic [ref=e566]:
                - generic [ref=e567]: Observed traffic — animated arrows above
                - generic [ref=e568]: 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
              - generic [ref=e569]: Listing 36 of 51 — the current lens and selection hide the rest. The counts above are the full evidence.
              - generic [ref=e570]:
                - generic [ref=e571]:
                  - generic [ref=e572]: SafeRemediate-Test-App-2
                  - generic [ref=e573]: →
                  - generic [ref=e574]: vpce-0f983779fff3bbae7
                  - generic [ref=e575]: VPCE
                - generic [ref=e576]:
                  - generic [ref=e577]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e578]: →
                  - generic [ref=e579]: vpce-0f983779fff3bbae7
                  - generic [ref=e580]: VPCE
                - generic [ref=e581]:
                  - generic [ref=e582]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e583]: →
                  - generic [ref=e584]: vpce-04ffe43eea196bf89
                  - generic [ref=e585]: VPCE
                - generic [ref=e586]:
                  - generic [ref=e587]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e588]: →
                  - generic [ref=e589]: vpce-0f983779fff3bbae7
                  - generic [ref=e590]: VPCE
                - generic [ref=e591]:
                  - generic [ref=e592]: SafeRemediate-Test-App-2
                  - generic [ref=e593]: →
                  - generic [ref=e594]: Internet (via IGW)
                  - generic [ref=e595]: egress · 3 (ext 3)
                - generic [ref=e596]:
                  - generic [ref=e597]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e598]: →
                  - generic [ref=e599]: Internet (via IGW)
                  - generic [ref=e600]: egress · 532 (ext 532)
                - generic [ref=e601]:
                  - generic [ref=e602]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e603]: →
                  - generic [ref=e604]: Internet (via IGW)
                  - generic [ref=e605]: egress · 588 (ext 588)
                - generic [ref=e606]:
                  - generic [ref=e607]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e608]: →
                  - generic [ref=e609]: saferemediate-test-db
                  - generic [ref=e610]: RDS · 5432
                - generic [ref=e611]:
                  - generic [ref=e612]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e613]: →
                  - generic [ref=e614]: saferemediate-test-db
                  - generic [ref=e615]: RDS · 3306
                - generic [ref=e616]:
                  - generic [ref=e617]: SafeRemediate-Test-App-2
                  - generic [ref=e618]: →
                  - generic [ref=e619]: saferemediate-test-db
                  - generic [ref=e620]: RDS
                - generic [ref=e621]:
                  - generic [ref=e622]: fixture-tg-web
                  - generic [ref=e623]: →
                  - generic [ref=e624]: SafeRemediate-Test-App-2
                  - generic [ref=e625]: TARGETS
                - generic [ref=e626]:
                  - generic [ref=e627]: fixture-tg-web
                  - generic [ref=e628]: →
                  - generic [ref=e629]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e630]: TARGETS
                - generic [ref=e631]: + 24 more flows
            - generic [ref=e632]:
              - generic [ref=e633]: Encoding
              - generic [ref=e634]:
                - generic [ref=e637]: Worst (carmine halo + pulse)
                - generic [ref=e640]: High / elevated (ring only)
                - generic [ref=e641]:
                  - generic [ref=e642]: ♛
                  - generic [ref=e643]: Crown-jewel halo
                - generic [ref=e646]: Clean · remediated (teal ring)
                - generic [ref=e649]: Stale (dimmed)
                - generic [ref=e652]: Coverage gap (not collected)
        - img:
          - generic:
            - generic:
              - generic: VPCE · 4 flows
          - generic:
            - generic:
              - generic: Egress · 3 flows
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
              - generic: TARGETS
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: LAUNCHES
          - generic:
            - generic:
              - generic: LAUNCHES
          - generic:
            - generic:
              - generic: LAUNCHES
          - generic:
            - generic:
              - generic: LAUNCHES
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
    - complementary [ref=e654]:
      - generic [ref=e655]:
        - generic [ref=e656]:
          - heading "Service index" [level=2] [ref=e657]
          - generic [ref=e658]: "41"
        - generic [ref=e659]:
          - img [ref=e660]
          - searchbox "Find service in topology" [ref=e663]
        - button "Filters" [ref=e666]:
          - img [ref=e667]
          - text: Filters
      - list [ref=e669]:
        - listitem [ref=e670]:
          - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e671]:
            - generic [ref=e672]:
              - img [ref=e674]
              - generic [ref=e676]:
                - generic [ref=e677]:
                  - generic [ref=e678]: SafeRemediate-Test-Frontend-1
                  - generic "Current graph data" [ref=e679]
                - generic [ref=e681]: EC2 · eu-west-1a · web
                - generic [ref=e682]:
                  - generic [ref=e683]: 3 in · 4 out
                  - generic [ref=e684]:
                    - img [ref=e685]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e688]:
          - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e689]:
            - generic [ref=e690]:
              - img [ref=e692]
              - generic [ref=e694]:
                - generic [ref=e695]:
                  - generic [ref=e696]: SafeRemediate-Test-App-2
                  - generic "Current graph data" [ref=e697]
                - generic [ref=e699]: EC2 · eu-west-1b · app
                - generic [ref=e700]:
                  - generic [ref=e701]: 3 in · 3 out
                  - generic [ref=e702]:
                    - img [ref=e703]
                    - text: Jul 9, 10:40 AM
        - listitem [ref=e706]:
          - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e707]:
            - generic [ref=e708]:
              - img [ref=e710]
              - generic [ref=e712]:
                - generic [ref=e713]:
                  - generic [ref=e714]: SafeRemediate-Test-Frontend-2
                  - generic "Current graph data" [ref=e715]
                - generic [ref=e717]: EC2 · eu-west-1b · web
                - generic [ref=e718]:
                  - generic [ref=e719]: 2 in · 3 out
                  - generic [ref=e720]:
                    - img [ref=e721]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e724]:
          - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e725]:
            - generic [ref=e726]:
              - img [ref=e728]
              - generic [ref=e730]:
                - generic [ref=e731]:
                  - generic [ref=e732]: alon-demo-data-bucket-745783559495
                  - generic "Current graph data" [ref=e733]
                - generic [ref=e735]: S3 · eu-west-1 · regional
                - generic [ref=e736]:
                  - generic [ref=e737]: 4 in · 0 out
                  - generic [ref=e738]:
                    - img [ref=e739]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e742]:
          - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e743]:
            - generic [ref=e744]:
              - img [ref=e746]
              - generic [ref=e748]:
                - generic [ref=e749]:
                  - generic [ref=e750]: saferemediate-test-db
                  - generic "Current graph data" [ref=e751]
                - generic [ref=e753]: RDS · eu-west-1a · data
                - generic [ref=e754]:
                  - generic [ref=e755]: 4 in · 0 out
                  - generic [ref=e756]:
                    - img [ref=e757]
                    - text: Jul 6, 03:05 PM
        - listitem [ref=e760]:
          - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e761]:
            - generic [ref=e762]:
              - img [ref=e764]
              - generic [ref=e766]:
                - generic [ref=e767]:
                  - generic [ref=e768]: AlonIAMTest-traffic-generator
                  - generic "Current graph data" [ref=e769]
                - generic [ref=e771]: Lambda · eu-west-1 · regional
                - generic [ref=e772]:
                  - generic [ref=e773]: 2 in · 1 out
                  - generic [ref=e774]:
                    - img [ref=e775]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e778]:
          - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e779]:
            - generic [ref=e780]:
              - img [ref=e782]
              - generic [ref=e784]:
                - generic [ref=e785]:
                  - generic [ref=e786]: PaymentTrafficGenerator
                  - generic "Current graph data" [ref=e787]
                - generic [ref=e789]: Lambda · eu-west-1 · regional
                - generic [ref=e790]:
                  - generic [ref=e791]: 2 in · 1 out
                  - generic [ref=e792]:
                    - img [ref=e793]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e796]:
          - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e797]:
            - generic [ref=e798]:
              - img [ref=e800]
              - generic [ref=e802]:
                - generic [ref=e803]:
                  - generic [ref=e804]: SafeRemediate-BehaviorAnalyzer
                  - generic "Current graph data" [ref=e805]
                - generic [ref=e807]: Lambda · eu-west-1 · regional
                - generic [ref=e808]:
                  - generic [ref=e809]: 2 in · 1 out
                  - generic [ref=e810]:
                    - img [ref=e811]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e814]:
          - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e815]:
            - generic [ref=e816]:
              - img [ref=e818]
              - generic [ref=e820]:
                - generic [ref=e821]:
                  - generic [ref=e822]: SafeRemediate-ConfidenceScorer
                  - generic "Current graph data" [ref=e823]
                - generic [ref=e825]: Lambda · eu-west-1 · regional
                - generic [ref=e826]:
                  - generic [ref=e827]: 2 in · 1 out
                  - generic [ref=e828]:
                    - img [ref=e829]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e832]:
          - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e833]:
            - generic [ref=e834]:
              - img [ref=e836]
              - generic [ref=e838]:
                - generic [ref=e839]:
                  - generic [ref=e840]: fixture-asg-app
                  - generic "Current graph data" [ref=e841]
                - generic [ref=e843]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e844]:
                  - generic [ref=e845]: 0 in · 2 out
                  - generic [ref=e846]:
                    - img [ref=e847]
                    - text: No runtime timestamp
        - listitem [ref=e850]:
          - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e851]:
            - generic [ref=e852]:
              - img [ref=e854]
              - generic [ref=e856]:
                - generic [ref=e857]:
                  - generic [ref=e858]: fixture-asg-web
                  - generic "Current graph data" [ref=e859]
                - generic [ref=e861]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e862]:
                  - generic [ref=e863]: 0 in · 2 out
                  - generic [ref=e864]:
                    - img [ref=e865]
                    - text: No runtime timestamp
        - listitem [ref=e868]:
          - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e869]:
            - generic [ref=e870]:
              - img [ref=e872]
              - generic [ref=e874]:
                - generic [ref=e875]:
                  - generic [ref=e876]: fixture-daily
                  - generic "Current graph data" [ref=e877]
                - generic [ref=e879]: EventBridge · eu-west-1 · regional
                - generic [ref=e880]:
                  - generic [ref=e881]: 0 in · 2 out
                  - generic [ref=e882]:
                    - img [ref=e883]
                    - text: No runtime timestamp
        - listitem [ref=e886]:
          - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e887]:
            - generic [ref=e888]:
              - img [ref=e890]
              - generic [ref=e892]:
                - generic [ref=e893]:
                  - generic [ref=e894]: fixture-every_6h
                  - generic "Current graph data" [ref=e895]
                - generic [ref=e897]: EventBridge · eu-west-1 · regional
                - generic [ref=e898]:
                  - generic [ref=e899]: 0 in · 2 out
                  - generic [ref=e900]:
                    - img [ref=e901]
                    - text: No runtime timestamp
        - listitem [ref=e904]:
          - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e905]:
            - generic [ref=e906]:
              - img [ref=e908]
              - generic [ref=e910]:
                - generic [ref=e911]:
                  - generic [ref=e912]: fixture-frequent
                  - generic "Current graph data" [ref=e913]
                - generic [ref=e915]: EventBridge · eu-west-1 · regional
                - generic [ref=e916]:
                  - generic [ref=e917]: 0 in · 2 out
                  - generic [ref=e918]:
                    - img [ref=e919]
                    - text: No runtime timestamp
        - listitem [ref=e922]:
          - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e923]:
            - generic [ref=e924]:
              - img [ref=e926]
              - generic [ref=e928]:
                - generic [ref=e929]:
                  - generic [ref=e930]: fixture-monthly
                  - generic "Current graph data" [ref=e931]
                - generic [ref=e933]: EventBridge · eu-west-1 · regional
                - generic [ref=e934]:
                  - generic [ref=e935]: 0 in · 2 out
                  - generic [ref=e936]:
                    - img [ref=e937]
                    - text: No runtime timestamp
        - listitem [ref=e940]:
          - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e941]:
            - generic [ref=e942]:
              - img [ref=e944]
              - generic [ref=e946]:
                - generic [ref=e947]:
                  - generic [ref=e948]: fixture-nightly_burst
                  - generic "Current graph data" [ref=e949]
                - generic [ref=e951]: EventBridge · eu-west-1 · regional
                - generic [ref=e952]:
                  - generic [ref=e953]: 0 in · 2 out
                  - generic [ref=e954]:
                    - img [ref=e955]
                    - text: No runtime timestamp
        - listitem [ref=e958]:
          - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e959]:
            - generic [ref=e960]:
              - img [ref=e962]
              - generic [ref=e964]:
                - generic [ref=e965]:
                  - generic [ref=e966]: fixture-tg-app
                  - generic "Current graph data" [ref=e967]
                - generic [ref=e969]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e970]:
                  - generic [ref=e971]: 0 in · 2 out
                  - generic [ref=e972]:
                    - img [ref=e973]
                    - text: No runtime timestamp
        - listitem [ref=e976]:
          - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e977]:
            - generic [ref=e978]:
              - img [ref=e980]
              - generic [ref=e982]:
                - generic [ref=e983]:
                  - generic [ref=e984]: fixture-tg-web
                  - generic "Current graph data" [ref=e985]
                - generic [ref=e987]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e988]:
                  - generic [ref=e989]: 0 in · 2 out
                  - generic [ref=e990]:
                    - img [ref=e991]
                    - text: No runtime timestamp
        - listitem [ref=e994]:
          - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e995]:
            - generic [ref=e996]:
              - img [ref=e998]
              - generic [ref=e1000]:
                - generic [ref=e1001]:
                  - generic [ref=e1002]: fixture-weekly
                  - generic "Current graph data" [ref=e1003]
                - generic [ref=e1005]: EventBridge · eu-west-1 · regional
                - generic [ref=e1006]:
                  - generic [ref=e1007]: 0 in · 2 out
                  - generic [ref=e1008]:
                    - img [ref=e1009]
                    - text: No runtime timestamp
        - listitem [ref=e1012]:
          - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1013]:
            - generic [ref=e1014]:
              - img [ref=e1016]
              - generic [ref=e1018]:
                - generic [ref=e1019]:
                  - generic [ref=e1020]: SafeRemediate-CreateCheckpoint
                  - generic "Current graph data" [ref=e1021]
                - generic [ref=e1023]: Lambda · eu-west-1 · regional
                - generic [ref=e1024]:
                  - generic [ref=e1025]: 2 in · 0 out
                  - generic [ref=e1026]:
                    - img [ref=e1027]
                    - text: No runtime timestamp
        - listitem [ref=e1030]:
          - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1031]:
            - generic [ref=e1032]:
              - img [ref=e1034]
              - generic [ref=e1036]:
                - generic [ref=e1037]:
                  - generic [ref=e1038]: SafeRemediate-PrismaWebhook
                  - generic "Current graph data" [ref=e1039]
                - generic [ref=e1041]: Lambda · eu-west-1 · regional
                - generic [ref=e1042]:
                  - generic [ref=e1043]: 2 in · 0 out
                  - generic [ref=e1044]:
                    - img [ref=e1045]
                    - text: No runtime timestamp
        - listitem [ref=e1048]:
          - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1049]:
            - generic [ref=e1050]:
              - img [ref=e1052]
              - generic [ref=e1054]:
                - generic [ref=e1055]:
                  - generic [ref=e1056]: fixture-aurora
                  - generic "Current graph data" [ref=e1057]
                - generic [ref=e1059]: RDS · eu-west-1 · VPC
                - generic [ref=e1060]:
                  - generic [ref=e1061]: 0 in · 1 out
                  - generic [ref=e1062]:
                    - img [ref=e1063]
                    - text: No runtime timestamp
        - listitem [ref=e1066]:
          - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1067]:
            - generic [ref=e1068]:
              - img [ref=e1070]
              - generic [ref=e1072]:
                - generic [ref=e1073]:
                  - generic [ref=e1074]: fixture-graph
                  - generic "Current graph data" [ref=e1075]
                - generic [ref=e1077]: Neptune · eu-west-1 · VPC
                - generic [ref=e1078]:
                  - generic [ref=e1079]: 0 in · 1 out
                  - generic [ref=e1080]:
                    - img [ref=e1081]
                    - text: No runtime timestamp
        - listitem [ref=e1084]:
          - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e1085]:
            - generic [ref=e1086]:
              - img [ref=e1088]
              - generic [ref=e1090]:
                - generic [ref=e1091]:
                  - generic [ref=e1092]: fixture-neptune-1
                  - generic "Current graph data" [ref=e1093]
                - generic [ref=e1095]: Neptune · eu-west-1a · data
                - generic [ref=e1096]:
                  - generic [ref=e1097]: 1 in · 0 out
                  - generic [ref=e1098]:
                    - img [ref=e1099]
                    - text: No runtime timestamp
        - listitem [ref=e1102]:
          - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1103]:
            - generic [ref=e1104]:
              - img [ref=e1106]
              - generic [ref=e1109]:
                - generic [ref=e1110]:
                  - generic [ref=e1111]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                  - generic "Current graph data" [ref=e1112]
                - generic [ref=e1114]: S3 · eu-west-1 · regional
                - generic [ref=e1115]:
                  - generic [ref=e1116]: 0 in · 0 out
                  - generic [ref=e1117]:
                    - img [ref=e1118]
                    - text: No runtime timestamp
        - listitem [ref=e1121]:
          - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1122]:
            - generic [ref=e1123]:
              - img [ref=e1125]
              - generic [ref=e1128]:
                - generic [ref=e1129]:
                  - generic [ref=e1130]: cyntro-demo-analytics-745783559495
                  - generic "Current graph data" [ref=e1131]
                - generic [ref=e1133]: S3 · eu-west-1 · regional
                - generic [ref=e1134]:
                  - generic [ref=e1135]: 0 in · 0 out
                  - generic [ref=e1136]:
                    - img [ref=e1137]
                    - text: No runtime timestamp
        - listitem [ref=e1140]:
          - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1141]:
            - generic [ref=e1142]:
              - img [ref=e1144]
              - generic [ref=e1147]:
                - generic [ref=e1148]:
                  - generic [ref=e1149]: cyntro-demo-eu
                  - generic "Current graph data" [ref=e1150]
                - generic [ref=e1152]: S3 · eu-west-1 · regional
                - generic [ref=e1153]:
                  - generic [ref=e1154]: 0 in · 0 out
                  - generic [ref=e1155]:
                    - img [ref=e1156]
                    - text: No runtime timestamp
        - listitem [ref=e1159]:
          - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1160]:
            - generic [ref=e1161]:
              - img [ref=e1163]
              - generic [ref=e1166]:
                - generic [ref=e1167]:
                  - generic [ref=e1168]: cyntro-demo-prod-data-745783559495
                  - generic "Current graph data" [ref=e1169]
                - generic [ref=e1171]: S3 · eu-west-1 · regional
                - generic [ref=e1172]:
                  - generic [ref=e1173]: 0 in · 0 out
                  - generic [ref=e1174]:
                    - img [ref=e1175]
                    - text: No runtime timestamp
        - listitem [ref=e1178]:
          - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1179]:
            - generic [ref=e1180]:
              - img [ref=e1182]
              - generic [ref=e1185]:
                - generic [ref=e1186]:
                  - generic [ref=e1187]: cyntronewtestbucket
                  - generic "Current graph data" [ref=e1188]
                - generic [ref=e1190]: S3 · eu-west-1 · regional
                - generic [ref=e1191]:
                  - generic [ref=e1192]: 0 in · 0 out
                  - generic [ref=e1193]:
                    - img [ref=e1194]
                    - text: No runtime timestamp
        - listitem [ref=e1197]:
          - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1198]:
            - generic [ref=e1199]:
              - img [ref=e1201]
              - generic [ref=e1204]:
                - generic [ref=e1205]:
                  - generic [ref=e1206]: cyntrotest2
                  - generic "Current graph data" [ref=e1207]
                - generic [ref=e1209]: S3 · eu-west-1 · regional
                - generic [ref=e1210]:
                  - generic [ref=e1211]: 0 in · 0 out
                  - generic [ref=e1212]:
                    - img [ref=e1213]
                    - text: No runtime timestamp
        - listitem [ref=e1216]:
          - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1217]:
            - generic [ref=e1218]:
              - img [ref=e1220]
              - generic [ref=e1223]:
                - generic [ref=e1224]:
                  - generic [ref=e1225]: impaciq-findings
                  - generic "Current graph data" [ref=e1226]
                - generic [ref=e1228]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1229]:
                  - generic [ref=e1230]: 0 in · 0 out
                  - generic [ref=e1231]:
                    - img [ref=e1232]
                    - text: No runtime timestamp
        - listitem [ref=e1235]:
          - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1236]:
            - generic [ref=e1237]:
              - img [ref=e1239]
              - generic [ref=e1242]:
                - generic [ref=e1243]:
                  - generic [ref=e1244]: impaciq-remediation-history
                  - generic "Current graph data" [ref=e1245]
                - generic [ref=e1247]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1248]:
                  - generic [ref=e1249]: 0 in · 0 out
                  - generic [ref=e1250]:
                    - img [ref=e1251]
                    - text: No runtime timestamp
        - listitem [ref=e1254]:
          - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1255]:
            - generic [ref=e1256]:
              - img [ref=e1258]
              - generic [ref=e1261]:
                - generic [ref=e1262]:
                  - generic [ref=e1263]: impaciq-scan-status
                  - generic "Current graph data" [ref=e1264]
                - generic [ref=e1266]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1267]:
                  - generic [ref=e1268]: 0 in · 0 out
                  - generic [ref=e1269]:
                    - img [ref=e1270]
                    - text: No runtime timestamp
        - listitem [ref=e1273]:
          - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1274]:
            - generic [ref=e1275]:
              - img [ref=e1277]
              - generic [ref=e1280]:
                - generic [ref=e1281]:
                  - generic [ref=e1282]: least_privilege_role_state
                  - generic "Current graph data" [ref=e1283]
                - generic [ref=e1285]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1286]:
                  - generic [ref=e1287]: 0 in · 0 out
                  - generic [ref=e1288]:
                    - img [ref=e1289]
                    - text: No runtime timestamp
        - listitem [ref=e1292]:
          - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1293]:
            - generic [ref=e1294]:
              - img [ref=e1296]
              - generic [ref=e1299]:
                - generic [ref=e1300]:
                  - generic [ref=e1301]: saferemediate-access-logs-745783559495
                  - generic "Current graph data" [ref=e1302]
                - generic [ref=e1304]: S3 · eu-west-1 · regional
                - generic [ref=e1305]:
                  - generic [ref=e1306]: 0 in · 0 out
                  - generic [ref=e1307]:
                    - img [ref=e1308]
                    - text: No runtime timestamp
        - listitem [ref=e1311]:
          - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1312]:
            - generic [ref=e1313]:
              - img [ref=e1315]
              - generic [ref=e1318]:
                - generic [ref=e1319]:
                  - generic [ref=e1320]: saferemediate-demo-cloudtrail-745783559495
                  - generic "Current graph data" [ref=e1321]
                - generic [ref=e1323]: S3 · eu-west-1 · regional
                - generic [ref=e1324]:
                  - generic [ref=e1325]: 0 in · 0 out
                  - generic [ref=e1326]:
                    - img [ref=e1327]
                    - text: No runtime timestamp
        - listitem [ref=e1330]:
          - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1331]:
            - generic [ref=e1332]:
              - img [ref=e1334]
              - generic [ref=e1337]:
                - generic [ref=e1338]:
                  - generic [ref=e1339]: SafeRemediate-Executions
                  - generic "Current graph data" [ref=e1340]
                - generic [ref=e1342]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1343]:
                  - generic [ref=e1344]: 0 in · 0 out
                  - generic [ref=e1345]:
                    - img [ref=e1346]
                    - text: No runtime timestamp
        - listitem [ref=e1349]:
          - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1350]:
            - generic [ref=e1351]:
              - img [ref=e1353]
              - generic [ref=e1356]:
                - generic [ref=e1357]:
                  - generic [ref=e1358]: SafeRemediate-Findings
                  - generic "Current graph data" [ref=e1359]
                - generic [ref=e1361]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1362]:
                  - generic [ref=e1363]: 0 in · 0 out
                  - generic [ref=e1364]:
                    - img [ref=e1365]
                    - text: No runtime timestamp
        - listitem [ref=e1368]:
          - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1369]:
            - generic [ref=e1370]:
              - img [ref=e1372]
              - generic [ref=e1375]:
                - generic [ref=e1376]:
                  - generic [ref=e1377]: saferemediate-logs-745783559495
                  - generic "Current graph data" [ref=e1378]
                - generic [ref=e1380]: S3 · eu-west-1 · regional
                - generic [ref=e1381]:
                  - generic [ref=e1382]: 0 in · 0 out
                  - generic [ref=e1383]:
                    - img [ref=e1384]
                    - text: No runtime timestamp
        - listitem [ref=e1387]:
          - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1388]:
            - generic [ref=e1389]:
              - img [ref=e1391]
              - generic [ref=e1394]:
                - generic [ref=e1395]:
                  - generic [ref=e1396]: SafeRemediate-Simulations
                  - generic "Current graph data" [ref=e1397]
                - generic [ref=e1399]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1400]:
                  - generic [ref=e1401]: 0 in · 0 out
                  - generic [ref=e1402]:
                    - img [ref=e1403]
                    - text: No runtime timestamp
        - listitem [ref=e1406]:
          - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1407]:
            - generic [ref=e1408]:
              - img [ref=e1410]
              - generic [ref=e1413]:
                - generic [ref=e1414]:
                  - generic [ref=e1415]: sg_state
                  - generic "Current graph data" [ref=e1416]
                - generic [ref=e1418]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1419]:
                  - generic [ref=e1420]: 0 in · 0 out
                  - generic [ref=e1421]:
                    - img [ref=e1422]
                    - text: No runtime timestamp
    - contentinfo [ref=e1425]:
      - text: Live read from
      - generic [ref=e1426]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1427]
  - dialog [active] [ref=e1429]:
    - paragraph [ref=e1430]: 9 workloads leaving the VPC
    - paragraph [ref=e1431]: "Route is configured (route tables): NAT nat-fixture0a1b2c3d4 → IGW igw-03bb3f19b706abbc4. Counts are observed. The payload names no destination identities, so these addresses are evidence, not an inventory of services."
    - list [ref=e1432]:
      - listitem [ref=e1433]:
        - text: i-0e9b891793b5b2dbd · 3 distinct · all 3 shown
        - generic [ref=e1434]: — 54.217.69.183, 54.217.245.46, 3.253.225.145
      - listitem [ref=e1435]:
        - text: i-0f51b8b7ad29a359b · 532 distinct · 5 of 532 shown
        - generic [ref=e1436]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1437]:
        - text: i-03c72e120ff96216c · 588 distinct · 5 of 588 shown
        - generic [ref=e1438]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1439]:
        - text: i-0aa725bf8ff4c2001 · 927 distinct · 5 of 927 shown
        - generic [ref=e1440]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1441]:
        - text: i-0d4186a6b477dcd55 · 20 distinct · 5 of 20 shown
        - generic [ref=e1442]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1443]:
        - text: i-009a28b5cab755850 · 20 distinct · 5 of 20 shown
        - generic [ref=e1444]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1445]:
        - text: i-0e4edb2adb28e4f16 · 23 distinct · 5 of 23 shown
        - generic [ref=e1446]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1447]:
        - text: i-02a0da7f8373e6c8f · 32 distinct · 5 of 32 shown
        - generic [ref=e1448]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1449]:
        - text: i-0ee29afa0048943e0 · 434 distinct · 5 of 434 shown
        - generic [ref=e1450]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
```

# Test source

```ts
  165 |     const usersBox = (await page.getByTestId("topology-users-node").first().boundingBox())!
  166 |     expect(usersBox.x, `Users block clipped at the strip's left edge at ${vp.name}`).toBeGreaterThanOrEqual(
  167 |       stripBox.x - 1,
  168 |     )
  169 |     expect(usersBox.x, `Users block off the left of the viewport at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  170 | 
  171 |     await page.screenshot({
  172 |       path: `test-results/estate-lower-default-${vp.name}.png`,
  173 |       fullPage: false,
  174 |     })
  175 | 
  176 |     // --- nothing paints outside the overlay --------------------------------
  177 |     const contained = await badgesOutsideOverlay(page)
  178 |     expect(contained.overlay, "the flow overlay is drawn").not.toBeNull()
  179 |     expect(contained.total, "the fixture draws flow badges to contain").toBeGreaterThan(0)
  180 |     expect(
  181 |       contained.escaped,
  182 |       `flow badges outside the overlay at ${vp.name}: ${JSON.stringify(contained.escaped)}`,
  183 |     ).toEqual([])
  184 |     expect(
  185 |       contained.overChrome,
  186 |       `flow badges painted over the map's own chrome at ${vp.name}: ${JSON.stringify(contained.overChrome)}`,
  187 |     ).toEqual([])
  188 | 
  189 |     // --- the assertion the first defect was about --------------------------
  190 |     const dataCells = page.locator('[data-tier="data"]')
  191 |     const cellCount = await dataCells.count()
  192 |     expect(cellCount, "the fixture draws a data tier to overlap with").toBeGreaterThan(0)
  193 |     for (let i = 0; i < cellCount; i++) {
  194 |       for (const [name, block] of [
  195 |         ["logical-group band", band],
  196 |         ["external-destinations node", external],
  197 |       ] as const) {
  198 |         const area = await overlapArea(block, dataCells.nth(i))
  199 |         expect(area, `${name} overlaps data-tier cell ${i} by ${area}px^2 at ${vp.name}`).toBe(0)
  200 |       }
  201 |     }
  202 | 
  203 |     // --- on demand, the content is still reachable AND contained -----------
  204 |     await band.getByTestId("topology-logical-group-band-toggle").click()
  205 |     await expect(band).toHaveAttribute("data-groups-open", "true")
  206 |     await expect(band.getByTestId("topology-logical-group")).toHaveCount(groups.groups.length)
  207 |     await expect(band.getByTestId("topology-logical-group-member").first()).toBeVisible()
  208 | 
  209 |     await external.getByTestId("topology-external-destinations-toggle").click()
  210 |     await expect(external).toHaveAttribute("data-open", "true")
  211 |     const panel = page.getByTestId("topology-external-destinations-details")
  212 |     await expect(panel).toBeVisible()
  213 |     await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)
  214 | 
  215 |     // Opening it may not change the strip's width by a single pixel: the panel
  216 |     // is portaled, not a sibling column.
  217 |     const stripAfter = (await strip.boundingBox())!
  218 |     expect(
  219 |       Math.abs(stripAfter.width - stripBox.width),
  220 |       `opening the panel widened the top strip at ${vp.name}`,
  221 |     ).toBeLessThanOrEqual(1)
  222 | 
  223 |     // Inside the viewport, and big enough to read.
  224 |     const panelBox = (await panel.boundingBox())!
  225 |     expect(panelBox.x, `panel off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  226 |     expect(panelBox.y, `panel off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  227 |     expect(panelBox.x + panelBox.width, `panel off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
  228 |     expect(panelBox.y + panelBox.height, `panel off the bottom at ${vp.name}`).toBeLessThanOrEqual(
  229 |       vp.height + 1,
  230 |     )
  231 |     expect(panelBox.width, `panel too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(260)
  232 | 
  233 |     const readable = await page.evaluate(() => {
  234 |       const p = document.querySelector('[data-testid="topology-external-destinations-details"]')
  235 |       if (!p) return null
  236 |       const legs = Array.from(p.querySelectorAll<HTMLElement>('[data-testid="topology-external-destination-leg"]'))
  237 |       const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
  238 |       const cs = getComputedStyle(p)
  239 |       const bg = cs.backgroundColor
  240 |       // rgb(...) is opaque; rgba(...) carries the alpha as the 4th component.
  241 |       const alpha = /rgba?\(([^)]+)\)/.exec(bg)?.[1].split(",").map(v => v.trim())[3]
  242 |       return {
  243 |         captionPx: px(p.querySelector("p")!),
  244 |         minLegPx: Math.min(...legs.map(px)),
  245 |         // A wrapped line is fine; a line wider than its own box is clipped text.
  246 |         clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
  247 |         background: bg,
  248 |         backgroundAlpha: alpha === undefined ? 1 : Number(alpha),
  249 |         // An opaque background is not enough: a running entrance keyframe
  250 |         // fades the whole element and its text paints through to the map.
  251 |         opacity: Number(cs.opacity),
  252 |         animationName: cs.animationName,
  253 |       }
  254 |     })
  255 |     expect(readable, "the panel is measurable").not.toBeNull()
  256 |     expect(readable!.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  257 |     expect(readable!.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  258 |     expect(readable!.clipped, `clipped leg lines at ${vp.name}`).toBe(0)
  259 |     // A panel with a transparent ground paints its text onto the map and is
  260 |     // unreadable however large the type is.
  261 |     expect(
  262 |       readable!.backgroundAlpha,
  263 |       `panel ground is not opaque at ${vp.name} (${readable!.background})`,
  264 |     ).toBe(1)
> 265 |     expect(readable!.opacity, `panel is translucent at ${vp.name}`).toBe(1)
      |                                                                     ^ Error: panel is translucent at 1024x720
  266 |     expect(
  267 |       readable!.animationName,
  268 |       `an entrance keyframe is still fading the panel at ${vp.name}`,
  269 |     ).toBe("none")
  270 | 
  271 |     // Close by the control, not by Escape: the estate view installs its own
  272 |     // Escape handler for the topmost surface and this spec is not here to
  273 |     // arbitrate between the two.
  274 |     await external.getByTestId("topology-external-destinations-toggle").click()
  275 |     await expect(external).toHaveAttribute("data-open", "false")
  276 | 
  277 |     await s3.getByTestId("topology-lambda-s3-coverage-toggle").click()
  278 |     await expect(s3).toHaveAttribute("data-open", "true")
  279 |     await expect(s3.getByTestId("topology-lambda-s3-coverage-function")).toHaveCount(
  280 |       triggers.s3Functions.length,
  281 |     )
  282 | 
  283 |     if (await coverage.count()) {
  284 |       await page.getByTestId("topology-lane-coverage-details-toggle").click()
  285 |       await expect(coverage).toHaveAttribute("data-details-open", "true")
  286 |       await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeVisible()
  287 |     }
  288 | 
  289 |     // Opening a disclosure scrolls it into view, and the map is a horizontally
  290 |     // scrollable region, so the expanded frame would otherwise be taken from
  291 |     // wherever the last click left it. Reset the HORIZONTAL scroll only and
  292 |     // bring the map back into frame: scrolling the window to 0 as well pushed
  293 |     // the map itself below the fold at 1024x720 and the frame showed nothing
  294 |     // it was taken for (run 34850735271).
  295 |     await page.evaluate(() => {
  296 |       for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-region]"))) {
  297 |         el.scrollLeft = 0
  298 |       }
  299 |       document
  300 |         .querySelector('[data-testid="topology-estate-view-map"]')
  301 |         ?.scrollIntoView({ block: "start" })
  302 |     })
  303 |     // The panel is reopened for the frame, so the expanded screenshot shows
  304 |     // the state the assertions above measured.
  305 |     await external.getByTestId("topology-external-destinations-toggle").click()
  306 |     await expect(panel).toBeVisible()
  307 |     await page.screenshot({
  308 |       path: `test-results/estate-lower-geometry-${vp.name}.png`,
  309 |       fullPage: false,
  310 |     })
  311 |   })
  312 | }
  313 | 
```