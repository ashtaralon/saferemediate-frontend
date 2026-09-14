# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-lower-geometry-fixture.spec.ts >> lower estate sections stay clear of the data tier at 1024x720
- Location: tests/integration/topology-estate-lower-geometry-fixture.spec.ts:187:7

# Error details

```
Error: the external-destinations panel never settled opaque and on top (1024x720 · expanded screenshot): {"effectiveOpacity":1,"covered":[{"x":640,"y":16,"hit":"span.text-[10px] font-bold uppercase tracking"}]}
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
        - generic [ref=e159]:
          - generic [ref=e160]:
            - generic [ref=e161]: Flow-log coverage
            - generic [ref=e162]: Partly covered
            - generic [ref=e163]: 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
            - button "Hide coverage details" [expanded] [ref=e164]
            - generic [ref=e165]:
              - 'generic "In-VPC: eligible 10, covered 10, unknown 0, not applicable 0" [ref=e166]': In-VPC 10/10
              - 'generic "Database: eligible 2, covered 2, unknown 0, not applicable 0" [ref=e167]': Database 2/2
              - 'generic "Lambda: eligible 0, covered 0, unknown 6, not applicable 0" [ref=e168]': Lambda 6 unknown
              - 'generic "Regional: eligible 0, covered 0, unknown 0, not applicable 18" [ref=e169]': Regional 18 n/a
          - list [ref=e170]:
            - listitem "6 Lambda function(s) have no verified VPC configuration; flow-log coverage for them is unknown, not absent." [ref=e171]:
              - generic [ref=e172]: "Lambda:"
              - text: 6 Lambda function(s) have no verified VPC configuration; flow-log coverage for them is unknown, not absent.
            - listitem "18 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane." [ref=e173]:
              - generic [ref=e174]: "Regional:"
              - text: 18 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane.
        - generic [ref=e175]:
          - generic [ref=e176]:
            - img [ref=e178]
            - generic [ref=e183]:
              - generic [ref=e184]: Users
              - generic [ref=e185]: Clients & operators
          - generic [ref=e187]:
            - img [ref=e189]
            - generic [ref=e194]:
              - generic [ref=e195]: Internet
              - generic [ref=e196]: Public path via IGW · alon-prod-igw
          - generic [ref=e197]:
            - generic [ref=e198]:
              - generic [ref=e199]: 9 workloads
              - generic [ref=e202]: ▸
              - generic [ref=e203]:
                - generic "NAT nat-fixture0a1b2c3d4" [ref=e204]:
                  - text: NAT
                  - generic [ref=e205]: nat-fixture0a1b2c3d4
                - generic [ref=e208]: ▸
              - generic [ref=e209]:
                - generic "IGW igw-03bb3f19b706abbc4" [ref=e210]:
                  - text: IGW
                  - generic [ref=e211]: igw-03bb3f19b706abbc4
                - generic [ref=e214]: ▸
            - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [expanded] [ref=e215]:
              - img [ref=e217]
              - generic [ref=e222]:
                - generic [ref=e223]: External destinations
                - generic [ref=e224]: 9 workloads · up to 2579 distinct · addresses sampled
        - generic [ref=e225]:
          - generic [ref=e226]: ☁ AWS Cloud · acct 745783559495
          - generic [ref=e227]:
            - generic [ref=e228]: Region · eu-west-1
            - generic [ref=e229]:
              - generic [ref=e230]:
                - generic [ref=e231]:
                  - generic "vpc-0329e985173bed24f" [ref=e232]: VPC · vpc-0329e985173bed24f
                  - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e233]: SafeRemediate-Test-… ×3
                - generic [ref=e236]:
                  - generic [ref=e237]:
                    - generic "eu-west-1a" [ref=e238]: Availability Zone · eu-west-1a
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e239]':
                      - generic [ref=e240]:
                        - generic [ref=e241]: Public · SafeRemediate-Test-Public-1
                        - generic [ref=e242]: 10.0.1.0/24
                      - button "high posture score …Frontend-1" [ref=e244]:
                        - generic "high posture score" [ref=e245]
                        - generic [ref=e248]: …Frontend-1
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e249]':
                      - generic [ref=e250]:
                        - generic [ref=e251]: Private · SafeRemediate-Test-Private-App-1
                        - generic [ref=e252]: 10.0.10.0/24
                      - generic [ref=e253]: No workloads
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e254]':
                      - generic [ref=e255]:
                        - generic [ref=e256]: Data · SafeRemediate-Test-Private-DB-1
                        - generic [ref=e257]: 10.0.20.0/24
                      - generic [ref=e258]:
                        - button "quiet posture score saferemediate-test-db" [ref=e259]:
                          - generic "quiet posture score" [ref=e260]
                          - generic [ref=e263]: saferemediate-test-db
                        - button "Posture not scored fixture-neptune-1" [ref=e264]:
                          - generic "Posture not scored" [ref=e265]
                          - generic [ref=e268]: fixture-neptune-1
                  - generic [ref=e269]:
                    - generic "eu-west-1b" [ref=e270]: Availability Zone · eu-west-1b
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e271]':
                      - generic [ref=e272]:
                        - generic [ref=e273]: Public · SafeRemediate-Test-Public-2
                        - generic [ref=e274]: 10.0.2.0/24
                      - button "high posture score …Frontend-2" [ref=e276]:
                        - generic "high posture score" [ref=e277]
                        - generic [ref=e280]: …Frontend-2
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e281]':
                      - generic [ref=e282]:
                        - generic [ref=e283]: Private · SafeRemediate-Test-Private-App-2
                        - generic [ref=e284]: 10.0.11.0/24
                      - button "quiet posture score …App-2" [ref=e286]:
                        - generic "quiet posture score" [ref=e287]
                        - generic [ref=e290]: …App-2
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e291]':
                      - generic [ref=e292]:
                        - generic [ref=e293]: Data · SafeRemediate-Test-Private-DB-2
                        - generic [ref=e294]: 10.0.21.0/24
                      - generic [ref=e295]: No workloads
              - generic [ref=e296]:
                - generic [ref=e297]: VPC boundary
                - generic [ref=e298]:
                  - generic [ref=e299]: ↑ Internet
                  - generic [ref=e300]:
                    - button "IGW alon-prod-igw" [ref=e301]:
                      - img [ref=e303]
                      - generic [ref=e306]: IGW
                      - generic [ref=e307]: alon-prod-igw
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e308]: "egress: 9 workloads"
                - generic [ref=e310]:
                  - generic [ref=e311]: Endpoints (4)
                  - generic [ref=e312]:
                    - button "VPCE IF EC2 Messages" [ref=e313]:
                      - img [ref=e315]
                      - generic [ref=e319]: VPCE
                      - generic [ref=e320]: IF
                      - generic [ref=e321]: EC2 Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e322]: "use: not observed"
                  - generic [ref=e323]:
                    - button "VPCE GW Amazon S3" [ref=e324]:
                      - img [ref=e326]
                      - generic [ref=e330]: VPCE
                      - generic [ref=e331]: GW
                      - generic [ref=e332]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e333]: "use: not observed"
                  - generic [ref=e334]:
                    - button "VPCE IF AWS Systems Manager" [ref=e335]:
                      - img [ref=e337]
                      - generic [ref=e341]: VPCE
                      - generic [ref=e342]: IF
                      - generic [ref=e343]: AWS Systems Manager
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e344]: "use: 3 workloads"
                  - generic [ref=e345]:
                    - button "VPCE IF SSM Messages" [ref=e346]:
                      - img [ref=e348]
                      - generic [ref=e352]: VPCE
                      - generic [ref=e353]: IF
                      - generic [ref=e354]: SSM Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e355]: "use: 1 workload"
              - generic [ref=e356]:
                - generic [ref=e358]: Not in this VPC
                - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e360]:
                  - generic [ref=e361]: ALB · alon-prod-3tier-alb
                  - generic [ref=e362]: VPC vpc-086bcc2186…
                  - generic [ref=e363]: · payment-production
              - generic [ref=e365]:
                - generic [ref=e366]:
                  - generic [ref=e367]:
                    - generic [ref=e368]: Lambda runtime (6)
                    - generic [ref=e369]:
                      - text: outside subnet grid · 6 attachment unverified
                      - generic "4 of 12 chips omit this shared prefix" [ref=e370]: · SafeRemediate-… ×4
                    - generic [ref=e371]:
                      - button "S3 traffic from 4 of 6 functions" [expanded] [ref=e372]
                      - generic [ref=e373]:
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:AlonIAMTest-traffic-generator" [ref=e374]: AlonIAMTest-traffic-generator
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:PaymentTrafficGenerator" [ref=e375]: PaymentTrafficGenerator
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:SafeRemediate-BehaviorAnalyzer" [ref=e376]: …BehaviorAnalyzer
                        - generic "arn:aws:lambda:eu-west-1:745783559495:function:SafeRemediate-ConfidenceScorer" [ref=e377]: …ConfidenceScorer
                        - generic [ref=e378]: 2 functions have no recorded S3 edge in this generation.
                        - generic [ref=e379]: No specific S3 actions were recorded on these edges, so no operation is named.
                  - generic [ref=e380]:
                    - generic [ref=e381]: Triggers (6)
                    - generic [ref=e382]:
                      - button "Posture not scored fixture-frequent" [ref=e383]:
                        - generic "Posture not scored" [ref=e384]
                        - generic [ref=e387]: fixture-frequent
                      - button "Posture not scored fixture-every_6h" [ref=e388]:
                        - generic "Posture not scored" [ref=e389]
                        - generic [ref=e392]: fixture-every_6h
                      - button "Posture not scored fixture-daily" [ref=e393]:
                        - generic "Posture not scored" [ref=e394]
                        - generic [ref=e397]: fixture-daily
                      - button "Posture not scored fixture-nightly_burst" [ref=e398]:
                        - generic "Posture not scored" [ref=e399]
                        - generic [ref=e402]: fixture-nightly_burst
                      - button "Posture not scored fixture-weekly" [ref=e403]:
                        - generic "Posture not scored" [ref=e404]
                        - generic [ref=e407]: fixture-weekly
                      - button "Posture not scored fixture-monthly" [ref=e408]:
                        - generic "Posture not scored" [ref=e409]
                        - generic [ref=e412]: fixture-monthly
                  - generic [ref=e414]:
                    - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e415]:
                      - generic "quiet posture score" [ref=e416]
                      - generic [ref=e419]: AlonIAMTest-traffic-generator
                    - button "quiet posture score PaymentTrafficGenerator" [ref=e420]:
                      - generic "quiet posture score" [ref=e421]
                      - generic [ref=e424]: PaymentTrafficGenerator
                    - button "quiet posture score …BehaviorAnalyzer" [ref=e425]:
                      - generic "quiet posture score" [ref=e426]
                      - generic [ref=e429]: …BehaviorAnalyzer
                    - button "quiet posture score …ConfidenceScorer" [ref=e430]:
                      - generic "quiet posture score" [ref=e431]
                      - generic [ref=e434]: …ConfidenceScorer
                    - button "quiet posture score …CreateCheckpoint" [ref=e435]:
                      - generic "quiet posture score" [ref=e436]
                      - generic [ref=e439]: …CreateCheckpoint
                    - button "quiet posture score …PrismaWebhook" [ref=e440]:
                      - generic "quiet posture score" [ref=e441]
                      - generic [ref=e444]: …PrismaWebhook
                - generic [ref=e446]:
                  - generic [ref=e447]:
                    - text: Regional · S3 / DDB (18)
                    - generic "3 of 18 chips omit this shared prefix" [ref=e448]: SafeRemediate-… ×3
                  - generic [ref=e450]:
                    - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e451]:
                      - generic "quiet posture score" [ref=e452]
                      - generic [ref=e455]: alon-demo-data-bucket-745783559495
                    - button "S3×9" [ref=e456]:
                      - generic [ref=e460]:
                        - text: S3
                        - generic [ref=e461]: ×9
                    - button "DynamoDB×8" [ref=e462]:
                      - generic [ref=e466]:
                        - text: DynamoDB
                        - generic [ref=e467]: ×8
            - generic [ref=e468]:
              - button "Logical groups · members carry the placement (6) Hide members" [expanded] [ref=e469]:
                - generic [ref=e470]: Logical groups · members carry the placement (6)
                - generic [ref=e471]: Hide members
              - generic [ref=e472]:
                - generic [ref=e473]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
                - generic [ref=e474]:
                  - button "Posture not scored fixture-tg-web" [ref=e475]:
                    - generic "Posture not scored" [ref=e476]
                    - generic [ref=e479]: fixture-tg-web
                  - generic [ref=e480]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e481]:
                    - button "SafeRemediate-Test-App-2" [ref=e482]
                    - button "SafeRemediate-Test-Frontend-1" [ref=e483]
                - generic [ref=e484]:
                  - button "Posture not scored fixture-tg-app" [ref=e485]:
                    - generic "Posture not scored" [ref=e486]
                    - generic [ref=e489]: fixture-tg-app
                  - generic [ref=e490]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e491]:
                    - button "SafeRemediate-Test-Frontend-1" [ref=e492]
                    - button "SafeRemediate-Test-Frontend-2" [ref=e493]
                - generic [ref=e494]:
                  - button "Posture not scored fixture-asg-web" [ref=e495]:
                    - generic "Posture not scored" [ref=e496]
                    - generic [ref=e499]: fixture-asg-web
                  - generic [ref=e500]: VPC vpc-0329e985173bed24f · spans eu-west-1b
                  - generic [ref=e501]:
                    - button "SafeRemediate-Test-Frontend-2" [ref=e502]
                    - button "SafeRemediate-Test-App-2" [ref=e503]
                - generic [ref=e504]:
                  - button "Posture not scored fixture-asg-app" [ref=e505]:
                    - generic "Posture not scored" [ref=e506]
                    - generic [ref=e509]: fixture-asg-app
                  - generic [ref=e510]: VPC vpc-0329e985173bed24f · spans eu-west-1a, eu-west-1b
                  - generic [ref=e511]:
                    - button "SafeRemediate-Test-App-2" [ref=e512]
                    - button "SafeRemediate-Test-Frontend-1" [ref=e513]
                - generic [ref=e514]:
                  - button "Posture not scored fixture-aurora" [ref=e515]:
                    - generic "Posture not scored" [ref=e516]
                    - generic [ref=e519]: fixture-aurora
                  - generic [ref=e520]: VPC vpc-0329e985173bed24f · spans eu-west-1a
                  - button "saferemediate-test-db" [ref=e522]
                - generic [ref=e523]:
                  - button "Posture not scored fixture-graph" [ref=e524]:
                    - generic "Posture not scored" [ref=e525]
                    - generic [ref=e528]: fixture-graph
                  - generic [ref=e529]: VPC vpc-0329e985173bed24f · spans eu-west-1a
                  - button "fixture-neptune-1" [ref=e531]
        - generic [ref=e532]:
          - button "Diagnostics 6 serverless · 51 flows ▴" [ref=e533]:
            - generic [ref=e534]: Diagnostics
            - generic [ref=e535]: 6 serverless · 51 flows ▴
          - generic [ref=e536]:
            - generic [ref=e537]:
              - generic [ref=e538]: Serverless compute (6)
              - generic [ref=e539]:
                - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e540]:
                  - generic [ref=e542]:
                    - generic [ref=e544]: AlonIAMTest-traffic-generator
                    - generic [ref=e545]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e546]: "24"
                - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e547]:
                  - generic [ref=e549]:
                    - generic [ref=e551]: PaymentTrafficGenerator
                    - generic [ref=e552]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e553]: "18"
                - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e554]:
                  - generic [ref=e556]:
                    - generic [ref=e558]: SafeRemediate-BehaviorAnalyzer
                    - generic [ref=e559]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e560]: "18"
                - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e561]:
                  - generic [ref=e563]:
                    - generic [ref=e565]: SafeRemediate-ConfidenceScorer
                    - generic [ref=e566]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e567]: "18"
                - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e568]:
                  - generic [ref=e570]:
                    - generic [ref=e572]: SafeRemediate-CreateCheckpoint
                    - generic [ref=e573]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e574]: "18"
                - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e575]:
                  - generic [ref=e577]:
                    - generic [ref=e579]: SafeRemediate-PrismaWebhook
                    - generic [ref=e580]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e581]: "18"
            - generic [ref=e582]:
              - generic [ref=e583]:
                - generic [ref=e584]: Observed traffic — animated arrows above
                - generic [ref=e585]: 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
              - generic [ref=e586]: Listing 36 of 51 — the current lens and selection hide the rest. The counts above are the full evidence.
              - generic [ref=e587]:
                - generic [ref=e588]:
                  - generic [ref=e589]: SafeRemediate-Test-App-2
                  - generic [ref=e590]: →
                  - generic [ref=e591]: vpce-0f983779fff3bbae7
                  - generic [ref=e592]: VPCE
                - generic [ref=e593]:
                  - generic [ref=e594]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e595]: →
                  - generic [ref=e596]: vpce-0f983779fff3bbae7
                  - generic [ref=e597]: VPCE
                - generic [ref=e598]:
                  - generic [ref=e599]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e600]: →
                  - generic [ref=e601]: vpce-04ffe43eea196bf89
                  - generic [ref=e602]: VPCE
                - generic [ref=e603]:
                  - generic [ref=e604]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e605]: →
                  - generic [ref=e606]: vpce-0f983779fff3bbae7
                  - generic [ref=e607]: VPCE
                - generic [ref=e608]:
                  - generic [ref=e609]: SafeRemediate-Test-App-2
                  - generic [ref=e610]: →
                  - generic [ref=e611]: Internet (via IGW)
                  - generic [ref=e612]: egress · 3 (ext 3)
                - generic [ref=e613]:
                  - generic [ref=e614]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e615]: →
                  - generic [ref=e616]: Internet (via IGW)
                  - generic [ref=e617]: egress · 532 (ext 532)
                - generic [ref=e618]:
                  - generic [ref=e619]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e620]: →
                  - generic [ref=e621]: Internet (via IGW)
                  - generic [ref=e622]: egress · 588 (ext 588)
                - generic [ref=e623]:
                  - generic [ref=e624]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e625]: →
                  - generic [ref=e626]: saferemediate-test-db
                  - generic [ref=e627]: RDS · 5432
                - generic [ref=e628]:
                  - generic [ref=e629]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e630]: →
                  - generic [ref=e631]: saferemediate-test-db
                  - generic [ref=e632]: RDS · 3306
                - generic [ref=e633]:
                  - generic [ref=e634]: SafeRemediate-Test-App-2
                  - generic [ref=e635]: →
                  - generic [ref=e636]: saferemediate-test-db
                  - generic [ref=e637]: RDS
                - generic [ref=e638]:
                  - generic [ref=e639]: fixture-tg-web
                  - generic [ref=e640]: →
                  - generic [ref=e641]: SafeRemediate-Test-App-2
                  - generic [ref=e642]: TARGETS
                - generic [ref=e643]:
                  - generic [ref=e644]: fixture-tg-web
                  - generic [ref=e645]: →
                  - generic [ref=e646]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e647]: TARGETS
                - generic [ref=e648]: + 24 more flows
            - generic [ref=e649]:
              - generic [ref=e650]: Encoding
              - generic [ref=e651]:
                - generic [ref=e654]: Worst (carmine halo + pulse)
                - generic [ref=e657]: High / elevated (ring only)
                - generic [ref=e658]:
                  - generic [ref=e659]: ♛
                  - generic [ref=e660]: Crown-jewel halo
                - generic [ref=e663]: Clean · remediated (teal ring)
                - generic [ref=e666]: Stale (dimmed)
                - generic [ref=e669]: Coverage gap (not collected)
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
    - complementary [ref=e671]:
      - generic [ref=e672]:
        - generic [ref=e673]:
          - heading "Service index" [level=2] [ref=e674]
          - generic [ref=e675]: "41"
        - generic [ref=e676]:
          - img [ref=e677]
          - searchbox "Find service in topology" [ref=e680]
        - button "Filters" [ref=e683]:
          - img [ref=e684]
          - text: Filters
      - list [ref=e686]:
        - listitem [ref=e687]:
          - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e688]:
            - generic [ref=e689]:
              - img [ref=e691]
              - generic [ref=e693]:
                - generic [ref=e694]:
                  - generic [ref=e695]: SafeRemediate-Test-Frontend-1
                  - generic "Current graph data" [ref=e696]
                - generic [ref=e698]: EC2 · eu-west-1a · web
                - generic [ref=e699]:
                  - generic [ref=e700]: 3 in · 4 out
                  - generic [ref=e701]:
                    - img [ref=e702]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e705]:
          - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e706]:
            - generic [ref=e707]:
              - img [ref=e709]
              - generic [ref=e711]:
                - generic [ref=e712]:
                  - generic [ref=e713]: SafeRemediate-Test-App-2
                  - generic "Current graph data" [ref=e714]
                - generic [ref=e716]: EC2 · eu-west-1b · app
                - generic [ref=e717]:
                  - generic [ref=e718]: 3 in · 3 out
                  - generic [ref=e719]:
                    - img [ref=e720]
                    - text: Jul 9, 10:40 AM
        - listitem [ref=e723]:
          - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e724]:
            - generic [ref=e725]:
              - img [ref=e727]
              - generic [ref=e729]:
                - generic [ref=e730]:
                  - generic [ref=e731]: SafeRemediate-Test-Frontend-2
                  - generic "Current graph data" [ref=e732]
                - generic [ref=e734]: EC2 · eu-west-1b · web
                - generic [ref=e735]:
                  - generic [ref=e736]: 2 in · 3 out
                  - generic [ref=e737]:
                    - img [ref=e738]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e741]:
          - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e742]:
            - generic [ref=e743]:
              - img [ref=e745]
              - generic [ref=e747]:
                - generic [ref=e748]:
                  - generic [ref=e749]: alon-demo-data-bucket-745783559495
                  - generic "Current graph data" [ref=e750]
                - generic [ref=e752]: S3 · eu-west-1 · regional
                - generic [ref=e753]:
                  - generic [ref=e754]: 4 in · 0 out
                  - generic [ref=e755]:
                    - img [ref=e756]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e759]:
          - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e760]:
            - generic [ref=e761]:
              - img [ref=e763]
              - generic [ref=e765]:
                - generic [ref=e766]:
                  - generic [ref=e767]: saferemediate-test-db
                  - generic "Current graph data" [ref=e768]
                - generic [ref=e770]: RDS · eu-west-1a · data
                - generic [ref=e771]:
                  - generic [ref=e772]: 4 in · 0 out
                  - generic [ref=e773]:
                    - img [ref=e774]
                    - text: Jul 6, 03:05 PM
        - listitem [ref=e777]:
          - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e778]:
            - generic [ref=e779]:
              - img [ref=e781]
              - generic [ref=e783]:
                - generic [ref=e784]:
                  - generic [ref=e785]: AlonIAMTest-traffic-generator
                  - generic "Current graph data" [ref=e786]
                - generic [ref=e788]: Lambda · eu-west-1 · regional
                - generic [ref=e789]:
                  - generic [ref=e790]: 2 in · 1 out
                  - generic [ref=e791]:
                    - img [ref=e792]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e795]:
          - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e796]:
            - generic [ref=e797]:
              - img [ref=e799]
              - generic [ref=e801]:
                - generic [ref=e802]:
                  - generic [ref=e803]: PaymentTrafficGenerator
                  - generic "Current graph data" [ref=e804]
                - generic [ref=e806]: Lambda · eu-west-1 · regional
                - generic [ref=e807]:
                  - generic [ref=e808]: 2 in · 1 out
                  - generic [ref=e809]:
                    - img [ref=e810]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e813]:
          - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e814]:
            - generic [ref=e815]:
              - img [ref=e817]
              - generic [ref=e819]:
                - generic [ref=e820]:
                  - generic [ref=e821]: SafeRemediate-BehaviorAnalyzer
                  - generic "Current graph data" [ref=e822]
                - generic [ref=e824]: Lambda · eu-west-1 · regional
                - generic [ref=e825]:
                  - generic [ref=e826]: 2 in · 1 out
                  - generic [ref=e827]:
                    - img [ref=e828]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e831]:
          - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e832]:
            - generic [ref=e833]:
              - img [ref=e835]
              - generic [ref=e837]:
                - generic [ref=e838]:
                  - generic [ref=e839]: SafeRemediate-ConfidenceScorer
                  - generic "Current graph data" [ref=e840]
                - generic [ref=e842]: Lambda · eu-west-1 · regional
                - generic [ref=e843]:
                  - generic [ref=e844]: 2 in · 1 out
                  - generic [ref=e845]:
                    - img [ref=e846]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e849]:
          - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e850]:
            - generic [ref=e851]:
              - img [ref=e853]
              - generic [ref=e855]:
                - generic [ref=e856]:
                  - generic [ref=e857]: fixture-asg-app
                  - generic "Current graph data" [ref=e858]
                - generic [ref=e860]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e861]:
                  - generic [ref=e862]: 0 in · 2 out
                  - generic [ref=e863]:
                    - img [ref=e864]
                    - text: No runtime timestamp
        - listitem [ref=e867]:
          - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e868]:
            - generic [ref=e869]:
              - img [ref=e871]
              - generic [ref=e873]:
                - generic [ref=e874]:
                  - generic [ref=e875]: fixture-asg-web
                  - generic "Current graph data" [ref=e876]
                - generic [ref=e878]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e879]:
                  - generic [ref=e880]: 0 in · 2 out
                  - generic [ref=e881]:
                    - img [ref=e882]
                    - text: No runtime timestamp
        - listitem [ref=e885]:
          - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e886]:
            - generic [ref=e887]:
              - img [ref=e889]
              - generic [ref=e891]:
                - generic [ref=e892]:
                  - generic [ref=e893]: fixture-daily
                  - generic "Current graph data" [ref=e894]
                - generic [ref=e896]: EventBridge · eu-west-1 · regional
                - generic [ref=e897]:
                  - generic [ref=e898]: 0 in · 2 out
                  - generic [ref=e899]:
                    - img [ref=e900]
                    - text: No runtime timestamp
        - listitem [ref=e903]:
          - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e904]:
            - generic [ref=e905]:
              - img [ref=e907]
              - generic [ref=e909]:
                - generic [ref=e910]:
                  - generic [ref=e911]: fixture-every_6h
                  - generic "Current graph data" [ref=e912]
                - generic [ref=e914]: EventBridge · eu-west-1 · regional
                - generic [ref=e915]:
                  - generic [ref=e916]: 0 in · 2 out
                  - generic [ref=e917]:
                    - img [ref=e918]
                    - text: No runtime timestamp
        - listitem [ref=e921]:
          - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e922]:
            - generic [ref=e923]:
              - img [ref=e925]
              - generic [ref=e927]:
                - generic [ref=e928]:
                  - generic [ref=e929]: fixture-frequent
                  - generic "Current graph data" [ref=e930]
                - generic [ref=e932]: EventBridge · eu-west-1 · regional
                - generic [ref=e933]:
                  - generic [ref=e934]: 0 in · 2 out
                  - generic [ref=e935]:
                    - img [ref=e936]
                    - text: No runtime timestamp
        - listitem [ref=e939]:
          - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e940]:
            - generic [ref=e941]:
              - img [ref=e943]
              - generic [ref=e945]:
                - generic [ref=e946]:
                  - generic [ref=e947]: fixture-monthly
                  - generic "Current graph data" [ref=e948]
                - generic [ref=e950]: EventBridge · eu-west-1 · regional
                - generic [ref=e951]:
                  - generic [ref=e952]: 0 in · 2 out
                  - generic [ref=e953]:
                    - img [ref=e954]
                    - text: No runtime timestamp
        - listitem [ref=e957]:
          - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e958]:
            - generic [ref=e959]:
              - img [ref=e961]
              - generic [ref=e963]:
                - generic [ref=e964]:
                  - generic [ref=e965]: fixture-nightly_burst
                  - generic "Current graph data" [ref=e966]
                - generic [ref=e968]: EventBridge · eu-west-1 · regional
                - generic [ref=e969]:
                  - generic [ref=e970]: 0 in · 2 out
                  - generic [ref=e971]:
                    - img [ref=e972]
                    - text: No runtime timestamp
        - listitem [ref=e975]:
          - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e976]:
            - generic [ref=e977]:
              - img [ref=e979]
              - generic [ref=e981]:
                - generic [ref=e982]:
                  - generic [ref=e983]: fixture-tg-app
                  - generic "Current graph data" [ref=e984]
                - generic [ref=e986]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e987]:
                  - generic [ref=e988]: 0 in · 2 out
                  - generic [ref=e989]:
                    - img [ref=e990]
                    - text: No runtime timestamp
        - listitem [ref=e993]:
          - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e994]:
            - generic [ref=e995]:
              - img [ref=e997]
              - generic [ref=e999]:
                - generic [ref=e1000]:
                  - generic [ref=e1001]: fixture-tg-web
                  - generic "Current graph data" [ref=e1002]
                - generic [ref=e1004]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e1005]:
                  - generic [ref=e1006]: 0 in · 2 out
                  - generic [ref=e1007]:
                    - img [ref=e1008]
                    - text: No runtime timestamp
        - listitem [ref=e1011]:
          - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1012]:
            - generic [ref=e1013]:
              - img [ref=e1015]
              - generic [ref=e1017]:
                - generic [ref=e1018]:
                  - generic [ref=e1019]: fixture-weekly
                  - generic "Current graph data" [ref=e1020]
                - generic [ref=e1022]: EventBridge · eu-west-1 · regional
                - generic [ref=e1023]:
                  - generic [ref=e1024]: 0 in · 2 out
                  - generic [ref=e1025]:
                    - img [ref=e1026]
                    - text: No runtime timestamp
        - listitem [ref=e1029]:
          - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1030]:
            - generic [ref=e1031]:
              - img [ref=e1033]
              - generic [ref=e1035]:
                - generic [ref=e1036]:
                  - generic [ref=e1037]: SafeRemediate-CreateCheckpoint
                  - generic "Current graph data" [ref=e1038]
                - generic [ref=e1040]: Lambda · eu-west-1 · regional
                - generic [ref=e1041]:
                  - generic [ref=e1042]: 2 in · 0 out
                  - generic [ref=e1043]:
                    - img [ref=e1044]
                    - text: No runtime timestamp
        - listitem [ref=e1047]:
          - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1048]:
            - generic [ref=e1049]:
              - img [ref=e1051]
              - generic [ref=e1053]:
                - generic [ref=e1054]:
                  - generic [ref=e1055]: SafeRemediate-PrismaWebhook
                  - generic "Current graph data" [ref=e1056]
                - generic [ref=e1058]: Lambda · eu-west-1 · regional
                - generic [ref=e1059]:
                  - generic [ref=e1060]: 2 in · 0 out
                  - generic [ref=e1061]:
                    - img [ref=e1062]
                    - text: No runtime timestamp
        - listitem [ref=e1065]:
          - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1066]:
            - generic [ref=e1067]:
              - img [ref=e1069]
              - generic [ref=e1071]:
                - generic [ref=e1072]:
                  - generic [ref=e1073]: fixture-aurora
                  - generic "Current graph data" [ref=e1074]
                - generic [ref=e1076]: RDS · eu-west-1 · VPC
                - generic [ref=e1077]:
                  - generic [ref=e1078]: 0 in · 1 out
                  - generic [ref=e1079]:
                    - img [ref=e1080]
                    - text: No runtime timestamp
        - listitem [ref=e1083]:
          - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1084]:
            - generic [ref=e1085]:
              - img [ref=e1087]
              - generic [ref=e1089]:
                - generic [ref=e1090]:
                  - generic [ref=e1091]: fixture-graph
                  - generic "Current graph data" [ref=e1092]
                - generic [ref=e1094]: Neptune · eu-west-1 · VPC
                - generic [ref=e1095]:
                  - generic [ref=e1096]: 0 in · 1 out
                  - generic [ref=e1097]:
                    - img [ref=e1098]
                    - text: No runtime timestamp
        - listitem [ref=e1101]:
          - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e1102]:
            - generic [ref=e1103]:
              - img [ref=e1105]
              - generic [ref=e1107]:
                - generic [ref=e1108]:
                  - generic [ref=e1109]: fixture-neptune-1
                  - generic "Current graph data" [ref=e1110]
                - generic [ref=e1112]: Neptune · eu-west-1a · data
                - generic [ref=e1113]:
                  - generic [ref=e1114]: 1 in · 0 out
                  - generic [ref=e1115]:
                    - img [ref=e1116]
                    - text: No runtime timestamp
        - listitem [ref=e1119]:
          - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1120]:
            - generic [ref=e1121]:
              - img [ref=e1123]
              - generic [ref=e1126]:
                - generic [ref=e1127]:
                  - generic [ref=e1128]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                  - generic "Current graph data" [ref=e1129]
                - generic [ref=e1131]: S3 · eu-west-1 · regional
                - generic [ref=e1132]:
                  - generic [ref=e1133]: 0 in · 0 out
                  - generic [ref=e1134]:
                    - img [ref=e1135]
                    - text: No runtime timestamp
        - listitem [ref=e1138]:
          - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1139]:
            - generic [ref=e1140]:
              - img [ref=e1142]
              - generic [ref=e1145]:
                - generic [ref=e1146]:
                  - generic [ref=e1147]: cyntro-demo-analytics-745783559495
                  - generic "Current graph data" [ref=e1148]
                - generic [ref=e1150]: S3 · eu-west-1 · regional
                - generic [ref=e1151]:
                  - generic [ref=e1152]: 0 in · 0 out
                  - generic [ref=e1153]:
                    - img [ref=e1154]
                    - text: No runtime timestamp
        - listitem [ref=e1157]:
          - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1158]:
            - generic [ref=e1159]:
              - img [ref=e1161]
              - generic [ref=e1164]:
                - generic [ref=e1165]:
                  - generic [ref=e1166]: cyntro-demo-eu
                  - generic "Current graph data" [ref=e1167]
                - generic [ref=e1169]: S3 · eu-west-1 · regional
                - generic [ref=e1170]:
                  - generic [ref=e1171]: 0 in · 0 out
                  - generic [ref=e1172]:
                    - img [ref=e1173]
                    - text: No runtime timestamp
        - listitem [ref=e1176]:
          - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1177]:
            - generic [ref=e1178]:
              - img [ref=e1180]
              - generic [ref=e1183]:
                - generic [ref=e1184]:
                  - generic [ref=e1185]: cyntro-demo-prod-data-745783559495
                  - generic "Current graph data" [ref=e1186]
                - generic [ref=e1188]: S3 · eu-west-1 · regional
                - generic [ref=e1189]:
                  - generic [ref=e1190]: 0 in · 0 out
                  - generic [ref=e1191]:
                    - img [ref=e1192]
                    - text: No runtime timestamp
        - listitem [ref=e1195]:
          - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1196]:
            - generic [ref=e1197]:
              - img [ref=e1199]
              - generic [ref=e1202]:
                - generic [ref=e1203]:
                  - generic [ref=e1204]: cyntronewtestbucket
                  - generic "Current graph data" [ref=e1205]
                - generic [ref=e1207]: S3 · eu-west-1 · regional
                - generic [ref=e1208]:
                  - generic [ref=e1209]: 0 in · 0 out
                  - generic [ref=e1210]:
                    - img [ref=e1211]
                    - text: No runtime timestamp
        - listitem [ref=e1214]:
          - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1215]:
            - generic [ref=e1216]:
              - img [ref=e1218]
              - generic [ref=e1221]:
                - generic [ref=e1222]:
                  - generic [ref=e1223]: cyntrotest2
                  - generic "Current graph data" [ref=e1224]
                - generic [ref=e1226]: S3 · eu-west-1 · regional
                - generic [ref=e1227]:
                  - generic [ref=e1228]: 0 in · 0 out
                  - generic [ref=e1229]:
                    - img [ref=e1230]
                    - text: No runtime timestamp
        - listitem [ref=e1233]:
          - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1234]:
            - generic [ref=e1235]:
              - img [ref=e1237]
              - generic [ref=e1240]:
                - generic [ref=e1241]:
                  - generic [ref=e1242]: impaciq-findings
                  - generic "Current graph data" [ref=e1243]
                - generic [ref=e1245]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1246]:
                  - generic [ref=e1247]: 0 in · 0 out
                  - generic [ref=e1248]:
                    - img [ref=e1249]
                    - text: No runtime timestamp
        - listitem [ref=e1252]:
          - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1253]:
            - generic [ref=e1254]:
              - img [ref=e1256]
              - generic [ref=e1259]:
                - generic [ref=e1260]:
                  - generic [ref=e1261]: impaciq-remediation-history
                  - generic "Current graph data" [ref=e1262]
                - generic [ref=e1264]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1265]:
                  - generic [ref=e1266]: 0 in · 0 out
                  - generic [ref=e1267]:
                    - img [ref=e1268]
                    - text: No runtime timestamp
        - listitem [ref=e1271]:
          - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1272]:
            - generic [ref=e1273]:
              - img [ref=e1275]
              - generic [ref=e1278]:
                - generic [ref=e1279]:
                  - generic [ref=e1280]: impaciq-scan-status
                  - generic "Current graph data" [ref=e1281]
                - generic [ref=e1283]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1284]:
                  - generic [ref=e1285]: 0 in · 0 out
                  - generic [ref=e1286]:
                    - img [ref=e1287]
                    - text: No runtime timestamp
        - listitem [ref=e1290]:
          - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1291]:
            - generic [ref=e1292]:
              - img [ref=e1294]
              - generic [ref=e1297]:
                - generic [ref=e1298]:
                  - generic [ref=e1299]: least_privilege_role_state
                  - generic "Current graph data" [ref=e1300]
                - generic [ref=e1302]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1303]:
                  - generic [ref=e1304]: 0 in · 0 out
                  - generic [ref=e1305]:
                    - img [ref=e1306]
                    - text: No runtime timestamp
        - listitem [ref=e1309]:
          - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1310]:
            - generic [ref=e1311]:
              - img [ref=e1313]
              - generic [ref=e1316]:
                - generic [ref=e1317]:
                  - generic [ref=e1318]: saferemediate-access-logs-745783559495
                  - generic "Current graph data" [ref=e1319]
                - generic [ref=e1321]: S3 · eu-west-1 · regional
                - generic [ref=e1322]:
                  - generic [ref=e1323]: 0 in · 0 out
                  - generic [ref=e1324]:
                    - img [ref=e1325]
                    - text: No runtime timestamp
        - listitem [ref=e1328]:
          - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1329]:
            - generic [ref=e1330]:
              - img [ref=e1332]
              - generic [ref=e1335]:
                - generic [ref=e1336]:
                  - generic [ref=e1337]: saferemediate-demo-cloudtrail-745783559495
                  - generic "Current graph data" [ref=e1338]
                - generic [ref=e1340]: S3 · eu-west-1 · regional
                - generic [ref=e1341]:
                  - generic [ref=e1342]: 0 in · 0 out
                  - generic [ref=e1343]:
                    - img [ref=e1344]
                    - text: No runtime timestamp
        - listitem [ref=e1347]:
          - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1348]:
            - generic [ref=e1349]:
              - img [ref=e1351]
              - generic [ref=e1354]:
                - generic [ref=e1355]:
                  - generic [ref=e1356]: SafeRemediate-Executions
                  - generic "Current graph data" [ref=e1357]
                - generic [ref=e1359]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1360]:
                  - generic [ref=e1361]: 0 in · 0 out
                  - generic [ref=e1362]:
                    - img [ref=e1363]
                    - text: No runtime timestamp
        - listitem [ref=e1366]:
          - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1367]:
            - generic [ref=e1368]:
              - img [ref=e1370]
              - generic [ref=e1373]:
                - generic [ref=e1374]:
                  - generic [ref=e1375]: SafeRemediate-Findings
                  - generic "Current graph data" [ref=e1376]
                - generic [ref=e1378]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1379]:
                  - generic [ref=e1380]: 0 in · 0 out
                  - generic [ref=e1381]:
                    - img [ref=e1382]
                    - text: No runtime timestamp
        - listitem [ref=e1385]:
          - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1386]:
            - generic [ref=e1387]:
              - img [ref=e1389]
              - generic [ref=e1392]:
                - generic [ref=e1393]:
                  - generic [ref=e1394]: saferemediate-logs-745783559495
                  - generic "Current graph data" [ref=e1395]
                - generic [ref=e1397]: S3 · eu-west-1 · regional
                - generic [ref=e1398]:
                  - generic [ref=e1399]: 0 in · 0 out
                  - generic [ref=e1400]:
                    - img [ref=e1401]
                    - text: No runtime timestamp
        - listitem [ref=e1404]:
          - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1405]:
            - generic [ref=e1406]:
              - img [ref=e1408]
              - generic [ref=e1411]:
                - generic [ref=e1412]:
                  - generic [ref=e1413]: SafeRemediate-Simulations
                  - generic "Current graph data" [ref=e1414]
                - generic [ref=e1416]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1417]:
                  - generic [ref=e1418]: 0 in · 0 out
                  - generic [ref=e1419]:
                    - img [ref=e1420]
                    - text: No runtime timestamp
        - listitem [ref=e1423]:
          - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1424]:
            - generic [ref=e1425]:
              - img [ref=e1427]
              - generic [ref=e1430]:
                - generic [ref=e1431]:
                  - generic [ref=e1432]: sg_state
                  - generic "Current graph data" [ref=e1433]
                - generic [ref=e1435]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1436]:
                  - generic [ref=e1437]: 0 in · 0 out
                  - generic [ref=e1438]:
                    - img [ref=e1439]
                    - text: No runtime timestamp
    - contentinfo [ref=e1442]:
      - text: Live read from
      - generic [ref=e1443]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1444]
  - dialog [active] [ref=e1446]:
    - paragraph [ref=e1447]: 9 workloads leaving the VPC
    - paragraph [ref=e1448]: "Route is configured (route tables): NAT nat-fixture0a1b2c3d4 → IGW igw-03bb3f19b706abbc4. Counts are observed. The payload names no destination identities, so these addresses are evidence, not an inventory of services."
    - list [ref=e1449]:
      - listitem [ref=e1450]:
        - text: i-0e9b891793b5b2dbd · 3 distinct · all 3 shown
        - generic [ref=e1451]: — 54.217.69.183, 54.217.245.46, 3.253.225.145
      - listitem [ref=e1452]:
        - text: i-0f51b8b7ad29a359b · 532 distinct · 5 of 532 shown
        - generic [ref=e1453]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1454]:
        - text: i-03c72e120ff96216c · 588 distinct · 5 of 588 shown
        - generic [ref=e1455]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1456]:
        - text: i-0aa725bf8ff4c2001 · 927 distinct · 5 of 927 shown
        - generic [ref=e1457]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1458]:
        - text: i-0d4186a6b477dcd55 · 20 distinct · 5 of 20 shown
        - generic [ref=e1459]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1460]:
        - text: i-009a28b5cab755850 · 20 distinct · 5 of 20 shown
        - generic [ref=e1461]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1462]:
        - text: i-0e4edb2adb28e4f16 · 23 distinct · 5 of 23 shown
        - generic [ref=e1463]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1464]:
        - text: i-02a0da7f8373e6c8f · 32 distinct · 5 of 32 shown
        - generic [ref=e1465]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1466]:
        - text: i-0ee29afa0048943e0 · 434 distinct · 5 of 434 shown
        - generic [ref=e1467]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
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
      |           ^ Error: the external-destinations panel never settled opaque and on top (1024x720 · expanded screenshot): {"effectiveOpacity":1,"covered":[{"x":640,"y":16,"hit":"span.text-[10px] font-bold uppercase tracking"}]}
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