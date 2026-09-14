# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-egress-map-fixture.spec.ts >> the IGW continues into the external lane at 1024x720 · glance
- Location: tests/integration/topology-estate-egress-map-fixture.spec.ts:148:9

# Error details

```
Error: the external lane overlaps data-tier cell 1 at 1024x720·glance

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 8600.78125
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
          - button "Glance" [active] [ref=e80]
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
          - generic [ref=e188]: ☁ AWS Cloud · acct 745783559495
          - generic [ref=e189]:
            - generic [ref=e190]: Region · eu-west-1
            - generic [ref=e191]:
              - generic [ref=e192]:
                - generic [ref=e193]:
                  - generic "vpc-0329e985173bed24f" [ref=e194]: VPC · vpc-0329e985173bed24f
                  - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e195]: SafeRemediate-Test-… ×3
                - generic [ref=e198]:
                  - generic [ref=e199]:
                    - generic "eu-west-1a" [ref=e200]: Availability Zone · eu-west-1a
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e201]':
                      - generic [ref=e202]:
                        - generic [ref=e203]: Public · SafeRemediate-Test-Public-1
                        - generic [ref=e204]: 10.0.1.0/24
                      - button "high posture score …Frontend-1" [ref=e206]:
                        - generic "high posture score" [ref=e207]
                        - generic [ref=e210]: …Frontend-1
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e211]':
                      - generic [ref=e212]:
                        - generic [ref=e213]: Private · SafeRemediate-Test-Private-App-1
                        - generic [ref=e214]: 10.0.10.0/24
                      - generic [ref=e215]: No workloads
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e216]':
                      - generic [ref=e217]:
                        - generic [ref=e218]: Data · SafeRemediate-Test-Private-DB-1
                        - generic [ref=e219]: 10.0.20.0/24
                      - generic [ref=e220]:
                        - button "quiet posture score saferemediate-test-db" [ref=e221]:
                          - generic "quiet posture score" [ref=e222]
                          - generic [ref=e225]: saferemediate-test-db
                        - button "Posture not scored fixture-neptune-1" [ref=e226]:
                          - generic "Posture not scored" [ref=e227]
                          - generic [ref=e230]: fixture-neptune-1
                  - generic [ref=e231]:
                    - generic "eu-west-1b" [ref=e232]: Availability Zone · eu-west-1b
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e233]':
                      - generic [ref=e234]:
                        - generic [ref=e235]: Public · SafeRemediate-Test-Public-2
                        - generic [ref=e236]: 10.0.2.0/24
                      - button "high posture score …Frontend-2" [ref=e238]:
                        - generic "high posture score" [ref=e239]
                        - generic [ref=e242]: …Frontend-2
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e243]':
                      - generic [ref=e244]:
                        - generic [ref=e245]: Private · SafeRemediate-Test-Private-App-2
                        - generic [ref=e246]: 10.0.11.0/24
                      - button "quiet posture score …App-2" [ref=e248]:
                        - generic "quiet posture score" [ref=e249]
                        - generic [ref=e252]: …App-2
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e253]':
                      - generic [ref=e254]:
                        - generic [ref=e255]: Data · SafeRemediate-Test-Private-DB-2
                        - generic [ref=e256]: 10.0.21.0/24
                      - generic [ref=e257]: No workloads
              - generic [ref=e258]:
                - generic [ref=e259]: VPC boundary
                - generic [ref=e260]:
                  - generic [ref=e261]: ↑ Internet
                  - generic [ref=e262]:
                    - button "IGW alon-prod-igw" [ref=e263]:
                      - img [ref=e265]
                      - generic [ref=e268]: IGW
                      - generic [ref=e269]: alon-prod-igw
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e270]: "egress: 9 workloads"
                - generic [ref=e272]:
                  - generic [ref=e273]: Endpoints (4)
                  - generic [ref=e274]:
                    - button "VPCE IF EC2 Messages" [ref=e275]:
                      - img [ref=e277]
                      - generic [ref=e281]: VPCE
                      - generic [ref=e282]: IF
                      - generic [ref=e283]: EC2 Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e284]: "use: not observed"
                  - generic [ref=e285]:
                    - button "VPCE GW Amazon S3" [ref=e286]:
                      - img [ref=e288]
                      - generic [ref=e292]: VPCE
                      - generic [ref=e293]: GW
                      - generic [ref=e294]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e295]: "use: not observed"
                  - generic [ref=e296]:
                    - button "VPCE IF AWS Systems Manager" [ref=e297]:
                      - img [ref=e299]
                      - generic [ref=e303]: VPCE
                      - generic [ref=e304]: IF
                      - generic [ref=e305]: AWS Systems Manager
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e306]: "use: 3 workloads"
                  - generic [ref=e307]:
                    - button "VPCE IF SSM Messages" [ref=e308]:
                      - img [ref=e310]
                      - generic [ref=e314]: VPCE
                      - generic [ref=e315]: IF
                      - generic [ref=e316]: SSM Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e317]: "use: 1 workload"
              - generic [ref=e318]:
                - generic [ref=e319]: Outside the VPC
                - generic [ref=e320]: Destinations observed this generation · NAT → IGW is configured routing
                - generic [ref=e321]:
                  - generic "S3 — attributed by the flow-log evidence" [ref=e322]:
                    - generic [ref=e323]: S3
                    - generic [ref=e324]: AWS service
                  - generic "3.253.225.145 — an address; the evidence names no service" [ref=e325]:
                    - generic [ref=e326]: 3.253.225.145
                    - generic [ref=e327]: address
                  - generic "3.5.67.254 — an address; the evidence names no service" [ref=e328]:
                    - generic [ref=e329]: 3.5.67.254
                    - generic [ref=e330]: address · 8 workloads
                  - generic "3.5.69.34 — an address; the evidence names no service" [ref=e331]:
                    - generic [ref=e332]: 3.5.69.34
                    - generic [ref=e333]: address · 8 workloads
                  - generic "3.5.72.119 — an address; the evidence names no service" [ref=e334]:
                    - generic [ref=e335]: 3.5.72.119
                    - generic [ref=e336]: address · 8 workloads
                  - generic "3.5.72.73 — an address; the evidence names no service" [ref=e337]:
                    - generic [ref=e338]: 3.5.72.73
                    - generic [ref=e339]: address · 8 workloads
                  - button "+3 more" [ref=e340]
                - generic [ref=e342]:
                  - generic [ref=e343]:
                    - generic [ref=e344]: 9 workloads
                    - generic [ref=e347]: ▸
                    - generic [ref=e348]:
                      - generic "NAT nat-fixture0a1b2c3d4" [ref=e349]:
                        - text: NAT
                        - generic [ref=e350]: nat-fixture0a1b2c3d4
                      - generic [ref=e353]: ▸
                    - generic [ref=e354]:
                      - generic "IGW igw-03bb3f19b706abbc4" [ref=e355]:
                        - text: IGW
                        - generic [ref=e356]: igw-03bb3f19b706abbc4
                      - generic [ref=e359]: ▸
                  - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [ref=e360]:
                    - img [ref=e362]
                    - generic [ref=e367]:
                      - generic [ref=e368]: External destinations
                      - generic [ref=e369]: 9 workloads · up to 2579 distinct · addresses sampled
              - generic [ref=e370]:
                - generic [ref=e372]: Not in this VPC
                - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e374]:
                  - generic [ref=e375]: ALB · alon-prod-3tier-alb
                  - generic [ref=e376]: VPC vpc-086bcc2186…
                  - generic [ref=e377]: · payment-production
              - generic [ref=e379]:
                - generic [ref=e380]:
                  - generic [ref=e381]:
                    - generic [ref=e382]: Lambda runtime (6)
                    - generic [ref=e383]:
                      - text: outside subnet grid · 6 attachment unverified
                      - generic "4 of 12 chips omit this shared prefix" [ref=e384]: · SafeRemediate-… ×4
                    - button "S3 traffic from 4 of 6 functions" [ref=e386]
                  - generic [ref=e387]:
                    - generic [ref=e388]: Triggers (6)
                    - generic [ref=e389]:
                      - button "Posture not scored fixture-frequent" [ref=e390]:
                        - generic "Posture not scored" [ref=e391]
                        - generic [ref=e394]: fixture-frequent
                      - button "Posture not scored fixture-every_6h" [ref=e395]:
                        - generic "Posture not scored" [ref=e396]
                        - generic [ref=e399]: fixture-every_6h
                      - button "Posture not scored fixture-daily" [ref=e400]:
                        - generic "Posture not scored" [ref=e401]
                        - generic [ref=e404]: fixture-daily
                      - button "Posture not scored fixture-nightly_burst" [ref=e405]:
                        - generic "Posture not scored" [ref=e406]
                        - generic [ref=e409]: fixture-nightly_burst
                      - button "Posture not scored fixture-weekly" [ref=e410]:
                        - generic "Posture not scored" [ref=e411]
                        - generic [ref=e414]: fixture-weekly
                      - button "Posture not scored fixture-monthly" [ref=e415]:
                        - generic "Posture not scored" [ref=e416]
                        - generic [ref=e419]: fixture-monthly
                  - generic [ref=e421]:
                    - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e422]:
                      - generic "quiet posture score" [ref=e423]
                      - generic [ref=e426]: AlonIAMTest-traffic-generator
                    - button "quiet posture score PaymentTrafficGenerator" [ref=e427]:
                      - generic "quiet posture score" [ref=e428]
                      - generic [ref=e431]: PaymentTrafficGenerator
                    - button "quiet posture score …BehaviorAnalyzer" [ref=e432]:
                      - generic "quiet posture score" [ref=e433]
                      - generic [ref=e436]: …BehaviorAnalyzer
                    - button "quiet posture score …ConfidenceScorer" [ref=e437]:
                      - generic "quiet posture score" [ref=e438]
                      - generic [ref=e441]: …ConfidenceScorer
                    - button "quiet posture score …CreateCheckpoint" [ref=e442]:
                      - generic "quiet posture score" [ref=e443]
                      - generic [ref=e446]: …CreateCheckpoint
                    - button "quiet posture score …PrismaWebhook" [ref=e447]:
                      - generic "quiet posture score" [ref=e448]
                      - generic [ref=e451]: …PrismaWebhook
                - generic [ref=e453]:
                  - generic [ref=e454]:
                    - text: Regional · S3 / DDB (18)
                    - generic "3 of 18 chips omit this shared prefix" [ref=e455]: SafeRemediate-… ×3
                  - generic [ref=e457]:
                    - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e458]:
                      - generic "quiet posture score" [ref=e459]
                      - generic [ref=e462]: alon-demo-data-bucket-745783559495
                    - button "S3×9" [ref=e463]:
                      - generic [ref=e467]:
                        - text: S3
                        - generic [ref=e468]: ×9
                    - button "DynamoDB×8" [ref=e469]:
                      - generic [ref=e473]:
                        - text: DynamoDB
                        - generic [ref=e474]: ×8
            - button "Logical groups · members carry the placement (6) Show members" [ref=e476]:
              - generic [ref=e477]: Logical groups · members carry the placement (6)
              - generic [ref=e478]: Show members
        - generic [ref=e479]:
          - button "Diagnostics 6 serverless · 51 flows ▴" [ref=e480]:
            - generic [ref=e481]: Diagnostics
            - generic [ref=e482]: 6 serverless · 51 flows ▴
          - generic [ref=e483]:
            - generic [ref=e484]:
              - generic [ref=e485]: Serverless compute (6)
              - generic [ref=e486]:
                - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e487]:
                  - generic [ref=e489]:
                    - generic [ref=e491]: AlonIAMTest-traffic-generator
                    - generic [ref=e492]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e493]: "24"
                - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e494]:
                  - generic [ref=e496]:
                    - generic [ref=e498]: PaymentTrafficGenerator
                    - generic [ref=e499]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e500]: "18"
                - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e501]:
                  - generic [ref=e503]:
                    - generic [ref=e505]: SafeRemediate-BehaviorAnalyzer
                    - generic [ref=e506]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e507]: "18"
                - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e508]:
                  - generic [ref=e510]:
                    - generic [ref=e512]: SafeRemediate-ConfidenceScorer
                    - generic [ref=e513]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e514]: "18"
                - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e515]:
                  - generic [ref=e517]:
                    - generic [ref=e519]: SafeRemediate-CreateCheckpoint
                    - generic [ref=e520]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e521]: "18"
                - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e522]:
                  - generic [ref=e524]:
                    - generic [ref=e526]: SafeRemediate-PrismaWebhook
                    - generic [ref=e527]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e528]: "18"
            - generic [ref=e529]:
              - generic [ref=e530]:
                - generic [ref=e531]: Observed traffic — animated arrows above
                - generic [ref=e532]: 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress
              - generic [ref=e533]: Listing 42 of 51 — the current lens and selection hide the rest. The counts above are the full evidence.
              - generic [ref=e534]:
                - generic [ref=e535]:
                  - generic [ref=e536]: SafeRemediate-Test-App-2
                  - generic [ref=e537]: →
                  - generic [ref=e538]: vpce-0f983779fff3bbae7
                  - generic [ref=e539]: VPCE
                - generic [ref=e540]:
                  - generic [ref=e541]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e542]: →
                  - generic [ref=e543]: vpce-0f983779fff3bbae7
                  - generic [ref=e544]: VPCE
                - generic [ref=e545]:
                  - generic [ref=e546]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e547]: →
                  - generic [ref=e548]: vpce-04ffe43eea196bf89
                  - generic [ref=e549]: VPCE
                - generic [ref=e550]:
                  - generic [ref=e551]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e552]: →
                  - generic [ref=e553]: vpce-0f983779fff3bbae7
                  - generic [ref=e554]: VPCE
                - generic [ref=e555]:
                  - generic [ref=e556]: SafeRemediate-Test-App-2
                  - generic [ref=e557]: →
                  - generic [ref=e558]: Internet (via IGW)
                  - generic [ref=e559]: egress · 3 (ext 3)
                - generic [ref=e560]:
                  - generic [ref=e561]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e562]: →
                  - generic [ref=e563]: Internet (via IGW)
                  - generic [ref=e564]: egress · 532 (ext 532 · S3 2)
                - generic [ref=e565]:
                  - generic [ref=e566]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e567]: →
                  - generic [ref=e568]: Internet (via IGW)
                  - generic [ref=e569]: egress · 588 (ext 588)
                - generic [ref=e570]:
                  - generic [ref=e571]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e572]: →
                  - generic [ref=e573]: saferemediate-test-db
                  - generic [ref=e574]: RDS · 5432
                - generic [ref=e575]:
                  - generic [ref=e576]: SafeRemediate-Test-Frontend-2
                  - generic [ref=e577]: →
                  - generic [ref=e578]: saferemediate-test-db
                  - generic [ref=e579]: RDS · 3306
                - generic [ref=e580]:
                  - generic [ref=e581]: SafeRemediate-Test-App-2
                  - generic [ref=e582]: →
                  - generic [ref=e583]: saferemediate-test-db
                  - generic [ref=e584]: RDS
                - generic [ref=e585]:
                  - generic [ref=e586]: fixture-tg-web
                  - generic [ref=e587]: →
                  - generic [ref=e588]: SafeRemediate-Test-App-2
                  - generic [ref=e589]: TARGETS
                - generic [ref=e590]:
                  - generic [ref=e591]: fixture-tg-web
                  - generic [ref=e592]: →
                  - generic [ref=e593]: SafeRemediate-Test-Frontend-1
                  - generic [ref=e594]: TARGETS
                - generic [ref=e595]: + 30 more flows
            - generic [ref=e596]:
              - generic [ref=e597]: Encoding
              - generic [ref=e598]:
                - generic [ref=e601]: Worst (carmine halo + pulse)
                - generic [ref=e604]: High / elevated (ring only)
                - generic [ref=e605]:
                  - generic [ref=e606]: ♛
                  - generic [ref=e607]: Crown-jewel halo
                - generic [ref=e610]: Clean · remediated (teal ring)
                - generic [ref=e613]: Stale (dimmed)
                - generic [ref=e616]: Coverage gap (not collected)
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
    - complementary [ref=e618]:
      - generic [ref=e619]:
        - generic [ref=e620]:
          - heading "Service index" [level=2] [ref=e621]
          - generic [ref=e622]: "41"
        - generic [ref=e623]:
          - img [ref=e624]
          - searchbox "Find service in topology" [ref=e627]
        - button "Filters" [ref=e630]:
          - img [ref=e631]
          - text: Filters
      - list [ref=e633]:
        - listitem [ref=e634]:
          - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e635]:
            - generic [ref=e636]:
              - img [ref=e638]
              - generic [ref=e640]:
                - generic [ref=e641]:
                  - generic [ref=e642]: SafeRemediate-Test-Frontend-1
                  - generic "Current graph data" [ref=e643]
                - generic [ref=e645]: EC2 · eu-west-1a · web
                - generic [ref=e646]:
                  - generic [ref=e647]: 3 in · 4 out
                  - generic [ref=e648]:
                    - img [ref=e649]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e652]:
          - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e653]:
            - generic [ref=e654]:
              - img [ref=e656]
              - generic [ref=e658]:
                - generic [ref=e659]:
                  - generic [ref=e660]: SafeRemediate-Test-App-2
                  - generic "Current graph data" [ref=e661]
                - generic [ref=e663]: EC2 · eu-west-1b · app
                - generic [ref=e664]:
                  - generic [ref=e665]: 3 in · 3 out
                  - generic [ref=e666]:
                    - img [ref=e667]
                    - text: Jul 9, 10:40 AM
        - listitem [ref=e670]:
          - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e671]:
            - generic [ref=e672]:
              - img [ref=e674]
              - generic [ref=e676]:
                - generic [ref=e677]:
                  - generic [ref=e678]: SafeRemediate-Test-Frontend-2
                  - generic "Current graph data" [ref=e679]
                - generic [ref=e681]: EC2 · eu-west-1b · web
                - generic [ref=e682]:
                  - generic [ref=e683]: 2 in · 3 out
                  - generic [ref=e684]:
                    - img [ref=e685]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e688]:
          - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e689]:
            - generic [ref=e690]:
              - img [ref=e692]
              - generic [ref=e694]:
                - generic [ref=e695]:
                  - generic [ref=e696]: alon-demo-data-bucket-745783559495
                  - generic "Current graph data" [ref=e697]
                - generic [ref=e699]: S3 · eu-west-1 · regional
                - generic [ref=e700]:
                  - generic [ref=e701]: 4 in · 0 out
                  - generic [ref=e702]:
                    - img [ref=e703]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e706]:
          - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e707]:
            - generic [ref=e708]:
              - img [ref=e710]
              - generic [ref=e712]:
                - generic [ref=e713]:
                  - generic [ref=e714]: saferemediate-test-db
                  - generic "Current graph data" [ref=e715]
                - generic [ref=e717]: RDS · eu-west-1a · data
                - generic [ref=e718]:
                  - generic [ref=e719]: 4 in · 0 out
                  - generic [ref=e720]:
                    - img [ref=e721]
                    - text: Jul 6, 03:05 PM
        - listitem [ref=e724]:
          - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e725]:
            - generic [ref=e726]:
              - img [ref=e728]
              - generic [ref=e730]:
                - generic [ref=e731]:
                  - generic [ref=e732]: AlonIAMTest-traffic-generator
                  - generic "Current graph data" [ref=e733]
                - generic [ref=e735]: Lambda · eu-west-1 · regional
                - generic [ref=e736]:
                  - generic [ref=e737]: 2 in · 1 out
                  - generic [ref=e738]:
                    - img [ref=e739]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e742]:
          - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e743]:
            - generic [ref=e744]:
              - img [ref=e746]
              - generic [ref=e748]:
                - generic [ref=e749]:
                  - generic [ref=e750]: PaymentTrafficGenerator
                  - generic "Current graph data" [ref=e751]
                - generic [ref=e753]: Lambda · eu-west-1 · regional
                - generic [ref=e754]:
                  - generic [ref=e755]: 2 in · 1 out
                  - generic [ref=e756]:
                    - img [ref=e757]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e760]:
          - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e761]:
            - generic [ref=e762]:
              - img [ref=e764]
              - generic [ref=e766]:
                - generic [ref=e767]:
                  - generic [ref=e768]: SafeRemediate-BehaviorAnalyzer
                  - generic "Current graph data" [ref=e769]
                - generic [ref=e771]: Lambda · eu-west-1 · regional
                - generic [ref=e772]:
                  - generic [ref=e773]: 2 in · 1 out
                  - generic [ref=e774]:
                    - img [ref=e775]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e778]:
          - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e779]:
            - generic [ref=e780]:
              - img [ref=e782]
              - generic [ref=e784]:
                - generic [ref=e785]:
                  - generic [ref=e786]: SafeRemediate-ConfidenceScorer
                  - generic "Current graph data" [ref=e787]
                - generic [ref=e789]: Lambda · eu-west-1 · regional
                - generic [ref=e790]:
                  - generic [ref=e791]: 2 in · 1 out
                  - generic [ref=e792]:
                    - img [ref=e793]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e796]:
          - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e797]:
            - generic [ref=e798]:
              - img [ref=e800]
              - generic [ref=e802]:
                - generic [ref=e803]:
                  - generic [ref=e804]: fixture-asg-app
                  - generic "Current graph data" [ref=e805]
                - generic [ref=e807]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e808]:
                  - generic [ref=e809]: 0 in · 2 out
                  - generic [ref=e810]:
                    - img [ref=e811]
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
                    - img [ref=e829]
                    - text: No runtime timestamp
        - listitem [ref=e832]:
          - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e833]:
            - generic [ref=e834]:
              - img [ref=e836]
              - generic [ref=e838]:
                - generic [ref=e839]:
                  - generic [ref=e840]: fixture-daily
                  - generic "Current graph data" [ref=e841]
                - generic [ref=e843]: EventBridge · eu-west-1 · regional
                - generic [ref=e844]:
                  - generic [ref=e845]: 0 in · 2 out
                  - generic [ref=e846]:
                    - img [ref=e847]
                    - text: No runtime timestamp
        - listitem [ref=e850]:
          - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e851]:
            - generic [ref=e852]:
              - img [ref=e854]
              - generic [ref=e856]:
                - generic [ref=e857]:
                  - generic [ref=e858]: fixture-every_6h
                  - generic "Current graph data" [ref=e859]
                - generic [ref=e861]: EventBridge · eu-west-1 · regional
                - generic [ref=e862]:
                  - generic [ref=e863]: 0 in · 2 out
                  - generic [ref=e864]:
                    - img [ref=e865]
                    - text: No runtime timestamp
        - listitem [ref=e868]:
          - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e869]:
            - generic [ref=e870]:
              - img [ref=e872]
              - generic [ref=e874]:
                - generic [ref=e875]:
                  - generic [ref=e876]: fixture-frequent
                  - generic "Current graph data" [ref=e877]
                - generic [ref=e879]: EventBridge · eu-west-1 · regional
                - generic [ref=e880]:
                  - generic [ref=e881]: 0 in · 2 out
                  - generic [ref=e882]:
                    - img [ref=e883]
                    - text: No runtime timestamp
        - listitem [ref=e886]:
          - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e887]:
            - generic [ref=e888]:
              - img [ref=e890]
              - generic [ref=e892]:
                - generic [ref=e893]:
                  - generic [ref=e894]: fixture-monthly
                  - generic "Current graph data" [ref=e895]
                - generic [ref=e897]: EventBridge · eu-west-1 · regional
                - generic [ref=e898]:
                  - generic [ref=e899]: 0 in · 2 out
                  - generic [ref=e900]:
                    - img [ref=e901]
                    - text: No runtime timestamp
        - listitem [ref=e904]:
          - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e905]:
            - generic [ref=e906]:
              - img [ref=e908]
              - generic [ref=e910]:
                - generic [ref=e911]:
                  - generic [ref=e912]: fixture-nightly_burst
                  - generic "Current graph data" [ref=e913]
                - generic [ref=e915]: EventBridge · eu-west-1 · regional
                - generic [ref=e916]:
                  - generic [ref=e917]: 0 in · 2 out
                  - generic [ref=e918]:
                    - img [ref=e919]
                    - text: No runtime timestamp
        - listitem [ref=e922]:
          - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e923]:
            - generic [ref=e924]:
              - img [ref=e926]
              - generic [ref=e928]:
                - generic [ref=e929]:
                  - generic [ref=e930]: fixture-tg-app
                  - generic "Current graph data" [ref=e931]
                - generic [ref=e933]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e934]:
                  - generic [ref=e935]: 0 in · 2 out
                  - generic [ref=e936]:
                    - img [ref=e937]
                    - text: No runtime timestamp
        - listitem [ref=e940]:
          - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e941]:
            - generic [ref=e942]:
              - img [ref=e944]
              - generic [ref=e946]:
                - generic [ref=e947]:
                  - generic [ref=e948]: fixture-tg-web
                  - generic "Current graph data" [ref=e949]
                - generic [ref=e951]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e952]:
                  - generic [ref=e953]: 0 in · 2 out
                  - generic [ref=e954]:
                    - img [ref=e955]
                    - text: No runtime timestamp
        - listitem [ref=e958]:
          - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e959]:
            - generic [ref=e960]:
              - img [ref=e962]
              - generic [ref=e964]:
                - generic [ref=e965]:
                  - generic [ref=e966]: fixture-weekly
                  - generic "Current graph data" [ref=e967]
                - generic [ref=e969]: EventBridge · eu-west-1 · regional
                - generic [ref=e970]:
                  - generic [ref=e971]: 0 in · 2 out
                  - generic [ref=e972]:
                    - img [ref=e973]
                    - text: No runtime timestamp
        - listitem [ref=e976]:
          - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e977]:
            - generic [ref=e978]:
              - img [ref=e980]
              - generic [ref=e982]:
                - generic [ref=e983]:
                  - generic [ref=e984]: SafeRemediate-CreateCheckpoint
                  - generic "Current graph data" [ref=e985]
                - generic [ref=e987]: Lambda · eu-west-1 · regional
                - generic [ref=e988]:
                  - generic [ref=e989]: 2 in · 0 out
                  - generic [ref=e990]:
                    - img [ref=e991]
                    - text: No runtime timestamp
        - listitem [ref=e994]:
          - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e995]:
            - generic [ref=e996]:
              - img [ref=e998]
              - generic [ref=e1000]:
                - generic [ref=e1001]:
                  - generic [ref=e1002]: SafeRemediate-PrismaWebhook
                  - generic "Current graph data" [ref=e1003]
                - generic [ref=e1005]: Lambda · eu-west-1 · regional
                - generic [ref=e1006]:
                  - generic [ref=e1007]: 2 in · 0 out
                  - generic [ref=e1008]:
                    - img [ref=e1009]
                    - text: No runtime timestamp
        - listitem [ref=e1012]:
          - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1013]:
            - generic [ref=e1014]:
              - img [ref=e1016]
              - generic [ref=e1018]:
                - generic [ref=e1019]:
                  - generic [ref=e1020]: fixture-aurora
                  - generic "Current graph data" [ref=e1021]
                - generic [ref=e1023]: RDS · eu-west-1 · VPC
                - generic [ref=e1024]:
                  - generic [ref=e1025]: 0 in · 1 out
                  - generic [ref=e1026]:
                    - img [ref=e1027]
                    - text: No runtime timestamp
        - listitem [ref=e1030]:
          - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e1031]:
            - generic [ref=e1032]:
              - img [ref=e1034]
              - generic [ref=e1036]:
                - generic [ref=e1037]:
                  - generic [ref=e1038]: fixture-graph
                  - generic "Current graph data" [ref=e1039]
                - generic [ref=e1041]: Neptune · eu-west-1 · VPC
                - generic [ref=e1042]:
                  - generic [ref=e1043]: 0 in · 1 out
                  - generic [ref=e1044]:
                    - img [ref=e1045]
                    - text: No runtime timestamp
        - listitem [ref=e1048]:
          - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e1049]:
            - generic [ref=e1050]:
              - img [ref=e1052]
              - generic [ref=e1054]:
                - generic [ref=e1055]:
                  - generic [ref=e1056]: fixture-neptune-1
                  - generic "Current graph data" [ref=e1057]
                - generic [ref=e1059]: Neptune · eu-west-1a · data
                - generic [ref=e1060]:
                  - generic [ref=e1061]: 1 in · 0 out
                  - generic [ref=e1062]:
                    - img [ref=e1063]
                    - text: No runtime timestamp
        - listitem [ref=e1066]:
          - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1067]:
            - generic [ref=e1068]:
              - img [ref=e1070]
              - generic [ref=e1073]:
                - generic [ref=e1074]:
                  - generic [ref=e1075]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                  - generic "Current graph data" [ref=e1076]
                - generic [ref=e1078]: S3 · eu-west-1 · regional
                - generic [ref=e1079]:
                  - generic [ref=e1080]: 0 in · 0 out
                  - generic [ref=e1081]:
                    - img [ref=e1082]
                    - text: No runtime timestamp
        - listitem [ref=e1085]:
          - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1086]:
            - generic [ref=e1087]:
              - img [ref=e1089]
              - generic [ref=e1092]:
                - generic [ref=e1093]:
                  - generic [ref=e1094]: cyntro-demo-analytics-745783559495
                  - generic "Current graph data" [ref=e1095]
                - generic [ref=e1097]: S3 · eu-west-1 · regional
                - generic [ref=e1098]:
                  - generic [ref=e1099]: 0 in · 0 out
                  - generic [ref=e1100]:
                    - img [ref=e1101]
                    - text: No runtime timestamp
        - listitem [ref=e1104]:
          - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1105]:
            - generic [ref=e1106]:
              - img [ref=e1108]
              - generic [ref=e1111]:
                - generic [ref=e1112]:
                  - generic [ref=e1113]: cyntro-demo-eu
                  - generic "Current graph data" [ref=e1114]
                - generic [ref=e1116]: S3 · eu-west-1 · regional
                - generic [ref=e1117]:
                  - generic [ref=e1118]: 0 in · 0 out
                  - generic [ref=e1119]:
                    - img [ref=e1120]
                    - text: No runtime timestamp
        - listitem [ref=e1123]:
          - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1124]:
            - generic [ref=e1125]:
              - img [ref=e1127]
              - generic [ref=e1130]:
                - generic [ref=e1131]:
                  - generic [ref=e1132]: cyntro-demo-prod-data-745783559495
                  - generic "Current graph data" [ref=e1133]
                - generic [ref=e1135]: S3 · eu-west-1 · regional
                - generic [ref=e1136]:
                  - generic [ref=e1137]: 0 in · 0 out
                  - generic [ref=e1138]:
                    - img [ref=e1139]
                    - text: No runtime timestamp
        - listitem [ref=e1142]:
          - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1143]:
            - generic [ref=e1144]:
              - img [ref=e1146]
              - generic [ref=e1149]:
                - generic [ref=e1150]:
                  - generic [ref=e1151]: cyntronewtestbucket
                  - generic "Current graph data" [ref=e1152]
                - generic [ref=e1154]: S3 · eu-west-1 · regional
                - generic [ref=e1155]:
                  - generic [ref=e1156]: 0 in · 0 out
                  - generic [ref=e1157]:
                    - img [ref=e1158]
                    - text: No runtime timestamp
        - listitem [ref=e1161]:
          - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1162]:
            - generic [ref=e1163]:
              - img [ref=e1165]
              - generic [ref=e1168]:
                - generic [ref=e1169]:
                  - generic [ref=e1170]: cyntrotest2
                  - generic "Current graph data" [ref=e1171]
                - generic [ref=e1173]: S3 · eu-west-1 · regional
                - generic [ref=e1174]:
                  - generic [ref=e1175]: 0 in · 0 out
                  - generic [ref=e1176]:
                    - img [ref=e1177]
                    - text: No runtime timestamp
        - listitem [ref=e1180]:
          - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1181]:
            - generic [ref=e1182]:
              - img [ref=e1184]
              - generic [ref=e1187]:
                - generic [ref=e1188]:
                  - generic [ref=e1189]: impaciq-findings
                  - generic "Current graph data" [ref=e1190]
                - generic [ref=e1192]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1193]:
                  - generic [ref=e1194]: 0 in · 0 out
                  - generic [ref=e1195]:
                    - img [ref=e1196]
                    - text: No runtime timestamp
        - listitem [ref=e1199]:
          - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1200]:
            - generic [ref=e1201]:
              - img [ref=e1203]
              - generic [ref=e1206]:
                - generic [ref=e1207]:
                  - generic [ref=e1208]: impaciq-remediation-history
                  - generic "Current graph data" [ref=e1209]
                - generic [ref=e1211]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1212]:
                  - generic [ref=e1213]: 0 in · 0 out
                  - generic [ref=e1214]:
                    - img [ref=e1215]
                    - text: No runtime timestamp
        - listitem [ref=e1218]:
          - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1219]:
            - generic [ref=e1220]:
              - img [ref=e1222]
              - generic [ref=e1225]:
                - generic [ref=e1226]:
                  - generic [ref=e1227]: impaciq-scan-status
                  - generic "Current graph data" [ref=e1228]
                - generic [ref=e1230]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1231]:
                  - generic [ref=e1232]: 0 in · 0 out
                  - generic [ref=e1233]:
                    - img [ref=e1234]
                    - text: No runtime timestamp
        - listitem [ref=e1237]:
          - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1238]:
            - generic [ref=e1239]:
              - img [ref=e1241]
              - generic [ref=e1244]:
                - generic [ref=e1245]:
                  - generic [ref=e1246]: least_privilege_role_state
                  - generic "Current graph data" [ref=e1247]
                - generic [ref=e1249]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1250]:
                  - generic [ref=e1251]: 0 in · 0 out
                  - generic [ref=e1252]:
                    - img [ref=e1253]
                    - text: No runtime timestamp
        - listitem [ref=e1256]:
          - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1257]:
            - generic [ref=e1258]:
              - img [ref=e1260]
              - generic [ref=e1263]:
                - generic [ref=e1264]:
                  - generic [ref=e1265]: saferemediate-access-logs-745783559495
                  - generic "Current graph data" [ref=e1266]
                - generic [ref=e1268]: S3 · eu-west-1 · regional
                - generic [ref=e1269]:
                  - generic [ref=e1270]: 0 in · 0 out
                  - generic [ref=e1271]:
                    - img [ref=e1272]
                    - text: No runtime timestamp
        - listitem [ref=e1275]:
          - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1276]:
            - generic [ref=e1277]:
              - img [ref=e1279]
              - generic [ref=e1282]:
                - generic [ref=e1283]:
                  - generic [ref=e1284]: saferemediate-demo-cloudtrail-745783559495
                  - generic "Current graph data" [ref=e1285]
                - generic [ref=e1287]: S3 · eu-west-1 · regional
                - generic [ref=e1288]:
                  - generic [ref=e1289]: 0 in · 0 out
                  - generic [ref=e1290]:
                    - img [ref=e1291]
                    - text: No runtime timestamp
        - listitem [ref=e1294]:
          - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1295]:
            - generic [ref=e1296]:
              - img [ref=e1298]
              - generic [ref=e1301]:
                - generic [ref=e1302]:
                  - generic [ref=e1303]: SafeRemediate-Executions
                  - generic "Current graph data" [ref=e1304]
                - generic [ref=e1306]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1307]:
                  - generic [ref=e1308]: 0 in · 0 out
                  - generic [ref=e1309]:
                    - img [ref=e1310]
                    - text: No runtime timestamp
        - listitem [ref=e1313]:
          - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1314]:
            - generic [ref=e1315]:
              - img [ref=e1317]
              - generic [ref=e1320]:
                - generic [ref=e1321]:
                  - generic [ref=e1322]: SafeRemediate-Findings
                  - generic "Current graph data" [ref=e1323]
                - generic [ref=e1325]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1326]:
                  - generic [ref=e1327]: 0 in · 0 out
                  - generic [ref=e1328]:
                    - img [ref=e1329]
                    - text: No runtime timestamp
        - listitem [ref=e1332]:
          - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1333]:
            - generic [ref=e1334]:
              - img [ref=e1336]
              - generic [ref=e1339]:
                - generic [ref=e1340]:
                  - generic [ref=e1341]: saferemediate-logs-745783559495
                  - generic "Current graph data" [ref=e1342]
                - generic [ref=e1344]: S3 · eu-west-1 · regional
                - generic [ref=e1345]:
                  - generic [ref=e1346]: 0 in · 0 out
                  - generic [ref=e1347]:
                    - img [ref=e1348]
                    - text: No runtime timestamp
        - listitem [ref=e1351]:
          - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1352]:
            - generic [ref=e1353]:
              - img [ref=e1355]
              - generic [ref=e1358]:
                - generic [ref=e1359]:
                  - generic [ref=e1360]: SafeRemediate-Simulations
                  - generic "Current graph data" [ref=e1361]
                - generic [ref=e1363]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1364]:
                  - generic [ref=e1365]: 0 in · 0 out
                  - generic [ref=e1366]:
                    - img [ref=e1367]
                    - text: No runtime timestamp
        - listitem [ref=e1370]:
          - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1371]:
            - generic [ref=e1372]:
              - img [ref=e1374]
              - generic [ref=e1377]:
                - generic [ref=e1378]:
                  - generic [ref=e1379]: sg_state
                  - generic "Current graph data" [ref=e1380]
                - generic [ref=e1382]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1383]:
                  - generic [ref=e1384]: 0 in · 0 out
                  - generic [ref=e1385]:
                    - img [ref=e1386]
                    - text: No runtime timestamp
    - contentinfo [ref=e1389]:
      - text: Live read from
      - generic [ref=e1390]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1391]
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
      |           ^ Error: the external lane overlaps data-tier cell 1 at 1024x720·glance
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