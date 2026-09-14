# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-lower-geometry-fixture.spec.ts >> lower estate sections stay clear of the data tier at 1366x768
- Location: tests/integration/topology-estate-lower-geometry-fixture.spec.ts:115:7

# Error details

```
Error: flow badges painted over the map's own chrome at 1366x768: [{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"MEMBER_OF_CLUSTERMEMBER_OF_CLUSTER","over":"platform-map summary","area":986}]

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 47

- Array []
+ Array [
+   Object {
+     "area": 378,
+     "over": "platform-map summary",
+     "text": "TARGETSTARGETS",
+   },
+   Object {
+     "area": 378,
+     "over": "platform-map summary",
+     "text": "TARGETSTARGETS",
+   },
+   Object {
+     "area": 378,
+     "over": "platform-map summary",
+     "text": "TARGETSTARGETS",
+   },
+   Object {
+     "area": 378,
+     "over": "platform-map summary",
+     "text": "TARGETSTARGETS",
+   },
+   Object {
+     "area": 438,
+     "over": "platform-map summary",
+     "text": "LAUNCHESLAUNCHES",
+   },
+   Object {
+     "area": 438,
+     "over": "platform-map summary",
+     "text": "LAUNCHESLAUNCHES",
+   },
+   Object {
+     "area": 438,
+     "over": "platform-map summary",
+     "text": "LAUNCHESLAUNCHES",
+   },
+   Object {
+     "area": 438,
+     "over": "platform-map summary",
+     "text": "LAUNCHESLAUNCHES",
+   },
+   Object {
+     "area": 986,
+     "over": "platform-map summary",
+     "text": "MEMBER_OF_CLUSTERMEMBER_OF_CLUSTER",
+   },
+ ]
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
            - tab "Network topology" [active] [selected] [ref=e78]
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
              - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [ref=e205]:
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
              - button "Logical groups · members carry the placement (6) Show members" [ref=e452]:
                - generic [ref=e453]: Logical groups · members carry the placement (6)
                - generic [ref=e454]: Show members
          - generic [ref=e455]:
            - button "Diagnostics 6 serverless · 51 flows ▴" [ref=e456]:
              - generic [ref=e457]: Diagnostics
              - generic [ref=e458]: 6 serverless · 51 flows ▴
            - generic [ref=e459]:
              - generic [ref=e460]:
                - generic [ref=e461]: Serverless compute (6)
                - generic [ref=e462]:
                  - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e463]:
                    - generic [ref=e465]:
                      - generic [ref=e467]: AlonIAMTest-traffic-generator
                      - generic [ref=e468]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e469]: "24"
                  - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e470]:
                    - generic [ref=e472]:
                      - generic [ref=e474]: PaymentTrafficGenerator
                      - generic [ref=e475]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e476]: "18"
                  - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e477]:
                    - generic [ref=e479]:
                      - generic [ref=e481]: SafeRemediate-BehaviorAnalyzer
                      - generic [ref=e482]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e483]: "18"
                  - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e484]:
                    - generic [ref=e486]:
                      - generic [ref=e488]: SafeRemediate-ConfidenceScorer
                      - generic [ref=e489]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e490]: "18"
                  - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e491]:
                    - generic [ref=e493]:
                      - generic [ref=e495]: SafeRemediate-CreateCheckpoint
                      - generic [ref=e496]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e497]: "18"
                  - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e498]:
                    - generic [ref=e500]:
                      - generic [ref=e502]: SafeRemediate-PrismaWebhook
                      - generic [ref=e503]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e504]: "18"
              - generic [ref=e505]:
                - generic [ref=e506]:
                  - generic [ref=e507]: Observed traffic — animated arrows above
                  - generic [ref=e508]: 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
                - generic [ref=e509]: Listing 36 of 51 — the current lens and selection hide the rest. The counts above are the full evidence.
                - generic [ref=e510]:
                  - generic [ref=e511]:
                    - generic [ref=e512]: SafeRemediate-Test-App-2
                    - generic [ref=e513]: →
                    - generic [ref=e514]: vpce-0f983779fff3bbae7
                    - generic [ref=e515]: VPCE
                  - generic [ref=e516]:
                    - generic [ref=e517]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e518]: →
                    - generic [ref=e519]: vpce-0f983779fff3bbae7
                    - generic [ref=e520]: VPCE
                  - generic [ref=e521]:
                    - generic [ref=e522]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e523]: →
                    - generic [ref=e524]: vpce-04ffe43eea196bf89
                    - generic [ref=e525]: VPCE
                  - generic [ref=e526]:
                    - generic [ref=e527]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e528]: →
                    - generic [ref=e529]: vpce-0f983779fff3bbae7
                    - generic [ref=e530]: VPCE
                  - generic [ref=e531]:
                    - generic [ref=e532]: SafeRemediate-Test-App-2
                    - generic [ref=e533]: →
                    - generic [ref=e534]: Internet (via IGW)
                    - generic [ref=e535]: egress · 3 (ext 3)
                  - generic [ref=e536]:
                    - generic [ref=e537]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e538]: →
                    - generic [ref=e539]: Internet (via IGW)
                    - generic [ref=e540]: egress · 532 (ext 532)
                  - generic [ref=e541]:
                    - generic [ref=e542]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e543]: →
                    - generic [ref=e544]: Internet (via IGW)
                    - generic [ref=e545]: egress · 588 (ext 588)
                  - generic [ref=e546]:
                    - generic [ref=e547]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e548]: →
                    - generic [ref=e549]: saferemediate-test-db
                    - generic [ref=e550]: RDS · 5432
                  - generic [ref=e551]:
                    - generic [ref=e552]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e553]: →
                    - generic [ref=e554]: saferemediate-test-db
                    - generic [ref=e555]: RDS · 3306
                  - generic [ref=e556]:
                    - generic [ref=e557]: SafeRemediate-Test-App-2
                    - generic [ref=e558]: →
                    - generic [ref=e559]: saferemediate-test-db
                    - generic [ref=e560]: RDS
                  - generic [ref=e561]:
                    - generic [ref=e562]: fixture-tg-web
                    - generic [ref=e563]: →
                    - generic [ref=e564]: SafeRemediate-Test-App-2
                    - generic [ref=e565]: TARGETS
                  - generic [ref=e566]:
                    - generic [ref=e567]: fixture-tg-web
                    - generic [ref=e568]: →
                    - generic [ref=e569]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e570]: TARGETS
                  - generic [ref=e571]: + 24 more flows
              - generic [ref=e572]:
                - generic [ref=e573]: Encoding
                - generic [ref=e574]:
                  - generic [ref=e577]: Worst (carmine halo + pulse)
                  - generic [ref=e580]: High / elevated (ring only)
                  - generic [ref=e581]:
                    - generic [ref=e582]: ♛
                    - generic [ref=e583]: Crown-jewel halo
                  - generic [ref=e586]: Clean · remediated (teal ring)
                  - generic [ref=e589]: Stale (dimmed)
                  - generic [ref=e592]: Coverage gap (not collected)
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
      - complementary [ref=e593]:
        - complementary [ref=e594]:
          - generic [ref=e595]:
            - generic [ref=e596]:
              - heading "Service index" [level=2] [ref=e597]
              - generic [ref=e598]: "41"
            - generic [ref=e599]:
              - img [ref=e600]
              - searchbox "Find service in topology" [ref=e603]
            - button "Filters" [ref=e606]:
              - img [ref=e607]
              - text: Filters
          - list [ref=e609]:
            - listitem [ref=e610]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e611]:
                - generic [ref=e612]:
                  - img [ref=e614]
                  - generic [ref=e616]:
                    - generic [ref=e617]:
                      - generic [ref=e618]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e619]
                    - generic [ref=e621]: EC2 · eu-west-1a · web
                    - generic [ref=e622]:
                      - generic [ref=e623]: 3 in · 4 out
                      - generic [ref=e624]:
                        - img [ref=e625]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e628]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e629]:
                - generic [ref=e630]:
                  - img [ref=e632]
                  - generic [ref=e634]:
                    - generic [ref=e635]:
                      - generic [ref=e636]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e637]
                    - generic [ref=e639]: EC2 · eu-west-1b · app
                    - generic [ref=e640]:
                      - generic [ref=e641]: 3 in · 3 out
                      - generic [ref=e642]:
                        - img [ref=e643]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e646]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e647]:
                - generic [ref=e648]:
                  - img [ref=e650]
                  - generic [ref=e652]:
                    - generic [ref=e653]:
                      - generic [ref=e654]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e655]
                    - generic [ref=e657]: EC2 · eu-west-1b · web
                    - generic [ref=e658]:
                      - generic [ref=e659]: 2 in · 3 out
                      - generic [ref=e660]:
                        - img [ref=e661]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e664]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e665]:
                - generic [ref=e666]:
                  - img [ref=e668]
                  - generic [ref=e670]:
                    - generic [ref=e671]:
                      - generic [ref=e672]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e673]
                    - generic [ref=e675]: S3 · eu-west-1 · regional
                    - generic [ref=e676]:
                      - generic [ref=e677]: 4 in · 0 out
                      - generic [ref=e678]:
                        - img [ref=e679]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e682]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e683]:
                - generic [ref=e684]:
                  - img [ref=e686]
                  - generic [ref=e688]:
                    - generic [ref=e689]:
                      - generic [ref=e690]: saferemediate-test-db
                      - generic "Current graph data" [ref=e691]
                    - generic [ref=e693]: RDS · eu-west-1a · data
                    - generic [ref=e694]:
                      - generic [ref=e695]: 4 in · 0 out
                      - generic [ref=e696]:
                        - img [ref=e697]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e700]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e701]:
                - generic [ref=e702]:
                  - img [ref=e704]
                  - generic [ref=e706]:
                    - generic [ref=e707]:
                      - generic [ref=e708]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e709]
                    - generic [ref=e711]: Lambda · eu-west-1 · regional
                    - generic [ref=e712]:
                      - generic [ref=e713]: 2 in · 1 out
                      - generic [ref=e714]:
                        - img [ref=e715]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e718]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e719]:
                - generic [ref=e720]:
                  - img [ref=e722]
                  - generic [ref=e724]:
                    - generic [ref=e725]:
                      - generic [ref=e726]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e727]
                    - generic [ref=e729]: Lambda · eu-west-1 · regional
                    - generic [ref=e730]:
                      - generic [ref=e731]: 2 in · 1 out
                      - generic [ref=e732]:
                        - img [ref=e733]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e736]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e737]:
                - generic [ref=e738]:
                  - img [ref=e740]
                  - generic [ref=e742]:
                    - generic [ref=e743]:
                      - generic [ref=e744]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e745]
                    - generic [ref=e747]: Lambda · eu-west-1 · regional
                    - generic [ref=e748]:
                      - generic [ref=e749]: 2 in · 1 out
                      - generic [ref=e750]:
                        - img [ref=e751]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e754]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e755]:
                - generic [ref=e756]:
                  - img [ref=e758]
                  - generic [ref=e760]:
                    - generic [ref=e761]:
                      - generic [ref=e762]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e763]
                    - generic [ref=e765]: Lambda · eu-west-1 · regional
                    - generic [ref=e766]:
                      - generic [ref=e767]: 2 in · 1 out
                      - generic [ref=e768]:
                        - img [ref=e769]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e772]:
              - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e773]:
                - generic [ref=e774]:
                  - img [ref=e776]
                  - generic [ref=e778]:
                    - generic [ref=e779]:
                      - generic [ref=e780]: fixture-asg-app
                      - generic "Current graph data" [ref=e781]
                    - generic [ref=e783]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e784]:
                      - generic [ref=e785]: 0 in · 2 out
                      - generic [ref=e786]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e789]:
              - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e790]:
                - generic [ref=e791]:
                  - img [ref=e793]
                  - generic [ref=e795]:
                    - generic [ref=e796]:
                      - generic [ref=e797]: fixture-asg-web
                      - generic "Current graph data" [ref=e798]
                    - generic [ref=e800]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e801]:
                      - generic [ref=e802]: 0 in · 2 out
                      - generic [ref=e803]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e806]:
              - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e807]:
                - generic [ref=e808]:
                  - img [ref=e810]
                  - generic [ref=e812]:
                    - generic [ref=e813]:
                      - generic [ref=e814]: fixture-daily
                      - generic "Current graph data" [ref=e815]
                    - generic [ref=e817]: EventBridge · eu-west-1 · regional
                    - generic [ref=e818]:
                      - generic [ref=e819]: 0 in · 2 out
                      - generic [ref=e820]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e823]:
              - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e824]:
                - generic [ref=e825]:
                  - img [ref=e827]
                  - generic [ref=e829]:
                    - generic [ref=e830]:
                      - generic [ref=e831]: fixture-every_6h
                      - generic "Current graph data" [ref=e832]
                    - generic [ref=e834]: EventBridge · eu-west-1 · regional
                    - generic [ref=e835]:
                      - generic [ref=e836]: 0 in · 2 out
                      - generic [ref=e837]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e840]:
              - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e841]:
                - generic [ref=e842]:
                  - img [ref=e844]
                  - generic [ref=e846]:
                    - generic [ref=e847]:
                      - generic [ref=e848]: fixture-frequent
                      - generic "Current graph data" [ref=e849]
                    - generic [ref=e851]: EventBridge · eu-west-1 · regional
                    - generic [ref=e852]:
                      - generic [ref=e853]: 0 in · 2 out
                      - generic [ref=e854]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e857]:
              - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e858]:
                - generic [ref=e859]:
                  - img [ref=e861]
                  - generic [ref=e863]:
                    - generic [ref=e864]:
                      - generic [ref=e865]: fixture-monthly
                      - generic "Current graph data" [ref=e866]
                    - generic [ref=e868]: EventBridge · eu-west-1 · regional
                    - generic [ref=e869]:
                      - generic [ref=e870]: 0 in · 2 out
                      - generic [ref=e871]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e874]:
              - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e875]:
                - generic [ref=e876]:
                  - img [ref=e878]
                  - generic [ref=e880]:
                    - generic [ref=e881]:
                      - generic [ref=e882]: fixture-nightly_burst
                      - generic "Current graph data" [ref=e883]
                    - generic [ref=e885]: EventBridge · eu-west-1 · regional
                    - generic [ref=e886]:
                      - generic [ref=e887]: 0 in · 2 out
                      - generic [ref=e888]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e891]:
              - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e892]:
                - generic [ref=e893]:
                  - img [ref=e895]
                  - generic [ref=e897]:
                    - generic [ref=e898]:
                      - generic [ref=e899]: fixture-tg-app
                      - generic "Current graph data" [ref=e900]
                    - generic [ref=e902]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e903]:
                      - generic [ref=e904]: 0 in · 2 out
                      - generic [ref=e905]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e908]:
              - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e909]:
                - generic [ref=e910]:
                  - img [ref=e912]
                  - generic [ref=e914]:
                    - generic [ref=e915]:
                      - generic [ref=e916]: fixture-tg-web
                      - generic "Current graph data" [ref=e917]
                    - generic [ref=e919]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e920]:
                      - generic [ref=e921]: 0 in · 2 out
                      - generic [ref=e922]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e925]:
              - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e926]:
                - generic [ref=e927]:
                  - img [ref=e929]
                  - generic [ref=e931]:
                    - generic [ref=e932]:
                      - generic [ref=e933]: fixture-weekly
                      - generic "Current graph data" [ref=e934]
                    - generic [ref=e936]: EventBridge · eu-west-1 · regional
                    - generic [ref=e937]:
                      - generic [ref=e938]: 0 in · 2 out
                      - generic [ref=e939]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e942]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e943]:
                - generic [ref=e944]:
                  - img [ref=e946]
                  - generic [ref=e948]:
                    - generic [ref=e949]:
                      - generic [ref=e950]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e951]
                    - generic [ref=e953]: Lambda · eu-west-1 · regional
                    - generic [ref=e954]:
                      - generic [ref=e955]: 2 in · 0 out
                      - generic [ref=e956]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e959]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e960]:
                - generic [ref=e961]:
                  - img [ref=e963]
                  - generic [ref=e965]:
                    - generic [ref=e966]:
                      - generic [ref=e967]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e968]
                    - generic [ref=e970]: Lambda · eu-west-1 · regional
                    - generic [ref=e971]:
                      - generic [ref=e972]: 2 in · 0 out
                      - generic [ref=e973]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e976]:
              - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e977]:
                - generic [ref=e978]:
                  - img [ref=e980]
                  - generic [ref=e982]:
                    - generic [ref=e983]:
                      - generic [ref=e984]: fixture-aurora
                      - generic "Current graph data" [ref=e985]
                    - generic [ref=e987]: RDS · eu-west-1 · VPC
                    - generic [ref=e988]:
                      - generic [ref=e989]: 0 in · 1 out
                      - generic [ref=e990]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e993]:
              - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e994]:
                - generic [ref=e995]:
                  - img [ref=e997]
                  - generic [ref=e999]:
                    - generic [ref=e1000]:
                      - generic [ref=e1001]: fixture-graph
                      - generic "Current graph data" [ref=e1002]
                    - generic [ref=e1004]: Neptune · eu-west-1 · VPC
                    - generic [ref=e1005]:
                      - generic [ref=e1006]: 0 in · 1 out
                      - generic [ref=e1007]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1010]:
              - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e1011]:
                - generic [ref=e1012]:
                  - img [ref=e1014]
                  - generic [ref=e1016]:
                    - generic [ref=e1017]:
                      - generic [ref=e1018]: fixture-neptune-1
                      - generic "Current graph data" [ref=e1019]
                    - generic [ref=e1021]: Neptune · eu-west-1a · data
                    - generic [ref=e1022]:
                      - generic [ref=e1023]: 1 in · 0 out
                      - generic [ref=e1024]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1027]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1028]:
                - generic [ref=e1029]:
                  - img [ref=e1031]
                  - generic [ref=e1034]:
                    - generic [ref=e1035]:
                      - generic [ref=e1036]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e1037]
                    - generic [ref=e1039]: S3 · eu-west-1 · regional
                    - generic [ref=e1040]:
                      - generic [ref=e1041]: 0 in · 0 out
                      - generic [ref=e1042]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1045]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1046]:
                - generic [ref=e1047]:
                  - img [ref=e1049]
                  - generic [ref=e1052]:
                    - generic [ref=e1053]:
                      - generic [ref=e1054]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e1055]
                    - generic [ref=e1057]: S3 · eu-west-1 · regional
                    - generic [ref=e1058]:
                      - generic [ref=e1059]: 0 in · 0 out
                      - generic [ref=e1060]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1063]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1064]:
                - generic [ref=e1065]:
                  - img [ref=e1067]
                  - generic [ref=e1070]:
                    - generic [ref=e1071]:
                      - generic [ref=e1072]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e1073]
                    - generic [ref=e1075]: S3 · eu-west-1 · regional
                    - generic [ref=e1076]:
                      - generic [ref=e1077]: 0 in · 0 out
                      - generic [ref=e1078]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1081]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1082]:
                - generic [ref=e1083]:
                  - img [ref=e1085]
                  - generic [ref=e1088]:
                    - generic [ref=e1089]:
                      - generic [ref=e1090]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e1091]
                    - generic [ref=e1093]: S3 · eu-west-1 · regional
                    - generic [ref=e1094]:
                      - generic [ref=e1095]: 0 in · 0 out
                      - generic [ref=e1096]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1099]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1100]:
                - generic [ref=e1101]:
                  - img [ref=e1103]
                  - generic [ref=e1106]:
                    - generic [ref=e1107]:
                      - generic [ref=e1108]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e1109]
                    - generic [ref=e1111]: S3 · eu-west-1 · regional
                    - generic [ref=e1112]:
                      - generic [ref=e1113]: 0 in · 0 out
                      - generic [ref=e1114]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1117]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1118]:
                - generic [ref=e1119]:
                  - img [ref=e1121]
                  - generic [ref=e1124]:
                    - generic [ref=e1125]:
                      - generic [ref=e1126]: cyntrotest2
                      - generic "Current graph data" [ref=e1127]
                    - generic [ref=e1129]: S3 · eu-west-1 · regional
                    - generic [ref=e1130]:
                      - generic [ref=e1131]: 0 in · 0 out
                      - generic [ref=e1132]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1135]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1136]:
                - generic [ref=e1137]:
                  - img [ref=e1139]
                  - generic [ref=e1142]:
                    - generic [ref=e1143]:
                      - generic [ref=e1144]: impaciq-findings
                      - generic "Current graph data" [ref=e1145]
                    - generic [ref=e1147]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1148]:
                      - generic [ref=e1149]: 0 in · 0 out
                      - generic [ref=e1150]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1153]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1154]:
                - generic [ref=e1155]:
                  - img [ref=e1157]
                  - generic [ref=e1160]:
                    - generic [ref=e1161]:
                      - generic [ref=e1162]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e1163]
                    - generic [ref=e1165]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1166]:
                      - generic [ref=e1167]: 0 in · 0 out
                      - generic [ref=e1168]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1171]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1172]:
                - generic [ref=e1173]:
                  - img [ref=e1175]
                  - generic [ref=e1178]:
                    - generic [ref=e1179]:
                      - generic [ref=e1180]: impaciq-scan-status
                      - generic "Current graph data" [ref=e1181]
                    - generic [ref=e1183]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1184]:
                      - generic [ref=e1185]: 0 in · 0 out
                      - generic [ref=e1186]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1189]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1190]:
                - generic [ref=e1191]:
                  - img [ref=e1193]
                  - generic [ref=e1196]:
                    - generic [ref=e1197]:
                      - generic [ref=e1198]: least_privilege_role_state
                      - generic "Current graph data" [ref=e1199]
                    - generic [ref=e1201]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1202]:
                      - generic [ref=e1203]: 0 in · 0 out
                      - generic [ref=e1204]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1207]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1208]:
                - generic [ref=e1209]:
                  - img [ref=e1211]
                  - generic [ref=e1214]:
                    - generic [ref=e1215]:
                      - generic [ref=e1216]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e1217]
                    - generic [ref=e1219]: S3 · eu-west-1 · regional
                    - generic [ref=e1220]:
                      - generic [ref=e1221]: 0 in · 0 out
                      - generic [ref=e1222]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1225]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1226]:
                - generic [ref=e1227]:
                  - img [ref=e1229]
                  - generic [ref=e1232]:
                    - generic [ref=e1233]:
                      - generic [ref=e1234]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e1235]
                    - generic [ref=e1237]: S3 · eu-west-1 · regional
                    - generic [ref=e1238]:
                      - generic [ref=e1239]: 0 in · 0 out
                      - generic [ref=e1240]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1243]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1244]:
                - generic [ref=e1245]:
                  - img [ref=e1247]
                  - generic [ref=e1250]:
                    - generic [ref=e1251]:
                      - generic [ref=e1252]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e1253]
                    - generic [ref=e1255]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1256]:
                      - generic [ref=e1257]: 0 in · 0 out
                      - generic [ref=e1258]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1261]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1262]:
                - generic [ref=e1263]:
                  - img [ref=e1265]
                  - generic [ref=e1268]:
                    - generic [ref=e1269]:
                      - generic [ref=e1270]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e1271]
                    - generic [ref=e1273]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1274]:
                      - generic [ref=e1275]: 0 in · 0 out
                      - generic [ref=e1276]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1279]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1280]:
                - generic [ref=e1281]:
                  - img [ref=e1283]
                  - generic [ref=e1286]:
                    - generic [ref=e1287]:
                      - generic [ref=e1288]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e1289]
                    - generic [ref=e1291]: S3 · eu-west-1 · regional
                    - generic [ref=e1292]:
                      - generic [ref=e1293]: 0 in · 0 out
                      - generic [ref=e1294]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1297]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1298]:
                - generic [ref=e1299]:
                  - img [ref=e1301]
                  - generic [ref=e1304]:
                    - generic [ref=e1305]:
                      - generic [ref=e1306]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e1307]
                    - generic [ref=e1309]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1310]:
                      - generic [ref=e1311]: 0 in · 0 out
                      - generic [ref=e1312]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1315]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1316]:
                - generic [ref=e1317]:
                  - img [ref=e1319]
                  - generic [ref=e1322]:
                    - generic [ref=e1323]:
                      - generic [ref=e1324]: sg_state
                      - generic "Current graph data" [ref=e1325]
                    - generic [ref=e1327]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1328]:
                      - generic [ref=e1329]: 0 in · 0 out
                      - generic [ref=e1330]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1333]:
      - text: Live read from
      - generic [ref=e1334]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1335]
```

# Test source

```ts
  87  |       if (el) chrome.push({ name, r: el.getBoundingClientRect() })
  88  |     }
  89  |     const overChrome: Array<Record<string, unknown>> = []
  90  |     for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
  91  |       const r = g.getBoundingClientRect()
  92  |       if (r.width === 0 && r.height === 0) continue
  93  |       for (const c of chrome) {
  94  |         const w = Math.min(r.right, c.r.right) - Math.max(r.left, c.r.left)
  95  |         const h = Math.min(r.bottom, c.r.bottom) - Math.max(r.top, c.r.top)
  96  |         if (w > 1 && h > 1) {
  97  |           overChrome.push({
  98  |             text: (g.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
  99  |             over: c.name,
  100 |             area: Math.round(w * h),
  101 |           })
  102 |         }
  103 |       }
  104 |     }
  105 |     return {
  106 |       overlay: { left: Math.round(o.left), right: Math.round(o.right), width: Math.round(o.width) },
  107 |       escaped,
  108 |       overChrome,
  109 |       total: document.querySelectorAll('[data-testid="topology-flow-badge"]').length,
  110 |     }
  111 |   })
  112 | }
  113 | 
  114 | for (const vp of VIEWPORTS) {
  115 |   test(`lower estate sections stay clear of the data tier at ${vp.name}`, async ({ context, page }) => {
  116 |     test.setTimeout(150_000)
  117 |     const groups = logicalGroupSnapshot()
  118 |     const triggers = triggerBundleSnapshot(groups.snapshot)
  119 |     const egress = externalEgressSnapshot(triggers.snapshot)
  120 |     await seedAuthCookie(context)
  121 |     await routeSnapshot(page, egress.snapshot)
  122 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  123 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  124 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  125 |     await page.getByRole("tab", { name: "Network topology" }).click()
  126 | 
  127 |     // --- default state: every on-demand section closed ---------------------
  128 |     const coverage = page.getByTestId("topology-lane-coverage").first()
  129 |     if (await coverage.count()) {
  130 |       await expect(coverage).toHaveAttribute("data-details-open", "false")
  131 |       const box = await coverage.boundingBox()
  132 |       // It measured 71px expanded. The collapsed row is one line of 10px text
  133 |       // in a py-1.5 box; 44px leaves room for a wrapped totals sentence at
  134 |       // 1024 wide without ever re-admitting the lane grid.
  135 |       expect(box!.height, "collapsed coverage row is not the 71px block").toBeLessThanOrEqual(44)
  136 |       await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeHidden()
  137 |     }
  138 | 
  139 |     const band = page.getByTestId("topology-logical-group-band").first()
  140 |     await expect(band).toBeVisible()
  141 |     await expect(band).toHaveAttribute("data-groups-open", "false")
  142 |     // The count must survive collapsing: a reader has to see that groups exist
  143 |     // without opening anything.
  144 |     const bandHeader = band.getByTestId("topology-logical-group-band-header")
  145 |     await expect(bandHeader).toContainText("Logical groups")
  146 |     await expect(bandHeader).toContainText(`(${groups.groups.length})`)
  147 | 
  148 |     const external = page.getByTestId("topology-external-destinations").first()
  149 |     await expect(external).toBeVisible()
  150 |     await expect(external).toHaveAttribute("data-open", "false")
  151 |     await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
  152 |     await expect(page.getByTestId("topology-external-destinations-details")).toBeHidden()
  153 | 
  154 |     const s3 = page.getByTestId("topology-lambda-s3-coverage").first()
  155 |     await expect(s3).toBeVisible()
  156 |     await expect(s3).toHaveAttribute("data-open", "false")
  157 |     await expect(s3).toHaveAttribute("data-with-traffic", String(triggers.s3Functions.length))
  158 |     await expect(s3).toHaveAttribute("data-total", String(triggers.lambdas.length))
  159 |     await expect(page.getByTestId("topology-lambda-s3-coverage-details")).toBeHidden()
  160 | 
  161 |     // The strip is centre-justified: an overflow is split between both ends,
  162 |     // so the USERS block is the half that leaves the screen first.
  163 |     const strip = page.getByTestId("topology-users-internet-strip").first()
  164 |     const stripBox = (await strip.boundingBox())!
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
> 187 |     ).toEqual([])
      |       ^ Error: flow badges painted over the map's own chrome at 1366x768: [{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"TARGETSTARGETS","over":"platform-map summary","area":378},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"LAUNCHESLAUNCHES","over":"platform-map summary","area":438},{"text":"MEMBER_OF_CLUSTERMEMBER_OF_CLUSTER","over":"platform-map summary","area":986}]
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
  238 |       return {
  239 |         captionPx: px(p.querySelector("p")!),
  240 |         minLegPx: Math.min(...legs.map(px)),
  241 |         // A wrapped line is fine; a line wider than its own box is clipped text.
  242 |         clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
  243 |       }
  244 |     })
  245 |     expect(readable, "the panel is measurable").not.toBeNull()
  246 |     expect(readable!.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  247 |     expect(readable!.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  248 |     expect(readable!.clipped, `clipped leg lines at ${vp.name}`).toBe(0)
  249 | 
  250 |     // Close by the control, not by Escape: the estate view installs its own
  251 |     // Escape handler for the topmost surface and this spec is not here to
  252 |     // arbitrate between the two.
  253 |     await external.getByTestId("topology-external-destinations-toggle").click()
  254 |     await expect(external).toHaveAttribute("data-open", "false")
  255 | 
  256 |     await s3.getByTestId("topology-lambda-s3-coverage-toggle").click()
  257 |     await expect(s3).toHaveAttribute("data-open", "true")
  258 |     await expect(s3.getByTestId("topology-lambda-s3-coverage-function")).toHaveCount(
  259 |       triggers.s3Functions.length,
  260 |     )
  261 | 
  262 |     if (await coverage.count()) {
  263 |       await page.getByTestId("topology-lane-coverage-details-toggle").click()
  264 |       await expect(coverage).toHaveAttribute("data-details-open", "true")
  265 |       await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeVisible()
  266 |     }
  267 | 
  268 |     // Opening a disclosure scrolls it into view, and the map is a horizontally
  269 |     // scrollable region, so the expanded frame would otherwise be taken from
  270 |     // wherever the last click left it. Reset the HORIZONTAL scroll only and
  271 |     // bring the map back into frame: scrolling the window to 0 as well pushed
  272 |     // the map itself below the fold at 1024x720 and the frame showed nothing
  273 |     // it was taken for (run 34850735271).
  274 |     await page.evaluate(() => {
  275 |       for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-region]"))) {
  276 |         el.scrollLeft = 0
  277 |       }
  278 |       document
  279 |         .querySelector('[data-testid="topology-estate-view-map"]')
  280 |         ?.scrollIntoView({ block: "start" })
  281 |     })
  282 |     // The panel is reopened for the frame, so the expanded screenshot shows
  283 |     // the state the assertions above measured.
  284 |     await external.getByTestId("topology-external-destinations-toggle").click()
  285 |     await expect(panel).toBeVisible()
  286 |     await page.screenshot({
  287 |       path: `test-results/estate-lower-geometry-${vp.name}.png`,
```