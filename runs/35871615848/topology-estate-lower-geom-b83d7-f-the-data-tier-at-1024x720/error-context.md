# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-lower-geometry-fixture.spec.ts >> lower estate sections stay clear of the data tier at 1024x720
- Location: tests/integration/topology-estate-lower-geometry-fixture.spec.ts:187:7

# Error details

```
Error: the external-destinations panel never settled opaque and on top (1024x720 · expanded screenshot): {"effectiveOpacity":1,"covered":[{"x":-19,"y":232,"hit":"nothing"}]}
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
        - generic [ref=e160]:
          - generic [ref=e161]:
            - generic [ref=e162]: Flow-log coverage
            - generic [ref=e163]: Partly covered
            - generic [ref=e164]: 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
            - button "Hide coverage details" [expanded] [ref=e165]
            - generic [ref=e166]:
              - 'generic "In-VPC: eligible 10, covered 10, unknown 0, not applicable 0" [ref=e167]': In-VPC 10/10
              - 'generic "Database: eligible 2, covered 2, unknown 0, not applicable 0" [ref=e168]': Database 2/2
              - 'generic "Lambda: eligible 0, covered 0, unknown 6, not applicable 0" [ref=e169]': Lambda 6 unknown
              - 'generic "Regional: eligible 0, covered 0, unknown 0, not applicable 18" [ref=e170]': Regional 18 n/a
          - list [ref=e171]:
            - listitem "6 Lambda function(s) have no verified VPC configuration; flow-log coverage for them is unknown, not absent." [ref=e172]:
              - generic [ref=e173]: "Lambda:"
              - text: 6 Lambda function(s) have no verified VPC configuration; flow-log coverage for them is unknown, not absent.
            - listitem "18 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane." [ref=e174]:
              - generic [ref=e175]: "Regional:"
              - text: 18 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane.
        - generic [ref=e176]:
          - generic [ref=e177]:
            - img [ref=e179]
            - generic [ref=e184]:
              - generic [ref=e185]: Users
              - generic [ref=e186]: Clients & operators
          - generic [ref=e188]:
            - img [ref=e190]
            - generic [ref=e195]:
              - generic [ref=e196]: Internet
              - generic [ref=e197]: Public path via IGW · alon-prod-igw
        - generic [ref=e198]:
          - generic [ref=e199]: ☁ AWS Cloud · acct 745783559495
          - generic [ref=e200]:
            - generic [ref=e201]: Region · eu-west-1
            - generic [ref=e202]:
              - generic [ref=e203]:
                - generic [ref=e204]:
                  - generic "vpc-0329e985173bed24f" [ref=e205]: VPC · vpc-0329e985173bed24f
                  - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e206]: SafeRemediate-Test-… ×3
                - generic [ref=e209]:
                  - generic [ref=e210]:
                    - generic "eu-west-1a" [ref=e211]: Availability Zone · eu-west-1a
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e212]':
                      - generic [ref=e213]:
                        - generic [ref=e214]: Public · SafeRemediate-Test-Public-1
                        - generic [ref=e215]: 10.0.1.0/24
                      - button "high posture score …Frontend-1" [ref=e217]:
                        - generic "high posture score" [ref=e218]
                        - generic [ref=e221]: …Frontend-1
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e222]':
                      - generic [ref=e223]:
                        - generic [ref=e224]: Private · SafeRemediate-Test-Private-App-1
                        - generic [ref=e225]: 10.0.10.0/24
                      - generic [ref=e226]: No workloads
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e227]':
                      - generic [ref=e228]:
                        - generic [ref=e229]: Data · SafeRemediate-Test-Private-DB-1
                        - generic [ref=e230]: 10.0.20.0/24
                      - generic [ref=e231]:
                        - button "quiet posture score saferemediate-test-db" [ref=e232]:
                          - generic "quiet posture score" [ref=e233]
                          - generic [ref=e236]: saferemediate-test-db
                        - button "Posture not scored fixture-neptune-1" [ref=e237]:
                          - generic "Posture not scored" [ref=e238]
                          - generic [ref=e241]: fixture-neptune-1
                  - generic [ref=e242]:
                    - generic "eu-west-1b" [ref=e243]: Availability Zone · eu-west-1b
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e244]':
                      - generic [ref=e245]:
                        - generic [ref=e246]: Public · SafeRemediate-Test-Public-2
                        - generic [ref=e247]: 10.0.2.0/24
                      - button "high posture score …Frontend-2" [ref=e249]:
                        - generic "high posture score" [ref=e250]
                        - generic [ref=e253]: …Frontend-2
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e254]':
                      - generic [ref=e255]:
                        - generic [ref=e256]: Private · SafeRemediate-Test-Private-App-2
                        - generic [ref=e257]: 10.0.11.0/24
                      - button "quiet posture score …App-2" [ref=e259]:
                        - generic "quiet posture score" [ref=e260]
                        - generic [ref=e263]: …App-2
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e264]':
                      - generic [ref=e265]:
                        - generic [ref=e266]: Data · SafeRemediate-Test-Private-DB-2
                        - generic [ref=e267]: 10.0.21.0/24
                      - generic [ref=e268]: No workloads
              - generic [ref=e269]:
                - generic [ref=e270]: VPC boundary
                - generic [ref=e271]:
                  - generic [ref=e272]: ↑ Internet
                  - generic [ref=e273]:
                    - button "IGW alon-prod-igw" [ref=e274]:
                      - img [ref=e276]
                      - generic [ref=e279]: IGW
                      - generic [ref=e280]: alon-prod-igw
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e281]: "egress: 9 workloads"
                - generic [ref=e283]:
                  - generic [ref=e284]: Endpoints (4)
                  - generic [ref=e285]:
                    - button "VPCE IF EC2 Messages" [ref=e286]:
                      - img [ref=e288]
                      - generic [ref=e292]: VPCE
                      - generic [ref=e293]: IF
                      - generic [ref=e294]: EC2 Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e295]: "use: not observed"
                  - generic [ref=e296]:
                    - button "VPCE GW Amazon S3" [ref=e297]:
                      - img [ref=e299]
                      - generic [ref=e303]: VPCE
                      - generic [ref=e304]: GW
                      - generic [ref=e305]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e306]: "use: not observed"
                  - generic [ref=e307]:
                    - button "VPCE IF AWS Systems Manager" [ref=e308]:
                      - img [ref=e310]
                      - generic [ref=e314]: VPCE
                      - generic [ref=e315]: IF
                      - generic [ref=e316]: AWS Systems Manager
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e317]: "use: 3 workloads"
                  - generic [ref=e318]:
                    - button "VPCE IF SSM Messages" [ref=e319]:
                      - img [ref=e321]
                      - generic [ref=e325]: VPCE
                      - generic [ref=e326]: IF
                      - generic [ref=e327]: SSM Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e328]: "use: 1 workload"
              - generic [ref=e329]:
                - generic [ref=e330]: Outside the VPC
                - generic [ref=e331]: Destinations observed this generation · NAT → IGW is configured routing
                - generic [ref=e332]:
                  - generic "S3 — attributed by the flow-log evidence" [ref=e333]:
                    - generic [ref=e334]: S3
                    - generic [ref=e335]: AWS service
                  - generic "3.253.225.145 — an address; the evidence names no service" [ref=e336]:
                    - generic [ref=e337]: 3.253.225.145
                    - generic [ref=e338]: address
                  - generic "3.5.67.254 — an address; the evidence names no service" [ref=e339]:
                    - generic [ref=e340]: 3.5.67.254
                    - generic [ref=e341]: address · 8 workloads
                  - generic "3.5.69.34 — an address; the evidence names no service" [ref=e342]:
                    - generic [ref=e343]: 3.5.69.34
                    - generic [ref=e344]: address · 8 workloads
                  - generic "3.5.72.119 — an address; the evidence names no service" [ref=e345]:
                    - generic [ref=e346]: 3.5.72.119
                    - generic [ref=e347]: address · 8 workloads
                  - generic "3.5.72.73 — an address; the evidence names no service" [ref=e348]:
                    - generic [ref=e349]: 3.5.72.73
                    - generic [ref=e350]: address · 8 workloads
                  - button "+3 more" [ref=e351]
                - generic [ref=e353]:
                  - generic [ref=e354]:
                    - generic [ref=e355]: 9 workloads
                    - generic [ref=e358]: ▸
                    - generic [ref=e359]:
                      - generic "NAT nat-fixture0a1b2c3d4" [ref=e360]:
                        - text: NAT
                        - generic [ref=e361]: nat-fixture0a1b2c3d4
                      - generic [ref=e364]: ▸
                    - generic [ref=e365]:
                      - generic "IGW igw-03bb3f19b706abbc4" [ref=e366]:
                        - text: IGW
                        - generic [ref=e367]: igw-03bb3f19b706abbc4
                      - generic [ref=e370]: ▸
                  - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [expanded] [ref=e371]:
                    - img [ref=e373]
                    - generic [ref=e378]:
                      - generic [ref=e379]: External destinations
                      - generic [ref=e380]: 9 workloads · up to 2579 distinct · addresses sampled
              - generic [ref=e381]:
                - generic [ref=e383]: Not in this VPC
                - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e385]:
                  - generic [ref=e386]: ALB · alon-prod-3tier-alb
                  - generic [ref=e387]: VPC vpc-086bcc2186…
                  - generic [ref=e388]: · payment-production
              - generic [ref=e390]:
                - generic [ref=e391]:
                  - generic [ref=e392]:
                    - generic [ref=e393]: Lambda runtime (6)
                    - generic [ref=e394]:
                      - text: outside subnet grid · 6 attachment unverified
                      - generic "4 of 12 chips omit this shared prefix" [ref=e395]: · SafeRemediate-… ×4
                    - generic [ref=e396]:
                      - button "S3 traffic from 4 of 6 functions" [expanded] [ref=e397]
                      - generic [ref=e398]:
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:AlonIAMTest-traffic-generator" [ref=e399]: AlonIAMTest-traffic-generator
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:PaymentTrafficGenerator" [ref=e400]: PaymentTrafficGenerator
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:SafeRemediate-BehaviorAnalyzer" [ref=e401]: …BehaviorAnalyzer
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:SafeRemediate-ConfidenceScorer" [ref=e402]: …ConfidenceScorer
                        - generic [ref=e403]: 2 functions have no recorded S3 edge in this generation.
                        - generic [ref=e404]: No specific S3 actions were recorded on these edges, so no operation is named.
                  - generic [ref=e405]:
                    - generic [ref=e406]: Triggers (6)
                    - generic [ref=e407]:
                      - button "Posture not scored fixture-frequent" [ref=e408]:
                        - generic "Posture not scored" [ref=e409]
                        - generic [ref=e412]: fixture-frequent
                      - button "Posture not scored fixture-every_6h" [ref=e413]:
                        - generic "Posture not scored" [ref=e414]
                        - generic [ref=e417]: fixture-every_6h
                      - button "Posture not scored fixture-daily" [ref=e418]:
                        - generic "Posture not scored" [ref=e419]
                        - generic [ref=e422]: fixture-daily
                      - button "Posture not scored fixture-nightly_burst" [ref=e423]:
                        - generic "Posture not scored" [ref=e424]
                        - generic [ref=e427]: fixture-nightly_burst
                      - button "Posture not scored fixture-weekly" [ref=e428]:
                        - generic "Posture not scored" [ref=e429]
                        - generic [ref=e432]: fixture-weekly
                      - button "Posture not scored fixture-monthly" [ref=e433]:
                        - generic "Posture not scored" [ref=e434]
                        - generic [ref=e437]: fixture-monthly
                  - generic [ref=e439]:
                    - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e440]:
                      - generic "quiet posture score" [ref=e441]
                      - generic [ref=e444]: AlonIAMTest-traffic-generator
                    - button "quiet posture score PaymentTrafficGenerator" [ref=e445]:
                      - generic "quiet posture score" [ref=e446]
                      - generic [ref=e449]: PaymentTrafficGenerator
                    - button "quiet posture score …BehaviorAnalyzer" [ref=e450]:
                      - generic "quiet posture score" [ref=e451]
                      - generic [ref=e454]: …BehaviorAnalyzer
                    - button "quiet posture score …ConfidenceScorer" [ref=e455]:
                      - generic "quiet posture score" [ref=e456]
                      - generic [ref=e459]: …ConfidenceScorer
                    - button "quiet posture score …CreateCheckpoint" [ref=e460]:
                      - generic "quiet posture score" [ref=e461]
                      - generic [ref=e464]: …CreateCheckpoint
                    - button "quiet posture score …PrismaWebhook" [ref=e465]:
                      - generic "quiet posture score" [ref=e466]
                      - generic [ref=e469]: …PrismaWebhook
                - generic [ref=e471]:
                  - generic [ref=e472]:
                    - text: Regional · S3 / DDB (18)
                    - generic "3 of 18 chips omit this shared prefix" [ref=e473]: SafeRemediate-… ×3
                  - generic [ref=e475]:
                    - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e476]:
                      - generic "quiet posture score" [ref=e477]
                      - generic [ref=e480]: alon-demo-data-bucket-745783559495
                    - button "S3×9" [ref=e481]:
                      - generic [ref=e485]:
                        - text: S3
                        - generic [ref=e486]: ×9
                    - button "DynamoDB×8" [ref=e487]:
                      - generic [ref=e491]:
                        - text: DynamoDB
                        - generic [ref=e492]: ×8
            - generic [ref=e493]:
              - button "Logical groups · members carry the placement (6) Hide members" [expanded] [ref=e494]:
                - generic [ref=e495]: Logical groups · members carry the placement (6)
                - generic [ref=e496]: Hide members
              - generic [ref=e497]:
                - generic [ref=e498]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
                - generic [ref=e499]:
                  - button "Posture not scored fixture-tg-web" [ref=e500]:
                    - generic "Posture not scored" [ref=e501]
                    - generic [ref=e504]: fixture-tg-web
                  - generic [ref=e505]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e506]:
                    - button "SafeRemediate-Test-App-2" [ref=e507]
                    - button "SafeRemediate-Test-Frontend-1" [ref=e508]
                - generic [ref=e509]:
                  - button "Posture not scored fixture-tg-app" [ref=e510]:
                    - generic "Posture not scored" [ref=e511]
                    - generic [ref=e514]: fixture-tg-app
                  - generic [ref=e515]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e516]:
                    - button "SafeRemediate-Test-Frontend-1" [ref=e517]
                    - button "SafeRemediate-Test-Frontend-2" [ref=e518]
                - generic [ref=e519]:
                  - button "Posture not scored fixture-asg-web" [ref=e520]:
                    - generic "Posture not scored" [ref=e521]
                    - generic [ref=e524]: fixture-asg-web
                  - generic [ref=e525]: VPC vpc-0329e985173bed24f · spans eu-west-1b
                  - generic [ref=e526]:
                    - button "SafeRemediate-Test-Frontend-2" [ref=e527]
                    - button "SafeRemediate-Test-App-2" [ref=e528]
                - generic [ref=e529]:
                  - button "Posture not scored fixture-asg-app" [ref=e530]:
                    - generic "Posture not scored" [ref=e531]
                    - generic [ref=e534]: fixture-asg-app
                  - generic [ref=e535]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e536]:
                    - button "SafeRemediate-Test-App-2" [ref=e537]
                    - button "SafeRemediate-Test-Frontend-1" [ref=e538]
                - generic [ref=e539]:
                  - button "Posture not scored fixture-aurora" [ref=e540]:
                    - generic "Posture not scored" [ref=e541]
                    - generic [ref=e544]: fixture-aurora
                  - generic [ref=e545]: VPC vpc-0329e985173bed24f · spans eu-west-1a
                  - button "saferemediate-test-db" [ref=e547]
                - generic [ref=e548]:
                  - button "Posture not scored fixture-graph" [ref=e549]:
                    - generic "Posture not scored" [ref=e550]
                    - generic [ref=e553]: fixture-graph
                  - generic [ref=e554]: VPC vpc-0329e985173bed24f · spans eu-west-1a
                  - button "fixture-neptune-1" [ref=e556]
        - generic [ref=e557]:
          - button "Diagnostics 6 serverless · 51 flows ▴" [ref=e558]:
            - generic [ref=e559]: Diagnostics
            - generic [ref=e560]: 6 serverless · 51 flows ▴
          - generic [ref=e561]:
            - generic [ref=e562]:
              - generic [ref=e563]: Serverless compute (6)
              - generic [ref=e564]:
                - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e565]:
                  - generic [ref=e567]:
                    - generic [ref=e569]: AlonIAMTest-traffic-generator
                    - generic [ref=e570]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e571]: "24"
                - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e572]:
                  - generic [ref=e574]:
                    - generic [ref=e576]: PaymentTrafficGenerator
                    - generic [ref=e577]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e578]: "18"
                - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e579]:
                  - generic [ref=e581]:
                    - generic [ref=e583]: SafeRemediate-BehaviorAnalyzer
                    - generic [ref=e584]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e585]: "18"
                - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e586]:
                  - generic [ref=e588]:
                    - generic [ref=e590]: SafeRemediate-ConfidenceScorer
                    - generic [ref=e591]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e592]: "18"
                - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e593]:
                  - generic [ref=e595]:
                    - generic [ref=e597]: SafeRemediate-CreateCheckpoint
                    - generic [ref=e598]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e599]: "18"
                - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e600]:
                  - generic [ref=e602]:
                    - generic [ref=e604]: SafeRemediate-PrismaWebhook
                    - generic [ref=e605]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e606]: "18"
            - generic [ref=e607]:
              - generic [ref=e608]:
                - generic [ref=e609]: Observed traffic — animated arrows above
                - generic [ref=e610]: 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
              - generic [ref=e611]: Listing 42 of 51 — the current lens and selection hide the rest. The counts above are the full evidence.
              - generic [ref=e612]:
                - generic [ref=e613]:
                  - generic [ref=e614]: SafeRemediate-Test-App-2
                  - generic [ref=e615]: →
                  - generic [ref=e616]: vpce-0f983779fff3bbae7
                  - generic [ref=e617]: VPCE
                - generic [ref=e618]:
                  - generic [ref=e619]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e620]: →
                  - generic [ref=e621]: vpce-0f983779fff3bbae7
                  - generic [ref=e622]: VPCE
                - generic [ref=e623]:
                  - generic [ref=e624]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e625]: →
                  - generic [ref=e626]: vpce-04ffe43eea196bf89
                  - generic [ref=e627]: VPCE
                - generic [ref=e628]:
                  - generic [ref=e629]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e630]: →
                  - generic [ref=e631]: vpce-0f983779fff3bbae7
                  - generic [ref=e632]: VPCE
                - generic [ref=e633]:
                  - generic [ref=e634]: SafeRemediate-Test-App-2
                  - generic [ref=e635]: →
                  - generic [ref=e636]: Internet (via IGW)
                  - generic [ref=e637]: egress · 3 (ext 3)
                - generic [ref=e638]:
                  - generic [ref=e639]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e640]: →
                  - generic [ref=e641]: Internet (via IGW)
                  - generic [ref=e642]: egress · 532 (ext 532 · S3 2)
                - generic [ref=e643]:
                  - generic [ref=e644]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e645]: →
                  - generic [ref=e646]: Internet (via IGW)
                  - generic [ref=e647]: egress · 588 (ext 588)
                - generic [ref=e648]:
                  - generic [ref=e649]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e650]: →
                  - generic [ref=e651]: saferemediate-test-db
                  - generic [ref=e652]: RDS · 5432
                - generic [ref=e653]:
                  - generic [ref=e654]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e655]: →
                  - generic [ref=e656]: saferemediate-test-db
                  - generic [ref=e657]: RDS · 3306
                - generic [ref=e658]:
                  - generic [ref=e659]: SafeRemediate-Test-App-2
                  - generic [ref=e660]: →
                  - generic [ref=e661]: saferemediate-test-db
                  - generic [ref=e662]: RDS
                - generic [ref=e663]:
                  - generic [ref=e664]: fixture-tg-web
                  - generic [ref=e665]: →
                  - generic [ref=e666]: SafeRemediate-Test-App-2
                  - generic [ref=e667]: TARGETS
                - generic [ref=e668]:
                  - generic [ref=e669]: fixture-tg-web
                  - generic [ref=e670]: →
                  - generic [ref=e671]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e672]: TARGETS
                - generic [ref=e673]: + 30 more flows
            - generic [ref=e674]:
              - generic [ref=e675]: Encoding
              - generic [ref=e676]:
                - generic [ref=e679]: Worst (carmine halo + pulse)
                - generic [ref=e682]: High / elevated (ring only)
                - generic [ref=e683]:
                  - generic [ref=e684]: ♛
                  - generic [ref=e685]: Crown-jewel halo
                - generic [ref=e688]: Clean · remediated (teal ring)
                - generic [ref=e691]: Stale (dimmed)
                - generic [ref=e694]: Coverage gap (not collected)
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
    - complementary [ref=e696]:
      - generic [ref=e697]:
        - generic [ref=e698]:
          - heading "Service index" [level=2] [ref=e699]
          - generic [ref=e700]: "41"
        - generic [ref=e701]:
          - img [ref=e702]
          - searchbox "Find service in topology" [ref=e705]
        - button "Filters" [ref=e708]:
          - img [ref=e709]
          - text: Filters
      - list [ref=e711]:
        - listitem [ref=e712]:
          - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e713]:
            - generic [ref=e714]:
              - img [ref=e716]
              - generic [ref=e718]:
                - generic [ref=e719]:
                  - generic [ref=e720]: SafeRemediate-Test-Frontend-1
                  - generic "Current graph data" [ref=e721]
                - generic [ref=e723]: EC2 · eu-west-1a · web
                - generic [ref=e724]:
                  - generic [ref=e725]: 3 in · 4 out
                  - generic [ref=e726]:
                    - img [ref=e727]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e730]:
          - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e731]:
            - generic [ref=e732]:
              - img [ref=e734]
              - generic [ref=e736]:
                - generic [ref=e737]:
                  - generic [ref=e738]: SafeRemediate-Test-App-2
                  - generic "Current graph data" [ref=e739]
                - generic [ref=e741]: EC2 · eu-west-1b · app
                - generic [ref=e742]:
                  - generic [ref=e743]: 3 in · 3 out
                  - generic [ref=e744]:
                    - img [ref=e745]
                    - text: Jul 9, 10:40 AM
        - listitem [ref=e748]:
          - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e749]:
            - generic [ref=e750]:
              - img [ref=e752]
              - generic [ref=e754]:
                - generic [ref=e755]:
                  - generic [ref=e756]: SafeRemediate-Test-Frontend-2
                  - generic "Current graph data" [ref=e757]
                - generic [ref=e759]: EC2 · eu-west-1b · web
                - generic [ref=e760]:
                  - generic [ref=e761]: 2 in · 3 out
                  - generic [ref=e762]:
                    - img [ref=e763]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e766]:
          - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e767]:
            - generic [ref=e768]:
              - img [ref=e770]
              - generic [ref=e772]:
                - generic [ref=e773]:
                  - generic [ref=e774]: alon-demo-data-bucket-745783559495
                  - generic "Current graph data" [ref=e775]
                - generic [ref=e777]: S3 · eu-west-1 · regional
                - generic [ref=e778]:
                  - generic [ref=e779]: 4 in · 0 out
                  - generic [ref=e780]:
                    - img [ref=e781]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e784]:
          - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e785]:
            - generic [ref=e786]:
              - img [ref=e788]
              - generic [ref=e790]:
                - generic [ref=e791]:
                  - generic [ref=e792]: saferemediate-test-db
                  - generic "Current graph data" [ref=e793]
                - generic [ref=e795]: RDS · eu-west-1a · data
                - generic [ref=e796]:
                  - generic [ref=e797]: 4 in · 0 out
                  - generic [ref=e798]:
                    - img [ref=e799]
                    - text: Jul 6, 03:05 PM
        - listitem [ref=e802]:
          - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e803]:
            - generic [ref=e804]:
              - img [ref=e806]
              - generic [ref=e808]:
                - generic [ref=e809]:
                  - generic [ref=e810]: AlonIAMTest-traffic-generator
                  - generic "Current graph data" [ref=e811]
                - generic [ref=e813]: Lambda · eu-west-1 · regional
                - generic [ref=e814]:
                  - generic [ref=e815]: 2 in · 1 out
                  - generic [ref=e816]:
                    - img [ref=e817]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e820]:
          - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e821]:
            - generic [ref=e822]:
              - img [ref=e824]
              - generic [ref=e826]:
                - generic [ref=e827]:
                  - generic [ref=e828]: PaymentTrafficGenerator
                  - generic "Current graph data" [ref=e829]
                - generic [ref=e831]: Lambda · eu-west-1 · regional
                - generic [ref=e832]:
                  - generic [ref=e833]: 2 in · 1 out
                  - generic [ref=e834]:
                    - img [ref=e835]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e838]:
          - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e839]:
            - generic [ref=e840]:
              - img [ref=e842]
              - generic [ref=e844]:
                - generic [ref=e845]:
                  - generic [ref=e846]: SafeRemediate-BehaviorAnalyzer
                  - generic "Current graph data" [ref=e847]
                - generic [ref=e849]: Lambda · eu-west-1 · regional
                - generic [ref=e850]:
                  - generic [ref=e851]: 2 in · 1 out
                  - generic [ref=e852]:
                    - img [ref=e853]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e856]:
          - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e857]:
            - generic [ref=e858]:
              - img [ref=e860]
              - generic [ref=e862]:
                - generic [ref=e863]:
                  - generic [ref=e864]: SafeRemediate-ConfidenceScorer
                  - generic "Current graph data" [ref=e865]
                - generic [ref=e867]: Lambda · eu-west-1 · regional
                - generic [ref=e868]:
                  - generic [ref=e869]: 2 in · 1 out
                  - generic [ref=e870]:
                    - img [ref=e871]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e874]:
          - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e875]:
            - generic [ref=e876]:
              - img [ref=e878]
              - generic [ref=e880]:
                - generic [ref=e881]:
                  - generic [ref=e882]: fixture-asg-app
                  - generic "Current graph data" [ref=e883]
                - generic [ref=e885]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e886]:
                  - generic [ref=e887]: 0 in · 2 out
                  - generic [ref=e888]:
                    - img [ref=e889]
                    - text: No runtime timestamp
        - listitem [ref=e892]:
          - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e893]:
            - generic [ref=e894]:
              - img [ref=e896]
              - generic [ref=e898]:
                - generic [ref=e899]:
                  - generic [ref=e900]: fixture-asg-web
                  - generic "Current graph data" [ref=e901]
                - generic [ref=e903]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e904]:
                  - generic [ref=e905]: 0 in · 2 out
                  - generic [ref=e906]:
                    - img [ref=e907]
                    - text: No runtime timestamp
        - listitem [ref=e910]:
          - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e911]:
            - generic [ref=e912]:
              - img [ref=e914]
              - generic [ref=e916]:
                - generic [ref=e917]:
                  - generic [ref=e918]: fixture-daily
                  - generic "Current graph data" [ref=e919]
                - generic [ref=e921]: EventBridge · eu-west-1 · regional
                - generic [ref=e922]:
                  - generic [ref=e923]: 0 in · 2 out
                  - generic [ref=e924]:
                    - img [ref=e925]
                    - text: No runtime timestamp
        - listitem [ref=e928]:
          - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e929]:
            - generic [ref=e930]:
              - img [ref=e932]
              - generic [ref=e934]:
                - generic [ref=e935]:
                  - generic [ref=e936]: fixture-every_6h
                  - generic "Current graph data" [ref=e937]
                - generic [ref=e939]: EventBridge · eu-west-1 · regional
                - generic [ref=e940]:
                  - generic [ref=e941]: 0 in · 2 out
                  - generic [ref=e942]:
                    - img [ref=e943]
                    - text: No runtime timestamp
        - listitem [ref=e946]:
          - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e947]:
            - generic [ref=e948]:
              - img [ref=e950]
              - generic [ref=e952]:
                - generic [ref=e953]:
                  - generic [ref=e954]: fixture-frequent
                  - generic "Current graph data" [ref=e955]
                - generic [ref=e957]: EventBridge · eu-west-1 · regional
                - generic [ref=e958]:
                  - generic [ref=e959]: 0 in · 2 out
                  - generic [ref=e960]:
                    - img [ref=e961]
                    - text: No runtime timestamp
        - listitem [ref=e964]:
          - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e965]:
            - generic [ref=e966]:
              - img [ref=e968]
              - generic [ref=e970]:
                - generic [ref=e971]:
                  - generic [ref=e972]: fixture-monthly
                  - generic "Current graph data" [ref=e973]
                - generic [ref=e975]: EventBridge · eu-west-1 · regional
                - generic [ref=e976]:
                  - generic [ref=e977]: 0 in · 2 out
                  - generic [ref=e978]:
                    - img [ref=e979]
                    - text: No runtime timestamp
        - listitem [ref=e982]:
          - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e983]:
            - generic [ref=e984]:
              - img [ref=e986]
              - generic [ref=e988]:
                - generic [ref=e989]:
                  - generic [ref=e990]: fixture-nightly_burst
                  - generic "Current graph data" [ref=e991]
                - generic [ref=e993]: EventBridge · eu-west-1 · regional
                - generic [ref=e994]:
                  - generic [ref=e995]: 0 in · 2 out
                  - generic [ref=e996]:
                    - img [ref=e997]
                    - text: No runtime timestamp
        - listitem [ref=e1000]:
          - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e1001]:
            - generic [ref=e1002]:
              - img [ref=e1004]
              - generic [ref=e1006]:
                - generic [ref=e1007]:
                  - generic [ref=e1008]: fixture-tg-app
                  - generic "Current graph data" [ref=e1009]
                - generic [ref=e1011]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e1012]:
                  - generic [ref=e1013]: 0 in · 2 out
                  - generic [ref=e1014]:
                    - img [ref=e1015]
                    - text: No runtime timestamp
        - listitem [ref=e1018]:
          - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e1019]:
            - generic [ref=e1020]:
              - img [ref=e1022]
              - generic [ref=e1024]:
                - generic [ref=e1025]:
                  - generic [ref=e1026]: fixture-tg-web
                  - generic "Current graph data" [ref=e1027]
                - generic [ref=e1029]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e1030]:
                  - generic [ref=e1031]: 0 in · 2 out
                  - generic [ref=e1032]:
                    - img [ref=e1033]
                    - text: No runtime timestamp
        - listitem [ref=e1036]:
          - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1037]:
            - generic [ref=e1038]:
              - img [ref=e1040]
              - generic [ref=e1042]:
                - generic [ref=e1043]:
                  - generic [ref=e1044]: fixture-weekly
                  - generic "Current graph data" [ref=e1045]
                - generic [ref=e1047]: EventBridge · eu-west-1 · regional
                - generic [ref=e1048]:
                  - generic [ref=e1049]: 0 in · 2 out
                  - generic [ref=e1050]:
                    - img [ref=e1051]
                    - text: No runtime timestamp
        - listitem [ref=e1054]:
          - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1055]:
            - generic [ref=e1056]:
              - img [ref=e1058]
              - generic [ref=e1060]:
                - generic [ref=e1061]:
                  - generic [ref=e1062]: SafeRemediate-CreateCheckpoint
                  - generic "Current graph data" [ref=e1063]
                - generic [ref=e1065]: Lambda · eu-west-1 · regional
                - generic [ref=e1066]:
                  - generic [ref=e1067]: 2 in · 0 out
                  - generic [ref=e1068]:
                    - img [ref=e1069]
                    - text: No runtime timestamp
        - listitem [ref=e1072]:
          - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1073]:
            - generic [ref=e1074]:
              - img [ref=e1076]
              - generic [ref=e1078]:
                - generic [ref=e1079]:
                  - generic [ref=e1080]: SafeRemediate-PrismaWebhook
                  - generic "Current graph data" [ref=e1081]
                - generic [ref=e1083]: Lambda · eu-west-1 · regional
                - generic [ref=e1084]:
                  - generic [ref=e1085]: 2 in · 0 out
                  - generic [ref=e1086]:
                    - img [ref=e1087]
                    - text: No runtime timestamp
        - listitem [ref=e1090]:
          - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1091]:
            - generic [ref=e1092]:
              - img [ref=e1094]
              - generic [ref=e1096]:
                - generic [ref=e1097]:
                  - generic [ref=e1098]: fixture-aurora
                  - generic "Current graph data" [ref=e1099]
                - generic [ref=e1101]: RDS · eu-west-1 · VPC
                - generic [ref=e1102]:
                  - generic [ref=e1103]: 0 in · 1 out
                  - generic [ref=e1104]:
                    - img [ref=e1105]
                    - text: No runtime timestamp
        - listitem [ref=e1108]:
          - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1109]:
            - generic [ref=e1110]:
              - img [ref=e1112]
              - generic [ref=e1114]:
                - generic [ref=e1115]:
                  - generic [ref=e1116]: fixture-graph
                  - generic "Current graph data" [ref=e1117]
                - generic [ref=e1119]: Neptune · eu-west-1 · VPC
                - generic [ref=e1120]:
                  - generic [ref=e1121]: 0 in · 1 out
                  - generic [ref=e1122]:
                    - img [ref=e1123]
                    - text: No runtime timestamp
        - listitem [ref=e1126]:
          - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e1127]:
            - generic [ref=e1128]:
              - img [ref=e1130]
              - generic [ref=e1132]:
                - generic [ref=e1133]:
                  - generic [ref=e1134]: fixture-neptune-1
                  - generic "Current graph data" [ref=e1135]
                - generic [ref=e1137]: Neptune · eu-west-1a · data
                - generic [ref=e1138]:
                  - generic [ref=e1139]: 1 in · 0 out
                  - generic [ref=e1140]:
                    - img [ref=e1141]
                    - text: No runtime timestamp
        - listitem [ref=e1144]:
          - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1145]:
            - generic [ref=e1146]:
              - img [ref=e1148]
              - generic [ref=e1151]:
                - generic [ref=e1152]:
                  - generic [ref=e1153]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                  - generic "Current graph data" [ref=e1154]
                - generic [ref=e1156]: S3 · eu-west-1 · regional
                - generic [ref=e1157]:
                  - generic [ref=e1158]: 0 in · 0 out
                  - generic [ref=e1159]:
                    - img [ref=e1160]
                    - text: No runtime timestamp
        - listitem [ref=e1163]:
          - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1164]:
            - generic [ref=e1165]:
              - img [ref=e1167]
              - generic [ref=e1170]:
                - generic [ref=e1171]:
                  - generic [ref=e1172]: cyntro-demo-analytics-745783559495
                  - generic "Current graph data" [ref=e1173]
                - generic [ref=e1175]: S3 · eu-west-1 · regional
                - generic [ref=e1176]:
                  - generic [ref=e1177]: 0 in · 0 out
                  - generic [ref=e1178]:
                    - img [ref=e1179]
                    - text: No runtime timestamp
        - listitem [ref=e1182]:
          - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1183]:
            - generic [ref=e1184]:
              - img [ref=e1186]
              - generic [ref=e1189]:
                - generic [ref=e1190]:
                  - generic [ref=e1191]: cyntro-demo-eu
                  - generic "Current graph data" [ref=e1192]
                - generic [ref=e1194]: S3 · eu-west-1 · regional
                - generic [ref=e1195]:
                  - generic [ref=e1196]: 0 in · 0 out
                  - generic [ref=e1197]:
                    - img [ref=e1198]
                    - text: No runtime timestamp
        - listitem [ref=e1201]:
          - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1202]:
            - generic [ref=e1203]:
              - img [ref=e1205]
              - generic [ref=e1208]:
                - generic [ref=e1209]:
                  - generic [ref=e1210]: cyntro-demo-prod-data-745783559495
                  - generic "Current graph data" [ref=e1211]
                - generic [ref=e1213]: S3 · eu-west-1 · regional
                - generic [ref=e1214]:
                  - generic [ref=e1215]: 0 in · 0 out
                  - generic [ref=e1216]:
                    - img [ref=e1217]
                    - text: No runtime timestamp
        - listitem [ref=e1220]:
          - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1221]:
            - generic [ref=e1222]:
              - img [ref=e1224]
              - generic [ref=e1227]:
                - generic [ref=e1228]:
                  - generic [ref=e1229]: cyntronewtestbucket
                  - generic "Current graph data" [ref=e1230]
                - generic [ref=e1232]: S3 · eu-west-1 · regional
                - generic [ref=e1233]:
                  - generic [ref=e1234]: 0 in · 0 out
                  - generic [ref=e1235]:
                    - img [ref=e1236]
                    - text: No runtime timestamp
        - listitem [ref=e1239]:
          - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1240]:
            - generic [ref=e1241]:
              - img [ref=e1243]
              - generic [ref=e1246]:
                - generic [ref=e1247]:
                  - generic [ref=e1248]: cyntrotest2
                  - generic "Current graph data" [ref=e1249]
                - generic [ref=e1251]: S3 · eu-west-1 · regional
                - generic [ref=e1252]:
                  - generic [ref=e1253]: 0 in · 0 out
                  - generic [ref=e1254]:
                    - img [ref=e1255]
                    - text: No runtime timestamp
        - listitem [ref=e1258]:
          - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1259]:
            - generic [ref=e1260]:
              - img [ref=e1262]
              - generic [ref=e1265]:
                - generic [ref=e1266]:
                  - generic [ref=e1267]: impaciq-findings
                  - generic "Current graph data" [ref=e1268]
                - generic [ref=e1270]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1271]:
                  - generic [ref=e1272]: 0 in · 0 out
                  - generic [ref=e1273]:
                    - img [ref=e1274]
                    - text: No runtime timestamp
        - listitem [ref=e1277]:
          - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1278]:
            - generic [ref=e1279]:
              - img [ref=e1281]
              - generic [ref=e1284]:
                - generic [ref=e1285]:
                  - generic [ref=e1286]: impaciq-remediation-history
                  - generic "Current graph data" [ref=e1287]
                - generic [ref=e1289]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1290]:
                  - generic [ref=e1291]: 0 in · 0 out
                  - generic [ref=e1292]:
                    - img [ref=e1293]
                    - text: No runtime timestamp
        - listitem [ref=e1296]:
          - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1297]:
            - generic [ref=e1298]:
              - img [ref=e1300]
              - generic [ref=e1303]:
                - generic [ref=e1304]:
                  - generic [ref=e1305]: impaciq-scan-status
                  - generic "Current graph data" [ref=e1306]
                - generic [ref=e1308]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1309]:
                  - generic [ref=e1310]: 0 in · 0 out
                  - generic [ref=e1311]:
                    - img [ref=e1312]
                    - text: No runtime timestamp
        - listitem [ref=e1315]:
          - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1316]:
            - generic [ref=e1317]:
              - img [ref=e1319]
              - generic [ref=e1322]:
                - generic [ref=e1323]:
                  - generic [ref=e1324]: least_privilege_role_state
                  - generic "Current graph data" [ref=e1325]
                - generic [ref=e1327]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1328]:
                  - generic [ref=e1329]: 0 in · 0 out
                  - generic [ref=e1330]:
                    - img [ref=e1331]
                    - text: No runtime timestamp
        - listitem [ref=e1334]:
          - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1335]:
            - generic [ref=e1336]:
              - img [ref=e1338]
              - generic [ref=e1341]:
                - generic [ref=e1342]:
                  - generic [ref=e1343]: saferemediate-access-logs-745783559495
                  - generic "Current graph data" [ref=e1344]
                - generic [ref=e1346]: S3 · eu-west-1 · regional
                - generic [ref=e1347]:
                  - generic [ref=e1348]: 0 in · 0 out
                  - generic [ref=e1349]:
                    - img [ref=e1350]
                    - text: No runtime timestamp
        - listitem [ref=e1353]:
          - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1354]:
            - generic [ref=e1355]:
              - img [ref=e1357]
              - generic [ref=e1360]:
                - generic [ref=e1361]:
                  - generic [ref=e1362]: saferemediate-demo-cloudtrail-745783559495
                  - generic "Current graph data" [ref=e1363]
                - generic [ref=e1365]: S3 · eu-west-1 · regional
                - generic [ref=e1366]:
                  - generic [ref=e1367]: 0 in · 0 out
                  - generic [ref=e1368]:
                    - img [ref=e1369]
                    - text: No runtime timestamp
        - listitem [ref=e1372]:
          - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1373]:
            - generic [ref=e1374]:
              - img [ref=e1376]
              - generic [ref=e1379]:
                - generic [ref=e1380]:
                  - generic [ref=e1381]: SafeRemediate-Executions
                  - generic "Current graph data" [ref=e1382]
                - generic [ref=e1384]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1385]:
                  - generic [ref=e1386]: 0 in · 0 out
                  - generic [ref=e1387]:
                    - img [ref=e1388]
                    - text: No runtime timestamp
        - listitem [ref=e1391]:
          - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1392]:
            - generic [ref=e1393]:
              - img [ref=e1395]
              - generic [ref=e1398]:
                - generic [ref=e1399]:
                  - generic [ref=e1400]: SafeRemediate-Findings
                  - generic "Current graph data" [ref=e1401]
                - generic [ref=e1403]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1404]:
                  - generic [ref=e1405]: 0 in · 0 out
                  - generic [ref=e1406]:
                    - img [ref=e1407]
                    - text: No runtime timestamp
        - listitem [ref=e1410]:
          - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1411]:
            - generic [ref=e1412]:
              - img [ref=e1414]
              - generic [ref=e1417]:
                - generic [ref=e1418]:
                  - generic [ref=e1419]: saferemediate-logs-745783559495
                  - generic "Current graph data" [ref=e1420]
                - generic [ref=e1422]: S3 · eu-west-1 · regional
                - generic [ref=e1423]:
                  - generic [ref=e1424]: 0 in · 0 out
                  - generic [ref=e1425]:
                    - img [ref=e1426]
                    - text: No runtime timestamp
        - listitem [ref=e1429]:
          - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1430]:
            - generic [ref=e1431]:
              - img [ref=e1433]
              - generic [ref=e1436]:
                - generic [ref=e1437]:
                  - generic [ref=e1438]: SafeRemediate-Simulations
                  - generic "Current graph data" [ref=e1439]
                - generic [ref=e1441]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1442]:
                  - generic [ref=e1443]: 0 in · 0 out
                  - generic [ref=e1444]:
                    - img [ref=e1445]
                    - text: No runtime timestamp
        - listitem [ref=e1448]:
          - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1449]:
            - generic [ref=e1450]:
              - img [ref=e1452]
              - generic [ref=e1455]:
                - generic [ref=e1456]:
                  - generic [ref=e1457]: sg_state
                  - generic "Current graph data" [ref=e1458]
                - generic [ref=e1460]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1461]:
                  - generic [ref=e1462]: 0 in · 0 out
                  - generic [ref=e1463]:
                    - img [ref=e1464]
                    - text: No runtime timestamp
    - contentinfo [ref=e1467]:
      - text: Live read from
      - generic [ref=e1468]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1469]
  - dialog [active] [ref=e1471]:
    - paragraph [ref=e1472]: 9 workloads leaving the VPC
    - paragraph [ref=e1473]: "Route is configured (route tables): NAT nat-fixture0a1b2c3d4 → IGW igw-03bb3f19b706abbc4. Counts are observed. The payload names no destination identities, so these addresses are evidence, not an inventory of services."
    - list [ref=e1474]:
      - listitem [ref=e1475]:
        - text: i-0e9b891793b5b2dbd · 3 distinct · all 3 shown
        - generic [ref=e1476]: — 54.217.69.183, 54.217.245.46, 3.253.225.145
      - listitem [ref=e1477]:
        - text: i-0f51b8b7ad29a359b · 532 distinct · 5 of 532 shown
        - generic [ref=e1478]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1479]:
        - text: i-03c72e120ff96216c · 588 distinct · 5 of 588 shown
        - generic [ref=e1480]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1481]:
        - text: i-0aa725bf8ff4c2001 · 927 distinct · 5 of 927 shown
        - generic [ref=e1482]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1483]:
        - text: i-0d4186a6b477dcd55 · 20 distinct · 5 of 20 shown
        - generic [ref=e1484]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1485]:
        - text: i-009a28b5cab755850 · 20 distinct · 5 of 20 shown
        - generic [ref=e1486]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1487]:
        - text: i-0e4edb2adb28e4f16 · 23 distinct · 5 of 23 shown
        - generic [ref=e1488]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1489]:
        - text: i-02a0da7f8373e6c8f · 32 distinct · 5 of 32 shown
        - generic [ref=e1490]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1491]:
        - text: i-0ee29afa0048943e0 · 434 distinct · 5 of 434 shown
        - generic [ref=e1492]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
```

# Test source

```ts
  22  |  *  The second review pass added three more rectangle facts, each for a defect
  23  |  *  the first set of assertions passed straight through:
  24  |  *    · the expanded External destinations detail was a horizontal SIBLING, so
  25  |  *      opening it widened the strip until the text was unreadable and pushed
  26  |  *      the Users block off screen at 1024x720. Non-overlap with the data tier
  27  |  *      said nothing about that, so the strip's own width is now compared
  28  |  *      before and after opening, the panel is required to sit inside the
  29  |  *      viewport, and its type is required to be legible.
  30  |  *    · the logical groups' membership badges painted outside the map card
  31  |  *      entirely. Every flow badge is now required to sit inside the overlay.
  32  |  *
  33  |  *  1512x771 is the reported failure viewport (the user screenshot is DPR 2, so
  34  |  *  its 3024x1542 pixels are 1512x771 CSS px — the CSS number is what layout
  35  |  *  sees and therefore what a regression test must use).
  36  |  *
  37  |  *  The payload is all three builders chained, so one screenshot per viewport
  38  |  *  carries the six-group band, the external-destinations chain and the Lambda
  39  |  *  S3 panel at once — the state a reader actually meets. */
  40  | const VIEWPORTS = [
  41  |   { name: "1600x900", width: 1600, height: 900 },
  42  |   { name: "1512x771", width: 1512, height: 771 },
  43  |   { name: "1366x768", width: 1366, height: 768 },
  44  |   { name: "1024x720", width: 1024, height: 720 },
  45  | ] as const
  46  | 
  47  | /** Overlap of two rects in px^2. Zero means they do not intersect at all. */
  48  | async function overlapArea(a: Locator, b: Locator): Promise<number> {
  49  |   const [ra, rb] = [await a.boundingBox(), await b.boundingBox()]
  50  |   if (!ra || !rb) return 0
  51  |   const w = Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x)
  52  |   const h = Math.min(ra.y + ra.height, rb.y + rb.height) - Math.max(ra.y, rb.y)
  53  |   return w > 0 && h > 0 ? w * h : 0
  54  | }
  55  | 
  56  | /** Is the panel actually READABLE where it is drawn?
  57  |  *
  58  |  *  Three things can make a detail panel unreadable and only one of them is
  59  |  *  opacity, which is why the first two rounds of this fix chased the wrong
  60  |  *  property. Measured at 1512x771 (run 34856953477): the panel's own opacity
  61  |  *  was 1, its background opaque, every ancestor opacity 1 — and the map still
  62  |  *  showed through, because Radix positions its content inside a FIXED wrapper
  63  |  *  that carries no z-index, and `z-50` does nothing on the statically
  64  |  *  positioned content inside it. So the panel was painting UNDER the map.
  65  |  *
  66  |  *  The property that covers all three is a hit test: at points inside the
  67  |  *  panel, the topmost element must be the panel or something inside it.
  68  |  *  Effective opacity is reported alongside it so a future failure says which
  69  |  *  of the two it is.
  70  |  *
  71  |  *  `animationPlayState` is deliberately NOT part of the predicate: it stays
  72  |  *  "running" after a keyframe has finished, so a settle-wait built on it can
  73  |  *  never become true (run 34856385832 timed out at every viewport on exactly
  74  |  *  that). Opacity settling is what "the animation finished" actually means. */
  75  | const PANEL_READABILITY = `(() => {
  76  |   const el = document.querySelector('[data-testid="topology-external-destinations-details"]')
  77  |   if (!el) return null
  78  |   let node = el
  79  |   let product = 1
  80  |   while (node && node !== document.documentElement) {
  81  |     product *= Number(getComputedStyle(node).opacity)
  82  |     node = node.parentElement
  83  |   }
  84  |   const r = el.getBoundingClientRect()
  85  |   const probes = [
  86  |     [r.left + r.width * 0.5, r.top + 6],
  87  |     [r.left + r.width * 0.5, r.top + r.height * 0.5],
  88  |     [r.left + r.width * 0.5, r.bottom - 6],
  89  |     [r.left + 6, r.top + r.height * 0.5],
  90  |     [r.right - 6, r.top + r.height * 0.5],
  91  |   ]
  92  |   const covered = []
  93  |   for (const [x, y] of probes) {
  94  |     const top = document.elementFromPoint(x, y)
  95  |     if (!top || !(el === top || el.contains(top))) {
  96  |       covered.push({
  97  |         x: Math.round(x),
  98  |         y: Math.round(y),
  99  |         hit: top ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 40)) : 'nothing',
  100 |       })
  101 |     }
  102 |   }
  103 |   return { effectiveOpacity: product, covered }
  104 | })()`
  105 | 
  106 | /** Wait until the panel has settled: opaque, and the topmost element at its
  107 |  *  own probe points. Measuring or screenshotting before this reads a mid-fade
  108 |  *  or mis-layered frame, which is how an unreadable panel reached the
  109 |  *  published artifacts while every geometric assertion passed. */
  110 | async function waitForSettledPanel(page: Page, where: string) {
  111 |   try {
  112 |     await page.waitForFunction(
  113 |       `(() => { const s = ${PANEL_READABILITY}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  114 |       undefined,
  115 |       { timeout: 10_000 },
  116 |     )
  117 |   } catch {
  118 |     // Fail with the measurement, not with "it did not settle": the next
  119 |     // question is always WHAT is covering it or fading it, and a timeout that
  120 |     // does not answer that costs a whole CI round-trip.
  121 |     const state = await page.evaluate(`${PANEL_READABILITY}`)
> 122 |     throw new Error(
      |           ^ Error: the external-destinations panel never settled opaque and on top (1024x720 · expanded screenshot): {"effectiveOpacity":1,"covered":[{"x":-19,"y":232,"hit":"nothing"}]}
  123 |       `the external-destinations panel never settled opaque and on top (${where}): ${JSON.stringify(state)}`,
  124 |     )
  125 |   }
  126 | }
  127 | 
  128 | /** Every drawn flow badge, and the overlay it is supposed to stay inside. *//** Every drawn flow badge, and the overlay it is supposed to stay inside. */
  129 | async function badgesOutsideOverlay(page: Page) {
  130 |   return page.evaluate(() => {
  131 |     const svg = document.querySelector('[data-testid="topology-flow-overlay"]')
  132 |     if (!svg) return { overlay: null, escaped: [] as Array<Record<string, unknown>> }
  133 |     const o = svg.getBoundingClientRect()
  134 |     const escaped: Array<Record<string, unknown>> = []
  135 |     for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
  136 |       const r = g.getBoundingClientRect()
  137 |       if (r.width === 0 && r.height === 0) continue
  138 |       // 1px of tolerance for the stroke the renderer draws on the box edge.
  139 |       if (r.left < o.left - 1 || r.right > o.right + 1 || r.top < o.top - 1 || r.bottom > o.bottom + 1) {
  140 |         escaped.push({
  141 |           text: (g.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
  142 |           left: Math.round(r.left),
  143 |           right: Math.round(r.right),
  144 |           top: Math.round(r.top),
  145 |           bottom: Math.round(r.bottom),
  146 |         })
  147 |       }
  148 |     }
  149 |     // The map's own chrome. A badge clamped back inside the card is contained
  150 |     // and can still be unreadable, stacked on the summary row or the colour
  151 |     // legend; both carry data-flow-obstacle so the nudge pass has to clear
  152 |     // them, and this measures whether it did.
  153 |     const chrome: Array<{ name: string; r: DOMRect }> = []
  154 |     for (const [name, sel] of [
  155 |       ["platform-map summary", '[data-testid="topology-platform-map-summary"]'],
  156 |       ["flow legend", '[data-testid="topology-flow-legend"]'],
  157 |     ] as const) {
  158 |       const el = document.querySelector(sel)
  159 |       if (el) chrome.push({ name, r: el.getBoundingClientRect() })
  160 |     }
  161 |     const overChrome: Array<Record<string, unknown>> = []
  162 |     for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
  163 |       const r = g.getBoundingClientRect()
  164 |       if (r.width === 0 && r.height === 0) continue
  165 |       for (const c of chrome) {
  166 |         const w = Math.min(r.right, c.r.right) - Math.max(r.left, c.r.left)
  167 |         const h = Math.min(r.bottom, c.r.bottom) - Math.max(r.top, c.r.top)
  168 |         if (w > 1 && h > 1) {
  169 |           overChrome.push({
  170 |             text: (g.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
  171 |             over: c.name,
  172 |             area: Math.round(w * h),
  173 |           })
  174 |         }
  175 |       }
  176 |     }
  177 |     return {
  178 |       overlay: { left: Math.round(o.left), right: Math.round(o.right), width: Math.round(o.width) },
  179 |       escaped,
  180 |       overChrome,
  181 |       total: document.querySelectorAll('[data-testid="topology-flow-badge"]').length,
  182 |     }
  183 |   })
  184 | }
  185 | 
  186 | for (const vp of VIEWPORTS) {
  187 |   test(`lower estate sections stay clear of the data tier at ${vp.name}`, async ({ context, page }) => {
  188 |     test.setTimeout(150_000)
  189 |     const groups = logicalGroupSnapshot()
  190 |     const triggers = triggerBundleSnapshot(groups.snapshot)
  191 |     const egress = externalEgressSnapshot(triggers.snapshot)
  192 |     await seedAuthCookie(context)
  193 |     await routeSnapshot(page, egress.snapshot)
  194 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  195 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  196 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  197 |     await page.getByRole("tab", { name: "Network topology" }).click()
  198 | 
  199 |     // --- default state: every on-demand section closed ---------------------
  200 |     const coverage = page.getByTestId("topology-lane-coverage").first()
  201 |     if (await coverage.count()) {
  202 |       await expect(coverage).toHaveAttribute("data-details-open", "false")
  203 |       const box = await coverage.boundingBox()
  204 |       // It measured 71px expanded. The collapsed row is one line of 10px text
  205 |       // in a py-1.5 box; 44px leaves room for a wrapped totals sentence at
  206 |       // 1024 wide without ever re-admitting the lane grid.
  207 |       expect(box!.height, "collapsed coverage row is not the 71px block").toBeLessThanOrEqual(44)
  208 |       await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeHidden()
  209 |     }
  210 | 
  211 |     const band = page.getByTestId("topology-logical-group-band").first()
  212 |     await expect(band).toBeVisible()
  213 |     await expect(band).toHaveAttribute("data-groups-open", "false")
  214 |     // The count must survive collapsing: a reader has to see that groups exist
  215 |     // without opening anything.
  216 |     const bandHeader = band.getByTestId("topology-logical-group-band-header")
  217 |     await expect(bandHeader).toContainText("Logical groups")
  218 |     await expect(bandHeader).toContainText(`(${groups.groups.length})`)
  219 | 
  220 |     const external = page.getByTestId("topology-external-destinations").first()
  221 |     await expect(external).toBeVisible()
  222 |     await expect(external).toHaveAttribute("data-open", "false")
```