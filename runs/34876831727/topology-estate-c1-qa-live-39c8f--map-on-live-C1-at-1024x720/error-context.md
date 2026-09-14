# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> release QA — egress destinations beyond the IGW >> egress map on live C1 at 1024x720
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1961:9

# Error details

```
Error: a collapsed bundle drew more than one count: TARGETS ×6 Same 6 connections, also recorded as TRIGGERS 12 edge rows in the graph for 6 connections arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-every_6h→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-every_6h arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-frequent→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-frequent arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-daily→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-daily arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-monthly→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-monthly arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-weekly→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-weekly arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-nightly_burst→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-nightly_burstTARGETS ×6

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    3
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
        - option "Cyntro Testbed Webshop" [selected]
    - generic [ref=e13]:
      - img [ref=e14]
      - generic [ref=e18]: Group
      - combobox "Group" [ref=e19]:
        - option "All account groups" [selected]
    - generic [ref=e20]:
      - img [ref=e21]
      - generic [ref=e23]: Account
      - combobox "Account" [ref=e24]:
        - option "All accounts"
        - option "Testbed Webshop · 416651950952" [selected]
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e31]: Region
      - combobox "Region" [ref=e32]:
        - option "All regions"
        - option "eu-west-1" [selected]
    - generic [ref=e34]: 1 account in view
  - generic [ref=e35]:
    - banner [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Estate · Topology v0.2 · testbed-webshop
          - generic [ref=e40]: cyntro-tb-prod-loadgen-role has 15/25 unused permissions (60% gap) — attached to cyntro-tb-prod-loadgen
          - generic [ref=e41]: scored 2026-09-14T17:32:12Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e
          - generic [ref=e42]: Served from cache; not recomputed for this request. · Last updated Sep 14, 2026, 5:32 PM
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Evidence computed Sep 14, 2026, 5:32 PM
            - generic [ref=e47]: Live graph
          - button "System stats" [ref=e48]
    - generic [ref=e49]:
      - generic [ref=e50]: VPC scope
      - combobox "VPC scope" [ref=e51]:
        - option "All VPCs · Compare"
        - option "cyntro-tb-prod-vpc · vpc-0c39cde96f29f8f4e (7 workloads)" [selected]
      - generic [ref=e52]: Subnet-linked compute in tier cells; regional/serverless on the right rail.
    - generic [ref=e53]:
      - generic [ref=e54]: Availability zones
      - button "eu-west-1a" [pressed] [ref=e55]
      - button "eu-west-1b" [pressed] [ref=e56]
    - generic [ref=e57]:
      - generic "EC2 / RDS / LoadBalancer in the selected VPC" [ref=e58]: In this VPC
      - button "EC2 (5)" [pressed] [ref=e59]
      - button "RDS (3)" [pressed] [ref=e60]
      - button "LoadBalancer (2)" [pressed] [ref=e61]
      - button "TargetGroup (2)" [pressed] [ref=e62]
      - button "Neptune (2)" [pressed] [ref=e63]
      - button "AutoScalingGroup (2)" [pressed] [ref=e64]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e65]: System-wide
      - button "Lambda (6)" [pressed] [ref=e66]
      - button "EventBridge (6)" [pressed] [ref=e67]
      - button "S3 (3)" [pressed] [ref=e68]
      - button "KMSKey (3)" [pressed] [ref=e69]
      - button "DynamoDB (1)" [pressed] [ref=e70]
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
            - generic [ref=e95]: 1 VPC · 2 AZ · 6 subnets · 35 resources
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
          - generic [ref=e157]: Traffic evidence not yet authoritative
          - generic [ref=e158]: Outlined packets show historical source-to-target direction; they do not claim live traffic.
        - generic [ref=e160]:
          - generic [ref=e161]: Flow-log coverage
          - generic [ref=e162]: Not measured
          - generic [ref=e163]: 16 eligible endpoints, coverage not measured · 19 not applicable
          - button "Coverage details (3)" [ref=e164]
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
              - generic [ref=e186]: Public path via IGW · igw-01b6c643a5c856abe
        - generic [ref=e187]:
          - generic [ref=e188]: ☁ AWS Cloud · acct 416651950952
          - generic [ref=e189]:
            - generic [ref=e190]: Region · eu-west-1
            - generic [ref=e191]:
              - generic [ref=e192]:
                - generic [ref=e193]:
                  - generic "vpc-0c39cde96f29f8f4e" [ref=e194]: VPC · vpc-0c39cde96f29f8f4e
                  - generic "7 of 8 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e195]: cyntro-tb-prod-… ×7
                - generic [ref=e197]:
                  - generic [ref=e198]:
                    - generic [ref=e199]:
                      - img [ref=e200]
                      - generic [ref=e206]: Load Balancers (2)
                    - generic [ref=e207]:
                      - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e208]:
                        - generic [ref=e210]:
                          - generic [ref=e211]:
                            - generic [ref=e212]: cyntro-tb-prod-alb-int
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e213]: Multi-AZ
                          - generic [ref=e214]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e215]: "0"
                      - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e216]:
                        - generic [ref=e218]:
                          - generic [ref=e219]:
                            - generic [ref=e220]: cyntro-tb-prod-alb-pub
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e221]: Multi-AZ
                          - generic [ref=e222]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e223]: "0"
                  - generic [ref=e227]:
                    - generic "eu-west-1a" [ref=e228]
                    - generic "eu-west-1b" [ref=e229]
                  - generic [ref=e230]:
                    - generic [ref=e231]:
                      - generic [ref=e232]: WEB TIER
                      - generic [ref=e234]:
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e235]':
                          - generic [ref=e236]:
                            - generic [ref=e237]: Public · cyntro-tb-prod-public-eu-west-1a
                            - generic [ref=e238]: 10.42.0.0/24
                          - generic "NAT gateway · nat-0fd7cf8524e62aea9 · public 54.229.208.150 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e240]:
                            - img [ref=e242]
                            - generic [ref=e245]: NAT GW · nat-0fd7cf8524e62aea9
                          - generic [ref=e246]:
                            - button "quiet posture score …web" [ref=e247]:
                              - generic "quiet posture score" [ref=e248]
                              - generic [ref=e251]: …web
                            - button "quiet posture score cyntro-testbed-webshop-writer" [ref=e252]:
                              - generic "quiet posture score" [ref=e253]
                              - generic [ref=e256]: cyntro-testbed-webshop-writer
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e257]':
                          - generic [ref=e258]:
                            - generic [ref=e259]: Public · cyntro-tb-prod-public-eu-west-1b
                            - generic [ref=e260]: 10.42.1.0/24
                          - button "quiet posture score …web" [ref=e262]:
                            - generic "quiet posture score" [ref=e263]
                            - generic [ref=e266]: …web
                    - generic [ref=e267]:
                      - generic [ref=e268]: APPLICATION TIER
                      - generic [ref=e270]:
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e271]':
                          - generic [ref=e272]:
                            - generic [ref=e273]: Private · cyntro-tb-prod-app-eu-west-1a
                            - generic [ref=e274]: 10.42.10.0/24
                          - generic [ref=e275]:
                            - button "quiet posture score …loadgen" [ref=e276]:
                              - generic "quiet posture score" [ref=e277]
                              - generic [ref=e280]: …loadgen
                            - button "quiet posture score …app" [ref=e281]:
                              - generic "quiet posture score" [ref=e282]
                              - generic [ref=e285]: …app
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e286]':
                          - generic [ref=e287]:
                            - generic [ref=e288]: Private · cyntro-tb-prod-app-eu-west-1b
                            - generic [ref=e289]: 10.42.11.0/24
                          - button "quiet posture score …app" [ref=e291]:
                            - generic "quiet posture score" [ref=e292]
                            - generic [ref=e295]: …app
                    - generic [ref=e296]:
                      - generic [ref=e297]: DATABASE TIER
                      - generic [ref=e299]:
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e300]':
                          - generic [ref=e301]:
                            - generic [ref=e302]: Data · cyntro-tb-prod-data-eu-west-1a
                            - generic [ref=e303]: 10.42.20.0/24
                          - button "quiet posture score …aurora-1" [ref=e305]:
                            - generic "quiet posture score" [ref=e306]
                            - generic [ref=e309]: …aurora-1
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e310]':
                          - generic [ref=e311]:
                            - generic [ref=e312]: Data · cyntro-tb-prod-data-eu-west-1b
                            - generic [ref=e313]: 10.42.21.0/24
                          - button "quiet posture score …aurora-0" [ref=e315]:
                            - generic "quiet posture score" [ref=e316]
                            - generic [ref=e319]: …aurora-0
                  - generic [ref=e320]:
                    - generic [ref=e321]: IAM CP
                    - generic [ref=e322]:
                      - generic [ref=e323]: IAM · Control plane
                      - generic [ref=e324]:
                        - generic [ref=e325]: Roles attached to this VPC
                        - generic [ref=e326]: derived from instance-profile + USES_ROLE edges · 9 roles · 2 recomputing
                      - generic [ref=e327]:
                        - generic [ref=e328]:
                          - generic "cyntro-tb-prod-consumer-monthly" [ref=e329]
                          - generic [ref=e331]: 7/7 unused
                          - generic [ref=e332]: recomputing · usage edges present, scalar stale
                          - generic [ref=e333]:
                            - generic [ref=e334]: cyntro-tb-prod-consumer-monthly
                            - generic [ref=e335]: USES_ROLE
                        - generic [ref=e336]:
                          - generic "cyntro-tb-prod-consumer-weekly" [ref=e337]
                          - generic [ref=e339]: 7/7 unused
                          - generic [ref=e340]: recomputing · usage edges present, scalar stale
                          - generic [ref=e341]:
                            - generic [ref=e342]: cyntro-tb-prod-consumer-weekly
                            - generic [ref=e343]: USES_ROLE
                        - generic [ref=e344]:
                          - generic "cyntro-tb-prod-loadgen-role" [ref=e345]
                          - generic [ref=e347]: 15/25 unused
                          - generic [ref=e348]: 60% gap · never remediated
                          - generic [ref=e349]:
                            - generic [ref=e350]: cyntro-tb-prod-loadgen
                            - generic [ref=e351]: via instance profile
                        - generic [ref=e352]:
                          - generic "cyntro-tb-prod-web-role" [ref=e353]
                          - generic [ref=e355]: 17/29 unused
                          - generic [ref=e356]: 59% gap · never remediated
                          - generic [ref=e357]:
                            - generic [ref=e358]: cyntro-tb-prod-web
                            - generic [ref=e359]: cyntro-tb-prod-web
                            - generic [ref=e360]: via instance profile · shared
                        - generic [ref=e361]:
                          - generic "cyntro-tb-prod-app-role" [ref=e362]
                          - generic [ref=e364]: 15/29 unused
                          - generic [ref=e365]: 52% gap · never remediated
                          - generic [ref=e366]:
                            - generic [ref=e367]: cyntro-tb-prod-app
                            - generic [ref=e368]: cyntro-tb-prod-app
                            - generic [ref=e369]: via instance profile · shared
                        - generic [ref=e370]:
                          - generic "cyntro-tb-prod-consumer-daily" [ref=e371]
                          - generic [ref=e373]: 2/7 unused
                          - generic [ref=e374]: 29% gap · never remediated
                          - generic [ref=e375]:
                            - generic [ref=e376]: cyntro-tb-prod-consumer-daily
                            - generic [ref=e377]: USES_ROLE
                        - generic [ref=e378]:
                          - generic "cyntro-tb-prod-consumer-every_6h" [ref=e379]
                          - generic [ref=e381]: 2/7 unused
                          - generic [ref=e382]: 29% gap · never remediated
                          - generic [ref=e383]:
                            - generic [ref=e384]: cyntro-tb-prod-consumer-every_6h
                            - generic [ref=e385]: USES_ROLE
                        - generic [ref=e386]:
                          - generic "cyntro-tb-prod-consumer-frequent" [ref=e387]
                          - generic [ref=e389]: 2/7 unused
                          - generic [ref=e390]: 29% gap · never remediated
                          - generic [ref=e391]:
                            - generic [ref=e392]: cyntro-tb-prod-consumer-frequent
                            - generic [ref=e393]: USES_ROLE
                        - generic [ref=e394]:
                          - generic "cyntro-tb-prod-consumer-nightly_burst" [ref=e395]
                          - generic [ref=e397]: 2/7 unused
                          - generic [ref=e398]: 29% gap · never remediated
                          - generic [ref=e399]:
                            - generic [ref=e400]: cyntro-tb-prod-consumer-nightly_burst
                            - generic [ref=e401]: USES_ROLE
              - generic [ref=e402]:
                - generic [ref=e403]: VPC boundary
                - generic [ref=e404]:
                  - generic [ref=e405]: ↑ Internet
                  - generic [ref=e406]:
                    - button "IGW igw-01b6c643a5c856abe" [ref=e407]:
                      - img [ref=e409]
                      - generic [ref=e412]: IGW
                      - generic [ref=e413]: igw-01b6c643a5c856abe
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e414]: "egress: 3 workloads"
                - generic [ref=e416]:
                  - generic [ref=e417]: Endpoints (1)
                  - generic [ref=e418]:
                    - button "VPCE GW Amazon S3" [ref=e419]:
                      - img [ref=e421]
                      - generic [ref=e425]: VPCE
                      - generic [ref=e426]: GW
                      - generic [ref=e427]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e428]: "use: not observed"
              - generic [ref=e429]:
                - generic [ref=e430]: Outside the VPC
                - generic [ref=e431]: Destinations observed this generation · NAT → IGW is configured routing
                - generic [ref=e432]:
                  - generic "3.253.225.145 — an address; the evidence names no service" [ref=e433]:
                    - generic [ref=e434]: 3.253.225.145
                    - generic [ref=e435]: address
                  - generic "3.5.64.0 — an address; the evidence names no service" [ref=e436]:
                    - generic [ref=e437]: 3.5.64.0
                    - generic [ref=e438]: address
                  - generic "3.5.64.128 — an address; the evidence names no service" [ref=e439]:
                    - generic [ref=e440]: 3.5.64.128
                    - generic [ref=e441]: address
                  - generic "3.5.67.254 — an address; the evidence names no service" [ref=e442]:
                    - generic [ref=e443]: 3.5.67.254
                    - generic [ref=e444]: address
                  - generic "3.5.69.34 — an address; the evidence names no service" [ref=e445]:
                    - generic [ref=e446]: 3.5.69.34
                    - generic [ref=e447]: address
                  - generic "3.5.72.119 — an address; the evidence names no service" [ref=e448]:
                    - generic [ref=e449]: 3.5.72.119
                    - generic [ref=e450]: address
                  - button "+7 more" [active] [ref=e451]
                - generic [ref=e453]:
                  - generic [ref=e454]:
                    - generic [ref=e455]: 3 workloads
                    - generic [ref=e458]: ▸
                    - generic [ref=e459]:
                      - generic "NAT nat-0fd7cf8524e62aea9" [ref=e460]:
                        - text: NAT
                        - generic [ref=e461]: nat-0fd7cf8524e62aea9
                      - generic [ref=e464]: ▸
                    - generic [ref=e465]:
                      - generic "IGW igw-01b6c643a5c856abe" [ref=e466]:
                        - text: IGW
                        - generic [ref=e467]: igw-01b6c643a5c856abe
                      - generic [ref=e470]: ▸
                  - button "External destinations 3 workloads · up to 45 distinct · addresses sampled" [ref=e471]:
                    - img [ref=e473]
                    - generic [ref=e478]:
                      - generic [ref=e479]: External destinations
                      - generic [ref=e480]: 3 workloads · up to 45 distinct · addresses sampled
              - generic [ref=e482]:
                - generic [ref=e483]:
                  - generic [ref=e484]:
                    - generic [ref=e485]: Lambda runtime (6)
                    - generic [ref=e486]:
                      - text: outside subnet grid · 6 outside VPC (verified)
                      - generic "12 of 12 chips omit this shared prefix" [ref=e487]: · cyntro-tb-prod-consumer-… ×12
                    - button "S3 traffic from 4 of 6 functions" [ref=e489]
                  - generic [ref=e490]:
                    - generic [ref=e491]: Triggers (6)
                    - generic [ref=e492]:
                      - button "quiet posture score …daily" [ref=e493]:
                        - generic "quiet posture score" [ref=e494]
                        - generic [ref=e497]: …daily
                      - button "quiet posture score …every_6h" [ref=e498]:
                        - generic "quiet posture score" [ref=e499]
                        - generic [ref=e502]: …every_6h
                      - button "quiet posture score …frequent" [ref=e503]:
                        - generic "quiet posture score" [ref=e504]
                        - generic [ref=e507]: …frequent
                      - button "quiet posture score …monthly" [ref=e508]:
                        - generic "quiet posture score" [ref=e509]
                        - generic [ref=e512]: …monthly
                      - button "quiet posture score …nightly_burst" [ref=e513]:
                        - generic "quiet posture score" [ref=e514]
                        - generic [ref=e517]: …nightly_burst
                      - button "quiet posture score …weekly" [ref=e518]:
                        - generic "quiet posture score" [ref=e519]
                        - generic [ref=e522]: …weekly
                  - generic [ref=e524]:
                    - button "quiet posture score …monthly Lambda" [ref=e525]:
                      - generic "quiet posture score" [ref=e526]
                      - generic [ref=e529]: …monthly
                      - generic [ref=e530]: Lambda
                    - button "quiet posture score …weekly Lambda" [ref=e531]:
                      - generic "quiet posture score" [ref=e532]
                      - generic [ref=e535]: …weekly
                      - generic [ref=e536]: Lambda
                    - button "quiet posture score …daily Lambda" [ref=e537]:
                      - generic "quiet posture score" [ref=e538]
                      - generic [ref=e541]: …daily
                      - generic [ref=e542]: Lambda
                    - button "quiet posture score …every_6h Lambda" [ref=e543]:
                      - generic "quiet posture score" [ref=e544]
                      - generic [ref=e547]: …every_6h
                      - generic [ref=e548]: Lambda
                    - button "quiet posture score …frequent Lambda" [ref=e549]:
                      - generic "quiet posture score" [ref=e550]
                      - generic [ref=e553]: …frequent
                      - generic [ref=e554]: Lambda
                    - button "quiet posture score …nightly_burst Lambda" [ref=e555]:
                      - generic "quiet posture score" [ref=e556]
                      - generic [ref=e559]: …nightly_burst
                      - generic [ref=e560]: Lambda
                - generic [ref=e562]:
                  - generic [ref=e563]:
                    - text: Regional · KMS / S3 / DDB (7)
                    - generic "3 of 7 chips omit this shared prefix" [ref=e564]: arn:aws:kms:eu-west-1:416651950952:key/… ×3
                  - generic [ref=e566]:
                    - button "quiet posture score cyntro-evidence-testbed-webshop-950952 S3" [ref=e567]:
                      - generic "quiet posture score" [ref=e568]
                      - generic [ref=e571]: cyntro-evidence-testbed-webshop-950952
                      - generic [ref=e572]: S3
                    - button "quiet posture score cyntro-ingest-head-testbed-webshop DynamoDB" [ref=e573]:
                      - generic "quiet posture score" [ref=e574]
                      - generic [ref=e577]: cyntro-ingest-head-testbed-webshop
                      - generic [ref=e578]: DynamoDB
                    - button "quiet posture score cyntro-tb-prod-appdata-1c8276f5 S3" [ref=e579]:
                      - generic "quiet posture score" [ref=e580]
                      - generic [ref=e583]: cyntro-tb-prod-appdata-1c8276f5
                      - generic [ref=e584]: S3
                    - button "quiet posture score cyntro-tb-prod-logs-1c8276f5 S3" [ref=e585]:
                      - generic "quiet posture score" [ref=e586]
                      - generic [ref=e589]: cyntro-tb-prod-logs-1c8276f5
                      - generic [ref=e590]: S3
                    - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2 KMSKey" [ref=e591]:
                      - generic "quiet posture score" [ref=e592]
                      - generic [ref=e595]: …76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic [ref=e596]: KMSKey
                    - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a KMSKey" [ref=e597]:
                      - generic "quiet posture score" [ref=e598]
                      - generic [ref=e601]: …d729e441-b319-4859-9974-9bd12d8e341a
                      - generic [ref=e602]: KMSKey
                    - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453 KMSKey" [ref=e603]:
                      - generic "quiet posture score" [ref=e604]
                      - generic [ref=e607]: …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic [ref=e608]: KMSKey
            - button "Logical groups · members carry the placement (6) Show members" [ref=e610]:
              - generic [ref=e611]: Logical groups · members carry the placement (6)
              - generic [ref=e612]: Show members
        - generic [ref=e613]:
          - button "Diagnostics 6 serverless · 38 flows ▴" [ref=e614]:
            - generic [ref=e615]: Diagnostics
            - generic [ref=e616]: 6 serverless · 38 flows ▴
          - generic [ref=e617]:
            - generic [ref=e618]:
              - generic [ref=e619]: Serverless compute (6)
              - generic [ref=e620]:
                - button "cyntro-tb-prod-consumer-monthly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e621]:
                  - generic [ref=e623]:
                    - generic [ref=e625]: cyntro-tb-prod-consumer-monthly
                    - generic [ref=e626]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e627]: "15"
                - button "cyntro-tb-prod-consumer-weekly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e628]:
                  - generic [ref=e630]:
                    - generic [ref=e632]: cyntro-tb-prod-consumer-weekly
                    - generic [ref=e633]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e634]: "15"
                - button "cyntro-tb-prod-consumer-daily Lambda · arn:aws:lambda:eu-west-1 4" [ref=e635]:
                  - generic [ref=e637]:
                    - generic [ref=e639]: cyntro-tb-prod-consumer-daily
                    - generic [ref=e640]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e641]: "4"
                - button "cyntro-tb-prod-consumer-every_6h Lambda · arn:aws:lambda:eu-west-1 4" [ref=e642]:
                  - generic [ref=e644]:
                    - generic [ref=e646]: cyntro-tb-prod-consumer-every_6h
                    - generic [ref=e647]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e648]: "4"
                - button "cyntro-tb-prod-consumer-frequent Lambda · arn:aws:lambda:eu-west-1 4" [ref=e649]:
                  - generic [ref=e651]:
                    - generic [ref=e653]: cyntro-tb-prod-consumer-frequent
                    - generic [ref=e654]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e655]: "4"
                - button "cyntro-tb-prod-consumer-nightly_burst Lambda · arn:aws:lambda:eu-west-1 4" [ref=e656]:
                  - generic [ref=e658]:
                    - generic [ref=e660]: cyntro-tb-prod-consumer-nightly_burst
                    - generic [ref=e661]: Lambda · arn:aws:lambda:eu-west-1
                  - generic [ref=e662]: "4"
            - generic [ref=e663]:
              - generic [ref=e664]:
                - generic [ref=e665]: Observed traffic — animated arrows above
                - generic [ref=e666]: 38 flows · 25 internal · 10 edge-service · 0 vpce · 0 database · 3 egress
              - generic [ref=e667]:
                - generic [ref=e668]:
                  - generic [ref=e669]: cyntro-tb-prod-consumer-nightly_burst
                  - generic [ref=e670]: →
                  - generic [ref=e671]: cyntro-tb-prod-appdata-1c8276f5
                  - generic [ref=e672]: ACTUAL_S3_ACCESS
                - generic [ref=e673]:
                  - generic [ref=e674]: cyntro-tb-prod-consumer-daily
                  - generic [ref=e675]: →
                  - generic [ref=e676]: cyntro-tb-prod-appdata-1c8276f5
                  - generic [ref=e677]: ACTUAL_S3_ACCESS
                - generic [ref=e678]:
                  - generic [ref=e679]: cyntro-tb-prod-consumer-frequent
                  - generic [ref=e680]: →
                  - generic [ref=e681]: cyntro-tb-prod-appdata-1c8276f5
                  - generic [ref=e682]: ACTUAL_S3_ACCESS
                - generic [ref=e683]:
                  - generic [ref=e684]: cyntro-tb-prod-consumer-every_6h
                  - generic [ref=e685]: →
                  - generic [ref=e686]: cyntro-tb-prod-appdata-1c8276f5
                  - generic [ref=e687]: ACTUAL_S3_ACCESS
                - generic [ref=e688]:
                  - generic [ref=e689]: cyntro-tb-prod-app
                  - generic [ref=e690]: →
                  - generic [ref=e691]: Internet (via IGW)
                  - generic [ref=e692]: egress · 32 (ext 32)
                - generic [ref=e693]:
                  - generic [ref=e694]: cyntro-tb-prod-loadgen
                  - generic [ref=e695]: →
                  - generic [ref=e696]: Internet (via IGW)
                  - generic [ref=e697]: egress · 3 (ext 3)
                - generic [ref=e698]:
                  - generic [ref=e699]: cyntro-tb-prod-app
                  - generic [ref=e700]: →
                  - generic [ref=e701]: Internet (via IGW)
                  - generic [ref=e702]: egress · 10 (ext 10)
                - generic [ref=e703]:
                  - generic [ref=e704]: cyntro-testbed-webshop-writer
                  - generic [ref=e705]: →
                  - generic [ref=e706]: cyntro-testbed-webshop
                  - generic [ref=e707]: MEMBER_OF_CLUSTER
                - generic [ref=e708]:
                  - generic [ref=e709]: cyntro-tb-prod-aurora-1
                  - generic [ref=e710]: →
                  - generic [ref=e711]: cyntro-tb-prod-aurora
                  - generic [ref=e712]: MEMBER_OF_CLUSTER
                - generic [ref=e713]:
                  - generic [ref=e714]: cyntro-tb-prod-aurora-0
                  - generic [ref=e715]: →
                  - generic [ref=e716]: cyntro-tb-prod-aurora
                  - generic [ref=e717]: MEMBER_OF_CLUSTER
                - generic [ref=e718]:
                  - generic [ref=e719]: cyntro-tb-prod-tg-app
                  - generic [ref=e720]: →
                  - generic [ref=e721]: cyntro-tb-prod-app
                  - generic [ref=e722]: TARGETS
                - generic [ref=e723]:
                  - generic [ref=e724]: cyntro-tb-prod-tg-app
                  - generic [ref=e725]: →
                  - generic [ref=e726]: cyntro-tb-prod-app
                  - generic [ref=e727]: TARGETS
                - generic [ref=e728]: + 32 more flows
            - generic [ref=e729]:
              - generic [ref=e730]: Encoding
              - generic [ref=e731]:
                - generic [ref=e734]: Worst (carmine halo + pulse)
                - generic [ref=e737]: High / elevated (ring only)
                - generic [ref=e738]:
                  - generic [ref=e739]: ♛
                  - generic [ref=e740]: Crown-jewel halo
                - generic [ref=e743]: Clean · remediated (teal ring)
                - generic [ref=e746]: Stale (dimmed)
                - generic [ref=e749]: Coverage gap (not collected)
        - img:
          - generic:
            - generic:
              - generic: MEMBER_OF_CLUSTER
          - generic:
            - generic:
              - generic: MEMBER_OF_CLUSTER
          - generic:
            - generic:
              - generic: MEMBER_OF_CLUSTER
          - generic:
            - generic:
              - generic: 2 flows
          - generic:
            - generic:
              - generic: 2 flows
          - generic:
            - generic:
              - generic: 2 flows
          - generic:
            - generic:
              - generic: 2 flows
          - generic:
            - generic:
              - generic: TG
          - generic:
            - generic:
              - generic: TG
          - generic:
            - generic:
              - generic: KMS
          - generic:
            - generic:
              - generic: KMS
          - generic:
            - generic:
              - generic: KMS
          - generic:
            - generic:
              - generic: Egress · 9 flows
          - generic:
            - generic:
              - generic: TARGETS ×6
          - generic:
            - generic:
              - generic: KMS ×3
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
    - complementary [ref=e751]:
      - generic [ref=e752]:
        - generic [ref=e753]:
          - heading "Service index" [level=2] [ref=e754]
          - generic [ref=e755]: "35"
        - generic [ref=e756]:
          - img [ref=e757]
          - searchbox "Find service in topology" [ref=e760]
        - button "Filters" [ref=e763]:
          - img [ref=e764]
          - text: Filters
      - list [ref=e766]:
        - listitem [ref=e767]:
          - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e768]:
            - generic [ref=e769]:
              - img [ref=e771]
              - generic [ref=e773]:
                - generic [ref=e774]:
                  - generic [ref=e775]: cyntro-tb-prod-appdata-1c8276f5
                  - generic "Current graph data" [ref=e776]
                - generic [ref=e778]: S3 · global · regional
                - generic [ref=e779]:
                  - generic [ref=e780]: 4 in · 1 out
                  - generic [ref=e781]:
                    - img [ref=e782]
                    - text: Aug 20, 04:53 PM
        - listitem [ref=e785]:
          - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e786]:
            - generic [ref=e787]:
              - img [ref=e789]
              - generic [ref=e791]:
                - generic [ref=e792]:
                  - generic [ref=e793]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                  - generic "Current graph data" [ref=e794]
                - generic [ref=e796]: KMSKey · global · regional
                - generic [ref=e797]:
                  - generic [ref=e798]: 3 in · 0 out
                  - generic [ref=e799]:
                    - img [ref=e800]
                    - text: Sep 11, 07:35 PM
        - listitem [ref=e803]:
          - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e804]:
            - generic [ref=e805]:
              - img [ref=e807]
              - generic [ref=e809]:
                - generic [ref=e810]:
                  - generic [ref=e811]: cyntro-tb-prod-app
                  - generic "Current graph data" [ref=e812]
                - generic [ref=e814]: EC2 · eu-west-1b · app
                - generic [ref=e815]:
                  - generic [ref=e816]: 2 in · 1 out
                  - generic [ref=e817]:
                    - img [ref=e818]
                    - text: Aug 20, 04:58 PM
        - listitem [ref=e821]:
          - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e822]:
            - generic [ref=e823]:
              - img [ref=e825]
              - generic [ref=e827]:
                - generic [ref=e828]:
                  - generic [ref=e829]: cyntro-tb-prod-app
                  - generic "Current graph data" [ref=e830]
                - generic [ref=e832]: EC2 · eu-west-1a · app
                - generic [ref=e833]:
                  - generic [ref=e834]: 2 in · 1 out
                  - generic [ref=e835]:
                    - img [ref=e836]
                    - text: Aug 20, 04:58 PM
        - listitem [ref=e839]:
          - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e840]:
            - generic [ref=e841]:
              - img [ref=e843]
              - generic [ref=e845]:
                - generic [ref=e846]:
                  - generic [ref=e847]: cyntro-tb-prod-consumer-daily
                  - generic "Current graph data" [ref=e848]
                - generic [ref=e850]: Lambda · eu-west-1 · regional
                - generic [ref=e851]:
                  - generic [ref=e852]: 2 in · 1 out
                  - generic [ref=e853]:
                    - img [ref=e854]
                    - text: Aug 31, 11:00 AM
        - listitem [ref=e857]:
          - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e858]:
            - generic [ref=e859]:
              - img [ref=e861]
              - generic [ref=e863]:
                - generic [ref=e864]:
                  - generic [ref=e865]: cyntro-tb-prod-consumer-every_6h
                  - generic "Current graph data" [ref=e866]
                - generic [ref=e868]: Lambda · eu-west-1 · regional
                - generic [ref=e869]:
                  - generic [ref=e870]: 2 in · 1 out
                  - generic [ref=e871]:
                    - img [ref=e872]
                    - text: Aug 31, 11:00 AM
        - listitem [ref=e875]:
          - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e876]:
            - generic [ref=e877]:
              - img [ref=e879]
              - generic [ref=e881]:
                - generic [ref=e882]:
                  - generic [ref=e883]: cyntro-tb-prod-consumer-frequent
                  - generic "Current graph data" [ref=e884]
                - generic [ref=e886]: Lambda · eu-west-1 · regional
                - generic [ref=e887]:
                  - generic [ref=e888]: 2 in · 1 out
                  - generic [ref=e889]:
                    - img [ref=e890]
                    - text: Sep 1, 11:00 AM
        - listitem [ref=e893]:
          - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e894]:
            - generic [ref=e895]:
              - img [ref=e897]
              - generic [ref=e899]:
                - generic [ref=e900]:
                  - generic [ref=e901]: cyntro-tb-prod-consumer-nightly_burst
                  - generic "Current graph data" [ref=e902]
                - generic [ref=e904]: Lambda · eu-west-1 · regional
                - generic [ref=e905]:
                  - generic [ref=e906]: 2 in · 1 out
                  - generic [ref=e907]:
                    - img [ref=e908]
                    - text: Aug 31, 11:00 AM
        - listitem [ref=e911]:
          - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e912]:
            - generic [ref=e913]:
              - img [ref=e915]
              - generic [ref=e917]:
                - generic [ref=e918]:
                  - generic [ref=e919]: cyntro-tb-prod-tg-app
                  - generic "Current graph data" [ref=e920]
                - generic [ref=e922]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e923]:
                  - generic [ref=e924]: 1 in · 2 out
                  - generic [ref=e925]:
                    - img [ref=e926]
                    - text: Aug 20, 04:58 PM
        - listitem [ref=e929]:
          - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e930]:
            - generic [ref=e931]:
              - img [ref=e933]
              - generic [ref=e935]:
                - generic [ref=e936]:
                  - generic [ref=e937]: cyntro-tb-prod-tg-web
                  - generic "Current graph data" [ref=e938]
                - generic [ref=e940]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e941]:
                  - generic [ref=e942]: 1 in · 2 out
                  - generic [ref=e943]:
                    - img [ref=e944]
                    - text: Aug 20, 04:58 PM
        - listitem [ref=e947]:
          - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e948]:
            - generic [ref=e949]:
              - img [ref=e951]
              - generic [ref=e953]:
                - generic [ref=e954]:
                  - generic [ref=e955]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                  - generic "Current graph data" [ref=e956]
                - generic [ref=e958]: KMSKey · global · regional
                - generic [ref=e959]:
                  - generic [ref=e960]: 2 in · 0 out
                  - generic [ref=e961]:
                    - img [ref=e962]
                    - text: Sep 11, 07:35 PM
        - listitem [ref=e965]:
          - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e966]:
            - generic [ref=e967]:
              - img [ref=e969]
              - generic [ref=e971]:
                - generic [ref=e972]:
                  - generic [ref=e973]: cyntro-tb-prod-asg-app
                  - generic "Current graph data" [ref=e974]
                - generic [ref=e976]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e977]:
                  - generic [ref=e978]: 0 in · 2 out
                  - generic [ref=e979]:
                    - img [ref=e980]
                    - text: No runtime timestamp
        - listitem [ref=e983]:
          - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e984]:
            - generic [ref=e985]:
              - img [ref=e987]
              - generic [ref=e989]:
                - generic [ref=e990]:
                  - generic [ref=e991]: cyntro-tb-prod-asg-web
                  - generic "Current graph data" [ref=e992]
                - generic [ref=e994]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e995]:
                  - generic [ref=e996]: 0 in · 2 out
                  - generic [ref=e997]:
                    - img [ref=e998]
                    - text: No runtime timestamp
        - listitem [ref=e1001]:
          - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e1002]:
            - generic [ref=e1003]:
              - img [ref=e1005]
              - generic [ref=e1007]:
                - generic [ref=e1008]:
                  - generic [ref=e1009]: cyntro-tb-prod-aurora
                  - generic "Current graph data" [ref=e1010]
                - generic [ref=e1012]: RDS · eu-west-1 · regional
                - generic [ref=e1013]:
                  - generic [ref=e1014]: 2 in · 0 out
                  - generic [ref=e1015]:
                    - img [ref=e1016]
                    - text: Sep 11, 07:35 PM
        - listitem [ref=e1019]:
          - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e1020]:
            - generic [ref=e1021]:
              - img [ref=e1023]
              - generic [ref=e1025]:
                - generic [ref=e1026]:
                  - generic [ref=e1027]: cyntro-tb-prod-aurora-0
                  - generic "Current graph data" [ref=e1028]
                - generic [ref=e1030]: RDS · eu-west-1b · data
                - generic [ref=e1031]:
                  - generic [ref=e1032]: 0 in · 2 out
                  - generic [ref=e1033]:
                    - img [ref=e1034]
                    - text: Sep 11, 07:35 PM
        - listitem [ref=e1037]:
          - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e1038]:
            - generic [ref=e1039]:
              - img [ref=e1041]
              - generic [ref=e1043]:
                - generic [ref=e1044]:
                  - generic [ref=e1045]: cyntro-tb-prod-aurora-1
                  - generic "Current graph data" [ref=e1046]
                - generic [ref=e1048]: RDS · eu-west-1a · data
                - generic [ref=e1049]:
                  - generic [ref=e1050]: 0 in · 2 out
                  - generic [ref=e1051]:
                    - img [ref=e1052]
                    - text: Sep 11, 07:35 PM
        - listitem [ref=e1055]:
          - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e1056]:
            - generic [ref=e1057]:
              - img [ref=e1059]
              - generic [ref=e1061]:
                - generic [ref=e1062]:
                  - generic [ref=e1063]: cyntro-tb-prod-consumer-daily
                  - generic "Current graph data" [ref=e1064]
                - generic [ref=e1066]: EventBridge · eu-west-1 · regional
                - generic [ref=e1067]:
                  - generic [ref=e1068]: 0 in · 2 out
                  - generic [ref=e1069]:
                    - img [ref=e1070]
                    - text: Aug 31, 11:00 AM
        - listitem [ref=e1073]:
          - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e1074]:
            - generic [ref=e1075]:
              - img [ref=e1077]
              - generic [ref=e1079]:
                - generic [ref=e1080]:
                  - generic [ref=e1081]: cyntro-tb-prod-consumer-every_6h
                  - generic "Current graph data" [ref=e1082]
                - generic [ref=e1084]: EventBridge · eu-west-1 · regional
                - generic [ref=e1085]:
                  - generic [ref=e1086]: 0 in · 2 out
                  - generic [ref=e1087]:
                    - img [ref=e1088]
                    - text: Aug 31, 11:00 AM
        - listitem [ref=e1091]:
          - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e1092]:
            - generic [ref=e1093]:
              - img [ref=e1095]
              - generic [ref=e1097]:
                - generic [ref=e1098]:
                  - generic [ref=e1099]: cyntro-tb-prod-consumer-frequent
                  - generic "Current graph data" [ref=e1100]
                - generic [ref=e1102]: EventBridge · eu-west-1 · regional
                - generic [ref=e1103]:
                  - generic [ref=e1104]: 0 in · 2 out
                  - generic [ref=e1105]:
                    - img [ref=e1106]
                    - text: Sep 1, 11:00 AM
        - listitem [ref=e1109]:
          - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e1110]:
            - generic [ref=e1111]:
              - img [ref=e1113]
              - generic [ref=e1115]:
                - generic [ref=e1116]:
                  - generic [ref=e1117]: cyntro-tb-prod-consumer-monthly
                  - generic "Current graph data" [ref=e1118]
                - generic [ref=e1120]: Lambda · eu-west-1 · regional
                - generic [ref=e1121]:
                  - generic [ref=e1122]: 2 in · 0 out
                  - generic [ref=e1123]:
                    - img [ref=e1124]
                    - text: No runtime timestamp
        - listitem [ref=e1127]:
          - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1128]:
            - generic [ref=e1129]:
              - img [ref=e1131]
              - generic [ref=e1133]:
                - generic [ref=e1134]:
                  - generic [ref=e1135]: cyntro-tb-prod-consumer-monthly
                  - generic "Current graph data" [ref=e1136]
                - generic [ref=e1138]: EventBridge · eu-west-1 · regional
                - generic [ref=e1139]:
                  - generic [ref=e1140]: 0 in · 2 out
                  - generic [ref=e1141]:
                    - img [ref=e1142]
                    - text: No runtime timestamp
        - listitem [ref=e1145]:
          - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e1146]:
            - generic [ref=e1147]:
              - img [ref=e1149]
              - generic [ref=e1151]:
                - generic [ref=e1152]:
                  - generic [ref=e1153]: cyntro-tb-prod-consumer-nightly_burst
                  - generic "Current graph data" [ref=e1154]
                - generic [ref=e1156]: EventBridge · eu-west-1 · regional
                - generic [ref=e1157]:
                  - generic [ref=e1158]: 0 in · 2 out
                  - generic [ref=e1159]:
                    - img [ref=e1160]
                    - text: Aug 31, 11:00 AM
        - listitem [ref=e1163]:
          - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e1164]:
            - generic [ref=e1165]:
              - img [ref=e1167]
              - generic [ref=e1169]:
                - generic [ref=e1170]:
                  - generic [ref=e1171]: cyntro-tb-prod-consumer-weekly
                  - generic "Current graph data" [ref=e1172]
                - generic [ref=e1174]: Lambda · eu-west-1 · regional
                - generic [ref=e1175]:
                  - generic [ref=e1176]: 2 in · 0 out
                  - generic [ref=e1177]:
                    - img [ref=e1178]
                    - text: Aug 29, 11:00 AM
        - listitem [ref=e1181]:
          - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e1182]:
            - generic [ref=e1183]:
              - img [ref=e1185]
              - generic [ref=e1187]:
                - generic [ref=e1188]:
                  - generic [ref=e1189]: cyntro-tb-prod-consumer-weekly
                  - generic "Current graph data" [ref=e1190]
                - generic [ref=e1192]: EventBridge · eu-west-1 · regional
                - generic [ref=e1193]:
                  - generic [ref=e1194]: 0 in · 2 out
                  - generic [ref=e1195]:
                    - img [ref=e1196]
                    - text: Aug 29, 11:00 AM
        - listitem [ref=e1199]:
          - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1200]:
            - generic [ref=e1201]:
              - img [ref=e1203]
              - generic [ref=e1205]:
                - generic [ref=e1206]:
                  - generic [ref=e1207]: cyntro-tb-prod-web
                  - generic "Current graph data" [ref=e1208]
                - generic [ref=e1210]: EC2 · eu-west-1a · web
                - generic [ref=e1211]:
                  - generic [ref=e1212]: 2 in · 0 out
                  - generic [ref=e1213]:
                    - img [ref=e1214]
                    - text: Aug 20, 04:58 PM
        - listitem [ref=e1217]:
          - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1218]:
            - generic [ref=e1219]:
              - img [ref=e1221]
              - generic [ref=e1223]:
                - generic [ref=e1224]:
                  - generic [ref=e1225]: cyntro-tb-prod-web
                  - generic "Current graph data" [ref=e1226]
                - generic [ref=e1228]: EC2 · eu-west-1b · web
                - generic [ref=e1229]:
                  - generic [ref=e1230]: 2 in · 0 out
                  - generic [ref=e1231]:
                    - img [ref=e1232]
                    - text: Aug 20, 04:58 PM
        - listitem [ref=e1235]:
          - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 2 out Sep 11, 07:35 PM" [ref=e1236]:
            - generic [ref=e1237]:
              - img [ref=e1239]
              - generic [ref=e1241]:
                - generic [ref=e1242]:
                  - generic [ref=e1243]: cyntro-testbed-webshop-writer
                  - generic "Current graph data" [ref=e1244]
                - generic [ref=e1246]: Neptune · eu-west-1a · web
                - generic [ref=e1247]:
                  - generic [ref=e1248]: 0 in · 2 out
                  - generic [ref=e1249]:
                    - img [ref=e1250]
                    - text: Sep 11, 07:35 PM
        - listitem [ref=e1253]:
          - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e1254]:
            - generic [ref=e1255]:
              - img [ref=e1257]
              - generic [ref=e1259]:
                - generic [ref=e1260]:
                  - generic [ref=e1261]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                  - generic "Current graph data" [ref=e1262]
                - generic [ref=e1264]: KMSKey · global · regional
                - generic [ref=e1265]:
                  - generic [ref=e1266]: 1 in · 0 out
                  - generic [ref=e1267]:
                    - img [ref=e1268]
                    - text: No runtime timestamp
        - listitem [ref=e1271]:
          - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e1272]:
            - generic [ref=e1273]:
              - img [ref=e1275]
              - generic [ref=e1277]:
                - generic [ref=e1278]:
                  - generic [ref=e1279]: cyntro-evidence-testbed-webshop-950952
                  - generic "Current graph data" [ref=e1280]
                - generic [ref=e1282]: S3 · global · regional
                - generic [ref=e1283]:
                  - generic [ref=e1284]: 0 in · 1 out
                  - generic [ref=e1285]:
                    - img [ref=e1286]
                    - text: No runtime timestamp
        - listitem [ref=e1289]:
          - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e1290]:
            - generic [ref=e1291]:
              - img [ref=e1293]
              - generic [ref=e1295]:
                - generic [ref=e1296]:
                  - generic [ref=e1297]: cyntro-ingest-head-testbed-webshop
                  - generic "Current graph data" [ref=e1298]
                - generic [ref=e1300]: DynamoDB · eu-west-1 · regional
                - generic [ref=e1301]:
                  - generic [ref=e1302]: 0 in · 1 out
                  - generic [ref=e1303]:
                    - img [ref=e1304]
                    - text: No runtime timestamp
        - listitem [ref=e1307]:
          - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e1308]:
            - generic [ref=e1309]:
              - img [ref=e1311]
              - generic [ref=e1313]:
                - generic [ref=e1314]:
                  - generic [ref=e1315]: cyntro-tb-prod-alb-int
                  - generic "Current graph data" [ref=e1316]
                - generic [ref=e1318]: LoadBalancer · eu-west-1a · app
                - generic [ref=e1319]:
                  - generic [ref=e1320]: 0 in · 1 out
                  - generic [ref=e1321]:
                    - img [ref=e1322]
                    - text: No runtime timestamp
        - listitem [ref=e1325]:
          - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1b · web 0 in · 1 out No runtime timestamp" [ref=e1326]:
            - generic [ref=e1327]:
              - img [ref=e1329]
              - generic [ref=e1331]:
                - generic [ref=e1332]:
                  - generic [ref=e1333]: cyntro-tb-prod-alb-pub
                  - generic "Current graph data" [ref=e1334]
                - generic [ref=e1336]: LoadBalancer · eu-west-1b · web
                - generic [ref=e1337]:
                  - generic [ref=e1338]: 0 in · 1 out
                  - generic [ref=e1339]:
                    - img [ref=e1340]
                    - text: No runtime timestamp
        - listitem [ref=e1343]:
          - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e1344]:
            - generic [ref=e1345]:
              - img [ref=e1347]
              - generic [ref=e1349]:
                - generic [ref=e1350]:
                  - generic [ref=e1351]: cyntro-tb-prod-loadgen
                  - generic "Current graph data" [ref=e1352]
                - generic [ref=e1354]: EC2 · eu-west-1a · app
                - generic [ref=e1355]:
                  - generic [ref=e1356]: 0 in · 1 out
                  - generic [ref=e1357]:
                    - img [ref=e1358]
                    - text: Aug 18, 06:57 PM
        - listitem [ref=e1361]:
          - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 1 in · 0 out Sep 11, 07:35 PM" [ref=e1362]:
            - generic [ref=e1363]:
              - img [ref=e1365]
              - generic [ref=e1367]:
                - generic [ref=e1368]:
                  - generic [ref=e1369]: cyntro-testbed-webshop
                  - generic "Current graph data" [ref=e1370]
                - generic [ref=e1372]: Neptune · eu-west-1 · regional
                - generic [ref=e1373]:
                  - generic [ref=e1374]: 1 in · 0 out
                  - generic [ref=e1375]:
                    - img [ref=e1376]
                    - text: Sep 11, 07:35 PM
        - listitem [ref=e1379]:
          - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e1380]:
            - generic [ref=e1381]:
              - img [ref=e1383]
              - generic [ref=e1386]:
                - generic [ref=e1387]:
                  - generic [ref=e1388]: cyntro-tb-prod-logs-1c8276f5
                  - generic "Current graph data" [ref=e1389]
                - generic [ref=e1391]: S3 · global · regional
                - generic [ref=e1392]:
                  - generic [ref=e1393]: 0 in · 0 out
                  - generic [ref=e1394]:
                    - img [ref=e1395]
                    - text: No runtime timestamp
    - contentinfo [ref=e1398]:
      - text: Live read from
      - generic [ref=e1399]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1400]
```

# Test source

```ts
  2013 | 
  2014 |         if (observedEgress.length > 0) {
  2015 |           expect(laneVisible, `${density}·${vp.name}: payload has ${observedEgress.length} observed egress legs and no lane is drawn`).toBe(true)
  2016 |           await lane.scrollIntoViewIfNeeded()
  2017 |           if (gateways.length > 0) {
  2018 |             expect(gateways, `${density}·${vp.name}: the lane names a gateway the payload does not`).toContain(
  2019 |               await lane.getAttribute("data-gateway-id"),
  2020 |             )
  2021 |           }
  2022 | 
  2023 |           // The continuation, and how it was DRAWN.
  2024 |           const geo = (await page.evaluate(LIVE_CONTINUATION)) as ContinuationProbe
  2025 |           report(`release-continuation-${density}-${vp.name}`, {
  2026 |             paths: geo.paths.length,
  2027 |             destinations: geo.destinations.length,
  2028 |             treatments: geo.paths.map(p => ({ authority: p.authority, pathBasis: p.pathBasis, motion: p.motion, dash: p.dash, animations: p.animations })),
  2029 |           })
  2030 |           expect(geo.paths.length, `${density}·${vp.name}: no IGW → destination path is drawn`).toBeGreaterThan(0)
  2031 |           // Narrowed, not asserted: the probe returns null for igwRect when the
  2032 |           // gateway chip is absent, and a non-null assertion there would turn a
  2033 |           // missing IGW into a confusing geometry failure instead of this one.
  2034 |           expect(geo.igwRect, `${density}·${vp.name}: the in-map IGW chip has no rect to leave from`).not.toBeNull()
  2035 |           const igwRect = geo.igwRect as ProbeRect
  2036 |           const byId = new Map<string, ProbeRect>(geo.destinations.map(d => [d.flowId, d.rect]))
  2037 |           const landed = geo.paths.filter(p => {
  2038 |             const dst = byId.get(p.target); if (!dst) return false
  2039 |             return (near(p.start, igwRect) && near(p.end, dst)) || (near(p.end, igwRect) && near(p.start, dst))
  2040 |           })
  2041 |           expect(landed.length, `${density}·${vp.name}: a continuation path lands on neither chip`).toBeGreaterThan(0)
  2042 |           // Dashed, static, never live.
  2043 |           for (const p of geo.paths) {
  2044 |             expect(p.authority, `${density}·${vp.name}: continuation not marked inferred`).toBe("inferred")
  2045 |             expect(p.pathBasis, `${density}·${vp.name}: continuation not marked synthetic`).toBe("synthetic_expansion")
  2046 |             expect(p.motion, `${density}·${vp.name}: continuation qualified for traffic motion`).toBe("none")
  2047 |             expect(p.dash, `${density}·${vp.name}: continuation drawn SOLID — reads as a measured path`).not.toBeNull()
  2048 |             expect(p.animations, `${density}·${vp.name}: continuation animated as live traffic`).toBe(0)
  2049 |           }
  2050 | 
  2051 |           // The Data tier stays clear of the lane.
  2052 |           const laneBox = await lane.boundingBox()
  2053 |           const cells = page.locator('[data-tier="data"]')
  2054 |           for (let i = 0; i < (await cells.count()); i++) {
  2055 |             const c = await cells.nth(i).boundingBox()
  2056 |             if (!c || !laneBox) continue
  2057 |             const w = Math.min(laneBox.x + laneBox.width, c.x + c.width) - Math.max(laneBox.x, c.x)
  2058 |             const h = Math.min(laneBox.y + laneBox.height, c.y + c.height) - Math.max(laneBox.y, c.y)
  2059 |             expect(w > 0 && h > 0 ? Math.round(w * h) : 0, `${density}·${vp.name}: lane overlaps data-tier cell ${i}`).toBe(0)
  2060 |           }
  2061 | 
  2062 |           // "+N more" must HOLD what it offers.
  2063 |           const hidden = Number(await lane.getAttribute("data-hidden-count"))
  2064 |           if (hidden > 0) {
  2065 |             const more = page.getByTestId("topology-external-destinations-more")
  2066 |             await more.click()
  2067 |             const panel = page.getByTestId("topology-external-destinations-more-details")
  2068 |             await expect(panel).toBeVisible()
  2069 |             await page.waitForTimeout(400)
  2070 |             const items = panel.getByTestId("topology-external-destinations-more-item")
  2071 |             const listed = await items.count()
  2072 |             const stack = (await page.evaluate(TOPMOST("topology-external-destinations-more-details"))) as any
  2073 |             report(`release-more-${density}-${vp.name}`, { hidden, listed, stack })
  2074 |             expect(listed, `${density}·${vp.name}: +${hidden} disclosure lists ${listed}`).toBe(hidden)
  2075 |             expect(stack.covered, `${density}·${vp.name}: the +N panel is painted under the map`).toEqual([])
  2076 |             expect(stack.inViewport, `${density}·${vp.name}: the +N panel is outside the viewport`).toBe(true)
  2077 |             await expect(panel).toContainText("not an inventory")
  2078 |             await shot(page, `c1-release-more-${density}-${vp.name}`)
  2079 |             await page.keyboard.press("Escape")
  2080 |           }
  2081 |         }
  2082 |         await shot(page, `c1-release-${density}-${vp.name}`)
  2083 |       }
  2084 | 
  2085 |       // --- collapsed-by-default diagnostics + trigger labels ---------------
  2086 |       const coverage = page.getByTestId("topology-lane-coverage").first()
  2087 |       const band = page.getByTestId("topology-logical-group-band").first()
  2088 |       const diagnostics = {
  2089 |         coverage_present: await coverage.count(),
  2090 |         coverage_details_open: (await coverage.count()) ? await coverage.getAttribute("data-details-open") : null,
  2091 |         band_present: await band.count(),
  2092 |         band_open: (await band.count()) ? await band.getAttribute("data-groups-open") : null,
  2093 |       }
  2094 |       report(`release-diagnostics-${vp.name}`, diagnostics)
  2095 |       if (diagnostics.coverage_present) expect(diagnostics.coverage_details_open, "coverage details open by default").toBe("false")
  2096 |       if (diagnostics.band_present) expect(diagnostics.band_open, "logical groups open by default").toBe("false")
  2097 | 
  2098 |       const bundles = await page.locator('[data-testid="topology-flow-badge"]').evaluateAll(els =>
  2099 |         els.map(e => ({
  2100 |           text: (e.textContent ?? "").replace(/\s+/g, " ").trim(),
  2101 |           spellings: e.getAttribute("data-bundle-spellings"),
  2102 |           pairs: e.getAttribute("data-bundle-pairs"),
  2103 |           edges: e.getAttribute("data-bundle-edges"),
  2104 |         })).filter(b => b.spellings),
  2105 |       )
  2106 |       report(`release-trigger-labels-${vp.name}`, bundles)
  2107 |       for (const b of bundles) {
  2108 |         const spellings = (b.spellings ?? "").split(",").filter(Boolean)
  2109 |         if (spellings.length > 1) {
  2110 |           // A mirrored relationship is ONE badge counting unique pairs, not one
  2111 |           // badge per spelling counting edge rows.
  2112 |           expect(Number(b.pairs), `a collapsed bundle counts edge rows, not pairs: ${b.text}`).toBeLessThanOrEqual(Number(b.edges))
> 2113 |           expect(b.text.split("×").length, `a collapsed bundle drew more than one count: ${b.text}`).toBeLessThanOrEqual(2)
       |                                                                                                      ^ Error: a collapsed bundle drew more than one count: TARGETS ×6 Same 6 connections, also recorded as TRIGGERS 12 edge rows in the graph for 6 connections arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-every_6h→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-every_6h arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-frequent→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-frequent arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-daily→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-daily arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-monthly→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-monthly arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-weekly→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-weekly arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-nightly_burst→arn:aws:lambda:eu-west-1:416651950952:function:cyntro-tb-prod-consumer-nightly_burstTARGETS ×6
  2114 |         }
  2115 |       }
  2116 | 
  2117 |       // --- fullscreen, both densities --------------------------------------
  2118 |       await page.getByTestId("topology-estate-map-enlarge").click()
  2119 |       const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  2120 |       await expect(fullscreen).toBeVisible()
  2121 |       await page.waitForTimeout(1500)
  2122 |       for (const density of ["glance", "inventory"] as const) {
  2123 |         const fsToggle = fullscreen.getByTestId(`topology-estate-density-fs-${density}`)
  2124 |         if (await fsToggle.count()) { await fsToggle.click(); await page.waitForTimeout(1200) }
  2125 |         const fsLane = fullscreen.getByTestId("topology-external-destinations-lane")
  2126 |         const fsVisible = await fsLane.isVisible().catch(() => false)
  2127 |         report(`release-fullscreen-${density}-${vp.name}`, { lane_visible: fsVisible })
  2128 |         if (fsVisible && observedEgress.length > 0) {
  2129 |           const ext = fullscreen.getByTestId("topology-external-destinations").first()
  2130 |           if (await ext.count()) {
  2131 |             await ext.getByTestId("topology-external-destinations-toggle").click()
  2132 |             const detail = page.getByTestId("topology-external-destinations-details")
  2133 |             await expect(detail).toBeVisible()
  2134 |             await page.waitForTimeout(400)
  2135 |             const stack = (await page.evaluate(TOPMOST("topology-external-destinations-details"))) as any
  2136 |             report(`release-fs-panel-${density}-${vp.name}`, stack)
  2137 |             expect(stack.covered, `${density}·${vp.name}: the detail panel is painted under the fullscreen map`).toEqual([])
  2138 |             await shot(page, `c1-release-fs-${density}-${vp.name}`)
  2139 |             await page.keyboard.press("Escape")
  2140 |           }
  2141 |         } else {
  2142 |           await shot(page, `c1-release-fs-${density}-${vp.name}`)
  2143 |         }
  2144 |       }
  2145 | 
  2146 |       report(`release-console-${vp.name}`, { consoleErrors, failedRequests, pageErrors })
  2147 |       expect(pageErrors, `${vp.name}: uncaught page errors`).toEqual([])
  2148 |       expect(failedRequests, `${vp.name}: failed network requests`).toEqual([])
  2149 |     })
  2150 |   }
  2151 | })
  2152 | 
```